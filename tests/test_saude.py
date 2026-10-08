"""Saúde dos ativos: penalidades, faixas, risco pela criticidade e universo de equipamentos (dados fictícios)."""

import pandas as pd

from central import saude

HOJE = pd.Timestamp("2026-10-07")


def _ordens(linhas):
    base = {"Situação": "Concluída", "Com plano": True, "Custo real": 0.0, "Atrasada": False, "Localização": "GAL1",
            "Centro de trabalho": "MEC_COMP", "Setor": "Componentes", "Objeto técnico": ""}
    return pd.DataFrame([{**base, **x} for x in linhas])


def test_equipamento_problematico_fica_critico_e_no_topo_da_fila():
    ordens = _ordens(
        [{"Ordem": f"1{i}", "Equip. (chave)": "E1", "Data": HOJE - pd.Timedelta(days=10 + i), "Com plano": False,
          "Custo real": 500.0, "Objeto técnico": "INJETORA 01"} for i in range(12)]           # 12 corretivas
        + [{"Ordem": f"2{i}", "Equip. (chave)": "E1", "Data": HOJE - pd.Timedelta(days=40), "Situação": "Aberta",
            "Atrasada": True, "Com plano": False} for i in range(5)]                           # 5 atrasadas
        + [{"Ordem": "30", "Equip. (chave)": "E2", "Data": HOJE - pd.Timedelta(days=20), "Objeto técnico": "PRENSA"}]
        + [{"Ordem": "40", "Equip. (chave)": "E3", "Data": HOJE - pd.Timedelta(days=500), "Custo real": 99999.0}]
        + [{"Ordem": "50", "Equip. (chave)": "E4", "Data": HOJE - pd.Timedelta(days=5), "Situação": "Cancelada"}])
    quebras = pd.DataFrame({"Equip. (chave)": ["E1", "E1", "E2"], "Reincidente": [False, True, False],
                            "Data": [HOJE - pd.Timedelta(days=60), HOJE - pd.Timedelta(days=40),
                                     HOJE - pd.Timedelta(days=400)]})                  # a do E2 é velha
    afs = pd.DataFrame({"Código SAP": ["E1"] * 10 + ["E2"], "Situação": ["Analisada no prazo"] * 10 + ["Cancelada"],
                        "Data da falha": [HOJE - pd.Timedelta(days=30)] * 11, "Duração da parada (h)": [2.0] * 11})
    chamadas = pd.DataFrame({"Equipamento": ["E1", "E1", "E5"], "Situação": ["Atrasada", "Atrasada", "Programada"]})
    anom = pd.DataFrame({"Equipamento": ["E1", "E1"], "Situação": ["Atrasada", "Atrasada"]})
    equip = pd.DataFrame({"Equipamento": ["E1", "E2", "E3", "E5"], "Denominação": ["INJETORA 01 UGB", "", "", ""],
                          "Código ABC": ["A", "C", "B", ""], "Desativado": [False, False, False, True]})
    t = saude.calcular(ordens, HOJE, quebras=quebras, afs=afs, chamadas=chamadas, anomalias=anom, equip=equip,
                       cad_eq={"E2": {"criticidade": "Alta"}})
    t = t.set_index("Código")
    assert set(t.index) == {"E1", "E2", "E3"}           # E4 só tem ordem cancelada; E5 está desativado no IH08
    e1 = t.loc["E1"]
    # quebras 2+1 reincidência ≥ 3, 10 falhas AF, 17 corretivas, 5 atrasadas, 2 preventivas, 2 anomalias atrasadas:
    # todos os contribuintes cheios, menos o custo (6.000 ÷ p95) → saúde só com o custo
    assert e1["Quebras"] == 2 and e1["Reincidências"] == 1 and e1["Falhas AF"] == 10
    assert e1["Corretivas"] == 17 and e1["Backlog atrasado"] == 5   # as 5 atrasadas também são sem plano and e1["Preventivas atrasadas"] == 2
    assert e1["Horas paradas (AF)"] == 20.0 and e1["Anomalias abertas"] == 2
    assert e1["Saúde"] <= 10 and e1["Faixa"] == saude.CRITICA and e1["Equipamento"] == "INJETORA 01 UGB"
    assert e1["Criticidade"] == "Alta" and e1["Risco"] == (100 - e1["Saúde"]) * 3
    e2 = t.loc["E2"]                                     # nada nos últimos 12 meses (a falha AF foi cancelada)
    assert e2["Saúde"] == 100 and e2["Faixa"] == saude.BOA and e2["Principal causa"] == "—"
    assert e2["Criticidade"] == "Alta"                   # o cadastro do site vence o ABC do IH08
    assert t.loc["E3", "Custo 12 meses"] == 0           # ordem de 500 dias atrás fica fora da janela
    assert list(t.index)[0] == "E1"                      # maior risco primeiro


def test_faixas_resumo_matriz_e_pesos():
    assert saude.faixa(80) == saude.BOA and saude.faixa(79) == saude.ATENCAO and saude.faixa(59) == saude.CRITICA
    assert sum(c.peso for c in saude.CONTRIBUINTES) == 100
    ordens = _ordens([{"Ordem": "1", "Equip. (chave)": "E1", "Data": HOJE, "Atrasada": True, "Situação": "Aberta"},
                      {"Ordem": "2", "Equip. (chave)": "E2", "Data": HOJE}])
    t = saude.calcular(ordens, HOJE)
    assert t.set_index("Código").loc["E1", "Saúde"] == 100 - 15 / 5   # 1 de 5 atrasadas × peso 15
    so_backlog = saude.calcular(ordens, HOJE, pesos={"backlog": 100, **{c.id: 0 for c in saude.CONTRIBUINTES
                                                                        if c.id != "backlog"}})
    assert so_backlog.set_index("Código").loc["E1", "Saúde"] == 80
    r = saude.resumo(t)
    assert r["ativos"] == 2 and r["criticos"] == 0 and r["boa_pct"] == 100
    m = saude.matriz(t)
    assert len(m) == len(saude.CRITICIDADES) * len(saude.FAIXAS) and m["Equipamentos"].sum() == 2
    assert saude.contribuicao(t.iloc[0])["Pontos perdidos"].sum() == 100 - t.iloc[0]["Saúde"]
    assert saude.calcular(ordens.iloc[0:0], HOJE).empty
