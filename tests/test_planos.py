import io

import pandas as pd

from central import bases, leitura, planos
from central.leitura import IP19, IW38
from tests.test_dados import IW38_COLS, iw38_cru

HOJE = pd.Timestamp(2026, 10, 1)  # quinta-feira da semana ISO 40


def ip19_cru():
    linhas = [
        # plano 20976 (o mesmo da ordem 2 do IW38 de teste), semanal
        ["20976", "1", "PREV MENSAL PRENSA", "41001404", "PRENSA 01", "MECA", "Mensal", "07.09.2026", "31.08.2026", "10.09.2026", "Concluído", "9"],
        ["20976", "1", "PREV MENSAL PRENSA", "41001404", "PRENSA 01", "MECA", "Mensal", "14.09.2026", "07.09.2026", "", "Programado, chamado", "1"],
        ["20976", "1", "PREV MENSAL PRENSA", "41001404", "PRENSA 01", "MECA", "Mensal", "21.09.2026", "", "", "Programado, em espera", ""],
        ["20976", "1", "PREV MENSAL PRENSA", "41001404", "PRENSA 01", "MECA", "Mensal", "28.09.2026", "", "", "Saltado", ""],
        ["20976", "1", "PREV MENSAL PRENSA", "41001404", "PRENSA 01", "MECA", "Mensal", "05.10.2026", "28.09.2026", "", "Programado, chamado", "2"],
        ["20976", "1", "PREV MENSAL PRENSA", "41001404", "PRENSA 01", "MECA", "Mensal", "12.10.2026", "", "", "Programado, em espera", ""],
        ["20976", "1", "PREV MENSAL PRENSA", "41001404", "PRENSA 01", "MECA", "Mensal", "13.10.2026", "", "", "Programado, em espera", ""],
        ["30001", "", "LUBRIFICAÇÃO", "", "", "", "", "06.10.2025", "", "", "Programado, em espera", "3"],
    ]
    cols = ["Plano manutenção", "Item manutenção", "Texto plano manutenção", "Equipamento", "Denominação do objeto técnico",
            "Centro de trabalho", "Ciclo", "Data planejada", "Data de chamada", "Data de conclusão",
            "Tipo de programação", "Ordem"]
    return pd.DataFrame(linhas, columns=cols)


def test_identifica_ip19_sem_confundir_com_iw38():
    assert leitura.identificar(ip19_cru().columns) == IP19
    assert leitura.identificar(IW38_COLS) == IW38  # IW38 também tem "Plano de manutenção"
    buf = io.BytesIO()
    ip19_cru().to_excel(buf, index=False)
    assert leitura.sondar("export.XLSX", buf.getvalue()) == [(IP19, "Sheet1", 0)]


def test_situacao_das_chamadas_cruzando_com_iw38():
    iw38, _ = bases.preparar_iw38(iw38_cru(), hoje=HOJE)
    ch = planos.classificar(planos.preparar_ip19(ip19_cru()), iw38, HOJE)
    por_data = dict(zip(ch["Data planejada"].dt.strftime("%d/%m/%Y"), ch["Situação"]))
    assert por_data["06/10/2025"] == planos.CONCLUIDA  # ordem 3 está encerrada (ENTE CONF) no IW38
    assert por_data["07/09/2026"] == planos.CONCLUIDA
    assert por_data["14/09/2026"] == planos.ATRASADA
    assert por_data["21/09/2026"] == planos.ATRASADA
    assert por_data["28/09/2026"] == planos.SALTADA
    assert por_data["05/10/2026"] == planos.ABERTA
    assert por_data["12/10/2026"] == planos.PROGRAMADA
    # centro de trabalho vazio na IP19 é completado pela ordem do IW38
    assert ch.loc[ch["Plano"] == "30001", "Centro de trabalho"].iat[0] == "ELET"


def test_calendario_52_semanas():
    ch = planos.classificar(planos.preparar_ip19(ip19_cru()), None, HOJE)
    grade, situ = planos.montar_calendario(ch, 2026)
    assert len(grade) == 1 and grade.loc[0, "Plano"] == "20976 / 1"
    assert [c for c in grade.columns if c.startswith("S")][-1] == "S53"  # 2026 tem 53 semanas ISO
    assert situ.loc[0, "S37"] == planos.CONCLUIDA and grade.loc[0, "S37"] == "✓"
    assert situ.loc[0, "S39"] == planos.ATRASADA
    assert grade.loc[0, "S42"] == "○2"  # duas chamadas na mesma semana
    assert grade.loc[0, "Ciclo"] == "Mensal"
    assert planos.semanas_dos_meses(2026)[1] == "Jan" and "Out" in planos.semanas_dos_meses(2026).values()
    cel = planos.celulas(ch, 2026, ["20976 / 1"], {"20976 / 1": "PREV"})
    assert set(cel["Semana"]) == {37, 38, 39, 40, 41, 42}


def test_sem_ip19_usa_ordens_com_plano_do_iw38():
    iw38, _ = bases.preparar_iw38(iw38_cru(), hoje=HOJE)
    ch = planos.classificar(planos.de_iw38(iw38), iw38, HOJE)
    assert list(ch["Plano"]) == ["20976"] and ch["Situação"].iat[0] == planos.ABERTA
    grade, _ = planos.montar_calendario(ch, 2099)
    assert grade.loc[0, "Ciclo"] == ""  # uma chamada só: ciclo não estimável
