"""Execução das atividades: operações do IW38OP × ordens do IW38 × apontamentos da IW47 (quem fez o quê).

Pandas puro (testado em tests/test_execucao.py). Convenções:
- Atividade = operação do IW38OP; a data programada é a "1ª data de início" (coluna Início).
- Executada = operação confirmada (CONF/ENTE/ENCE no status do sistema); cancelada não conta.
- A operação se liga ao apontamento da IW47 por ordem + nº da operação (zeros à esquerda ignorados).
- Taxa de execução = executadas ÷ programadas com data até hoje (as futuras ainda não venceram).
"""

from __future__ import annotations

import numpy as np
import pandas as pd

EXECUTADA, SEM_APONTAMENTO, ATRASADA, PROGRAMADA, CANCELADA = (
    "Executada", "Executada sem apontamento", "Atrasada", "Programada", "Cancelada")
SITUACOES = [EXECUTADA, SEM_APONTAMENTO, ATRASADA, PROGRAMADA, CANCELADA]
COR = {EXECUTADA: "#0E9F46", SEM_APONTAMENTO: "#9BC53D", ATRASADA: "#E3262B", PROGRAMADA: "#0A6EBD",
       CANCELADA: "#B0B6B3"}


def _op(serie: pd.Series) -> pd.Series:
    return serie.astype(str).str.strip().str.lstrip("0")


def _entre(serie: pd.Series, ini, fim) -> pd.Series:
    return (serie >= pd.Timestamp(ini)) & (serie < pd.Timestamp(fim) + pd.Timedelta(days=1))


def nomes(equipe: pd.DataFrame | None) -> dict[str, str]:
    if equipe is None or not len(equipe):
        return {}
    return {k: v for k, v in zip(equipe["Nº pessoal"], equipe["Nome"]) if v}


def apontamentos(conf: pd.DataFrame | None, equipe: pd.DataFrame | None = None) -> pd.DataFrame:
    """IW47 com o nome da pessoa (planilha de Gestão de HH; sem cadastro, a matrícula)."""
    cols = ["Nº pessoal", "Pessoa", "Ordem", "Operação", "Op", "Data", "Horas", "Centro de trabalho"]
    if conf is None or not len(conf):
        return pd.DataFrame(columns=cols)
    c = conf.copy()
    nm = nomes(equipe)
    proprio = c["Nome"] if "Nome" in c else pd.Series("", index=c.index)
    c["Pessoa"] = c["Nº pessoal"].map(nm).fillna(proprio.where(proprio != "", None)).fillna(c["Nº pessoal"])
    c["Op"] = _op(c["Operação"])
    return c


def operacoes(oper: pd.DataFrame | None, ordens: pd.DataFrame | None, conf: pd.DataFrame | None,
              equipe: pd.DataFrame | None = None, hoje: pd.Timestamp | None = None) -> pd.DataFrame:
    """Uma linha por operação, com a situação, as horas reais e quem apontou (ordenado por data programada)."""
    hoje = (hoje or pd.Timestamp.now()).normalize()
    if oper is None or not len(oper):
        return pd.DataFrame(columns=["Ordem", "Operação", "Início", "Situação", "HH real", "Executado por"])
    o = oper.copy()
    o["Op"] = _op(o["Operação"])
    ap = apontamentos(conf, equipe)
    if len(ap):
        g = ap.groupby(["Ordem", "Op"])
        agg = pd.DataFrame({
            "HH real": g["Horas"].sum(),
            "Executado por": g["Pessoa"].agg(lambda s: ", ".join(dict.fromkeys(p for p in s if p))),
            "Executantes": g["Nº pessoal"].nunique(),
            "Último apontamento": g["Data"].max(),
        }).reset_index()
        o = o.merge(agg, on=["Ordem", "Op"], how="left")
    else:
        o["HH real"], o["Executado por"], o["Executantes"], o["Último apontamento"] = np.nan, "", 0, pd.NaT
    o["Executado por"] = o["Executado por"].fillna("")
    o["Executantes"] = o["Executantes"].fillna(0).astype(int)
    o["Com apontamento"] = o["Executado por"] != ""
    if ordens is not None and len(ordens):
        ref = ordens.drop_duplicates("Ordem").set_index("Ordem")
        for col, destino in [("Com plano", "Com plano"), ("Natureza", "Natureza"), ("Localização", "Área"),
                             ("Texto", "Texto da ordem"), ("Situação", "Situação da ordem")]:
            if col in ref:
                o[destino] = o["Ordem"].map(ref[col])
        o["Com plano"] = o["Com plano"].fillna(False).astype(bool)
    else:
        o["Com plano"] = False
    o["Situação"] = np.select(
        [o["Cancelada"], o["Concluída"] & o["Com apontamento"], o["Concluída"],
         o["Início"].notna() & (o["Início"] < hoje)],
        [CANCELADA, EXECUTADA, SEM_APONTAMENTO, ATRASADA], default=PROGRAMADA)
    atraso = (o["Fim real"] - o["Início"]).dt.days
    o["Dias após a programação"] = atraso.where(o["Concluída"] & (atraso >= 0))
    return o.sort_values("Início").reset_index(drop=True)


