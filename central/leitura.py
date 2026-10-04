"""Leitura dos arquivos exportados do SAP e de planilhas, em qualquer formato
usual: .xlsx, .xls (inclusive o "xls" que na verdade é texto/HTML do SAP GUI),
.csv, .txt (lista com |), .htm/.html ("salvar como HTML" do SAP) e .parquet.

Também reconhece sozinho de qual base é o arquivo (IW38, MB52 ou requisições)
pelos cabeçalhos — não depende do nome do arquivo.
"""

from __future__ import annotations

import io
import re
from pathlib import PurePath

import pandas as pd

from .util import chave

EXTENSOES = (".xlsx", ".xlsm", ".xls", ".csv", ".txt", ".htm", ".html", ".parquet")

IW38, MB52, REQ = "iw38", "mb52", "requisicoes"
NOMES_BASE = {IW38: "Ordens (IW38)", MB52: "Estoque (MB52)", REQ: "Requisições de compra"}


class LeituraErro(ValueError):
    pass


# ----------------------------------------------------------------------------
# Texto
# ----------------------------------------------------------------------------
def _decodificar(conteudo: bytes) -> str:
    for enc in ("utf-8-sig", "cp1252", "latin-1"):
        try:
            return conteudo.decode(enc)
        except UnicodeDecodeError:
            continue
    return conteudo.decode("latin-1", errors="replace")


def _ler_texto(txt: str) -> pd.DataFrame:
    linhas = [l for l in txt.splitlines() if l.strip()]
    if not linhas:
        raise LeituraErro("arquivo vazio")
    amostra = "\n".join(linhas[:50])

    # Lista do SAP "não convertida": | col | col | e linhas de ------
    if amostra.count("|") > len(linhas[:50]) * 2:
        uteis = [l for l in linhas if "|" in l and not re.fullmatch(r"[\s|\-]+", l)]
        tabela = [[c.strip() for c in l.strip().strip("|").split("|")] for l in uteis]
        return _tabela_com_cabecalho(tabela)

    sep = max([";", "\t", ","], key=amostra.count)
    df = pd.read_csv(io.StringIO("\n".join(linhas)), sep=sep, dtype=str, keep_default_na=False)
    return df


def _tabela_com_cabecalho(tabela: list[list[str]]) -> pd.DataFrame:
    """Primeira linha com 3+ células preenchidas vira cabeçalho; repetições do cabeçalho
    (o SAP repete a cada página) são descartadas."""
    idx = next((i for i, l in enumerate(tabela) if sum(1 for c in l if c) >= 3), None)
    if idx is None:
        raise LeituraErro("não encontrei uma linha de cabeçalho")
    cab = [c or f"col{i}" for i, c in enumerate(tabela[idx])]
    # nomes repetidos ganham sufixo
    vistos: dict[str, int] = {}
    for i, c in enumerate(cab):
        if c in vistos:
            vistos[c] += 1
            cab[i] = f"{c} ({vistos[c]})"
        else:
            vistos[c] = 0
    linhas = []
    for l in tabela[idx + 1:]:
        if l[: len(cab)] == tabela[idx][: len(cab)] or not any(l):
            continue
        l = (l + [""] * len(cab))[: len(cab)]
        linhas.append(l)
    return pd.DataFrame(linhas, columns=cab)


# ----------------------------------------------------------------------------
# HTML do SAP GUI
# ----------------------------------------------------------------------------
def _ler_html(txt: str) -> pd.DataFrame:
    from lxml import html as lhtml

    doc = lhtml.fromstring(txt)
    tabelas = doc.xpath("//table")
    if not tabelas:
        raise LeituraErro("nenhuma tabela no HTML")
    principal = max(tabelas, key=lambda t: len(t.xpath(".//tr")))
    linhas = [
        [re.sub(r"\s+", " ", (td.text_content() or "").replace("\xa0", " ")).strip() for td in tr.xpath("./th|./td")]
        for tr in principal.xpath(".//tr")
    ]
    largura = max((len(l) for l in linhas), default=0)
    if largura >= 3:
        return _tabela_com_cabecalho(linhas)
    # Lista agrupada (MB52 em árvore): cada linha é um texto de largura fixa.
    brutas = [tr.text_content().replace("\xa0", " ") for tr in principal.xpath(".//tr")]
    return _lista_agrupada_mb52(brutas)


def _tokens(linha: str) -> list[str]:
    return [t for t in re.split(r"\s{2,}", linha.strip()) if t]


def _num_br(t: str):
    try:
        return float(t.strip().replace(".", "").replace(",", "."))
    except ValueError:
        return None


