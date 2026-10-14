"""MTBF e MTTR por tipo de ordem (dados fictícios) — as mesmas contas de web/testes/confiabilidade-tipos.test.ts."""

import pandas as pd

from central import confiabilidade_tipos as ct


def _ordens():
    d = pd.Timestamp
    return pd.DataFrame([
        {"Ordem": "1", "Tipo": "YM01", "Situação": "Concluída", "Equip. (chave)": "EQ1", "Início": d("2026-09-02"), "Entrada": pd.NaT, "Custo real": 100.0},
        {"Ordem": "2", "Tipo": "YM01", "Situação": "Liberada", "Equip. (chave)": "EQ1", "Início": pd.NaT, "Entrada": d("2026-09-10"), "Custo real": 50.0},
        {"Ordem": "3", "Tipo": "YM02", "Situação": "Concluída", "Equip. (chave)": "EQ2", "Início": d("2026-09-15"), "Entrada": pd.NaT, "Custo real": 0.0},
        {"Ordem": "4", "Tipo": "YM01", "Situação": "Cancelada", "Equip. (chave)": "EQ2", "Início": d("2026-09-15"), "Entrada": pd.NaT, "Custo real": 0.0},
        {"Ordem": "5", "Tipo": "YM11", "Situação": "Concluída", "Equip. (chave)": "EQ3", "Início": d("2026-09-20"), "Entrada": pd.NaT, "Custo real": 0.0},
        {"Ordem": "6", "Tipo": "YM01", "Situação": "Aberta", "Equip. (chave)": "", "Início": d("2026-09-20"), "Entrada": pd.NaT, "Custo real": 0.0},
    ])


def test_tipos_padrao_sem_quebra():
    disp = ct.tipos_disponiveis(_ordens())
    assert disp == ["YM01", "YM02", "YM11"]
    assert ct.tipos_escolhidos([], disp) == ["YM01", "YM02"]
    assert ct.tipos_escolhidos(["YM11", "XX"], disp) == ["YM11"]


def test_mtbf_mttr_por_tipo_e_equipamento():
    horas = pd.Series({"1": 2.0, "3": 4.0})
    ev = ct.eventos(_ordens(), ["YM01", "YM02"], horas)
    assert list(ev["Ordem"]) == ["1", "2", "3"]  # sem cancelada, sem equipamento vazio, sem YM11
    r = ct.resumir(ev, 30)
    assert r["Ordens"] == 3 and r["Equipamentos"] == 2
    assert r["MTBF (dias)"] == 20  # 30 × 2 ÷ 3
    assert r["MTTR (h)"] == 3  # (2 + 4) ÷ 2 ordens com horas
    assert round(r["Disponibilidade (%)"], 2) == round(480 / 483 * 100, 2)
    t = ct.por_tipo(ev, 30)
    assert list(t["Tipo"]) == ["YM01", "YM02"] and list(t["Ordens"]) == [2, 1]
    e = ct.por_equipamento(ev, 30)
    assert list(e["Equipamento"]) == ["EQ1", "EQ2"] and e.loc[0, "MTBF (dias)"] == 15 and e.loc[0, "MTTR (h)"] == 2
