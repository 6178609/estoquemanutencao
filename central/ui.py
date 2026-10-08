"""Peças de interface compartilhadas: estilo, barra lateral, filtros globais,
vigia de atualização e formatação de tabelas."""

from __future__ import annotations

import re

from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

import altair as alt
import pandas as pd
import streamlit as st

from . import bases, config
from .leitura import NOMES_BASE
from .util import hoje_local

FUSO = ZoneInfo("America/Sao_Paulo")

# Verde e grafite do logo SIM; demais cores do logo Alpargatas.
VERDE, GRAFITE = "#0E9F46", "#4A4D50"
AZUL, LARANJA, VERMELHO, CIANO, LIMA, AMARELO = "#0A6EBD", "#F7931E", "#E3262B", "#1FC8E8", "#9BC53D", "#FFC20E"
CINZA = "#8C9491"
FAIXA = f"linear-gradient(90deg, {VERMELHO}, {LARANJA}, {AMARELO}, {CIANO}, {AZUL}, {LIMA}, {VERDE})"

# Gráficos em português do Brasil: 1.234,5 · 1,8M · "Março" nos eixos de data (vale para todos os gráficos Altair)
LOCALE_PTBR = {
    "number": {"decimal": ",", "thousands": ".", "grouping": [3], "currency": ["R$ ", ""]},
    "time": {"dateTime": "%A, %e de %B de %Y. %X", "date": "%d/%m/%Y", "time": "%H:%M:%S", "periods": ["AM", "PM"],
             "days": ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"],
             "shortDays": ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"],
             "months": ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro",
                        "Outubro", "Novembro", "Dezembro"],
             "shortMonths": ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"]},
}


@alt.theme.register("central_ptbr", enable=True)
def _tema_ptbr():
    return alt.theme.ThemeConfig({"config": {"locale": LOCALE_PTBR}})


ASSETS = Path(__file__).resolve().parent.parent / "assets"
LOGO_SIM = ASSETS / "logo_sim.png"
LOGO_ALPA = ASSETS / "logo_alpargatas.png"

CSS = """
<style>
  /* faixa com as cores do logo Alpargatas no topo */
  .stApp::before { content: ""; position: fixed; top: 0; left: 0; right: 0; height: 4px; z-index: 1000002;
                   background: %(faixa)s; }
  .block-container { padding-top: 2.6rem; padding-bottom: 3rem; max-width: 1400px; }
  h1 { font-weight: 800 !important; letter-spacing: -.01em; }
  h1, h2, h3 { color: var(--text-color, inherit); }
  [data-testid="stMetric"] { background: var(--secondary-background-color); border-radius: 12px; padding: 10px 14px;
                             border-left: 4px solid %(verde)s !important; }
  [data-testid="stMetricLabel"] p { font-size: .76rem; text-transform: uppercase; letter-spacing: .05em; opacity: .7; font-weight: 600; }
  [data-testid="stMetricValue"] { font-size: 1.55rem; font-weight: 700; }
  [data-testid="stSidebar"] { border-right: 1px solid rgba(128,128,128,.18); }
  .cm-sub { opacity: .72; font-size: .9rem; margin-top: -.6rem; margin-bottom: 1rem; }
  .cm-chip { display:inline-block; padding: 2px 9px; border-radius: 999px; font-size: .74rem; font-weight: 600; margin: 0 6px 4px 0; }
  .cm-ok { background: rgba(14,159,70,.14); color: %(verde)s; }
  .cm-velho { background: rgba(247,147,30,.18); color: #C46A00; }
  .cm-falta { background: rgba(227,38,43,.13); color: %(vermelho)s; }
  .cm-marca { display:flex; align-items:center; gap:14px; margin-bottom: .4rem; }
  .cm-marca .cm-titulo { font-weight: 800; font-size: 1.05rem; line-height: 1.15; }
  .cm-marca .cm-titulo small { display:block; font-weight: 500; opacity: .65; font-size: .72rem; }
  .cm-rodape { opacity: .55; font-size: .72rem; margin-top: 1.2rem; }
  .cm-rotulo { font-size: .74rem; letter-spacing: .05em; opacity: .7; margin: .6rem 0 .35rem; }

  /* ---------- celular ---------- */
  @media (max-width: 640px) {
    .block-container { padding: 3.4rem .75rem 2rem; }
    h1 { font-size: 1.5rem !important; }
    h2 { font-size: 1.25rem !important; }
    h3 { font-size: 1.1rem !important; }
    .cm-sub { font-size: .8rem; }
    /* indicadores em duas colunas, em vez de um embaixo do outro */
    [data-testid="stHorizontalBlock"]:has(> [data-testid="stColumn"] [data-testid="stMetric"]) {
      flex-direction: row !important; flex-wrap: wrap !important; gap: .5rem !important;
    }
    [data-testid="stHorizontalBlock"]:has(> [data-testid="stColumn"] [data-testid="stMetric"]) > [data-testid="stColumn"] {
      flex: 1 1 calc(50%% - .5rem) !important; min-width: calc(50%% - .5rem) !important; width: calc(50%% - .5rem) !important;
    }
    [data-testid="stMetric"] { padding: 8px 10px; }
    [data-testid="stMetricValue"] { font-size: 1.2rem; }
    [data-testid="stMetricLabel"] p { font-size: .66rem; }
    [data-testid="stMetricDelta"] { font-size: .7rem; }
    [data-testid="stVegaLiteChart"] { overflow-x: auto; }
    .stButton button, .stDownloadButton button { width: 100%%; }
  }
</style>
""" % {"faixa": FAIXA, "verde": VERDE, "vermelho": VERMELHO}


