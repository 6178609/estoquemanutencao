import importlib
import sys
from pathlib import Path

import streamlit as st

# Na nuvem, uma nova publicação troca os arquivos, mas o Streamlit só relê as páginas: os módulos de
# central/ ficariam na versão antiga (AttributeError, cache com classes velhas). Quando algum deles
# muda no disco, recarrega todos na ordem das dependências e limpa os caches.
ORDEM_MODULOS = ["util", "config", "fontes", "fotos", "leitura", "af", "execucao", "preditiva", "planos", "calendario", "mudanca_datas", "saude", "semanal", "busca", "qualidade", "bases", "indicadores",
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

conta = []
if auth.login_exigido():
    conta = [st.Page(auth.pagina_minha_conta, title="Minha conta", icon=":material/account_circle:", url_path="conta")]
    if usuario.get("perfil") == "admin":
        conta.append(st.Page(auth.pagina_usuarios, title="Usuários", icon=":material/group:", url_path="usuarios"))
    conta.append(st.Page(auth.pagina_sair, title="Sair", icon=":material/logout:", url_path="sair"))

# Só as abas que a função da pessoa permite entram na navegação: as outras não aparecem no menu e o
# servidor nem as executa (endereço digitado cai na página inicial dela).
abas = navegacao.visiveis(lambda pid: auth.pode_ver(usuario, pid))
inicial = navegacao.inicial(abas)
menu = {grupo: [st.Page(navegacao.caminho(pid), title=titulo, icon=icone, default=pid == inicial)
                for pid, titulo, icone in itens] for grupo, itens in abas.items()}
if conta:
    menu["Configuração"] = menu.get("Configuração", []) + conta
paginas = st.navigation(menu, position="top")
ui.barra_lateral(usuario)
paginas.run()
