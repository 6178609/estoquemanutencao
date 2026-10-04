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
        "Visão geral": [
            st.Page("paginas/painel.py", title="Painel WCM", icon=":material/dashboard:", default=True),
        ],
        "Confiabilidade": [
            st.Page("paginas/confiabilidade.py", title="Quebras, MTBF e MTTR", icon=":material/health_and_safety:"),
            st.Page("paginas/equipamentos.py", title="Equipamentos", icon=":material/precision_manufacturing:"),
            st.Page("paginas/notas.py", title="Notas", icon=":material/notification_important:"),
        ],
        "Planejamento": [
            st.Page("paginas/ordens.py", title="Ordens", icon=":material/assignment:"),
            st.Page("paginas/planos.py", title="Planos", icon=":material/calendar_month:"),
            st.Page("paginas/mao_de_obra.py", title="Mão de obra e backlog", icon=":material/engineering:"),
        ],
        "Custos e suprimentos": [
            st.Page("paginas/custos.py", title="Custos", icon=":material/payments:"),
            st.Page("paginas/estoque.py", title="Estoque", icon=":material/inventory_2:"),
            st.Page("paginas/requisicoes.py", title="Requisições", icon=":material/request_quote:"),
        ],
        "Configuração": [
            st.Page("paginas/metas.py", title="Metas e parâmetros", icon=":material/tune:"),
            st.Page("paginas/dados.py", title="Fontes de dados", icon=":material/folder_open:"),
            *conta,
        ],
    },
    position="top",
)
ui.barra_lateral(usuario)
paginas.run()
