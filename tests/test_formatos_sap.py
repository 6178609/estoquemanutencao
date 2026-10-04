"""Formatos dos exports reais do SAP da F26 (colunas e manias de cada um),
reproduzidos em miniatura — os arquivos reais não entram no repositório."""

import io
from datetime import datetime

import pandas as pd

from central import bases, leitura, planos
from central.leitura import EQUIP, IP19, IW38, MB52, NOTAS, OPER


def _xlsx(df, aba="Sheet1"):
    buf = io.BytesIO()
    df.to_excel(buf, index=False, sheet_name=aba)
    return buf.getvalue()


# ----------------------------------------------------------------------------
# IW38 com a coluna "Status" (fórmula) arrastada até o fim da planilha
# ----------------------------------------------------------------------------
def iw38_2026():
    cols = ["Denominação do loc.instalação", "Equipamento", "Denominação do objeto técnico", "Centro trab.respons.",
            "Ordem", "Plano de manutenção", "Texto breve", "Status do sistema", "Data-base do início",
            "Data-base do fim", "Conds.instal.", "Tipo de ordem", "Localização", "Status usuário",
            "Campo de ordenação", "Custos tot.reais", "Status"]
    linhas = [
        ["INJECAO HORIZONTAL", "41019190", "INJ PVC 08", "COMPONEN", "31682290", "", "POS-ROTA", "ENTE CONF CAPC",
         datetime(2026, 1, 9), datetime(2026, 1, 15), "0", "YM15", "GAL1", "PRO", "41018958", 188.82, "FINALIZADA"],
        ["UTILIDADES", "41002266", "BOMBA AGUA", "MEC_COMP", "31697096", "41921", "PREV BOMBA", "LIB  CAPC",
         datetime(2026, 9, 18), datetime(2026, 9, 19), "0", "YM13", "UTIL", "PRO", "", 0, "PENDENTE"],
    ] + [[None] * 16 + ["PENDENTE"]] * 5  # linhas vazias com a fórmula
    return pd.DataFrame(linhas, columns=cols)


def test_iw38_descarta_linhas_sem_ordem():
    df = leitura.ler_arquivo("IW38.xlsx", _xlsx(iw38_2026(), "IW38"), "IW38", 0)
    assert len(df) == 7
    prep, _ = bases.preparar_iw38(df)
    assert list(prep["Ordem"]) == ["31682290", "31697096"]
    assert list(prep["Situação"]) == ["Concluída", "Liberada"]


def test_cada_base_e_um_arquivo_so():
    arquivos = [type("O", (), {"arquivo": type("A", (), {"nome": n})()})() for n in
                ["IW38.xlsx", "IW38 (1).xlsx", "a.xlsx", "IW38BK.XLSX"]]
    assert leitura.escolher_origens(IW38, arquivos) == arquivos[:1]   # IW38: só o mais recente
    assert leitura.escolher_origens(MB52, arquivos) == arquivos[:1]
    assert leitura.escolher_origens(NOTAS, arquivos) == arquivos[:1]  # IW28: só o mais recente


def test_numero_no_plano_e_plano_de_manutencao_sem_numero_e_backlog():
    iw = iw38_2026().iloc[:2].copy()
    iw = pd.concat([iw, iw.iloc[:1].assign(Ordem="31700000", **{"Plano de manutenção": "#"})], ignore_index=True)
    iw.loc[0, "Plano de manutenção"] = "53149"
    prep, _ = bases.preparar_iw38(iw)
    nat = dict(zip(prep["Ordem"], prep["Natureza"]))
    # 53149 e 41921 têm número → plano de manutenção; "#" não é número → backlog
    assert nat == {"31682290": bases.NAT_PLANO, "31697096": bases.NAT_PLANO, "31700000": bases.NAT_BACKLOG}


