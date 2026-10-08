"""Robô do SAP contra um SAP GUI simulado (o real só existe no PC da fábrica)."""

import json
from pathlib import Path

import pytest

from automacao import robo_sap


class Elemento:
    def __init__(self, sessao, id_):
        for k, v in {"text": "", "selected": False, "MessageType": "", "Text": "", "_id": id_}.items():
            object.__setattr__(self, k, v)
        object.__setattr__(self, "_s", sessao)  # daqui em diante cada alteração é registrada

    def __setattr__(self, k, v):
        object.__setattr__(self, k, v)
        if k in ("text", "selected") and hasattr(self, "_s"):
            self._s.acoes.append((self._id, k, v))

    def select(self):
        self._s.acoes.append((self._id, "select", True))

    def press(self):
        self._s.acoes.append((self._id, "press", True))
        if self._id == "wnd[1]/tbar[0]/btn[11]" and self._s.etapa == "arquivo":
            pasta = self._s.el["wnd[1]/usr/ctxtDY_PATH"].text
            nome = self._s.el["wnd[1]/usr/ctxtDY_FILENAME"].text
            Path(pasta, nome).write_text("<html><table><tr><td>48737  LAMPADA</td></tr></table></html>")
        if self._id == "wnd[1]/tbar[0]/btn[0]" and self._s.etapa == "formato":
            self._s.etapa = "arquivo"

    def sendVKey(self, n):
        s = self._s
        s.acoes.append((self._id, "vkey", n))
        if s.Info.Transaction == "S000" and n == 0:
            if s.el["wnd[0]/usr/pwdRSYST-BCODE"].text == s.senha_certa:
                s.Info.Transaction, s.Info.User = "SESSION_MANAGER", s.el["wnd[0]/usr/txtRSYST-BNAME"].text
            return
        if n == 0 and "wnd[0]/tbar[0]/okcd" in s.el:
            cmd = s.el["wnd[0]/tbar[0]/okcd"].text
            if cmd.startswith("/n"):
                s.Info.Transaction = cmd[2:] or "SESSION_MANAGER"
            elif cmd == "%PC":
                s.etapa = "formato"
        if n == 8:
            s.etapa = "lista"


class Info:
    def __init__(self, transacao, usuario):
        self.Transaction, self.User = transacao, usuario


class SessaoFalsa:
    IDS_TELA_MB52 = {"wnd[0]/usr/ctxtMATNR-LOW", "wnd[0]/usr/ctxtWERKS-LOW", "wnd[0]/usr/ctxtLGORT-LOW",
                     "wnd[0]/usr/ctxtP_VARI", "wnd[0]/usr/chkNEGATIV", "wnd[0]/usr/chkXMCHB", "wnd[0]/usr/chkNOZERO",
                     "wnd[0]/usr/chkNOVALUES", "wnd[0]/usr/radPA_HIER"}

    def __init__(self, logado=True, multi_logon=False):
        self.Info = Info("SESSION_MANAGER", "L026178609") if logado else Info("S000", "")
        self.senha_certa = "segredo"
        self.acoes, self.el, self.etapa = [], {}, ""
        self.multi_logon = multi_logon

    def findById(self, id_):
        validos = {"wnd[0]", "wnd[0]/tbar[0]/okcd", "wnd[0]/sbar"}
        if self.Info.Transaction == "S000":
            validos |= {"wnd[0]/usr/txtRSYST-MANDT", "wnd[0]/usr/txtRSYST-BNAME", "wnd[0]/usr/pwdRSYST-BCODE",
                        "wnd[0]/usr/txtRSYST-LANGU"}
        if self.multi_logon and self.Info.Transaction != "S000":
            validos |= {"wnd[1]", "wnd[1]/usr/radMULTI_LOGON_OPT2"}
        if self.Info.Transaction == "MB52":
            validos |= self.IDS_TELA_MB52
        if self.etapa == "formato":
            validos |= {robo_sap.ID_FORMATO.format(i=i) for i in range(5)} | {"wnd[1]/tbar[0]/btn[0]"}
        if self.etapa == "arquivo":
            validos |= {"wnd[1]/usr/ctxtDY_PATH", "wnd[1]/usr/ctxtDY_FILENAME", "wnd[1]/tbar[0]/btn[11]"}
        if id_ not in validos:
            raise RuntimeError(f"The control could not be found by id. ({id_})")
        return self.el.setdefault(id_, Elemento(self, id_))


class Colecao:
    def __init__(self, itens):
        self._i = itens
        self.Count = len(itens)

    def __call__(self, n):
        return self._i[n]


def gui_com(sessao):
    conexao = type("C", (), {"Children": Colecao([sessao] if sessao else [])})()
    app = type("A", (), {"Children": Colecao([conexao]), "OpenConnection": lambda self, nome, sync: conexao})()
    return type("G", (), {"GetScriptingEngine": app})()


def cfg(tmp_path):
    c = robo_sap.carregar_config(local=tmp_path / "nao_existe.toml")
    c["pasta_destino"] = str(tmp_path / "SITE")
    return c


def test_config_da_mb52():
    c = robo_sap.carregar_config(local=Path("/nao/existe.toml"))
    mb52 = c["transacao"][0]
    assert mb52["codigo"] == "MB52" and mb52["arquivo"] == "MB52.htm" and mb52["formato"] == "html"
    assert mb52["campos"]["wnd[0]/usr/ctxtWERKS-LOW"] == "A026"
    assert mb52["campos"]["wnd[0]/usr/ctxtLGORT-LOW"] == "I26"
    assert mb52["campos"]["wnd[0]/usr/ctxtP_VARI"] == "/JEFERSON"
    assert c["pasta_destino"].replace("\\", "/").endswith("Downloads/SITE")
    assert c["sap"]["mandante"] == "702"


