"""Catálogo de materiais (Sysmat) × almoxarifado (MB52) — dados fictícios."""

import pandas as pd

from central import leitura, materiais

CRU = pd.DataFrame({
    "Codigo Sysmat": ["10000001", "10000002", "10000003", "10000004", "10000005", "10000006"],
    "CodigoAlpargatas": ["111", "222", "222", "", "444", "555"],
    "Codigo SysmatPara": ["", "", "", "", "", "10000001"],
    "CodigoAlpargatasPara": ["", "", "", "", "", "111"],
    "NCM": ["84821010", "", "", "", "", ""],
    "UN Basica": ["UN", "PC", "PC", "UN", "M", "UN"],
    "Categoria": ["COMPONENTES", "(SEM CATEGORIA)", "FIXACAO", "ELETRICA", "ELETRICA", "COMPONENTES"],
    "SubCategoria": ["ROLAMENTOS", "(SEM SUBCATEGORIA)", "PARAFUSOS", "CABOS", "CABOS", "ROLAMENTOS"],
    "PDM": ["ROLAMENTO", "PARAFUSO", "PARAFUSO", "CABO", "CABO", "ROLAMENTO"],
    "Descr Curta": ["ROLAMENTO 6205", "PARAFUSO M8", "PARAFUSO M8", "CABO", "CABO 2,5", "ROLAMENTO 6205 DUP"],
    "Descr Completa": [
        "ROLAMENTO RIGIDO DE ESFERAS; DIAMETRO INTERNO: 25 MM; APLICACAO: *****; FAB: SKF - REF: 6205-2Z.",
        "PARAFUSO; ROSCA: M8", "PARAFUSO SEXTAVADO; ROSCA: M8; COMPRIMENTO: 30 MM; FAB: CISER - REF: 123.",
        "CABO", "CABO FLEXIVEL; SECAO: 2,5 MM2; FAB: ACME - REF: *****; FAB: BETA - REF: X1.", "ROLAMENTO"],
    "Status": ["APROVADO", "CANCELADO", "APROVADO", "BLOQUEADO", "BLOQUEADO", "DUPLICADO"],
})


def test_reconhece_a_extracao_pelas_colunas():
    assert leitura.identificar(CRU.columns) == leitura.CATMAT
    assert leitura.identificar(["Material", "Texto breve material", "Utilização livre"]) == leitura.MB52


def test_preparar_catalogo():
    c = materiais.preparar_catalogo(CRU).set_index("Sysmat")
    assert len(c) == 5                                   # 222 repetido: fica a linha aprovada
    assert c.loc["10000003", "Material"] == "222" and "10000002" not in c.index
    assert c.loc["10000001", "Fabricante / referência"] == "SKF 6205-2Z"
    assert c.loc["10000005", "Fabricante / referência"] == "ACME | BETA X1"
    assert c.loc["10000004", "Categoria"] == "ELETRICA" and c.loc["10000006", "Substituto"] == "111"


def test_informacao_tecnica_quebrada_por_atributo():
    info = CRU["Descr Completa"][0]
    assert materiais.linhas_tecnicas(info) == ["ROLAMENTO RIGIDO DE ESFERAS", "DIAMETRO INTERNO: 25 MM",
                                               "FAB: SKF - REF: 6205-2Z"]
    assert materiais.info_html("A <b>; B: 1") == "A &lt;b&gt;<br>B: 1"           # texto escapado
    assert "sem informação" in materiais.info_html("")


def test_almoxarifado_e_cadastrados():
    cat = materiais.preparar_catalogo(CRU)
    mb52 = pd.DataFrame({"Material": ["111", "0222", "444", "999"], "Descrição": ["a", "b", "c", "d"],
                         "Estoque": [2.0, 0.0, 5.0, 1.0]})
    a = materiais.almoxarifado(mb52, cat).set_index("Material")
    assert a.loc["111", "Cadastro"] == "Ativo" and a.loc["0222", "Cadastro"] == "Ativo"   # zero à esquerda
    assert a.loc["444", "Cadastro"] == "Bloqueado" and a.loc["999", "Cadastro"] == "Não encontrado no Sysmat"
    assert a.loc["111", "Informação técnica"].startswith("ROLAMENTO RIGIDO")
    assert materiais.almoxarifado(mb52, None)["Cadastro"].eq("Sem catálogo").all()
    k = materiais.cadastrados(cat, mb52).set_index("Sysmat")
    assert k["No almoxarifado"].sum() == 3 and k.loc["10000003", "Estoque"] == 0
    assert not k.loc["10000004", "No almoxarifado"] and pd.isna(k.loc["10000004", "Estoque"])
