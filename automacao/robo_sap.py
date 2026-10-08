"""Robô do SAP: exporta as transações de automacao/transacoes.toml para a pasta
que o site lê (padrão: Downloads\\SITE), do jeito que uma pessoa faria na tela.

Roda no PC que tem o SAP GUI, com o SAP GUI Scripting habilitado. Se já houver
uma sessão do SAP aberta e logada, usa ela; senão faz o login com o usuário e a
senha guardados pelo `configurar_robo.bat` no Gerenciador de Credenciais do
Windows (criptografados pelo Windows, nunca em arquivo do projeto).

Uso:
    uv run python automacao/robo_sap.py                 # todas as transações
    uv run python automacao/robo_sap.py --mudar-datas automacao/mudanca_datas_pedido.json   # pedido do calendário
    uv run python automacao/robo_sap.py --diagnosticar automacao/mudanca_datas_pedido.json  # "Testar o robô" do site
    uv run python automacao/robo_sap.py --versao        # versão e recursos deste robô
    uv run python automacao/robo_sap.py -t MB52         # só a MB52
    uv run python automacao/robo_sap.py --configurar    # guarda usuário/senha/conexão
"""

from __future__ import annotations

import argparse
import getpass
import json
import logging
import os
import platform
import re
import subprocess
import sys
import time
import tomllib
from datetime import date, datetime, timezone
from pathlib import Path

AQUI = Path(__file__).resolve().parent
ARQ_TRANSACOES = AQUI / "transacoes.toml"
ARQ_LOCAL = AQUI / "robo_local.toml"     # usuário e conexão deste PC (fora do Git)
ARQ_STATUS = AQUI / "robo_status.json"   # última execução, lida pelo site
ARQ_LOG = AQUI / "robo_sap.log"
SERVICO = "CentralManutencao-SAP"          # nome no Gerenciador de Credenciais do Windows

FORMATOS = {"nao_convertido": 0, "tabulado": 1, "rtf": 2, "html": 3}
ID_FORMATO = "wnd[1]/usr/subSUBSCREEN_STEPLOOP:SAPLSPO5:0150/sub:SAPLSPO5:0150/radSPOPLI-SELFLAG[{i},0]"

# Versão do robô e o que ele sabe fazer: o sincronizador manda isso para o site (robo_pc.json), que avisa
# quando o PC está com o código antigo.
VERSAO = "2026.10.08"
RECURSOS = ("mudar_datas_iw38", "sessao_propria", "diagnostico")
ESPERA_TRAVA_MIN = 20     # mudança de datas/diagnóstico esperam o robô terminar outra execução (ex.: export)

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
        # IDs da mudança de datas ajustados para o SAP deste PC (o transacoes.toml é trocado na atualização)
        md = cfg.setdefault("mudanca_datas", {})
        for k, v in loc.get("mudanca_datas", {}).items():
            md[k] = {**md[k], **v} if isinstance(v, dict) and isinstance(md.get(k), dict) else v
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


def _escolher_sessao(app, mandante: str):
    """(sessão, mandantes de outras sessões): a 1ª sessão já logada no mandante do robô — com o SAP de qualidade ou
    outro mandante aberto antes, o robô não exporta nem muda datas no lugar errado —; sem ela, a 1ª tela de login."""
    tela_login, outros = None, []
    for i in range(int(app.Children.Count)):
        con = app.Children(i)
        for j in range(int(con.Children.Count)):
            s = con.Children(j)
            try:
                if logado(s):
                    cliente = str(getattr(s.Info, "Client", "") or "")
                    if not mandante or not cliente or cliente == mandante:
                        return s, outros
                    outros.append(cliente)
                elif tela_login is None:
                    tela_login = s
            except Exception:  # noqa: BLE001 — sessão ocupada ou fechando
                continue
    return tela_login, outros


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
    mandante = str(cfg.get("sap", {}).get("mandante", "702") or "")
    sessao, outros = _escolher_sessao(app, mandante)
    if sessao is None:
        conexao = cfg.get("sap", {}).get("conexao", "")
        if not conexao:
            if outros:
                raise RoboErro(f"o SAP está aberto só no mandante {', '.join(sorted(set(outros)))} e o robô trabalha "
                               f"no {mandante}: entre no mandante {mandante} (ou configure a conexão do SAP Logon no "
                               "automacao\\configurar_robo.bat para o robô abrir sozinho)")
            raise RoboErro("SAP aberto sem nenhuma sessão e a conexão do SAP Logon não está configurada "
                           "(rode automacao\\configurar_robo.bat).")
        log.info("abrindo a conexão '%s'", conexao)
        sessao = app.OpenConnection(conexao, True).Children(0)
    if logado(sessao):
        log.info("usando a sessão já aberta do usuário %s", sessao.Info.User)
    else:
        login(sessao, cfg.get("sap", {}), credenciais)
    return sessao


