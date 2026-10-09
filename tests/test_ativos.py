"""Gestão de ativos: inventário, recomendação, resumo, Pareto e lacunas (dados fictícios)."""

import pandas as pd

from central import ativos

HOJE = pd.Timestamp("2026-10-09")


def _equip():
    return pd.DataFrame({"Equipamento": ["EQ1", "EQ2", "EQ3", "EQ9"],
                         "Denominação": ["Prensa 1", "Bomba 2", "Esteira 3", "Velha 9"],
                         "Localização": ["MONTAGEM", "UTILIDADES", "MONTAGEM", "MONTAGEM"],
                         "Código ABC": ["A", "B", "", "C"],
                         "Local de instalação": ["Linha 1", "Casa de bombas", "Linha 2", "Linha 1"],
                         "Desativado": [False, False, False, True]})


def _ordens():
    return pd.DataFrame({
        "Ordem": ["1", "2", "3", "4", "5"], "Equip. (chave)": ["EQ1", "EQ1", "EQ2", "EQ4", "EQ3"],
        "Objeto técnico": ["Prensa 1", "Prensa 1", "Bomba 2", "Compressor 4", "Esteira 3"],
        "Situação": ["Concluída", "Aberta", "Concluída", "Concluída", "Cancelada"],
        "Data": pd.to_datetime(["2026-03-01", "2026-09-01", "2026-05-01", "2024-01-01", "2026-06-01"]),
        "Custo real": [60000.0, 1000.0, 500.0, 900.0, 99999.0],
        "Com plano": [False, False, True, False, False], "Plano": ["", "", "PL2", "", ""],
        "Localização": ["MONTAGEM", "MONTAGEM", "UTILIDADES", "FORJA", "MONTAGEM"],
        "Local de instalação": ["Linha 1"] * 2 + ["Casa de bombas", "Ar comprimido", "Linha 2"],
        "Centro de trabalho": ["MEC", "MEC", "ELE", "MEC", "MEC"]})


def _cad():
    return {"EQ1": {"nome": "Prensa hidráulica 1", "criticidade": "Alta", "fabricante": "ACME", "modelo": "PH-200",
                    "ano_instalacao": 2010, "vida_util": 15, "valor_reposicao": 100000,
                    "garantia_ate": "2026-11-30", "materiais": ["M1", "M1", "M2"]},
            "EQ5": {"nome": "Exaustor novo", "criticidade": "Baixa", "situacao": "Reserva"}}


def _inv(**kw):
    return ativos.inventario(HOJE, equip=_equip(), ordens=_ordens(), cad_eq=_cad(), **kw).set_index("Código")


def test_universo_e_identificacao():
    t = _inv()
    assert sorted(t.index) == ["EQ1", "EQ2", "EQ3", "EQ4", "EQ5", "EQ9"]
    assert t.loc["EQ1", "Equipamento"] == "Prensa hidráulica 1"          # o nome do site vale
    assert t.loc["EQ4", "Equipamento"] == "Compressor 4"                 # só nas ordens
    assert t.loc["EQ1", "Origem"] == "SAP + site" and t.loc["EQ5", "Origem"] == "Site"
    assert t.loc["EQ4", "Origem"] == "SAP" and t.loc["EQ4", "Área"] == "FORJA"
    assert t.loc["EQ9", "Situação"] == ativos.DESATIVADO and t.loc["EQ5", "Situação"] == "Reserva"
    assert t.loc["EQ2", "Criticidade"] == "Média" and t.loc["EQ3", "Criticidade"] == ""


def test_custo_ciclo_de_vida_e_recomendacao():
    t = _inv()
    eq1 = t.loc["EQ1"]
    assert eq1["Custo 12 meses"] == 61000 and eq1["Ordens pendentes"] == 1
    assert eq1["Idade (anos)"] == 16 and eq1["Vida restante (anos)"] == -1
    assert eq1["Custo ÷ reposição %"] == 61 and eq1["Peças vinculadas"] == 2
    assert eq1["Garantia"] == f"Vence em {ativos.AVISO_GARANTIA_DIAS} dias"
    assert eq1["Recomendação"] == ativos.SUBSTITUIR
    assert t.loc["EQ3", "Custo 12 meses"] == 0                          # ordem cancelada não conta
    assert t.loc["EQ2", "Coberto por plano"] and t.loc["EQ2", "Recomendação"] == ativos.MANTER
    assert t.loc["EQ3", "Recomendação"] == ativos.CLASSIFICAR
    assert t.loc["EQ9", "Recomendação"] == "—"


def test_plano_pela_ip19_e_quebras():
    ch = pd.DataFrame({"Equipamento": ["EQ1", "EQ1", "EQ3"], "Plano": ["P1", "P1", "P3"],
                       "Situação": ["Programada", "Atrasada", "Saltada/cancelada"]})
    q = pd.DataFrame({"Equip. (chave)": ["EQ2", "EQ2"], "Data": pd.to_datetime(["2026-02-01", "2026-08-01"])})
    t = _inv(chamadas=ch, quebras=q)
    assert t.loc["EQ1", "Planos preventivos"] == 1 and not t.loc["EQ3", "Coberto por plano"]
    assert t.loc["EQ2", "Quebras 12 meses"] == 2 and t.loc["EQ2", "MTBF (dias)"] == 182


def test_criticos_sem_plano_pedem_plano():
    cad = {"EQ1": {"criticidade": "Alta"}}
    t = ativos.inventario(HOJE, equip=_equip(), ordens=_ordens(), cad_eq=cad).set_index("Código")
    assert t.loc["EQ1", "Recomendação"] == ativos.CRIAR_PLANO


def test_resumo_pareto_e_lacunas():
    t = _inv().reset_index()
    r = ativos.resumo(t)
    assert r["ativos"] == 5 and r["desativados"] == 1 and r["alta"] == 1
    assert r["cobertura_criticos"] == 50 and r["substituir"] == 1 and r["garantia_vencendo"] == 1
    p = ativos.pareto_custo(t)
    assert list(p["Código"])[:2] == ["EQ1", "EQ2"] and round(p["% acumulado"].iloc[-1]) == 100
    c = ativos.completude(t).set_index("Informação")
    assert c.loc["Valor de reposição", "Faltando"] == 4 and c.loc["Criticidade", "Faltando"] == 2


def test_sem_bases():
    assert not len(ativos.inventario(HOJE))
    t = ativos.inventario(HOJE, cad_eq={"X1": {"nome": "Só no site"}, "lixo": "não é dict"})
    assert list(t["Código"]) == ["X1"] and t["Recomendação"].iloc[0] == ativos.CLASSIFICAR
