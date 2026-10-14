"""MTBF e MTTR por tipo de ordem — a mesma conta da Confiabilidade (que vale só para a quebra: nota Y1 → ordem YM11),
aplicada às ordens do IW38 de outros tipos. Porta de web/lib/wcm/confiabilidadeTipos.ts (mesmas regras):

- Evento = ordem do tipo escolhido, não cancelada, com equipamento, pela data da ordem (início-base; sem ela, entrada).
- MTBF (dias) = dias do período × equipamentos com ordem ÷ ordens.
- MTTR (h) = média das horas de reparo das ordens que têm horas (IW47: HH ÷ pessoas; sem IW47, IW38OP).
- Disponibilidade (%) = MTBF·24 ÷ (MTBF·24 + MTTR).
"""

from __future__ import annotations

import pandas as pd

TIPO_QUEBRA = "YM11"
COLS = ["Ordem", "Tipo", "Equip. (chave)", "Objeto", "Data", "Horas de reparo", "Custo real"]


def eventos(ordens: pd.DataFrame | None, tipos: list[str] | set[str], horas: pd.Series) -> pd.DataFrame:
    """Ordens que viram evento (todas as datas)."""
    if ordens is None or not len(ordens):
        return pd.DataFrame(columns=COLS)
    o = ordens[ordens["Tipo"].isin(set(tipos)) & (ordens["Situação"] != "Cancelada")
               & (ordens["Equip. (chave)"].astype(str) != "")].copy()
    data = o["Início"] if "Início" in o else pd.Series(pd.NaT, index=o.index)
    if "Entrada" in o:
        data = data.fillna(o["Entrada"])
    o["Data"] = data.fillna(o["Data"]) if "Data" in o else data
    o = o[o["Data"].notna()].drop_duplicates("Ordem")
    h = o["Ordem"].map(horas)
    o["Horas de reparo"] = h.where(h > 0)
    o["Objeto"] = o["Objeto técnico"].astype(str) if "Objeto técnico" in o else ""
    o["Custo real"] = o["Custo real"] if "Custo real" in o else 0.0
    return o[COLS].sort_values("Data").reset_index(drop=True)


def resumir(ev: pd.DataFrame, dias: int) -> dict:
    n = len(ev)
    com = ev["Horas de reparo"].dropna()
    eq = ev["Equip. (chave)"].nunique() if n else 0
    mtbf = dias * eq / n if n and dias > 0 else None
    mttr = float(com.mean()) if len(com) else None
    return {"Ordens": n, "Equipamentos": eq, "MTBF (dias)": mtbf, "MTTR (h)": mttr,
            "Disponibilidade (%)": mtbf * 24 / (mtbf * 24 + mttr) * 100 if mtbf is not None and mttr is not None else None,
            "Horas de reparo": float(com.sum()), "Custo real": float(ev["Custo real"].fillna(0).sum()) if n else 0.0,
            "Ordens com horas (%)": len(com) / n * 100 if n else None}


def por_tipo(ev: pd.DataFrame, dias: int) -> pd.DataFrame:
    linhas = [{"Tipo": t, **resumir(g, dias)} for t, g in ev.groupby("Tipo")]
    df = pd.DataFrame(linhas, columns=["Tipo", *resumir(ev.iloc[0:0], 1).keys()])
    return df.sort_values(["Ordens", "Tipo"], ascending=[False, True]).reset_index(drop=True)


def por_equipamento(ev: pd.DataFrame, dias: int) -> pd.DataFrame:
    linhas = []
    for eq, g in ev.groupby("Equip. (chave)"):
        nome = next((x for x in g["Objeto"].astype(str) if x), "")
        linhas.append({"Equipamento": eq, "Nome": nome, "Tipos": ", ".join(sorted(g["Tipo"].unique())), **resumir(g, dias),
                       "Última ordem": g["Data"].max()})
    if not linhas:
        return pd.DataFrame(columns=["Equipamento", "Nome", "Tipos", *resumir(ev.iloc[0:0], 1).keys(), "Última ordem"])
    df = pd.DataFrame(linhas)
    return df.sort_values(["Ordens", "Horas de reparo", "Equipamento"], ascending=[False, False, True]).reset_index(drop=True)


def tipos_disponiveis(ordens: pd.DataFrame | None) -> list[str]:
    if ordens is None or not len(ordens) or "Tipo" not in ordens:
        return []
    o = ordens[(ordens["Situação"] != "Cancelada") & (ordens["Tipo"].astype(str) != "")]
    n = o["Tipo"].value_counts()
    return sorted(n.index, key=lambda t: (-n[t], t))


def tipos_escolhidos(pedidos: list[str], disponiveis: list[str]) -> list[str]:
    """Sem escolha, todos menos a quebra (YM11, que já está na aba Confiabilidade)."""
    ok = [t for t in pedidos if t in disponiveis]
    return ok or [t for t in disponiveis if t != TIPO_QUEBRA]
