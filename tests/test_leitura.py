"""Leitura dos exports do SAP no PC (o que o sincronizador envia): cabeçalhos, abas e manias de cada export,
reproduzidos em miniatura com dados fictícios — os arquivos reais não entram no repositório."""

import io
from datetime import datetime

import pandas as pd

from sincronizador import leitura
from sincronizador.leitura import EQUIPE, IW38, MB52, NOTAS


def _xlsx(df, aba="Sheet1"):
    buf = io.BytesIO()
    df.to_excel(buf, index=False, sheet_name=aba)
    return buf.getvalue()


def test_iw38_com_formula_arrastada_e_reconhecido():
    cols = ["Denominação do loc.instalação", "Equipamento", "Denominação do objeto técnico", "Centro trab.respons.",
            "Ordem", "Plano de manutenção", "Texto breve", "Status do sistema", "Data-base do início",
            "Data-base do fim", "Tipo de ordem", "Status usuário", "Campo de ordenação", "Custos tot.reais", "Status"]
    linhas = [["UTILIDADES", "41002266", "BOMBA AGUA", "MEC_COMP", "31697096", "41921", "PREV BOMBA", "LIB  CAPC",
               datetime(2026, 9, 18), datetime(2026, 9, 19), "YM13", "PRO", "EXT-01", 0, "PENDENTE"]] + [[None] * 14 + ["PENDENTE"]] * 3
    df = leitura.ler_arquivo("IW38.xlsx", _xlsx(pd.DataFrame(linhas, columns=cols), "IW38"), "IW38", 0)
    assert len(df) == 4
    assert leitura.identificar(df.columns) == IW38


def test_cada_base_e_um_arquivo_so():
    arquivos = [type("O", (), {"arquivo": type("A", (), {"nome": n})()})() for n in
                ["IW38.xlsx", "IW38 (1).xlsx", "a.xlsx", "IW38BK.XLSX"]]
    assert leitura.escolher_origens(IW38, arquivos) == arquivos[:1]   # só o mais recente
    assert leitura.escolher_origens(MB52, arquivos) == arquivos[:1]
    assert leitura.escolher_origens(NOTAS, arquivos) == arquivos[:1]


def test_mb52_salvo_como_html():
    linhas = ["Material            Texto breve material", "Val.matriz  UMB   Categoria    Utilização livre",
              "48737                LAMPADA V MET OVOIDE LEIT E40 400W", "           UN                    6"]
    html = "<html><body><table>" + "".join(f"<tr><td>{ln.replace(' ', '&nbsp;')}</td></tr>" for ln in linhas) + "</table>"
    df = leitura.ler_arquivo("MB52.htm", html.encode("cp1252"))
    assert leitura.identificar(df.columns) == MB52


def test_planilha_de_equipe_reconhecida_mas_nao_enviada():
    df = pd.DataFrame({"Nº pessoal": ["123456"], "Nome": ["PESSOA FICTICIA"], "Cargo": ["MECANICO"], "Centro trabalho": ["MEC"]})
    assert leitura.identificar(leitura.ler_arquivo("Gestão de HH.xlsx", _xlsx(df)).columns) == EQUIPE
    assert EQUIPE in leitura.TIPOS_SEM_ENVIO
