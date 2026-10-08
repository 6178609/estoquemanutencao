"""Login e gerenciamento de usuários.

Usuários ficam em `usuarios.json` na pasta do app (a mesma pasta compartilhada
dos cadastros), com a senha guardada só como hash PBKDF2-SHA256 com sal.

Função (quais abas a pessoa vê):

- Líder de manutenção e Analista: todas as abas;
- Manutentor: só as abas livres (Estoque).

Perfil (o que a pessoa pode alterar):

- Administrador: tudo, inclusive gerenciar usuários;
- Editor: edita cadastros (equipamentos, estoque mínimo) e fontes de dados;
- Leitor: só consulta.

Conta antiga, sem função definida: o administrador continua vendo tudo (para não
ficar trancado fora); as demais veem só as abas livres até um administrador
definir a função.

"Manter conectado" grava um cookie com um token aleatório; no arquivo fica só
o hash do token, com validade de 30 dias.
"""

from __future__ import annotations

import hashlib
import json
import hmac
import re
import secrets
import time
from datetime import datetime, timedelta, timezone

import streamlit as st

from . import bases, config, ui

ARQ_USUARIOS = "usuarios.json"
ARQ_SOLICITACOES = "solicitacoes_acesso.json"   # pedidos de cadastro feitos na tela de login
MAX_PENDENTES = 30                               # proteção contra abuso do formulário público
INTERVALO_SOLICITACAO_S = 600                    # um pedido a cada 10 min por navegador
PERFIS = {"admin": "Administrador", "editor": "Editor", "leitor": "Leitor"}
FUNCOES = {"lider": "Líder de manutenção", "analista": "Analista", "manutentor": "Manutentor"}
FUNCOES_ACESSO_TOTAL = {"lider", "analista"}
# abas liberadas para todas as funções (o id é o nome do arquivo em paginas/, sem .py)
PAGINAS_LIVRES = {"estoque"}
COOKIE = "cm_sessao"
DIAS_SESSAO = 30
MAX_FALHAS, BLOQUEIO_S = 5, 300
ITERACOES = 260_000


# ----------------------------------------------------------------------------
# Senhas e tokens
# ----------------------------------------------------------------------------
def _hash_senha(senha: str, sal: str) -> str:
    return hashlib.pbkdf2_hmac("sha256", senha.encode("utf-8"), bytes.fromhex(sal), ITERACOES).hex()


def gerar_hash(senha: str) -> dict:
    sal = secrets.token_hex(16)
    return {"sal": sal, "senha_hash": _hash_senha(senha, sal)}


def confere(u: dict, senha: str) -> bool:
    if not u.get("sal") or not u.get("senha_hash"):
        return False
    return hmac.compare_digest(_hash_senha(senha, u["sal"]), u["senha_hash"])


_FALSO = {"sal": "00" * 16, "senha_hash": "00" * 32}


def _hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def validar_senha(senha: str) -> str:
    if len(senha) < 8:
        return "A senha precisa ter pelo menos 8 caracteres."
    if senha.isdigit() or senha.isalpha():
        return "Use letras e números na senha."
    return ""


def validar_login(login: str) -> str:
    if not re.fullmatch(r"[a-z0-9._-]{3,40}", login):
        return "Login: 3 a 40 caracteres, só letras minúsculas, números, ponto, hífen ou sublinhado."
    return ""


# ----------------------------------------------------------------------------
# Armazenamento
# ----------------------------------------------------------------------------
def usuarios(fresco: bool = False) -> dict:
    """{login: dados}. `fresco` relê o arquivo agora (para login e gravações)."""
    dados = bases._ler_json_agora(ARQ_USUARIOS) if fresco else bases.ler_cadastro(ARQ_USUARIOS)
    return {k: v for k, v in dados.items() if isinstance(v, dict)}


def salvar(login: str, dados: dict | None, por: str = "") -> None:
    bases.gravar_cadastro_lote(ARQ_USUARIOS, {login: dados}, por)


def _admins_ativos(us: dict) -> list[str]:
    return [k for k, v in us.items() if v.get("perfil") == "admin" and v.get("ativo", True)]


@st.cache_resource
def _tentativas() -> dict:
    return {}


# ----------------------------------------------------------------------------
# Sessão
# ----------------------------------------------------------------------------
def login_exigido() -> bool:
    return config.carregar().exigir_login


def usuario_atual() -> dict | None:
    """Usuário logado nesta sessão (revalidado a cada execução: se um administrador
    desativar ou excluir a conta, a pessoa sai em até alguns segundos)."""
    if not login_exigido():
        return {"login": "", "nome": "", "perfil": "admin"}
    ss = st.session_state
    login = ss.get("auth_login")
    if not login:
        login = _login_por_cookie()
        if not login:
            return None
        ss["auth_login"] = login
    u = usuarios().get(login)
    if not u or not u.get("ativo", True):
        ss.pop("auth_login", None)
        return None
    return {"login": login, **u}