def indicadores(ops: pd.DataFrame, ordens: pd.DataFrame | None, conf_ap: pd.DataFrame | None, ini, fim,
                hoje: pd.Timestamp | None = None) -> dict[str, float | None]:
    """Execução no período [ini, fim] pela data programada (operações) e pela data-base (ordens)."""
    hoje = (hoje or pd.Timestamp.now()).normalize()
    r: dict[str, float | None] = {}
    vivas = ops[ops["Situação"] != CANCELADA] if len(ops) else ops
    per = vivas[_entre(vivas["Início"], ini, fim)] if len(vivas) else vivas
    devidas = per[per["Início"] <= hoje] if len(per) else per
    feitas = devidas[devidas["Concluída"]] if len(devidas) else devidas
    r["programadas"] = float(len(per))
    r["devidas"] = float(len(devidas))
    r["executadas"] = float(len(feitas))
    r["atrasadas"] = float((devidas["Situação"] == ATRASADA).sum()) if len(devidas) else 0.0
    r["taxa_execucao"] = len(feitas) / len(devidas) * 100 if len(devidas) else None
    # quem fez e horas reais só existem onde a IW47 cobre: compara dentro dessa janela
    if conf_ap is not None and len(conf_ap) and conf_ap["Data"].notna().any() and len(feitas):
        j_ini, j_fim = conf_ap["Data"].min(), conf_ap["Data"].max()
        na_janela = feitas[_entre(feitas["Fim real"].fillna(feitas["Início"]), j_ini, j_fim)]
        r["janela_iw47"] = (j_ini, j_fim)
    else:
        na_janela = feitas.iloc[0:0] if len(feitas) else feitas
        r["janela_iw47"] = None
    r["rastreadas"] = (float(na_janela["Com apontamento"].sum()) / len(na_janela) * 100) if len(na_janela) else None
    r["hh_programadas"] = float(devidas["Horas"].sum()) if len(devidas) else 0.0
    r["hh_executadas_plan"] = float(na_janela["Horas"].sum()) if len(na_janela) else 0.0
    r["hh_reais"] = float(na_janela["HH real"].fillna(0).sum()) if len(na_janela) else 0.0
    r["aderencia_hh"] = (r["hh_reais"] / r["hh_executadas_plan"] * 100) if r["hh_executadas_plan"] else None
    dias = feitas["Dias após a programação"].dropna() if len(feitas) else pd.Series(dtype=float)
    r["dias_apos_programacao"] = float(dias.mean()) if len(dias) else None
    if ordens is not None and len(ordens):
        o = ordens[(ordens["Situação"] != "Cancelada") & _entre(ordens["Data"], ini, fim) & (ordens["Data"] <= hoje)]
        r["ordens_devidas"] = float(len(o))
        r["ordens_concluidas"] = float((o["Situação"] == "Concluída").sum())
        r["taxa_ordens"] = r["ordens_concluidas"] / len(o) * 100 if len(o) else None
    else:
        r["ordens_devidas"] = r["ordens_concluidas"] = 0.0
        r["taxa_ordens"] = None
    if conf_ap is not None and len(conf_ap):
        a = conf_ap[_entre(conf_ap["Data"], ini, fim)]
        r["pessoas"] = float(a["Nº pessoal"].nunique())
        r["hh_apontadas"] = float(a["Horas"].sum())
    else:
        r["pessoas"] = r["hh_apontadas"] = None
    return r


