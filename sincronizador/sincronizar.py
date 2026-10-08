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
    atualizar_horas = 6     # opcional: de quantas em quantas horas busca código novo no GitHub (0 = nunca)

Também, a cada minuto, executa os pedidos de mudança de datas / "Testar o robô" do site
no robô do SAP deste PC, avisa o site que está ligado (app/robo_pc.json) e, a cada
poucas horas, atualiza o próprio código e se reinicia (sincronizador/atualizar.py).
"""

from __future__ import annotations

import io
import json
import logging
import math
import os
import platform
import re
import subprocess
import sys
import time
import tomllib
from datetime import date, datetime, timezone
from pathlib import Path

import pandas as pd

RAIZ = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(RAIZ))

from central import leitura  # noqa: E402
from central import mudanca_datas as md  # noqa: E402
from central.config import PASTAS_PADRAO, _caminho  # noqa: E402
from central.fontes import GitHub, NaoEncontrado, Pastas  # noqa: E402
from central.leitura import ACAO_AF, AF, CONF, EQUIP, EQUIPE, IP19, IW38, MB52, NOTAS, OPER, REQ, TIPOS  # noqa: E402
from sincronizador import atualizar  # noqa: E402

AQUI = Path(__file__).resolve().parent
ARQ_CONFIG = AQUI / "config.toml"
ARQ_ESTADO = AQUI / "estado.json"
DESTINO = {IW38: "bases/IW38.parquet", MB52: "bases/MB52.parquet", REQ: "bases/REQUISICOES.parquet",
           IP19: "bases/IP19.parquet", OPER: "bases/IW38OP.parquet", NOTAS: "bases/IW28.parquet",
           EQUIP: "bases/IH08.parquet", CONF: "bases/IW47.parquet", EQUIPE: "bases/EQUIPE.parquet",
           AF: "bases/AF.parquet", ACAO_AF: "bases/AF_ACOES.parquet"}

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
class _Origem:
    def __init__(self, arquivo, aba, linha):
        self.arquivo, self.aba, self.linha = arquivo, aba, linha

    @property
    def rotulo(self) -> str:
        return self.arquivo.nome + (f" › aba {self.aba}" if self.aba else "")


_PISTA = re.compile(r"IW38|IW39|IW28|IW29|IP19|IP24|IH08|IE05|MB52|MB51|IW47|IW41|REQUISI|SOLICITA|GEST.*HH|GERENCIADOR DE AF", re.I)


def localizar(pastas: list[Path], est: dict) -> dict[str, list[_Origem]]:
    """{tipo: [origens]} — o arquivo mais novo de cada base, ou vários somados nas bases
    que se somam (IW38 + histórico, notas). Mesma regra do app: arquivos com nome de
    export do SAP são sempre verificados; os demais, até todas as bases serem achadas.
    O que já foi identificado fica no estado (não reabre o arquivo)."""
    sondagens = est.setdefault("sondagens", {})
    arquivos = sorted(Pastas(pastas, pastas[0], profundidade=4).listar(), key=lambda a: a.modificado, reverse=True)
    candidatos: dict[str, list[_Origem]] = {}
    for arq in arquivos:
        if arq.arquivo.lower().endswith(".json"):
            continue
        if len(candidatos) == len(TIPOS) and not _PISTA.search(arq.arquivo):
            continue
        if arq.assinatura not in sondagens:
            try:
                sondagens[arq.assinatura] = [list(x) for x in leitura.sondar(arq.id, Path(arq.id).read_bytes())]
            except OSError as e:  # arquivo bloqueado (aberto no Excel) ou ainda sincronizando
                log.warning("não consegui abrir %s: %s", arq.nome, e)
                continue
        for tipo, aba, linha in sondagens[arq.assinatura]:
            candidatos.setdefault(tipo, []).append(_Origem(arq, aba, linha))
    # esquece sondagens de arquivos que não existem mais (o estado não cresce para sempre)
    existentes = {a.assinatura for a in arquivos}
    for k in list(sondagens):
        if k not in existentes:
            del sondagens[k]
    return {t: leitura.escolher_origens(t, lst) for t, lst in candidatos.items()}


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
    for tipo, origens in achados.items():
        chave = ";".join(f"{o.arquivo.assinatura}|{o.aba}|{o.linha}" for o in origens)
        if enviados.get(tipo) == chave:
            continue
        rotulo = " + ".join(o.rotulo for o in origens)
        if testar:
            log.info("[teste] enviaria %s ← %s", DESTINO[tipo], rotulo)
            continue
        df = leitura.mesclar(tipo, [leitura.ler_arquivo(o.arquivo.id, Path(o.arquivo.id).read_bytes(), o.aba, o.linha)
                                    for o in origens])
        arq = origens[0].arquivo
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
        try:
            sinal_de_vida(gh, cfg=cfg)
        except Exception:  # noqa: BLE001 — informativo; tenta de novo na próxima rodada
            log.warning("não foi possível avisar o site que este PC está ligado", exc_info=True)
        try:
            executar_mudancas(gh)
        except Exception:  # noqa: BLE001 — tenta de novo na próxima rodada
            log.exception("falha ao executar as mudanças de datas")
        _compactar_se_preciso(gh, est)
        _salvar_estado(est)
    return mandou


# ----------------------------------------------------------------------------
# Mudança de datas pedida pelo site na nuvem (Calendário de ordens → robô do SAP deste PC)
# ----------------------------------------------------------------------------
ROBO = RAIZ / "automacao" / "robo_sap.py"
ROBO_CONFIGURADO = RAIZ / "automacao" / "robo_local.toml"
PEDIDO = RAIZ / "automacao" / "mudanca_datas_pedido.json"
RESULTADO = RAIZ / "automacao" / "mudanca_datas_pedido_resultado.json"


def _ler_lotes(gh) -> dict:
    try:
        return json.loads(gh.ler(gh.id_de(md.ARQ_LOTES)).decode("utf-8"))
    except NaoEncontrado:
        return {}


def _gravar_lote(gh, lote_id: str, lote: dict) -> None:
    """Relê o arquivo na hora e troca só este lote (o site pode ter criado outros enquanto isso)."""
    atual = _ler_lotes(gh)
    atual[lote_id] = {**lote, "atualizado_em": datetime.now(timezone.utc).isoformat(timespec="seconds"),
                      "atualizado_por": f"robô ({platform.node()})"}
    gh.gravar(md.ARQ_LOTES, json.dumps(atual, ensure_ascii=False, indent=1).encode("utf-8"))


def _rodar_robo(pedido: dict, progresso=None) -> dict:
    """Roda o robô do SAP deste PC com o pedido e devolve o resultado; enquanto ele roda, repassa o
    andamento (resultado parcial) ao site, no máximo a cada 45 s."""
    RESULTADO.unlink(missing_ok=True)
    PEDIDO.write_text(json.dumps(pedido, ensure_ascii=False, indent=1), encoding="utf-8")
    opcao = "--diagnosticar" if pedido.get("tipo") == md.DIAGNOSTICO else "--mudar-datas"
    proc = subprocess.Popen([sys.executable, str(ROBO), opcao, str(PEDIDO)], cwd=str(RAIZ))
    limite, visto, enviado = time.monotonic() + 3 * 3600, None, 0.0
    while proc.poll() is None:
        if time.monotonic() > limite:
            proc.kill()
            break
        time.sleep(5)
        parcial = _ler_resultado()
        marca = (len(parcial.get("itens", [])), len(parcial.get("consultas", [])), len(parcial.get("etapas", [])),
                 parcial.get("aguardando"))
        if progresso and parcial.get("em_andamento") and marca != visto and time.monotonic() - enviado >= 45:
            visto, enviado = marca, time.monotonic()
            try:
                progresso(parcial)
            except Exception:  # noqa: BLE001 — andamento é só informativo
                log.warning("não deu para mandar o andamento ao site", exc_info=True)
    res = _ler_resultado()
    if not res or res.get("em_andamento"):
        ultimo = res.get("erro") or ""
        res = {**res, "em_andamento": False,
               "erro": ultimo or f"o robô terminou sem gravar o resultado (código {proc.returncode}); veja "
                                 "automacao/robo_sap.log neste PC"}
    return res


def _ler_resultado() -> dict:
    try:
        return json.loads(RESULTADO.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {}


def executar_mudancas(gh, rodar=None) -> list[str]:
    """Executa no SAP os lotes "solicitada" (um por vez, o mais antigo primeiro). Só no PC com o robô."""
    if rodar is None:
        if not ROBO_CONFIGURADO.exists():
            return []
        rodar = _rodar_robo
    feitos = []
    lotes = _ler_lotes(gh)
    for lote_id in sorted(k for k, v in lotes.items() if isinstance(v, dict) and v.get("status") == md.SOLICITADA):
        lote = {**lotes[lote_id], "status": md.EM_EXECUCAO,
                "iniciado_em": datetime.now(timezone.utc).isoformat(timespec="seconds")}
        _gravar_lote(gh, lote_id, lote)
        log.info("%s: lote %s (%d ordens)", "teste do robô" if lote.get("tipo") == md.DIAGNOSTICO
                 else "mudança de datas", lote_id, len(lote.get("itens", [])))

        def progresso(parcial: dict, lote_id=lote_id, lote=lote) -> None:
            _gravar_lote(gh, lote_id, {**lote, "progresso": md.progresso(parcial)})

        try:
            resultado = rodar(md.job(lote_id, lote), progresso)
        except Exception as e:  # noqa: BLE001
            log.exception("falha ao rodar o robô")
            resultado = {"erro": f"falha ao rodar o robô: {e}", "itens": []}
        lote = md.aplicar_resultado(lote, resultado)
        _gravar_lote(gh, lote_id, lote)
        log.info("lote %s → %s", lote_id, lote.get("resumo"))
        feitos.append(lote_id)
        sinal_de_vida(gh, forcar=True)
    return feitos


def recuperar_interrompidos(gh) -> list[str]:
    """Lotes que este PC deixou "em execução" (PC desligado ou sincronizador reiniciado no meio) voltam
    como "com erros", para o site não ficar esperando para sempre."""
    meu = f"robô ({platform.node()})"
    lotes = _ler_lotes(gh)
    presos = [k for k, v in lotes.items() if isinstance(v, dict) and v.get("status") == md.EM_EXECUCAO
              and v.get("atualizado_por") == meu]
    for lote_id in presos:
        lote = {**lotes[lote_id], "status": md.COM_ERROS,
                "resumo": "interrompido: o PC do robô desligou ou o sincronizador reiniciou no meio. Confira as "
                          "ordens já feitas no histórico e rode de novo o que faltou."}
        lote.pop("progresso", None)
        _gravar_lote(gh, lote_id, lote)
        log.warning("lote %s estava em execução quando o sincronizador parou; marcado como interrompido", lote_id)
    return presos


# ----------------------------------------------------------------------------
# Sinal de vida para o site (app/robo_pc.json) e atualização do código
# ----------------------------------------------------------------------------
INICIADO_EM = datetime.now(timezone.utc).isoformat(timespec="seconds")
SINAL_MIN = 20
_ULTIMO_SINAL: list = [None]   # None = ainda não mandou (relógio monotônico começa no boot)


def _versao_robo() -> tuple[str, list[str]]:
    try:
        from automacao import robo_sap

        return robo_sap.VERSAO, list(robo_sap.RECURSOS)
    except Exception:  # noqa: BLE001
        return "?", []


def sinal_de_vida(gh, forcar: bool = False, cfg: dict | None = None) -> bool:
    """Grava em app/robo_pc.json que este PC está ligado, com a versão do código e se tem o robô do SAP
    (a cada SINAL_MIN minutos). O site usa isso para dizer se o pedido vai ser atendido."""
    if not forcar and _ULTIMO_SINAL[0] is not None and time.monotonic() - _ULTIMO_SINAL[0] < SINAL_MIN * 60:
        return False
    versao_robo, recursos = _versao_robo()
    try:
        atual = json.loads(gh.ler(gh.id_de(md.ARQ_ROBO_PC)).decode("utf-8"))
    except (NaoEncontrado, ValueError):
        atual = {}
    atual[platform.node()] = {
        "visto_em": datetime.now(timezone.utc).isoformat(timespec="seconds"), "iniciado_em": INICIADO_EM,
        "versao_codigo": atualizar.versao_local()[:7], "versao_robo": versao_robo, "recursos": recursos,
        "robo_configurado": ROBO_CONFIGURADO.exists(),
        "atualizacao_auto": bool((cfg or {}).get("atualizar_horas", 6))}
    gh.gravar(md.ARQ_ROBO_PC, json.dumps(atual, ensure_ascii=False, indent=1).encode("utf-8"))
    _ULTIMO_SINAL[0] = time.monotonic()
    return True


def atualizar_codigo(cfg: dict, est: dict) -> bool:
    """De tempos em tempos busca código novo no GitHub; True se algo mudou (o loop então se reinicia)."""
    horas = float(cfg.get("atualizar_horas", 6) or 0)
    if horas <= 0:
        return False
    ultima = est.get("atualizacao_verificada_em")
    agora = datetime.now(timezone.utc)
    if ultima and (agora - datetime.fromisoformat(ultima)).total_seconds() < horas * 3600:
        return False
    est["atualizacao_verificada_em"] = agora.isoformat(timespec="seconds")
    _salvar_estado(est)
    try:
        r = atualizar.atualizar()
    except Exception as e:  # noqa: BLE001 — sem internet etc.: tenta na próxima
        log.warning("não foi possível buscar código novo: %s", e)
        return False
    if r["arquivos"]:
        log.info("código atualizado para %s (%d arquivo(s)); reiniciando", r["para"][:7], len(r["arquivos"]))
    return bool(r["arquivos"])


def _reiniciar() -> None:
    """Abre de novo o sincronizador (com o código novo) e encerra este."""
    if _TRAVA is not None:
        _TRAVA.close()                      # libera a trava para o novo processo
    vbs = AQUI / "rodar_oculto.vbs"
    if os.name == "nt" and vbs.exists():
        subprocess.Popen(["wscript.exe", str(vbs)], cwd=str(RAIZ))   # uv run sincroniza as dependências
        sys.exit(0)
    os.execv(sys.executable, [sys.executable, str(Path(__file__).resolve()), "--loop"])


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
    gh = GitHub(_Cfg(cfg["repo"], cfg["token"], cfg.get("ramo", "main")))
    versao_robo, _ = _versao_robo()
    log.info("sincronizador iniciado · código %s · robô %s · robô do SAP %s", atualizar.versao_local()[:7] or "?",
             versao_robo, "configurado" if ROBO_CONFIGURADO.exists() else "não configurado neste PC")
    try:
        recuperar_interrompidos(gh)
    except Exception:  # noqa: BLE001
        log.warning("não foi possível conferir os lotes interrompidos", exc_info=True)
    while True:
        if atualizar_codigo(cfg, _estado()):
            _reiniciar()
        try:
            rodada(cfg, gh)
        except Exception:  # noqa: BLE001 — sem internet, GitHub fora etc.: tenta na próxima
            log.exception("falha na rodada; nova tentativa em %d min", intervalo // 60)
        # entre uma rodada e outra, confere a cada minuto se o site pediu mudança de datas
        for _ in range(intervalo // 60):
            time.sleep(60)
            try:
                executar_mudancas(gh)
                sinal_de_vida(gh, cfg=cfg)
            except Exception:  # noqa: BLE001
                log.exception("falha ao executar as mudanças de datas")


if __name__ == "__main__":
    main()