def _login_por_cookie() -> str | None:
    try:
        token = st.context.cookies.get(COOKIE)
    except Exception:  # noqa: BLE001
        return None
    if not isinstance(token, str) or not token or st.session_state.get("_saiu"):
        return None
    h = _hash_token(token)
    agora = datetime.now(timezone.utc).isoformat()
    for login, u in usuarios().items():
        for s in u.get("sessoes", []):
            if hmac.compare_digest(s.get("h", ""), h) and s.get("ate", "") > agora and u.get("ativo", True):
                return login
    return None


def _https() -> bool:
    try:
        return str(st.context.url or "").lower().startswith("https://")
    except Exception:  # noqa: BLE001
        return False


def _definir_cookie(token: str | None) -> None:
    # Secure no site publicado (https): o cookie nunca trafega sem criptografia; na rede local (http) não dá
    seguro = "; Secure" if _https() else ""
    if token:
        cookie = f"{COOKIE}={token}; max-age={DIAS_SESSAO * 86400}; path=/; SameSite=Lax{seguro}"
    else:
        cookie = f"{COOKIE}=; max-age=0; path=/; SameSite=Lax{seguro}"
    st.html(f"<script>(function(){{var c={json.dumps(cookie)};"
            "try{window.parent.document.cookie=c}catch(e){}document.cookie=c;})()</script>",
            unsafe_allow_javascript=True)


def entrar(login: str, senha: str, manter: bool) -> str:
    """Devolve mensagem de erro, ou "" se entrou."""
    login = login.strip().lower()
    tent = _tentativas()
    falhas, ate = tent.get(login, (0, 0.0))
    if ate > time.time():
        return f"Muitas tentativas erradas. Tente de novo em {int((ate - time.time()) // 60) + 1} min."
    us = usuarios(fresco=True)
    u = us.get(login)
    if not u:
        confere(_FALSO, senha)   # mesmo tempo de resposta: não revela se o usuário existe
    if not u:
        try:
            ped = solicitacoes(fresco=True).get(login) or {}
        except Exception:  # noqa: BLE001
            ped = {}
        if ped.get("status") == "pendente" and confere(ped, senha):
            return "Seu pedido de acesso ainda está aguardando aprovação de um administrador."
    if not u or not confere(u, senha):
        falhas += 1
        tent[login] = (0, time.time() + BLOQUEIO_S) if falhas >= MAX_FALHAS else (falhas, 0.0)
        return "Login ou senha incorretos."
    if not u.get("ativo", True):
        return "Usuário desativado. Fale com um administrador."
    tent.pop(login, None)
    agora = datetime.now(timezone.utc)
    sessoes = [s for s in u.get("sessoes", []) if s.get("ate", "") > agora.isoformat()]
    token = None
    if manter:
        token = secrets.token_urlsafe(32)
        sessoes = (sessoes + [{"h": _hash_token(token), "ate": (agora + timedelta(days=DIAS_SESSAO)).isoformat()}])[-10:]
    salvar(login, {**_sem_meta(u), "sessoes": sessoes, "ultimo_acesso": agora.isoformat(timespec="seconds")}, login)
    st.session_state["auth_login"] = login
    st.session_state.pop("_saiu", None)
    if token:
        st.session_state["_cookie_novo"] = token
    return ""


def _sem_meta(u: dict) -> dict:
    return {k: v for k, v in u.items() if k not in ("atualizado_em", "atualizado_por", "login")}


def aplicar_cookie_pendente() -> None:
    """O cookie só pode ser gravado depois do rerun do login (precisa de um elemento na página)."""
    if "_cookie_novo" in st.session_state:
        _definir_cookie(st.session_state.pop("_cookie_novo"))


def sair() -> None:
    login = st.session_state.get("auth_login")
    if login:
        try:
            token = st.context.cookies.get(COOKIE)
            u = usuarios(fresco=True).get(login)
            if u and token:
                h = _hash_token(token)
                salvar(login, {**_sem_meta(u), "sessoes": [s for s in u.get("sessoes", []) if s.get("h") != h]}, login)
        except Exception:  # noqa: BLE001
            pass
    for k in list(st.session_state.keys()):
        del st.session_state[k]
    st.session_state["_saiu"] = True
    st.session_state["_cookie_novo"] = None  # apaga o cookie na próxima execução


# ----------------------------------------------------------------------------
# Solicitação de cadastro (tela de login) e aprovação (Usuários)
# ----------------------------------------------------------------------------
def solicitacoes(fresco: bool = False) -> dict:
    dados = bases._ler_json_agora(ARQ_SOLICITACOES) if fresco else bases.ler_cadastro(ARQ_SOLICITACOES)
    return {k: v for k, v in dados.items() if isinstance(v, dict)}


def pendentes(fresco: bool = False) -> dict:
    return {k: v for k, v in solicitacoes(fresco).items() if v.get("status") == "pendente"}


