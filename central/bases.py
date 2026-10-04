"""Carrega as bases mais recentes da fonte e as deixa prontas para uso
(colunas padronizadas, datas e valores convertidos, campos calculados).

Tudo é cacheado pela "assinatura" do arquivo (nome + data de modificação +
tamanho): enquanto o arquivo não muda, ninguém relê; quando chega um arquivo
novo, a próxima execução já usa ele — sem botão de importar, sem recarregar.
"""

from __future__ import annotations

import json
import re
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import PurePath

import numpy as np
import pandas as pd
import streamlit as st

from . import config, fontes, leitura
from .leitura import IP19, IW38, MB52, REQ, TIPOS
from .util import achar_coluna, chave, para_data, para_numero, sem_acento, texto

ARQ_CAD_EQUIP = "cadastro_equipamentos.json"
ARQ_CAD_MAT = "cadastro_materiais.json"
ARQ_PREF = "preferencias.json"

# Pista pelo nome do arquivo: arquivos com pista são verificados primeiro.
_PISTAS = [(IP19, r"IP19|IP24|PLANOS?\b"), (IW38, r"IW38|IW39|ORDENS?"), (MB52, r"MB52|MB51|ESTOQUE|MATERIA"),
           (REQ, r"REQUISI|REQ\b|APROVA|COMPRAS")]


# ----------------------------------------------------------------------------
# Fonte e inventário de arquivos
# ----------------------------------------------------------------------------
@st.cache_resource(show_spinner=False)
def _fonte_cacheada(chave_cfg: str):
    return fontes.criar(config.carregar())


def fonte():
    return _fonte_cacheada(config.carregar().chave)


@st.cache_data(show_spinner=False, max_entries=4)
def _listar(chave_cfg: str, janela: int) -> list[fontes.Arquivo]:  # janela = chave de tempo do cache
    return sorted(fonte().listar(), key=lambda a: a.modificado, reverse=True)