def _lista_agrupada_mb52(linhas: list[str]) -> pd.DataFrame:
    """Uma linha que começa com número abre um material; as seguintes (UM + quantidade
    [+ depósito]) são somadas no total desse material."""
    grupos, atual = [], None
    for linha in linhas:
        toks = _tokens(linha)
        if not toks:
            continue
        if re.match(r"^\d", toks[0]) and "total" not in linha.lower():
            atual = {"Material": toks[0], "Texto breve material": " ".join(toks[1:]), "UM": "", "Utilização livre": 0.0}
            grupos.append(atual)
        elif atual is not None and len(toks) >= 2:
            ultimo = toks[-1]
            tem_dep = len(toks) >= 3 and not re.fullmatch(r"[\d.,]+", ultimo)
            q = _num_br(toks[-2] if tem_dep else ultimo)
            if q is None:
                continue
            atual["Utilização livre"] += q
            if not atual["UM"] and re.fullmatch(r"[A-Za-zÀ-ÿ]{1,3}\d?", toks[0]):
                atual["UM"] = toks[0]
    if not grupos:
        raise LeituraErro("lista do SAP sem materiais reconhecíveis")
    return pd.DataFrame(grupos)


# ----------------------------------------------------------------------------
# Entrada principal
# ----------------------------------------------------------------------------
def _eh_xlsx(conteudo: bytes) -> bool:
    return conteudo[:4] == b"PK\x03\x04"


def _eh_xls(conteudo: bytes) -> bool:
    return conteudo[:4] == b"\xd0\xcf\x11\xe0"


def ler_arquivo(nome: str, conteudo: bytes, planilha: str | None = None, linha_cab: int | None = None) -> pd.DataFrame:
    """Lê o arquivo inteiro. Para Excel, `planilha` e `linha_cab` (0 = primeira linha)
    vêm de `sondar`; sem eles usa a primeira aba e a primeira linha."""
    ext = PurePath(nome).suffix.lower()
    inicio = conteudo[:2048].lstrip().lower()
    try:
        if ext == ".parquet":
            df = pd.read_parquet(io.BytesIO(conteudo))
        elif _eh_xlsx(conteudo) or _eh_xls(conteudo):
            df = pd.read_excel(io.BytesIO(conteudo), engine="openpyxl" if _eh_xlsx(conteudo) else "xlrd",
                               sheet_name=planilha or 0, header=linha_cab or 0, dtype=object)
        elif b"<table" in conteudo[:200_000].lower() or inicio.startswith((b"<!doctype", b"<html")):
            df = _ler_html(_decodificar(conteudo))
        else:
            df = _ler_texto(_decodificar(conteudo))
    except LeituraErro:
        raise
    except Exception as e:  # noqa: BLE001 — qualquer falha de parser vira mensagem amigável
        raise LeituraErro(f"não foi possível ler {nome}: {e}") from e

    df.columns = [str(c).strip() for c in df.columns]
    df = df.loc[:, [c for c in df.columns if c and not c.lower().startswith("unnamed")]]
    df = df.dropna(how="all")
    if df.empty:
        raise LeituraErro(f"{nome} não tem linhas de dados")
    return df.reset_index(drop=True)


def sondar(nome: str, conteudo: bytes) -> list[tuple[str, str | None, int | None]]:
    """Descobre quais bases existem no arquivo, sem ler tudo quando é Excel:
    devolve [(tipo, aba, linha do cabeçalho)]. Uma pasta de trabalho pode ter
    mais de uma base (ex.: uma aba IW38 e outra MB52)."""
    achados = []
    if _eh_xlsx(conteudo) or _eh_xls(conteudo):
        try:
            if _eh_xlsx(conteudo):
                from openpyxl import load_workbook

                wb = load_workbook(io.BytesIO(conteudo), read_only=True, data_only=True)
                abas = [(ws.title, list(ws.iter_rows(max_row=15, values_only=True))) for ws in wb.worksheets]
                wb.close()
            else:
                folhas = pd.read_excel(io.BytesIO(conteudo), engine="xlrd", sheet_name=None, header=None, nrows=15)
                abas = [(t, f.values.tolist()) for t, f in folhas.items()]
        except Exception:  # noqa: BLE001
            return []
        for titulo, linhas in abas:
            for i, linha in enumerate(linhas):
                tipo = identificar([str(c) for c in linha if c is not None and str(c).strip()])
                if tipo:
                    achados.append((tipo, titulo, i))
                    break
        return achados
    try:
        tipo = identificar(ler_arquivo(nome, conteudo).columns)
    except LeituraErro:
        return []
    return [(tipo, None, None)] if tipo else []


def identificar(colunas) -> str | None:
    ks = {chave(c) for c in colunas}

    def tem(rx):
        return any(re.search(rx, k) for k in ks)

    if tem(r"^ORDEM$") and (tem(r"STATUS USUARIO") or tem(r"STATUS DO SISTEMA") or tem(r"TIPO DE ORDEM")):
        return IW38
    if (tem(r"N(UMERO)? DA REQ") or tem(r"REQUISI")) and tem(r"^TOTAL$"):
        return REQ
    if tem(r"^MATERIAL$|^CODIGO") and tem(r"UTILIZACAO LIVRE|UTILIZ LIVRE|LIVRE UTILIZ|ESTOQUE|SALDO"):
        return MB52
    return None
