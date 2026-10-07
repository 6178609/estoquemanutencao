"""Login e gerenciamento de usuários.

Usuários ficam em `usuarios.json` na pasta do app (a mesma pasta compartilhada
dos cadastros), com a senha guardada só como hash PBKDF2-SHA256 com sal. Três
perfis:

- Administrador: tudo, inclusive gerenciar usuários;
- Editor: edita cadastros (equipamentos, estoque mínimo) e fontes de dados;
- Leitor: só consulta.

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
PERFIS = {"admin": "Administrador", "editor": "Editor", "leitor": "Leitor"}
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


def _definir_cookie(token: str | None) -> None:
    if token:
        cookie = f"{COOKIE}={token}; max-age={DIAS_SESSAO * 86400}; path=/; SameSite=Lax"
    else:
        cookie = f"{COOKIE}=; max-age=0; path=/; SameSite=Lax"
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


def pode_editar(u: dict | None) -> bool:
    return bool(u) and u.get("perfil") in ("admin", "editor")


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


def _primeiro_admin() -> None:
    st.info("Primeiro acesso: crie a conta de **administrador**. Depois, cadastre a equipe em **Usuários**.",
            icon=":material/admin_panel_settings:")
    with st.form("primeiro", border=True):
        nome = st.text_input("Seu nome")
        login = st.text_input("Usuário (login)", placeholder="ex.: jeferson.silva").strip().lower()
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
        salvar(login, {"nome": nome.strip(), "perfil": "admin", "ativo": True, "trocar_senha": False, **gerar_hash(s1)}, login)
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
        salvar(u["login"], {**_sem_meta(dados), **gerar_hash(s1), "trocar_senha": False}, u["login"])
        st.toast("Senha alterada.", icon=":material/check:")
        st.rerun()


def pagina_minha_conta() -> None:
    u = usuario_atual()
    st.title("Minha conta")
    c = st.columns(3)
    c[0].markdown(f"**Nome**  \n{u.get('nome', '')}")
    c[1].markdown(f"**Usuário**  \n{u['login']}")
    c[2].markdown(f"**Perfil**  \n{PERFIS.get(u.get('perfil'), u.get('perfil'))}")
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

    linhas = [{"Usuário": k, "Nome": v.get("nome", ""), "Perfil": PERFIS.get(v.get("perfil"), v.get("perfil")),
               "Ativo": v.get("ativo", True), "Último acesso": (v.get("ultimo_acesso") or "")[:16].replace("T", " "),
               "Troca de senha pendente": v.get("trocar_senha", False)} for k, v in sorted(us.items())]
    st.dataframe(pd.DataFrame(linhas), hide_index=True, width="stretch")
    st.caption("Administrador: tudo, inclusive esta tela · Editor: edita cadastros e fontes de dados · Leitor: só consulta.")

    novo, editar = st.tabs([":material/person_add: Novo usuário", ":material/manage_accounts: Editar usuário"])
    with novo:
        with st.form("novo_usuario", clear_on_submit=True):
            c = st.columns(3)
            nome = c[0].text_input("Nome")
            login = c[1].text_input("Usuário (login)", placeholder="nome.sobrenome")
            perfil = c[2].selectbox("Perfil", list(PERFIS), index=2, format_func=PERFIS.get)
            senha = st.text_input("Senha provisória", type="password",
                                  help="A pessoa vai ser obrigada a trocar no primeiro acesso.")
            ok = st.form_submit_button("Criar usuário", type="primary", icon=":material/person_add:")
        if ok:
            login = login.strip().lower()
            erro = validar_login(login) or validar_senha(senha) or ("Informe o nome." if not nome.strip() else "") \
                or ("Esse usuário já existe." if login in us else "")
            if erro:
                st.error(erro)
            else:
                salvar(login, {"nome": nome.strip(), "perfil": perfil, "ativo": True, "trocar_senha": True,
                               **gerar_hash(senha)}, eu["login"])
                st.success(f"Usuário **{login}** criado. Passe a senha provisória para a pessoa.")
                st.rerun()

    with editar:
        if not us:
            return
        alvo = st.selectbox("Usuário", sorted(us), format_func=lambda k: f"{k} · {us[k].get('nome', '')}", key="usr_alvo")
        d = us[alvo]
        admins = _admins_ativos(us)
        unico_admin = alvo in admins and len(admins) == 1
        with st.form(f"editar_{alvo}"):
            c = st.columns(3)
            nome = c[0].text_input("Nome", d.get("nome", ""))
            perfil = c[1].selectbox("Perfil", list(PERFIS), index=list(PERFIS).index(d.get("perfil", "leitor")),
                                    format_func=PERFIS.get, disabled=unico_admin)
            ativo = c[2].toggle("Ativo", d.get("ativo", True), disabled=unico_admin or alvo == eu["login"])
            nova = st.text_input("Redefinir senha (opcional)", type="password",
                                 help="Preencha só se a pessoa esqueceu a senha. Ela terá de trocar no próximo acesso.")
            ok = st.form_submit_button("Salvar alterações", type="primary", icon=":material/save:")
        if unico_admin:
            st.caption("Este é o único administrador ativo: perfil e status não podem ser alterados.")
        if ok:
            erro = validar_senha(nova) if nova else ""
            if erro:
                st.error(erro)
            else:
                dados = {**_sem_meta(d), "nome": nome.strip() or d.get("nome", ""),
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
