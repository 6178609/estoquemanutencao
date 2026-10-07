"""Robô do SAP: exporta as transações de automacao/transacoes.toml para a pasta
que o site lê (padrão: Downloads\\SITE), do jeito que uma pessoa faria na tela.

Roda no PC que tem o SAP GUI, com o SAP GUI Scripting habilitado. Se já houver
uma sessão do SAP aberta e logada, usa ela; senão faz o login com o usuário e a
senha guardados pelo `configurar_robo.bat` no Gerenciador de Credenciais do
Windows (criptografados pelo Windows, nunca em arquivo do projeto).

Uso:
    uv run python automacao/robo_sap.py                 # todas as transações
    uv run python automacao/robo_sap.py --mudar-datas automacao/mudanca_datas_pedido.json   # pedido do calendário
    uv run python automacao/robo_sap.py -t MB52         # só a MB52
    uv run python automacao/robo_sap.py --configurar    # guarda usuário/senha/conexão
"""

from __future__ import annotations

import argparse
import getpass
import json
import logging
import os
import subprocess
import sys
import time
import tomllib
from datetime import datetime, timezone
from pathlib import Path

AQUI = Path(__file__).resolve().parent
ARQ_TRANSACOES = AQUI / "transacoes.toml"
ARQ_LOCAL = AQUI / "robo_local.toml"     # usuário e conexão deste PC (fora do Git)
ARQ_STATUS = AQUI / "robo_status.json"   # última execução, lida pelo site
ARQ_LOG = AQUI / "robo_sap.log"
SERVICO = "CentralManutencao-SAP"          # nome no Gerenciador de Credenciais do Windows

FORMATOS = {"nao_convertido": 0, "tabulado": 1, "rtf": 2, "html": 3}
ID_FORMATO = "wnd[1]/usr/subSUBSCREEN_STEPLOOP:SAPLSPO5:0150/sub:SAPLSPO5:0150/radSPOPLI-SELFLAG[{i},0]"

log = logging.getLogger("robo_sap")


class RoboErro(RuntimeError):
    pass


# ----------------------------------------------------------------------------
# Configuração e credenciais
# ----------------------------------------------------------------------------
def carregar_config(transacoes: Path = ARQ_TRANSACOES, local: Path = ARQ_LOCAL) -> dict:
    with open(transacoes, "rb") as f:
        cfg = tomllib.load(f)
    if local.exists():
        with open(local, "rb") as f:
            loc = tomllib.load(f)
        cfg.setdefault("sap", {}).update(loc.get("sap", {}))
        if loc.get("pasta_destino"):
            cfg["pasta_destino"] = loc["pasta_destino"]
    pasta = os.path.expandvars(os.path.expanduser(str(cfg.get("pasta_destino", "~/Downloads/SITE")).replace("\\", "/")))
    cfg["pasta_destino"] = str(Path(pasta))
    return cfg


def ler_credenciais(cfg: dict) -> tuple[str, str]:
    import keyring

    usuario = cfg.get("sap", {}).get("usuario", "")
    senha = keyring.get_password(SERVICO, usuario) if usuario else None
    if not usuario or not senha:
        raise RoboErro("Usuário/senha do SAP não configurados neste PC. Rode automacao\\configurar_robo.bat.")
    return usuario, senha


def configurar() -> None:
    import keyring

    cfg = carregar_config()
    atual = cfg.get("sap", {})
    print("Configuração do robô do SAP (fica só neste PC).")
    usuario = input(f"Usuário SAP [{atual.get('usuario', '')}]: ").strip() or atual.get("usuario", "")
    senha = getpass.getpass("Senha SAP (não aparece ao digitar): ")
    conexao = input(f"Nome da conexão no SAP Logon [{atual.get('conexao', '')}]: ").strip() or atual.get("conexao", "")
    if not usuario or not senha:
        raise SystemExit("Usuário e senha são obrigatórios.")
    keyring.set_password(SERVICO, usuario, senha)
    ARQ_LOCAL.write_text(
        "# Gerado por configurar_robo.bat — só deste PC (a senha fica no Gerenciador de Credenciais do Windows).\n"
        f"[sap]\nusuario = {json.dumps(usuario)}\nconexao = {json.dumps(conexao, ensure_ascii=False)}\n", encoding="utf-8")
    print("Credenciais guardadas no Gerenciador de Credenciais do Windows.")


# ----------------------------------------------------------------------------
# Conexão com o SAP GUI
# ----------------------------------------------------------------------------
def _existe(sessao, id_: str):
    try:
        return sessao.findById(id_)
    except Exception:  # noqa: BLE001 — o SAP GUI lança erro COM quando o campo não existe
        return None


