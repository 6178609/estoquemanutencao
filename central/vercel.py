"""Liga o site novo (web/, Next.js na Vercel) ao repositório de dados, sem ninguém copiar o token do GitHub.

O site atual já sabe qual é o repositório privado de dados e tem o token dele (secrets do Streamlit no modo GitHub,
ou o `sincronizador/config.toml` do PC). Um administrador informa só um token da Vercel (criado na hora em
vercel.com › Account Settings › Tokens, usado uma vez e descartado); daqui o site grava na Vercel as variáveis
DADOS_GH_REPO, DADOS_GH_TOKEN, DADOS_GH_RAMO e URL_SITE_ATUAL e publica de novo a produção.

O token do GitHub nunca aparece na tela nem no log. Testado em tests/test_vercel.py (API da Vercel simulada).
"""

from __future__ import annotations

import tomllib
from dataclasses import dataclass
from pathlib import Path

import requests

from . import config

API = "https://api.vercel.com"
PROJETO_PADRAO = "estoquemanutencao"
CONFIG_SINCRONIZADOR = Path(__file__).resolve().parent.parent / "sincronizador" / "config.toml"


class VercelErro(Exception):
    pass


@dataclass(frozen=True)
class Credenciais:
    repo: str
    token: str
    ramo: str
    origem: str          # de onde vieram (para a tela; nunca o token)

    @property
    def token_mascarado(self) -> str:
        return f"{self.token[:4]}…{self.token[-4:]}" if len(self.token) > 12 else "…"


def credenciais_dados(arq_sincronizador: Path = CONFIG_SINCRONIZADOR) -> Credenciais | None:
    """O repositório de dados e o token que este site (ou o sincronizador deste PC) já usa."""
    cfg = config.carregar()
    if cfg.gh_repo and cfg.gh_token:
        return Credenciais(cfg.gh_repo.strip("/"), cfg.gh_token, cfg.gh_branch or "main", "configuração deste site")
    try:
        with open(arq_sincronizador, "rb") as f:
            s = tomllib.load(f)
    except (OSError, tomllib.TOMLDecodeError):
        return None
    if s.get("repo") and s.get("token"):
        return Credenciais(str(s["repo"]).strip("/"), str(s["token"]), str(s.get("ramo") or "main"),
                           "sincronizador deste PC")
    return None


def _pedir(sessao: requests.Session, metodo: str, caminho: str, **kw) -> requests.Response:
    try:
        return sessao.request(metodo, f"{API}{caminho}", timeout=60, **kw)
    except requests.RequestException as e:
        raise VercelErro(f"sem conexão com a Vercel ({e.__class__.__name__})") from None


def _achar_projeto(sessao: requests.Session, projeto: str) -> tuple[dict, dict]:
    """(projeto, parâmetros de escopo). Tenta a conta pessoal e depois cada time do token."""
    escopos = [{}]
    r = _pedir(sessao, "GET", "/v2/teams", params={"limit": 50})
    if r.status_code == 401:
        raise VercelErro("o token da Vercel não foi aceito (confira se copiou inteiro e se não expirou)")
    if r.status_code == 200:
        escopos += [{"teamId": t["id"]} for t in r.json().get("teams", []) if t.get("id")]
    for esc in escopos:
        r = _pedir(sessao, "GET", f"/v9/projects/{projeto}", params=esc)
        if r.status_code == 200:
            return r.json(), esc
        if r.status_code == 401:
            raise VercelErro("o token da Vercel não foi aceito (confira se copiou inteiro e se não expirou)")
    raise VercelErro(f"o projeto “{projeto}” não foi encontrado com esse token (o token precisa ter acesso ao "
                     "time/conta do projeto)")


def ligar_site_novo(token_vercel: str, cred: Credenciais, url_site_atual: str = "",
                    projeto: str = PROJETO_PADRAO, sessao: requests.Session | None = None) -> dict:
    """Grava as variáveis no projeto da Vercel e publica de novo a produção. Devolve um resumo para a tela."""
    token_vercel = (token_vercel or "").strip()
    if len(token_vercel) < 16:
        raise VercelErro("informe o token da Vercel")
    s = sessao or requests.Session()
    s.headers.update({"Authorization": f"Bearer {token_vercel}", "Content-Type": "application/json"})
    proj, escopo = _achar_projeto(s, projeto)
    alvos = ["production", "preview"]
    variaveis = [
        {"key": "DADOS_GH_REPO", "value": cred.repo, "type": "encrypted", "target": alvos},
        {"key": "DADOS_GH_TOKEN", "value": cred.token, "type": "sensitive", "target": alvos,
         "comment": "Token do repositório de dados (gravado pelo site atual, Fontes de dados)"},
        {"key": "DADOS_GH_RAMO", "value": cred.ramo, "type": "encrypted", "target": alvos},
    ]
    if url_site_atual.strip():
        variaveis.append({"key": "URL_SITE_ATUAL", "value": url_site_atual.strip().rstrip("/"), "type": "plain",
                          "target": alvos})
    r = _pedir(s, "POST", f"/v10/projects/{proj['id']}/env", params={**escopo, "upsert": "true"}, json=variaveis)
    if r.status_code not in (200, 201):
        try:
            msg = r.json().get("error", {}).get("message", "")
        except ValueError:
            msg = ""
        raise VercelErro(f"a Vercel recusou as variáveis (erro {r.status_code}{': ' + msg[:200] if msg else ''})")
    # publica de novo a última produção pronta, já com as variáveis
    r = _pedir(s, "GET", "/v6/deployments", params={**escopo, "projectId": proj["id"], "target": "production",
                                                     "state": "READY", "limit": 1})
    ultimo = (r.json().get("deployments") or [None])[0] if r.status_code == 200 else None
    publicado = None
    if ultimo:
        r = _pedir(s, "POST", "/v13/deployments", params=escopo,
                   json={"name": proj["name"], "deploymentId": ultimo["uid"], "target": "production"})
        if r.status_code in (200, 201):
            publicado = r.json().get("url")
    return {"projeto": proj["name"], "variaveis": [v["key"] for v in variaveis], "republicado": bool(publicado),
            "url_deploy": publicado}
