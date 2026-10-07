"""Calendário de ordens (IW38 por dia e turno) com dados fictícios."""

from datetime import date

import pandas as pd

from central import calendario as cal

HOJE = pd.Timestamp("2026-10-07")
T = pd.Timestamp


def _ordens():
    return pd.DataFrame({
        "Ordem": ["1", "2", "3", "4"],
        "Data": [T("2026-10-05"), T("2026-10-05"), T("2026-10-08"), T("2026-10-06")],
        "Objeto técnico": ["CHILLER 04", "", "", "BOMBA"], "Local de instalação": ["", "CENTRAL DE FRESAS", "", ""],
        "Texto": ["LIMPEZA", "INSPEÇÃO", "TROCA DE ROLAMENTO", "X"], "Tipo": ["YM13", "YM15", "YM13", "YM13"],
        "Natureza": ["Plano de manutenção", "Backlog", "Plano de manutenção", "Plano de manutenção"],
        "Situação": ["Liberada", "Concluída", "Aberta", "Cancelada"], "Centro de trabalho": ["MEC", "ELE", "MEC", "MEC"],
    })


def _oper():
    return pd.DataFrame({"Ordem": ["1", "1", "2", "3"], "Horas": [2.0, 1.0, 0.5, 1.25], "Pessoas": [1, 2, 1, 1],
                         "Cancelada": [False, False, False, False]})


def _conf():
    return pd.DataFrame({"Ordem": ["1", "1", "2"], "Nº pessoal": ["10", "20", "10"], "Nome": ["", "", ""],
                         "Status sistema": ["CONF ENTE", "CONF ENTE", "CONF ENTE"]})


EQUIPE = pd.DataFrame({"Nº pessoal": ["10", "20"], "Nome": ["JOSIVAN GILDO DA SILVA", "ANA SOUZA"],
                       "Turma": ["1ª", "2ª"], "Área": ["AMARELA", "MONTAGEM"], "Cargo": ["ELETRICISTA LIDER", "MECANICO"]})


def test_agenda_por_dia_e_turno():
    a = cal.agenda(_ordens(), _oper(), _conf(), EQUIPE, HOJE)
    o1 = a[a["Ordem"] == "1"].set_index("Turno")
    assert set(o1.index) == {"1º turno", "2º turno"}                     # aparece no turno de cada turma
    assert o1.loc["1º turno", "Quem"] == "Josivan Gildo da Silva (AMA · Eletricista)"
    assert o1.loc["1º turno", "Título"] == "CHILLER 04" and o1.loc["1º turno", "Duração (h)"] == 3
    assert o1.loc["1º turno", "Situação"] == cal.CONCLUIDA               # CONF + ENTE na IW47 (IW38 ainda LIB)
    o2 = a[a["Ordem"] == "2"].iloc[0]
    assert o2["Título"] == "CENTRAL DE FRESAS" and o2["Situação"] == cal.CONCLUIDA
    o3 = a[a["Ordem"] == "3"].iloc[0]
    assert o3["Turno"] == cal.SEM_EXECUTANTE and o3["Quem"] == "MEC · 1 pessoa(s) prevista(s)"
    assert o3["Situação"] == cal.PROGRAMADA and o3["Título"] == "TROCA DE ROLAMENTO"
    assert a[a["Ordem"] == "4"].iloc[0]["Situação"] == cal.CANCELADA


def test_atrasada_e_formatos():
    o = _ordens()
    o.loc[2, "Data"] = T("2026-10-01")
    a = cal.agenda(o, _oper(), None, None, HOJE)
    assert a[a["Ordem"] == "3"].iloc[0]["Situação"] == cal.ATRASADA
    assert cal.duracao(3) == "3h" and cal.duracao(50 / 60) == "50 min" and cal.duracao(1 + 17 / 60) == "1h 17min"
    assert cal.duracao(0) == "" and cal.inicio_semana(date(2026, 10, 7)) == date(2026, 10, 4)


def test_html_semana():
    a = cal.agenda(_ordens(), _oper(), _conf(), EQUIPE, HOJE)
    h = cal.html_calendario(a, date(2026, 10, 4), date(2026, 10, 10), date(2026, 10, 7))
    assert h.count('class="cmc-cab"') == 7 and "CHILLER 04" in h and "Sem programação" in h
    assert 'cmc-dia hoje' in h and "1º turno" in h and "cmc-card backlog concluida" in h
    curto = cal.html_calendario(a, date(2026, 10, 4), date(2026, 10, 10), date(2026, 10, 7), max_cartoes=1)
    assert "<details><summary>+2 ordem(ns)</summary>" in curto            # dia 5: 3 cartões, 1 visível


def test_localizacao_vem_do_iw38():
    o = _ordens().assign(Localização=["GAL1", "GAL2", "UTIL", None])
    a = cal.agenda(o, _oper(), _conf(), EQUIPE, HOJE)
    assert a.drop_duplicates("Ordem").set_index("Ordem")["Localização"].to_dict() == {
        "1": "GAL1", "2": "GAL2", "3": "UTIL", "4": ""}
