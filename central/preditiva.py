"""Manutenção preditiva SEMEQ: anomalias apontadas (notas IW28) e a tratativa (ordens IW38).

Pandas puro (testado em tests/test_preditiva.py). As notas e ordens da preditiva trazem no texto
o padrão "SEMEQ-<técnica>-<nº>-<achado>" (ex.: SEMEQ-AVB-333-DESBALANCEAMENTO). Uma anomalia é
identificada pela técnica + nº; a nota registra a detecção e a ordem é a tratativa. A nota se liga
à ordem pelo campo Ordem ou pelo mesmo código no texto.
"""

from __future__ import annotations

import re

import numpy as np
import pandas as pd

from .util import sem_acento

PALAVRA = "SEMEQ"
_RX = re.compile(r"SEMEQ\W*(?P<tec>[A-Z]{2,4})\W*(?P<num>\d+)\W*(?P<achado>.*)")
TECNICAS = {"AVB": "Análise de vibração", "AOL": "Análise de óleo", "TMP": "Termografia", "TER": "Termografia",
            "UTS": "Ultrassom", "ULT": "Ultrassom", "MCA": "Análise de circuito de motor", "END": "Ensaio não destrutivo",
            "INS": "Inspeção sensitiva"}

TRATADA, SEM_CONF, TRATATIVA, ATRASADA, SEM_ORDEM, CANCELADA = (
    "Tratada", "Encerrada sem confirmação", "Em tratativa", "Atrasada", "Sem ordem", "Cancelada")
SITUACOES = [TRATADA, SEM_CONF, TRATATIVA, ATRASADA, SEM_ORDEM, CANCELADA]
ABERTAS = (SEM_CONF, TRATATIVA, ATRASADA, SEM_ORDEM)
COR = {TRATADA: "#0E9F46", SEM_CONF: "#9BC53D", TRATATIVA: "#0A6EBD", ATRASADA: "#E3262B", SEM_ORDEM: "#F7931E",
       CANCELADA: "#B0B6B3"}


def _partes(texto: pd.Series) -> pd.DataFrame:
    m = sem_acento_serie(texto).str.upper().str.extract(_RX)
    m["achado"] = m["achado"].fillna("").str.strip(" -_.").str.replace(r"\s+", " ", regex=True)
    m["código"] = np.where(m["tec"].notna(), m["tec"].fillna("") + "-" + m["num"].fillna("").str.lstrip("0"), "")
    return m


def sem_acento_serie(s: pd.Series) -> pd.Series:
    return s.fillna("").astype(str).map(sem_acento)


def eh_semeq(texto: pd.Series) -> pd.Series:
    return texto.fillna("").astype(str).str.upper().str.contains(PALAVRA, regex=False)


