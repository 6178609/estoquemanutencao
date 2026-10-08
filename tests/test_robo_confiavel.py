"""Robô da mudança de datas à prova de falhas: nunca termina sem resultado, espera outra execução, usa
janela própria do SAP, diagnóstico passo a passo, sinal de vida do PC e atualização do código."""

import io
import json
import zipfile
from datetime import date, datetime, timedelta, timezone

import pytest

from automacao import robo_sap
from central import fontes
from central import mudanca_datas as md
from sincronizador import atualizar, sincronizar
from tests.test_mudanca_datas import MD, Lista, _sap
from tests.test_sincronizador import GitHubFalso


# ----------------------------------------------------------------------------
# Nunca termina sem resultado
# ----------------------------------------------------------------------------
def _pedido(tmp_path, conteudo):
    arq = tmp_path / "pedido.json"
    arq.write_text(conteudo if isinstance(conteudo, str) else json.dumps(conteudo))
    return arq


def test_erro_inesperado_grava_resultado_com_motivo(tmp_path):
    arq = _pedido(tmp_path, {"lote": "L1", "consultas": [{"dia": "2026-10-07", "campos": ["M1"], "de": "2026-10-01",
                                                          "ate": "2026-10-31"}], "itens": []})

    def conectar_quebrado(cfg):
        raise KeyError("Children")          # ex.: erro COM que não é RoboErro

    res = robo_sap.rodar_mudancas(arq, cfg={"mudanca_datas": MD}, conectar_fn=conectar_quebrado)
    salvo = json.loads((tmp_path / "pedido_resultado.json").read_text())
    assert not salvo["em_andamento"] and salvo["lote"] == "L1" and not res["ok"]
    assert "falha inesperada" in salvo["erro"] and "KeyError" in salvo["erro"]
    lote = md.aplicar_resultado({"status": md.EM_EXECUCAO, "consultas": [], "itens": []}, salvo)
    assert lote["status"] == md.COM_ERROS and "não terminou" in lote["resumo"]


def test_pedido_ilegivel_tambem_gera_resultado(tmp_path):
    res = robo_sap.rodar_mudancas(_pedido(tmp_path, "{quebrado"), cfg={}, conectar_fn=lambda c: None)
    assert not res["em_andamento"] and "falha inesperada" in res["erro"]
    assert json.loads((tmp_path / "pedido_resultado.json").read_text())["fim"]


def test_espera_outra_execucao_em_vez_de_ignorar(tmp_path, monkeypatch):
    fcntl = pytest.importorskip("fcntl")
    monkeypatch.setattr(robo_sap, "AQUI", tmp_path)
    monkeypatch.setattr(robo_sap.time, "sleep", lambda s: None)
    outro = open(tmp_path / ".robo.trava", "a+")           # export do SAP rodando
    fcntl.flock(outro, fcntl.LOCK_EX | fcntl.LOCK_NB)
    avisos = []
    assert not robo_sap._trava_unica(0.0001, ao_esperar=lambda: avisos.append(1))
    assert avisos == [1]                                     # avisou o site que está esperando
    arq = _pedido(tmp_path, {"lote": "L9", "itens": []})
    robo_sap._resultado_sem_trava(arq, "mudanca", final=False)
    parcial = json.loads((tmp_path / "pedido_resultado.json").read_text())
    assert parcial["em_andamento"] and "aguardando" in parcial["aguardando"]
    assert "aguardando" in md.progresso(parcial)["texto"]
    robo_sap._resultado_sem_trava(arq, "mudanca", final=True)
    final = json.loads((tmp_path / "pedido_resultado.json").read_text())
    assert final["lote"] == "L9" and not final["em_andamento"] and "outra execução" in final["erro"]
    fcntl.flock(outro, fcntl.LOCK_UN)
    outro.close()
    assert robo_sap._trava_unica(0)                          # livre: pega na hora
    robo_sap._TRAVA.close()


# ----------------------------------------------------------------------------
# Janela própria do SAP (não mexe na tela da pessoa)
# ----------------------------------------------------------------------------
class Conexao:
    def __init__(self, n=1):
        self.filhos = [SessaoSAP(self, i) for i in range(n)]

    @property
    def Children(self):
        return Lista(self.filhos)


class SessaoSAP:
    def __init__(self, con, i):
        self.Parent, self.Id, self.Busy, self.comandos = con, f"/app/con[0]/ses[{i}]", False, []
        self.okcd = type("C", (), {"text": ""})()

    def CreateSession(self):
        self.Parent.filhos.append(SessaoSAP(self.Parent, len(self.Parent.filhos)))

    def findById(self, id_):
        if id_ == "wnd[0]/tbar[0]/okcd":
            return self.okcd
        sessao = self
        return type("J", (), {"sendVKey": lambda _, k: sessao.comandos.append(sessao.okcd.text)})()