def solicitar(nome: str, login: str, senha: str, senha2: str, matricula: str = "", setor: str = "",
              funcao: str | None = None, motivo: str = "") -> str:
    """Grava o pedido de cadastro (a senha escolhida só como hash). Devolve a mensagem de erro, ou ""."""
    login = login.strip().lower()
    nome = " ".join(nome.split())[:80]
    erro = ("Informe seu nome." if len(nome) < 3 else "") or validar_login(login) or validar_senha(senha) \
        or ("As senhas não conferem." if senha != senha2 else "")
    if erro:
        return erro
    ultimo = st.session_state.get("_solicitou_em", 0.0)
    if time.time() - ultimo < INTERVALO_SOLICITACAO_S:
        return "Você acabou de enviar um pedido. Aguarde a aprovação (ou tente de novo em alguns minutos)."
    if login in usuarios(fresco=True):
        return "Esse usuário já existe. Escolha outro login (ou peça a senha a um administrador)."
    pend = pendentes(fresco=True)
    if login in pend:
        return "Já existe um pedido para esse login aguardando aprovação."
    if len(pend) >= MAX_PENDENTES:
        return "Há muitos pedidos aguardando aprovação. Fale direto com o PCM."
    bases.gravar_cadastro_lote(ARQ_SOLICITACOES, {login: {
        "nome": nome, "matricula": matricula.strip()[:20], "setor": setor.strip()[:60],
        "funcao": funcao if funcao in FUNCOES else "", "motivo": motivo.strip()[:300], "status": "pendente",
        "criado_em": datetime.now(timezone.utc).isoformat(timespec="seconds"), **gerar_hash(senha)}},
        "pedido de acesso")
    st.session_state["_solicitou_em"] = time.time()
    return ""


def aprovar(login: str, funcao: str, perfil: str, abas: list[str] | None, por: str) -> str:
    """Cria o usuário com a senha que a pessoa escolheu e marca o pedido como aprovado."""
    ped = pendentes(fresco=True).get(login)
    if not ped:
        return "Esse pedido não está mais pendente (outro administrador já decidiu?)."
    if login in usuarios(fresco=True):
        return "Já existe um usuário com esse login."
    if funcao not in FUNCOES or perfil not in PERFIS:
        return "Escolha a função e o perfil."
    dados = {"nome": ped.get("nome", login), "perfil": perfil, "funcao": funcao, "ativo": True, "trocar_senha": False,
             "sal": ped["sal"], "senha_hash": ped["senha_hash"]}
    if ped.get("matricula"):
        dados["matricula"] = ped["matricula"]
    if abas is not None:
        dados["abas"] = sorted({id_pagina(a) for a in abas})
    salvar(login, dados, por)
    _decidir(login, ped, "aprovada", por)
    return ""


def recusar(login: str, motivo: str, por: str) -> str:
    ped = pendentes(fresco=True).get(login)
    if not ped:
        return "Esse pedido não está mais pendente."
    _decidir(login, ped, "recusada", por, motivo.strip()[:300])
    return ""


def _decidir(login: str, ped: dict, status: str, por: str, motivo: str = "") -> None:
    # a senha do pedido não fica guardada depois da decisão
    fica = {k: v for k, v in ped.items() if k not in ("sal", "senha_hash", "atualizado_em", "atualizado_por")}
    bases.gravar_cadastro_lote(ARQ_SOLICITACOES, {login: {
        **fica, "status": status, "decidido_por": por, "motivo_recusa": motivo,
        "decidido_em": datetime.now(timezone.utc).isoformat(timespec="seconds")}}, por)


def pode_editar(u: dict | None) -> bool:
    return bool(u) and u.get("perfil") in ("admin", "editor")


# ----------------------------------------------------------------------------
# Acesso às abas pela função
# ----------------------------------------------------------------------------
def id_pagina(pagina: str) -> str:
    """"paginas/estoque.py" → "estoque" (aceita também o próprio id)."""
    return pagina.replace("\\", "/").rsplit("/", 1)[-1].removesuffix(".py")


def abas_personalizadas(u: dict | None) -> set[str] | None:
    """Abas escolhidas na aprovação ou na edição do usuário (None = segue a regra da função)."""
    abas = (u or {}).get("abas")
    return {id_pagina(a) for a in abas} if isinstance(abas, list) else None


def todas_as_abas() -> list[str]:
    from . import navegacao

    return [pid for _, pid, _ in navegacao.abas()]


def acesso_total(u: dict | None) -> bool:
    """Vê todas as abas: Líder de manutenção e Analista (ou quem recebeu todas na lista personalizada); conta sem
    função e sem lista, só se for administrador."""
    if not u:
        return False
    pers = abas_personalizadas(u)
    if pers is not None:
        return set(todas_as_abas()) <= pers | PAGINAS_LIVRES
    funcao = u.get("funcao")
    if funcao in FUNCOES:
        return funcao in FUNCOES_ACESSO_TOTAL
    return u.get("perfil") == "admin"