def anomalias(notas: pd.DataFrame | None, ordens: pd.DataFrame | None, oper: pd.DataFrame | None = None,
              conf: pd.DataFrame | None = None, equipe: pd.DataFrame | None = None,
              hoje: pd.Timestamp | None = None) -> pd.DataFrame:
    """Uma linha por anomalia SEMEQ, juntando a nota (detecção) e a ordem (tratativa)."""
    hoje = (hoje or pd.Timestamp.now()).normalize()
    cols = ["Código", "Técnica", "Sigla", "Achado", "Equipamento", "Objeto técnico", "Detecção", "Nota", "Ordem",
            "Situação", "Dias para tratar", "Dias em aberto"]
    partes = []
    if notas is not None and len(notas) and "Descrição" in notas:
        n = notas[eh_semeq(notas["Descrição"])].copy()
        if len(n):
            p = _partes(n["Descrição"])
            partes.append(pd.DataFrame({
                "Código": p["código"].values, "Sigla": p["tec"].fillna("").values, "Achado": p["achado"].values,
                "Texto": n["Descrição"].values, "Nota": n["Nota"].values, "Ordem nota": n["Ordem"].values,
                "Data nota": n["Data"].values, "Equip. (chave)": n["Equip. (chave)"].values,
                "Objeto técnico": n["Objeto técnico"].values, "Área": n["Localização"].values,
                "Centro de trabalho": n["Centro de trabalho"].values, "origem": "nota"}))
    if ordens is not None and len(ordens) and "Texto" in ordens:
        o = ordens[eh_semeq(ordens["Texto"])].copy()
        if len(o):
            p = _partes(o["Texto"])
            partes.append(pd.DataFrame({
                "Código": p["código"].values, "Sigla": p["tec"].fillna("").values, "Achado": p["achado"].values,
                "Texto": o["Texto"].values, "Ordem": o["Ordem"].values, "Data ordem": o["Data"].values,
                "Equip. (chave)": o["Equip. (chave)"].values, "Objeto técnico": o["Objeto técnico"].values,
                "Área": o["Localização"].values, "Centro de trabalho": o["Centro de trabalho"].values,
                "Tipo": o["Tipo"].values, "Situação da ordem": o["Situação"].values, "Fim previsto": o["Fim"].values,
                "Custo real": o["Custo real"].values, "origem": "ordem"}))
    if not partes:
        return pd.DataFrame(columns=cols)
    notas_df = next((x for x in partes if x["origem"].iat[0] == "nota"), None)
    ordens_df = next((x for x in partes if x["origem"].iat[0] == "ordem"), None)

    if notas_df is not None and ordens_df is not None:
        # liga pela ordem da nota; sem ela, pelo mesmo código SEMEQ no texto
        por_ordem = notas_df[notas_df["Ordem nota"].isin(set(ordens_df["Ordem"]))]
        resto = notas_df.drop(por_ordem.index)
        a = por_ordem.merge(ordens_df.drop(columns=["origem"]), left_on="Ordem nota", right_on="Ordem",
                            how="left", suffixes=("", "_o"))
        cod_ordens = ordens_df[ordens_df["Código"] != ""].drop_duplicates("Código")
        b = resto.merge(cod_ordens.drop(columns=["origem"]), on="Código", how="left", suffixes=("", "_o"))
        b = b[b["Código"] != ""] if len(b) else b
        sem_cod = resto[resto["Código"] == ""]
        juntas = pd.concat([a, b, sem_cod], ignore_index=True, sort=False)
        usadas = set(juntas["Ordem"].dropna())
        so_ordem = ordens_df[~ordens_df["Ordem"].isin(usadas)]
        df = pd.concat([juntas, so_ordem], ignore_index=True, sort=False)
    else:
        df = (notas_df if notas_df is not None else ordens_df).copy()
    for c in ["Código_o", "Sigla_o", "Achado_o", "Texto_o", "Equip. (chave)_o", "Objeto técnico_o", "Área_o",
              "Centro de trabalho_o"]:
        base = c[:-2]
        if c in df:
            df[base] = df[base].where(df[base].fillna("") != "", df[c])
            df = df.drop(columns=c)
    for c in ["Ordem", "Nota", "Ordem nota", "Situação da ordem", "Tipo", "Sigla", "Achado", "Código",
              "Equip. (chave)", "Objeto técnico", "Área", "Centro de trabalho"]:
        if c not in df:
            df[c] = ""
        df[c] = df[c].astype(object).where(df[c].notna(), "").astype(str)  # o IW38 tem colunas categóricas
    for c in ["Data nota", "Data ordem", "Fim previsto"]:
        df[c] = pd.to_datetime(df[c]) if c in df else pd.NaT
    df["Custo real"] = pd.to_numeric(df.get("Custo real", 0.0), errors="coerce").fillna(0.0)
    df["Ordem"] = df["Ordem"].where(df["Ordem"] != "", df["Ordem nota"])
    df["Detecção"] = df["Data nota"].fillna(df["Data ordem"])
    df["Técnica"] = df["Sigla"].map(TECNICAS).fillna(df["Sigla"])
    df["Achado"] = df["Achado"].str.capitalize()
    df["Equipamento"] = df["Equip. (chave)"]

    # fim real (IW38OP) e quem tratou (IW47)
    if oper is not None and len(oper):
        concl = oper[oper["Concluída"] & oper["Fim real"].notna()]
        df["Fim real"] = df["Ordem"].map(concl.groupby("Ordem")["Fim real"].max())
    else:
        df["Fim real"] = pd.NaT
    df["Fim real"] = pd.to_datetime(df["Fim real"])
    if conf is not None and len(conf):
        nomes = dict(zip(equipe["Nº pessoal"], equipe["Nome"])) if equipe is not None and len(equipe) else {}
        c = conf[conf["Ordem"].isin(set(df["Ordem"]) - {""})].copy()
        c["Pessoa"] = c["Nº pessoal"].map(nomes).fillna(c["Nº pessoal"])
        g = c.groupby("Ordem")
        df["HH apontadas"] = df["Ordem"].map(g["Horas"].sum())
        df["Tratado por"] = df["Ordem"].map(g["Pessoa"].agg(lambda s: ", ".join(dict.fromkeys(s)))).fillna("")
    else:
        df["HH apontadas"] = np.nan
        df["Tratado por"] = ""

    sit = df["Situação da ordem"]
    pendente = sit.isin(["Aberta", "Liberada", "Sem status"])
    df["Situação"] = np.select(
        [df["Ordem"] == "", sit == "Cancelada", sit == "Concluída", sit == "Encerrada sem confirmação",
         pendente & df["Fim previsto"].notna() & (df["Fim previsto"] < hoje)],
        [SEM_ORDEM, CANCELADA, TRATADA, SEM_CONF, ATRASADA], default=TRATATIVA)
    fim = df["Fim real"].fillna(df["Fim previsto"].where(df["Situação"] == TRATADA))
    df["Dias para tratar"] = (fim - df["Detecção"]).dt.days.where(df["Situação"] == TRATADA)
    df["Dias para tratar"] = df["Dias para tratar"].where(df["Dias para tratar"] >= 0)
    df["Dias em aberto"] = (hoje - df["Detecção"]).dt.days.where(df["Situação"].isin(ABERTAS))
    df = df.drop(columns=[c for c in ["origem", "Ordem nota"] if c in df])
    return df.sort_values("Detecção", ascending=False, na_position="last").reset_index(drop=True)


