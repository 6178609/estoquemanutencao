"""Programação semanal: carga × capacidade por centro de trabalho, o que entra na semana, o que pode
completar a folga e a aderência à programação das semanas anteriores (SMRP "schedule compliance").

Pandas puro (testado em tests/test_semanal.py). Convenções:
- Semana de segunda a domingo; a atividade é a operação do IW38OP pela data programada (1ª data de início).
- Carga = trabalho planejado (HH) das operações não canceladas programadas na semana.
- Capacidade do centro (HH/semana): a configurada em Metas e parâmetros; sem ela, técnicos da Gestão de HH
  daquele centro × jornada semanal; sem equipe cadastrada, a média apontada (IW47) nas 12 semanas anteriores.
- Aderência da semana = operações programadas nela e concluídas até o domingo dela ÷ programadas
  (também em HH). Reprogramar a data no SAP move a operação de semana — por isso o histórico vale como tendência.
- Pronta para executar = ordem Liberada no SAP (Aberta ainda não foi liberada).
"""

from __future__ import annotations

import pandas as pd

from .execucao import CANCELADA
from .util import agora_local

DIAS = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"]
PESO_CRITICIDADE = {"Alta": 0, "Média": 1, "Baixa": 2}


def segunda(dia) -> pd.Timestamp:
    d = pd.Timestamp(dia).normalize()
    return d - pd.Timedelta(days=d.dayofweek)


def semanas_para_escolher(hoje, antes: int = 8, depois: int = 6) -> list[pd.Timestamp]:
    s = segunda(hoje)
    return [s + pd.Timedelta(weeks=k) for k in range(-antes, depois + 1)]


