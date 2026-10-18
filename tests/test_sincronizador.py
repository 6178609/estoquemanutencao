"""Caminho PC → GitHub (o repositório de dados que o site lê), com a API do GitHub simulada em memória."""

import base64
import hashlib
import io
import json
import os
import re
import time
from urllib.parse import unquote

import pandas as pd
import pytest

from sincronizador import fontes, leitura, sincronizar
from sincronizador.leitura import EQUIPE, IW38, MB52

IW38_COLS = ["Centro", "Denominação do loc.instalação", "Equipamento", "Denominação do objeto técnico", "Centro trab.respons.",
             "Ordem", "Plano de manutenção", "Texto breve", "Status do sistema", "Data-base do início", "Data-base do fim",
             "Data de entrada", "Criado por", "Prioridade", "Tipo de ordem", "Status usuário", "Custos tot.reais"]


def iw38_cru():
    """IW38 fictício (5 ordens, uma da Fábrica Piloto)."""
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

API = "https://api.github.com"


class Resp:
    def __init__(self, status, corpo=None, conteudo=b""):
        self.status_code, self._corpo, self.content = status, corpo, conteudo
        self.text = str(corpo)

    def json(self):
        return self._corpo


class GitHubFalso:
    """Repositório em memória: {caminho: bytes}, com sha por conteúdo e conflito de sha como no GitHub."""

    def __init__(self, repo="org/dados"):
        self.repo, self.arquivos, self.commits = repo, {}, 0
        self.headers = {}
        self.historico = 0  # commits no ramo (a compactação zera para 1)

    @staticmethod
    def sha(b):
        return hashlib.sha1(b"blob %d\0" % len(b) + b).hexdigest()

    def request(self, metodo, url, params=None, headers=None, json=None, timeout=None):
        assert self.headers["Authorization"].startswith("Bearer ")
        m = re.match(rf"{API}/repos/{self.repo}/git/trees/main$", url)
        if m:
            if not self.arquivos:
                return Resp(409, "Git Repository is empty.")
            return Resp(200, {"tree": [{"path": p, "type": "blob", "sha": self.sha(b), "size": len(b)}
                                       for p, b in self.arquivos.items()]})
        if url == f"{API}/repos/{self.repo}/git/ref/heads/main":
            return Resp(200, {"object": {"sha": "topo"}}) if self.arquivos else Resp(404, "")
        if url == f"{API}/repos/{self.repo}/git/commits/topo":
            return Resp(200, {"tree": {"sha": "arvore"}})
        if url == f"{API}/repos/{self.repo}/git/commits" and metodo == "POST":
            assert json["parents"] == [] and json["tree"] == "arvore"
            return Resp(201, {"sha": "novo"})
        if url == f"{API}/repos/{self.repo}/git/refs/heads/main" and metodo == "PATCH":
            assert json == {"sha": "novo", "force": True}
            self.historico = 1
            return Resp(200, {})
        m = re.match(rf"{API}/repos/{self.repo}/contents/(.+)$", url)
        assert m, url
        caminho = unquote(m.group(1))
        if metodo == "GET":
            if caminho not in self.arquivos:
                return Resp(404, "Not Found")
            b = self.arquivos[caminho]
            if headers and headers.get("Accept") == "application/vnd.github.raw":
                return Resp(200, conteudo=b)
            return Resp(200, {"sha": self.sha(b), "content": base64.b64encode(b).decode()})
        if metodo == "PUT":
            atual = self.arquivos.get(caminho)
            if (atual is None) != ("sha" not in json) or (atual is not None and json["sha"] != self.sha(atual)):
                return Resp(409, "sha does not match")
            self.arquivos[caminho] = base64.b64decode(json["content"])
            self.commits += 1
            self.historico += 1
            return Resp(201 if atual is None else 200, {})
        raise AssertionError((metodo, url))


def _xlsx_com_capa(df):
    buf = io.BytesIO()
    with pd.ExcelWriter(buf, engine="openpyxl") as xw:
        pd.DataFrame({"x": [1]}).to_excel(xw, sheet_name="Resumo", index=False)
        pd.DataFrame([["Indicadores IW38"]]).to_excel(xw, sheet_name="Base", index=False, header=False)
        df.to_excel(xw, sheet_name="Base", index=False, startrow=2)
    return buf.getvalue()


@pytest.fixture
def ambiente(tmp_path, monkeypatch):
    gh = GitHubFalso()
    monkeypatch.setattr(fontes.requests, "Session", lambda: gh)
    monkeypatch.setattr(sincronizar, "ARQ_ESTADO", tmp_path / "estado.json")
    estoque = tmp_path / "1.3 - Controle de Estoque"
    ind = tmp_path / "0.1 - Indicadores" / "2026"
    estoque.mkdir()
    ind.mkdir(parents=True)
    cfg = {"repo": "org/dados", "token": "t", "pastas": [estoque, tmp_path / "0.1 - Indicadores"]}
    return gh, cfg, estoque, ind