def test_sessao_logada_exporta_mb52_sem_pedir_senha(tmp_path):
    s = SessaoFalsa(logado=True)
    c = cfg(tmp_path)
    sessao = robo_sap.conectar(c, credenciais=lambda: pytest.fail("não devia pedir senha"), obter_gui=lambda: gui_com(s))
    destino = robo_sap.executar_transacao(sessao, c["transacao"][0], Path(c["pasta_destino"]), espera_arquivo=2)
    assert destino.name == "MB52.htm" and destino.read_text().startswith("<html>")
    feito = [(i, k, v) for i, k, v in s.acoes]
    assert ("wnd[0]/usr/ctxtWERKS-LOW", "text", "A026") in feito
    assert ("wnd[0]/usr/ctxtLGORT-LOW", "text", "I26") in feito
    assert ("wnd[0]/usr/ctxtP_VARI", "text", "/JEFERSON") in feito
    assert ("wnd[0]/usr/chkXMCHB", "selected", True) in feito
    assert ("wnd[0]/usr/chkNEGATIV", "selected", False) in feito
    assert ("wnd[0]/usr/radPA_HIER", "select", True) in feito
    assert ("wnd[0]", "vkey", 8) in feito                                    # executar
    assert (robo_sap.ID_FORMATO.format(i=3), "select", True) in feito         # Format.HTML
    assert ("wnd[1]/tbar[0]/btn[11]", "press", True) in feito                 # Substituir
    assert feito[-2:] == [("wnd[0]/tbar[0]/okcd", "text", "/n"), ("wnd[0]", "vkey", 0)]  # volta ao menu


def test_login_quando_nao_ha_sessao_logada(tmp_path):
    s = SessaoFalsa(logado=False, multi_logon=True)
    sessao = robo_sap.conectar(cfg(tmp_path), credenciais=lambda: ("L026178609", "segredo"), obter_gui=lambda: gui_com(s))
    assert sessao.Info.User == "L026178609"
    feito = dict(((i, k), v) for i, k, v in s.acoes)
    assert feito[("wnd[0]/usr/txtRSYST-MANDT", "text")] == "702"
    assert feito[("wnd[0]/usr/txtRSYST-LANGU", "text")] == "PT"
    assert ("wnd[1]/usr/radMULTI_LOGON_OPT2", "select") in feito  # "continuar sem encerrar as outras sessões"


def test_senha_errada(tmp_path):
    s = SessaoFalsa(logado=False)
    with pytest.raises(robo_sap.RoboErro, match="Login no SAP não aceito"):
        robo_sap.conectar(cfg(tmp_path), credenciais=lambda: ("L026178609", "errada"), obter_gui=lambda: gui_com(s))


def test_campo_inexistente_diz_o_passo(tmp_path):
    s = SessaoFalsa(logado=True)
    c = cfg(tmp_path)
    t = dict(c["transacao"][0])
    t["campos"] = {**t["campos"], "wnd[0]/usr/ctxtNAOEXISTE-LOW": "x"}
    with pytest.raises(robo_sap.RoboErro, match=r"MB52 · preenchendo wnd\[0\]/usr/ctxtNAOEXISTE-LOW"):
        robo_sap.executar_transacao(s, t, Path(c["pasta_destino"]), espera_arquivo=1)


def test_rodar_grava_status_para_o_site(tmp_path):
    s = SessaoFalsa(logado=True)
    arq = tmp_path / "status.json"
    st = robo_sap.rodar(cfg=cfg(tmp_path), conectar_fn=lambda c: s, arq_status=arq)
    assert st["ok"] and not st["em_andamento"]
    assert json.loads(arq.read_text())["transacoes"]["MB52"]["ok"]

    def sem_sap(c):
        raise robo_sap.RoboErro("SAP Logon não encontrado neste PC.")
    st = robo_sap.rodar(cfg=cfg(tmp_path), conectar_fn=sem_sap, arq_status=arq)
    assert not st["ok"] and "SAP Logon" in st["erro"]


def test_usa_a_sessao_do_mandante_certo(tmp_path):
    qas, prd = SessaoFalsa(logado=True), SessaoFalsa(logado=True)
    qas.Info.Client, prd.Info.Client = "300", "702"
    cons = [type("C", (), {"Children": Colecao([x])})() for x in (qas, prd)]
    gui = type("G", (), {"GetScriptingEngine": type("A", (), {"Children": Colecao(cons)})()})()
    sessao = robo_sap.conectar(cfg(tmp_path), credenciais=lambda: pytest.fail("não devia pedir senha"),
                               obter_gui=lambda: gui)
    assert sessao is prd                          # o 1º SAP aberto (outro mandante) não é tocado
    gui_so_qas = type("G", (), {"GetScriptingEngine": type("A", (), {"Children": Colecao(cons[:1])})()})()
    with pytest.raises(robo_sap.RoboErro, match="mandante 300 e o robô trabalha no 702"):
        robo_sap.conectar(cfg(tmp_path), credenciais=lambda: pytest.fail("não devia pedir senha"),
                          obter_gui=lambda: gui_so_qas)