def pode_ver(u: dict | None, pagina: str) -> bool:
    """A aba (id ou caminho em paginas/) aparece para esta pessoa? A navegação só registra as permitidas —
    o servidor nem executa as outras, mesmo com o endereço digitado."""
    if not u:
        return False
    pid = id_pagina(pagina)
    if pid in PAGINAS_LIVRES:
        return True
    pers = abas_personalizadas(u)
    return pid in pers if pers is not None else acesso_total(u)


def descrever_acesso(u: dict | None) -> str:
    pers = abas_personalizadas(u)
    if acesso_total(u):
        return "todas"
    if pers is not None:
        return f"{len((pers | PAGINAS_LIVRES) & set(todas_as_abas()))} aba(s) escolhidas"
    return "só Estoque"


def pode_abrir(pagina: str) -> bool:
    """pode_ver para quem está usando o app (links e botões que levam a outra aba). Decide pelo mesmo usuário
    que montou a navegação desta execução: se a função mudar no meio dela, o link não aponta para uma aba que
    ficou fora do menu (o Streamlit daria erro)."""
    try:
        u = st.session_state.get("_usuario_exec") or usuario_atual()
        return pode_ver(u, pagina)
    except Exception:  # noqa: BLE001
        return False


def ainda_pode(pagina: str, editar: bool = False) -> bool:
    """Confere de novo, com o cadastro de agora, antes de gravar algo de uma aba. O Streamlit roda os callbacks
    dos campos antes do script que monta a navegação: quem perdeu a função (ou o perfil de edição) com a tela
    aberta não deve conseguir gravar nela."""
    try:
        u = usuario_atual()
    except Exception:  # noqa: BLE001
        return False
    return pode_ver(u, pagina) and (not editar or pode_editar(u))


def paginas_conta(u: dict | None) -> list[str]:
    """url_path das páginas da conta que esta pessoa vê no menu (Configuração)."""
    if not login_exigido():
        return []
    return ["conta", *(["usuarios"] if (u or {}).get("perfil") == "admin" else []), "sair"]


def nome_funcao(u: dict | None) -> str:
    return FUNCOES.get((u or {}).get("funcao"), "função não definida")


def nome_de(u: dict | None) -> str:
    return (u or {}).get("nome") or (u or {}).get("login") or ""


# ----------------------------------------------------------------------------
# Telas
# ----------------------------------------------------------------------------
def _cartao():
    _, meio, _ = st.columns([1, 1.3, 1])
    return meio


def _marca() -> None:
    st.markdown("<div style='height:5vh'></div>", unsafe_allow_html=True)
    a, b = st.columns([1, 1], vertical_alignment="center")
    if ui.LOGO_SIM.exists():
        a.image(str(ui.LOGO_SIM), width=150)
    if ui.LOGO_ALPA.exists():
        b.image(str(ui.LOGO_ALPA), width=120)
    st.markdown(f"<div style='height:4px;border-radius:2px;background:{ui.FAIXA};margin:.6rem 0 1rem'></div>",
                unsafe_allow_html=True)
    st.markdown("### Central de Manutenção")
    st.caption("PCM F26 · ordens, estoque, equipamentos e compras")


def pagina_login() -> None:
    with _cartao():
        _marca()
        try:
            vazio = not usuarios(fresco=True)
        except Exception as e:  # noqa: BLE001
            st.error(f"Não consegui acessar a pasta do app: {e}")
            return
        if vazio:
            _primeiro_admin()
            return
        aba_entrar, aba_pedir = st.tabs([":material/login: Entrar", ":material/person_add: Solicitar acesso"])
        with aba_entrar:
            with st.form("login", border=True):
                login = st.text_input("Usuário", autocomplete="username")
                senha = st.text_input("Senha", type="password", autocomplete="current-password")
                manter = st.checkbox("Manter conectado neste aparelho", value=True)
                ok = st.form_submit_button("Entrar", type="primary", width="stretch", icon=":material/login:")
            if ok:
                try:
                    erro = entrar(login, senha, manter)
                except Exception as e:  # noqa: BLE001 — falha ao ler/gravar usuários: não entra e não grava nada
                    erro = f"Não foi possível acessar a lista de usuários agora. Tente de novo em instantes. ({e})"
                if erro:
                    st.error(erro)
                else:
                    st.rerun()
            st.caption("Esqueceu a senha? Peça para um administrador redefinir em **Usuários**.")
        with aba_pedir:
            _form_solicitacao()


