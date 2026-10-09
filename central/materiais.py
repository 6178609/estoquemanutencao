"""Catálogo de materiais cadastrados (extração do Sysmat) e o cruzamento com o almoxarifado (MB52).

A extração traz um material por linha: código Sysmat, código Alpargatas (o mesmo código do material no SAP/MB52),
o código que o substitui (duplicados), NCM, unidade, categoria, subcategoria, PDM, descrição curta, descrição completa
(a informação técnica: atributos separados por ";") e o status do cadastro.

- Material do almoxarifado: o que está na MB52 (tem saldo/depósito), com a informação técnica do catálogo.
- Material cadastrado: tudo o que está no catálogo, com a marca de quem está no almoxarifado.

Pandas puro (testado em tests/test_materiais.py).
"""

from __future__ import annotations

import html
import re

import pandas as pd

from .util import achar_coluna, texto

COLUNAS = ["Material", "Sysmat", "Substituto", "NCM", "UM", "Categoria", "Subcategoria", "PDM", "Descrição curta",
           "Informação técnica", "Fabricante / referência", "Status"]
_ORIGEM = {
    "Material": [r"^CODIGO ?ALPARGATAS$"], "Sysmat": [r"^CODIGO ?SYSMAT$"],
    "Substituto": [r"^CODIGO ?ALPARGATAS ?PARA$"], "NCM": [r"^NCM$"], "UM": [r"^UN BASICA$", r"^UN$", r"UNIDADE"],
    "Categoria": [r"^CATEGORIA$"], "Subcategoria": [r"^SUB ?CATEGORIA$"], "PDM": [r"^PDM$"],
    "Descrição curta": [r"^DESCR(ICAO)? CURTA$"], "Informação técnica": [r"^DESCR(ICAO)? COMPLETA$"],
    "Status": [r"^STATUS$"],
}
ATIVOS = ("APROVADO", "INVENTARIO", "CONTROLADORIA", "INCLUSAO", "APR CADASTRO", "SOLIC CADASTRO", "VALIDACAO",
          "COMPLETO")
INATIVOS = ("BLOQUEADO", "CANCELADO", "DUPLICADO")
_VAZIOS = {"(SEM CATEGORIA)", "(SEM SUBCATEGORIA)"}
_FAB = re.compile(r"FAB:\s*([^;]*?)\s*-\s*REF:\s*([^;]*?)\s*(?:;|\.?$)", re.I)
_SEPARADOR = re.compile(r"\s*;\s*")


def preparar_catalogo(cru: pd.DataFrame) -> pd.DataFrame:
    """Uma linha por material do catálogo (o mesmo código Alpargatas repetido fica com a linha de status ativo)."""
    df = pd.DataFrame(index=cru.index)
    for nome, padroes in _ORIGEM.items():
        col = achar_coluna(cru.columns, *padroes)
        df[nome] = texto(cru[col]) if col else ""
    for c in ("Categoria", "Subcategoria"):
        df.loc[df[c].isin(_VAZIOS), c] = ""
    df["Status"] = df["Status"].str.upper().str.strip()
    df["Fabricante / referência"] = df["Informação técnica"].map(fabricante_ref)
    df = df[(df["Material"] != "") | (df["Sysmat"] != "")]
    # código Alpargatas repetido: vale a linha ativa (aprovado antes de bloqueado/cancelado)
    ordem = df["Status"].map(lambda s: 0 if s in ATIVOS else 1)
    com_cod = df[df["Material"] != ""].assign(_o=ordem).sort_values("_o").drop_duplicates("Material").drop(columns="_o")
    sem_cod = df[df["Material"] == ""]
    return pd.concat([com_cod, sem_cod]).sort_index()[COLUNAS].reset_index(drop=True)


def fabricante_ref(info: str) -> str:
    """"…; FAB: SKF - REF: 6205-2Z." → "SKF 6205-2Z" (vários fabricantes separados por " | ")."""
    pares = []
    for fab, ref in _FAB.findall(info or ""):
        fab, ref = fab.strip(" .*"), ref.strip(" .*")
        par = " ".join(x for x in (fab, ref) if x)
        if par and par not in pares:
            pares.append(par)
    return " | ".join(pares)


def linhas_tecnicas(info: str) -> list[str]:
    """A informação técnica quebrada nos atributos (um por linha), sem os "*****" de campo vazio."""
    partes = [p.strip(" .") for p in _SEPARADOR.split(str(info or "").strip())]
    return [p for p in partes if p and not re.fullmatch(r"[A-Z ]+:\s*\**", p)]


def info_html(info: str) -> str:
    """Informação técnica em HTML seguro, com quebra de linha entre os atributos."""
    linhas = linhas_tecnicas(info)
    if not linhas:
        return "<span class='cm-vazio'>sem informação técnica no cadastro</span>"
    return "<br>".join(html.escape(x) for x in linhas)


def almoxarifado(estoque: pd.DataFrame, catalogo: pd.DataFrame | None) -> pd.DataFrame:
    """MB52 (resumo por material) com as colunas do catálogo; "Cadastro" diz se achou o material no Sysmat."""
    t = estoque.copy()
    extras = ["Sysmat", "Categoria", "Subcategoria", "NCM", "Informação técnica", "Fabricante / referência", "Status",
              "Substituto"]
    if catalogo is None or not len(catalogo):
        for c in extras:
            t[c] = ""
        t["Cadastro"] = "Sem catálogo"
        return t
    ref = catalogo[catalogo["Material"] != ""]
    ref = ref.assign(_k=ref["Material"].str.lstrip("0")).drop_duplicates("_k").set_index("_k")
    chave = t["Material"].str.lstrip("0")         # zeros à esquerda não mudam o código
    for c in extras:
        t[c] = chave.map(ref[c]).fillna("")
    achou = chave.isin(ref.index)
    t["Cadastro"] = ["Não encontrado no Sysmat" if not a else ("Ativo" if s not in INATIVOS else s.capitalize())
                     for a, s in zip(achou, t["Status"])]
    return t


def cadastrados(catalogo: pd.DataFrame, estoque: pd.DataFrame | None) -> pd.DataFrame:
    """O catálogo com o saldo do almoxarifado de quem está na MB52 ("No almoxarifado")."""
    t = catalogo.copy()
    if estoque is None or not len(estoque):
        t["No almoxarifado"], t["Estoque"] = False, float("nan")
        return t
    saldo = estoque.drop_duplicates("Material").set_index("Material")["Estoque"]
    saldo.index = saldo.index.str.lstrip("0")
    cod = t["Material"].str.lstrip("0")
    t["No almoxarifado"] = (t["Material"] != "") & cod.isin(saldo.index)
    t["Estoque"] = cod.map(saldo).where(t["No almoxarifado"])
    return t
