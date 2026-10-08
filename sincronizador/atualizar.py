"""Atualiza o código do sistema neste PC com a versão publicada no GitHub.

Quem instalou pelo "Download ZIP" fica com o código daquele dia: o sincronizador e o
robô do SAP não recebem as correções do site. Este script baixa a versão atual do
ramo main e copia por cima da pasta do sistema, arquivo a arquivo:

- só regrava o que mudou; nunca apaga nada;
- não toca nas configurações deste PC (sincronizador/config.toml, estado.json,
  automacao/robo_local.toml, .streamlit/secrets.toml…), que não estão no GitHub;
- o automacao/transacoes.toml anterior fica em transacoes.toml.anterior (ajustes de ID
  deste PC para a mudança de datas vão no robo_local.toml, seção [mudanca_datas]);
- guarda a versão instalada em .versao_instalada.

O sincronizador chama isto sozinho a cada poucas horas e se reinicia quando algo
mudou. Para atualizar na hora: duplo clique no atualizar.bat (pasta do sistema).

Uso:
    uv run python sincronizador/atualizar.py               # atualiza se houver versão nova
    uv run python sincronizador/atualizar.py --reiniciar   # e reinicia o sincronizador
"""

from __future__ import annotations

import io
import logging
import os
import subprocess
import sys
import tempfile
import zipfile
from pathlib import Path, PurePosixPath

RAIZ = Path(__file__).resolve().parent.parent
REPO = "6178609/estoquemanutencao"
RAMO = "main"
ARQ_VERSAO = RAIZ / ".versao_instalada"
# configurações e dados deste PC: nunca são sobrescritos (normalmente nem vêm no ZIP)
PRESERVAR = {"sincronizador/config.toml", "sincronizador/estado.json", "automacao/robo_local.toml",
             ".streamlit/secrets.toml", ".versao_instalada"}
PASTAS_IGNORADAS = {".git", ".venv", "__pycache__", "dados"}
# arquivos que alguém pode ter ajustado no PC: antes de trocar, a versão anterior fica em <arquivo>.anterior
GUARDAR_ANTERIOR = {"automacao/transacoes.toml"}

log = logging.getLogger("atualizar")


class AtualizarErro(RuntimeError):
    pass


def _ler(p: Path) -> str:
    try:
        return p.read_text(encoding="utf-8").strip()
    except OSError:
        return ""


def versao_local(raiz: Path = RAIZ) -> str:
    return _ler(raiz / ARQ_VERSAO.name)


def _get(url: str, **kw):
    import requests

    r = requests.get(url, timeout=kw.pop("timeout", 60), **kw)
    if r.status_code != 200:
        raise AtualizarErro(f"GitHub respondeu {r.status_code} em {url}")
    return r


def versao_remota(repo: str = REPO, ramo: str = RAMO) -> str:
    """SHA do último commit do ramo (API pública, sem token)."""
    r = _get(f"https://api.github.com/repos/{repo}/commits/{ramo}",
             headers={"Accept": "application/vnd.github.sha"}, timeout=30)
    sha = r.text.strip()
    if len(sha) != 40:
        raise AtualizarErro(f"resposta inesperada do GitHub: {sha[:80]}")
    return sha


def baixar(sha: str, repo: str = REPO) -> bytes:
    return _get(f"https://codeload.github.com/{repo}/zip/{sha}", timeout=300).content


def _relativo(nome: str) -> str | None:
    """Caminho dentro do ZIP sem a pasta raiz (estoquemanutencao-<sha>/…); None para pastas e ignorados."""
    partes = PurePosixPath(nome).parts
    if len(partes) < 2 or nome.endswith("/"):
        return None
    rel = PurePosixPath(*partes[1:])
    if any(p in PASTAS_IGNORADAS for p in rel.parts) or str(rel) in PRESERVAR or ".." in rel.parts:
        return None
    return str(rel)


def aplicar(conteudo_zip: bytes, raiz: Path = RAIZ) -> list[str]:
    """Copia os arquivos do ZIP que mudaram para a pasta do sistema; devolve os caminhos alterados."""
    alterados = []
    with zipfile.ZipFile(io.BytesIO(conteudo_zip)) as z:
        for info in z.infolist():
            rel = _relativo(info.filename)
            if rel is None:
                continue
            dados = z.read(info)
            destino = raiz / rel
            try:
                if destino.read_bytes() == dados:
                    continue
            except OSError:
                pass
            destino.parent.mkdir(parents=True, exist_ok=True)
            if rel in GUARDAR_ANTERIOR and destino.exists():
                destino.with_name(destino.name + ".anterior").write_bytes(destino.read_bytes())
            fd, tmp = tempfile.mkstemp(dir=destino.parent, prefix=".", suffix=".novo")
            with os.fdopen(fd, "wb") as f:
                f.write(dados)
            os.replace(tmp, destino)
            alterados.append(rel)
    return alterados


def atualizar(repo: str = REPO, ramo: str = RAMO, raiz: Path = RAIZ, forcar: bool = False) -> dict:
    """{"atualizado": bool, "de", "para", "arquivos": [...], "dependencias": bool}."""
    para = versao_remota(repo, ramo)
    de = versao_local(raiz)
    if para == de and not forcar:
        return {"atualizado": False, "de": de, "para": para, "arquivos": [], "dependencias": False}
    arquivos = aplicar(baixar(para, repo), raiz)
    (raiz / ARQ_VERSAO.name).write_text(para + "\n", encoding="utf-8")
    log.info("código atualizado de %s para %s (%d arquivo(s))", de[:7] or "?", para[:7], len(arquivos))
    return {"atualizado": bool(arquivos), "de": de, "para": para, "arquivos": arquivos,
            "dependencias": any(a in ("pyproject.toml", "uv.lock") for a in arquivos)}


def reiniciar_sincronizador(raiz: Path = RAIZ) -> None:
    """Fecha o sincronizador que estiver rodando (código antigo) e abre de novo, sem janela (Windows)."""
    if os.name != "nt":
        return
    script = (
        "Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like '*sincronizar.py*--loop*' "
        f"-and $_.ProcessId -ne {os.getpid()} }} | ForEach-Object {{ Stop-Process -Id $_.ProcessId -Force }}")
    subprocess.run(["powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script], check=False,
                   timeout=60)
    vbs = raiz / "sincronizador" / "rodar_oculto.vbs"
    if (raiz / "sincronizador" / "config.toml").exists() and vbs.exists():
        subprocess.Popen(["wscript.exe", str(vbs)], cwd=str(raiz))
        print("Sincronizador reiniciado com o código novo.")


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(message)s")
    print(f"Pasta do sistema: {RAIZ}")
    print(f"Versão instalada: {versao_local()[:7] or 'desconhecida (instalado pelo Download ZIP)'}")
    try:
        r = atualizar(forcar="--forcar" in sys.argv)
    except Exception as e:  # noqa: BLE001
        print(f"Não foi possível atualizar: {e}")
        print("Confira a internet/proxy ou baixe o ZIP de novo em "
              f"https://github.com/{REPO}/archive/refs/heads/{RAMO}.zip e copie por cima desta pasta.")
        sys.exit(1)
    if r["arquivos"]:
        print(f"Atualizado para {r['para'][:7]}: {len(r['arquivos'])} arquivo(s) novos ou alterados.")
        for a in r["arquivos"][:40]:
            print(f"  {a}")
    else:
        print(f"Já está na versão mais nova ({r['para'][:7]}).")
    if "--reiniciar" in sys.argv:
        reiniciar_sincronizador()


if __name__ == "__main__":
    main()