_SESSOES_NOVAS: set[str] = set()


def _sessao_propria(base):
    """Abre uma janela (sessão) nova do SAP só para o robô, para não mexer na tela em que a pessoa está
    trabalhando (o /n do robô perderia o que estivesse sem gravar). Sem como abrir, usa a sessão dada."""
    try:
        con = base.Parent
        sessoes = [con.Children(i) for i in range(int(con.Children.Count))]
        antes = {str(x.Id) for x in sessoes}
        if len(antes) >= 6:
            raise RoboErro("já há 6 janelas do SAP abertas (o limite do SAP); feche uma para o robô abrir a dele")
        livre = next((x for x in sessoes if not x.Busy), base)
        livre.CreateSession()
    except RoboErro:
        raise
    except Exception as e:  # noqa: BLE001
        log.warning("não deu para abrir uma janela nova do SAP (%s); usando a janela atual", e)
        return base
    for _ in range(60):
        time.sleep(0.5)
        try:
            for i in range(int(con.Children.Count)):
                nova = con.Children(i)
                if str(nova.Id) not in antes and not nova.Busy:
                    _SESSOES_NOVAS.add(str(nova.Id))
                    log.info("janela própria do robô aberta no SAP")
                    return nova
        except Exception:  # noqa: BLE001 — a sessão ainda está sendo criada
            continue
    raise RoboErro("a janela nova do SAP não abriu a tempo")


def conectar_robo(cfg: dict):
    """Conecta e abre a janela própria do robô (mudança de datas e diagnóstico)."""
    return _sessao_propria(conectar(cfg))


def _encerrar(sessao) -> None:
    """Fecha a janela que o robô abriu (as da pessoa ficam como estavam)."""
    if sessao is None or str(getattr(sessao, "Id", "")) not in _SESSOES_NOVAS:
        return
    try:
        sessao.findById("wnd[0]/tbar[0]/okcd").text = "/i"    # encerra esta sessão
        sessao.findById("wnd[0]").sendVKey(0)
    except Exception:  # noqa: BLE001
        pass
    _SESSOES_NOVAS.discard(str(getattr(sessao, "Id", "")))


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


def rodar(nomes: list[str] | None = None, cfg: dict | None = None, conectar_fn=None,
          arq_status: Path = ARQ_STATUS) -> dict:
    # janela própria do robô: o "/n" de cada transação não derruba o que a pessoa estiver fazendo no SAP
    conectar_fn = conectar_fn or conectar_robo
    cfg = cfg or carregar_config()
    transacoes = [t for t in cfg.get("transacao", []) if not nomes or t.get("nome", t["codigo"]) in nomes]
    status = {"inicio": _agora(), "fim": None, "em_andamento": True, "ok": None, "transacoes": {}, "erro": ""}
    _gravar_status(status, arq_status)
    sessao = None
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
    except Exception as e:  # noqa: BLE001 — nunca deixar o status "em andamento"
        log.exception("falha inesperada no robô")
        status["erro"] = _erro_inesperado(e)
    finally:
        _encerrar(sessao)
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
        if (res["inicio_sap"], res["fim_sap"]) == (datetime.fromisoformat(inicio).date().isoformat(),
                                                   datetime.fromisoformat(fim or inicio).date().isoformat()):
            res.update(ok=True, mensagem="já estava nesta data")
            return res
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