def _barra_de_status(sessao) -> tuple[str, str]:
    barra = _existe(sessao, "wnd[0]/sbar")
    if barra is None:
        return "", ""
    return str(getattr(barra, "MessageType", "") or ""), str(getattr(barra, "Text", "") or "")


def logado(sessao) -> bool:
    return str(sessao.Info.Transaction) not in ("S000", "") and bool(str(sessao.Info.User))


def login(sessao, sap: dict, credenciais) -> None:
    usuario, senha = credenciais()
    log.info("fazendo login no SAP (mandante %s, usuário %s)", sap.get("mandante", "702"), usuario)
    sessao.findById("wnd[0]/usr/txtRSYST-MANDT").text = str(sap.get("mandante", "702"))
    sessao.findById("wnd[0]/usr/txtRSYST-BNAME").text = usuario
    sessao.findById("wnd[0]/usr/pwdRSYST-BCODE").text = senha
    sessao.findById("wnd[0]/usr/txtRSYST-LANGU").text = str(sap.get("idioma", "PT"))
    sessao.findById("wnd[0]").sendVKey(0)
    # "usuário já conectado em outro lugar": continua sem encerrar as outras sessões
    multi = _existe(sessao, "wnd[1]/usr/radMULTI_LOGON_OPT2")
    if multi is not None:
        multi.select()
        sessao.findById("wnd[1]").sendVKey(0)
    if not logado(sessao):
        _, texto = _barra_de_status(sessao)
        raise RoboErro(f"Login no SAP não aceito: {texto or 'verifique usuário e senha'}")


def _abrir_saplogon() -> None:
    for caminho in [r"C:\Program Files (x86)\SAP\FrontEnd\SAPgui\saplogon.exe",
                    r"C:\Program Files\SAP\FrontEnd\SAPgui\saplogon.exe"]:
        if Path(caminho).exists():
            subprocess.Popen([caminho])
            return
    raise RoboErro("SAP Logon não encontrado neste PC.")


def conectar(cfg: dict, credenciais=None, obter_gui=None):
    """Sessão do SAP pronta para uso (reaproveita a aberta; abre e loga se precisar)."""
    credenciais = credenciais or (lambda: ler_credenciais(cfg))
    if obter_gui is None:
        import win32com.client

        def obter_gui():
            return win32com.client.GetObject("SAPGUI")

    try:
        gui = obter_gui()
    except Exception:  # noqa: BLE001 — SAP Logon fechado
        log.info("SAP Logon fechado; abrindo")
        _abrir_saplogon()
        for _ in range(30):
            time.sleep(1)
            try:
                gui = obter_gui()
                break
            except Exception:  # noqa: BLE001
                continue
        else:
            raise RoboErro("O SAP Logon não abriu a tempo.")
    app = gui.GetScriptingEngine
    sessao = None
    if app.Children.Count > 0 and app.Children(0).Children.Count > 0:
        sessao = app.Children(0).Children(0)
    else:
        conexao = cfg.get("sap", {}).get("conexao", "")
        if not conexao:
            raise RoboErro("SAP aberto sem nenhuma sessão e a conexão do SAP Logon não está configurada "
                           "(rode automacao\\configurar_robo.bat).")
        log.info("abrindo a conexão '%s'", conexao)
        sessao = app.OpenConnection(conexao, True).Children(0)
    if logado(sessao):
        log.info("usando a sessão já aberta do usuário %s", sessao.Info.User)
    else:
        login(sessao, cfg.get("sap", {}), credenciais)
    return sessao