def semanal(ops: pd.DataFrame, ini, fim, hoje: pd.Timestamp | None = None) -> pd.DataFrame:
    """Por semana (segunda a domingo) da data programada: programadas, executadas e taxa."""
    hoje = (hoje or pd.Timestamp.now()).normalize()
    vivas = ops[(ops["Situação"] != CANCELADA) & _entre(ops["Início"], ini, fim)] if len(ops) else ops
    if not len(vivas):
        return pd.DataFrame(columns=["Semana", "Programadas", "Executadas", "Taxa"])
    v = vivas.assign(Semana=vivas["Início"] - pd.to_timedelta(vivas["Início"].dt.dayofweek, unit="D"))
    g = v.groupby("Semana")
    s = pd.DataFrame({"Programadas": g.size(), "Executadas": g["Concluída"].sum()}).reset_index()
    devidas = v[v["Início"] <= hoje].groupby("Semana")
    taxa = (devidas["Concluída"].sum() / devidas.size() * 100).rename("Taxa")
    return s.merge(taxa, left_on="Semana", right_index=True, how="left")


def por_pessoa(conf_ap: pd.DataFrame, ops: pd.DataFrame, equipe: pd.DataFrame | None, ini, fim) -> pd.DataFrame:
    """Quem fez o quê no período (pela data do apontamento): HH, ordens, operações e % em plano."""
    if conf_ap is None or not len(conf_ap):
        return pd.DataFrame(columns=["Nº pessoal", "Pessoa", "HH apontadas", "Ordens", "Operações"])
    a = conf_ap[_entre(conf_ap["Data"], ini, fim)].copy()
    if not len(a):
        return pd.DataFrame(columns=["Nº pessoal", "Pessoa", "HH apontadas", "Ordens", "Operações"])
    plano = ops.drop_duplicates("Ordem").set_index("Ordem")["Com plano"] if len(ops) else pd.Series(dtype=bool)
    a["Em plano"] = a["Ordem"].map(plano)
    a["h_plano"] = a["Horas"].where(a["Em plano"] == True, 0.0)  # noqa: E712 — NaN (fora do IW38OP) não conta
    a["h_conh"] = a["Horas"].where(a["Em plano"].notna(), 0.0)
    a["chave_op"] = a["Ordem"] + "/" + a["Op"]
    g = a.groupby("Nº pessoal")
    t = pd.DataFrame({
        "Pessoa": g["Pessoa"].first(), "HH apontadas": g["Horas"].sum(), "Ordens": g["Ordem"].nunique(),
        "Operações": g["chave_op"].nunique(), "Dias com apontamento": g["Data"].nunique(),
        "Último apontamento": g["Data"].max(),
        "% HH em plano": g["h_plano"].sum() / g["h_conh"].sum().where(g["h_conh"].sum() > 0) * 100,
        "Centro (mais apontado)": g["Centro de trabalho"].agg(lambda s: s.mode().iat[0] if len(s.mode()) else ""),
    }).reset_index()
    if equipe is not None and len(equipe):
        t = t.merge(equipe[["Nº pessoal", "Cargo", "Área", "Turma"]], on="Nº pessoal", how="left")
    for c in ["Cargo", "Área", "Turma"]:
        t[c] = t[c].fillna("") if c in t else ""
    return t.sort_values("HH apontadas", ascending=False).reset_index(drop=True)