# IW38 (Modificar ordens PM: seleção): campo de ordenação pela seleção múltipla (seta à direita),
# período das ordens e lista (ALV) com o nº das ordens.
TABELA_MULTIPLA = "wnd[1]/usr/tabsTAB_STRIP/tabpSIVA/ssubSCREEN_HEADER:SAPLALDB:3010/tblSAPLALDBSINGLE"
GRADE_IW38 = "wnd[0]/usr/cntlGRID1/shellcont/shell"


def _sem_acento(t: str) -> str:
    import unicodedata

    return "".join(c for c in unicodedata.normalize("NFKD", str(t)) if not unicodedata.combining(c)).upper().strip()


def _nome_selecao(sessao, rotulo: str) -> str:
    """Nome técnico do campo da tela de seleção pelo texto ao lado (ex.: "Campo de ordenação" → EQFNR)."""
    alvo = _sem_acento(rotulo)
    usr = sessao.findById("wnd[0]/usr")
    for i in range(int(usr.Children.Count)):
        filho = usr.Children(i)
        if _sem_acento(getattr(filho, "Text", "")) == alvo:
            m = re.search(r"%_(\w+?)_%_APP_%-TEXT", str(filho.Id))
            if m:
                return m.group(1)
    raise RoboErro(f"campo \"{rotulo}\" não encontrado na tela de seleção da IW38; informe o ID em [mudanca_datas]")


def _celula_multipla(sessao, linha: int):
    for tipo in ("ctxt", "txt"):
        campo = _existe(sessao, f"{TABELA_MULTIPLA}/{tipo}RSCSEL_255-SLOW_I[1,{linha}]")
        if campo is not None:
            return campo
    raise RoboErro("tabela da seleção múltipla não encontrada")


def _selecao_multipla(sessao, botao: str, valores: list[str]) -> None:
    """Seta à direita → apaga o que havia → digita um valor por linha → Copiar (F8)."""
    sessao.findById(botao).press()
    if _existe(sessao, "wnd[1]") is None:
        raise RoboErro("a janela de seleção múltipla não abriu")
    limpar = _existe(sessao, "wnd[1]/tbar[0]/btn[16]")       # Excluir todas as linhas
    if limpar is not None:
        limpar.press()
    pos = 0
    for i, valor in enumerate(valores):
        tabela = sessao.findById(TABELA_MULTIPLA)
        visiveis = int(getattr(tabela, "VisibleRowCount", 8) or 8)
        if i - pos >= visiveis:
            pos = i
            tabela.verticalScrollbar.position = pos
        _celula_multipla(sessao, i - pos).text = valor
    sessao.findById("wnd[1]/tbar[0]/btn[8]").press()          # Copiar


def _ordens_da_grade(sessao) -> list[tuple[str, str]]:
    """(ordem, campo de ordenação) de cada linha da lista da IW38."""
    grade = sessao.findById(GRADE_IW38)
    n = int(grade.RowCount)
    linhas = []
    for i in range(n):
        if i % 30 == 0:
            try:
                grade.firstVisibleRow = i                         # a grade carrega as linhas aos poucos
            except Exception:  # noqa: BLE001
                pass
        ordem = str(grade.GetCellValue(i, "AUFNR")).strip().lstrip("0")
        try:
            campo = str(grade.GetCellValue(i, "EQFNR")).strip()
        except Exception:  # noqa: BLE001 — coluna fora do layout
            campo = ""
        if ordem:
            linhas.append((ordem, campo))
    return linhas