# ----------------------------------------------------------------------------
# Transação
# ----------------------------------------------------------------------------
def executar_transacao(sessao, t: dict, pasta: Path, espera_arquivo: float = 60.0) -> Path:
    nome = t.get("nome", t["codigo"])
    destino = pasta / t["arquivo"]
    pasta.mkdir(parents=True, exist_ok=True)
    antes = destino.stat().st_mtime if destino.exists() else 0.0
    passo = ""

    def etapa(texto):
        nonlocal passo
        passo = texto
        log.info("%s: %s", nome, texto)

    try:
        etapa("abrindo a transação")
        sessao.findById("wnd[0]/tbar[0]/okcd").text = f"/n{t['codigo']}"
        sessao.findById("wnd[0]").sendVKey(0)

        for id_, valor in t.get("campos", {}).items():
            etapa(f"preenchendo {id_}")
            sessao.findById(id_).text = str(valor)
        for id_, valor in t.get("marcar", {}).items():
            etapa(f"{'marcando' if valor else 'desmarcando'} {id_}")
            sessao.findById(id_).selected = bool(valor)
        for id_ in t.get("selecionar", {}).values():
            etapa(f"selecionando {id_}")
            sessao.findById(id_).select()

        etapa("executando (F8)")
        sessao.findById("wnd[0]").sendVKey(8)
        tipo, texto = _barra_de_status(sessao)
        if tipo in ("E", "A"):
            raise RoboErro(f"o SAP respondeu: {texto}")

        if t.get("exportar", "lista") == "lista":
            etapa("Gravar lista em file (%PC)")
            sessao.findById("wnd[0]/tbar[0]/okcd").text = "%PC"
            sessao.findById("wnd[0]").sendVKey(0)
            etapa(f"escolhendo o formato {t.get('formato', 'html')}")
            sessao.findById(ID_FORMATO.format(i=FORMATOS[t.get("formato", "html")])).select()
            sessao.findById("wnd[1]/tbar[0]/btn[0]").press()
        else:
            raise RoboErro(f"forma de exportar desconhecida: {t.get('exportar')}")

        etapa(f"gravando em {destino}")
        sessao.findById("wnd[1]/usr/ctxtDY_PATH").text = str(pasta) + os.sep
        sessao.findById("wnd[1]/usr/ctxtDY_FILENAME").text = t["arquivo"]
        sessao.findById("wnd[1]/tbar[0]/btn[11]").press()  # "Substituir" (cria se não existir)

        etapa("conferindo o arquivo gravado")
        limite = time.time() + espera_arquivo
        while time.time() < limite:
            if destino.exists() and destino.stat().st_mtime > antes and destino.stat().st_size > 0:
                break
            time.sleep(0.5)
        else:
            raise RoboErro(f"o SAP não gravou {destino}")
    except RoboErro as e:
        raise RoboErro(f"{nome} · {passo}: {e}") from e
    except Exception as e:  # noqa: BLE001 — erro COM do SAP GUI (campo inexistente etc.)
        raise RoboErro(f"{nome} · {passo}: {e}. Confira o ID em automacao/transacoes.toml.") from e
    finally:
        try:
            sessao.findById("wnd[0]/tbar[0]/okcd").text = "/n"
            sessao.findById("wnd[0]").sendVKey(0)
        except Exception:  # noqa: BLE001
            pass
    log.info("%s: gravado %s (%d KB)", nome, destino, destino.stat().st_size // 1024)
    return destino


# ----------------------------------------------------------------------------
# Execução completa (com status para o site)
# ----------------------------------------------------------------------------
def _gravar_status(status: dict, arq: Path = ARQ_STATUS) -> None:
    tmp = arq.with_suffix(".tmp")
    tmp.write_text(json.dumps(status, ensure_ascii=False, indent=1), encoding="utf-8")
    os.replace(tmp, arq)


def _agora() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def rodar(nomes: list[str] | None = None, cfg: dict | None = None, conectar_fn=conectar,
          arq_status: Path = ARQ_STATUS) -> dict:
    cfg = cfg or carregar_config()
    transacoes = [t for t in cfg.get("transacao", []) if not nomes or t.get("nome", t["codigo"]) in nomes]
    status = {"inicio": _agora(), "fim": None, "em_andamento": True, "ok": None, "transacoes": {}, "erro": ""}
    _gravar_status(status, arq_status)
    try:
        sessao = conectar_fn(cfg)
        pasta = Path(cfg["pasta_destino"])
        for t in transacoes:
            nome = t.get("nome", t["codigo"])
            try:
                destino = executar_transacao(sessao, t, pasta)
                status["transacoes"][nome] = {"ok": True, "arquivo": str(destino), "em": _agora()}
            except RoboErro as e:
                log.error("%s", e)
                status["transacoes"][nome] = {"ok": False, "mensagem": str(e), "em": _agora()}
    except RoboErro as e:
        log.error("%s", e)
        status["erro"] = str(e)
    status["ok"] = not status["erro"] and all(v["ok"] for v in status["transacoes"].values())
    status["fim"], status["em_andamento"] = _agora(), False
    _gravar_status(status, arq_status)
    return status


# ----------------------------------------------------------------------------
# Mudança de datas das ordens (pedida pelo calendário do site)
# ----------------------------------------------------------------------------
# A IW38 lista as ordens; a alteração de cada uma é feita na tela de modificar ordem (IW32, a mesma que
# a IW38 abre num duplo clique): início-base (CAUFVD-GSTRP) e fim-base (CAUFVD-GLTRP), depois Gravar.
CAMPO_INICIO, CAMPO_FIM = "CAUFVD-GSTRP", "CAUFVD-GLTRP"
MAX_ORDENS = 300


def _campo_data(sessao, md: dict, chave: str, nome: str):
    """Campo de data na tela da ordem: o ID configurado ou, sem ele, procurado pelo nome técnico."""
    id_ = md.get(chave)
    if id_:
        campo = _existe(sessao, id_)
        if campo is not None:
            return campo
    try:
        campo = sessao.findById("wnd[0]/usr").findByName(nome, "GuiCTextField")
    except Exception:  # noqa: BLE001
        campo = None
    if campo is None:
        raise RoboErro(f"campo {nome} não encontrado na tela da ordem; grave a IW32 no Script Recording e "
                       f"informe o ID em [mudanca_datas] {chave} (automacao/transacoes.toml)")
    return campo


def _ler_data(texto: str, fmt: str) -> str:
    try:
        return datetime.strptime(str(texto).strip(), fmt).date().isoformat()
    except ValueError:
        return ""


def _popups(sessao, avisos: list[str], limite: int = 3) -> None:
    """Fecha janelas de aviso (Enter = resposta padrão), anotando o texto de cada uma."""
    for _ in range(limite):
        jan = _existe(sessao, "wnd[1]")
        if jan is None:
            return
        avisos.append(str(getattr(jan, "Text", "") or "janela do SAP"))
        jan.sendVKey(0)


def _confirmar_tela(sessao, avisos: list[str]) -> None:
    """Enter na tela da ordem; aviso (W) é aceito, erro (E/A) para a ordem."""
    for _ in range(3):
        sessao.findById("wnd[0]").sendVKey(0)
        _popups(sessao, avisos)
        tipo, texto = _barra_de_status(sessao)
        if tipo in ("E", "A"):
            raise RoboErro(texto or "o SAP recusou as datas")
        if tipo != "W":
            return
        avisos.append(texto)


def mudar_data_ordem(sessao, ordem: str, inicio: str, fim: str, md: dict, simular: bool = False) -> dict:
    """Muda o início/fim-base de uma ordem. Devolve {"ordem", "ok", "mensagem", "inicio_sap", "fim_sap"}."""
    fmt = md.get("formato_data", "%d.%m.%Y")
    res = {"ordem": ordem, "ok": False, "mensagem": "", "inicio_sap": "", "fim_sap": ""}
    avisos: list[str] = []
    novo_ini = datetime.fromisoformat(inicio).strftime(fmt)
    novo_fim = datetime.fromisoformat(fim or inicio).strftime(fmt)
    try:
        sessao.findById("wnd[0]/tbar[0]/okcd").text = "/n" + md.get("transacao", "IW32")
        sessao.findById("wnd[0]").sendVKey(0)
        sessao.findById(md.get("campo_ordem", "wnd[0]/usr/ctxtCAUFVD-AUFNR")).text = ordem
        sessao.findById("wnd[0]").sendVKey(0)
        _popups(sessao, avisos)
        tipo, texto = _barra_de_status(sessao)
        if tipo in ("E", "A"):
            raise RoboErro(texto or "ordem não abriu")
        c_ini = _campo_data(sessao, md, "campo_inicio", CAMPO_INICIO)
        c_fim = _campo_data(sessao, md, "campo_fim", CAMPO_FIM)
        res["inicio_sap"], res["fim_sap"] = _ler_data(c_ini.text, fmt), _ler_data(c_fim.text, fmt)
        if not getattr(c_ini, "Changeable", True):
            raise RoboErro("a data de início não pode ser alterada (ordem encerrada ou bloqueada por outro usuário?)")
        c_fim.text = novo_fim
        c_ini.text = novo_ini
        _confirmar_tela(sessao, avisos)
        if simular:
            res.update(ok=True, mensagem="simulação: o SAP aceitou as datas, nada foi gravado")
            return res
        sessao.findById("wnd[0]/tbar[0]/btn[11]").press()   # Gravar
        _popups(sessao, avisos)
        tipo, texto = _barra_de_status(sessao)
        if tipo in ("E", "A"):
            raise RoboErro(texto or "o SAP não gravou a ordem")
        res["mensagem"] = texto or "ordem gravada"
        if md.get("conferir", True):
            sessao.findById("wnd[0]/tbar[0]/okcd").text = "/nIW33"
            sessao.findById("wnd[0]").sendVKey(0)
            sessao.findById(md.get("campo_ordem", "wnd[0]/usr/ctxtCAUFVD-AUFNR")).text = ordem
            sessao.findById("wnd[0]").sendVKey(0)
            _popups(sessao, avisos)
            gravado = _ler_data(_campo_data(sessao, md, "campo_inicio", CAMPO_INICIO).text, fmt)
            if gravado != datetime.fromisoformat(inicio).date().isoformat():
                raise RoboErro(f"depois de gravar, o SAP mostra início {gravado or '?'} (a programação da ordem "
                               "pode ter recalculado a data)")
        res["ok"] = True
    except RoboErro as e:
        res["mensagem"] = str(e)
    except Exception as e:  # noqa: BLE001 — erro COM do SAP GUI
        res["mensagem"] = f"erro no SAP GUI: {e}"
    finally:
        if avisos:
            res["mensagem"] = (res["mensagem"] + " · avisos: " + "; ".join(a for a in avisos if a)).strip(" ·")
        try:  # sai sem gravar o que tiver ficado pela metade
            sessao.findById("wnd[0]/tbar[0]/okcd").text = "/n"
            sessao.findById("wnd[0]").sendVKey(0)
            _popups(sessao, [])
        except Exception:  # noqa: BLE001
            pass
    log.info("ordem %s: %s %s", ordem, "OK" if res["ok"] else "ERRO", res["mensagem"])
    return res


def rodar_mudancas(arq_job: Path, cfg: dict | None = None, conectar_fn=conectar, simular: bool | None = None) -> dict:
    """Processa o pedido do site (JSON com lote, simular e itens [{ordem, inicio, fim}]) e grava o resultado
    ao lado (<pedido>_resultado.json), atualizado a cada ordem para o site mostrar o andamento."""
    cfg = cfg or carregar_config()
    md = cfg.get("mudanca_datas", {})
    pedido = json.loads(Path(arq_job).read_text(encoding="utf-8"))
    simular = bool(pedido.get("simular")) if simular is None else simular
    arq_res = Path(arq_job).with_name(Path(arq_job).stem + "_resultado.json")
    res = {"lote": pedido.get("lote", ""), "inicio": _agora(), "fim": None, "em_andamento": True,
           "simular": simular, "total": len(pedido.get("itens", [])), "itens": [], "erro": ""}
    _gravar_status(res, arq_res)
    itens = pedido.get("itens", [])
    try:
        if len(itens) > MAX_ORDENS:
            raise RoboErro(f"{len(itens)} ordens no pedido; o limite é {MAX_ORDENS}")
        sessao = conectar_fn(cfg)
        log.info("mudança de datas: lote %s, %d ordem(ns)%s", res["lote"], len(itens), " (simulação)" if simular else "")
        for it in itens:
            res["itens"].append(mudar_data_ordem(sessao, str(it["ordem"]), it["inicio"], it.get("fim") or it["inicio"],
                                                 md, simular))
            _gravar_status(res, arq_res)
    except RoboErro as e:
        log.error("%s", e)
        res["erro"] = str(e)
    res["fim"], res["em_andamento"] = _agora(), False
    res["ok"] = not res["erro"] and all(r["ok"] for r in res["itens"])
    _gravar_status(res, arq_res)
    return res


_TRAVA = None


def _trava_unica() -> bool:
    global _TRAVA
    _TRAVA = open(AQUI / ".robo.trava", "a+")
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
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s",
                        handlers=[logging.StreamHandler(), logging.FileHandler(ARQ_LOG, encoding="utf-8")])
    ap = argparse.ArgumentParser(description="Exporta transações do SAP para a pasta do site.")
    ap.add_argument("-t", "--transacao", action="append", help="só esta transação (pode repetir)")
    ap.add_argument("--configurar", action="store_true", help="guardar usuário, senha e conexão deste PC")
    ap.add_argument("--mudar-datas", metavar="PEDIDO.json", help="muda as datas das ordens do pedido do site")
    ap.add_argument("--simular", action="store_true", help="com --mudar-datas: abre as ordens e não grava")
    args = ap.parse_args()
    if args.configurar:
        configurar()
        return
    if not _trava_unica():
        log.info("o robô já está rodando; esta chamada foi ignorada")
        return
    if args.mudar_datas:
        res = rodar_mudancas(Path(args.mudar_datas), simular=True if args.simular else None)
        sys.exit(0 if res["ok"] else 1)
    status = rodar(args.transacao)
    sys.exit(0 if status["ok"] else 1)


if __name__ == "__main__":
    main()
