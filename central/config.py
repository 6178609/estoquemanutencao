"""Configuração do app.

Ordem de leitura: seção [central] do .streamlit/secrets.toml → variáveis de
ambiente CENTRAL_<NOME> → padrão abaixo. Veja .streamlit/secrets.toml.exemplo.
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

import streamlit as st

RAIZ = Path(__file__).resolve().parent.parent

# Pastas da biblioteca "PCM F26 - Documentos" sincronizadas pelo OneDrive.
# "~" vira a pasta do usuário do Windows (C:\Users\<usuário>), então funciona
# no PC de qualquer pessoa da equipe que sincronize a mesma biblioteca.
PASTAS_PADRAO = [
    "~/OneDrive - Alpargatas S.A/PCM F26 - Documentos/1.3 - Controle de Estoque",
    "~/OneDrive - Alpargatas S.A/PCM F26 - Documentos/0.1 - Indicadores",
]
NOME_PASTA_APP = "Central de Manutenção (app)"


def _secao() -> dict:
    try:
        return dict(st.secrets.get("central", {}))
    except Exception:  # sem secrets.toml
        return {}


def _valor(nome: str, padrao=None):
    sec = _secao()
    if nome in sec:
        return sec[nome]
    env = os.environ.get(f"CENTRAL_{nome.upper()}")
    return env if env not in (None, "") else padrao


def _caminho(p) -> Path:
    p = Path(os.path.expandvars(str(p).strip().strip('"'))).expanduser()
    return p if p.is_absolute() else RAIZ / p


@dataclass(frozen=True)
class Config:
    fonte: str                     # "pasta" ou "sharepoint"
    pastas: tuple[Path, ...]       # pastas varridas (com subpastas) quando fonte = "pasta"
    pasta_app: Path                # onde o app grava uploads e cadastros (compartilhada via OneDrive)
    profundidade: int              # níveis de subpasta varridos
    intervalo_verificacao: int     # segundos entre verificações de arquivo novo
    dias_alerta: int               # base mais velha que isso aparece como desatualizada
    excluir_piloto_matriz: bool    # tira ordens da Fábrica Piloto / Matrizaria
    exigir_login: bool             # tela de login e perfis de acesso
    sp_tenant_id: str
    sp_client_id: str
    sp_client_secret: str
    sp_site: str                   # ex.: alpargatascombr.sharepoint.com:/sites/PCMF26
    sp_pasta: str                  # pasta dentro da biblioteca, ex.: 1.3 - Controle de Estoque

    @property
    def chave(self) -> str:
        return "|".join([self.fonte, *map(str, self.pastas), str(self.pasta_app), self.sp_site, self.sp_pasta])


def carregar() -> Config:
    bruto = _valor("pastas", None)
    if isinstance(bruto, str):
        bruto = [p for p in bruto.split(";") if p.strip()]
    if bruto:
        pastas = [_caminho(p) for p in bruto]
    else:
        pastas = [p for p in map(_caminho, PASTAS_PADRAO) if p.exists()] or [RAIZ / "dados"]

    app = _valor("pasta_app", None)
    if app:
        pasta_app = _caminho(app)
    elif pastas[0] != RAIZ / "dados":
        pasta_app = pastas[0] / NOME_PASTA_APP
    else:
        pasta_app = RAIZ / "dados"

    def sim(nome, padrao="sim"):
        return str(_valor(nome, padrao)).strip().lower() in ("1", "sim", "true", "yes", "s")

    return Config(
        fonte=str(_valor("fonte", "pasta")).strip().lower(),
        pastas=tuple(pastas),
        pasta_app=pasta_app,
        profundidade=int(_valor("profundidade", 4)),
        intervalo_verificacao=max(15, int(_valor("intervalo_verificacao", 60))),
        dias_alerta=int(_valor("dias_alerta", 2)),
        excluir_piloto_matriz=sim("excluir_piloto_matriz"),
        exigir_login=sim("exigir_login"),
        sp_tenant_id=str(_valor("sp_tenant_id", "")),
        sp_client_id=str(_valor("sp_client_id", "")),
        sp_client_secret=str(_valor("sp_client_secret", "")),
        sp_site=str(_valor("sp_site", "")),
        sp_pasta=str(_valor("sp_pasta", "")).strip("/"),
    )
