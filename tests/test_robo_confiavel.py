"""Robô do SAP e PC: usa janela própria do SAP (não mexe na tela da pessoa) e o código se atualiza sozinho."""

import io
import zipfile

import pytest

from automacao import robo_sap
from sincronizador import atualizar


class Lista:
    def __init__(self, itens):
        self._i, self.Count = itens, len(itens)

    def __call__(self, n):
        return self._i[n]


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
    sem_conexao = object()
    assert robo_sap._sessao_propria(sem_conexao) is sem_conexao   # sem como abrir outra: usa a atual


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
    (tmp_path / "central").mkdir()
    (tmp_path / "central" / "app.py").write_text("site antigo")
    (tmp_path / "streamlit_app.py").write_text("site antigo")
    pacote = _zip({"automacao/robo_sap.py": "novo", "README.md": "igual", "atualizar.bat": "@echo off",
                   "automacao/transacoes.toml": "[sap]",
                   "sincronizador/config.toml": "token = 'do zip'", ".git/config": "x", "../fora.txt": "x"})
    monkeypatch.setattr(atualizar, "versao_remota", lambda *a: "a" * 40)
    monkeypatch.setattr(atualizar, "baixar", lambda sha, *a: pacote)
    r = atualizar.atualizar(raiz=tmp_path)
    assert sorted(r["arquivos"]) == ["atualizar.bat", "automacao/robo_sap.py", "automacao/transacoes.toml", "central",
                                     "streamlit_app.py"]
    assert not (tmp_path / "central").exists() and not (tmp_path / "streamlit_app.py").exists()   # site antigo sai do PC
    assert (tmp_path / "automacao" / "transacoes.toml.anterior").read_text() == "ajustado neste PC"
    assert (tmp_path / "automacao" / "robo_sap.py").read_text() == "novo"
    assert (tmp_path / "sincronizador" / "config.toml").read_text() == "token = 'meu'"   # config do PC fica
    assert (tmp_path / "local.txt").exists() and not (tmp_path / ".git").exists()
    assert not (tmp_path.parent / "fora.txt").exists()
    assert atualizar.versao_local(tmp_path) == "a" * 40
    assert atualizar.atualizar(raiz=tmp_path)["arquivos"] == []                    # mesma versão: nada a fazer
