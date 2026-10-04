"""Modo nuvem: o app lendo e gravando no SharePoint pelo Microsoft Graph.

Sem acesso ao SharePoint real aqui, simulamos a API do Graph em memória
(só as chamadas que o app usa) e verificamos o app de ponta a ponta.
"""

import io
import re
from datetime import datetime, timezone
from urllib.parse import unquote

import pandas as pd
import pytest

from central import bases, fontes
from central.leitura import IW38, MB52
from tests.test_dados import iw38_cru

GRAPH = "https://graph.microsoft.com/v1.0"


class Resp:
    def __init__(self, status, corpo=None, conteudo=b"", headers=None):
        self.status_code, self._corpo, self.content = status, corpo, conteudo
        self.text = str(corpo)
        self.headers = headers or {}

    def json(self):
        return self._corpo


class GraphFalso:
    """Biblioteca do SharePoint em memória: {caminho: (bytes, data)} e conjunto de pastas."""

    def __init__(self):
        self.arquivos: dict[str, tuple[bytes, str]] = {}
        self.pastas = {""}
        self.chamadas = []
        self.limitar_proxima = False

    def poe(self, caminho, conteudo, data="2026-10-01T10:00:00Z"):
        partes = caminho.split("/")
        for i in range(1, len(partes)):
            self.pastas.add("/".join(partes[:i]))
        self.arquivos[caminho] = (conteudo, data)

    # --- API usada pelo app ---
    def post(self, url, data=None, timeout=None):
        assert "oauth2/v2.0/token" in url and data["grant_type"] == "client_credentials"
        return Resp(200, {"access_token": "tok", "expires_in": 3600})

    def request(self, metodo, url, headers=None, timeout=None, data=None, json=None):
        assert headers["Authorization"] == "Bearer tok"
        self.chamadas.append((metodo, url))
        if self.limitar_proxima:
            self.limitar_proxima = False
            return Resp(429, "devagar", headers={"Retry-After": "0"})
        if url == f"{GRAPH}/sites/alpargatascombr.sharepoint.com:/sites/PCMF26":
            return Resp(200, {"id": "SITE"})
        m = re.match(rf"{re.escape(GRAPH)}/sites/SITE/drive/root(?::/(.*?):)?(/children|/content)?(\?.*)?$", url)
        assert m, url
        caminho, acao = unquote(m.group(1) or ""), m.group(2)
        if acao == "/children" and metodo == "GET":
            if caminho not in self.pastas:
                return Resp(404, "itemNotFound")
            filhos = []
            pre = caminho + "/" if caminho else ""
            for p in self.pastas:
                if p and p.startswith(pre) and "/" not in p[len(pre):]:
                    filhos.append({"name": p[len(pre):], "folder": {}})
            for p, (b, d) in self.arquivos.items():
                if p.startswith(pre) and "/" not in p[len(pre):]:
                    filhos.append({"name": p[len(pre):], "file": {}, "size": len(b), "lastModifiedDateTime": d})
            return Resp(200, {"value": filhos})
        if acao == "/children" and metodo == "POST":
            self.pastas.add(f"{caminho}/{json['name']}" if caminho else json["name"])
            return Resp(201, {})
        if acao == "/content" and metodo == "GET":
            return Resp(200, conteudo=self.arquivos[caminho][0]) if caminho in self.arquivos else Resp(404, "nada")
        if acao == "/content" and metodo == "PUT":
            if caminho.rsplit("/", 1)[0] not in self.pastas:
                return Resp(404, "pasta pai não existe")
            self.arquivos[caminho] = (data, datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"))
            return Resp(201, {})
        if acao is None and metodo == "GET":
            return Resp(200, {}) if caminho in self.pastas or caminho in self.arquivos else Resp(404, "nada")
        raise AssertionError((metodo, url))


def _xlsx(df):
    buf = io.BytesIO()
    df.to_excel(buf, index=False)
    return buf.getvalue()


@pytest.fixture
def graph(monkeypatch):
    g = GraphFalso()
    monkeypatch.setattr(fontes.requests, "Session", lambda: g)
    monkeypatch.setattr(fontes.time, "sleep", lambda s: None)
    for k, v in {"SP_TENANT_ID": "t", "SP_CLIENT_ID": "c", "SP_CLIENT_SECRET": "s", "EXIGIR_LOGIN": "nao"}.items():
        monkeypatch.setenv(f"CENTRAL_{k}", v)
    monkeypatch.delenv("CENTRAL_PASTAS", raising=False)
    bases._fonte_cacheada.clear()
    bases.recarregar()
    yield g
    bases._fonte_cacheada.clear()
    bases.recarregar()


def test_modo_nuvem_le_as_duas_pastas_e_grava_cadastro(graph):
    graph.poe("0.1 - Indicadores/2026/Setembro/IW38BK.XLSX", _xlsx(iw38_cru()), "2026-09-21T12:00:00Z")
    graph.poe("0.1 - Indicadores/2026/Outubro/export.XLSX", _xlsx(iw38_cru().head(2)), "2026-10-03T21:00:00Z")
    mb = pd.DataFrame({"Material": ["100"], "Texto breve material": ["ROLAMENTO"], "Utilização livre": [3]})
    graph.poe("1.3 - Controle de Estoque/MB52 atual.xlsx", _xlsx(mb))
    graph.poe("1.3 - Controle de Estoque/notas.docx", b"x")  # ignorado

    from central import config
    cfg = config.carregar()
    assert cfg.fonte == "sharepoint"  # credencial preenchida já liga o modo nuvem
    assert cfg.sp_pasta_app == "1.3 - Controle de Estoque/Central de Manutenção (app)"

    inv = bases.inventario()
    assert inv.ativos[IW38].arquivo.id == "0.1 - Indicadores/2026/Outubro/export.XLSX"  # o mais recente
    assert inv.ativos[MB52].arquivo.id == "1.3 - Controle de Estoque/MB52 atual.xlsx"
    assert sorted(bases.iw38().df["Ordem"]) == ["1", "2"]  # só o export mais recente
    assert bases.mb52().df["Estoque"].sum() == 3

    # 1º cadastro: a pasta do app não existe e é criada
    bases.gravar_cadastro(bases.ARQ_CAD_EQUIP, "41001404", {"criticidade": "Alta"}, "ana")
    assert "1.3 - Controle de Estoque/Central de Manutenção (app)/cadastro_equipamentos.json" in graph.arquivos
    assert bases.ler_cadastro(bases.ARQ_CAD_EQUIP)["41001404"]["criticidade"] == "Alta"


def test_respeita_limite_de_requisicoes(graph):
    graph.poe("1.3 - Controle de Estoque/a.xlsx", b"x")
    graph.limitar_proxima = True  # primeira chamada volta 429; o app espera e tenta de novo
    nomes = [a.arquivo for a in bases.fonte().listar()]
    assert nomes == ["a.xlsx"]


def test_profundidade_maxima(graph, monkeypatch):
    monkeypatch.setenv("CENTRAL_PROFUNDIDADE", "2")
    bases._fonte_cacheada.clear()
    graph.poe("0.1 - Indicadores/n1/raso.xlsx", b"x")
    graph.poe("0.1 - Indicadores/n1/n2/fundo.xlsx", b"x")
    nomes = {a.arquivo for a in bases.fonte().listar()}
    assert nomes == {"raso.xlsx"}