def test_texto_para_parquet():
    df = pd.DataFrame({"a": [1.0, 2.5, None, pd.Timestamp(2026, 9, 21), 1e-7, "X "]})
    assert list(pd.read_parquet(io.BytesIO(sincronizar.para_parquet(df)))["a"]) == \
        ["1", "2.5", "", "21/09/2026", "0.0000001", "X"]


def test_pc_envia_e_site_le(ambiente, monkeypatch):
    gh, cfg, estoque, ind = ambiente
    velho = ind / "IW38 agosto.xlsx"
    velho.write_bytes(_xlsx_com_capa(iw38_cru()))
    os.utime(velho, (time.time() - 3600, time.time() - 3600))
    (ind / "Indicadores.xlsx").write_bytes(_xlsx_com_capa(iw38_cru().head(3)))  # mais novo, IW38 numa aba
    mb = pd.DataFrame({"Material": [100200.0], "Texto breve material": ["ROLAMENTO"], "Utilização livre": [4.0]})
    mb.to_excel(estoque / "MB52.XLSX", index=False)

    assert sorted(sincronizar.rodada(cfg)) == [IW38, MB52]
    assert set(gh.arquivos) == {"bases/IW38.parquet", "bases/MB52.parquet", "bases/manifesto.json"}
    man = json.loads(gh.arquivos["bases/manifesto.json"])
    # vale só o export mais recente do IW38
    assert man["bases/IW38.parquet"]["origem"] == "0.1 - Indicadores/2026/Indicadores.xlsx › aba Base"
    assert man["bases/IW38.parquet"]["linhas"] == 3

    # 1ª rodada já compacta (e só volta a compactar daqui a 7 dias)
    assert gh.historico == 1
    estado = json.loads(sincronizar.ARQ_ESTADO.read_text())
    assert "compactado_em" in estado

    # nada mudou: não envia de novo (não enche o histórico do repositório)
    commits = gh.commits
    assert sincronizar.rodada(cfg) == []
    assert gh.commits == commits

    # export novo no PC → nova rodada → o parquet do repositório (que o site lê) é trocado
    (ind / "IW38 hoje.xlsx").write_bytes(_xlsx_com_capa(iw38_cru()))
    assert sincronizar.rodada(cfg) == [IW38]
    assert len(pd.read_parquet(io.BytesIO(gh.arquivos["bases/IW38.parquet"]))) == 5


def test_planilha_de_equipe_nao_e_mais_enviada(ambiente, monkeypatch):
    """A equipe agora é cadastrada na Gestão de HH do site: a planilha é reconhecida, mas não vai para o repositório."""
    gh, cfg, estoque, ind = ambiente
    pd.DataFrame({"Nº pessoal": ["123456"], "Nome": ["PESSOA FICTICIA"], "Cargo": ["MECANICO"],
                  "Centro trabalho": ["MEC"]}).to_excel(ind / "Gestão de HH.xlsx", index=False)
    pd.DataFrame({"Material": [100200.0], "Texto breve material": ["ROLAMENTO"], "Utilização livre": [4.0]}).to_excel(
        estoque / "MB52.XLSX", index=False)
    assert EQUIPE in sincronizar.localizar(cfg["pastas"], {})
    assert sincronizar.rodada(cfg) == [MB52]
    assert "bases/EQUIPE.parquet" not in gh.arquivos


def test_arquivo_ilegivel_nao_segura_as_outras_bases(ambiente, monkeypatch):
    gh, cfg, estoque, ind = ambiente
    (ind / "IW38.xlsx").write_bytes(_xlsx_com_capa(iw38_cru()))
    pd.DataFrame({"Material": [100200.0], "Texto breve material": ["ROLAMENTO"], "Utilização livre": [4.0]}).to_excel(
        estoque / "MB52.XLSX", index=False)
    ler = leitura.ler_arquivo

    def iw38_aberto_no_excel(nome, *a, **kw):
        if "IW38" in nome:
            raise PermissionError("arquivo aberto em outro programa")
        return ler(nome, *a, **kw)

    monkeypatch.setattr(sincronizar.leitura, "ler_arquivo", iw38_aberto_no_excel)
    assert sincronizar.rodada(cfg) == [MB52]
    monkeypatch.setattr(sincronizar.leitura, "ler_arquivo", ler)          # fechou o Excel: vai na rodada seguinte
    assert sincronizar.rodada(cfg) == [IW38]