def aplicar_css(css: str) -> None:
    """Injeta CSS pelo canal de estilos do Streamlit (st.html só com <style>): não passa pelo
    interpretador de markdown, não ocupa espaço e nunca aparece como texto na tela — no celular,
    com tradução automática ou em navegadores diferentes."""
    corpo = re.sub(r"\s*\n\s*", " ", css.strip())          # uma linha só: nada vira bloco de código
    if not corpo.lower().startswith("<style"):
        corpo = f"<style>{corpo}</style>"
    st.html(corpo)


# ----------------------------------------------------------------------------
# Datas e "idade" das bases
# ----------------------------------------------------------------------------
def local(dt: datetime | None) -> str:
    if not dt:
        return "—"
    return dt.astimezone(FUSO).strftime("%d/%m/%Y %H:%M")


def idade(dt: datetime | None) -> str:
    if not dt:
        return "—"
    s = (datetime.now(timezone.utc) - dt).total_seconds()
    if s < 3600:
        return f"há {max(1, int(s // 60))} min"
    if s < 86400:
        return f"há {int(s // 3600)} h"
    return f"há {int(s // 86400)} dia(s)"


def chip_base(base: bases.Base, nome: str) -> str:
    cfg = config.carregar()
    if base.erro:
        return f'<span class="cm-chip cm-falta">{nome}: erro</span>'
    if base.df is None:
        return f'<span class="cm-chip cm-falta">{nome}: não encontrada</span>'
    velho = datetime.now(timezone.utc) - base.atualizado > timedelta(days=cfg.dias_alerta)
    classe = "cm-velho" if velho else "cm-ok"
    return f'<span class="cm-chip {classe}" title="{base.origem.rotulo}">{nome}: {idade(base.atualizado)}</span>'


# ----------------------------------------------------------------------------
# Celular
# ----------------------------------------------------------------------------
def eh_celular() -> bool:
    """Detecta celular pelo navegador (User-Agent), para reorganizar a tela."""
    try:
        ua = st.context.headers.get("User-Agent", "") or ""
    except Exception:  # noqa: BLE001
        return False
    return any(t in ua for t in ("Mobi", "Android", "iPhone", "iPod"))


def caixa_filtros(rotulo: str = "Filtros"):
    """No computador os filtros ficam à vista; no celular, recolhidos para a tabela aparecer logo."""
    if eh_celular():
        return st.expander(rotulo, icon=":material/tune:")
    return st.container(border=True)