# ----------------------------------------------------------------------------
# MB52 salvo como HTML: lotes que começam com número não viram material
# ----------------------------------------------------------------------------
def test_mb52_html_com_lotes():
    linhas = ["Material            Texto breve material", "Val.matriz  UMB   Categoria    Utilização livre",
              "48737                LAMPADA V MET OVOIDE LEIT E40 400W", "           UN                    6",
              "84518                PROD QUIM PRT 601 07", "           KG              2.475,000",
              "           KG                 27,077",
              "4115570              SANDALIAS HAVAIANAS AM-TOP PRINT DVS",
              "0099378    PAR   A                3.442", "0099378    PAR   A                   50"]
    html = "<html><body><table>" + "".join(f"<tr><td>{l.replace(' ', '&nbsp;')}</td></tr>" for l in linhas) + "</table>"
    df = leitura.ler_arquivo("MB52.htm", html.encode("cp1252"))
    assert leitura.identificar(df.columns) == MB52
    resumo, _ = bases.preparar_mb52(df)
    est = resumo.set_index("Material")["Estoque"].to_dict()
    assert est == {"48737": 6.0, "84518": 2502.077, "4115570": 3492.0}
    assert resumo.set_index("Material").loc["4115570", "UM"] == "PAR"


# ----------------------------------------------------------------------------
# IW38OP, IW28, IH08
# ----------------------------------------------------------------------------
def test_operacoes_iw38op():
    cru = pd.DataFrame({
        "Campo de ordenação": ["41018958"] * 2, "Tipo de ordem": ["YM15"] * 2, "Ordem": ["31682290", "31682290"],
        "Centro de trabalho": ["ELE_GPA", "MECA"], "Operação": ["0010", "0020"], "Equipamento": ["41019190"] * 2,
        "Denominação do objeto técnico": ["INJ PVC 08"] * 2, "Duração normal": [180, 60], "Número": [1, 2],
        "Trabalho": [180, 90], "Status do sistema": ["CONF ENTE", "LIB"], "Unidade do trabalho": ["MIN", "MIN"],
        "1ª data de início": [datetime(2026, 1, 9)] * 2, "Txt.breve operação": ["ANOMALIA", "AJUSTE"],
    })
    assert leitura.identificar(cru.columns) == OPER  # não confunde com IW38
    op = bases.preparar_operacoes(cru)
    assert list(op["Horas"]) == [3.0, 1.5]
    assert list(op["Concluída"]) == [True, False]


def test_notas_iw28_e_cadastro_ih08():
    notas = pd.DataFrame({
        "Nota": ["14326928", "14327096", None], "Ordem": [None, "32239601", None], "Tipo de nota": ["Y1", "Y2", None],
        "Centro trab.respons.": ["COMPONEN", "OPER_MTZ", None], "Denominação do objeto técnico": ["INJETORA 07", "", None],
        "Descrição": ["HASTE DANIFICADA", "VENTILADORES", None], "Equipamento": ["41040844", "", None],
        "Parada": ["X", "", None], "Duração da parada": [0, 0, None], "Data da nota": [datetime(2026, 10, 1)] * 3,
        "Código ABC": ["A", "", None], "Denominação do loc.instalação": ["INJETORAS", "MATRIZARIA", None],
    })
    assert leitura.identificar(notas.columns) == NOTAS
    n = bases.preparar_notas(notas, hoje=pd.Timestamp(2026, 10, 4))
    assert list(n["Nota"]) == ["14326928"]  # sem linha vazia e sem Matrizaria
    assert n["Com parada"].iat[0] and not n["Com ordem"].iat[0] and n["Dias"].iat[0] == 3

    ih08 = pd.DataFrame({"Campo de ordenação": ["", ""], "Equipamento": ["430003", "41040844"],
                         "Denominação do objeto técnico": ["BALANCIN ALFA (DESATIVADO)", "INJETORA 07"],
                         "Localização": ["0001", "GAL1"], "Código ABC": ["A", "b"]})
    assert leitura.identificar(ih08.columns) == EQUIP
    eq = bases.preparar_equipamentos(ih08)
    assert list(eq["Desativado"]) == [True, False]
    assert list(eq["Código ABC"]) == ["A", "B"]
    assert bases.ABC_PARA_CRITICIDADE["B"] == "Média"


