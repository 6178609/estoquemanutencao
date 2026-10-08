"""Busca global: um termo procurado de uma vez em ordens, notas, equipamentos, materiais, planos e AFs.

Pandas puro (testado em tests/test_busca.py). Todas as palavras do termo precisam aparecer (sem acento,
maiúsculas); número igual ao da ordem/nota/equipamento/material/campo de ordenação vem primeiro.
"""

from __future__ import annotations

import pandas as pd

from .util import sem_acento

CATEGORIAS = ["Ordens", "Notas", "Equipamentos", "Materiais", "Planos", "Análises de falha"]
LIMITE = 200


def normalizar(texto) -> str:
    return sem_acento(str(texto or "")).upper().strip()


def _palheiro(df: pd.DataFrame, cols: list[str]) -> pd.Series:
    h = pd.Series("", index=df.index)
    for c in cols:
        if c in df:
            h = h + " " + df[c].astype(str).fillna("")
    return h.map(normalizar)


def _filtrar(df: pd.DataFrame | None, cols: list[str], termo: str, exatas: list[str], mostrar: list[str],
             palheiro: pd.Series | None = None) -> pd.DataFrame:
    if df is None or not len(df) or not termo:
        return pd.DataFrame(columns=mostrar)
    h = palheiro if palheiro is not None else _palheiro(df, cols)
    m = pd.Series(True, index=df.index)
    for palavra in termo.split():
        m &= h.str.contains(palavra, regex=False)
    achados = df[m]
    if not len(achados):
        return pd.DataFrame(columns=mostrar)
    alvo = termo.replace(" ", "")
    exato = pd.Series(False, index=achados.index)
    for c in exatas:
        if c in achados:
            exato |= achados[c].astype(str).str.lstrip("0").str.upper() == alvo.lstrip("0")
    achados = achados.assign(_exato=exato).sort_values("_exato", ascending=False, kind="stable")
    return achados[[c for c in mostrar if c in achados]].head(LIMITE).reset_index(drop=True)


def buscar(termo: str, *, ordens: pd.DataFrame | None = None, notas: pd.DataFrame | None = None,
           equip: pd.DataFrame | None = None, cad_eq: dict | None = None, estoque: pd.DataFrame | None = None,
           chamadas: pd.DataFrame | None = None, afs: pd.DataFrame | None = None) -> dict[str, pd.DataFrame]:
    """{categoria: resultados} — cada um com até LIMITE linhas, as de número exato primeiro."""
    t = normalizar(termo)
    if len(t.replace(" ", "")) < 2:
        return {c: pd.DataFrame() for c in CATEGORIAS}
    r: dict[str, pd.DataFrame] = {}
    if ordens is not None and len(ordens):
        o = ordens.sort_values("Data", ascending=False) if "Data" in ordens else ordens
        cols_o = ["Ordem", "Texto", "Equip. (chave)", "Objeto técnico", "Local de instalação", "Plano",
                  "Campo de ordenação", "Centro de trabalho", "Tipo", "Status usuário"]
        palheiro = None
        if "_busca" in o:   # o IW38 já traz o texto de busca pronto; completa com campo de ordenação e centro
            palheiro = o["_busca"] + " " + _palheiro(o, ["Campo de ordenação", "Centro de trabalho", "Tipo"])
        r["Ordens"] = _filtrar(o, cols_o, t, ["Ordem", "Equip. (chave)", "Campo de ordenação"],
                               ["Ordem", "Tipo", "Texto", "Situação", "Data", "Fim", "Equip. (chave)", "Objeto técnico",
                                "Campo de ordenação", "Centro de trabalho", "Localização", "Custo real", "Natureza"],
                               palheiro)
    else:
        r["Ordens"] = pd.DataFrame()
    n = notas.sort_values("Data", ascending=False) if notas is not None and len(notas) and "Data" in notas else notas
    r["Notas"] = _filtrar(n, ["Nota", "Ordem", "Descrição", "Equip. (chave)", "Objeto técnico", "Local de instalação",
                              "Tipo de nota", "Centro de trabalho"], t, ["Nota", "Ordem", "Equip. (chave)"],
                          ["Nota", "Tipo de nota", "Descrição", "Data", "Ordem", "Equip. (chave)", "Objeto técnico",
                           "Centro de trabalho", "Localização", "Quebra"])
    eq = equip.copy() if equip is not None and len(equip) else pd.DataFrame(
        columns=["Equipamento", "Denominação", "Local de instalação", "Localização", "Código ABC"])
    if cad_eq:   # equipamentos cadastrados no site que não estão no IH08
        extras = [k for k in cad_eq if k not in set(eq["Equipamento"])]
        if extras:
            eq = pd.concat([eq, pd.DataFrame({"Equipamento": extras,
                                              "Denominação": [(cad_eq[k] or {}).get("nome", "") for k in extras]})],
                           ignore_index=True).fillna("")
        eq["Criticidade"] = eq["Equipamento"].map(lambda k: (cad_eq.get(k) or {}).get("criticidade", ""))
    r["Equipamentos"] = _filtrar(eq, ["Equipamento", "Denominação", "Local de instalação", "Localização"], t,
                                 ["Equipamento"], ["Equipamento", "Denominação", "Local de instalação", "Localização",
                                                   "Código ABC", "Criticidade"])
    r["Materiais"] = _filtrar(estoque, ["Material", "Descrição"], t, ["Material"],
                              ["Material", "Descrição", "Estoque", "Unidade", "Valor"])
    ch = chamadas
    if ch is not None and len(ch):
        ch = ch.sort_values("Data", ascending=False) if "Data" in ch else ch
    r["Planos"] = _filtrar(ch, ["Plano", "Texto", "Equipamento", "Objeto técnico", "Ordem", "Centro de trabalho"], t,
                           ["Plano", "Ordem", "Equipamento"],
                           ["Plano", "Texto", "Data", "Situação", "Ordem", "Equipamento", "Objeto técnico",
                            "Centro de trabalho"])
    a = afs.sort_values("Data da falha", ascending=False) if afs is not None and len(afs) and "Data da falha" in afs \
        else afs
    r["Análises de falha"] = _filtrar(a, ["Nº AF", "Código SAP", "Equipamento", "Resumo", "Causa raiz", "Área",
                                          "OS corretiva"], t, ["Nº AF", "Código SAP", "OS corretiva"],
                                      ["Nº AF", "Data da falha", "Código SAP", "Equipamento", "Resumo", "Situação",
                                       "Criticidade", "Causa raiz", "OS corretiva"])
    return {c: r.get(c, pd.DataFrame()) for c in CATEGORIAS}