def arquivos() -> list[fontes.Arquivo]:
    """Lista da fonte, compartilhada por todos os usuários. Pastas locais são relidas a
    cada 15 s; o SharePoint, uma vez por intervalo de verificação (poupa a API)."""
    cfg = config.carregar()
    passo = cfg.intervalo_verificacao if cfg.fonte == "sharepoint" else 15
    return _listar(cfg.chave, int(time.time() // passo))


@st.cache_data(show_spinner=False, max_entries=24)
def _bytes(id: str, assinatura: str) -> bytes:
    return fonte().ler(id)


@st.cache_data(show_spinner=False, max_entries=12)
def _ler_cru(id: str, assinatura: str, planilha: str | None, linha: int | None) -> pd.DataFrame:
    return leitura.ler_arquivo(id, _bytes(id, assinatura), planilha, linha)


@st.cache_data(show_spinner=False, max_entries=2048)
def _sondar(id: str, assinatura: str) -> list[tuple[str, str | None, int | None]]:
    try:
        return leitura.sondar(id, fonte().ler(id))
    except Exception:  # noqa: BLE001 — arquivo bloqueado/corrompido: só não entra
        return []


@dataclass(frozen=True)
class Origem:
    arquivo: fontes.Arquivo
    tipo: str
    planilha: str | None
    linha: int | None

    @property
    def rotulo(self) -> str:
        return self.arquivo.nome + (f" › aba {self.planilha}" if self.planilha else "")


@dataclass
class Inventario:
    ativos: dict[str, Origem] = field(default_factory=dict)       # tipo -> origem em uso
    candidatos: dict[str, list[Origem]] = field(default_factory=dict)  # tipo -> todas encontradas
    fixados: dict[str, str] = field(default_factory=dict)          # tipo -> id fixado pelo usuário
    verificados: int = 0
    erro: str = ""


def _pista(arq: fontes.Arquivo) -> str | None:
    base = chave(PurePath(arq.arquivo).stem)
    return next((t for t, rx in _PISTAS if re.search(rx, base)), None)


_INV_MEMO: dict[str, Inventario] = {}


def inventario() -> Inventario:
    """Inventário das bases; recalculado só quando algum arquivo da fonte muda."""
    try:
        chave_memo = config.carregar().chave + "#" + assinatura_geral()
    except Exception:  # noqa: BLE001 — fonte fora do ar: _inventario mostra o erro
        return _inventario()
    if chave_memo not in _INV_MEMO:
        _INV_MEMO.clear()
        _INV_MEMO[chave_memo] = _inventario()
    return _INV_MEMO[chave_memo]


def _inventario() -> Inventario:
    """Percorre os arquivos do mais novo para o mais velho e identifica cada base.

    Para assim que as três bases foram achadas: arquivos mais velhos que o mais
    antigo em uso não têm como ser "o mais recente", então nem são abertos. A
    identificação de cada arquivo fica em cache até ele mudar.
    """
    inv = Inventario()
    try:
        lista = arquivos()
    except Exception as e:  # noqa: BLE001
        inv.erro = str(e)
        return inv
    inv.fixados = {k: v for k, v in ler_cadastro(ARQ_PREF).items() if isinstance(v, str)}
    dados = [a for a in lista if not a.arquivo.lower().endswith(".json")]
    # arquivos com pista no nome primeiro (mantendo a ordem por data dentro de cada grupo)
    dados.sort(key=lambda a: _pista(a) is None)
    pendentes = set(TIPOS) - {t for t, id_ in inv.fixados.items() if any(a.id == id_ for a in dados)}
    limite = None  # data do arquivo mais velho em uso entre os tipos já achados
    fixos = set(inv.fixados.values())
    for arq in dados:
        if not pendentes and arq.id not in fixos and (limite is None or arq.modificado < limite):
            continue
        achados = _sondar(arq.id, arq.assinatura)
        inv.verificados += 1
        for tipo, planilha, linha in achados:
            o = Origem(arq, tipo, planilha, linha)
            inv.candidatos.setdefault(tipo, []).append(o)
            if tipo in pendentes:
                pendentes.discard(tipo)
                limite = arq.modificado if limite is None else min(limite, arq.modificado)
    for tipo, lista_tipo in inv.candidatos.items():
        lista_tipo.sort(key=lambda o: o.arquivo.modificado, reverse=True)
        fixo = inv.fixados.get(tipo)
        escolhido = next((o for o in lista_tipo if o.arquivo.id == fixo), None) if fixo else None
        inv.ativos[tipo] = escolhido or lista_tipo[0]
    return inv


def fixar_origem(tipo: str, arquivo_id: str | None, usuario: str = "") -> None:
    """Fixa um arquivo para uma base (ele continua sendo relido quando é sobrescrito)
    ou volta para o modo automático (arquivo_id=None)."""
    atual = _ler_json_agora(ARQ_PREF)
    if arquivo_id:
        atual[tipo] = arquivo_id
    else:
        atual.pop(tipo, None)
    fonte().gravar(ARQ_PREF, json.dumps(atual, ensure_ascii=False, indent=1).encode("utf-8"))
    recarregar()


def assinatura_geral() -> str:
    """Muda quando qualquer arquivo da fonte muda — o vigia usa isso para recarregar a tela."""
    return ";".join(a.assinatura for a in arquivos())


# ----------------------------------------------------------------------------
# IW38 — ordens de manutenção
# ----------------------------------------------------------------------------
_IW38_COLUNAS = {
    "Ordem": [r"^ORDEM$"],
    "Tipo": [r"TIPO DE ORDEM", r"^TIPO ORDEM"],
    "Prioridade": [r"^PRIORIDADE$", r"PRIORIDADE"],
    "Texto": [r"TEXTO BREVE", r"^DESCRICAO$"],
    "Equipamento": [r"^EQUIPAMENTO$"],
    "Objeto técnico": [r"DENOMINACAO DO OBJETO TECNICO", r"DENOMINACAO.*EQUIP", r"OBJETO TECNICO"],
    "Local de instalação": [r"DENOMINACAO DO LOC INSTALACAO", r"DENOMINACAO.*LOC", r"LOCAL DE INSTALACAO"],
    "Centro de trabalho": [r"CENTRO TRAB", r"CENTRO DE TRABALHO"],
    "Centro de custo": [r"CENTRO CUSTO", r"CENTRO DE CUSTO"],
    "Localização": [r"^LOCALIZACAO$"],
    "Centro": [r"^CENTRO$"],
    "Plano": [r"^PLANO DE MANUTENCAO$", r"^PLANO MANUT", r"^PLANO$"],
    "Status sistema": [r"STATUS DO SISTEMA", r"STATUS SISTEMA"],
    "Status usuário": [r"STATUS USUARIO"],
    "Início": [r"DATA BASE DO INICIO", r"INICIO BASE", r"DATA INICIO"],
    "Fim": [r"DATA BASE DO FIM", r"FIM BASE", r"DATA FIM"],
    "Entrada": [r"DATA DE ENTRADA", r"^CRIADO EM$"],
    "Criado por": [r"CRIADO POR"],
    "Custo real": [r"CUSTOS? TOT.*REA", r"CUSTO.*REA", r"CUSTOS? TOT"],
    "Custo planejado": [r"CUSTOS? TOT.*PLAN", r"CUSTO.*PLAN", r"CUSTO.*ESTIM"],
}

# Status de usuário conhecidos (os demais aparecem pelo código).
STATUS_USUARIO = {
    "PLA": "Em planejamento", "PRO": "Programado", "ELP": "Em planejamento (ELP)", "CAN": "Cancelada",
}

SITUACOES = ["Aberta", "Liberada", "Concluída", "Cancelada", "Sem status"]
PENDENTES = ("Aberta", "Liberada")


def _situacao(sistema: str, usuario: str) -> str:
    sis = set(sistema.split())
    usu = set(usuario.split())
    if "CAN" in usu or sis & {"DLFL", "MREL", "MEEL"}:
        return "Cancelada"
    if sis & {"ENCE", "ENTE"}:
        return "Concluída"
    if "LIB" in sis:
        return "Liberada"
    if "ABER" in sis:
        return "Aberta"
    return "Sem status"


def _piloto_ou_matriz(df: pd.DataFrame) -> pd.Series:
    """Fábrica Piloto e Matrizaria ficam fora (regra herdada do site antigo): usa centro de
    trabalho e local de instalação — nunca o texto livre, para não pegar "MESA DE FIX. MATRIZ"."""
    ctr = df["Centro de trabalho"].str.upper()
    inst = df["Local de instalação"].map(lambda s: chave(s))
    obj = df["Objeto técnico"].map(lambda s: chave(s))
    return (ctr.isin(["FABPILOT", "OPER_MTZ", "OPER_MATRIZ"])
            | inst.str.contains("PILOT") | inst.str.contains("MATRIZARIA")
            | obj.str.contains("PILOT"))


@st.cache_resource(show_spinner="Preparando ordens (IW38)…", max_entries=4)
def _iw38(o: Origem, excluir: bool) -> tuple[pd.DataFrame, int]:
    cru = _ler_cru(o.arquivo.id, o.arquivo.assinatura, o.planilha, o.linha)
    return preparar_iw38(cru, excluir_piloto_matriz=excluir)


def preparar_iw38(cru: pd.DataFrame, hoje: pd.Timestamp | None = None,
                  excluir_piloto_matriz: bool = True) -> tuple[pd.DataFrame, int]:
    hoje = (hoje or pd.Timestamp.now()).normalize()
    df = pd.DataFrame(index=cru.index)
    usadas = set()
    for nome, padroes in _IW38_COLUNAS.items():
        col = achar_coluna([c for c in cru.columns if c not in usadas], *padroes,
                           excluir=r"TEXTO|ITEM" if nome == "Plano" else None)
        if col:
            usadas.add(col)
        df[nome] = cru[col] if col else ""

    for c in ["Ordem", "Tipo", "Prioridade", "Texto", "Equipamento", "Objeto técnico", "Local de instalação",
              "Centro de trabalho", "Centro de custo", "Localização", "Centro", "Plano", "Status sistema",
              "Status usuário", "Criado por"]:
        df[c] = texto(df[c])
    df["Status sistema"] = df["Status sistema"].str.split().str.join(" ")
    df["Status usuário"] = df["Status usuário"].str.split().str.join(" ")
    for c in ["Início", "Fim", "Entrada"]:
        df[c] = para_data(df[c])
    for c in ["Custo real", "Custo planejado"]:
        df[c] = para_numero(df[c]).fillna(0.0)

    # colunas extras do export (que o app não conhece) continuam disponíveis
    for c in cru.columns:
        if c not in usadas and c not in df.columns:
            df[c] = cru[c]

    fora = _piloto_ou_matriz(df) if excluir_piloto_matriz else pd.Series(False, index=df.index)
    removidas = int(fora.sum())
    df = df.loc[~fora].reset_index(drop=True)

    df["Com plano"] = df["Plano"].str.strip() != ""
    df["Natureza"] = np.where(df["Com plano"], "Preventiva (com plano)", "Corretiva / avulsa")
    pares = pd.Series(list(zip(df["Status sistema"], df["Status usuário"])))
    cache = {p: _situacao(*p) for p in set(pares)}
    df["Situação"] = pd.Categorical(pares.map(cache), categories=SITUACOES)
    df["Data"] = df["Início"].fillna(df["Entrada"]).fillna(df["Fim"])
    pendente = df["Situação"].isin(PENDENTES)
    prazo = df["Fim"].fillna(df["Início"])
    df["Atrasada"] = pendente & prazo.notna() & (prazo < hoje)
    df["Dias em aberto"] = np.where(pendente, (hoje - df["Entrada"].fillna(df["Início"])).dt.days, np.nan)
    dur = (df["Fim"] - df["Início"]).dt.days
    df["Duração (dias)"] = dur.where((dur >= 0) & (dur < 3650))
    df["Equip. (chave)"] = np.where(df["Equipamento"] != "", df["Equipamento"], df["Objeto técnico"])
    busca = df["Ordem"]
    for c in ["Texto", "Equipamento", "Objeto técnico", "Local de instalação", "Plano", "Criado por", "Status usuário"]:
        busca = busca + " " + df[c]
    df["_busca"] = busca.map(lambda s: sem_acento(s).upper())
    return df, removidas


# ----------------------------------------------------------------------------
# MB52 — estoque
# ----------------------------------------------------------------------------
@st.cache_resource(show_spinner="Preparando estoque (MB52)…", max_entries=4)
def _mb52(o: Origem) -> tuple[pd.DataFrame, pd.DataFrame]:
    return preparar_mb52(_ler_cru(o.arquivo.id, o.arquivo.assinatura, o.planilha, o.linha))


def preparar_mb52(cru: pd.DataFrame) -> tuple[pd.DataFrame, pd.DataFrame]:
    """Devolve (resumo por material, detalhe por depósito)."""
    cols = list(cru.columns)
    mat = achar_coluna(cols, r"^MATERIAL$", r"CODIGO", r"MATERIAL", excluir=r"TEXTO|DESCR|TIPO|GRUPO")
    if not mat:
        raise leitura.LeituraErro("coluna de código do material não encontrada no MB52")
    desc = achar_coluna(cols, r"TEXTO BREVE", r"DESCRICAO", r"TEXTO")
    dep = achar_coluna(cols, r"^DEPOSITO$", r"DEPOSITO", excluir=r"DENOMINACAO|DESCR")
    um = achar_coluna(cols, r"UNIDADE MEDIDA", r"^UMB$", r"^UM$", r"UNID")
    qtd = achar_coluna(cols, r"UTILIZACAO LIVRE", r"UTILIZ LIVRE", r"LIVRE UTILIZ", r"^ESTOQUE$", r"ESTOQUE",
                       r"QUANTIDADE", r"DISPONIVEL", excluir=r"VALOR|MOEDA")
    val = achar_coluna(cols, r"VALOR UTILIZ", r"VALOR.*LIVRE", r"^VALOR$", r"VALOR")

    det = pd.DataFrame({
        "Material": texto(cru[mat]),
        "Descrição": texto(cru[desc]) if desc else "",
        "Depósito": texto(cru[dep]) if dep else "",
        "UM": texto(cru[um]) if um else "",
        "Estoque": para_numero(cru[qtd]).fillna(0.0) if qtd else 0.0,
        "Valor": para_numero(cru[val]).fillna(0.0) if val else 0.0,
    })
    det = det[det["Material"] != ""]
    resumo = det.groupby("Material", as_index=False, sort=False).agg(
        Descrição=("Descrição", "first"),
        UM=("UM", "first"),
        Estoque=("Estoque", "sum"),
        Valor=("Valor", "sum"),
        Depósitos=("Depósito", lambda s: ", ".join(sorted({d for d in s if d}))),
    )
    return resumo, det.reset_index(drop=True)


# ----------------------------------------------------------------------------
# Requisições de compra (aprovações)
# ----------------------------------------------------------------------------
_REQ_COLUNAS = {
    "Requisição": [r"N(UMERO)? DA REQ", r"REQUISI"],
    "PO": [r"NUMERO DA PO", r"PEDIDO", r"\bPO\b"],
    "Status": [r"^STATUS$", r"STATUS"],
    "Aprovador": [r"APROVADOR ATUAL", r"APROVADOR"],
    "Proprietário da aprovação": [r"PROPRIETARIO"],
    "Solicitante": [r"SOLICITADO POR", r"SOLICITANTE", r"REQUISITANTE"],
    "Itens": [r"^ITENS$", r"ITENS", r"DESCRICAO"],
    "Justificativa": [r"JUSTIFICATIVA"],
    "Enviado em": [r"^ENVIADO EM$", r"ENVIADO"],
    "Último envio": [r"ULTIMO ENVIO"],
    "Total": [r"^TOTAL$", r"VALOR TOTAL", r"TOTAL"],
}


@st.cache_resource(show_spinner="Preparando requisições…", max_entries=4)
def _req(o: Origem) -> pd.DataFrame:
    return preparar_requisicoes(_ler_cru(o.arquivo.id, o.arquivo.assinatura, o.planilha, o.linha))


def preparar_requisicoes(cru: pd.DataFrame, hoje: pd.Timestamp | None = None) -> pd.DataFrame:
    hoje = (hoje or pd.Timestamp.now()).normalize()
    df = pd.DataFrame(index=cru.index)
    usadas = set()
    for nome, padroes in _REQ_COLUNAS.items():
        col = achar_coluna([c for c in cru.columns if c not in usadas], *padroes)
        if col:
            usadas.add(col)
        df[nome] = cru[col] if col else ""
    for c in ["Requisição", "PO", "Status", "Aprovador", "Proprietário da aprovação", "Solicitante", "Itens", "Justificativa"]:
        df[c] = texto(df[c])
    df["Enviado em"] = para_data(df["Enviado em"])
    df["Último envio"] = para_data(df["Último envio"])
    df["Total"] = para_numero(df["Total"]).fillna(0.0)
    df["Pendente"] = df["Status"].map(chave).str.contains("PENDENTE")
    ref = df["Último envio"].fillna(df["Enviado em"])
    df["Dias aguardando"] = np.where(df["Pendente"], (hoje - ref).dt.days, np.nan)
    return df


# ----------------------------------------------------------------------------
# IP19 — programação dos planos de manutenção
# ----------------------------------------------------------------------------
@st.cache_resource(show_spinner="Preparando planos (IP19)…", max_entries=4)
def _ip19(o: Origem) -> pd.DataFrame:
    from .planos import preparar_ip19

    return preparar_ip19(_ler_cru(o.arquivo.id, o.arquivo.assinatura, o.planilha, o.linha))


# ----------------------------------------------------------------------------
# Cadastros feitos no próprio app (JSON na pasta do app, compartilhada)
# ----------------------------------------------------------------------------
@st.cache_data(show_spinner=False, max_entries=8)
def _ler_json(id: str, assinatura: str) -> dict:
    try:
        return json.loads(fonte().ler(id).decode("utf-8"))
    except Exception:  # noqa: BLE001
        return {}


def _ler_json_agora(nome: str) -> dict:
    try:
        return json.loads(fonte().ler(fonte().id_de(nome)).decode("utf-8"))
    except Exception:  # noqa: BLE001 — arquivo ainda não existe
        return {}


def manifesto() -> dict:
    """Manifesto do repositório de dados (modo GitHub): de onde e quando veio cada base."""
    arq = next((a for a in arquivos() if a.id == fontes.MANIFESTO), None)
    return _ler_json(arq.id, arq.assinatura) if arq else {}


def ler_cadastro(nome: str) -> dict:
    alvo = fonte().id_de(nome)
    arq = next((a for a in arquivos() if a.id == alvo), None)
    return _ler_json(arq.id, arq.assinatura) if arq else {}


def gravar_cadastro(nome: str, chave_item: str, dados: dict | None, usuario: str = "") -> None:
    gravar_cadastro_lote(nome, {chave_item: dados}, usuario)


def gravar_cadastro_lote(nome: str, itens: dict[str, dict | None], usuario: str = "") -> None:
    """Atualiza só os itens informados (relendo o arquivo na hora), para duas pessoas
    editando itens diferentes não se sobrescreverem. Valor None remove o item."""
    atual = _ler_json_agora(nome)
    agora = datetime.now(timezone.utc).isoformat(timespec="seconds")
    for chave_item, dados in itens.items():
        if dados is None:
            atual.pop(chave_item, None)
        else:
            atual[chave_item] = {**dados, "atualizado_em": agora, "atualizado_por": usuario}
    fonte().gravar(nome, json.dumps(atual, ensure_ascii=False, indent=1).encode("utf-8"))
    recarregar()


def enviar_arquivo(tipo: str, nome_original: str, conteudo: bytes) -> str:
    """Valida e grava na pasta do app um arquivo exportado, já com o tipo no nome."""
    tipos = {t for t, _, _ in leitura.sondar(nome_original, conteudo)}
    if tipo not in tipos:
        esperado = leitura.NOMES_BASE[tipo]
        outro = next(iter(tipos), None)
        raise leitura.LeituraErro(
            f"o arquivo não parece ser de {esperado}"
            + (f" (parece {leitura.NOMES_BASE[outro]})" if outro else " — confira as colunas do export"))
    ext = PurePath(nome_original).suffix.lower() or ".xlsx"
    prefixo = {IW38: "IW38", MB52: "MB52", REQ: "REQUISICOES", IP19: "IP19"}[tipo]
    nome = f"{prefixo}_{datetime.now():%Y-%m-%d_%H%M%S}{ext}"
    fonte().gravar(nome, conteudo)
    recarregar()
    return nome


def recarregar() -> None:
    _listar.clear()


# ----------------------------------------------------------------------------
# Acesso de alto nível usado pelas páginas
# ----------------------------------------------------------------------------
@dataclass
class Base:
    df: pd.DataFrame | None
    origem: Origem | None
    erro: str = ""
    extra: object = None  # IW38: nº removidas · MB52: detalhe por depósito

    @property
    def atualizado(self) -> datetime | None:
        return self.origem.arquivo.modificado if self.origem else None


def _carregar(tipo: str, fn) -> Base:
    o = inventario().ativos.get(tipo)
    if not o:
        return Base(None, None)
    try:
        return fn(o)
    except Exception as e:  # noqa: BLE001
        return Base(None, o, erro=str(e))


def iw38() -> Base:
    def fn(o):
        df, removidas = _iw38(o, config.carregar().excluir_piloto_matriz)
        return Base(df, o, extra=removidas)
    return _carregar(IW38, fn)


def mb52() -> Base:
    def fn(o):
        resumo, det = _mb52(o)
        return Base(resumo, o, extra=det)
    return _carregar(MB52, fn)


def requisicoes() -> Base:
    return _carregar(REQ, lambda o: Base(_req(o), o))


def ip19() -> Base:
    return _carregar(IP19, lambda o: Base(_ip19(o), o))