def altura_tabela(padrao: int) -> int:
    return min(padrao, 380) if eh_celular() else padrao


# ----------------------------------------------------------------------------
# Estrutura de página
# ----------------------------------------------------------------------------
def link_pagina(pagina: str, onde=None, **kw) -> None:
    """st.page_link só para quem pode abrir a aba: a que a função da pessoa não libera fica fora da navegação
    (o Streamlit daria erro no link) e o link simplesmente não aparece."""
    from . import auth

    if auth.pode_abrir(pagina):
        (onde if onde is not None else st).page_link(pagina, **kw)


def ir_para(pagina: str) -> None:
    """st.switch_page só para quem pode abrir a aba; sem acesso, avisa em vez de dar erro."""
    from . import auth

    if auth.pode_abrir(pagina):
        st.switch_page(pagina)
    st.warning("Sua função não dá acesso a essa aba. Peça a um administrador, se precisar.", icon=":material/lock:")


def cabecalho(titulo: str, sub: str = "") -> None:
    st.title(titulo)
    if sub:
        st.markdown(f'<div class="cm-sub">{sub}</div>', unsafe_allow_html=True)


def aviso_base(base: bases.Base, tipo: str) -> bool:
    """Mostra o motivo de uma base faltar. Devolve True se ela pode ser usada."""
    if base.erro:
        st.error(f"Não foi possível ler **{base.origem.rotulo}**: {base.erro}")
        return False
    if base.df is None:
        st.info(f"Nenhum arquivo de **{NOMES_BASE[tipo]}** foi encontrado nas pastas monitoradas. "
                "Salve o export do SAP numa delas (o app acha sozinho) ou envie pela página **Fontes de dados**.",
                icon=":material/search_off:")
        link_pagina("paginas/dados.py", label="Abrir Fontes de dados", icon=":material/folder_open:")
        return False
    cfg = config.carregar()
    if datetime.now(timezone.utc) - base.atualizado > timedelta(days=cfg.dias_alerta):
        st.warning(f"A base de {NOMES_BASE[tipo]} está desatualizada: arquivo de {local(base.atualizado)} "
                   f"({idade(base.atualizado)}). Exporte de novo do SAP para a mesma pasta.", icon=":material/history:")
    return True


def barra_lateral(usuario: dict | None = None) -> None:
    from . import auth

    cfg = config.carregar()
    with st.sidebar:
        if LOGO_ALPA.exists():
            st.image(str(LOGO_ALPA), width=96)
        st.markdown("**Central de Manutenção** · PCM F26")
        if usuario and usuario.get("login"):
            st.caption(f":material/person: **{usuario.get('nome') or usuario['login']}** · {auth.nome_funcao(usuario)}"
                       f" · {auth.PERFIS.get(usuario.get('perfil'), '')}")
        else:
            st.caption("Ordens IW38 · Estoque MB52 · Requisições · Equipamentos")
        if auth.pode_ver(usuario, "busca"):
            with st.form("busca_lateral", clear_on_submit=True, border=False):
                q = st.text_input("Buscar no sistema", placeholder="ordem, equipamento, material, AF…",
                                  label_visibility="collapsed")
                if st.form_submit_button("Buscar", icon=":material/search:", width="stretch") and q.strip():
                    st.session_state["busca_q"] = q.strip()
                    st.switch_page("paginas/busca.py")

        @st.fragment(run_every=cfg.intervalo_verificacao)
        def vigia():
            # função trocada (ou conta desativada) com a tela aberta: refaz o menu e tira a pessoa da aba
            pid = st.session_state.get("_pagina_exec")
            try:
                agora = auth.usuario_atual()
            except Exception:  # noqa: BLE001
                agora = st.session_state.get("_usuario_exec")
            if agora is None or (pid and not auth.pode_ver(agora, pid)):
                st.rerun(scope="app")
            try:
                ass = bases.assinatura_dados()
            except Exception as e:  # noqa: BLE001
                st.error(f"Fonte indisponível: {e}")
                return
            anterior = st.session_state.get("_assinatura")
            st.session_state["_assinatura"] = ass
            if anterior is not None and anterior != ass:
                st.toast("Arquivo novo encontrado — dados atualizados.", icon=":material/sync:")
                st.rerun(scope="app")
            chips = "".join([chip_base(bases.iw38(), "IW38"), chip_base(bases.ip19(), "IP19"),
                             chip_base(bases.operacoes(), "IW38OP"), chip_base(bases.notas(), "IW28"),
                             chip_base(bases.equipamentos(), "IH08"), chip_base(bases.mb52(), "MB52"),
                             chip_base(bases.requisicoes(), "Requisições"), chip_base(bases.confirmacoes(), "IW47"),
                             chip_base(bases.equipe(), "Equipe"), chip_base(bases.afs(), "AF")])
            st.markdown(chips, unsafe_allow_html=True)
            st.caption(f":material/sync: Verificação automática a cada {cfg.intervalo_verificacao}s · "
                       f"última às {datetime.now(FUSO):%H:%M:%S}")

        vigia()
        if st.button("Atualizar agora", icon=":material/refresh:", width="stretch"):
            bases.recarregar()
            st.rerun()
        botao_robo(lateral=True)


