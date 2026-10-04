"""Peças de interface compartilhadas: estilo, barra lateral, filtros globais,
vigia de atualização e formatação de tabelas."""

from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

import altair as alt
import pandas as pd
import streamlit as st

from . import bases, config
from .leitura import NOMES_BASE

FUSO = ZoneInfo("America/Sao_Paulo")

# Verde e grafite do logo SIM; demais cores do logo Alpargatas.
VERDE, GRAFITE = "#0E9F46", "#4A4D50"
AZUL, LARANJA, VERMELHO, CIANO, LIMA, AMARELO = "#0A6EBD", "#F7931E", "#E3262B", "#1FC8E8", "#9BC53D", "#FFC20E"
CINZA = "#8C9491"
FAIXA = f"linear-gradient(90deg, {VERMELHO}, {LARANJA}, {AMARELO}, {CIANO}, {AZUL}, {LIMA}, {VERDE})"

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
        st.page_link("paginas/dados.py", label="Abrir Fontes de dados", icon=":material/folder_open:")
        return False
    cfg = config.carregar()
    if datetime.now(timezone.utc) - base.atualizado > timedelta(days=cfg.dias_alerta):
        st.warning(f"A base de {NOMES_BASE[tipo]} está desatualizada: arquivo de {local(base.atualizado)} "
                   f"({idade(base.atualizado)}). Exporte de novo do SAP para a mesma pasta.", icon=":material/history:")
    return True


def barra_lateral(usuario: dict | None = None) -> None:
    cfg = config.carregar()
    with st.sidebar:
        if LOGO_ALPA.exists():
            st.image(str(LOGO_ALPA), width=96)
        st.markdown("**Central de Manutenção** · PCM F26")
        if usuario and usuario.get("login"):
            perfil = {"admin": "Administrador", "editor": "Editor", "leitor": "Leitor"}.get(usuario.get("perfil"), "")
            st.caption(f":material/person: **{usuario.get('nome') or usuario['login']}** · {perfil}")
        else:
            st.caption("Ordens IW38 · Estoque MB52 · Requisições · Equipamentos")

        @st.fragment(run_every=cfg.intervalo_verificacao)
        def vigia():
            try:
                ass = bases.assinatura_geral()
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
FILTROS_PERSISTENTES = ("f_faixa", "f_areas", "f_centros", "f_tipos")


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
    hoje = date.today()
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
    minimo, maximo = min(minimo, date(2000, 1, 1)), max(maximo, date.today() + timedelta(days=730))
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
    return st.column_config.NumberColumn(rotulo, format="R$ %.2f", **kw)


def col_data(rotulo: str | None = None, **kw):
    return st.column_config.DateColumn(rotulo, format="DD/MM/YYYY", **kw)


def baixar(df: pd.DataFrame, nome: str, rotulo: str = "Baixar Excel", chave: str | None = None) -> None:
    """Botão para baixar a tabela filtrada em Excel (cai para CSV se o Excel falhar)."""
    import io

    buf = io.BytesIO()
    try:
        saida = df.copy()
        for c in saida.select_dtypes(include="category").columns:
            saida[c] = saida[c].astype(str)
        saida.to_excel(buf, index=False, engine="openpyxl")
        st.download_button(rotulo, buf.getvalue(), f"{nome}.xlsx", icon=":material/download:", key=chave,
                           mime="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
    except Exception:  # noqa: BLE001
        st.download_button(rotulo, df.to_csv(index=False, sep=";").encode("utf-8-sig"), f"{nome}.csv",
                           icon=":material/download:", key=chave, mime="text/csv")


def grafico_barras_h(dados: pd.DataFrame, cat: str, val: str, cor: str = AZUL, formato: str = ",.0f",
                     altura: int | None = None, titulo_val: str = "") -> alt.Chart:
    """Barras horizontais com o valor escrito no padrão brasileiro (R$ 1.234,56 / 1.234)."""
    from .util import brl, inteiro

    fmt = brl if ".2f" in formato else inteiro
    dados = dados.assign(_rot=dados[val].map(fmt))
    altura = altura or max(120, 26 * len(dados))
    base = alt.Chart(dados).encode(
        y=alt.Y(f"{cat}:N", sort="-x", title=None, axis=alt.Axis(labelLimit=180, labelOverlap=False)),
        x=alt.X(f"{val}:Q", title=titulo_val or None, axis=alt.Axis(format="~s", grid=False),
                scale=alt.Scale(domainMax=float(dados[val].max() or 1) * 1.25)),
        tooltip=[alt.Tooltip(f"{cat}:N"), alt.Tooltip("_rot:N", title=val)],
    )
    barras = base.mark_bar(color=cor, cornerRadiusEnd=3, height=16)
    rotulos = base.mark_text(align="left", dx=4, fontSize=11).encode(text="_rot:N")
    return (barras + rotulos).properties(height=altura)


def mostrar(grafico: alt.Chart) -> None:
    st.altair_chart(grafico.configure_view(stroke=None), width="stretch")
