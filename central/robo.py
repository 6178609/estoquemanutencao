"""Ligação do site com o robô do SAP (automacao/robo_sap.py).

O botão "Buscar no SAP agora" só aparece quando o site roda no Windows, no PC
onde o robô foi configurado (automacao/configurar_robo.bat): é lá que está o SAP
GUI. O robô grava os arquivos na pasta do site e a verificação automática
atualiza as telas sozinha, como com qualquer export novo.
"""

from __future__ import annotations

import json
import subprocess
import sys
from datetime import datetime

from .config import RAIZ

PASTA = RAIZ / "automacao"
SCRIPT = PASTA / "robo_sap.py"
ARQ_LOCAL = PASTA / "robo_local.toml"
ARQ_STATUS = PASTA / "robo_status.json"
ARQ_LOG = PASTA / "robo_sap.log"


def disponivel() -> bool:
    return sys.platform == "win32" and SCRIPT.exists() and ARQ_LOCAL.exists()


def status() -> dict:
    try:
        return json.loads(ARQ_STATUS.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {}


def rodando() -> bool:
    st = status()
    if not st.get("em_andamento"):
        return False
    try:  # status "em andamento" de mais de 20 min = execução que caiu no meio
        inicio = datetime.fromisoformat(st["inicio"])
        return (datetime.now(inicio.tzinfo) - inicio).total_seconds() < 20 * 60
    except (KeyError, ValueError):
        return False


def iniciar(transacoes: list[str] | None = None) -> None:
    """Dispara o robô em segundo plano (sem janela) e volta na hora."""
    args = [sys.executable, str(SCRIPT)]
    for t in transacoes or []:
        args += ["-t", t]
    flags = 0
    if sys.platform == "win32":
        flags = subprocess.CREATE_NO_WINDOW | subprocess.DETACHED_PROCESS  # type: ignore[attr-defined]
    subprocess.Popen(args, cwd=str(RAIZ), creationflags=flags, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)


def ultimas_linhas_do_log(n: int = 15) -> str:
    try:
        return "\n".join(ARQ_LOG.read_text(encoding="utf-8", errors="replace").splitlines()[-n:])
    except OSError:
        return ""


# ----------------------------------------------------------------------------
# Mudança de datas (calendário → robô)
# ----------------------------------------------------------------------------
ARQ_PEDIDO = PASTA / "mudanca_datas_pedido.json"
ARQ_RESULTADO = PASTA / "mudanca_datas_pedido_resultado.json"


def iniciar_mudanca(pedido: dict) -> None:
    """Grava o pedido (ordens e datas, ou o teste do robô) e dispara o robô em segundo plano."""
    ARQ_RESULTADO.unlink(missing_ok=True)
    ARQ_PEDIDO.write_text(json.dumps(pedido, ensure_ascii=False, indent=1), encoding="utf-8")
    opcao = "--diagnosticar" if pedido.get("tipo") == "diagnostico" else "--mudar-datas"
    iniciar_args([opcao, str(ARQ_PEDIDO)])


def iniciar_args(extra: list[str]) -> None:
    flags = 0
    if sys.platform == "win32":
        flags = subprocess.CREATE_NO_WINDOW | subprocess.DETACHED_PROCESS  # type: ignore[attr-defined]
    subprocess.Popen([sys.executable, str(SCRIPT), *extra], cwd=str(RAIZ), creationflags=flags,
                     stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)


def resultado_mudanca() -> dict:
    try:
        return json.loads(ARQ_RESULTADO.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {}