def _form_solicitacao() -> None:
    if st.session_state.get("_pedido_ok"):
        st.success(f"Pedido enviado para **{st.session_state['_pedido_ok']}**. Um administrador vai aprovar e "
                   "definir o que você pode ver; depois é só entrar com o login e a senha que você escolheu.",
                   icon=":material/schedule_send:")
        return
    st.caption("Preencha seus dados e escolha login e senha. O acesso só vale depois da aprovação de um "
               "administrador do PCM.")
    with st.form("solicitar_acesso", border=True):
        nome = st.text_input("Nome completo", max_chars=80)
        c = st.columns(2)
        login = c[0].text_input("Login desejado", placeholder="nome.sobrenome", max_chars=40)
        matricula = c[1].text_input("Matrícula (opcional)", max_chars=20)
        c = st.columns(2)
        setor = c[0].text_input("Setor / área", max_chars=60, placeholder="ex.: Manutenção Montagem")
        funcao = c[1].selectbox("Sua função", list(FUNCOES), index=None, format_func=FUNCOES.get,
                                placeholder="Escolha")
        motivo = st.text_area("Para que você precisa do acesso? (opcional)", max_chars=300, height=80)
        c = st.columns(2)
        s1 = c[0].text_input("Senha", type="password", help="Mínimo de 8 caracteres, com letras e números.",
                             autocomplete="new-password")
        s2 = c[1].text_input("Repita a senha", type="password", autocomplete="new-password")
        ok = st.form_submit_button("Enviar pedido", type="primary", width="stretch", icon=":material/send:")
    if ok:
        try:
            erro = solicitar(nome, login, s1, s2, matricula, setor, funcao, motivo)
        except Exception as e:  # noqa: BLE001
            erro = f"Não foi possível enviar agora. Tente de novo em instantes. ({e})"
        if erro:
            st.error(erro)
        else:
            st.session_state["_pedido_ok"] = login.strip().lower()
            st.rerun()


def _primeiro_admin() -> None:
    st.info("Primeiro acesso: crie a conta de **administrador**. Depois, cadastre a equipe em **Usuários**.",
            icon=":material/admin_panel_settings:")
    with st.form("primeiro", border=True):
        nome = st.text_input("Seu nome")
        login = st.text_input("Usuário (login)", placeholder="ex.: nome.sobrenome").strip().lower()
        funcao = st.selectbox("Função", [f for f in FUNCOES if f in FUNCOES_ACESSO_TOTAL], format_func=FUNCOES.get,
                              help="O administrador vê todas as abas: Líder de manutenção ou Analista.")
        s1 = st.text_input("Senha", type="password")
        s2 = st.text_input("Repita a senha", type="password")
        ok = st.form_submit_button("Criar administrador", type="primary", width="stretch")
    if ok:
        erro = validar_login(login) or validar_senha(s1) or ("As senhas não conferem." if s1 != s2 else "")
        if not nome.strip():
            erro = erro or "Informe seu nome."
        if usuarios(fresco=True):  # alguém criou enquanto isso
            erro = "Já existe um administrador. Recarregue a página."
        if erro:
            st.error(erro)
            return
        salvar(login, {"nome": nome.strip(), "perfil": "admin", "funcao": funcao, "ativo": True, "trocar_senha": False,
                       **gerar_hash(s1)}, login)
        entrar(login, s1, True)
        st.rerun()


def pagina_trocar_senha() -> None:
    """Troca obrigatória (primeiro acesso ou senha redefinida pelo administrador)."""
    u = usuario_atual()
    with _cartao():
        _marca()
        st.markdown(f"#### Olá, {nome_de(u).split(' ')[0]}")
        st.info("Defina uma senha pessoal para continuar.", icon=":material/key:")
        _form_senha(u, exigir_atual=False)
        if st.button("Sair", icon=":material/logout:"):
            sair()
            st.rerun()


def _form_senha(u: dict, exigir_atual: bool) -> None:
    with st.form("senha", border=True, clear_on_submit=True):
        atual = st.text_input("Senha atual", type="password") if exigir_atual else ""
        s1 = st.text_input("Nova senha", type="password", help="Mínimo de 8 caracteres, com letras e números.")
        s2 = st.text_input("Repita a nova senha", type="password")
        ok = st.form_submit_button("Salvar senha", type="primary", icon=":material/save:")
    if ok:
        dados = usuarios(fresco=True).get(u["login"])
        erro = ("Senha atual incorreta." if exigir_atual and not confere(dados or {}, atual) else "") \
            or validar_senha(s1) or ("As senhas não conferem." if s1 != s2 else "")
        if erro:
            st.error(erro)
            return
        # senha nova: os outros aparelhos conectados saem (fica só este, se ele estava com "manter conectado")
        try:
            atual_h = _hash_token(st.context.cookies.get(COOKIE) or "")
        except Exception:  # noqa: BLE001
            atual_h = ""
        sessoes = [x for x in (dados or {}).get("sessoes", []) if atual_h and x.get("h") == atual_h]
        salvar(u["login"], {**_sem_meta(dados), **gerar_hash(s1), "trocar_senha": False, "sessoes": sessoes},
               u["login"])
        st.toast("Senha alterada. Os outros aparelhos conectados foram desconectados.", icon=":material/check:")
        st.rerun()


