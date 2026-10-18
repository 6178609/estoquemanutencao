"""Gerenciador de HH: disponibilidade de cada pessoa da equipe (cadastro da Gestão de HH) para a manutenção.

O que fica gravado (cadastro `hh_disponibilidade.json` na pasta do app), por matrícula:
- jornada: horas por semana (vazio = a jornada padrão de Metas e parâmetros);
- percentual: % da jornada disponível para manutenção (vazio = 100%);
- capacidade: se a pessoa conta na capacidade da equipe (vazio = regra pelo cargo: técnicos de execução sim,
  apoio/gestão e planejamento não);
- obs: observação livre;
- ausencias: [{id, tipo, de, ate, obs}] — férias, afastamento, treinamento… (datas inclusivas); treinamento também
  guarda titulo, horas (carga horária: tira só essas horas; 0 = EAD/fora do horário), entidade e validade;
- a própria pessoa (cadastro manual, no lugar da planilha): nome, cargo, centro, area, turma, supervisor, ativo.

Horas disponíveis no período = (jornada × dias ÷ 7 − horas das ausências) × percentual, nunca negativo; cada dia
corrido de ausência dentro do período tira jornada ÷ 7 (a mesma conta de dias corridos da jornada).

Pandas puro (testado em tests/test_hh_disponibilidade.py).
"""

from __future__ import annotations

from datetime import date

import pandas as pd

ARQ = "hh_disponibilidade.json"
TIPOS_AUSENCIA = ["Férias", "Afastamento (atestado / INSS)", "Treinamento", "Folga / compensação", "Licença",
                  "Cedido a outra área", "Outro"]
SEM_CAPACIDADE = ("Apoio / gestão", "Planejamento (GPM)")
COLUNAS = ["Nº pessoal", "Nome", "Cargo", "Especialidade", "Centro de trabalho", "Área", "Turma", "Jornada (h/sem)",
           "Disponível %", "Conta na capacidade", "Observação"]


def _num(v, padrao: float) -> float:
    try:
        x = float(v)
    except (TypeError, ValueError):
        return padrao
    return x if x == x else padrao          # NaN → padrão


def pessoas(equipe: pd.DataFrame | None, cad: dict | None, horas_semana: float) -> pd.DataFrame:
    """A equipe da planilha com a disponibilidade cadastrada (ou os padrões)."""
    if equipe is None or not len(equipe):
        return pd.DataFrame(columns=COLUNAS)
    cad = cad or {}
    t = equipe.copy()
    for c in ("Nome", "Cargo", "Especialidade", "Centro de trabalho", "Área", "Turma"):
        if c not in t:
            t[c] = ""
    info = t["Nº pessoal"].map(lambda m: cad.get(m) or {})
    t["Jornada (h/sem)"] = info.map(lambda i: _num(i.get("jornada"), horas_semana))
    t["Disponível %"] = info.map(lambda i: min(max(_num(i.get("percentual"), 100.0), 0.0), 100.0))
    padrao = ~t["Especialidade"].isin(SEM_CAPACIDADE)
    t["Conta na capacidade"] = [bool(i["capacidade"]) if isinstance(i.get("capacidade"), bool) else bool(p)
                                for i, p in zip(info, padrao)]
    t["Observação"] = info.map(lambda i: str(i.get("obs") or ""))
    return t[COLUNAS].reset_index(drop=True)


def ausencias(cad: dict | None) -> pd.DataFrame:
    """Todas as ausências cadastradas, uma por linha."""
    linhas = []
    for mat, info in (cad or {}).items():
        if not isinstance(info, dict):
            continue
        for a in info.get("ausencias") or []:
            de, ate = pd.to_datetime(a.get("de"), errors="coerce"), pd.to_datetime(a.get("ate"), errors="coerce")
            if pd.isna(de):
                continue
            h = _num(a.get("horas"), float("nan")) if a.get("horas") not in (None, "") else float("nan")
            linhas.append({"Nº pessoal": mat, "id": a.get("id", ""), "Tipo": a.get("tipo", "Outro"), "De": de,
                           "Até": ate if pd.notna(ate) and ate >= de else de, "Obs": a.get("obs", ""),
                           "Treinamento": a.get("titulo", ""), "Horas": h if h == h and h >= 0 else float("nan"),
                           "Entidade": a.get("entidade", ""),
                           "Validade": pd.to_datetime(a.get("validade"), errors="coerce")})
    return pd.DataFrame(linhas, columns=["Nº pessoal", "id", "Tipo", "De", "Até", "Obs", "Treinamento", "Horas", "Entidade",
                                         "Validade"])


