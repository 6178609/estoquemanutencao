"""Preditiva SEMEQ: notas (detecção) × ordens (tratativa), com dados fictícios."""

from datetime import date

import pandas as pd
import pytest

from central import preditiva as pr

HOJE = pd.Timestamp("2026-09-30")
T = pd.Timestamp


def _notas():
    return pd.DataFrame({
        "Nota": ["n1", "n2", "n3", "n4"],
        "Descrição": ["SEMEQ-AVB-333-DESBALANCEAMENTO", "SEMEQ-AOL-118-CONTAMINAÇÃO", "SEMEQ-TMP-70-TEMPERATURA ELEVADA",
                      "TROCA DE CORREIA"],
        "Ordem": ["100", "", "", ""],
        "Data": [T("2026-08-01"), T("2026-08-10"), T("2026-09-20"), T("2026-09-01")],
        "Equip. (chave)": ["E1", "E2", "E1", "E3"], "Objeto técnico": ["MOTOR 1", "REDUTOR 2", "MOTOR 1", "X"],
        "Localização": ["GAL1"] * 4, "Centro de trabalho": ["MEC"] * 4,
    })


def _ordens():
    return pd.DataFrame({
        "Ordem": ["100", "200", "300", "400"],
        "Texto": ["SEMEQ-AVB-333-DESBALANCEAMENTO", "SEMEQ-AOL-118-CONTAMINACAO", "SEMEQ AVB 0050 FOLGA ROTATIVA",
                  "PREVENTIVA MOTOR"],
        "Data": [T("2026-08-02"), T("2026-08-12"), T("2026-09-01"), T("2026-09-01")],
        "Fim": [T("2026-08-20"), T("2026-10-10"), T("2026-10-30"), T("2026-09-05")],
        "Situação": ["Concluída", "Liberada", "Aberta", "Concluída"],
        "Tipo": ["YM14", "YM18", "YM14", "YM15"], "Custo real": [500.0, 0.0, 0.0, 10.0],
        "Equip. (chave)": ["E1", "E2", "E4", "E3"], "Objeto técnico": ["MOTOR 1", "REDUTOR 2", "BOMBA 4", "X"],
        "Localização": ["GAL1"] * 4, "Centro de trabalho": ["MEC"] * 4,
    })


def _oper():
    return pd.DataFrame({"Ordem": ["100"], "Concluída": [True], "Fim real": [T("2026-08-15")]})


def _conf():
    return pd.DataFrame({"Ordem": ["100", "100"], "Nº pessoal": ["10", "20"], "Horas": [2.0, 1.0]})


EQUIPE = pd.DataFrame({"Nº pessoal": ["10"], "Nome": ["ANA"]})


def test_anomalias_juntam_nota_e_ordem():
    a = pr.anomalias(_notas(), _ordens(), _oper(), _conf(), EQUIPE, HOJE).set_index("Código")
    assert set(a.index) == {"AVB-333", "AOL-118", "TMP-70", "AVB-50"}       # "TROCA DE CORREIA" não é SEMEQ
    # n1 → ordem 100 pelo campo Ordem; tratada; fim real do IW38OP; quem tratou pela IW47
    assert a.loc["AVB-333", "Nota"] == "n1" and a.loc["AVB-333", "Ordem"] == "100"
    assert a.loc["AVB-333", "Situação"] == pr.TRATADA and a.loc["AVB-333", "Dias para tratar"] == 14
    assert a.loc["AVB-333", "Tratado por"] == "ANA, 20" and a.loc["AVB-333", "HH apontadas"] == 3
    assert a.loc["AVB-333", "Técnica"] == "Análise de vibração"
    # n2 → ordem 200 pelo código no texto (acento diferente no achado não atrapalha)
    assert a.loc["AOL-118", "Ordem"] == "200" and a.loc["AOL-118", "Situação"] == pr.TRATATIVA
    assert a.loc["AOL-118", "Achado"] == "Contaminacao"
    assert a.loc["TMP-70", "Situação"] == pr.SEM_ORDEM and a.loc["TMP-70", "Dias em aberto"] == 10
    assert a.loc["AVB-50", "Nota"] == "" and a.loc["AVB-50", "Equipamento"] == "E4"   # só a ordem


def test_situacao_categorica_como_no_iw38():
    ordens = _ordens()
    ordens["Situação"] = ordens["Situação"].astype("category")
    a = pr.anomalias(_notas(), ordens, _oper(), _conf(), EQUIPE, HOJE)
    assert a.set_index("Código").loc["AVB-333", "Situação"] == pr.TRATADA


def test_atrasada_e_indicadores():
    ordens = _ordens()
    ordens.loc[1, "Fim"] = T("2026-09-01")                                  # ordem 200 vencida e não concluída
    a = pr.anomalias(_notas(), ordens, _oper(), _conf(), EQUIPE, HOJE)
    assert a.set_index("Código").loc["AOL-118", "Situação"] == pr.ATRASADA
    r = pr.indicadores(a, date(2026, 8, 1), date(2026, 9, 30))
    assert r["semeq_detectadas"] == 4
    assert r["semeq_com_ordem"] == pytest.approx(75) and r["semeq_tratadas"] == pytest.approx(25)
    assert r["semeq_abertas"] == 3 and r["semeq_atrasadas"] == 1 and r["semeq_dias"] == 14
    assert r["semeq_equipamentos"] == 3 and r["semeq_reincidentes"] == 1      # E1 com 2 anomalias
    assert r["semeq_custo"] == 500


def test_sem_dados():
    vazio = pr.anomalias(None, None)
    assert len(vazio) == 0
    r = pr.indicadores(vazio, date(2026, 8, 1), date(2026, 9, 30))
    assert r["semeq_detectadas"] == 0 and r["semeq_tratadas"] is None


def test_status_conf_ente_do_iw38op_e_da_iw47():
    """IW38 desatualizado: a IW47/IW38OP já trazem CONF ENTE → tratada; só ENTE sem CONF nem IW47 → sem confirmação."""
    ordens = _ordens()
    ordens["Status sistema"] = ["CONF ENTE", "LIB", "ENTE", "CONF ENTE"]
    ordens["Situação"] = ["Concluída", "Liberada", "Encerrada sem confirmação", "Concluída"]
    conf = pd.DataFrame({"Ordem": ["200"], "Nº pessoal": ["10"], "Horas": [1.0], "Operação": ["0010"],
                         "Data": [T("2026-09-10")], "Status sistema": ["CONF ENTE"]})
    a = pr.anomalias(_notas(), ordens, _oper(), conf, EQUIPE, HOJE).set_index("Código")
    assert a.loc["AOL-118", "Situação"] == pr.TRATADA                     # LIB no IW38, CONF ENTE na IW47
    assert a.loc["AOL-118", "Fim real"] == T("2026-09-10")                # fim = último apontamento
    assert a.loc["AVB-50", "Situação"] == pr.SEM_CONF                     # só ENTE, sem apontamento
    oper = pd.DataFrame({"Ordem": ["300"], "Concluída": [True], "Fim real": [T("2026-09-05")],
                         "Status sistema": ["CONF ENTE"]})
    b = pr.anomalias(_notas(), ordens, oper, conf, EQUIPE, HOJE).set_index("Código")
    assert b.loc["AVB-50", "Situação"] == pr.TRATADA                      # CONF ENTE na operação (IW38OP)