def _entre(serie: pd.Series, ini, fim) -> pd.Series:
    return (serie >= pd.Timestamp(ini)) & (serie < pd.Timestamp(fim) + pd.Timedelta(days=1))


def indicadores(an: pd.DataFrame, ini, fim) -> dict[str, float | None]:
    """Indicadores da preditiva no período (pela data de detecção); abertas e atrasadas são de hoje."""
    r: dict[str, float | None] = {}
    vivas = an[an["Situação"] != CANCELADA] if len(an) else an
    per = vivas[_entre(vivas["Detecção"], ini, fim)] if len(vivas) else vivas
    r["semeq_detectadas"] = float(len(per))
    r["semeq_com_ordem"] = float((per["Situação"] != SEM_ORDEM).mean() * 100) if len(per) else None
    r["semeq_tratadas"] = float((per["Situação"] == TRATADA).mean() * 100) if len(per) else None
    dias = per["Dias para tratar"].dropna() if len(per) else pd.Series(dtype=float)
    r["semeq_dias"] = float(dias.mean()) if len(dias) else None
    r["semeq_abertas"] = float(vivas["Situação"].isin(ABERTAS).sum()) if len(vivas) else 0.0
    r["semeq_atrasadas"] = float((vivas["Situação"] == ATRASADA).sum()) if len(vivas) else 0.0
    r["semeq_equipamentos"] = float(per.loc[per["Equipamento"] != "", "Equipamento"].nunique()) if len(per) else 0.0
    if len(per):
        n_eq = per[per["Equipamento"] != ""].groupby("Equipamento").size()
        r["semeq_reincidentes"] = float((n_eq > 1).sum())
        r["semeq_custo"] = float(per["Custo real"].sum())
    else:
        r["semeq_reincidentes"] = r["semeq_custo"] = 0.0
    return r