def botao_robo(lateral: bool = False) -> None:
    """Botão que manda o robô buscar os dados no SAP (só no PC com o robô configurado)."""
    from . import auth, robo

    if not robo.disponivel() or not auth.pode_editar(auth.usuario_atual()):
        return
    st_ = robo.status()
    if robo.rodando():
        st.caption(":material/hourglass_top: Robô do SAP trabalhando… as telas se atualizam quando os arquivos chegarem.")
    elif st.button("Buscar no SAP agora", icon=":material/cloud_download:", width="stretch",
                   key="robo_lateral" if lateral else "robo_pagina",
                   help="Abre o SAP, exporta as transações configuradas e grava na pasta do site."):
        robo.iniciar()
        st.toast("Robô do SAP iniciado. Os dados aparecem sozinhos quando os arquivos forem gravados.",
                 icon=":material/smart_toy:")
    if st_.get("fim") and not st_.get("em_andamento"):
        quando = local(datetime.fromisoformat(st_["fim"]))
        if st_.get("ok"):
            st.caption(f":material/check_circle: Última busca no SAP: {quando}")
        else:
            st.caption(f":material/error: Última busca no SAP falhou ({quando}) — veja Fontes de dados.")


def logos() -> None:
    """Logo SIM no canto da barra superior (o da Alpargatas fica no topo da barra lateral)."""
    if LOGO_SIM.exists():
        st.logo(str(LOGO_SIM), size="large", icon_image=str(LOGO_SIM))


# ----------------------------------------------------------------------------
# Filtros globais das ordens (valem para Painel, Ordens e Equipamentos)
# ----------------------------------------------------------------------------
FILTROS_PERSISTENTES = ("f_faixa", "f_areas", "f_setores", "f_centros", "f_tipos")


def manter_filtros() -> None:
    """O Streamlit apaga o estado de um widget quando a página não o desenha; reatribuir
    mantém os filtros ao trocar de página (Painel → Estoque → Painel)."""
    for k in FILTROS_PERSISTENTES:
        if k in st.session_state:
            st.session_state[k] = st.session_state[k]


# ----------------------------------------------------------------------------
# Filtro de datas "entre" (de / até), usado em todas as telas com data
# ----------------------------------------------------------------------------
ATALHOS = ["Mês atual", "Últimos 30 dias", "Últimos 90 dias", "Ano atual", "Últimos 12 meses", "Tudo"]