def buscar_ordens_iw38(sessao, campos: list[str], de: str, ate: str, md: dict) -> list[tuple[str, str]]:
    """IW38 com os campos de ordenação (seleção múltipla) e o período; devolve [(ordem, campo)]."""
    fmt = md.get("formato_data", "%d.%m.%Y")
    sessao.findById("wnd[0]/tbar[0]/okcd").text = "/nIW38"
    sessao.findById("wnd[0]").sendVKey(0)
    for id_, valor in md.get("iw38_marcar", {}).items():          # status: em aberto, em processamento…
        sessao.findById(id_).selected = bool(valor)
    nome = md.get("iw38_campo_ordenacao") or _nome_selecao(sessao, "Campo de ordenação")
    baixo = _existe(sessao, f"wnd[0]/usr/ctxt{nome}-LOW") or _existe(sessao, f"wnd[0]/usr/txt{nome}-LOW")
    if baixo is not None:
        baixo.text = ""
    _selecao_multipla(sessao, md.get("iw38_botao_campo") or f"wnd[0]/usr/btn%_{nome}_%_APP_%-VALU_PUSH", campos)
    for chave, valor in (("iw38_periodo_de", de), ("iw38_periodo_ate", ate)):
        id_ = md.get(chave, "")
        if id_:
            sessao.findById(id_).text = datetime.fromisoformat(valor).strftime(fmt)
    sessao.findById("wnd[0]").sendVKey(8)                         # Executar
    _popups(sessao, [])
    tipo, texto = _barra_de_status(sessao)
    if tipo in ("E", "A"):
        raise RoboErro(texto or "a IW38 recusou a seleção")
    if _existe(sessao, GRADE_IW38) is not None:
        return _ordens_da_grade(sessao)
    # uma ordem só: a IW38 abre a ordem direto
    try:
        campo_ordem = sessao.findById("wnd[0]/usr").findByName("CAUFVD-AUFNR", "GuiCTextField")
    except Exception:  # noqa: BLE001
        campo_ordem = None
    if campo_ordem is not None and str(campo_ordem.text).strip():
        return [(str(campo_ordem.text).strip().lstrip("0"), campos[0] if len(campos) == 1 else "")]
    return []                                                      # "nenhum objeto selecionado"


def _arq_resultado(arq_job: Path) -> Path:
    return Path(arq_job).with_name(Path(arq_job).stem + "_resultado.json")


def _erro_inesperado(e: Exception) -> str:
    return f"falha inesperada do robô ({type(e).__name__}: {e}); veja automacao/robo_sap.log"


