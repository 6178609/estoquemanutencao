"""Ligar o site novo na Vercel a partir do site atual (API da Vercel simulada; nenhum token de verdade)."""


import pytest

from central import vercel

CRED = vercel.Credenciais("org/dados", "github_pat_FICTICIO_1234567890", "main", "teste")


class Resp:
    def __init__(self, status, corpo):
        self.status_code, self._corpo = status, corpo

    def json(self):
        return self._corpo


class VercelFalsa:
    """Projeto num time; o token não enxerga o projeto sem o teamId."""

    def __init__(self, token_ok=True):
        self.headers, self.pedidos, self.token_ok = {}, [], token_ok

    def request(self, metodo, url, params=None, json=None, timeout=None):
        caminho = url.removeprefix(vercel.API)
        self.pedidos.append((metodo, caminho, dict(params or {}), json))
        if not self.token_ok:
            return Resp(401, {"error": {"code": "invalidToken"}})
        time_ = (params or {}).get("teamId")
        if caminho == "/v2/teams":
            return Resp(200, {"teams": [{"id": "team_X"}]})
        if caminho == "/v9/projects/estoquemanutencao":
            return Resp(200, {"id": "prj_1", "name": "estoquemanutencao"}) if time_ == "team_X" else Resp(404, {})
        if caminho == "/v10/projects/prj_1/env":
            return Resp(201, {"created": json})
        if caminho == "/v6/deployments":
            return Resp(200, {"deployments": [{"uid": "dpl_ultimo"}]})
        if caminho == "/v13/deployments":
            return Resp(200, {"url": "estoquemanutencao-novo.vercel.app"})
        return Resp(404, {})


def test_grava_variaveis_no_time_certo_e_republica():
    s = VercelFalsa()
    r = vercel.ligar_site_novo("vercel_token_ficticio_123456", CRED, "https://site-atual.exemplo/", sessao=s)
    assert r == {"projeto": "estoquemanutencao", "variaveis": ["DADOS_GH_REPO", "DADOS_GH_TOKEN", "DADOS_GH_RAMO",
                                                              "URL_SITE_ATUAL"],
                 "republicado": True, "url_deploy": "estoquemanutencao-novo.vercel.app"}
    env = next(p for p in s.pedidos if p[1] == "/v10/projects/prj_1/env")
    assert env[2] == {"teamId": "team_X", "upsert": "true"}
    por = {v["key"]: v for v in env[3]}
    assert por["DADOS_GH_TOKEN"]["value"] == CRED.token and por["DADOS_GH_TOKEN"]["type"] == "sensitive"
    assert por["URL_SITE_ATUAL"]["value"] == "https://site-atual.exemplo"
    redeploy = next(p for p in s.pedidos if p[1] == "/v13/deployments")
    assert redeploy[3] == {"name": "estoquemanutencao", "deploymentId": "dpl_ultimo", "target": "production"}
    assert s.headers["Authorization"] == "Bearer vercel_token_ficticio_123456"


def test_erros_claros():
    with pytest.raises(vercel.VercelErro, match="não foi aceito"):
        vercel.ligar_site_novo("vercel_token_ficticio_123456", CRED, sessao=VercelFalsa(token_ok=False))
    with pytest.raises(vercel.VercelErro, match="informe o token"):
        vercel.ligar_site_novo("", CRED, sessao=VercelFalsa())
    with pytest.raises(vercel.VercelErro, match="não foi encontrado"):
        vercel.ligar_site_novo("vercel_token_ficticio_123456", CRED, projeto="outro", sessao=VercelFalsa())


def test_credenciais_do_sincronizador(tmp_path, monkeypatch):
    for k in ("GH_REPO", "GH_TOKEN"):
        monkeypatch.delenv(f"CENTRAL_{k}", raising=False)
    monkeypatch.setenv("CENTRAL_FONTE", "pasta")
    arq = tmp_path / "config.toml"
    arq.write_text('repo = "org/dados"\ntoken = "github_pat_FICTICIO_abcdefghij"\n', encoding="utf-8")
    c = vercel.credenciais_dados(arq)
    if c and c.origem == "configuração deste site":   # máquina com secrets de verdade: não testa o arquivo
        pytest.skip("este ambiente tem gh_token configurado")
    assert c == vercel.Credenciais("org/dados", "github_pat_FICTICIO_abcdefghij", "main", "sincronizador deste PC")
    assert c.token_mascarado == "gith…ghij" and "FICTICIO" not in c.token_mascarado
    assert vercel.credenciais_dados(tmp_path / "nao_existe.toml") is None
