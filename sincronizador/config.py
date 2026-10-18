"""Configuração do sincronizador do PC: as pastas onde os exports do SAP são procurados.

O resto (repositório de dados, token) fica no sincronizador/config.toml deste PC (configurar.bat), fora do GitHub.
"""

from __future__ import annotations

import os
from pathlib import Path
from typing import Protocol

RAIZ = Path(__file__).resolve().parent.parent

# Pastas da biblioteca "PCM F26 - Documentos" sincronizadas pelo OneDrive.
# "~" vira a pasta do usuário do Windows (C:\Users\<usuário>), então funciona
# no PC de qualquer pessoa da equipe que sincronize a mesma biblioteca.
PASTAS_PADRAO = [
    "~/OneDrive - Alpargatas S.A/PCM F26 - Documentos/1.3 - Controle de Estoque",
    "~/OneDrive - Alpargatas S.A/PCM F26 - Documentos/0.1 - Indicadores",
    # pasta base do site (com subpastas): os exports do SAP salvos aqui alimentam todas as abas
    "~/Downloads/SITE",
    # cópias das mesmas pastas dentro da Downloads (com subpastas)
    "~/Downloads/1.3 - Controle de Estoque",
    "~/Downloads/0.1 - Indicadores",
    # onde o navegador e o SAP costumam salvar os exports (só a própria pasta)
    "~/Downloads",
]


class ConfigGitHub(Protocol):
    """O que a fonte GitHub precisa (sincronizador/sincronizar.py monta a partir do config.toml)."""
    gh_repo: str
    gh_token: str
    gh_branch: str
    profundidade: int


def eh_downloads(p: Path) -> bool:
    return Path(p).name.lower() in ("downloads", "transferências", "transferencias")


def _caminho(p) -> Path:
    p = Path(os.path.expandvars(str(p).strip().strip('"'))).expanduser()
    return p if p.is_absolute() else RAIZ / p
