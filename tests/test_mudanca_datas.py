"""Programação do mês e mudança de datas: consultas, lotes e o robô contra um SAP simulado (IW38/IW32/IW33)."""

import json
from datetime import date, datetime, timezone

import pandas as pd
import pytest

from automacao import robo_sap
from central import calendario as cal
from central import mudanca_datas as md

T = pd.Timestamp


def _ordens():
    return pd.DataFrame({
        "Ordem": ["1", "2", "3", "4", "5", "6"],
        "Campo de ordenação": ["M1", "M1", "M1", "M2", "M2", "M3"],
        "Equipamento": ["E1", "E1", "E1", "M2", "M2", "M3"],
        "Objeto técnico": ["INJ 15", "INJ 15", "INJ 15", "PRENSA", "PRENSA", "X"],
        "Texto": ["a", "b", "c", "d", "e", "f"], "Tipo": ["YM13"] * 6,
        "Situação": ["Liberada", "Aberta", "Concluída", "Liberada", "Liberada", "Liberada"],
        "Início": [T("2026-10-01"), T("2026-10-20"), T("2026-10-02"), T("2026-09-25"), T("2026-10-08"), T("2026-10-06")],
        "Fim": [T("2026-10-03"), T("2026-10-20"), T("2026-10-02"), T("2026-09-25"), T("2026-10-09"), T("2026-10-06")],
    })


def test_campos_digitados_e_nome_do_ativo():
    assert md.separar_campos(" m1, 41020389;M1\n41019661 ") == ["M1", "41020389", "41019661"]
    nomes = md.nomes_de_ativos(_ordens(), pd.DataFrame({"Equipamento": ["M2"], "Denominação": ["PRENSA HIDRÁULICA"]}))
    assert nomes["M1"] == "INJ 15" and nomes["M2"] == "PRENSA HIDRÁULICA" and nomes["E1"] == "INJ 15"
    prog = {"2026-10-07": {"campos": ["m1", " "], "atualizado_em": "x"}, "lixo": ["M2"], "2026-10-08": {"campos": []}}
    assert md.programacao_valida(prog) == {"2026-10-07": ["M1"]}


def test_consultas_dividem_o_mes_entre_as_paradas():
    prog = {"2026-10-07": ["M1", "M2"], "2026-10-21": ["M1"], "2026-11-04": ["M1"]}
    c = md.consultas(prog, date(2026, 10, 1), date(2026, 10, 31))
    assert c == [
        {"dia": "2026-10-07", "campos": ["M1"], "de": "2026-10-01", "ate": "2026-10-07"},   # 1ª parada de M1
        {"dia": "2026-10-07", "campos": ["M2"], "de": "2026-10-01", "ate": "2026-10-31"},   # única parada de M2
        {"dia": "2026-10-21", "campos": ["M1"], "de": "2026-10-08", "ate": "2026-10-31"},   # última leva o resto
    ]
    c = md.consultas(prog, date(2026, 10, 1), date(2026, 10, 10), atrasadas=True)
    assert [(x["campos"], x["de"]) for x in c] == [(["M1"], "2000-01-01"), (["M2"], "2000-01-01")]
    est = md.estimativa(_ordens(), c, concluidas={"9"}, nomes={"M1": "INJ 15"})
    assert list(est["Ordem"]) == ["1", "4", "5"]   # M1 até 07/10 (2 é depois; 3 concluída); M2 até o fim do mês


def test_estimativa_respeita_janela_e_iw47():
    c = md.consultas({"2026-10-07": ["M1", "M2"]}, date(2026, 10, 1), date(2026, 10, 31))
    est = md.estimativa(_ordens(), c, concluidas={"5"})
    assert set(est["Ordem"]) == {"1", "2"}         # M1 no mês (3 concluída); M2: 4 é de setembro e 5 encerrada na IW47