def rodar_mudancas(arq_job: Path, cfg: dict | None = None, conectar_fn=None, simular: bool | None = None) -> dict:
    """Processa o pedido do site (JSON com lote, simular e itens [{ordem, inicio, fim}]) e grava o resultado
    ao lado (<pedido>_resultado.json), atualizado a cada ordem para o site mostrar o andamento.

    Qualquer falha (inclusive erro inesperado do Python ou do SAP GUI) termina com o resultado gravado e o
    motivo em "erro" — o pedido nunca fica parado em "em execução"."""
    conectar_fn = conectar_fn or conectar_robo
    arq_res = _arq_resultado(arq_job)
    res = {"lote": "", "inicio": _agora(), "fim": None, "em_andamento": True, "simular": bool(simular),
           "total": 0, "itens": [], "consultas": [], "erro": "", "versao": VERSAO}
    sessao = None
    try:
        pedido = json.loads(Path(arq_job).read_text(encoding="utf-8"))
        simular = bool(pedido.get("simular")) if simular is None else simular
        itens = list(pedido.get("itens", []))
        consultas = pedido.get("consultas", [])
        res.update(lote=pedido.get("lote", ""), simular=simular, total=len(itens))
        _gravar_status(res, arq_res)
        if len(itens) > MAX_ORDENS:
            raise RoboErro(f"{len(itens)} ordens no pedido; o limite é {MAX_ORDENS}")
        cfg = cfg or carregar_config()
        md = cfg.get("mudanca_datas", {})
        sessao = conectar_fn(cfg)
        log.info("mudança de datas: lote %s, %d consulta(s) na IW38 e %d ordem(ns)%s", res["lote"], len(consultas),
                 len(itens), " (simulação)" if simular else "")
        feitas: set[str] = set()

        def mudar(ordem: str, inicio: str, fim: str, extra: dict) -> None:
            if len(res["itens"]) >= MAX_ORDENS:
                raise RoboErro(f"limite de {MAX_ORDENS} ordens por lote atingido; rode de novo para as restantes")
            r = mudar_data_ordem(sessao, ordem, inicio, fim, md, simular)
            res["itens"].append({**r, **extra})
            feitas.add(ordem)
            _gravar_status(res, arq_res)

        for c in consultas:          # programação do mês: a IW38 traz as ordens das máquinas do dia
            info = {"dia": c["dia"], "campos": c["campos"], "encontradas": 0, "erro": ""}
            res["consultas"].append(info)
            try:
                achadas = buscar_ordens_iw38(sessao, c["campos"], c["de"], c["ate"], md)
            except RoboErro as e:
                info["erro"] = str(e)
                log.error("IW38 %s %s: %s", c["dia"], c["campos"], e)
                continue
            except Exception as e:  # noqa: BLE001 — erro COM do SAP GUI
                info["erro"] = f"erro no SAP GUI: {e}"
                log.exception("IW38 %s %s", c["dia"], c["campos"])
                continue
            finally:
                _gravar_status(res, arq_res)
            info["encontradas"] = len(achadas)
            res["total"] += len(achadas)
            log.info("IW38 %s: %d ordem(ns) para %s", c["dia"], len(achadas), ", ".join(c["campos"]))
            for ordem, campo in achadas:
                if ordem not in feitas:
                    mudar(ordem, c["dia"], c["dia"], {"dia": c["dia"], "campo": campo})
        for it in itens:             # ordem a ordem (ex.: desfazer um lote)
            mudar(str(it["ordem"]), it["inicio"], it.get("fim") or it["inicio"], {"dia": it["inicio"]})
    except RoboErro as e:
        log.error("%s", e)
        res["erro"] = str(e)
    except Exception as e:  # noqa: BLE001 — nunca terminar sem resultado
        log.exception("falha inesperada na mudança de datas")
        res["erro"] = _erro_inesperado(e)
    finally:
        _encerrar(sessao)
    res["fim"], res["em_andamento"] = _agora(), False
    res["ok"] = not res["erro"] and all(r["ok"] for r in res["itens"]) and not any(c["erro"] for c in res["consultas"])
    _gravar_status(res, arq_res)
    return res


# ----------------------------------------------------------------------------
# Diagnóstico ("Testar o robô" no site): confere passo a passo, sem alterar nada no SAP
# ----------------------------------------------------------------------------
TIPOS_COM_FILHOS = ("GuiUserArea", "GuiSimpleContainer", "GuiScrollContainer", "GuiTabStrip", "GuiTab",
                    "GuiCustomControl", "GuiContainerShell")


def _mapa_da_tela(sessao, limite: int = 200) -> list[dict]:
    """Campos da tela atual (ID, tipo e texto), para conferir os IDs do transacoes.toml sem gravar script."""
    saida: list[dict] = []

    def visitar(no, nivel: int) -> None:
        try:
            filhos = no.Children
            n = int(filhos.Count)
        except Exception:  # noqa: BLE001
            return
        for i in range(n):
            if len(saida) >= limite:
                return
            f = filhos(i)
            tipo = str(getattr(f, "Type", "") or "")
            id_ = str(getattr(f, "Id", "") or "")
            id_ = id_[id_.find("wnd["):] if "wnd[" in id_ else id_
            texto = "" if tipo == "GuiPasswordField" else str(getattr(f, "Text", "") or "")[:80]
            saida.append({"id": id_, "tipo": tipo, "texto": texto})
            if nivel < 3 and tipo in TIPOS_COM_FILHOS:
                visitar(f, nivel + 1)

    visitar(sessao.findById("wnd[0]/usr"), 0)
    return saida


