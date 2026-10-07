"""Mudança de datas pelo calendário: proposta, lotes e o robô contra um SAP simulado (IW32/IW33)."""

import json
from datetime import date

import pandas as pd
import pytest

from automacao import robo_sap
from central import mudanca_datas as md

T = pd.Timestamp


def _ordens():
    return pd.DataFrame({
        "Ordem": ["1", "2", "3", "4", "5", "6"],
        "Campo de ordenação": ["M1", "M1", "M1", "M2", "M2", "M3"],
        "Objeto técnico": ["INJ 15", "INJ 15", "INJ 15", "PRENSA", "PRENSA", "X"],
        "Texto": ["a", "b", "c", "d", "e", "f"], "Tipo": ["YM13"] * 6, "Natureza": ["Plano de manutenção"] * 6,
        "Situação": ["Liberada", "Aberta", "Concluída", "Liberada", "Liberada", "Liberada"],
        "Início": [T("2026-10-01"), T("2026-10-20"), T("2026-10-02"), T("2026-10-05"), T("2026-10-08"), T("2026-10-06")],
        "Fim": [T("2026-10-03"), T("2026-10-20"), T("2026-10-02"), T("2026-10-05"), T("2026-10-09"), T("2026-10-06")],
    })


def test_maquinas_com_nome_e_pendentes():
    equip = pd.DataFrame({"Equipamento": ["M2"], "Denominação": ["PRENSA HIDRÁULICA"]})
    m = md.maquinas(_ordens(), equip).set_index("Campo de ordenação")
    assert m.loc["M1", "Pendentes"] == 2 and m.loc["M1", "Máquina"] == "INJ 15"
    assert m.loc["M2", "Máquina"] == "PRENSA HIDRÁULICA" and m.loc["M2", "Rótulo"] == "M2 · PRENSA HIDRÁULICA"


def test_proposta_atrasadas_e_ate_o_dia():
    p, avisos = md.propor(_ordens(), {"2026-10-07": ["M1"], "2026-10-08": ["M2"]}, md.ESCOPO_ATE_DIA)
    p = p.set_index("Ordem")
    assert set(p.index) == {"1", "4"}            # 2 é depois do dia; 3 concluída; 5 já está no dia 08; M3 não pedida
    assert p.loc["1", "Novo início"] == T("2026-10-07") and p.loc["1", "Novo fim"] == T("2026-10-09")  # 2 dias
    assert p.loc["4", "Novo início"] == T("2026-10-08") and p.loc["4", "Novo fim"] == T("2026-10-08")
    assert not avisos


def test_proposta_todas_concluidas_pela_iw47_e_maquina_repetida():
    p, avisos = md.propor(_ordens(), {"2026-10-07": ["M1"], "2026-10-09": ["M1"]}, md.ESCOPO_TODAS,
                          concluidas={"2"})
    assert list(p["Ordem"]) == ["1"] and len(avisos) == 1   # 2 encerrada na IW47; M1 fica no 1º dia
    p, _ = md.propor(_ordens(), {"2026-10-07": ["M2"]}, md.ESCOPO_PERIODO, date(2026, 10, 6), date(2026, 10, 12))
    assert list(p["Ordem"]) == ["5"]                       # só a de início dentro do período


def test_lote_desfazer_e_resultado():
    p, _ = md.propor(_ordens(), {"2026-10-07": ["M1"], "2026-10-08": ["M2"]})
    p.loc[p["Ordem"] == "4", "Mudar"] = False
    lote_id, lote = md.novo_lote(p, "ANA")
    assert lote["status"] == md.SOLICITADA and [i["ordem"] for i in lote["itens"]] == ["1"]
    assert md.job(lote_id, lote)["itens"] == [{"ordem": "1", "inicio": "2026-10-07", "fim": "2026-10-09"}]
    feito = md.aplicar_resultado(lote, {"itens": [{"ordem": "1", "ok": True, "mensagem": "gravada",
                                                   "inicio_sap": "2026-09-30", "fim_sap": "2026-10-02"}]})
    assert feito["status"] == md.CONCLUIDA and feito["itens"][0]["de_inicio"] == "2026-09-30"
    _, volta = md.lote_desfazer(feito, "ANA")
    assert volta["itens"][0]["para_inicio"] == "2026-09-30" and volta["itens"][0]["para_fim"] == "2026-10-02"
    assert volta["origem"] == "desfazer"
    erro = md.aplicar_resultado(lote, {"erro": "SAP fechado", "itens": []})
    assert erro["status"] == md.COM_ERROS and "SAP fechado" in erro["resumo"]
    with pytest.raises(ValueError):
        md.novo_lote(p.assign(Mudar=False), "ANA")


def test_programacao_valida():
    prog = {"2026-10-07": {"campos": ["M1", " "], "atualizado_em": "x"}, "lixo": ["M2"], "2026-10-08": {"campos": []}}
    assert md.programacao_valida(prog) == {"2026-10-07": ["M1"]}