def test_lote_resultado_desfazer_e_calendario_principal():
    cons = md.consultas({"2026-10-07": ["M1"]}, date(2026, 10, 1), date(2026, 10, 31))
    lote_id, lote = md.novo_lote(cons, "ANA")
    assert lote["status"] == md.SOLICITADA and md.job(lote_id, lote)["consultas"] == cons
    res = {"fim": "2026-10-07T12:00:00+00:00",
           "itens": [{"ordem": "1", "dia": "2026-10-07", "campo": "M1", "ok": True, "mensagem": "gravada",
                      "inicio_sap": "2026-10-01", "fim_sap": "2026-10-03"},
                     {"ordem": "2", "dia": "2026-10-07", "campo": "M1", "ok": False, "mensagem": "bloqueada"}],
           "consultas": [{"dia": "2026-10-07", "campos": ["M1"], "encontradas": 2, "erro": ""}]}
    feito = md.aplicar_resultado(lote, res)
    assert feito["status"] == md.COM_ERROS and len(feito["itens"]) == 2
    assert feito["itens"][0] | {} == {**feito["itens"][0], "de_inicio": "2026-10-01", "para_inicio": "2026-10-07",
                                     "para_fim": "2026-10-07", "resultado": "ok"}
    assert feito["resumo"] == "1 ordem(ns) alteradas, 1 com erro"
    # o calendário principal passa a mostrar a nova data até o próximo export do IW38
    ajustes = md.datas_alteradas({lote_id: feito}, datetime(2026, 10, 6, tzinfo=timezone.utc))
    assert ajustes == {"1": ("2026-10-07", "2026-10-07")}
    assert md.datas_alteradas({lote_id: feito}, datetime(2026, 10, 8, tzinfo=timezone.utc)) == {}
    o = cal.com_datas_alteradas(_ordens().assign(Data=_ordens()["Início"]), ajustes).set_index("Ordem")
    assert o.loc["1", "Data"] == o.loc["1", "Início"] == T("2026-10-07") and o.loc["1", "Fim"] == T("2026-10-07") and o.loc["1", "Ajustada"]
    _, volta = md.lote_desfazer(feito, "ANA")
    assert volta["itens"] == [{"ordem": "1", "campo": "M1", "dia": "2026-10-01", "de_inicio": "2026-10-07",
                               "de_fim": "2026-10-07", "para_inicio": "2026-10-01", "para_fim": "2026-10-03",
                               "resultado": "", "mensagem": ""}]
    assert md.job("X", volta)["itens"] == [{"ordem": "1", "inicio": "2026-10-01", "fim": "2026-10-03"}]
    erro = md.aplicar_resultado(lote, {"erro": "SAP fechado", "itens": []})
    assert erro["status"] == md.COM_ERROS and "SAP fechado" in erro["resumo"]
    with pytest.raises(ValueError):
        md.novo_lote([], "ANA")


# ----------------------------------------------------------------------------
# Robô contra um SAP simulado (IW38 com seleção múltipla, IW32, IW33)
# ----------------------------------------------------------------------------
class Campo:
    def __init__(self, sap, nome, text="", changeable=True, id_=""):
        self._sap, self.nome, self.text, self.Changeable, self.Id = sap, nome, text, changeable, id_
        self.selected = False


class Lista:
    def __init__(self, itens):
        self._i, self.Count = itens, len(itens)

    def __call__(self, n):
        return self._i[n]


class Janela:
    def __init__(self, sap, n=0):
        self._sap, self._n = sap, n
        self.Text = "Seleção múltipla" if n else ""

    def sendVKey(self, k):
        self._sap.tecla(k)

    def findByName(self, nome, tipo):
        return self._sap.campos.get(nome)

    @property
    def Children(self):
        return Lista(self._sap.rotulos if self._sap.tela == "IW38" else [])


class Botao:
    def __init__(self, acao):
        self._acao = acao

    def press(self):
        self._acao()


class Tabela:
    def __init__(self, sap):
        self._sap, self.VisibleRowCount = sap, 2               # 2 linhas visíveis: força rolar
        self.verticalScrollbar = type("B", (), {})()
        self.verticalScrollbar.position = 0


class Celula:
    def __init__(self, sap, linha):
        self._sap, self._linha = sap, linha

    @property
    def text(self):
        return ""

    @text.setter
    def text(self, v):
        self._sap.multi[self._sap.tabela.verticalScrollbar.position + self._linha] = v


class Grade:
    def __init__(self, ordens):
        self._o, self.RowCount, self.firstVisibleRow = ordens, len(ordens), 0

    def GetCellValue(self, i, col):
        return {"AUFNR": "000" + self._o[i][0], "EQFNR": self._o[i][1]}[col]


