"""Gerenciador de HH: jornada, % disponível, quem conta na capacidade e ausências (dados fictícios)."""

from datetime import date

import pandas as pd
import pytest

from central import hh
from central import indicadores as ind
from central import semanal as sem

EQUIPE = pd.DataFrame({"Nº pessoal": ["10", "20", "30"], "Nome": ["ANA", "BRUNO", "CAIO"],
                       "Cargo": ["MECANICO", "ELETRICISTA", "ANALISTA PLANEJ"],
                       "Especialidade": ["Mecânica", "Elétrica", "Planejamento (GPM)"],
                       "Centro de trabalho": ["MEC", "ELE", "PCM"], "Área": ["X"] * 3, "Turma": ["1ª"] * 3})


def test_padroes_sem_cadastro():
    p = hh.pessoas(EQUIPE, {}, 44.0)
    assert list(p["Jornada (h/sem)"]) == [44.0] * 3 and list(p["Disponível %"]) == [100.0] * 3
    assert list(p["Conta na capacidade"]) == [True, True, False]           # planejamento não conta
    # 2 técnicos × 44 h × 7 dias ÷ 7 = a conta antiga (técnicos × jornada)
    assert hh.horas_disponiveis(p, {}, date(2026, 10, 5), date(2026, 10, 11)) == pytest.approx(88.0)


def test_jornada_percentual_capacidade_e_ausencias():
    cad = {"10": {"jornada": 40, "percentual": 80,
                  "ausencias": [{"id": "a", "tipo": "Férias", "de": "2026-10-01", "ate": "2026-10-07"},
                                {"id": "b", "tipo": "Treinamento", "de": "2026-10-06", "ate": "2026-10-06"}]},
           "20": {"capacidade": False}, "30": {"capacidade": True, "jornada": 20}}
    p = hh.pessoas(EQUIPE, cad, 44.0)
    assert list(p["Conta na capacidade"]) == [True, False, True]
    d = hh.disponibilidade(p, cad, date(2026, 10, 5), date(2026, 10, 11)).set_index("Nº pessoal")
    # ANA: 40 h na semana, ausente 5,6,7 (o treinamento do dia 6 não conta em dobro) → (40 − 3×40/7) × 80%
    assert d.at["10", "Dias ausente"] == 3
    assert d.at["10", "Horas disponíveis"] == pytest.approx((40 - 3 * 40 / 7) * 0.8)
    assert d.at["30", "Horas disponíveis"] == pytest.approx(20.0)
    centros = hh.por_centro(p, cad, date(2026, 10, 5), date(2026, 10, 11))
    assert set(centros) == {"MEC", "PCM"} and centros["MEC"][1] == 1
    assert list(hh.ausentes_em(p, cad, date(2026, 10, 6))["Tipo"]) == ["Férias", "Treinamento"]


def test_indicadores_e_semanal_usam_a_disponibilidade():
    cad = {"10": {"ausencias": [{"id": "a", "tipo": "Férias", "de": "2026-10-05", "ate": "2026-10-11"}]}}
    conf = pd.DataFrame({"Nº pessoal": ["10"], "Data": [pd.Timestamp("2026-10-05")], "Horas": [1.0],
                         "Ordem": ["1"], "Centro de trabalho": ["MEC"]})
    d = ind.Dados(ordens=pd.DataFrame(columns=["Ordem"]), conf=conf, equipe=EQUIPE, horas_semana=44.0,
                  disponibilidade=cad)
    assert ind.hh_disponiveis(d, date(2026, 10, 5), date(2026, 10, 5)) == pytest.approx(44 / 7)   # só o BRUNO
    disp = hh.por_centro(ind.pessoas_hh(d), cad, date(2026, 10, 5), date(2026, 10, 11))
    cap = sem.capacidade(["MEC", "ELE"], ind.tecnicos(d), 44.0, disponivel=disp).set_index("Centro de trabalho")
    assert cap.at["ELE", "Capacidade"] == pytest.approx(44.0) and "Gerenciador" in cap.at["ELE", "Origem"]
    assert cap.at["MEC", "Capacidade"] == 0.0        # a ANA, única do centro, está de férias a semana toda
