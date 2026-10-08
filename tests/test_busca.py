"""Busca global (dados fictícios)."""

import pandas as pd

from central import busca


def _bases():
    ordens = pd.DataFrame({
        "Ordem": ["4001", "4002", "4003"], "Texto": ["TROCAR ROLAMENTO", "LUBRIFICAR CORRENTE", "REVISÃO GERAL"],
        "Equip. (chave)": ["41020389", "41020389", "41000001"], "Objeto técnico": ["INJETORA 07"] * 2 + ["PRENSA"],
        "Campo de ordenação": ["41020389", "41020389", "PR-01"], "Centro de trabalho": ["MEC_COMP"] * 3,
        "Tipo": ["YM13"] * 3, "Situação": ["Aberta"] * 3, "Data": pd.to_datetime(["2026-09-01", "2026-10-01",
                                                                                "2026-08-01"])})
    ordens["_busca"] = (ordens["Ordem"] + " " + ordens["Texto"] + " " + ordens["Equip. (chave)"] + " "
                        + ordens["Objeto técnico"]).map(busca.normalizar)
    notas = pd.DataFrame({"Nota": ["9001"], "Descrição": ["Vazamento de óleo"], "Ordem": ["4001"],
                          "Equip. (chave)": ["41020389"], "Data": pd.to_datetime(["2026-09-01"])})
    equip = pd.DataFrame({"Equipamento": ["41020389", "41000001"], "Denominação": ["INJETORA 07 UGB", "PRENSA HIDRÁULICA"],
                          "Local de instalação": ["GAL1", "GAL2"], "Localização": ["GAL1", "GAL2"],
                          "Código ABC": ["A", "B"]})
    estoque = pd.DataFrame({"Material": ["100200"], "Descrição": ["ROLAMENTO 6205"], "Estoque": [4.0]})
    afs = pd.DataFrame({"Nº AF": ["AF-1"], "Código SAP": ["41020389"], "Equipamento": ["INJETORA 07"],
                        "Resumo": ["Quebra do rolamento"], "Data da falha": pd.to_datetime(["2026-09-10"])})
    return dict(ordens=ordens, notas=notas, equip=equip, estoque=estoque, afs=afs)


def test_busca_por_palavras_sem_acento_em_todas_as_bases():
    r = busca.buscar("rolamento", **_bases())
    assert list(r["Ordens"]["Ordem"]) == ["4001"] and list(r["Materiais"]["Material"]) == ["100200"]
    assert len(r["Análises de falha"]) == 1 and r["Notas"].empty
    r = busca.buscar("hidraulica prensa", **_bases())                 # sem acento e fora de ordem
    assert list(r["Equipamentos"]["Equipamento"]) == ["41000001"]
    r = busca.buscar("óleo", **_bases())
    assert list(r["Notas"]["Nota"]) == ["9001"]


def test_numero_exato_primeiro_e_campo_de_ordenacao():
    b = _bases()
    r = busca.buscar("41020389", **b)
    assert list(r["Ordens"]["Ordem"]) == ["4002", "4001"]              # mais recente primeiro (as duas exatas)
    assert list(r["Equipamentos"]["Equipamento"]) == ["41020389"] and len(r["Notas"]) == 1
    r = busca.buscar("pr-01", **b)                                     # campo de ordenação
    assert list(r["Ordens"]["Ordem"]) == ["4003"]
    b["ordens"] = pd.concat([b["ordens"], b["ordens"].iloc[[0]].assign(Ordem="14001", Data=pd.Timestamp("2026-10-05"))])
    b["ordens"]["_busca"] = b["ordens"]["Ordem"] + " " + b["ordens"]["Texto"]
    r = busca.buscar("4001", **b)
    assert list(r["Ordens"]["Ordem"])[0] == "4001"                    # exata antes da parecida mais recente


def test_termo_curto_ou_vazio_nao_busca_e_cadastro_do_site_entra():
    assert all(v.empty for v in busca.buscar("a", **_bases()).values())
    r = busca.buscar("bomba", **_bases(), cad_eq={"MT-102": {"nome": "Motor bomba", "criticidade": "Alta"}})
    assert list(r["Equipamentos"]["Equipamento"]) == ["MT-102"]
    assert r["Equipamentos"].iloc[0]["Criticidade"] == "Alta"
    assert set(busca.buscar("x1", **_bases())) == set(busca.CATEGORIAS)