def _atalho(nome: str, minimo: date, maximo: date) -> tuple[date, date]:
    hoje = hoje_local()
    domingo = hoje - timedelta(days=(hoje.weekday() + 1) % 7)   # semanas de domingo a sábado
    if nome in ("Esta semana", "Próxima semana", "Semana passada"):
        d = domingo + timedelta(days={"Esta semana": 0, "Próxima semana": 7, "Semana passada": -7}[nome])
        return d, d + timedelta(days=6)
    if nome in ("Este mês", "Próximo mês"):
        ini = hoje.replace(day=1)
        if nome == "Próximo mês":
            ini = (ini + timedelta(days=32)).replace(day=1)
        return ini, (ini + timedelta(days=32)).replace(day=1) - timedelta(days=1)
    if nome == "Mês atual":
        return hoje.replace(day=1), hoje
    if nome == "Últimos 30 dias":
        return hoje - timedelta(days=30), hoje
    if nome == "Últimos 90 dias":
        return hoje - timedelta(days=90), hoje
    if nome == "Próximos 30 dias":
        return hoje, hoje + timedelta(days=30)
    if nome == "Próximos 90 dias":
        return hoje, hoje + timedelta(days=90)
    if nome == "Ano atual":
        return hoje.replace(month=1, day=1), hoje.replace(month=12, day=31)
    if nome == "Últimos 12 meses":
        return (pd.Timestamp(hoje) - pd.DateOffset(months=12)).date(), hoje
    return minimo, maximo  # Tudo


def filtro_datas(chave: str, rotulo: str, padrao: tuple[date, date], dados: pd.Series | None = None,
                 atalhos: list[str] | None = None) -> tuple[date, date]:
    """Calendário de/até com atalhos. `dados` (datas da base) define o "Tudo" e os limites.

    Devolve (início, fim), ambos inclusivos; enquanto a pessoa escolhe só a 1ª data,
    usa o mesmo dia como fim."""
    ss = st.session_state
    validas = dados.dropna() if dados is not None else pd.Series(dtype="datetime64[ns]")
    minimo = min(validas.min().date(), padrao[0]) if len(validas) else padrao[0]
    maximo = max(validas.max().date(), padrao[1]) if len(validas) else padrao[1]
    minimo, maximo = min(minimo, date(2000, 1, 1)), max(maximo, hoje_local() + timedelta(days=730))
    if chave not in ss:
        ss[chave] = padrao
    chave_atalho = f"{chave}__atalho"

    def aplicar():
        escolha = ss.get(chave_atalho)
        if escolha:
            ss[chave] = _atalho(escolha, validas.min().date() if len(validas) else padrao[0],
                                validas.max().date() if len(validas) else padrao[1])
            ss[chave_atalho] = None

    faixa = st.date_input(rotulo, key=chave, format="DD/MM/YYYY", min_value=minimo, max_value=maximo,
                          help="Escolha a data inicial e a final no calendário (análise entre datas).")
    st.pills("Atalhos", atalhos or ATALHOS, key=chave_atalho, on_change=aplicar, label_visibility="collapsed")
    if isinstance(faixa, (list, tuple)):
        if len(faixa) == 2:
            return faixa[0], faixa[1]
        if len(faixa) == 1:
            return faixa[0], faixa[0]
        return padrao
    return faixa, faixa


def descrever(ini: date, fim: date) -> str:
    return f"{ini:%d/%m/%Y} a {fim:%d/%m/%Y}"


def entre(serie: pd.Series, ini: date, fim: date) -> pd.Series:
    """Máscara das datas dentro do intervalo, com os dois extremos inclusos."""
    return (serie >= pd.Timestamp(ini)) & (serie < pd.Timestamp(fim) + pd.Timedelta(days=1))


def filtros_ordens(df: pd.DataFrame) -> tuple[pd.DataFrame, pd.DataFrame, str]:
    """Filtros globais (barra lateral) aplicados às ordens.

    Devolve (ordens do período, ordens de qualquer data com os mesmos filtros de
    área/centro/tipo — usada para "em aberto hoje", que é uma foto de hoje —, descrição)."""
    from . import contexto

    f = contexto.filtros_globais()
    sem_periodo = f.ordens(df)
    return f.periodo(sem_periodo), sem_periodo, f.desc