def dias_ausente(cad: dict | None, ini, fim) -> dict[str, int]:
    """{matrícula: dias corridos de ausência dentro de [ini, fim]} — ausências sobrepostas não contam em dobro.
    Ausência com carga horária (treinamento parcial) não tira o dia inteiro: conta em horas_parciais."""
    aus = ausencias(cad)
    ini, fim = pd.Timestamp(ini).normalize(), pd.Timestamp(fim).normalize()
    if not len(aus):
        return {}
    aus = aus[(aus["Até"] >= ini) & (aus["De"] <= fim) & aus["Horas"].isna()]
    saida = {}
    for mat, g in aus.groupby("Nº pessoal"):
        cobertos = set()
        for de, ate in zip(g["De"], g["Até"]):
            cobertos |= set(pd.date_range(max(de.normalize(), ini), min(ate.normalize(), fim), freq="D"))
        saida[mat] = len(cobertos)
    return saida


def horas_parciais(cad: dict | None, ini, fim) -> dict[str, float]:
    """{matrícula: horas das ausências com carga horária dentro de [ini, fim]}, proporcional aos dias no período
    (um curso de 16 h em 2 dias tira 8 h de cada dia); carga 0 (EAD, fora do horário) não tira HH."""
    aus = ausencias(cad)
    ini, fim = pd.Timestamp(ini).normalize(), pd.Timestamp(fim).normalize()
    saida: dict[str, float] = {}
    if not len(aus):
        return saida
    aus = aus[aus["Horas"].notna() & (aus["Horas"] > 0) & (aus["Até"] >= ini) & (aus["De"] <= fim)]
    for mat, de, ate, h in zip(aus["Nº pessoal"], aus["De"], aus["Até"], aus["Horas"]):
        de, ate = de.normalize(), ate.normalize()
        dentro = (min(ate, fim) - max(de, ini)).days + 1
        saida[mat] = saida.get(mat, 0.0) + h * dentro / ((ate - de).days + 1)
    return saida


def disponibilidade(pes: pd.DataFrame, cad: dict | None, ini, fim) -> pd.DataFrame:
    """Horas por pessoa no período [ini, fim] (inclusivo): da jornada, de ausência e disponíveis."""
    dias = (pd.Timestamp(fim).normalize() - pd.Timestamp(ini).normalize()).days + 1
    t = pes.copy()
    if not len(t) or dias <= 0:
        return t.assign(**{"Horas brutas": 0.0, "Dias ausente": 0, "Horas ausente": 0.0, "Horas disponíveis": 0.0})
    t["Horas brutas"] = t["Jornada (h/sem)"] * dias / 7
    t["Dias ausente"] = t["Nº pessoal"].map(dias_ausente(cad, ini, fim)).fillna(0).astype(int)
    parc = t["Nº pessoal"].map(horas_parciais(cad, ini, fim)).fillna(0.0)
    t["Horas ausente"] = (t["Jornada (h/sem)"] * t["Dias ausente"] / 7 + parc).clip(upper=t["Horas brutas"])
    t["Horas disponíveis"] = (t["Horas brutas"] - t["Horas ausente"]).clip(lower=0) * t["Disponível %"] / 100
    return t


def horas_disponiveis(pes: pd.DataFrame, cad: dict | None, ini, fim) -> float:
    """Soma das horas disponíveis de quem conta na capacidade."""
    if not len(pes):
        return 0.0
    d = disponibilidade(pes[pes["Conta na capacidade"]], cad, ini, fim)
    return float(d["Horas disponíveis"].sum()) if len(d) else 0.0


def por_centro(pes: pd.DataFrame, cad: dict | None, ini, fim) -> dict[str, tuple[float, int]]:
    """{centro: (horas disponíveis, técnicos)} de quem conta na capacidade."""
    if not len(pes):
        return {}
    d = disponibilidade(pes[pes["Conta na capacidade"]], cad, ini, fim)
    if not len(d):
        return {}
    g = d.groupby("Centro de trabalho")
    return {c: (float(h), int(n)) for c, h, n in zip(g.size().index, g["Horas disponíveis"].sum(), g.size())}


def ausentes_em(pes: pd.DataFrame, cad: dict | None, dia: date) -> pd.DataFrame:
    aus = ausencias(cad)
    if not len(aus):
        return aus
    d = pd.Timestamp(dia).normalize()
    a = aus[(aus["De"] <= d) & (aus["Até"] >= d)]
    return a.merge(pes[["Nº pessoal", "Nome", "Centro de trabalho"]], on="Nº pessoal", how="inner")
