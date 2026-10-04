"""Sincronizador do PC → site na nuvem.

Roda no computador que tem as pastas do SharePoint sincronizadas pelo OneDrive.
A cada 5 minutos procura, nas pastas configuradas (as duas do OneDrive, com
subpastas, e a Downloads, sem subpastas), o export
mais recente de cada base — IW38, MB52 e requisições, reconhecidos pelo
conteúdo — e, quando algum mudou, envia uma cópia compacta (.parquet, só a
tabela da base) para o repositório privado de dados no GitHub, de onde o site
publicado no Streamlit Cloud lê.

Uso:
    uv run python sincronizador/sincronizar.py            # uma rodada
    uv run python sincronizador/sincronizar.py --loop     # fica rodando (a cada 5 min)
    uv run python sincronizador/sincronizar.py --testar   # só mostra o que enviaria

Configuração em sincronizador/config.toml (criado pelo configurar.bat):
    repo  = "6178609/estoquemanutencao-dados"
    token = "github_pat_..."
    pastas = ['~\\OneDrive - Alpargatas S.A\\PCM F26 - Documentos\\1.3 - Controle de Estoque', ...]  # opcional
    intervalo_min = 5                                                                                  # opcional
"""

from __future__ import annotations

import io
import json
import logging
import math
import os
import platform
import sys
import time
import tomllib
from datetime import date, datetime, timezone
from pathlib import Path

import pandas as pd

RAIZ = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(RAIZ))

from central import leitura  # noqa: E402
from central.config import PASTAS_PADRAO, _caminho  # noqa: E402
from central.fontes import GitHub, Pastas  # noqa: E402
from central.leitura import IP19, IW38, MB52, REQ, TIPOS  # noqa: E402

AQUI = Path(__file__).resolve().parent
ARQ_CONFIG = AQUI / "config.toml"
ARQ_ESTADO = AQUI / "estado.json"
DESTINO = {IW38: "bases/IW38.parquet", MB52: "bases/MB52.parquet", REQ: "bases/REQUISICOES.parquet",
           IP19: "bases/IP19.parquet"}

log = logging.getLogger("sincronizador")


class _Cfg:
    """O mínimo que a fonte GitHub precisa (mesmos nomes do central.config.Config)."""

    def __init__(self, repo: str, token: str, ramo: str):
        self.gh_repo, self.gh_token, self.gh_branch, self.profundidade = repo, token, ramo, 4


def carregar_config(caminho: Path = ARQ_CONFIG) -> dict:
    if not caminho.exists():
        raise SystemExit(f"Falta {caminho}. Rode sincronizador\\configurar.bat primeiro.")
    with open(caminho, "rb") as f:
        cfg = tomllib.load(f)
    if not cfg.get("repo") or not cfg.get("token"):
        raise SystemExit("config.toml precisa de 'repo' e 'token'.")
    cfg["pastas"] = [_caminho(p) for p in (cfg.get("pastas") or PASTAS_PADRAO)]
    return cfg