def pagina_minha_conta() -> None:
    u = usuario_atual()
    st.title("Minha conta")
    c = st.columns(4)
    c[0].markdown(f"**Nome**  \n{u.get('nome', '')}")
    c[1].markdown(f"**Usuário**  \n{u['login']}")
    c[2].markdown(f"**Função**  \n{nome_funcao(u)}")
    c[3].markdown(f"**Perfil**  \n{PERFIS.get(u.get('perfil'), u.get('perfil'))}")
    if not acesso_total(u):
        pers = abas_personalizadas(u)
        if pers is not None:
            rot = _rotulos_abas()
            vistas = ["Estoque", *(rot[p] for p in rot if p in pers)]
            st.info("Você vê as abas: " + " · ".join(f"**{v}**" for v in vistas) + ". Para mudar, peça a um "
                    "administrador.", icon=":material/lock:")
        else:
            st.info("Sua função dá acesso só à aba **Estoque**. Para ver as outras abas, peça a um administrador.",
                    icon=":material/lock:")
    st.subheader("Trocar senha")
    _form_senha(u, exigir_atual=True)
    st.subheader("Aparelhos conectados")
    n = len([s for s in u.get("sessoes", []) if s.get("ate", "") > datetime.now(timezone.utc).isoformat()])
    st.caption(f"{n} aparelho(s) com “manter conectado” ativo.")
    if n and st.button("Desconectar todos os aparelhos", icon=":material/devices_off:"):
        dados = usuarios(fresco=True)[u["login"]]
        salvar(u["login"], {**_sem_meta(dados), "sessoes": []}, u["login"])
        st.toast("Todos os aparelhos foram desconectados.")
        st.rerun()


def pagina_sair() -> None:
    sair()
    st.rerun()


