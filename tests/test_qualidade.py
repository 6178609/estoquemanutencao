"""Qualidade dos dados: cada checagem conta o problema certo sobre a base certa (dados fictícios)."""

import pandas as pd

from central import qualidade as ql

HOJE = pd.Timestamp("2026-10-07")


def test_checagens_principais():
    ordens = pd.DataFrame({
        "Ordem": ["1", "2", "3", "4", "5"], "Situação": ["Concluída", "Aberta", "Encerrada sem confirmação",
                                                         "Concluída", "Cancelada"],
        "Data": [HOJE - pd.Timedelta(days=d) for d in (10, 200, 20, 30, 5)],
        "Início": [HOJE - pd.Timedelta(days=d) for d in (10, 200, 20, 30, 5)],
        "Fim": [HOJE - pd.Timedelta(days=d) for d in (9, 201, 19, 29, 4)],
        "Equip. (chave)": ["E1", "", "E2", "E9", "E1"], "Objeto técnico": ["A", "", "B", "Z", "A"],
        "Tipo": ["YM13"] * 5, "Texto": [""] * 5, "Centro de trabalho": ["MEC"] * 5, "Localização": ["GAL1"] * 5})
    notas = pd.DataFrame({"Nota": ["n1", "n2", "n3", "n4"], "Tipo de nota": ["Y1", "Y1", "Y2", "Y2"],
                          "Data": [HOJE - pd.Timedelta(days=d) for d in (5, 1, 40, 10)],
                          "Dias": [5, 1, 40, 10], "Com ordem": [False, False, False, False],
                          "Equip. (chave)": ["E1"] * 4, "Objeto técnico": ["A"] * 4, "Descrição": [""] * 4,
                          "Centro de trabalho": ["MEC"] * 4})
    oper = pd.DataFrame({"Ordem": ["1", "1", "2"], "Operação": ["10", "20", "10"], "Cancelada": [False, False, True],
                         "Início": [HOJE - pd.Timedelta(days=3)] * 3, "Horas": [0.0, 2.0, 0.0],
                         "Texto da operação": [""] * 3, "Centro de trabalho": ["MEC"] * 3, "Objeto técnico": [""] * 3})
    conf = pd.DataFrame({"Nº pessoal": ["100", "200", "200"], "Centro de trabalho": ["MEC"] * 3,
                         "Data": [HOJE - pd.Timedelta(days=2)] * 3, "Horas": [1.0, 2.0, 3.0]})
    equipe = pd.DataFrame({"Nº pessoal": ["100"]})
    equip = pd.DataFrame({"Equipamento": ["E1", "E2"], "Código ABC": ["A", ""]})
    quebras = pd.DataFrame({"Nota": ["q1", "q2"], "Data": [HOJE - pd.Timedelta(days=3)] * 2,
                            "Horas de reparo": [1.5, None], "Equip. (chave)": ["E1", "E1"]})
    fim_real = pd.Series({"1": HOJE - pd.Timedelta(days=9)})
    ch = {c.id: c for c in ql.verificar(HOJE, ordens=ordens, oper=oper, notas=notas, conf=conf, equipe=equipe,
                                        equip=equip, cad_eq={"E9": {"criticidade": "Baixa"}}, quebras=quebras,
                                        fim_real=fim_real)}
    assert (ch["quebras_sem_reparo"].n, ch["quebras_sem_reparo"].total) == (1, 2)
    assert (ch["y1_sem_ordem"].n, ch["y1_sem_ordem"].total) == (1, 1)          # a Y1 de 1 dia ainda não conta
    assert (ch["notas_sem_ordem"].n, ch["notas_sem_ordem"].total) == (1, 1)
    assert ch["ordens_sem_equip"].n == 1 and ch["ordens_sem_equip"].total == 4  # cancelada fora
    assert ch["prazo_antes_inicio"].n == 1                                     # a ordem 2 (fim antes do início)
    assert (ch["ente_sem_conf"].n, ch["ente_sem_conf"].total) == (1, 3)
    assert list(ch["concluidas_sem_fim"].problemas["Ordem"]) == ["4"]
    assert list(ch["backlog_velho"].problemas["Ordem"]) == ["2"]
    assert list(ch["equip_sem_criticidade"].problemas["Equipamento"]) == ["E2"]   # E9 tem criticidade no site
    assert (ch["ops_sem_trabalho"].n, ch["ops_sem_trabalho"].total) == (1, 2)     # a cancelada não conta
    assert list(ch["apont_fora_equipe"].problemas["Nº pessoal"]) == ["200"]
    assert ch["apont_fora_equipe"].problemas.iloc[0]["HH"] == 5
    assert ch["quebras_sem_reparo"].farol == ql.VERMELHO and ch["ordens_sem_equip"].farol == ql.VERMELHO
    assert 0 <= ql.indice(list(ch.values())) < 100


def test_sem_bases_nao_ha_checagem_e_farol_dos_limites():
    assert ql.verificar(HOJE) == [] and ql.indice([]) is None
    c = ql.Checagem("x", "x", "x", "x", "x", pd.DataFrame({"a": [1, 2]}), 100)
    assert c.farol == ql.VERDE and c.pct == 2
    c.total = 20
    assert c.farol == ql.AMARELO
    c.total = 10
    assert c.farol == ql.VERMELHO