def _estado() -> dict:
    try:
        return json.loads(ARQ_ESTADO.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {}


def _salvar_estado(est: dict) -> None:
    tmp = ARQ_ESTADO.with_suffix(".tmp")
    tmp.write_text(json.dumps(est, ensure_ascii=False, indent=1), encoding="utf-8")
    os.replace(tmp, ARQ_ESTADO)


# ----------------------------------------------------------------------------
# Achar o export mais recente de cada base
# ----------------------------------------------------------------------------
def localizar(pastas: list[Path], est: dict) -> dict[str, tuple]:
    """{tipo: (Arquivo, aba, linha)} com o arquivo mais novo de cada base.

    Mesma regra do app: do mais novo para o mais velho, para quando todas as
    bases foram achadas. O que já foi identificado fica no estado (não reabre)."""
    sondagens = est.setdefault("sondagens", {})
    arquivos = sorted(Pastas(pastas, pastas[0], profundidade=4).listar(), key=lambda a: a.modificado, reverse=True)
    achados: dict[str, tuple] = {}
    vistos = set()
    for arq in arquivos:
        if arq.arquivo.lower().endswith(".json"):
            continue
        if len(achados) == len(TIPOS):
            break
        vistos.add(arq.assinatura)
        if arq.assinatura not in sondagens:
            try:
                sondagens[arq.assinatura] = [list(x) for x in leitura.sondar(arq.id, Path(arq.id).read_bytes())]
            except OSError as e:  # arquivo bloqueado (aberto no Excel) ou ainda sincronizando
                log.warning("não consegui abrir %s: %s", arq.nome, e)
                continue
        for tipo, aba, linha in sondagens[arq.assinatura]:
            achados.setdefault(tipo, (arq, aba, linha))
    # esquece sondagens de arquivos que não existem mais (o estado não cresce para sempre)
    existentes = {a.assinatura for a in arquivos}
    for k in list(sondagens):
        if k not in existentes:
            del sondagens[k]
    return achados


# ----------------------------------------------------------------------------
# Conversão para parquet (tudo como texto, no formato que o app já entende)
# ----------------------------------------------------------------------------
def _texto(v) -> str:
    if v is None:
        return ""
    if isinstance(v, float):
        if math.isnan(v):
            return ""
        if v.is_integer():
            return str(int(v))
        s = repr(v)
        return f"{v:.10f}".rstrip("0") if "e" in s else s
    if isinstance(v, (datetime, pd.Timestamp)):
        if pd.isna(v):
            return ""
        return v.strftime("%d/%m/%Y %H:%M") if (v.hour or v.minute) else v.strftime("%d/%m/%Y")
    if isinstance(v, date):
        return v.strftime("%d/%m/%Y")
    return str(v).strip()


def para_parquet(df: pd.DataFrame) -> bytes:
    saida = pd.DataFrame({c: df[c].map(_texto).astype(str) for c in df.columns})
    buf = io.BytesIO()
    saida.to_parquet(buf, index=False, compression="zstd")
    return buf.getvalue()


# ----------------------------------------------------------------------------
# Rodada
# ----------------------------------------------------------------------------
def rodada(cfg: dict, gh=None, testar: bool = False) -> list[str]:
    """Faz uma verificação; devolve a lista de bases enviadas."""
    gh = gh or GitHub(_Cfg(cfg["repo"], cfg["token"], cfg.get("ramo", "main")))
    est = _estado()
    enviados = est.setdefault("enviados", {})
    achados = localizar(cfg["pastas"], est)
    mandou, manifesto = [], {}
    for tipo, (arq, aba, linha) in achados.items():
        chave = f"{arq.assinatura}|{aba}|{linha}"
        if enviados.get(tipo) == chave:
            continue
        rotulo = arq.nome + (f" › aba {aba}" if aba else "")
        if testar:
            log.info("[teste] enviaria %s ← %s", DESTINO[tipo], rotulo)
            continue
        df = leitura.ler_arquivo(arq.id, Path(arq.id).read_bytes(), aba, linha)
        gh.gravar_caminho(DESTINO[tipo], para_parquet(df), f"{tipo.upper()}: {arq.arquivo} ({len(df)} linhas)")
        manifesto[DESTINO[tipo]] = {
            "modificado": arq.modificado.isoformat(timespec="seconds"),
            "origem": rotulo,
            "linhas": len(df),
            "pc": platform.node(),
            "enviado_em": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        }
        enviados[tipo] = chave
        mandou.append(tipo)
        log.info("enviado %s ← %s (%d linhas)", DESTINO[tipo], rotulo, len(df))
    if manifesto:
        gh.registrar_no_manifesto(manifesto)
    faltando = set(TIPOS) - set(achados)
    if faltando:
        log.info("sem arquivo nas pastas para: %s", ", ".join(sorted(faltando)))
    if not testar:
        _compactar_se_preciso(gh, est)
        _salvar_estado(est)
    return mandou


DIAS_COMPACTAR = 7


def _compactar_se_preciso(gh, est: dict) -> None:
    """Uma vez por semana, apaga as versões antigas das bases no repositório."""
    ultima = est.get("compactado_em")
    agora = datetime.now(timezone.utc)
    if ultima and (agora - datetime.fromisoformat(ultima)).days < DIAS_COMPACTAR:
        return
    try:
        if gh.compactar_historico():
            log.info("histórico do repositório de dados compactado")
        est["compactado_em"] = agora.isoformat(timespec="seconds")
    except Exception as e:  # noqa: BLE001 — tenta de novo na próxima rodada
        log.warning("não foi possível compactar o histórico: %s", e)


_TRAVA = None


def _trava_unica() -> bool:
    """Impede dois sincronizadores ao mesmo tempo (ex.: logon + duplo clique)."""
    global _TRAVA
    _TRAVA = open(AQUI / ".trava", "a+")
    try:
        if os.name == "nt":
            import msvcrt

            msvcrt.locking(_TRAVA.fileno(), msvcrt.LK_NBLCK, 1)
        else:
            import fcntl

            fcntl.flock(_TRAVA, fcntl.LOCK_EX | fcntl.LOCK_NB)
        return True
    except OSError:
        return False


def main() -> None:
    logging.basicConfig(
        level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s",
        handlers=[logging.StreamHandler(), logging.FileHandler(AQUI / "sincronizador.log", encoding="utf-8")])
    cfg = carregar_config()
    for p in cfg["pastas"]:
        log.info("pasta %s %s", p, "ok" if p.exists() else "NÃO ENCONTRADA")
    if "--testar" in sys.argv:
        rodada(cfg, testar=True)
        return
    if "--loop" not in sys.argv:
        rodada(cfg)
        return
    if not _trava_unica():
        log.info("o sincronizador já está rodando neste PC; saindo")
        return
    intervalo = max(1, int(cfg.get("intervalo_min", 5))) * 60
    while True:
        try:
            rodada(cfg)
        except Exception:  # noqa: BLE001 — sem internet, GitHub fora etc.: tenta na próxima
            log.exception("falha na rodada; nova tentativa em %d min", intervalo // 60)
        time.sleep(intervalo)


if __name__ == "__main__":
    main()