# ----------------------------------------------------------------------------
# IP19 "geral": uma linha por operação, situação em St.solicitação, sem ordem
# ----------------------------------------------------------------------------
def ip19_geral():
    base = {"Centro localização": "A026", "Plano de manutenção": "41921", "Localização": "UTIL", "Grp.plnj.PM": "PM3",
            "Tipo de ordem": "YM13", "Texto plano manut.": "PLANO DE INSP.GERADOR 01", "Estrat.manutenção": "YPM261",
            "Pacotes vencidos": "M", "Centro trab.respons.": "UTILIDAD", "Trabalho": 0}
    linhas = []
    for data, st in [(datetime(2026, 8, 1), "Programado,concluído (Inspeção)"),
                     (datetime(2026, 9, 1), "Programado,solicitado (Inspeção)"),
                     (datetime(2026, 9, 15), "Programado,espera (Inspeção)"),
                     (datetime(2026, 10, 1), "Programado,ignorado (Inspeção)"),
                     (datetime(2026, 11, 1), "Programado,espera (Inspeção)")]:
        for grupo in (1, 2, 3):  # três operações por chamada
            linhas.append({**base, "Data planejada": data, "Semana do ano": f"2026/{data.isocalendar().week}",
                           "Numerador de grupos": grupo, "St.solicitação": st})
    linhas.append({**base, "Plano de manutenção": "90000", "Centro trab.respons.": "OPER_MTZ",
                   "Data planejada": datetime(2026, 9, 1), "St.solicitação": "Programado,espera (Preventiva)"})
    linhas.append({**base, "Plano de manutenção": "53149", "Centro trab.respons.": "ELMCPILT",
                   "Texto plano manut.": "PM.INSP.INJ. GEK 220 01 FAB PILOTO",
                   "Data planejada": datetime(2026, 9, 1), "St.solicitação": "Programado,espera (Inspeção)"})
    return pd.DataFrame(linhas)


def test_ip19_geral():
    cru = ip19_geral()
    assert leitura.identificar(cru.columns) == IP19
    ip = planos.preparar_ip19(cru)
    assert len(ip) == 5 and set(ip["Operações"]) == {3}  # uma chamada por data; Matrizaria e Fábrica Piloto fora
    assert set(ip["Atividade"]) == {"Inspeção"} and set(ip["Pacote"]) == {"M"}

    # IW38 com a ordem do plano 41921 criada para a chamada de 01/09 (data-base 02/09) e outra
    # ordem do mesmo plano perto da chamada "em espera" de 15/09, que não pode ser ligada a ela
    iw = iw38_2026().iloc[:2].copy()
    iw["Plano de manutenção"] = ["", "41921"]  # a 2ª ordem é do plano 41921
    iw.loc[1, "Data-base do início"] = datetime(2026, 9, 2)
    iw38, _ = bases.preparar_iw38(iw)
    ch = planos.classificar(ip, iw38, pd.Timestamp(2026, 10, 4)).set_index("Data planejada")
    assert ch.loc["2026-09-01", "Ordem"] == "31697096"
    assert ch.loc["2026-09-15", "Ordem"] == ""
    assert ch.loc["2026-08-01", "Situação"] == planos.CONCLUIDA
    assert ch.loc["2026-09-01", "Situação"] == planos.ATRASADA      # solicitada, ordem ainda liberada, data passou
    assert ch.loc["2026-09-15", "Situação"] == planos.ATRASADA      # em espera e já venceu
    assert ch.loc["2026-10-01", "Situação"] == planos.SALTADA       # ignorada
    assert ch.loc["2026-11-01", "Situação"] == planos.PROGRAMADA


def test_concluida_so_com_conf_e_ente():
    iw = iw38_2026().iloc[:1]
    iw = pd.concat([iw] * 5, ignore_index=True)
    iw["Ordem"] = ["1", "2", "3", "4", "5"]
    iw["Status do sistema"] = ["CONF ENTE CAPC", "ENTE CAPC NOLQ", "ENCE", "LIB CONF CAPC", "ABER"]
    prep, _ = bases.preparar_iw38(iw, hoje=pd.Timestamp(2026, 10, 4))
    sit = dict(zip(prep["Ordem"], prep["Situação"]))
    assert sit == {"1": "Concluída", "2": bases.ENCERRADA_SEM_CONF, "3": bases.ENCERRADA_SEM_CONF,
                   "4": "Liberada", "5": "Aberta"}
    assert set(prep.loc[prep["Situação"].isin(bases.PENDENTES), "Ordem"]) == {"2", "3", "4", "5"}
