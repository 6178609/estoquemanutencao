import io
import os
import time

import pandas as pd
import pytest

from central import auth, bases, leitura
from central.fontes import Pastas
from central.leitura import IW38, MB52, REQ
from central.util import brl, para_data, para_numero


# ----------------------------------------------------------------------------
# util
# ----------------------------------------------------------------------------
def test_numeros_no_formato_sap():
    s = para_numero(pd.Series(["1.234,56", "12,00-", "1234.5", "", None, "-2034.25", "1.234.567"]))
    assert s.iloc[0] == pytest.approx(1234.56)
    assert s.iloc[1] == pytest.approx(-12.0)
    assert s.iloc[2] == pytest.approx(1234.5)
    assert pd.isna(s.iloc[3]) and pd.isna(s.iloc[4])
    assert s.iloc[5] == pytest.approx(-2034.25)
    assert s.iloc[6] == pytest.approx(1234567)


def test_datas():
    s = para_data(pd.Series(["21/09/2026", "21.09.2026", 46286, "", None]))
    assert s.iloc[0] == pd.Timestamp(2026, 9, 21)
    assert s.iloc[1] == pd.Timestamp(2026, 9, 21)
    assert s.iloc[2] == pd.Timestamp(2026, 9, 21)
    assert pd.isna(s.iloc[3]) and pd.isna(s.iloc[4])


def test_brl():
    assert brl(1234.5) == "R$ 1.234,50"
    assert brl(-10) == "-R$ 10,00"


# ----------------------------------------------------------------------------
# leitura
# ----------------------------------------------------------------------------
IW38_COLS = ["Centro", "Denominação do loc.instalação", "Equipamento", "Denominação do objeto técnico", "Centro trab.respons.",
             "Ordem", "Plano de manutenção", "Texto breve", "Status do sistema", "Data-base do início", "Data-base do fim",
             "Data de entrada", "Criado por", "Prioridade", "Tipo de ordem", "Status usuário", "Custos tot.reais"]


def iw38_cru():
    linhas = [
        ["A026", "ACABAMENTO", "41001404", "PRENSA 01", "MECA", "1", "", "VAZAMENTO", "ABER CAPC", "01/09/2026", "02/09/2026",
         "01/09/2026", "JOAO", "1", "YM01", "PLA", "1.500,00"],
        ["A026", "ACABAMENTO", "41001404", "PRENSA 01", "MECA", "2", "20976", "PREVENTIVA", "LIB  CAPC", "01/12/2099", "02/12/2099",
         "01/09/2026", "JOAO", "2", "YM02", "PRO", "0"],
        ["A026", "UTILIDADES", "41001435", "COMPRESSOR", "ELET", "3", "", "TROCA MOTOR", "ENTE CONF", "01/08/2026", "05/08/2026",
         "01/08/2026", "ANA", "1", "YM01", "", "300"],
        ["A026", "FABRICA PILOTO", "41009999", "MAQUINA X", "FABPILOT", "4", "", "PILOTO", "ABER", "01/08/2026", "", "", "", "", "YM01", "", "10"],
        ["A026", "ACABAMENTO", "41001404", "PRENSA 01", "MECA", "5", "", "CANCELADA", "LIB", "01/08/2026", "", "", "", "", "YM01", "CAN", "0"],
    ]
    return pd.DataFrame(linhas, columns=IW38_COLS)


def test_identifica_bases():
    assert leitura.identificar(IW38_COLS) == IW38
    assert leitura.identificar(["Material", "Texto breve material", "Utilização livre"]) == MB52
    assert leitura.identificar(["Nº da req.", "Status", "Total"]) == REQ
    assert leitura.identificar(["Código", "Quantidade"]) is None  # planilha qualquer não vira MB52


def test_csv_ponto_e_virgula():
    txt = "Material;Texto breve material;Utilização livre\n100;ROLAMENTO;1.234,5\n".encode("cp1252")
    df = leitura.ler_arquivo("x.csv", txt)
    assert list(df.columns) == ["Material", "Texto breve material", "Utilização livre"]


def test_lista_sap_com_barras():
    txt = ("-----------------------------\n| Material | Texto breve material | Utilização livre |\n"
           "-----------------------------\n| 100 | ROLAMENTO | 2,000 |\n| 101 | CORREIA | 0 |\n").encode()
    df = leitura.ler_arquivo("x.txt", txt)
    assert len(df) == 2 and df.iloc[0]["Material"] == "100"


def test_html_lista_agrupada_mb52():
    html = """<html><body><table>
      <tr><td>100200&nbsp;&nbsp;ROLAMENTO 6205</td></tr>
      <tr><td>PC&nbsp;&nbsp;&nbsp;2,000&nbsp;&nbsp;M001</td></tr>
      <tr><td>PC&nbsp;&nbsp;&nbsp;3,000&nbsp;&nbsp;M002</td></tr>
      <tr><td>100201&nbsp;&nbsp;CORREIA A40</td></tr>
      <tr><td>PC&nbsp;&nbsp;&nbsp;0&nbsp;&nbsp;M001</td></tr>
    </table></body></html>""".encode()
    df = leitura.ler_arquivo("mb52.htm", html)
    resumo, _ = bases.preparar_mb52(df)
    assert resumo.set_index("Material").loc["100200", "Estoque"] == 5.0
    assert resumo.set_index("Material").loc["100201", "Estoque"] == 0.0