def test_robo_abre_e_fecha_a_propria_janela(monkeypatch):
    monkeypatch.setattr(robo_sap.time, "sleep", lambda s: None)
    con = Conexao(1)
    pessoa = con.filhos[0]
    nova = robo_sap._sessao_propria(pessoa)
    assert nova is not pessoa and len(con.filhos) == 2
    robo_sap._encerrar(nova)
    robo_sap._encerrar(pessoa)
    assert nova.comandos == ["/i"] and pessoa.comandos == []    # só a janela do robô é fechada
    cheia = Conexao(6)
    with pytest.raises(robo_sap.RoboErro, match="6 janelas"):
        robo_sap._sessao_propria(cheia.filhos[0])
    assert robo_sap._sessao_propria(_sap()) is not None         # sem como abrir outra: usa a atual


# ----------------------------------------------------------------------------
# Diagnóstico ("Testar o robô")
# ----------------------------------------------------------------------------
def test_diagnostico_confere_cada_passo_sem_gravar(tmp_path):
    sap = _sap()
    antes = json.dumps(sap.ordens, sort_keys=True)
    lid, lote = md.novo_diagnostico("ANA", "m1", "100", date(2026, 10, 1), date(2026, 10, 31))
    assert lote["teste"] == {"campo": "M1", "ordem": "100", "de": "2026-10-01", "ate": "2026-10-31"}
    arq = _pedido(tmp_path, md.job(lid, lote))
    res = robo_sap.diagnosticar(arq, cfg={"mudanca_datas": MD}, conectar_fn=lambda c: sap)
    assert res["ok"], res["etapas"]
    nomes = [e["etapa"] for e in res["etapas"]]
    assert "Seleção múltipla (seta à direita)" in nomes and "Datas da ordem na IW33 (só leitura)" in nomes
    assert res["ordens_encontradas"] == ["100"]
    assert any("EQFNR" in c["id"] for c in res["campos_tela"])
    assert json.dumps(sap.ordens, sort_keys=True) == antes      # nada gravado no SAP
    novo = md.aplicar_resultado({**lote, "status": md.EM_EXECUCAO}, res)
    assert novo["status"] == md.CONCLUIDA and "tudo certo" in novo["resumo"]


def test_diagnostico_aponta_o_passo_que_falhou(tmp_path):
    sap = _sap()
    sap.rotulos[1].Text = "Outro campo"                           # tela sem "Campo de ordenação"
    lid, lote = md.novo_diagnostico("ANA")
    res = robo_sap.diagnosticar(_pedido(tmp_path, md.job(lid, lote)), cfg={"mudanca_datas": MD},
                                conectar_fn=lambda c: sap)
    assert not res["ok"] and not res["em_andamento"]
    falhas = [e["etapa"] for e in res["etapas"] if not e["ok"]]
    assert falhas == ["Campo de ordenação e seta à direita"]
    novo = md.aplicar_resultado(lote, res)
    assert novo["status"] == md.COM_ERROS and "Campo de ordenação" in novo["resumo"]

    def sem_sap(cfg):
        raise robo_sap.RoboErro("O SAP Logon não abriu a tempo.")

    res = robo_sap.diagnosticar(_pedido(tmp_path, md.job(lid, lote)), cfg={"mudanca_datas": MD}, conectar_fn=sem_sap)
    assert [(e["etapa"], e["ok"]) for e in res["etapas"]] == [("Configuração do robô neste PC", True),
                                                             ("Conexão com o SAP", False)]


# ----------------------------------------------------------------------------
# Situação do robô no site
# ----------------------------------------------------------------------------
def test_situacao_do_robo_pelo_sinal_do_pc():
    agora = datetime(2026, 10, 7, 12, 0, tzinfo=timezone.utc)

    def sinal(min_atras, recursos=("mudar_datas_iw38", "diagnostico"), configurado=True):
        return {"visto_em": (agora - timedelta(minutes=min_atras)).isoformat(), "recursos": list(recursos),
                "robo_configurado": configurado, "versao_codigo": "abc1234"}

    sit = md.situacao_robo({"PC-A": sinal(3), "PC-B": sinal(5, recursos=()), "PC-C": sinal(300),
                            "PC-D": sinal(1, configurado=False)}, agora)
    assert [(s["pc"], s["estado"]) for s in sit] == [("PC-D", "nao_configurado"), ("PC-A", "ok"),
                                                     ("PC-B", "desatualizado"), ("PC-C", "offline")]
    assert md.situacao_robo({}, agora) == []
    lote = {"criado_em": (agora - timedelta(minutes=9)).isoformat(),
            "progresso": {"em": (agora - timedelta(minutes=2)).isoformat()}}
    assert md.parado_ha(lote, agora) == 2


