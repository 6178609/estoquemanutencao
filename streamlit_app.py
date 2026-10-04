import streamlit as st

from central import auth, ui

st.set_page_config(page_title="Central de Manutenção", page_icon=":material/build:", layout="wide",
                   initial_sidebar_state="auto")
st.markdown(ui.CSS, unsafe_allow_html=True)
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

paginas = st.navigation(
    {
        "Gestão": [
            st.Page("paginas/painel.py", title="Painel", icon=":material/dashboard:", default=True),
            st.Page("paginas/ordens.py", title="Ordens", icon=":material/assignment:"),
            st.Page("paginas/equipamentos.py", title="Equipamentos", icon=":material/precision_manufacturing:"),
        ],
        "Suprimentos": [
            st.Page("paginas/estoque.py", title="Estoque", icon=":material/inventory_2:"),
            st.Page("paginas/requisicoes.py", title="Requisições", icon=":material/request_quote:"),
        ],
        "Configuração": [st.Page("paginas/dados.py", title="Fontes de dados", icon=":material/folder_open:"), *conta],
    },
    position="top",
)
ui.barra_lateral(usuario)
paginas.run()
