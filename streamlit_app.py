import importlib
import sys
from pathlib import Path

import streamlit as st

# Na nuvem, uma nova publicação troca os arquivos, mas o Streamlit só relê as páginas: os módulos de
# central/ ficariam na versão antiga (AttributeError, cache com classes velhas). Quando algum deles
# muda no disco, recarrega todos na ordem das dependências e limpa os caches.
ORDEM_MODULOS = ["util", "hh", "config", "fontes", "fotos", "leitura", "af", "execucao", "preditiva", "planos", "calendario", "mudanca_datas", "saude", "semanal", "busca", "qualidade", "bases", "indicadores",
                 "ui", "navegacao", "auth", "robo", "contexto", "execucao_ui"]


@st.cache_resource
def _estado_modulos() -> dict:
    return {}


def _recarregar_central_se_mudou() -> None:
    pasta = Path(__file__).resolve().parent / "central"
    assinatura = tuple(sorted((p.name, p.stat().st_mtime_ns, p.stat().st_size) for p in pasta.glob("*.py")))
    estado = _estado_modulos()
    if estado.get("assinatura") == assinatura:
        return
    # 1ª execução deste processo (ou do app atualizado): recarrega uma vez — barato e garante a versão do disco
    for nome in ORDEM_MODULOS:
        mod = sys.modules.get(f"central.{nome}")
        if mod is not None:
            importlib.reload(mod)
    st.cache_data.clear()
    st.cache_resource.clear()
    _estado_modulos()["assinatura"] = assinatura


_recarregar_central_se_mudou()

from central import auth, navegacao, ui  # noqa: E402

st.set_page_config(page_title="Central de Manutenção", page_icon=":material/build:", layout="wide",
                   initial_sidebar_state="auto")
ui.aplicar_css(ui.CSS)
ui.logos()
auth.aplicar_cookie_pendente()
ui.manter_filtros()

usuario = auth.usuario_atual()
if usuario is None:
    st.navigation([st.Page(auth.pagina_login, title="Entrar", icon=":material/login:")], position="hidden").run()
    st.stop()
if usuario.get("trocar_senha"):
    st.navigation([st.Page(auth.pagina_trocar_senha, title="Definir senha", icon=":material/key:")], position="hidden").run()
    st.stop()

PAGINAS_CONTA = {
    "conta": lambda: st.Page(auth.pagina_minha_conta, title="Minha conta", icon=":material/account_circle:",
                             url_path="conta"),
    "usuarios": lambda: st.Page(auth.pagina_usuarios, title="Usuários", icon=":material/group:", url_path="usuarios"),
    "sair": lambda: st.Page(auth.pagina_sair, title="Sair", icon=":material/logout:", url_path="sair"),
}
conta = [PAGINAS_CONTA[k]() for k in auth.paginas_conta(usuario)]

# Só as abas que a função da pessoa permite entram na navegação: as outras não aparecem no menu e o
# servidor nem as executa (endereço digitado cai na página inicial dela).
abas = navegacao.visiveis(lambda pid: auth.pode_ver(usuario, pid))
inicial = navegacao.inicial(abas, secundarias=("estoque", *auth.PAGINAS_PARCIAIS))
st.session_state["_usuario_exec"] = usuario       # links desta execução decidem pelo mesmo usuário do menu
menu = {grupo: [st.Page(navegacao.caminho(pid), title=titulo, icon=icone, default=pid == navegacao.INICIAL)
                for pid, titulo, icone in itens] for grupo, itens in abas.items()}
if inicial != navegacao.INICIAL:
    # quem não vê o Painel entra por uma página oculta que leva à primeira aba dele — assim cada aba mantém o
    # próprio endereço (/estoque continua funcionando, sem o aviso "Page not found")
    def _entrada():
        if inicial:
            st.switch_page(navegacao.caminho(inicial))
        st.warning("Sua função não dá acesso a nenhuma aba. Fale com um administrador.", icon=":material/lock:")

    menu.setdefault("Configuração", []).insert(0, st.Page(_entrada, title="Início", url_path="inicio",
                                                          visibility="hidden", default=True))
if conta:
    menu["Configuração"] = menu.get("Configuração", []) + conta
paginas = st.navigation(menu, position="top")
st.session_state["_pagina_exec"] = navegacao.id_da_pagina(paginas)
ui.barra_lateral(usuario)
paginas.run()
