"""Indicadores WCM com dados pequenos, conferíveis à mão."""

from datetime import date

import pandas as pd
import pytest

from central import indicadores as ind

HOJE = pd.Timestamp("2026-06-30")
T = pd.Timestamp


def _ordens():
    return pd.DataFrame({
        "Ordem": ["1", "2", "3", "4", "5"],
        "Situação": ["Concluída", "Concluída", "Aberta", "Liberada", "Cancelada"],
        "Data": [T("2026-06-01"), T("2026-06-05"), T("2026-06-10"), T("2026-05-01"), T("2026-06-02")],
        "Fim": [T("2026-06-03"), T("2026-06-06"), T("2026-06-12"), T("2026-05-02"), T("2026-06-03")],
        "Com plano": [True, False, True, False, True],
        "Custo real": [100.0, 300.0, 0.0, 0.0, 999.0],
        "Tipo": ["YM15", "YM11", "YM15", "YM12", "YM15"],
    })


def _oper():
    return pd.DataFrame({
        "Ordem": ["1", "2", "2", "3", "4"],
        "Horas": [2.0, 4.0, 2.0, 6.0, 10.0],
        "Pessoas": [1, 2, 1, 1, 1],
        "Concluída": [True, True, True, False, False],
        "Cancelada": [False] * 5,
        "Fim real": [T("2026-06-03"), T("2026-06-08"), T("2026-06-07"), pd.NaT, pd.NaT],
        "Centro de trabalho": ["MEC", "MEC", "ELE", "MEC", "ELE"],
    })


def _notas():
    return pd.DataFrame({
        "Nota": ["n1", "n2", "n3", "n4"],
        "Data": [T("2026-06-01"), T("2026-06-20"), T("2026-06-15"), T("2026-06-02")],
        "Com parada": [True, True, True, False],
        "Tipo de nota": ["Y1", "Y1", "Y1", "Y2"],           # quebra = nota Y1 convertida em ordem YM11
        "Ordem": ["2", "7", "8", ""],
        "Horas parado": [0.0, 0.0, 1.5, 0.0],
        "Código ABC": ["A", "A", "B", ""],
        "Equip. (chave)": ["EQ1", "EQ1", "EQ2", "EQ3"],
        "Com ordem": [True, False, False, False],
        "Dias": [29, 10, 15, 28],
    })


def _dados(**kw):
    base = dict(ordens=_ordens(), notas=_notas(), oper=_oper(), hoje=HOJE)
    base.update(kw)
    return ind.Dados(**base)


def test_confiabilidade():
    r = ind.calcular(_dados(), date(2026, 6, 1), date(2026, 6, 30))
    assert r["quebras"] == 3
    assert r["mtbf"] == pytest.approx(30 * 2 / 3)          # 30 dias × 2 equipamentos ÷ 3 quebras
    # reparo: n1 → ordem 2 = 4/2 + 2/1 = 4 h; n3 → duração da parada 1,5 h; n2 sem dado
    assert r["mttr"] == pytest.approx((4 + 1.5) / 2)
    assert r["reincidencia"] == pytest.approx(100 / 3)       # n2: EQ1 quebrou 19 dias antes
    assert r["quebras_a"] == 2


def test_planejamento_e_custos():
    r = ind.calcular(_dados(), date(2026, 6, 1), date(2026, 6, 30))
    # período: ordens 1, 2, 3 (4 é de maio; 5 cancelada não conta)
    assert r["pct_plano"] == pytest.approx(200 / 3)
    # concluídas com fim real: 1 (03/06 ≤ 03/06, no prazo) e 2 (08/06 > 06/06, atrasada)
    assert r["no_prazo"] == pytest.approx(50)
    assert r["custo"] == pytest.approx(400)  # 30 dias contam como 1 mês
    assert r["pct_custo_corr"] == pytest.approx(75) and r["custo_medio"] == 200
    # backlog de hoje: ordens 3 e 4 → idade 20 e 60 dias; HH pendentes 6 + 10
    assert r["idade_backlog"] == pytest.approx(40)
    # notas com mais de 7 dias no período: n1..n4; sem ordem: n2, n3, n4
    assert r["notas_7d"] == pytest.approx(75)