def test_sondar_acha_aba_e_linha_do_cabecalho():
    buf = io.BytesIO()
    with pd.ExcelWriter(buf, engine="openpyxl") as xw:
        pd.DataFrame({"a": [1]}).to_excel(xw, sheet_name="Resumo", index=False)
        capa = pd.DataFrame([["Relatório IW38", None], [None, None]])
        capa.to_excel(xw, sheet_name="Base", index=False, header=False)
        iw38_cru().to_excel(xw, sheet_name="Base", index=False, startrow=2)
    achados = leitura.sondar("ind.xlsx", buf.getvalue())
    assert achados == [(IW38, "Base", 2)]
    df = leitura.ler_arquivo("ind.xlsx", buf.getvalue(), "Base", 2)
    assert len(df) == 5


# ----------------------------------------------------------------------------
# preparação das bases
# ----------------------------------------------------------------------------
def test_preparar_iw38():
    df, removidas = bases.preparar_iw38(iw38_cru(), hoje=pd.Timestamp(2026, 10, 1))
    assert removidas == 1  # Fábrica Piloto fora
    sit = dict(zip(df["Ordem"], df["Situação"]))
    assert sit == {"1": "Aberta", "2": "Liberada", "3": "Concluída", "5": "Cancelada"}
    atr = dict(zip(df["Ordem"], df["Atrasada"]))
    assert atr["1"] and not atr["2"] and not atr["3"] and not atr["5"]
    assert dict(zip(df["Ordem"], df["Com plano"]))["2"]
    assert df["Custo real"].sum() == pytest.approx(1800.0)


def test_preparar_iw38_sem_excluir_piloto():
    df, removidas = bases.preparar_iw38(iw38_cru(), excluir_piloto_matriz=False)
    assert removidas == 0 and len(df) == 5


def test_preparar_requisicoes():
    cru = pd.DataFrame({"Nº da req.": ["R1", "R2"], "Status": ["Aprovação pendente", "Aprovado"],
                        "Enviado em": ["01/09/2026", "02/09/2026"], "Total": ["1.000,00", 50]})
    df = bases.preparar_requisicoes(cru, hoje=pd.Timestamp(2026, 9, 11))
    assert list(df["Pendente"]) == [True, False]
    assert df.loc[0, "Dias aguardando"] == 10
    assert df["Total"].sum() == pytest.approx(1050.0)


# ----------------------------------------------------------------------------
# pastas e inventário
# ----------------------------------------------------------------------------
def _xlsx(df):
    buf = io.BytesIO()
    df.to_excel(buf, index=False)
    return buf.getvalue()


def test_inventario_usa_o_mais_recente_e_respeita_fixado(tmp_path, monkeypatch):
    ind = tmp_path / "0.1 - Indicadores" / "2026"
    ind.mkdir(parents=True)
    velho = ind / "export_antigo.xlsx"
    velho.write_bytes(_xlsx(iw38_cru()))
    os.utime(velho, (time.time() - 86400, time.time() - 86400))
    novo = ind / "export.XLSX"  # nome sem pista: identificado pelo conteúdo
    novo.write_bytes(_xlsx(iw38_cru().head(2)))
    (tmp_path / "outra.xlsx").write_bytes(_xlsx(pd.DataFrame({"Código": [1], "Quantidade": [2]})))

    monkeypatch.setenv("CENTRAL_PASTAS", str(tmp_path))
    monkeypatch.setenv("CENTRAL_PASTA_APP", str(tmp_path / "app"))
    monkeypatch.setenv("CENTRAL_EXIGIR_LOGIN", "nao")
    bases.recarregar()

    inv = bases.inventario()
    assert inv.ativos[IW38].arquivo.id == str(novo)
    assert MB52 not in inv.ativos
    assert len(bases.iw38().df) == 2

    bases.fixar_origem(IW38, str(velho))
    assert bases.inventario().ativos[IW38].arquivo.id == str(velho)
    assert (tmp_path / "app" / bases.ARQ_PREF).exists()
    bases.fixar_origem(IW38, None)
    assert bases.inventario().ativos[IW38].arquivo.id == str(novo)


def test_cadastro_grava_so_o_item(tmp_path, monkeypatch):
    monkeypatch.setenv("CENTRAL_PASTAS", str(tmp_path))
    monkeypatch.setenv("CENTRAL_PASTA_APP", str(tmp_path / "app"))
    bases.recarregar()
    bases.gravar_cadastro(bases.ARQ_CAD_EQUIP, "A", {"criticidade": "Alta"}, "ana")
    bases.gravar_cadastro(bases.ARQ_CAD_EQUIP, "B", {"criticidade": "Baixa"}, "joao")
    cad = bases.ler_cadastro(bases.ARQ_CAD_EQUIP)
    assert cad["A"]["criticidade"] == "Alta" and cad["B"]["atualizado_por"] == "joao"
    bases.gravar_cadastro(bases.ARQ_CAD_EQUIP, "A", None)
    assert "A" not in bases.ler_cadastro(bases.ARQ_CAD_EQUIP)


def test_pastas_ignora_temporarios(tmp_path):
    (tmp_path / "~$IW38.xlsx").write_bytes(b"x")
    (tmp_path / "foto.png").write_bytes(b"x")
    (tmp_path / "IW38.xlsx").write_bytes(b"x")
    nomes = [a.arquivo for a in Pastas([tmp_path], tmp_path / "app").listar()]
    assert nomes == ["IW38.xlsx"]


# ----------------------------------------------------------------------------
# login
# ----------------------------------------------------------------------------
def test_senha_com_hash():
    h = auth.gerar_hash("segredo123")
    assert "segredo123" not in str(h)
    assert auth.confere(h, "segredo123")
    assert not auth.confere(h, "segredo124")


def test_regras_de_senha_e_login():
    assert auth.validar_senha("curta1")
    assert auth.validar_senha("somenteletras")
    assert not auth.validar_senha("boa12345")
    assert auth.validar_login("Jeferson")  # maiúscula não
    assert not auth.validar_login("jeferson.silva")
