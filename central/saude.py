"""Saúde dos ativos: índice de 0 a 100 por equipamento, no estilo do IBM Maximo Health / SAP APM.

Pandas puro (testado em tests/test_saude.py). Cada contribuinte vira uma penalidade de 0 a 1
(1 = pior caso) com um peso; saúde = 100 − Σ peso × penalidade. Os pesos somam 100.

- Eventos (quebras, falhas do Gerenciador de AF, demanda corretiva, custo): últimos 12 meses até hoje.
- Pendências (backlog atrasado, preventivas atrasadas, anomalias preditivas abertas): retrato de hoje.
- Risco = (100 − saúde) × peso da criticidade (Alta 3, Média 2, Baixa 1, sem classe 1,5): é a fila de
  ataque — saúde ruim em equipamento crítico vem primeiro.

Só entram equipamentos com alguma ordem, quebra ou chamada de plano no recorte (desativados no IH08 não).
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np
import pandas as pd


@dataclass(frozen=True)
class Contribuinte:
    id: str
    nome: str
    peso: float
    cheio: float | None      # valor que já dá a penalidade cheia (None = relativo à planta)
    regra: str


CONTRIBUINTES = [
    Contribuinte("quebras", "Quebras", 20, 3,
                 "Quebras (nota Y1 → ordem YM11) nos últimos 12 meses; reincidência (até 30 dias da anterior) conta em "
                 "dobro. 3 ou mais = penalidade cheia."),
    Contribuinte("falhas_af", "Falhas registradas (AF)", 20, 10,
                 "Falhas do Gerenciador de AF nos últimos 12 meses (pelo Código SAP do equipamento). 10 ou mais = cheia."),
    Contribuinte("corretivas", "Demanda corretiva", 15, 12,
                 "Ordens sem plano de manutenção (backlog/corretivas) dos últimos 12 meses. 12 ou mais = cheia."),
    Contribuinte("backlog", "Backlog atrasado", 15, 5,
                 "Ordens pendentes com o prazo (fim-base) vencido hoje. 5 ou mais = cheia."),
    Contribuinte("preventivas", "Preventivas atrasadas", 10, 2,
                 "Chamadas dos planos de manutenção (IP19) atrasadas hoje. 2 ou mais = cheia."),
    Contribuinte("preditiva", "Anomalias preditivas abertas", 10, 2,
                 "Anomalias SEMEQ em aberto hoje (atrasada conta 1, as demais 0,5). 2 ou mais = cheia."),
    Contribuinte("custo", "Custo de manutenção", 10, None,
                 "Custo real das ordens dos últimos 12 meses ÷ custo do equipamento no percentil 95 da planta "
                 "(acima dele = cheia)."),
]
POR_ID = {c.id: c for c in CONTRIBUINTES}

BOA, ATENCAO, CRITICA = "Boa", "Atenção", "Crítica"
FAIXAS = [CRITICA, ATENCAO, BOA]
LIMITES = {BOA: 80, ATENCAO: 60}            # saúde ≥ 80 boa; 60 a 79 atenção; abaixo de 60 crítica
COR_FAIXA = {BOA: "#0E9F46", ATENCAO: "#F2B705", CRITICA: "#E3262B"}
PESO_CRITICIDADE = {"Alta": 3.0, "Média": 2.0, "Baixa": 1.0, "": 1.5}
CRITICIDADES = ["Alta", "Média", "Baixa", "Sem classe"]
JANELA_DIAS = 365

COLUNAS = ["Código", "Equipamento", "Criticidade", "ABC", "Saúde", "Faixa", "Risco", "Principal causa",
           "Quebras", "Reincidências", "Falhas AF", "Horas paradas (AF)", "Corretivas", "Backlog atrasado",
           "Preventivas atrasadas", "Anomalias abertas", "Custo 12 meses", "Última falha", "Área", "Centro", "Setor"]


def faixa(saude: float) -> str:
    return BOA if saude >= LIMITES[BOA] else (ATENCAO if saude >= LIMITES[ATENCAO] else CRITICA)


def _moda_por(df: pd.DataFrame, chave: str, col: str, idx: pd.Index) -> pd.Series:
    """Valor mais frequente de `col` para cada `chave` (vetorizado; vazios não contam)."""
    if col not in df:
        return pd.Series("", index=idx)
    v = df[[chave, col]].astype({col: str})
    v = v[v[col] != ""]
    if not len(v):
        return pd.Series("", index=idx)
    cont = v.groupby([chave, col]).size().reset_index(name="n").sort_values([chave, "n"], ascending=[True, False])
    return cont.drop_duplicates(chave).set_index(chave)[col].reindex(idx).fillna("")


def calcular(ordens: pd.DataFrame, hoje: pd.Timestamp, *, quebras: pd.DataFrame | None = None,
             afs: pd.DataFrame | None = None, chamadas: pd.DataFrame | None = None,
             anomalias: pd.DataFrame | None = None, equip: pd.DataFrame | None = None,
             cad_eq: dict | None = None, pesos: dict[str, float] | None = None) -> pd.DataFrame:
    """Uma linha por equipamento com a saúde, a faixa, o risco e o valor de cada contribuinte.

    ordens: IW38 preparado (já no recorte de área/centro/tipo, todas as datas) · quebras: indicadores.quebras ·
    afs: Gerenciador de AF (af.preparar_afs) · chamadas: IP19 classificada (planos.classificar) ·
    anomalias: preditiva.anomalias · equip: IH08 (nome, ABC, desativado) · cad_eq: cadastro do site (criticidade)."""
    hoje = pd.Timestamp(hoje).normalize()
    desde = hoje - pd.Timedelta(days=JANELA_DIAS)
    pesos = {c.id: float((pesos or {}).get(c.id, c.peso)) for c in CONTRIBUINTES}
    cad_eq = cad_eq or {}
    validas = ordens[(ordens["Situação"] != "Cancelada") & (ordens["Equip. (chave)"] != "")]

    # universo: equipamentos com ordem (qualquer data), quebra ou chamada de plano no recorte
    universo = set(validas["Equip. (chave)"])
    q = quebras if quebras is not None and len(quebras) else None
    if q is not None:
        q = q[(q["Equip. (chave)"] != "") & (q["Data"] >= desde) & (q["Data"] <= hoje + pd.Timedelta(days=1))]
        universo |= set(q["Equip. (chave)"])
    ch = chamadas if chamadas is not None and len(chamadas) and "Equipamento" in chamadas else None
    if ch is not None:
        universo |= set(ch.loc[ch["Equipamento"] != "", "Equipamento"])
    if equip is not None and len(equip) and "Desativado" in equip:
        universo -= set(equip.loc[equip["Desativado"], "Equipamento"])
    universo.discard("")
    if not universo:
        return pd.DataFrame(columns=COLUNAS)
    idx = pd.Index(sorted(universo), name="Código")
    t = pd.DataFrame(index=idx)

    # eventos dos últimos 12 meses
    o12 = validas[(validas["Data"] >= desde) & (validas["Data"] <= hoje)]
    t["Corretivas"] = o12[~o12["Com plano"]].groupby("Equip. (chave)").size().reindex(idx, fill_value=0)
    t["Custo 12 meses"] = o12.groupby("Equip. (chave)")["Custo real"].sum().reindex(idx, fill_value=0.0)
    if q is not None:
        gq = q.groupby("Equip. (chave)")
        t["Quebras"] = gq.size().reindex(idx, fill_value=0)
        t["Reincidências"] = gq["Reincidente"].sum().reindex(idx, fill_value=0).astype(int)
        ult_q = gq["Data"].max().reindex(idx)
    else:
        t["Quebras"], t["Reincidências"], ult_q = 0, 0, pd.Series(pd.NaT, index=idx)
    if afs is not None and len(afs) and "Código SAP" in afs:
        a = afs[(afs["Situação"] != "Cancelada") & (afs["Código SAP"] != "") & (afs["Data da falha"] >= desde)
                & (afs["Data da falha"] <= hoje)]
        ga = a.groupby("Código SAP")
        t["Falhas AF"] = ga.size().reindex(idx, fill_value=0)
        horas = ga["Duração da parada (h)"].sum() if "Duração da parada (h)" in a else pd.Series(dtype=float)
        t["Horas paradas (AF)"] = horas.reindex(idx, fill_value=0.0)
        ult_a = ga["Data da falha"].max().reindex(idx)
    else:
        t["Falhas AF"], t["Horas paradas (AF)"], ult_a = 0, 0.0, pd.Series(pd.NaT, index=idx)
    t["Última falha"] = pd.concat([pd.to_datetime(ult_q), pd.to_datetime(ult_a)], axis=1).max(axis=1)

    # pendências de hoje
    pend = validas[validas["Atrasada"]] if "Atrasada" in validas else validas.iloc[0:0]
    t["Backlog atrasado"] = pend.groupby("Equip. (chave)").size().reindex(idx, fill_value=0)
    if ch is not None:
        t["Preventivas atrasadas"] = ch[ch["Situação"] == "Atrasada"].groupby("Equipamento").size().reindex(
            idx, fill_value=0)
    else:
        t["Preventivas atrasadas"] = 0
    if anomalias is not None and len(anomalias):
        from .preditiva import ABERTAS, ATRASADA

        ab = anomalias[anomalias["Situação"].isin(ABERTAS) & (anomalias["Equipamento"] != "")]
        t["Anomalias abertas"] = ab.groupby("Equipamento").size().reindex(idx, fill_value=0)
        carga_pred = ab.assign(_p=np.where(ab["Situação"] == ATRASADA, 1.0, 0.5)).groupby("Equipamento")["_p"].sum()
        carga_pred = carga_pred.reindex(idx, fill_value=0.0)
    else:
        t["Anomalias abertas"], carga_pred = 0, pd.Series(0.0, index=idx)

    # penalidades (0 a 1) e pontos perdidos
    custos_pos = t.loc[t["Custo 12 meses"] > 0, "Custo 12 meses"]
    ref_custo = max(float(custos_pos.quantile(0.95)) if len(custos_pos) else 0.0, 1000.0)
    brutos = {
        "quebras": (t["Quebras"] + t["Reincidências"]).astype(float),
        "falhas_af": t["Falhas AF"].astype(float),
        "corretivas": t["Corretivas"].astype(float),
        "backlog": t["Backlog atrasado"].astype(float),
        "preventivas": t["Preventivas atrasadas"].astype(float),
        "preditiva": carga_pred.astype(float),
        "custo": t["Custo 12 meses"].clip(lower=0).astype(float),
    }
    perdidos = pd.DataFrame(index=idx)
    for c in CONTRIBUINTES:
        cheio = c.cheio if c.cheio is not None else ref_custo
        perdidos[c.id] = (brutos[c.id] / cheio).clip(0, 1) * pesos[c.id]
    total_pesos = sum(pesos.values()) or 100.0
    t["Saúde"] = (100 - perdidos.sum(axis=1) * 100 / total_pesos).round(0).clip(0, 100)
    t["Faixa"] = t["Saúde"].map(faixa)
    nomes = {c.id: c.nome for c in CONTRIBUINTES}
    principal = perdidos.idxmax(axis=1).map(nomes)
    t["Principal causa"] = principal.where(perdidos.max(axis=1) > 0, "—")
    for c in CONTRIBUINTES:
        t[f"pts_{c.id}"] = perdidos[c.id].round(1)

    # cadastro: nome, criticidade, área e centro
    ref = equip.drop_duplicates("Equipamento").set_index("Equipamento") if equip is not None and len(equip) else None
    nome_o = validas.groupby("Equip. (chave)")["Objeto técnico"].first().reindex(idx)
    nome = ref["Denominação"].reindex(idx) if ref is not None and "Denominação" in ref else pd.Series("", index=idx)
    t["Equipamento"] = nome.where(nome.fillna("") != "", nome_o).fillna("")
    abc = ref["Código ABC"].reindex(idx).fillna("") if ref is not None and "Código ABC" in ref else pd.Series("", index=idx)
    t["ABC"] = abc
    abc_crit = {"A": "Alta", "B": "Média", "C": "Baixa"}
    t["Criticidade"] = [((cad_eq.get(k) or {}).get("criticidade") or abc_crit.get(a, "")) for k, a in zip(idx, abc)]
    t["Área"] = _moda_por(validas, "Equip. (chave)", "Localização", idx)
    t["Centro"] = _moda_por(validas, "Equip. (chave)", "Centro de trabalho", idx)
    t["Setor"] = _moda_por(validas, "Equip. (chave)", "Setor", idx)
    t["Risco"] = ((100 - t["Saúde"]) * t["Criticidade"].map(PESO_CRITICIDADE).fillna(1.5)).round(0)
    t = t.reset_index()
    pts = [f"pts_{c.id}" for c in CONTRIBUINTES]
    return t[COLUNAS + pts].sort_values(["Risco", "Saúde"], ascending=[False, True]).reset_index(drop=True)


def resumo(t: pd.DataFrame) -> dict:
    """Números do topo da página e do Painel."""
    if not len(t):
        return {"ativos": 0, "media": None, "criticos": 0, "criticos_alta": 0, "boa_pct": None}
    return {"ativos": len(t), "media": float(t["Saúde"].mean()), "criticos": int((t["Faixa"] == CRITICA).sum()),
            "criticos_alta": int(((t["Faixa"] == CRITICA) & (t["Criticidade"] == "Alta")).sum()),
            "atencao": int((t["Faixa"] == ATENCAO).sum()),
            "boa_pct": float((t["Faixa"] == BOA).mean() * 100)}


def matriz(t: pd.DataFrame) -> pd.DataFrame:
    """Criticidade × faixa de saúde (quantidade de equipamentos), com todas as combinações."""
    m = t.assign(Criticidade=t["Criticidade"].replace("", "Sem classe"))
    m = m.groupby(["Criticidade", "Faixa"]).size().reindex(
        pd.MultiIndex.from_product([CRITICIDADES, FAIXAS], names=["Criticidade", "Faixa"]), fill_value=0)
    return m.reset_index(name="Equipamentos")


def contribuicao(linha: pd.Series) -> pd.DataFrame:
    """Pontos que cada contribuinte tirou da saúde de um equipamento (para o gráfico da ficha)."""
    return pd.DataFrame([{"Contribuinte": c.nome, "Pontos perdidos": float(linha.get(f"pts_{c.id}", 0.0) or 0.0),
                          "Peso": c.peso} for c in CONTRIBUINTES])