def test_mao_de_obra_e_backlog_em_semanas():
    d = _dados(capacidade={"MEC": 8.0, "ELE": 8.0})
    r = ind.calcular(d, date(2026, 6, 1), date(2026, 6, 30))
    assert r["hh"] == pytest.approx(8)                       # 2 + 4 + 2 concluídas em junho
    assert r["pct_hh_plano"] == pytest.approx(25)            # só a ordem 1 tem plano
    assert r["backlog_sem"] == pytest.approx(16 / 16)
    assert ind.capacidade_semanal(d, ["MEC"]) == (8.0, "configurada")
    sem_config = _dados()
    cap, origem = ind.capacidade_semanal(sem_config)
    assert origem == "média das últimas 12 semanas" and cap == pytest.approx(8 / 12)


def test_aderencia_ao_plano():
    ch = pd.DataFrame({"Data": [T("2026-06-01"), T("2026-06-08"), T("2026-06-15"), T("2026-07-06"), T("2026-06-22")],
                       "Situação": ["Concluída", "Atrasada", "Concluída", "Programada", "Saltada"]})
    r = ind.calcular(_dados(chamadas=ch), date(2026, 6, 1), date(2026, 7, 31))
    assert r["aderencia"] == pytest.approx(200 / 3)          # 2 de 3 vencidas (saltada e futura fora)


def test_sem_bases_opcionais_nao_quebra():
    r = ind.calcular(ind.Dados(ordens=_ordens(), hoje=HOJE), date(2026, 6, 1), date(2026, 6, 30))
    assert r["quebras"] is None and r["mttr"] is None and r["hh"] is None and r["backlog_sem"] is None
    assert r["pct_plano"] is not None
    assert {k.id for k in ind.KPIS} <= set(r)


def test_pecas_criticas_e_requisicoes():
    est = pd.DataFrame({"Material": ["M1", "M2", "M3"], "Descrição": ["a", "b", "c"], "Estoque": [0.0, 5.0, 10.0]})
    req = pd.DataFrame({"Pendente": [True, True, False], "Dias aguardando": [4.0, 10.0, None]})
    d = _dados(estoque=est, requisicoes=req,
               cad_eq={"EQ1": {"criticidade": "Alta", "materiais": ["M1", "M2", "M3"]},
                       "EQ2": {"criticidade": "Baixa", "materiais": ["M1"]}},
               cad_mat={"M2": {"minimo": 8}})
    r = ind.calcular(d, date(2026, 6, 1), date(2026, 6, 30))
    assert r["itens_zerados"] == 1 and r["pecas_criticas"] == 2 and r["req_dias"] == 7
    assert list(ind.pecas_criticas_em_falta(d)["Material"]) == ["M1", "M2"]


def test_mensal_e_periodo_anterior():
    m = ind.mensal(_dados(), date(2026, 5, 1), date(2026, 6, 30))
    assert list(m["Mês"]) == [T("2026-05-01"), T("2026-06-01")]
    assert m.loc[1, "quebras"] == 3 and m.loc[0, "quebras"] == 0
    assert ind.periodo_anterior(date(2026, 6, 1), date(2026, 6, 30)) == (date(2026, 5, 2), date(2026, 5, 31))


def test_farol_variacao_e_formato():
    k_mais, k_menos = ind.POR_ID["pct_plano"], ind.POR_ID["mttr"]
    assert ind.farol(k_mais, 85, 80) == ind.VERDE
    assert ind.farol(k_mais, 75, 80) == ind.AMARELO       # até 10% abaixo
    assert ind.farol(k_mais, 60, 80) == ind.VERMELHO
    assert ind.farol(k_menos, 4.2, 4) == ind.AMARELO and ind.farol(k_menos, 3, 4) == ind.VERDE
    assert ind.farol(k_menos, None, 4) == ind.NEUTRO and ind.farol(k_menos, 3, None) == ind.NEUTRO
    assert ind.variacao(k_mais, 85, 80) == (5, True)       # pontos percentuais
    assert ind.variacao(k_menos, 5, 4) == (25, False)      # +25% de MTTR é piora
    assert ind.variacao(ind.POR_ID["quebras"], 1086, 3) == (1083, False)  # contagem: diferença absoluta
    assert ind.variacao(ind.POR_ID["idade_backlog"], 90, 80) == (None, None)  # retrato de hoje: sem variação
    assert ind.formatar(ind.POR_ID["custo"], 1_820_000) == "R$ 1,82 mi"
    assert ind.formatar(ind.POR_ID["custo"], 152_300) == "R$ 152,3 mil"
    assert ind.formatar(k_mais, 84.44) == "84,4%"
    assert ind.formatar(ind.POR_ID["hh"], 34826) == "34.826 h"