def pagina_usuarios() -> None:
    import pandas as pd

    eu = usuario_atual()
    st.title("Usuários")
    st.markdown('<div class="cm-sub">Quem acessa o app e o que cada um pode fazer</div>', unsafe_allow_html=True)
    us = usuarios(fresco=True)

    linhas = [{"Usuário": k, "Nome": v.get("nome", ""), "Função": FUNCOES.get(v.get("funcao"), "⚠ a definir"),
               "Perfil": PERFIS.get(v.get("perfil"), v.get("perfil")), "Abas": descrever_acesso(v),
               "Ativo": v.get("ativo", True), "Último acesso": (v.get("ultimo_acesso") or "")[:16].replace("T", " "),
               "Troca de senha pendente": v.get("trocar_senha", False)} for k, v in sorted(us.items())]
    st.dataframe(pd.DataFrame(linhas), hide_index=True, width="stretch")
    st.caption("**Função** define as abas: Líder de manutenção e Analista veem todas; Manutentor vê só o Estoque "
               "(ou as abas escolhidas para a pessoa, na aprovação ou em Editar usuário). "
               "**Perfil** define o que pode alterar: Administrador faz tudo, inclusive esta tela · Editor edita "
               "cadastros e fontes de dados · Leitor só consulta.")
    sem_funcao = [k for k, v in sorted(us.items()) if v.get("funcao") not in FUNCOES and v.get("ativo", True)]
    if sem_funcao:
        st.warning(f"**{len(sem_funcao)} usuário(s) sem função definida**: {', '.join(sem_funcao)}. Enquanto isso, "
                   "quem não é administrador vê só o Estoque. Defina a função em **Editar usuário**.",
                   icon=":material/person_alert:")

    pend = pendentes(fresco=True)
    rot_ped = f":material/how_to_reg: Solicitações ({len(pend)})" if pend else ":material/how_to_reg: Solicitações"
    pedidos, novo, editar = st.tabs([rot_ped, ":material/person_add: Novo usuário",
                                     ":material/manage_accounts: Editar usuário"])
    with pedidos:
        _aprovacoes(eu, pend)
    with novo:
        # sem clear_on_submit: com um erro (ex.: faltou a função) o que já foi digitado fica; limpa só ao criar
        with st.form("novo_usuario"):
            c = st.columns(4)
            nome = c[0].text_input("Nome", key="nu_nome")
            login = c[1].text_input("Usuário (login)", placeholder="nome.sobrenome", key="nu_login")
            funcao = c[2].selectbox("Função", list(FUNCOES), index=None, format_func=FUNCOES.get,
                                    placeholder="Escolha a função", key="nu_funcao",
                                    help="Líder de manutenção e Analista veem todas as abas; Manutentor, só o Estoque.")
            perfil = c[3].selectbox("Perfil", list(PERFIS), index=2, format_func=PERFIS.get, key="nu_perfil")
            senha = st.text_input("Senha provisória", type="password", key="nu_senha",
                                  help="A pessoa vai ser obrigada a trocar no primeiro acesso.")
            ok = st.form_submit_button("Criar usuário", type="primary", icon=":material/person_add:")
        if ok:
            login = login.strip().lower()
            erro = validar_login(login) or validar_senha(senha) or ("Informe o nome." if not nome.strip() else "") \
                or ("Escolha a função." if funcao not in FUNCOES else "") \
                or ("Esse usuário já existe." if login in us else "")
            if erro:
                st.error(erro)
            else:
                salvar(login, {"nome": nome.strip(), "perfil": perfil, "funcao": funcao, "ativo": True,
                               "trocar_senha": True, **gerar_hash(senha)}, eu["login"])
                for k in ("nu_nome", "nu_login", "nu_funcao", "nu_perfil", "nu_senha"):
                    st.session_state.pop(k, None)
                st.toast(f"Usuário {login} criado. Passe a senha provisória para a pessoa.", icon=":material/check:")
                st.rerun()

    with editar:
        if not us:
            return
        alvo = st.selectbox("Usuário", sorted(us), format_func=lambda k: f"{k} · {us[k].get('nome', '')}", key="usr_alvo")
        d = us[alvo]
        admins = _admins_ativos(us)
        unico_admin = alvo in admins and len(admins) == 1
        with st.form(f"editar_{alvo}"):
            c = st.columns(4)
            nome = c[0].text_input("Nome", d.get("nome", ""))
            funcao = c[1].selectbox("Função", list(FUNCOES), format_func=FUNCOES.get, placeholder="Escolha a função",
                                    index=list(FUNCOES).index(d["funcao"]) if d.get("funcao") in FUNCOES else None,
                                    help="Líder de manutenção e Analista veem todas as abas; Manutentor, só o Estoque.")
            perfil = c[2].selectbox("Perfil", list(PERFIS), index=list(PERFIS).index(d.get("perfil", "leitor")),
                                    format_func=PERFIS.get, disabled=unico_admin)
            ativo = c[3].toggle("Ativo", d.get("ativo", True), disabled=unico_admin or alvo == eu["login"])
            nova = st.text_input("Redefinir senha (opcional)", type="password",
                                 help="Preencha só se a pessoa esqueceu a senha. Ela terá de trocar no próximo acesso.")
            modo, abas_sel = _campo_abas(f"ed_{alvo}", d)
            ok = st.form_submit_button("Salvar alterações", type="primary", icon=":material/save:")
        if unico_admin:
            st.caption("Este é o único administrador ativo: perfil e status não podem ser alterados.")
        if ok:
            # conta antiga sem função pode ser desativada ou ter a senha redefinida sem escolher a função agora
            erro = (validar_senha(nova) if nova else "") \
                or ("Escolha a função." if funcao not in FUNCOES and d.get("funcao") in FUNCOES else "")
            depois = {**d, "funcao": funcao} if funcao in FUNCOES else dict(d)
            depois.pop("abas", None)
            if modo == ESCOLHER:
                depois["abas"] = abas_sel
            if not erro and alvo == eu["login"] and acesso_total(d) and not acesso_total(depois):
                erro = "Você não pode tirar de si mesmo o acesso às abas (peça a outro administrador)."
            if erro:
                st.error(erro)
            else:
                dados = {**{k: v for k, v in _sem_meta(d).items() if k != "abas"},
                         **({"abas": abas_sel} if modo == ESCOLHER else {}),
                         "nome": nome.strip() or d.get("nome", ""),
                         **({"funcao": funcao} if funcao in FUNCOES else {}),
                         "perfil": d.get("perfil") if unico_admin else perfil,
                         "ativo": True if (unico_admin or alvo == eu["login"]) else ativo}
                if nova:
                    dados.update(gerar_hash(nova), trocar_senha=True, sessoes=[])
                if not dados["ativo"]:
                    dados["sessoes"] = []
                salvar(alvo, dados, eu["login"])
                st.toast("Usuário atualizado.", icon=":material/check:")
                st.rerun()

        pode_excluir = alvo != eu["login"] and not unico_admin
        with st.popover("Excluir usuário", icon=":material/delete:", disabled=not pode_excluir):
            st.warning(f"Excluir **{alvo}** de vez? (Para só bloquear o acesso, desative.)")
            if st.button("Confirmar exclusão", type="primary", key=f"del_{alvo}"):
                salvar(alvo, None, eu["login"])
                st.session_state.pop("usr_alvo", None)
                st.rerun()

    with st.expander("Quem vê cada aba", icon=":material/visibility:"):
        from . import navegacao

        matriz = pd.DataFrame([{"Aba": f"{grupo} › {titulo}",
                                **{FUNCOES[f]: "✓" if pode_ver({"funcao": f}, pid) else "—" for f in FUNCOES}}
                               for grupo, pid, titulo in navegacao.abas()])
        st.dataframe(matriz, hide_index=True, width="stretch", height=35 * (len(matriz) + 1) + 3)
        st.caption("Minha conta e Sair aparecem para todos; Usuários, só para administradores.")



PADRAO_FUNCAO, ESCOLHER = "Padrão da função", "Escolher as abas"


def _rotulos_abas() -> dict[str, str]:
    from . import navegacao

    return {pid: f"{grupo} › {titulo}" for grupo, pid, titulo in navegacao.abas() if pid not in PAGINAS_LIVRES}