# ----------------------------------------------------------------------------
# Robô contra um SAP simulado (IW32 / IW33)
# ----------------------------------------------------------------------------
class Campo:
    def __init__(self, sap, nome, text="", changeable=True):
        self._sap, self.nome, self.text, self.Changeable = sap, nome, text, changeable


class Janela:
    def __init__(self, sap):
        self._sap = sap

    def sendVKey(self, n):
        self._sap.tecla(n)

    def findByName(self, nome, tipo):
        return self._sap.campos.get(nome)


class Botao:
    def __init__(self, sap):
        self._sap = sap

    def press(self):
        self._sap.gravar()


class SAPOrdens:
    """IW32/IW33 mínimas: abre a ordem, valida as datas no Enter e grava no botão Gravar."""

    def __init__(self, ordens):
        self.ordens = {k: dict(v) for k, v in ordens.items()}
        self.tela, self.ordem, self.campos = "", None, {}
        self.okcd, self.num = Campo(self, "okcd"), Campo(self, "AUFNR")
        self.sbar = type("S", (), {"MessageType": "", "Text": ""})()

    def msg(self, tipo="", texto=""):
        self.sbar.MessageType, self.sbar.Text = tipo, texto

    def findById(self, id_):
        mapa = {"wnd[0]": Janela(self), "wnd[0]/usr": Janela(self), "wnd[0]/tbar[0]/okcd": self.okcd,
                "wnd[0]/sbar": self.sbar, "wnd[0]/tbar[0]/btn[11]": Botao(self)}
        if self.tela in ("IW32", "IW33"):
            mapa["wnd[0]/usr/ctxtCAUFVD-AUFNR"] = self.num
        if id_ not in mapa:
            raise RuntimeError(f"The control could not be found by id. ({id_})")
        return mapa[id_]

    def tecla(self, n):
        if self.okcd.text.startswith("/n"):
            self.tela, self.ordem, self.campos = self.okcd.text[2:], None, {}
            self.okcd.text = ""
            self.msg()
            return
        if self.ordem is None and self.tela in ("IW32", "IW33"):
            o = self.ordens.get(self.num.text)
            if o is None:
                self.msg("E", f"Ordem {self.num.text} não existe")
                return
            self.ordem = self.num.text
            muda = self.tela == "IW32" and o.get("muda", True)
            self.campos = {"CAUFVD-GSTRP": Campo(self, "GSTRP", o["ini"], muda),
                           "CAUFVD-GLTRP": Campo(self, "GLTRP", o["fim"], muda)}
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


def _sap():
    return SAPOrdens({"100": {"ini": "01.10.2026", "fim": "03.10.2026"},
                      "200": {"ini": "05.10.2026", "fim": "05.10.2026", "muda": False}})


def test_robo_muda_grava_e_confere():
    sap = _sap()
    r = robo_sap.mudar_data_ordem(sap, "100", "2026-10-07", "2026-10-09", {})
    assert r["ok"] and r["inicio_sap"] == "2026-10-01" and r["fim_sap"] == "2026-10-03"
    assert sap.ordens["100"] == {"ini": "07.10.2026", "fim": "09.10.2026"}


def test_robo_simulacao_nao_grava_e_erros_por_ordem():
    sap = _sap()
    r = robo_sap.mudar_data_ordem(sap, "100", "2026-10-07", "2026-10-09", {}, simular=True)
    assert r["ok"] and "simulação" in r["mensagem"] and sap.ordens["100"]["ini"] == "01.10.2026"
    assert not robo_sap.mudar_data_ordem(sap, "999", "2026-10-07", "2026-10-07", {})["ok"]       # não existe
    r = robo_sap.mudar_data_ordem(sap, "200", "2026-10-07", "2026-10-07", {})
    assert not r["ok"] and "não pode ser alterada" in r["mensagem"]                              # bloqueada
    r = robo_sap.mudar_data_ordem(sap, "100", "2026-10-09", "2026-10-07", {})
    assert not r["ok"] and "anterior" in r["mensagem"] and sap.ordens["100"]["ini"] == "01.10.2026"


def test_rodar_mudancas_grava_resultado_para_o_site(tmp_path):
    sap = _sap()
    pedido = tmp_path / "pedido.json"
    pedido.write_text(json.dumps({"lote": "L1", "simular": False, "itens": [
        {"ordem": "100", "inicio": "2026-10-07", "fim": "2026-10-09"},
        {"ordem": "999", "inicio": "2026-10-07", "fim": "2026-10-07"}]}))
    res = robo_sap.rodar_mudancas(pedido, cfg={"mudanca_datas": {}}, conectar_fn=lambda c: sap)
    salvo = json.loads((tmp_path / "pedido_resultado.json").read_text())
    assert salvo["lote"] == "L1" and not salvo["em_andamento"] and len(salvo["itens"]) == 2
    assert [i["ok"] for i in res["itens"]] == [True, False] and res["ok"] is False
    lote = md.aplicar_resultado({"itens": [{"ordem": "100", "resultado": ""}, {"ordem": "999", "resultado": ""}]}, res)
    assert lote["status"] == md.COM_ERROS and lote["resumo"].startswith("1 ordem(ns) alteradas, 1 com erro")