# ----------------------------------------------------------------------------
# Sincronizador: teste do robô pela nuvem, andamento, lotes interrompidos
# ----------------------------------------------------------------------------
def test_sincronizador_teste_do_robo_andamento_e_interrompidos(monkeypatch):
    gh_falso = GitHubFalso()
    monkeypatch.setattr(fontes.requests, "Session", lambda: gh_falso)
    gh = fontes.GitHub(sincronizar._Cfg("org/dados", "t", "main"))
    lid, diag = md.novo_diagnostico("ANA", "M1")
    preso = {"status": md.EM_EXECUCAO, "consultas": [], "itens": [], "atualizado_por": f"robô ({sincronizar.platform.node()})"}
    gh.gravar(md.ARQ_LOTES, json.dumps({lid: diag, "L0": preso}).encode())

    assert sincronizar.recuperar_interrompidos(gh) == ["L0"]
    salvo = json.loads(gh_falso.arquivos["app/" + md.ARQ_LOTES])
    assert salvo["L0"]["status"] == md.COM_ERROS and "interrompido" in salvo["L0"]["resumo"]

    vistos = []

    def robo_falso(pedido, progresso=None):
        vistos.append(pedido)
        progresso({"tipo": md.DIAGNOSTICO, "em_andamento": True, "etapas": [{"etapa": "x", "ok": True}]})
        salvo = json.loads(gh_falso.arquivos["app/" + md.ARQ_LOTES])
        assert salvo[lid]["status"] == md.EM_EXECUCAO and "1 etapa" in salvo[lid]["progresso"]["texto"]
        return {"tipo": md.DIAGNOSTICO, "etapas": [{"etapa": "Conexão com o SAP", "ok": True, "detalhe": "ok"}]}

    monkeypatch.setattr(sincronizar, "_ULTIMO_SINAL", [0.0])
    assert sincronizar.executar_mudancas(gh, rodar=robo_falso) == [lid]
    assert vistos == [{"lote": lid, "tipo": md.DIAGNOSTICO, "teste": {"campo": "M1"}}]
    salvo = json.loads(gh_falso.arquivos["app/" + md.ARQ_LOTES])
    assert salvo[lid]["status"] == md.CONCLUIDA and "progresso" not in salvo[lid]
    assert "app/" + md.ARQ_ROBO_PC in gh_falso.arquivos                 # avisou o site depois do lote


# ----------------------------------------------------------------------------
# Atualização do código no PC
# ----------------------------------------------------------------------------
def _zip(arquivos: dict) -> bytes:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as z:
        z.writestr("estoquemanutencao-abc/", "")
        for nome, conteudo in arquivos.items():
            z.writestr(f"estoquemanutencao-abc/{nome}", conteudo)
    return buf.getvalue()


def test_atualizar_copia_so_o_que_mudou_e_preserva_configuracoes(tmp_path, monkeypatch):
    (tmp_path / "automacao").mkdir()
    (tmp_path / "sincronizador").mkdir()
    (tmp_path / "automacao" / "robo_sap.py").write_text("velho")
    (tmp_path / "automacao" / "transacoes.toml").write_text("ajustado neste PC")
    (tmp_path / "README.md").write_text("igual")
    (tmp_path / "sincronizador" / "config.toml").write_text("token = 'meu'")
    (tmp_path / "local.txt").write_text("só deste PC")
    pacote = _zip({"automacao/robo_sap.py": "novo", "README.md": "igual", "atualizar.bat": "@echo off",
                   "automacao/transacoes.toml": "[mudanca_datas]",
                   "sincronizador/config.toml": "token = 'do zip'", ".git/config": "x", "../fora.txt": "x"})
    monkeypatch.setattr(atualizar, "versao_remota", lambda *a: "a" * 40)
    monkeypatch.setattr(atualizar, "baixar", lambda sha, *a: pacote)
    r = atualizar.atualizar(raiz=tmp_path)
    assert sorted(r["arquivos"]) == ["atualizar.bat", "automacao/robo_sap.py", "automacao/transacoes.toml"]
    assert (tmp_path / "automacao" / "transacoes.toml.anterior").read_text() == "ajustado neste PC"
    assert (tmp_path / "automacao" / "robo_sap.py").read_text() == "novo"
    assert (tmp_path / "sincronizador" / "config.toml").read_text() == "token = 'meu'"   # config do PC fica
    assert (tmp_path / "local.txt").exists() and not (tmp_path / ".git").exists()
    assert not (tmp_path.parent / "fora.txt").exists()
    assert atualizar.versao_local(tmp_path) == "a" * 40
    assert atualizar.atualizar(raiz=tmp_path)["arquivos"] == []                    # mesma versão: nada a fazer


def test_ids_da_mudanca_de_datas_ajustados_no_robo_local(tmp_path):
    (tmp_path / "t.toml").write_text('[mudanca_datas]\ntransacao = "IW32"\niw38_periodo_de = "wnd[0]/usr/ctxtDATUV"\n'
                                     '[mudanca_datas.iw38_marcar]\n"wnd[0]/usr/chkDY_OFN" = true\n')
    (tmp_path / "l.toml").write_text('[sap]\nusuario = "X"\n[mudanca_datas]\niw38_periodo_de = "wnd[0]/usr/ctxtOUTRO"\n'
                                     '[mudanca_datas.iw38_marcar]\n"wnd[0]/usr/chkDY_MAB" = false\n')
    cfg = robo_sap.carregar_config(tmp_path / "t.toml", tmp_path / "l.toml")
    assert cfg["mudanca_datas"]["transacao"] == "IW32" and cfg["mudanca_datas"]["iw38_periodo_de"].endswith("OUTRO")
    assert cfg["mudanca_datas"]["iw38_marcar"] == {"wnd[0]/usr/chkDY_OFN": True, "wnd[0]/usr/chkDY_MAB": False}