def _campo_abas(chave: str, u: dict | None, funcao: str | None = None) -> tuple[str, list[str]]:
    """O que a pessoa vai ver: o padrão da função ou uma lista de abas escolhida (dentro de um st.form)."""
    rot = _rotulos_abas()
    pers = abas_personalizadas(u)
    modo = st.radio("O que a pessoa vai ver", [PADRAO_FUNCAO, ESCOLHER], horizontal=True, key=f"{chave}_modo",
                    index=1 if pers is not None else 0,
                    help="Padrão da função: Líder de manutenção e Analista veem todas as abas; Manutentor, só o "
                         "Estoque. Escolher: só as abas marcadas abaixo (o Estoque é sempre liberado).")
    base = pers if pers is not None else {pid for pid in rot if pode_ver({"funcao": funcao or (u or {}).get("funcao")},
                                                                          pid)}
    sel = st.multiselect("Abas liberadas (vale quando a opção é \"Escolher as abas\")", list(rot),
                         default=[pid for pid in rot if pid in base], format_func=rot.get, key=f"{chave}_abas",
                         placeholder="Nenhuma além do Estoque")
    return modo, sorted(sel)


def _aprovacoes(eu: dict, pend: dict) -> None:
    import pandas as pd

    if not pend:
        st.info("Nenhum pedido de acesso aguardando aprovação. Quem abre o site sem login pode pedir em "
                "**Solicitar acesso**, na tela de entrada.", icon=":material/inbox:")
    else:
        tab = pd.DataFrame([{"Login": k, "Nome": v.get("nome", ""), "Matrícula": v.get("matricula", ""),
                             "Setor": v.get("setor", ""), "Função informada": FUNCOES.get(v.get("funcao"), "—"),
                             "Motivo": v.get("motivo", ""), "Pedido em": (v.get("criado_em") or "")[:16].replace("T", " ")}
                            for k, v in sorted(pend.items(), key=lambda kv: kv[1].get("criado_em", ""))])
        st.dataframe(tab, hide_index=True, width="stretch",
                     column_config={"Motivo": st.column_config.TextColumn(width="large")})
        alvo = st.selectbox("Pedido", list(tab["Login"]), key="ped_alvo",
                            format_func=lambda k: f"{k} · {pend[k].get('nome', '')}")
        ped = pend[alvo]
        with st.form(f"aprovar_{alvo}", border=True):
            st.markdown(f"**{ped.get('nome', alvo)}** · login `{alvo}`"
                        + (f" · matrícula {ped['matricula']}" if ped.get("matricula") else "")
                        + (f" · {ped['setor']}" if ped.get("setor") else ""))
            c = st.columns(2)
            funcao = c[0].selectbox("Função", list(FUNCOES), format_func=FUNCOES.get,
                                    index=list(FUNCOES).index(ped["funcao"]) if ped.get("funcao") in FUNCOES else None,
                                    placeholder="Escolha a função")
            perfil = c[1].selectbox("Perfil", list(PERFIS), index=2, format_func=PERFIS.get,
                                    help="Administrador: tudo · Editor: altera cadastros · Leitor: só consulta")
            modo, abas_sel = _campo_abas(f"ap_{alvo}", None, ped.get("funcao"))
            motivo = st.text_input("Motivo (só se for recusar)", max_chars=300)
            b = st.columns(2)
            aprovar_ok = b[0].form_submit_button("Aprovar e criar o usuário", type="primary",
                                                  icon=":material/check_circle:", width="stretch")
            recusar_ok = b[1].form_submit_button("Recusar", icon=":material/block:", width="stretch")
        if aprovar_ok:
            erro = aprovar(alvo, funcao, perfil, abas_sel if modo == ESCOLHER else None, eu["login"])
            if erro:
                st.error(erro)
            else:
                st.toast(f"Acesso de {alvo} aprovado. A pessoa já pode entrar com a senha que escolheu.",
                         icon=":material/check:")
                st.session_state.pop("ped_alvo", None)
                st.rerun()
        if recusar_ok:
            erro = recusar(alvo, motivo, eu["login"])
            if erro:
                st.error(erro)
            else:
                st.toast(f"Pedido de {alvo} recusado.", icon=":material/block:")
                st.session_state.pop("ped_alvo", None)
                st.rerun()
    decididos = {k: v for k, v in solicitacoes().items() if v.get("status") in ("aprovada", "recusada")}
    if decididos:
        with st.expander(f"Pedidos já decididos ({len(decididos)})", icon=":material/history:"):
            st.dataframe(pd.DataFrame([{"Login": k, "Nome": v.get("nome", ""), "Decisão": v.get("status", ""),
                                        "Por": v.get("decidido_por", ""), "Motivo": v.get("motivo_recusa", ""),
                                        "Em": (v.get("decidido_em") or "")[:16].replace("T", " ")}
                                       for k, v in sorted(decididos.items(), key=lambda kv: kv[1].get("decidido_em", ""),
                                                          reverse=True)]), hide_index=True, width="stretch")