def _ir_para(sessao, transacao: str) -> None:
    sessao.findById("wnd[0]/tbar[0]/okcd").text = "/n" + transacao
    sessao.findById("wnd[0]").sendVKey(0)
    _popups(sessao, [])
    tipo, texto = _barra_de_status(sessao)
    if tipo in ("E", "A"):
        raise RoboErro(texto or f"a transação {transacao} não abriu")


def diagnosticar(arq_job: Path, cfg: dict | None = None, conectar_fn=None) -> dict:
    """Testa cada passo da mudança de datas e grava o checklist em <pedido>_resultado.json.

    O pedido pode trazer "teste": {"campo", "de", "ate"} para uma busca de verdade na IW38 e/ou {"ordem"}
    para ler as datas de uma ordem na IW33 — tudo só leitura."""
    conectar_fn = conectar_fn or conectar_robo
    arq_res = _arq_resultado(arq_job)
    res = {"tipo": "diagnostico", "lote": "", "inicio": _agora(), "fim": None, "em_andamento": True, "versao": VERSAO,
           "recursos": list(RECURSOS), "pc": platform.node(), "etapas": [], "campos_tela": [],
           "ordens_encontradas": [], "itens": [], "consultas": [], "erro": ""}
    estado: dict = {"cfg": cfg}

    def etapa(nome: str, fn) -> bool:
        try:
            detalhe, ok = fn() or "ok", True
        except RoboErro as e:
            detalhe, ok = str(e), False
        except Exception as e:  # noqa: BLE001 — erro COM do SAP GUI etc.
            log.exception("diagnóstico: %s", nome)
            detalhe, ok = f"{type(e).__name__}: {e}", False
        res["etapas"].append({"etapa": nome, "ok": ok, "detalhe": str(detalhe)[:600]})
        log.info("diagnóstico: %s → %s %s", nome, "OK" if ok else "FALHOU", detalhe)
        _gravar_status(res, arq_res)
        return ok

    try:
        pedido = json.loads(Path(arq_job).read_text(encoding="utf-8"))
        res["lote"] = pedido.get("lote", "")
        teste = pedido.get("teste") or {}
        _gravar_status(res, arq_res)

        def configuracao():
            estado["cfg"] = estado["cfg"] or carregar_config()
            estado["md"] = estado["cfg"].get("mudanca_datas")
            if not estado["md"]:
                raise RoboErro("o automacao/transacoes.toml deste PC não tem [mudanca_datas] — código antigo; "
                               "rode o atualizar.bat")
            return (f"robô versão {VERSAO} · robo_local.toml "
                    + ("ok" if ARQ_LOCAL.exists() else "NÃO encontrado (rode automacao\\configurar_robo.bat)"))

        def conexao():
            s = estado["sessao"] = conectar_fn(estado["cfg"])
            info = getattr(s, "Info", None)
            propria = str(getattr(s, "Id", "")) in _SESSOES_NOVAS
            sistema = f"sistema {getattr(info, 'SystemName', '?')} · mandante {getattr(info, 'Client', '?')} · " \
                if info is not None else ""
            return sistema + ("janela própria do robô" if propria else "usando a janela já aberta do SAP")

        def abrir_iw38():
            _ir_para(estado["sessao"], "IW38")
            return str(getattr(estado["sessao"].findById("wnd[0]"), "Text", "") or "IW38 aberta")

        def mapa():
            res["campos_tela"] = _mapa_da_tela(estado["sessao"])
            return f"{len(res['campos_tela'])} elementos na tela de seleção (lista completa no site)"

        def campo_ordenacao():
            md, s = estado["md"], estado["sessao"]
            nome = md.get("iw38_campo_ordenacao") or _nome_selecao(s, "Campo de ordenação")
            botao = md.get("iw38_botao_campo") or f"wnd[0]/usr/btn%_{nome}_%_APP_%-VALU_PUSH"
            if _existe(s, botao) is None:
                raise RoboErro(f"seta à direita do Campo de ordenação não encontrada ({botao}); informe o ID em "
                               "[mudanca_datas] iw38_botao_campo")
            estado["botao"] = botao
            return f"campo {nome} · seta {botao}"

        def caixas():
            faltam = [i for i in estado["md"].get("iw38_marcar", {}) if _existe(estado["sessao"], i) is None]
            if faltam:
                raise RoboErro("caixas de status não encontradas: " + ", ".join(faltam))
            return f"{len(estado['md'].get('iw38_marcar', {}))} caixa(s) de status encontradas"

        def periodo():
            ids = [estado["md"].get(k, "") for k in ("iw38_periodo_de", "iw38_periodo_ate")]
            faltam = [i for i in ids if i and _existe(estado["sessao"], i) is None]
            if faltam:
                raise RoboErro("campos do período não encontrados: " + ", ".join(faltam))
            return "período de/até: " + " · ".join(i for i in ids if i) if any(ids) else "sem período configurado"

        def multipla():
            s = estado["sessao"]
            s.findById(estado["botao"]).press()
            try:
                if _existe(s, "wnd[1]") is None:
                    raise RoboErro("a janela de seleção múltipla não abriu")
                _celula_multipla(s, 0)
                return "janela de seleção múltipla abre e a tabela de valores foi encontrada"
            finally:
                cancelar = _existe(s, "wnd[1]/tbar[0]/btn[12]")
                if cancelar is not None:
                    cancelar.press()
                elif _existe(s, "wnd[1]") is not None:
                    s.findById("wnd[1]").sendVKey(12)

        def busca_real():
            de = teste.get("de") or date.today().replace(day=1).isoformat()
            ate = teste.get("ate") or date.today().isoformat()
            achadas = buscar_ordens_iw38(estado["sessao"], [teste["campo"]], de, ate, estado["md"])
            res["ordens_encontradas"] = [o for o, _ in achadas][:100]
            return (f"{len(achadas)} ordem(ns) para {teste['campo']} com data de {de} a {ate}"
                    + (": " + ", ".join(res["ordens_encontradas"][:15]) if achadas else ""))

        def ordem_iw33():
            s, md = estado["sessao"], estado["md"]
            _ir_para(s, "IW33")
            s.findById(md.get("campo_ordem", "wnd[0]/usr/ctxtCAUFVD-AUFNR")).text = str(teste["ordem"])
            s.findById("wnd[0]").sendVKey(0)
            _popups(s, [])
            tipo, texto = _barra_de_status(s)
            if tipo in ("E", "A"):
                raise RoboErro(texto or "a ordem não abriu")
            ini = _campo_data(s, md, "campo_inicio", CAMPO_INICIO).text
            fim = _campo_data(s, md, "campo_fim", CAMPO_FIM).text
            return f"ordem {teste['ordem']}: InícioBase {ini} · Fim-base {fim} (campos {CAMPO_INICIO}/{CAMPO_FIM} ok)"

        if etapa("Configuração do robô neste PC", configuracao) and etapa("Conexão com o SAP", conexao) \
                and etapa("Abrir a IW38", abrir_iw38):
            etapa("Mapa da tela de seleção da IW38", mapa)
            if etapa("Campo de ordenação e seta à direita", campo_ordenacao):
                etapa("Seleção múltipla (seta à direita)", multipla)
            etapa("Status das ordens (caixas da IW38)", caixas)
            etapa("Período (de/até) da IW38", periodo)
            if teste.get("campo"):
                etapa("Busca de verdade na IW38 (só leitura)", busca_real)
            if teste.get("ordem"):
                etapa("Datas da ordem na IW33 (só leitura)", ordem_iw33)
    except Exception as e:  # noqa: BLE001 — nunca terminar sem resultado
        log.exception("falha inesperada no diagnóstico")
        res["erro"] = _erro_inesperado(e)
    finally:
        s = estado.get("sessao")
        if s is not None:
            try:
                s.findById("wnd[0]/tbar[0]/okcd").text = "/n"
                s.findById("wnd[0]").sendVKey(0)
            except Exception:  # noqa: BLE001
                pass
        _encerrar(s)
    res["fim"], res["em_andamento"] = _agora(), False
    res["ok"] = not res["erro"] and bool(res["etapas"]) and all(e["ok"] for e in res["etapas"])
    _gravar_status(res, arq_res)
    return res


