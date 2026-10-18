"""Equipe por cadastro manual e HH com carga horária (dados fictícios) — os mesmos casos de
web/testes/treinamentos.test.ts."""

from central import bases, hh
from central.leitura import EQUIPE, TIPOS_SEM_ENVIO

CAD = {
    "10": {"nome": "ANA", "cargo": "MECANICO", "centro": "MEC", "turma": "1ª", "ausencias": [
        {"id": "a", "tipo": "Férias", "de": "2026-01-05", "ate": "2026-01-14"},
        {"id": "c", "tipo": "Treinamento", "de": "2025-10-01", "ate": "2025-10-02", "titulo": "NR-10", "horas": 16},
        {"id": "d", "tipo": "Treinamento", "de": "2026-10-05", "ate": "2026-10-05", "titulo": "NR-10", "horas": 8},
    ]},
    "20": {"nome": "BRUNO", "cargo": "ELETRICISTA", "centro": "ELE", "ativo": True, "ausencias": [
        {"id": "e", "tipo": "Treinamento", "de": "2026-10-06", "ate": "2026-10-06", "titulo": "NR-35", "horas": 0},
    ]},
    "30": {"nome": "CAIO", "cargo": "ANALISTA PLANEJ", "centro": "PCM", "ativo": False},
    "40": {"jornada": 40},
}


def test_equipe_do_cadastro():
    eq = bases.equipe_do_cadastro(CAD, excluir=False)
    assert list(eq["Nº pessoal"]) == ["10", "20"]
    assert list(eq["Especialidade"]) == ["Mecânica", "Elétrica"]
    assert {"Nº pessoal", "Nome", "Cargo", "Centro de trabalho", "Área", "Turma", "Supervisor", "Especialidade", "Setor"} <= set(eq)
    assert len(bases.equipe_do_cadastro(CAD, excluir=False, com_desligados=True)) == 3
    assert bases.equipe_do_cadastro({"40": {"jornada": 40}}) is None


def test_hh_com_carga_horaria():
    pes = hh.pessoas(bases.equipe_do_cadastro(CAD, excluir=False), CAD, 42.0)
    d = hh.disponibilidade(pes, CAD, "2026-10-01", "2026-10-07").set_index("Nº pessoal")
    assert d.loc["10", "Horas ausente"] == 8 and d.loc["10", "Dias ausente"] == 0
    assert d.loc["20", "Horas ausente"] == 0
    assert hh.horas_parciais(CAD, "2025-10-02", "2025-10-31") == {"10": 8.0}
    jan = hh.disponibilidade(pes, CAD, "2026-01-01", "2026-01-31").set_index("Nº pessoal")
    assert jan.loc["10", "Horas ausente"] == 60


def test_planilha_de_equipe_nao_e_mais_enviada():
    assert EQUIPE in TIPOS_SEM_ENVIO