def test_metas_e_parametros_do_site():
    cad = {"pct_plano": {"meta": 85, "atualizado_em": "x"}, "mttr": {"meta": None},
           "capacidade:MEC": {"hh": 120}, "capacidade:ELE": {"hh": ""}, "tipo:YM13": {"descricao": "Preventiva",
                                                                                       "classe": "Preventiva"}}
    assert ind.meta(ind.POR_ID["pct_plano"], cad) == 85
    assert ind.meta(ind.POR_ID["mttr"], cad) is None            # meta apagada no site
    assert ind.meta(ind.POR_ID["aderencia"], cad) == 95          # padrão
    assert ind.capacidade_de(cad) == {"MEC": 120.0}
    assert ind.rotulo_tipo("YM13", ind.tipos_de(cad)) == "YM13 · Preventiva"
    assert ind.rotulo_tipo("YM99", ind.tipos_de(cad)) == "YM99"


def _conf():
    return pd.DataFrame({
        "Nº pessoal": ["10", "10", "20", "30", "20"],
        "Ordem": ["1", "2", "2", "3", "2"],
        "Horas": [3.0, 2.0, 2.0, 5.0, -1.0],          # a última é um estorno parcial
        "Data": [T("2026-06-02"), T("2026-06-05"), T("2026-06-05"), T("2026-06-20"), T("2026-06-06")],
        "Centro de trabalho": ["MEC", "MEC", "ELE", "MEC", "ELE"],
    })


def _equipe():
    return pd.DataFrame({"Nº pessoal": ["10", "20", "99"], "Especialidade": ["Mecânica", "Elétrica", "Apoio / gestão"]})


TIPOS = {"YM11": {"descricao": "Corretiva Emergencial", "classe": ""}, "YM12": {"descricao": "Corretiva Programada",
                                                                               "classe": ""},
         "YM15": {"descricao": "Preventiva", "classe": ""}}


def test_mao_de_obra_pela_iw47_e_equipe():
    d = _dados(conf=_conf(), equipe=_equipe(), tipos=TIPOS, horas_semana=7.0)
    r = ind.calcular(d, date(2026, 6, 1), date(2026, 6, 14))
    # 01–14/06: 3 + 2 + 2 − 1 = 6 h (a de 20/06 fica de fora)
    assert r["hh"] == pytest.approx(6)
    assert r["pct_hh_plano"] == pytest.approx(50)             # ordem 1 (plano) 3 h de 6
    assert r["hh_emergencial"] == pytest.approx(50)           # ordem 2 é YM11 → Emergencial
    # disponível só na janela coberta pela IW47 (02/06 a 14/06 = 13 dias):
    # 2 técnicos (apoio fora) × 7 h/semana × 13/7 semanas = 26 h; apontado por eles: 6 h
    assert r["utilizacao"] == pytest.approx(6 / 26 * 100)
    assert r["cobertura_hh"] == pytest.approx(100)
    # ordens do período (1, 2, 3): uma YM11
    assert r["pct_emergencial"] == pytest.approx(100 / 3)


def test_mttr_usa_horas_reais_da_iw47():
    d = _dados(conf=_conf())
    q = ind.quebras(d)
    # n1 → ordem 2: (2 + 2 − 1) h ÷ 2 pessoas = 1,5 h (no lugar das 4 h planejadas do IW38OP)
    assert q.set_index("Nota").loc["n1", "Horas de reparo"] == pytest.approx(1.5)