_TRAVA = None


def _trava_unica(espera_min: float = 0, ao_esperar=None) -> bool:
    """Uma execução do robô por vez. Com espera, tenta de novo a cada 5 s até o limite."""
    global _TRAVA
    _TRAVA = open(AQUI / ".robo.trava", "a+")
    limite = time.monotonic() + espera_min * 60
    avisou = False
    while True:
        try:
            if os.name == "nt":
                import msvcrt

                msvcrt.locking(_TRAVA.fileno(), msvcrt.LK_NBLCK, 1)
            else:
                import fcntl

                fcntl.flock(_TRAVA, fcntl.LOCK_EX | fcntl.LOCK_NB)
            return True
        except OSError:
            if time.monotonic() >= limite:
                return False
            if not avisou and ao_esperar:
                ao_esperar()
                avisou = True
            time.sleep(5)


def _resultado_sem_trava(arq_job: Path, tipo: str, final: bool) -> None:
    """Resultado para o site enquanto (ou porque) outra execução do robô ocupa o SAP."""
    try:
        lote = json.loads(Path(arq_job).read_text(encoding="utf-8")).get("lote", "")
    except (OSError, ValueError):
        lote = ""
    msg = "o robô está terminando outra execução (ex.: export do SAP)"
    _gravar_status({"tipo": tipo, "lote": lote, "inicio": _agora(), "fim": _agora() if final else None,
                    "em_andamento": not final, "ok": False, "itens": [], "consultas": [], "total": 0,
                    "aguardando": "" if final else msg + "; aguardando…",
                    "erro": f"{msg} há mais de {ESPERA_TRAVA_MIN} min; tente de novo" if final else ""},
                   _arq_resultado(arq_job))


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s",
                        handlers=[logging.StreamHandler(), logging.FileHandler(ARQ_LOG, encoding="utf-8")])
    ap = argparse.ArgumentParser(description="Exporta transações do SAP para a pasta do site.")
    ap.add_argument("-t", "--transacao", action="append", help="só esta transação (pode repetir)")
    ap.add_argument("--configurar", action="store_true", help="guardar usuário, senha e conexão deste PC")
    ap.add_argument("--mudar-datas", metavar="PEDIDO.json", help="muda as datas das ordens do pedido do site")
    ap.add_argument("--simular", action="store_true", help="com --mudar-datas: abre as ordens e não grava")
    ap.add_argument("--diagnosticar", metavar="PEDIDO.json", help="testa cada passo da mudança de datas (só leitura)")
    ap.add_argument("--versao", action="store_true", help="mostra a versão e os recursos deste robô")
    args = ap.parse_args()
    if args.versao:
        print(json.dumps({"versao": VERSAO, "recursos": list(RECURSOS)}))
        return
    if args.configurar:
        configurar()
        return
    pedido = args.mudar_datas or args.diagnosticar
    if pedido:   # pedido do site: espera o robô terminar outra execução em vez de ignorar
        tipo = "diagnostico" if args.diagnosticar else "mudanca"
        if not _trava_unica(ESPERA_TRAVA_MIN, lambda: _resultado_sem_trava(Path(pedido), tipo, final=False)):
            log.error("o robô ficou ocupado por mais de %d min; pedido %s não executado", ESPERA_TRAVA_MIN, pedido)
            _resultado_sem_trava(Path(pedido), tipo, final=True)
            sys.exit(1)
        if args.diagnosticar:
            res = diagnosticar(Path(pedido))
        else:
            res = rodar_mudancas(Path(pedido), simular=True if args.simular else None)
        sys.exit(0 if res["ok"] else 1)
    if not _trava_unica():
        log.info("o robô já está rodando; esta chamada foi ignorada")
        return
    status = rodar(args.transacao)
    sys.exit(0 if status["ok"] else 1)


if __name__ == "__main__":
    main()
