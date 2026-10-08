"""Programação semanal: semana, carga × capacidade, candidatos do backlog, encaixe na folga e aderência."""

import pandas as pd

from central import execucao as ex
from central import semanal as sem

HOJE = pd.Timestamp("2026-10-08")           # quinta-feira
SEG = pd.Timestamp("2026-10-05")


def _ops(linhas):
    base = {"Situação": ex.PROGRAMADA, "Concluída": False, "Fim real": pd.NaT, "Horas": 1.0, "Equipamento": "",
            "Situação da ordem": "Liberada", "Centro de trabalho": "MEC_COMP", "Operação": "0010"}
    return pd.DataFrame([{**base, **x} for x in linhas])


def test_semana_e_rotulos():
    assert sem.segunda(HOJE) == SEG and sem.segunda(SEG) == SEG
    assert sem.rotulo_semana(SEG, HOJE).endswith("esta semana")
    assert "próxima semana" in sem.rotulo_semana(SEG + pd.Timedelta(weeks=1), HOJE)
    assert len(sem.semanas_para_escolher(HOJE, 2, 3)) == 6


def test_carga_capacidade_e_folga():
    ops = _ops([{"Ordem": "1", "Início": SEG, "Horas": 30.0},
                {"Ordem": "2", "Início": SEG + pd.Timedelta(days=6), "Horas": 20.0, "Situação da ordem": "Aberta"},
                {"Ordem": "3", "Início": SEG + pd.Timedelta(days=7), "Horas": 99.0},            # semana seguinte
                {"Ordem": "4", "Início": SEG, "Horas": 99.0, "Situação": ex.CANCELADA},
                {"Ordem": "5", "Início": SEG + pd.Timedelta(days=2), "Horas": 10.0, "Centro de trabalho": "TERC"},
                {"Ordem": "6", "Início": SEG + pd.Timedelta(days=1), "Horas": 5.0, "Centro de trabalho": "ELE"}])
    prog = sem.programadas(ops, HOJE)
    assert sorted(prog["Ordem"]) == ["1", "2", "5", "6"]
    assert list(prog["Dia"])[:1] == ["Seg"] and prog.set_index("Ordem").loc["2", "Dia"] == "Dom"
    assert not prog.set_index("Ordem").loc["2", "Pronta"]
    equipe = pd.DataFrame({"Centro de trabalho": ["MEC_COMP"]})
    cap = sem.capacidade(["MEC_COMP", "TERC", "ELE"], equipe, 44.0, {"TERC": 8},
                         executadas=pd.DataFrame({"Centro de trabalho": ["ELE"] * 2, "Horas": [12.0, 12.0],
                                                  "Fim real": [SEG - pd.Timedelta(days=3)] * 2}), hoje=HOJE)
    cap = cap.set_index("Centro de trabalho")
    assert cap.loc["MEC_COMP", "Capacidade"] == 44 and cap.loc["TERC", "Origem"] == "configurada"
    assert cap.loc["ELE", "Capacidade"] == 2 and "média" in cap.loc["ELE", "Origem"]       # 24 h ÷ 12 semanas
    t = sem.carga_por_centro(prog, cap.reset_index()).set_index("Centro de trabalho")
    assert t.loc["MEC_COMP", "HH programadas"] == 50 and round(t.loc["MEC_COMP", "Carga %"]) == 114
    assert t.loc["TERC", "Folga (HH)"] == -2 and t.loc["MEC_COMP", "Prontas %"] == 50
    dia = sem.por_dia(prog).set_index("Centro de trabalho")
    assert dia.loc["MEC_COMP", "Seg"] == 30 and dia.loc["MEC_COMP", "Dom"] == 20 and list(dia.columns) == sem.DIAS


def test_candidatos_priorizam_liberada_e_risco_e_encaixam_na_folga():
    ops = _ops([{"Ordem": "10", "Início": SEG - pd.Timedelta(days=30), "Horas": 4.0, "Situação da ordem": "Aberta",
                 "Situação": ex.ATRASADA},
                {"Ordem": "11", "Início": SEG - pd.Timedelta(days=3), "Horas": 3.0, "Equipamento": "E1",
                 "Situação": ex.ATRASADA},
                {"Ordem": "12", "Início": SEG - pd.Timedelta(days=60), "Horas": 3.0, "Situação": ex.ATRASADA},
                {"Ordem": "13", "Início": SEG - pd.Timedelta(days=9), "Horas": 1.0, "Concluída": True},
                {"Ordem": "14", "Início": SEG + pd.Timedelta(days=1), "Horas": 1.0}])
    c = sem.candidatos(ops, SEG, criticidade={"E1": "Alta"}, risco={"E1": 150.0})
    assert list(c["Ordem"]) == ["11", "12", "10"]      # liberada e de maior risco, liberada antiga, não liberada
    assert c.set_index("Ordem").loc["12", "Dias de atraso"] == 60
    assert list(sem.encaixar(c, {"MEC_COMP": 6.5})) == [True, True, False]


def test_aderencia_conta_so_o_concluido_dentro_da_semana():
    s1 = SEG - pd.Timedelta(weeks=1)
    ops = _ops([{"Ordem": "1", "Início": s1, "Concluída": True, "Fim real": s1 + pd.Timedelta(days=2), "Horas": 3.0},
                {"Ordem": "2", "Início": s1, "Concluída": True, "Fim real": s1 + pd.Timedelta(days=9), "Horas": 1.0},
                {"Ordem": "3", "Início": s1 + pd.Timedelta(days=6), "Horas": 4.0},
                {"Ordem": "4", "Início": s1, "Situação": ex.CANCELADA, "Horas": 50.0},
                {"Ordem": "5", "Início": SEG, "Concluída": True, "Fim real": SEG, "Horas": 1.0}])   # semana atual fora
    a = sem.aderencia(ops, HOJE, semanas=4)
    assert len(a) == 1
    r = a.iloc[0]
    assert (r["Programadas"], r["Na semana"], r["Depois"], r["Pendentes"]) == (3, 1, 1, 1)
    assert round(r["Aderência %"], 1) == 33.3 and r["HH programadas"] == 8 and r["Aderência HH %"] == 37.5


def test_aderencia_ignora_semana_que_o_export_ainda_nao_cobre():
    s2, s1 = SEG - pd.Timedelta(weeks=2), SEG - pd.Timedelta(weeks=1)
    ops = _ops([{"Ordem": "1", "Início": s2, "Concluída": True, "Fim real": s2},
                {"Ordem": "2", "Início": s1, "Concluída": False}])
    # export de sábado (03/10): a semana de 28/09 a 04/10 ainda não acabou no arquivo
    a = sem.aderencia(ops, SEG + pd.Timedelta(weeks=1), semanas=4,
                      dados_ate=pd.Timestamp("2026-10-03 21:00", tz="UTC"))
    assert list(a["Semana"]) == [s2]
    # export de domingo: a semana entra
    assert len(sem.aderencia(ops, SEG + pd.Timedelta(weeks=1), semanas=4, dados_ate=pd.Timestamp("2026-10-04"))) == 2