def test_classe_do_tipo():
    assert ind.classe_tipo("YM11", TIPOS) == "Emergencial"
    assert ind.classe_tipo("YM12", TIPOS) == "Corretiva"
    assert ind.classe_tipo("YM13", {"YM13": {"descricao": "Inspeção"}}) == "Preditiva / inspeção"
    assert ind.classe_tipo("YM13", {"YM13": {"descricao": "Inspeção", "classe": "Preventiva"}}) == "Preventiva"
    assert ind.classe_tipo("XX", {}) == ""
    t = ind.tipos_de({"tipo:YM11": {"classe": "Corretiva"}}, {"YM11": "Corretiva Emergencial", "YM15": "Preventiva"})
    assert t["YM11"] == {"descricao": "Corretiva Emergencial", "classe": "Corretiva"} and t["YM15"]["descricao"] == "Preventiva"
    assert ind.horas_semana_de({"_parametros": {"horas_semana": 40}}) == 40 and ind.horas_semana_de({}) == 44


def test_horas_de_ordens_fora_do_iw38():
    conf = _conf()
    conf.loc[len(conf)] = ["10", "999", 4.0, T("2026-06-03"), "MEC"]  # ordem que não está no IW38
    d = _dados(conf=conf, tipos={"YM15": {"descricao": "Preventiva", "classe": ""}})
    r = ind.calcular(d, date(2026, 6, 1), date(2026, 6, 14))
    assert r["hh"] == pytest.approx(10)
    assert r["cobertura_hh"] == pytest.approx(60)            # 6 de 10 h em ordens do IW38
    assert r["pct_hh_plano"] == pytest.approx(50)            # sobre as 6 h conhecidas
    # o IW38 não tem tipo emergencial: os indicadores ficam sem valor (e não 0%)
    assert r["hh_emergencial"] is None and r["pct_emergencial"] is None
    ex = ind.hh_executadas(d)
    assert ex.loc[ex["Ordem"] == "999", "Classe"].iat[0] == ind.FORA_DO_IW38


def test_indicadores_do_gerenciador_de_af():
    from central import af
    from tests.test_af import acoes_cru, afs_cru

    afs = af.preparar_afs(afs_cru(), HOJE)
    acoes = af.preparar_acoes(acoes_cru(), HOJE, afs)
    ini, fim = date(2026, 6, 1), date(2026, 6, 30)
    esperado = af.indicadores(afs, acoes, ini, fim, HOJE)
    r = ind.calcular(_dados(afs=afs, acoes_af=acoes), ini, fim)
    for k in ind.IDS_AF + ind.IDS_ACOES_AF:
        assert r[k] == pytest.approx(esperado[k]), k
        assert ind.POR_ID[k].grupo == ind.ANALISE_FALHA
    assert r["taxa_quebra_a"] is not None and r["af_execucao"] is not None and r["acoes_execucao"] is not None
    assert ind.ANALISE_FALHA in ind.GRUPOS
    # série mensal também traz os de AF
    serie = ind.mensal(_dados(afs=afs, acoes_af=acoes), ini, fim)
    assert serie["af_execucao"].iat[0] == pytest.approx(esperado["af_execucao"])

    # só a aba de AFs: as de ações ficam sem valor (e vice-versa)
    so_afs = ind.calcular(_dados(afs=afs), ini, fim)
    assert so_afs["af_execucao"] == pytest.approx(esperado["af_execucao"]) and so_afs["acoes_execucao"] is None
    so_acoes = ind.calcular(_dados(acoes_af=acoes), ini, fim)
    assert so_acoes["acoes_execucao"] == pytest.approx(esperado["acoes_execucao"]) and so_acoes["af_execucao"] is None

    # sem o gerenciador, todos ficam sem valor
    sem = ind.calcular(_dados(), ini, fim)
    assert all(sem[k] is None for k in ind.IDS_AF + ind.IDS_ACOES_AF)


def test_quebra_e_nota_y1_convertida_em_ym11():
    from central.util import marcar_quebras
    notas = pd.DataFrame({"Nota": list("abcde"), "Tipo de nota": ["Y1", "Y1", "Y1", "Y2", "Y1"],
                          "Ordem": ["10", "11", "", "12", "13"]})
    tipos = pd.Series({"10": "YM11", "11": "YM13", "12": "YM11"})
    q = marcar_quebras(notas, tipos).set_index("Nota")
    assert q["Quebra"].to_dict() == {"a": True, "b": False, "c": False, "d": False, "e": True}  # e: tipo desconhecido
    assert q.loc["a", "Tipo da ordem"] == "YM11" and q.loc["e", "Tipo da ordem"] == ""
