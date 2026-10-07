"""Execução das atividades (IW38OP × IW38 × IW47) com dados fictícios conferíveis à mão."""

from datetime import date

import pandas as pd
import pytest

from central import execucao as ex

HOJE = pd.Timestamp("2026-06-30")
T = pd.Timestamp


def _oper():
    return pd.DataFrame({
        "Ordem": ["1", "1", "2", "3", "4", "5"],
        "Operação": ["0010", "0020", "0010", "0010", "0010", "0010"],
        "Texto da operação": ["Trocar", "Testar", "Lubrificar", "Inspecionar", "Ajustar", "Futura"],
        "Centro de trabalho": ["MEC", "MEC", "ELE", "MEC", "ELE", "MEC"],
        "Horas": [2.0, 1.0, 4.0, 3.0, 1.0, 5.0],
        "Início": [T("2026-06-01"), T("2026-06-01"), T("2026-06-10"), T("2026-06-15"), T("2026-06-20"), T("2026-07-10")],
        "Fim real": [T("2026-06-02"), T("2026-06-03"), T("2026-06-12"), pd.NaT, pd.NaT, pd.NaT],
        "Concluída": [True, True, True, False, False, False],
        "Cancelada": [False, False, False, False, True, False],
        "Pessoas": [1, 2, 1, 1, 1, 1],          # o IW38OP já tem esta coluna (pessoas previstas)
    })


def _ordens():
    return pd.DataFrame({"Ordem": ["1", "2", "3", "4", "5"],
                         "Com plano": [True, False, True, True, True],
                         "Situação": ["Concluída", "Concluída", "Liberada", "Cancelada", "Aberta"],
                         "Data": [T("2026-06-01"), T("2026-06-10"), T("2026-06-15"), T("2026-06-20"), T("2026-07-10")],
                         "Localização": ["GAL1"] * 5, "Texto": ["a", "b", "c", "d", "e"], "Natureza": [""] * 5})


def _conf():
    return pd.DataFrame({"Nº pessoal": ["10", "20", "10", "30"],
                         "Nome": ["", "", "", ""],
                         "Ordem": ["1", "1", "2", "9"],
                         "Operação": ["10", "0010", "0010", "0010"],     # zeros à esquerda diferentes
                         "Data": [T("2026-06-02"), T("2026-06-02"), T("2026-06-12"), T("2026-06-20")],
                         "Horas": [1.5, 1.0, 3.0, 2.0],
                         "Centro de trabalho": ["MEC", "MEC", "ELE", "MEC"]})


EQUIPE = pd.DataFrame({"Nº pessoal": ["10", "20"], "Nome": ["ANA", "BRUNO"], "Cargo": ["MECANICO", "ELETRICISTA"],
                       "Área": ["X", "X"], "Turma": ["1ª", "2ª"]})


def test_quem_fez_cada_operacao():
    ops = ex.operacoes(_oper(), _ordens(), _conf(), EQUIPE, HOJE).set_index(["Ordem", "Operação"])
    assert ops.loc[("1", "0010"), "Executado por"] == "ANA, BRUNO" and ops.loc[("1", "0010"), "HH real"] == 2.5
    assert ops.loc[("1", "0010"), "Situação"] == ex.EXECUTADA and ops.loc[("1", "0010"), "Executantes"] == 2
    assert ops.loc[("1", "0020"), "Situação"] == ex.EXECUTADA            # ordem CONF + ENTE, sem linha na IW47
    assert not ops.loc[("1", "0020"), "Com apontamento"]
    assert ops.loc[("2", "0010"), "Executado por"] == "ANA"
    assert ops.loc[("3", "0010"), "Situação"] == ex.ATRASADA
    assert ops.loc[("4", "0010"), "Situação"] == ex.CANCELADA
    assert ops.loc[("5", "0010"), "Situação"] == ex.PROGRAMADA
    assert ops.loc[("2", "0010"), "Dias após a programação"] == 2


def test_indicadores_de_execucao():
    ops = ex.operacoes(_oper(), _ordens(), _conf(), EQUIPE, HOJE)
    ap = ex.apontamentos(_conf(), EQUIPE)
    r = ex.indicadores(ops, _ordens(), ap, date(2026, 6, 1), date(2026, 7, 31), HOJE)
    # programadas no período (sem a cancelada): 1/10, 1/20, 2/10, 3/10, 5/10 → devidas até hoje: 4; executadas: 3
    assert r["programadas"] == 4 + 1 and r["devidas"] == 4 and r["executadas"] == 3 and r["atrasadas"] == 1
    assert r["taxa_execucao"] == pytest.approx(75)
    assert r["rastreadas"] == pytest.approx(200 / 3)                      # 1/20 sem apontamento
    assert r["janela_iw47"] == (T("2026-06-02"), T("2026-06-20"))
    assert r["hh_programadas"] == 10 and r["hh_executadas_plan"] == 7 and r["hh_reais"] == 5.5
    assert r["aderencia_hh"] == pytest.approx(5.5 / 7 * 100)
    # ordens: devidas até hoje sem canceladas → 1, 2, 3; concluídas 1, 2
    assert r["taxa_ordens"] == pytest.approx(200 / 3)
    assert r["pessoas"] == 3 and r["hh_apontadas"] == 7.5


