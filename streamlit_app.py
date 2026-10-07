import importlib
import sys
from pathlib import Path

import streamlit as st

# Na nuvem, uma nova publicação troca os arquivos, mas o Streamlit só relê as páginas: os módulos de
# central/ ficariam na versão antiga (AttributeError, cache com classes velhas). Quando algum deles
# muda no disco, recarrega todos na ordem das dependências e limpa os caches.
ORDEM_MODULOS = ["util", "config", "fontes", "fotos", "leitura", "af", "execucao", "preditiva", "planos", "calendario", "mudanca_datas", "bases", "indicadores",
                 "ui", "auth", "robo", "contexto", "execucao_ui"]


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

from central import auth, ui  # noqa: E402

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

paginas = st.navigation(
    {
        "Visão geral": [
            st.Page("paginas/painel.py", title="Painel WCM", icon=":material/dashboard:", default=True),
        ],
        "Confiabilidade": [
            st.Page("paginas/confiabilidade.py", title="Quebras, MTBF e MTTR", icon=":material/health_and_safety:"),
            st.Page("paginas/preditiva.py", title="Preditiva (SEMEQ)", icon=":material/sensors:"),
            st.Page("paginas/equipamentos.py", title="Equipamentos", icon=":material/precision_manufacturing:"),
            st.Page("paginas/notas.py", title="Notas", icon=":material/notification_important:"),
        ],
        "Análise de falhas": [
            st.Page("paginas/af_planos.py", title="Planos de AF", icon=":material/troubleshoot:"),
            st.Page("paginas/af_acoes.py", title="Ações de AF", icon=":material/task_alt:"),
        ],
        "Planejamento": [
            st.Page("paginas/ordens.py", title="Ordens", icon=":material/assignment:"),
            st.Page("paginas/planos.py", title="Planos", icon=":material/calendar_month:"),
            st.Page("paginas/calendario.py", title="Calendário de ordens", icon=":material/event_note:"),
            st.Page("paginas/programacao.py", title="Programação do mês", icon=":material/edit_calendar:"),
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