def rotulo_semana(seg: pd.Timestamp, hoje) -> str:
    seg = pd.Timestamp(seg)
    atual = segunda(hoje)
    sufixo = {0: " · esta semana", 1: " · próxima semana", -1: " · semana passada"}.get(
        int((seg - atual).days // 7), "")
    return f"Semana {seg.isocalendar().week:02d} · {seg:%d/%m} a {seg + pd.Timedelta(days=6):%d/%m/%Y}{sufixo}"


def _na_semana(serie: pd.Series, seg: pd.Timestamp) -> pd.Series:
    return (serie >= seg) & (serie < seg + pd.Timedelta(days=7))


def programadas(ops: pd.DataFrame, seg) -> pd.DataFrame:
    """Operações (não canceladas) com a data programada na semana, com o dia e se a ordem está liberada."""
    seg = segunda(seg)
    if ops is None or not len(ops):
        return pd.DataFrame(columns=["Dia", "Ordem", "Operação", "Horas", "Centro de trabalho", "Pronta"])
    w = ops[(ops["Situação"] != CANCELADA) & _na_semana(ops["Início"], seg)].copy()
    w["Dia"] = w["Início"].dt.dayofweek.map(dict(enumerate(DIAS)))
    sit = w["Situação da ordem"].astype(object) if "Situação da ordem" in w else pd.Series("", index=w.index)
    w["Pronta"] = sit.eq("Liberada") | w["Concluída"]
    return w.sort_values(["Início", "Centro de trabalho", "Ordem", "Operação"]).reset_index(drop=True)


def capacidade(centros: list[str], equipe: pd.DataFrame | None, horas_semana: float,
               configurada: dict[str, float] | None = None, executadas: pd.DataFrame | None = None,
               hoje=None) -> pd.DataFrame:
    """Capacidade semanal (HH) de cada centro e de onde ela veio."""
    hoje = pd.Timestamp(hoje or agora_local()).normalize()
    configurada = {k: float(v) for k, v in (configurada or {}).items() if k and v not in (None, "") and float(v) > 0}
    tec = equipe["Centro de trabalho"].value_counts() if equipe is not None and len(equipe) else pd.Series(dtype=int)
    media = pd.Series(dtype=float)
    if executadas is not None and len(executadas) and "Fim real" in executadas:
        recentes = executadas[(executadas["Fim real"] >= segunda(hoje) - pd.Timedelta(weeks=12))
                              & (executadas["Fim real"] < segunda(hoje))]
        media = recentes.groupby("Centro de trabalho")["Horas"].sum() / 12
    linhas = []
    for c in centros:
        if c in configurada:
            linhas.append({"Centro de trabalho": c, "Capacidade": configurada[c], "Origem": "configurada"})
        elif int(tec.get(c, 0)):
            linhas.append({"Centro de trabalho": c, "Capacidade": float(tec[c]) * horas_semana,
                           "Origem": f"{int(tec[c])} técnico(s) × {horas_semana:.0f} h"})
        elif float(media.get(c, 0.0) or 0.0) > 0:
            linhas.append({"Centro de trabalho": c, "Capacidade": float(media[c]),
                           "Origem": "média apontada (12 semanas)"})
        else:
            linhas.append({"Centro de trabalho": c, "Capacidade": None, "Origem": "sem capacidade cadastrada"})
    return pd.DataFrame(linhas, columns=["Centro de trabalho", "Capacidade", "Origem"])


def carga_por_centro(prog: pd.DataFrame, cap: pd.DataFrame) -> pd.DataFrame:
    """HH programadas × capacidade por centro (carga % > 100 = semana sobrecarregada)."""
    if not len(prog):
        return pd.DataFrame(columns=["Centro de trabalho", "HH programadas", "Operações", "Ordens", "Prontas %",
                                     "Capacidade", "Origem", "Carga %", "Folga (HH)"])
    g = prog.groupby("Centro de trabalho")
    t = pd.DataFrame({"HH programadas": g["Horas"].sum(), "Operações": g.size(), "Ordens": g["Ordem"].nunique(),
                      "Prontas %": g["Pronta"].mean() * 100}).reset_index()
    t = t.merge(cap, on="Centro de trabalho", how="left")
    t["Carga %"] = (t["HH programadas"] / t["Capacidade"] * 100).where(t["Capacidade"] > 0)
    t["Folga (HH)"] = (t["Capacidade"] - t["HH programadas"]).where(t["Capacidade"] > 0)
    return t.sort_values("HH programadas", ascending=False).reset_index(drop=True)


def por_dia(prog: pd.DataFrame) -> pd.DataFrame:
    """HH programadas por dia da semana e centro (para o quadro da semana)."""
    if not len(prog):
        return pd.DataFrame(columns=["Centro de trabalho", *DIAS])
    t = prog.pivot_table(index="Centro de trabalho", columns="Dia", values="Horas", aggfunc="sum", fill_value=0.0)
    return t.reindex(columns=DIAS, fill_value=0.0).reset_index()


def candidatos(ops: pd.DataFrame, seg, criticidade: dict[str, str] | None = None,
               risco: dict[str, float] | None = None) -> pd.DataFrame:
    """Operações atrasadas (programadas antes da semana e ainda abertas) para puxar para a folga da semana:
    ordem liberada primeiro, depois equipamento de maior risco/criticidade e a mais antiga."""
    seg = segunda(seg)
    if ops is None or not len(ops):
        return pd.DataFrame(columns=["Ordem", "Operação", "Horas", "Centro de trabalho", "Dias de atraso"])
    a = ops[(ops["Situação"] != CANCELADA) & ~ops["Concluída"] & ops["Início"].notna() & (ops["Início"] < seg)].copy()
    if not len(a):
        return a.assign(**{"Dias de atraso": pd.Series(dtype=int)})
    criticidade, risco = criticidade or {}, risco or {}
    eq = a["Equipamento"] if "Equipamento" in a else pd.Series("", index=a.index)
    a["Criticidade"] = eq.map(criticidade).fillna("")
    a["Risco do equipamento"] = eq.map(risco).fillna(0.0)
    sit = a["Situação da ordem"].astype(object) if "Situação da ordem" in a else pd.Series("", index=a.index)
    a["Pronta"] = sit.eq("Liberada")
    a["Dias de atraso"] = (seg - a["Início"]).dt.days
    a["_crit"] = a["Criticidade"].map(PESO_CRITICIDADE).fillna(3)
    a = a.sort_values(["Pronta", "Risco do equipamento", "_crit", "Dias de atraso"],
                      ascending=[False, False, True, False])
    return a.drop(columns="_crit").reset_index(drop=True)


def encaixar(cand: pd.DataFrame, folga: dict[str, float]) -> pd.Series:
    """Marca, na ordem de prioridade, as operações que cabem na folga do seu centro na semana."""
    resto = {k: float(v) for k, v in folga.items() if v and v > 0}
    cabe = []
    for ctr, h in zip(cand["Centro de trabalho"], cand["Horas"]):
        h = float(h or 0.0)
        if resto.get(ctr, 0.0) >= h > 0:
            resto[ctr] -= h
            cabe.append(True)
        else:
            cabe.append(False)
    return pd.Series(cabe, index=cand.index, dtype=bool)


def aderencia(ops: pd.DataFrame, ate, semanas: int = 12, dados_ate=None) -> pd.DataFrame:
    """Aderência à programação das `semanas` anteriores à semana de `ate` (exclusive). Só entram semanas que
    já terminaram até `dados_ate` (data do export do IW38OP): semana pela metade pareceria descumprida."""
    fim = segunda(ate)
    if dados_ate is not None and pd.notna(dados_ate):
        ts = pd.Timestamp(dados_ate)
        if ts.tzinfo is not None:
            ts = ts.tz_convert("America/Sao_Paulo").tz_localize(None)
        limite = ts.normalize() + pd.Timedelta(days=1)                         # o dia do export conta inteiro
        fim = min(fim, limite - pd.Timedelta(days=(limite.dayofweek % 7)))     # segunda após o último domingo completo
    fim = min(fim, segunda(agora_local()))
    cols = ["Semana", "Programadas", "Na semana", "Depois", "Pendentes", "Aderência %", "HH programadas",
            "HH na semana", "Aderência HH %"]
    if ops is None or not len(ops):
        return pd.DataFrame(columns=cols)
    ini = fim - pd.Timedelta(weeks=semanas)
    v = ops[(ops["Situação"] != CANCELADA) & (ops["Início"] >= ini) & (ops["Início"] < fim)].copy()
    if not len(v):
        return pd.DataFrame(columns=cols)
    v["Semana"] = v["Início"] - pd.to_timedelta(v["Início"].dt.dayofweek, unit="D")
    domingo = v["Semana"] + pd.Timedelta(days=7)
    v["_na"] = v["Concluída"] & v["Fim real"].notna() & (v["Fim real"] < domingo)
    v["_depois"] = v["Concluída"] & ~v["_na"]
    v["_h_na"] = v["Horas"].where(v["_na"], 0.0)
    g = v.groupby("Semana")
    t = pd.DataFrame({"Programadas": g.size(), "Na semana": g["_na"].sum(), "Depois": g["_depois"].sum(),
                      "HH programadas": g["Horas"].sum(), "HH na semana": g["_h_na"].sum()}).reset_index()
    t["Pendentes"] = t["Programadas"] - t["Na semana"] - t["Depois"]
    t["Aderência %"] = t["Na semana"] / t["Programadas"] * 100
    t["Aderência HH %"] = (t["HH na semana"] / t["HH programadas"] * 100).where(t["HH programadas"] > 0)
    return t[cols]