class SAPOrdens:
    """IW38 (seleção com seta à direita), IW32/IW33 mínimas."""

    def __init__(self, ordens):
        self.ordens = {k: dict(v) for k, v in ordens.items()}
        self.tela, self.ordem, self.campos, self.popup, self.grade = "", None, {}, False, None
        self.okcd, self.num = Campo(self, "okcd"), Campo(self, "AUFNR")
        self.sbar = type("S", (), {"MessageType": "", "Text": ""})()
        self.sel = {k: Campo(self, k) for k in ("EQFNR-LOW", "DATUV", "DATUB")}
        self.chk = {k: Campo(self, k) for k in ("DY_OFN", "DY_IAR", "DY_MAB", "DY_HIS")}
        self.rotulos = [Campo(self, "", id_="/app/con[0]/ses[0]/wnd[0]/usr/txt%_AUFNR_%_APP_%-TEXT"),
                        Campo(self, "", id_="/app/con[0]/ses[0]/wnd[0]/usr/txt%_EQFNR_%_APP_%-TEXT")]
        self.rotulos[0].text, self.rotulos[1].text = "Ordem", "Campo de ordenação"
        for r in self.rotulos:
            r.Text = r.text
        self.multi, self.campos_iw38, self.tabela = {}, [], Tabela(self)

    def msg(self, tipo="", texto=""):
        self.sbar.MessageType, self.sbar.Text = tipo, texto

    def findById(self, id_):
        mapa = {"wnd[0]": Janela(self), "wnd[0]/usr": Janela(self), "wnd[0]/tbar[0]/okcd": self.okcd,
                "wnd[0]/sbar": self.sbar, "wnd[0]/tbar[0]/btn[11]": Botao(self.gravar)}
        if self.tela in ("IW32", "IW33") and self.ordem is None:
            mapa["wnd[0]/usr/ctxtCAUFVD-AUFNR"] = self.num
        if self.tela == "IW38" and not self.popup:
            mapa |= {f"wnd[0]/usr/ctxt{k}": v for k, v in self.sel.items()}
            mapa |= {f"wnd[0]/usr/chk{k}": v for k, v in self.chk.items()}
            mapa["wnd[0]/usr/btn%_EQFNR_%_APP_%-VALU_PUSH"] = Botao(self.abrir_multipla)
            if self.grade is not None:
                mapa[robo_sap.GRADE_IW38] = self.grade
        if self.popup:
            mapa |= {"wnd[1]": Janela(self, 1), "wnd[1]/tbar[0]/btn[16]": Botao(self.multi.clear),
                     "wnd[1]/tbar[0]/btn[8]": Botao(self.copiar), robo_sap.TABELA_MULTIPLA: self.tabela,
                     "wnd[1]/tbar[0]/btn[12]": Botao(self.cancelar)}
            mapa |= {f"{robo_sap.TABELA_MULTIPLA}/txtRSCSEL_255-SLOW_I[1,{r}]": Celula(self, r) for r in range(2)}
        if id_ not in mapa:
            raise RuntimeError(f"The control could not be found by id. ({id_})")
        return mapa[id_]

    def abrir_multipla(self):
        self.popup, self.multi = True, {0: "LIXO ANTIGO"}

    def cancelar(self):
        self.popup = False

    def copiar(self):
        self.campos_iw38 = [self.multi[k] for k in sorted(self.multi)]
        self.popup = False

    def abrir_ordem(self, num):
        o = self.ordens[num]
        self.ordem = num
        muda = self.tela in ("IW32", "IW38") and o.get("muda", True)
        self.campos = {"CAUFVD-GSTRP": Campo(self, "GSTRP", o["ini"], muda),
                       "CAUFVD-GLTRP": Campo(self, "GLTRP", o["fim"], muda),
                       "CAUFVD-AUFNR": Campo(self, "AUFNR", num)}

    def tecla(self, n):
        if self.okcd.text.startswith("/n"):
            self.tela, self.ordem, self.campos, self.grade = self.okcd.text[2:], None, {}, None
            self.okcd.text = ""
            self.msg()
            return
        if self.tela == "IW38" and self.ordem is None and n == 8:
            de, ate = (pd.to_datetime(self.sel[k].text, format="%d.%m.%Y") for k in ("DATUV", "DATUB"))
            achadas = [(k, o["campo"]) for k, o in self.ordens.items() if o["campo"] in self.campos_iw38
                       and o.get("aberta", True) and de <= pd.to_datetime(o["ini"], format="%d.%m.%Y") <= ate
                       and self.chk["DY_OFN"].selected]
            if not achadas:
                self.msg("S", "Nenhum objeto selecionado")
            elif len(achadas) == 1:
                self.abrir_ordem(achadas[0][0])
            else:
                self.grade = Grade(achadas)
            return
        if self.ordem is None and self.tela in ("IW32", "IW33"):
            if self.num.text not in self.ordens:
                self.msg("E", f"Ordem {self.num.text} não existe")
                return
            self.abrir_ordem(self.num.text)
            self.msg()
            return
        ini, fim = (pd.to_datetime(self.campos[c].text, format="%d.%m.%Y") for c in ("CAUFVD-GSTRP", "CAUFVD-GLTRP"))
        self.msg("E", "Data fim-base anterior à data início-base") if fim < ini else self.msg()

    def gravar(self):
        if self.sbar.MessageType == "E":
            return
        o = self.ordens[self.ordem]
        o["ini"], o["fim"] = self.campos["CAUFVD-GSTRP"].text, self.campos["CAUFVD-GLTRP"].text
        self.msg("S", f"Ordem {self.ordem} gravada com notificação")