def test_semanal_e_por_pessoa():
    ops = ex.operacoes(_oper(), _ordens(), _conf(), EQUIPE, HOJE)
    s = ex.semanal(ops, date(2026, 6, 1), date(2026, 7, 31), HOJE).set_index("Semana")
    assert s.loc[T("2026-06-01"), "Programadas"] == 2 and s.loc[T("2026-06-01"), "Taxa"] == 100
    assert s.loc[T("2026-06-15"), "Taxa"] == 0
    assert pd.isna(s.loc[T("2026-07-06"), "Taxa"])                       # semana futura não tem taxa
    p = ex.por_pessoa(ex.apontamentos(_conf(), EQUIPE), ops, EQUIPE, date(2026, 6, 1), date(2026, 6, 30))
    p = p.set_index("Nº pessoal")
    assert p.loc["10", "Pessoa"] == "ANA" and p.loc["10", "HH apontadas"] == 4.5 and p.loc["10", "Ordens"] == 2
    assert p.loc["10", "% HH em plano"] == pytest.approx(1.5 / 4.5 * 100)  # ordem 1 tem plano, 2 não
    assert p.loc["30", "Pessoa"] == "30"                                  # sem cadastro: a matrícula
    assert pd.isna(p.loc["30", "% HH em plano"])                          # ordem fora do IW38OP


def test_sem_dados():
    vazio = ex.operacoes(None, None, None)
    r = ex.indicadores(vazio, None, None, date(2026, 6, 1), date(2026, 6, 30), HOJE)
    assert r["taxa_execucao"] is None and r["taxa_ordens"] is None and r["pessoas"] is None


def test_rastreabilidade_so_na_janela_da_iw47():
    """Executada antes do primeiro apontamento da IW47 não conta como "sem apontamento"."""
    oper = _oper()
    oper.loc[1, "Fim real"] = T("2026-05-20")                             # 1/20 terminou antes da IW47 começar
    ops = ex.operacoes(oper, _ordens(), _conf(), EQUIPE, HOJE)
    r = ex.indicadores(ops, _ordens(), ex.apontamentos(_conf(), EQUIPE), date(2026, 5, 1), date(2026, 7, 31), HOJE)
    assert r["rastreadas"] == pytest.approx(100) and r["hh_executadas_plan"] == 6


def test_status_da_iw47_e_conf_contam_como_executada():
    """A IW47 exportada depois já traz CONF ENTE; CONF sem linha na IW47 é confirmada no SAP."""
    oper = _oper()
    oper["Status sistema"] = ["CONF ENTE", "CONF ENTE", "CONF ENTE", "LIB", "LIB", "ELIM ENTE"]
    oper.loc[5, "Concluída"] = True
    conf = _conf()
    conf["Status sistema"] = "CONF LIB"
    conf = pd.concat([conf, pd.DataFrame({"Nº pessoal": ["20"], "Nome": [""], "Ordem": ["3"], "Operação": ["0010"],
                                          "Data": [T("2026-06-25")], "Horas": [2.0], "Centro de trabalho": ["MEC"],
                                          "Status sistema": ["CONF ENTE"]})], ignore_index=True)
    ops = ex.operacoes(oper, _ordens(), conf, EQUIPE, HOJE).set_index(["Ordem", "Operação"])
    assert ops.loc[("1", "0020"), "Situação"] == ex.EXECUTADA            # CONF no IW38OP, sem linha na IW47
    assert ops.loc[("3", "0010"), "Situação"] == ex.EXECUTADA            # LIB no IW38OP, CONF ENTE na IW47
    assert ops.loc[("3", "0010"), "Fim real"] == T("2026-06-25")         # fim real = último apontamento
    assert ops.loc[("5", "0010"), "Situação"] == ex.CANCELADA            # operação eliminada (ELIM)
    r = ex.indicadores(ops.reset_index(), _ordens(), ex.apontamentos(conf, EQUIPE), date(2026, 6, 1),
                       date(2026, 7, 31), HOJE)
    assert r["taxa_ordens"] == pytest.approx(100)                         # ordem 3 encerrada pela IW47


def test_encerrada_sem_confirmacao_pela_ordem():
    oper = _oper()
    oper.loc[3, "Concluída"] = False
    ordens = _ordens()
    ordens.loc[2, "Situação"] = "Encerrada sem confirmação"             # ordem 3: ENTE sem CONF
    ops = ex.operacoes(oper, ordens, None, EQUIPE, HOJE).set_index(["Ordem", "Operação"])
    assert ops.loc[("3", "0010"), "Situação"] == ex.SEM_APONTAMENTO == "Encerrada sem confirmação"