# ----------------------------------------------------------------------------
# Tabelas e gráficos
# ----------------------------------------------------------------------------
def col_moeda(rotulo: str | None = None, **kw):
    """Valor em R$ no formato do navegador (1.234,56 no Brasil), com 2 casas — ponha "(R$)" no rótulo."""
    return st.column_config.NumberColumn(rotulo, format="localized", step=0.01, **kw)


def col_num(rotulo: str | None = None, casas: int = 2, **kw):
    """Número com `casas` decimais no formato do navegador (1.234,50 no Brasil). O modo "localized" corta as
    casas além de `casas` em vez de arredondar: use só onde a diferença não importa (HH, quantidades)."""
    return st.column_config.NumberColumn(rotulo, format="localized", step=10 ** -casas, **kw)


def col_data(rotulo: str | None = None, **kw):
    return st.column_config.DateColumn(rotulo, format="DD/MM/YYYY", **kw)


MIME_XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
_CONTROLE = r"[\x00-\x08\x0b\x0c\x0e-\x1f]"   # caracteres que o Excel (openpyxl) não aceita


def para_excel(df: pd.DataFrame) -> pd.DataFrame:
    """Cópia pronta para o Excel: categorias e datas com fuso viram valores simples, controle sai do texto."""
    saida = df.copy()
    for c in saida.columns:
        col = saida[c]
        if isinstance(col.dtype, pd.CategoricalDtype):
            saida[c] = col.astype(str)
        elif isinstance(col.dtype, pd.DatetimeTZDtype):
            saida[c] = col.dt.tz_localize(None)
        elif col.dtype == object or pd.api.types.is_string_dtype(col):
            saida[c] = col.astype(object).where(col.isna(), col.astype(str).str.replace(_CONTROLE, "", regex=True))
    return saida


def excel_bytes(*abas: tuple[str, pd.DataFrame]) -> bytes:
    import io

    buf = io.BytesIO()
    with pd.ExcelWriter(buf, engine="openpyxl") as xw:
        for nome, df in abas:
            para_excel(df).to_excel(xw, sheet_name=nome[:31], index=False)
    return buf.getvalue()


def baixar(df: pd.DataFrame, nome: str, rotulo: str = "Baixar Excel", chave: str | None = None) -> None:
    """Botão para baixar a tabela em Excel. O arquivo só é gerado no clique (não pesa em cada atualização
    da página) e o clique não recarrega a tela."""
    st.download_button(rotulo, lambda: excel_bytes(("Dados", df)), f"{nome}.xlsx", icon=":material/download:",
                       key=chave, mime=MIME_XLSX, on_click="ignore")


def grafico_barras_h(dados: pd.DataFrame, cat: str, val: str, cor: str = AZUL, formato: str = ",.0f",
                     altura: int | None = None, titulo_val: str = "") -> alt.Chart:
    """Barras horizontais com o valor escrito no padrão brasileiro: R$ 786,7 mil na barra (cabe no gráfico) e
    R$ 786.672,90 na dica; contagens como 1.234."""
    from .util import brl, brl_curto, inteiro

    moeda = ".2f" in formato
    dados = dados.assign(_rot=dados[val].map(brl_curto if moeda else inteiro),
                         _dica=dados[val].map(brl if moeda else inteiro))
    altura = altura or max(120, 26 * len(dados))
    base = alt.Chart(dados).encode(
        y=alt.Y(f"{cat}:N", sort="-x", title=None, axis=alt.Axis(labelLimit=180, labelOverlap=False)),
        x=alt.X(f"{val}:Q", title=titulo_val or None, axis=alt.Axis(format="~s", grid=False),
                scale=alt.Scale(domainMax=float(dados[val].max() or 1) * 1.25)),
        tooltip=[alt.Tooltip(f"{cat}:N"), alt.Tooltip("_dica:N", title=val)],
    )
    barras = base.mark_bar(color=cor, cornerRadiusEnd=3, height=16)
    rotulos = base.mark_text(align="left", dx=4, fontSize=11).encode(text="_rot:N")
    return (barras + rotulos).properties(height=altura)


def mostrar(grafico: alt.Chart) -> None:
    st.altair_chart(grafico.configure_view(stroke=None), width="stretch")