MD = {"iw38_periodo_de": "wnd[0]/usr/ctxtDATUV", "iw38_periodo_ate": "wnd[0]/usr/ctxtDATUB",
      "iw38_marcar": {"wnd[0]/usr/chkDY_OFN": True, "wnd[0]/usr/chkDY_IAR": True, "wnd[0]/usr/chkDY_MAB": False}}


def _sap():
    return SAPOrdens({"100": {"ini": "01.10.2026", "fim": "03.10.2026", "campo": "M1"},
                      "101": {"ini": "15.10.2026", "fim": "15.10.2026", "campo": "M2"},
                      "102": {"ini": "20.10.2026", "fim": "21.10.2026", "campo": "M3"},
                      "103": {"ini": "02.10.2026", "fim": "02.10.2026", "campo": "M1", "aberta": False},
                      "200": {"ini": "05.10.2026", "fim": "05.10.2026", "campo": "M9", "muda": False}})


def test_robo_muda_grava_e_confere():
    sap = _sap()
    r = robo_sap.mudar_data_ordem(sap, "100", "2026-10-07", "2026-10-07", {})
    assert r["ok"] and r["inicio_sap"] == "2026-10-01" and r["fim_sap"] == "2026-10-03"
    assert sap.ordens["100"] | {} == {**sap.ordens["100"], "ini": "07.10.2026", "fim": "07.10.2026"}
    assert robo_sap.mudar_data_ordem(sap, "100", "2026-10-07", "2026-10-07", {})["mensagem"] == "já estava nesta data"


def test_robo_simulacao_nao_grava_e_erros_por_ordem():
    sap = _sap()
    r = robo_sap.mudar_data_ordem(sap, "100", "2026-10-07", "2026-10-09", {}, simular=True)
    assert r["ok"] and "simulação" in r["mensagem"] and sap.ordens["100"]["ini"] == "01.10.2026"
    assert not robo_sap.mudar_data_ordem(sap, "999", "2026-10-07", "2026-10-07", {})["ok"]       # não existe
    r = robo_sap.mudar_data_ordem(sap, "200", "2026-10-07", "2026-10-07", {})
    assert not r["ok"] and "não pode ser alterada" in r["mensagem"]                              # bloqueada
    r = robo_sap.mudar_data_ordem(sap, "100", "2026-10-09", "2026-10-07", {})
    assert not r["ok"] and "anterior" in r["mensagem"] and sap.ordens["100"]["ini"] == "01.10.2026"


def test_iw38_com_selecao_multipla():
    sap = _sap()
    achadas = robo_sap.buscar_ordens_iw38(sap, ["M1", "M2", "M3"], "2026-10-01", "2026-10-31", MD)
    assert sap.campos_iw38 == ["M1", "M2", "M3"]             # "LIXO ANTIGO" apagado; 3 valores com rolagem
    assert sap.sel["DATUV"].text == "01.10.2026" and sap.sel["DATUB"].text == "31.10.2026"
    assert achadas == [("100", "M1"), ("101", "M2"), ("102", "M3")]   # 103 concluída fica fora
    assert robo_sap.buscar_ordens_iw38(sap, ["M2"], "2026-10-01", "2026-10-31", MD) == [("101", "M2")]  # abre direto
    assert robo_sap.buscar_ordens_iw38(sap, ["M7"], "2026-10-01", "2026-10-31", MD) == []


def test_rodar_programacao_do_mes(tmp_path):
    sap = _sap()
    pedido = tmp_path / "pedido.json"
    pedido.write_text(json.dumps({"lote": "L1", "simular": False, "itens": [], "consultas": [
        {"dia": "2026-10-07", "campos": ["M1", "M3"], "de": "2026-10-01", "ate": "2026-10-31"},
        {"dia": "2026-10-09", "campos": ["M7"], "de": "2026-10-01", "ate": "2026-10-31"}]}))
    res = robo_sap.rodar_mudancas(pedido, cfg={"mudanca_datas": MD}, conectar_fn=lambda c: sap)
    salvo = json.loads((tmp_path / "pedido_resultado.json").read_text())
    assert salvo["lote"] == "L1" and not salvo["em_andamento"] and res["ok"]
    assert [(i["ordem"], i["dia"], i["campo"], i["ok"]) for i in res["itens"]] == [
        ("100", "2026-10-07", "M1", True), ("102", "2026-10-07", "M3", True)]
    assert sap.ordens["102"]["ini"] == sap.ordens["102"]["fim"] == "07.10.2026"    # início = fim = dia do calendário
    assert [c["encontradas"] for c in res["consultas"]] == [2, 0]
    lote = md.aplicar_resultado({"consultas": [], "itens": []}, res)
    assert lote["status"] == md.CONCLUIDA and lote["itens"][1]["de_inicio"] == "2026-10-20"
