"""Ligação das telas WCM: filtros globais, dados filtrados em cache e cartões de indicador.

Os filtros globais (período, área, centro de trabalho e tipo de ordem) ficam na barra
lateral e valem para todas as abas: trocar de aba mantém o mesmo recorte, e cada
cartão de indicador leva à aba onde ele é detalhado.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date

import altair as alt
import numpy as np
import pandas as pd
import streamlit as st

from . import bases, planos, ui
from .util import MESES
from . import indicadores as ind

ARQ_METAS = "metas_wcm.json"
COR_FAROL = {ind.VERDE: ui.VERDE, ind.AMARELO: "#F2B705", ind.VERMELHO: ui.VERMELHO, ind.NEUTRO: ui.CINZA}
NOME_FAROL = {ind.VERDE: "Na meta", ind.AMARELO: "Atenção", ind.VERMELHO: "Fora da meta", ind.NEUTRO: "Sem meta"}


# ----------------------------------------------------------------------------
# Filtros globais
# ----------------------------------------------------------------------------
@dataclass(frozen=True)
class Filtros:
    ini: date
    fim: date
    areas: tuple = ()
    centros: tuple = ()
    tipos: tuple = ()

    @property
    def chave(self) -> str:
        return f"{self.ini}|{self.fim}|{','.join(self.areas)}|{','.join(self.centros)}|{','.join(self.tipos)}"

    @property
    def desc(self) -> str:
        partes = [ui.descrever(self.ini, self.fim)]
        for rot, v in (("área", self.areas), ("centro", self.centros), ("tipo", self.tipos)):
            if v:
                partes.append(f"{rot}: {', '.join(v)}")
        return " · ".join(partes)

    @property
    def recorte(self) -> str:
        """Só os filtros de área/centro/tipo (sem o período)."""
        return self.desc.split(" · ", 1)[1] if " · " in self.desc else ""

    def periodo(self, df: pd.DataFrame, col: str = "Data") -> pd.DataFrame:
        return df[ui.entre(df[col], self.ini, self.fim)]

    def ordens(self, df: pd.DataFrame) -> pd.DataFrame:
        m = pd.Series(True, index=df.index)
        if self.areas:
            m &= df["Localização"].isin(self.areas)
        if self.centros:
            m &= df["Centro de trabalho"].isin(self.centros)
        if self.tipos:
            m &= df["Tipo"].isin(self.tipos)
        return df[m]

    def notas(self, df: pd.DataFrame | None) -> pd.DataFrame | None:
        if df is None:
            return None
        m = pd.Series(True, index=df.index)
        if self.areas:
            m &= df["Localização"].isin(self.areas)
        if self.centros:
            m &= df["Centro de trabalho"].isin(self.centros)
        return df[m]


def metas() -> dict:
    return bases.ler_cadastro(ARQ_METAS)


def tipos() -> dict[str, dict]:
    return ind.tipos_de(metas(), bases.tipos_de_ordem_padrao())


def filtros_globais() -> Filtros:
    """Filtros na barra lateral, compartilhados por todas as abas."""
    ss = st.session_state
    hoje = date.today()
    padrao = ((pd.Timestamp(hoje) - pd.DateOffset(months=12)).date(), hoje)
    o = bases.iw38().df
    n = bases.notas().df
    datas = o["Data"] if o is not None else (n["Data"] if n is not None else None)
    areas = sorted({a for df in (o, n) if df is not None for a in df["Localização"].unique() if a})
    centros = sorted(c for c in o["Centro de trabalho"].unique() if c) if o is not None else []
    tps = sorted(t for t in o["Tipo"].unique() if t) if o is not None else []
    rot = tipos()
    with st.sidebar:
        st.divider()
        st.markdown("**:material/filter_alt: Filtros globais** · valem para todas as abas")
        ini, fim = ui.filtro_datas("f_faixa", "Período (de / até)", padrao, datas)
        sel_area = st.multiselect("Área", areas, key="f_areas", placeholder="Todas",
                                  help="Localização das ordens e notas (GAL1, GAL2, UTIL…).")
        sel_ctr = st.multiselect("Centro de trabalho", centros, key="f_centros", placeholder="Todos")
        sel_tipo = st.multiselect("Tipo de ordem", tps, key="f_tipos", placeholder="Todos",
                                  format_func=lambda t: ind.rotulo_tipo(t, rot))
        if any([(ini, fim) != padrao, sel_area, sel_ctr, sel_tipo]):
            if st.button("Limpar filtros", icon=":material/filter_alt_off:", width="stretch"):
                for k in ui.FILTROS_PERSISTENTES:
                    ss.pop(k, None)
                st.rerun()
    return Filtros(ini, fim, tuple(sel_area), tuple(sel_ctr), tuple(sel_tipo))


# ----------------------------------------------------------------------------
# Dados filtrados (em cache por arquivo + filtros)
# ----------------------------------------------------------------------------
@st.cache_resource(show_spinner="Cruzando planos (IP19) e ordens (IW38)…", max_entries=4)
def _chamadas(chave: str) -> pd.DataFrame | None:
    ip = bases.ip19().df
    o = bases.iw38().df
    origem = ip if ip is not None else (planos.de_iw38(o) if o is not None else None)
    return planos.classificar(origem, o) if origem is not None and len(origem) else None


def chamadas_classificadas() -> pd.DataFrame | None:
    return _chamadas(bases.assinatura_geral() + str(date.today()))


@st.cache_resource(show_spinner="Preparando os indicadores…", max_entries=8)
def _dados(chave: str, f: Filtros) -> ind.Dados:
    o = bases.iw38().df
    ordens = f.ordens(o)
    conj = set(ordens["Ordem"])
    op = bases.operacoes().df
    oper = op[op["Ordem"].isin(conj)] if op is not None else None
    cf = bases.confirmacoes().df
    conf = None
    if cf is not None:
        conf = cf
        if f.areas or f.tipos:
            conf = conf[conf["Ordem"].isin(conj)]
        if f.centros:
            conf = conf[conf["Centro de trabalho"].isin(f.centros)]
    ch = chamadas_classificadas()
    if ch is not None:
        if f.centros:
            ch = ch[ch["Centro de trabalho"].isin(f.centros)]
        if f.tipos and "Tipo de ordem" in ch:
            ch = ch[ch["Tipo de ordem"].isin(f.tipos) | (ch["Tipo de ordem"] == "")]
    eq = bases.equipe().df
    if eq is not None and f.centros:
        eq = eq[eq["Centro de trabalho"].isin(f.centros)]
    cad = metas()
    return ind.Dados(
        ordens=ordens, notas=f.notas(bases.notas().df), oper=oper, chamadas=ch, estoque=bases.mb52().df,
        requisicoes=bases.requisicoes().df, cad_eq=bases.ler_cadastro(bases.ARQ_CAD_EQUIP),
        cad_mat=bases.ler_cadastro(bases.ARQ_CAD_MAT), capacidade=ind.capacidade_de(cad), conf=conf, equipe=eq,
        tipos=ind.tipos_de(cad, bases.tipos_de_ordem_padrao()), horas_semana=ind.horas_semana_de(cad),
        hoje=pd.Timestamp(date.today()))


def _chave() -> str:
    return bases.assinatura_geral() + "|" + str(date.today())


def dados(f: Filtros) -> ind.Dados:
    return _dados(_chave(), f)


@st.cache_resource(show_spinner="Cruzando ordens com operações e apontamentos…", max_entries=2)
def _ordens_enriq(chave: str) -> pd.DataFrame | None:
    o = bases.iw38().df
    if o is None:
        return None
    o = o.copy()
    fr = ind.fim_real_por_ordem(bases.operacoes().df)
    o["Fim real"] = o["Ordem"].map(fr) if len(fr) else pd.NaT
    o["Fim real"] = pd.to_datetime(o["Fim real"])
    lt = (o["Fim real"] - o["Início"]).dt.days
    o["Lead time (dias)"] = lt.where(lt >= 0)
    concl = (o["Situação"] == "Concluída") & o["Fim real"].notna() & o["Fim"].notna()
    o["Prazo"] = np.select([concl & (o["Fim real"] <= o["Fim"]), concl, o["Atrasada"]],
                           ["No prazo", "Concluída com atraso", "Atrasada (em aberto)"], default="")
    conf = bases.confirmacoes().df
    if conf is not None:
        g = conf.groupby("Ordem")
        o["HH apontadas"] = o["Ordem"].map(g["Horas"].sum())
        o["Pessoas que apontaram"] = o["Ordem"].map(g["Nº pessoal"].nunique()).fillna(0).astype(int)
    tps = tipos()
    o["Classe"] = o["Tipo"].map({t: ind.classe_tipo(t, tps) for t in o["Tipo"].unique()})
    o["Tipo (nome)"] = o["Tipo"].map({t: ind.rotulo_tipo(t, tps) for t in o["Tipo"].unique()})
    return o


def ordens_enriquecidas() -> pd.DataFrame | None:
    """IW38 + fim real (IW38OP), lead time, prazo, HH apontadas (IW47) e classe WCM do tipo."""
    return _ordens_enriq(_chave())


@st.cache_data(show_spinner=False, max_entries=128)
def _calc(chave: str, f: Filtros, ini: date, fim: date) -> dict:
    return ind.calcular(_dados(chave, f), ini, fim)


@st.cache_data(show_spinner="Calculando a evolução mês a mês…", max_entries=32)
def _mensal(chave: str, f: Filtros, ini: date, fim: date) -> pd.DataFrame:
    return ind.mensal(_dados(chave, f), ini, fim)


def resultados(f: Filtros) -> tuple[dict, dict]:
    """(valores do período, valores do período anterior de mesma duração)."""
    a, b = ind.periodo_anterior(f.ini, f.fim)
    return _calc(_chave(), f, f.ini, f.fim), _calc(_chave(), f, a, b)


def serie_mensal(f: Filtros, meses: int = 12) -> pd.DataFrame:
    """Série mensal dos últimos `meses` meses até o fim do período."""
    fim = pd.Timestamp(f.fim)
    ini = max(pd.Timestamp(f.ini), (fim - pd.DateOffset(months=meses - 1)).to_period("M").start_time)
    return _mensal(_chave(), f, ini.date(), f.fim)


def por_dimensao(f: Filtros, campo: str, valores: list[str]) -> dict[str, dict]:
    """Indicadores do período para cada área / centro de trabalho (scorecard)."""
    out = {}
    for v in valores:
        g = Filtros(f.ini, f.fim, (v,) if campo == "areas" else f.areas, (v,) if campo == "centros" else f.centros,
                    f.tipos)
        out[v] = _calc(_chave(), g, f.ini, f.fim)
    return out


# ----------------------------------------------------------------------------
# Cartões de indicador
# ----------------------------------------------------------------------------
CSS = """
<style>
  .cm-kpi-t { font-size: .74rem; text-transform: uppercase; letter-spacing: .05em; opacity: .75; font-weight: 700;
              display: flex; align-items: center; gap: 6px; }
  .cm-kpi-v { font-size: 1.6rem; font-weight: 800; line-height: 1.15; margin: 2px 0 2px; }
  .cm-kpi-m { font-size: .76rem; opacity: .8; }
  .cm-dot { width: 10px; height: 10px; border-radius: 50%%; display: inline-block; flex: none; }
  .cm-up { color: %(verde)s; font-weight: 700; } .cm-down { color: %(vermelho)s; font-weight: 700; }
  .cm-eq { opacity: .7; font-weight: 700; }
  [class*="st-key-kpi-verde"] { border-left: 5px solid %(verde)s !important; }
  [class*="st-key-kpi-amarelo"] { border-left: 5px solid #F2B705 !important; }
  [class*="st-key-kpi-vermelho"] { border-left: 5px solid %(vermelho)s !important; }
  [class*="st-key-kpi-neutro"] { border-left: 5px solid %(cinza)s !important; }
  [class*="st-key-kpi-"] [data-testid="stPageLink"] p { font-size: .76rem; }
  [class*="st-key-kpi-"]:has(.cm-kpi-m) { min-height: 128px; }
  [class*="st-key-kpi-"]:has([data-testid="stPageLink"]) { min-height: 176px; justify-content: space-between; }
  [class*="st-key-kpi-"] [data-testid="stVegaLiteChart"] { margin-top: -6px; }
  .cm-indice { font-size: 2.6rem; font-weight: 900; line-height: 1; }
  @media (max-width: 640px) {
    [data-testid="stHorizontalBlock"]:has(> [data-testid="stColumn"] [class*="st-key-kpi-"]) {
      flex-direction: row !important; flex-wrap: wrap !important; gap: .5rem !important; }
    [data-testid="stHorizontalBlock"]:has(> [data-testid="stColumn"] [class*="st-key-kpi-"]) > [data-testid="stColumn"] {
      flex: 1 1 calc(50%% - .5rem) !important; min-width: calc(50%% - .5rem) !important; }
    .cm-kpi-v { font-size: 1.2rem; }
  }
</style>
""" % {"verde": ui.VERDE, "vermelho": ui.VERMELHO, "cinza": ui.CINZA}


def _texto_meta(kpi: ind.Kpi, alvo: float | None) -> str:
    if alvo is None:
        return "sem meta"
    return f"meta {'≥' if kpi.sentido > 0 else '≤'} {ind.formatar(kpi, alvo)}"


def _texto_variacao(kpi: ind.Kpi, atual, anterior) -> str:
    delta, melhorou = ind.variacao(kpi, atual, anterior)
    if delta is None:
        return ""
    if kpi.unidade == "un":
        txt = f"{abs(delta):,.0f}".replace(",", ".")
    else:
        txt = f"{abs(delta):,.1f}".replace(",", "X").replace(".", ",").replace("X", ".")
        txt += " p.p." if kpi.unidade == "%" else "%"
    seta = "▲" if delta > 0 else ("▼" if delta < 0 else "=")
    classe = "cm-eq" if melhorou is None else ("cm-up" if melhorou else "cm-down")
    return f' · <span class="{classe}" title="vs período anterior de mesma duração">{seta} {txt}</span>'


def cartao(kpi: ind.Kpi, valor, anterior, cad_metas: dict, serie: pd.DataFrame | None = None,
           prefixo: str = "", link: bool = True) -> str:
    """Cartão com farol, valor, meta, variação vs período anterior, mini tendência e link para o detalhe."""
    alvo = ind.meta(kpi, cad_metas)
    cor = ind.farol(kpi, valor, alvo)
    with st.container(border=True, key=f"kpi-{cor}-{prefixo}{kpi.id}"):
        st.markdown(
            f'<div class="cm-kpi-t" title="{kpi.formula}"><span class="cm-dot" style="background:{COR_FAROL[cor]}">'
            f'</span>{kpi.nome}</div><div class="cm-kpi-v">{ind.formatar(kpi, valor)}</div>'
            f'<div class="cm-kpi-m">{_texto_meta(kpi, alvo)}{_texto_variacao(kpi, valor, anterior)}</div>',
            unsafe_allow_html=True, help=kpi.formula)
        if serie is not None and kpi.mensal and kpi.id in serie and serie[kpi.id].notna().sum() >= 2:
            st.altair_chart(mini_tendencia(serie, kpi, alvo), width="stretch")
        if link:
            st.page_link(kpi.pagina, label="Detalhar", icon=":material/arrow_forward:")
    return cor


def mini_tendencia(serie: pd.DataFrame, kpi: ind.Kpi, alvo: float | None) -> alt.Chart:
    s = serie[["Mês", kpi.id]].dropna()
    base = alt.Chart(s).encode(x=alt.X("Mês:T", axis=None), y=alt.Y(f"{kpi.id}:Q", axis=None,
                                                                     scale=alt.Scale(zero=False)))
    linha = base.mark_line(color=ui.GRAFITE, strokeWidth=1.6) + base.mark_point(color=ui.GRAFITE, size=14, filled=True)
    ch = linha
    if alvo is not None:
        ch = ch + alt.Chart(pd.DataFrame({"m": [alvo]})).mark_rule(color=ui.VERDE, strokeDash=[3, 3]).encode(y="m:Q")
    return ch.properties(height=38).configure_view(stroke=None)


def grade(kpis: list[ind.Kpi], atual: dict, anterior: dict, cad_metas: dict, serie: pd.DataFrame | None = None,
          colunas: int = 4, prefixo: str = "", link: bool = True) -> list[str]:
    st.markdown(CSS, unsafe_allow_html=True)
    cores = []
    for i in range(0, len(kpis), colunas):
        cols = st.columns(colunas)
        for c, k in zip(cols, kpis[i:i + colunas]):
            with c:
                cores.append(cartao(k, atual.get(k.id), anterior.get(k.id), cad_metas, serie, prefixo, link))
    return cores


def mes_pt(m) -> str:
    """Rótulo de mês em português (Jan/26), sem depender do idioma do navegador."""
    return f"{MESES[m.month - 1]}/{m:%y}"


def grafico_mensal(serie: pd.DataFrame, kpi: ind.Kpi, alvo: float | None, cor: str = ui.AZUL,
                   barras: bool = False, altura: int = 220) -> alt.Chart:
    """Evolução mês a mês de um indicador, com a linha da meta."""
    s = serie[["Mês", kpi.id]].dropna().copy()
    s["Rótulo"] = s[kpi.id].map(lambda v: ind.formatar(kpi, v))
    s["Mês txt"] = s["Mês"].map(mes_pt)
    base = alt.Chart(s).encode(x=alt.X("Mês txt:N", title=None, sort=list(s["Mês txt"]), axis=alt.Axis(labelAngle=0)),
                               y=alt.Y(f"{kpi.id}:Q", title=None, scale=alt.Scale(zero=barras)),
                               tooltip=[alt.Tooltip("Mês txt:N", title="Mês"), alt.Tooltip("Rótulo:N", title=kpi.nome)])
    if barras:
        ch = base.mark_bar(color=cor, cornerRadiusEnd=3, size=18)
    else:
        ch = base.mark_line(color=cor, strokeWidth=2.4, point=alt.OverlayMarkDef(size=50, filled=True, color=cor))
    ch = ch + base.mark_text(dy=-10, fontSize=10, color=ui.GRAFITE).encode(text="Rótulo:N")
    if alvo is not None:
        ch = ch + alt.Chart(pd.DataFrame({"m": [alvo], "t": [f"meta {ind.formatar(kpi, alvo)}"]})).mark_rule(
            color=ui.VERDE, strokeDash=[5, 4], strokeWidth=1.6).encode(y="m:Q", tooltip=alt.Tooltip("t:N", title="Meta"))
    return ch.properties(height=altura)


def scorecard(valores: dict[str, dict], kpis: list[ind.Kpi], cad_metas: dict, rotulo: str) -> pd.io.formats.style.Styler:
    """Tabela linhas = área/centro × colunas = indicadores, com fundo do farol."""
    linhas, cores = [], []
    for nome, r in valores.items():
        linhas.append({rotulo: nome, **{k.nome: ind.formatar(k, r.get(k.id)) for k in kpis}})
        cores.append({rotulo: "", **{k.nome: ind.farol(k, r.get(k.id), ind.meta(k, cad_metas)) for k in kpis}})
    df = pd.DataFrame(linhas)
    fundo = {ind.VERDE: "background-color: rgba(14,159,70,.16)", ind.AMARELO: "background-color: rgba(242,183,5,.22)",
             ind.VERMELHO: "background-color: rgba(227,38,43,.16)", ind.NEUTRO: "", "": ""}
    estilos = pd.DataFrame(cores).map(lambda c: fundo.get(c, ""))
    return df.style.apply(lambda _: estilos, axis=None)


def link_ficha(equipamento: str, rotulo: str = "Abrir ficha do equipamento", chave: str | None = None) -> None:
    """Botão que abre a ficha do equipamento na aba Equipamentos (análise)."""
    if equipamento and st.button(rotulo, icon=":material/precision_manufacturing:", key=chave):
        st.session_state["eq_sel"] = equipamento
        st.switch_page("paginas/equipamentos.py")
