"""Ligação das telas WCM: filtros globais, dados filtrados em cache e cartões de indicador.

Os filtros globais (período, área, centro de trabalho e tipo de ordem) ficam na barra
lateral e valem para todas as abas: trocar de aba mantém o mesmo recorte, e cada
cartão de indicador leva à aba onde ele é detalhado.
"""

from __future__ import annotations

import html
from dataclasses import dataclass
from datetime import date

import altair as alt
import numpy as np
import pandas as pd
import streamlit as st

from . import bases, planos, saude, ui
from .util import hoje_local, MESES, setor_do_centro, setores, SETORES
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
    centros: tuple = ()           # com setor escolhido e nenhum centro, são todos os centros do setor
    tipos: tuple = ()
    setores: tuple = ()
    centros_do_setor: bool = False

    @property
    def chave(self) -> str:
        return (f"{self.ini}|{self.fim}|{','.join(self.areas)}|{','.join(self.centros)}|{','.join(self.tipos)}"
                f"|{','.join(self.setores)}")

    @property
    def desc(self) -> str:
        partes = [ui.descrever(self.ini, self.fim)]
        centros = () if self.centros_do_setor else self.centros
        for rot, v in (("área", self.areas), ("setor", self.setores), ("centro", centros), ("tipo", self.tipos)):
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


ATALHOS_PERIODO = ["Mês atual", "Últimos 30 dias", "Últimos 90 dias", "Próximos 30 dias", "Ano atual",
                   "Últimos 12 meses", "Tudo"]


def centros_conhecidos() -> list[str]:
    """Todos os centros de trabalho das bases (IW38, IW38OP, IW47, IW28)."""
    return sorted({str(c) for b in (bases.iw38().df, bases.operacoes().df, bases.confirmacoes().df, bases.notas().df)
                   if b is not None for c in b["Centro de trabalho"].astype(object).dropna().unique() if str(c).strip()})


def _contagens(o_per: pd.DataFrame | None, sel: dict, col: str, exceto: str) -> dict:
    """Ordens do período por valor de `col`, aplicando os outros filtros (filtro em cascata)."""
    if o_per is None or not len(o_per):
        return {}
    m = pd.Series(True, index=o_per.index)
    for chave_f, coluna in (("f_areas", "Localização"), ("f_setores", "Setor"), ("f_centros", "Centro de trabalho"),
                            ("f_tipos", "Tipo")):
        if chave_f != exceto and sel.get(chave_f) and coluna in o_per:
            m &= o_per[coluna].astype(str).isin(sel[chave_f])
    return o_per.loc[m, col].astype(str).value_counts().to_dict() if col in o_per else {}


def _opcoes(contagem: dict, selecionados: list, ordem: list | None = None) -> list:
    """Só os valores com ordem no recorte (os já escolhidos ficam), do maior para o menor ou na ordem dada."""
    vivos = [v for v, n in contagem.items() if v and n > 0]
    if ordem is not None:
        vivos = [v for v in ordem if v in vivos]
    return vivos + [v for v in selecionados if v not in vivos]


def filtros_globais(periodo: bool = True, datas: pd.Series | None = None, bases_data: list[str] | None = None,
                    chave_base: str = "", ajuda_base: str = "", na_pagina: bool = False) -> Filtros:
    """Filtros compartilhados por todas as abas.

    O período é do tipo "entre" (data inicial → data final) e fica à vista no topo da página, com
    atalhos. Área, setor, centro de trabalho e tipo de ordem ficam na barra lateral (ou no topo da
    página, com `na_pagina`) e são inteligentes: em cascata, cada opção mostra quantas ordens tem no
    período com os outros filtros aplicados e as que não têm nenhuma somem. `periodo=False` é para
    abas com calendário próprio (Planos). `bases_data` acrescenta ao quadro a escolha da data de
    referência (lida depois em st.session_state[chave_base])."""
    ss = st.session_state
    hoje = hoje_local()
    padrao = ((pd.Timestamp(hoje) - pd.DateOffset(months=12)).date(), hoje)
    o = bases.iw38().df
    n = bases.notas().df
    if datas is None:
        datas = o["Data"] if o is not None else (n["Data"] if n is not None else None)
    rot = tipos()
    todos_centros = centros_conhecidos()   # o setor escolhido vira a lista dos seus centros
    if periodo:
        with st.container(border=True, key="periodo-global"):
            if bases_data:
                c1, c2 = st.columns([3, 2])
            else:
                c1, c2 = st.container(), None
            with c1:
                ini, fim = ui.filtro_datas("f_faixa", "Período (de / até)", padrao, datas, atalhos=ATALHOS_PERIODO)
            if bases_data and c2 is not None:
                if ss.get(chave_base) not in bases_data:
                    ss.pop(chave_base, None)
                c2.segmented_control("Data de referência", bases_data, default=bases_data[0], key=chave_base,
                                     help=ajuda_base or None)
            if not na_pagina:
                st.caption(f":material/date_range: **{ui.descrever(ini, fim)}** · o mesmo período vale para todas as "
                           "abas (área, setor, centro e tipo ficam na barra lateral)")
    else:
        v = ss.get("f_faixa", padrao)
        v = tuple(v) if isinstance(v, (list, tuple)) else (v, v)
        ini, fim = (v[0], v[-1]) if v else padrao

    # filtros em cascata, com a contagem de ordens do período em cada opção
    o_per = None
    if o is not None:
        o_per = o[ui.entre(o["Data"], ini, fim)]
        if "Setor" not in o_per:
            o_per = o_per.assign(Setor=setores(o_per["Centro de trabalho"]))
    sel = {k: [str(x) for x in (ss.get(k) or [])] for k in ("f_areas", "f_setores", "f_centros", "f_tipos")}
    cont = {"f_areas": _contagens(o_per, sel, "Localização", "f_areas"),
            "f_setores": _contagens(o_per, sel, "Setor", "f_setores"),
            "f_centros": _contagens(o_per, sel, "Centro de trabalho", "f_centros"),
            "f_tipos": _contagens(o_per, sel, "Tipo", "f_tipos")}
    opc = {"f_areas": _opcoes(cont["f_areas"], sel["f_areas"]),
           "f_setores": _opcoes(cont["f_setores"], sel["f_setores"], SETORES),
           "f_centros": _opcoes(cont["f_centros"], sel["f_centros"]),
           "f_tipos": _opcoes(cont["f_tipos"], sel["f_tipos"])}

    def rotulo(chave_f):
        def fmt(v):
            q = cont[chave_f].get(v, 0)
            nome = ind.rotulo_tipo(v, rot) if chave_f == "f_tipos" else v
            return f"{nome} · {q:,}".replace(",", ".") if q else f"{nome} · 0"
        return fmt

    def widgets(alvo, colunas: bool):
        cols = alvo.columns(4) if colunas else [alvo] * 4
        a = cols[0].multiselect("Área", opc["f_areas"], key="f_areas", placeholder="Todas", format_func=rotulo("f_areas"),
                                help="Localização das ordens e notas (GAL1, GAL2, UTIL…). O número é de ordens no "
                                     "período com os outros filtros aplicados.")
        s_ = cols[1].multiselect(
            "Setor", opc["f_setores"], key="f_setores", placeholder="Todos", format_func=rotulo("f_setores"),
            help="Pelo código do centro de trabalho: …COMP = Componentes (e GPA), …MONT = Montagem, UTIL = Utilidades, "
                 "CORT = Corte, PRE = Predial, MATZ = Matrizaria, FERRAMEN = Ferramentaria, TERC = Terceiros…")
        c_ = cols[2].multiselect("Centro de trabalho", opc["f_centros"], key="f_centros", placeholder="Todos",
                                 format_func=rotulo("f_centros"))
        t_ = cols[3].multiselect("Tipo de ordem", opc["f_tipos"], key="f_tipos", placeholder="Todos",
                                 format_func=rotulo("f_tipos"))
        return a, s_, c_, t_

    if na_pagina:
        with st.container(border=True, key="filtros-pagina"):
            sel_area, sel_setor, sel_ctr, sel_tipo = widgets(st, True)
            ativos = [f"{nome}: {', '.join(v)}" for nome, v in (("Área", sel_area), ("Setor", sel_setor),
                                                               ("Centro", sel_ctr), ("Tipo", sel_tipo)) if v]
            r1, r2 = st.columns([5, 1], vertical_alignment="center")
            n_rec = 0
            if o_per is not None:
                m = pd.Series(True, index=o_per.index)
                for vals, col in ((sel_area, "Localização"), (sel_setor, "Setor"), (sel_ctr, "Centro de trabalho"),
                                  (sel_tipo, "Tipo")):
                    if vals:
                        m &= o_per[col].astype(str).isin(vals)
                n_rec = int(m.sum())
            r1.caption(f":material/date_range: **{ui.descrever(ini, fim)}** · **{inteiro_br(n_rec)} ordens** no recorte"
                       + (" · " + " · ".join(ativos) if ativos else " · fábrica inteira")
                       + " · os filtros valem para todas as abas")
            if any([(ini, fim) != padrao, sel_area, sel_setor, sel_ctr, sel_tipo]):
                if r2.button("Limpar", icon=":material/filter_alt_off:", width="stretch", key="limpar_pagina"):
                    for k in ui.FILTROS_PERSISTENTES:
                        ss.pop(k, None)
                    st.rerun()
    else:
        with st.sidebar:
            st.divider()
            st.markdown("**:material/filter_alt: Filtros globais** · valem para todas as abas")
            sel_area, sel_setor, sel_ctr, sel_tipo = widgets(st, False)
            if any([(ini, fim) != padrao, sel_area, sel_setor, sel_ctr, sel_tipo]):
                if st.button("Limpar filtros", icon=":material/filter_alt_off:", width="stretch"):
                    for k in ui.FILTROS_PERSISTENTES:
                        ss.pop(k, None)
                    st.rerun()
    # marcar todas as opções = não filtrar (senão bases que não têm aquela coluna perderiam linhas à toa)
    def _tudo(sel, chave_f):
        return [] if len(opc[chave_f]) > 1 and set(sel) >= set(opc[chave_f]) else sel

    sel_area, sel_setor = _tudo(sel_area, "f_areas"), _tudo(sel_setor, "f_setores")
    sel_ctr, sel_tipo = _tudo(sel_ctr, "f_centros"), _tudo(sel_tipo, "f_tipos")
    if sel_ctr:
        efetivos = tuple(sel_ctr)
    elif sel_setor:
        efetivos = tuple(c for c in todos_centros if setor_do_centro(c) in sel_setor) or ("—",)
    else:
        efetivos = ()
    return Filtros(ini, fim, tuple(sel_area), efetivos, tuple(sel_tipo), tuple(sel_setor),
                   centros_do_setor=bool(sel_setor and not sel_ctr))


def inteiro_br(n) -> str:
    return f"{int(n or 0):,}".replace(",", ".")


def data_de_referencia(chave_base: str, bases_data: list[str]) -> str:
    v = st.session_state.get(chave_base)
    return v if v in bases_data else bases_data[0]


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
    return _chamadas(bases.assinatura_dados() + str(hoje_local()))


def _area_do_equipamento() -> dict:
    eq = bases.equipamentos().df
    return dict(zip(eq["Equipamento"], eq["Localização"])) if eq is not None and "Localização" in eq else {}


def filtrar_conf(conf: pd.DataFrame | None, f: Filtros, ordens_todas: pd.DataFrame | None) -> pd.DataFrame | None:
    """Apontamentos (IW47) no recorte com uma regra só: centro pelo centro do apontamento; área pela ordem
    (IW38) ou, se a ordem não está no IW38 (ex.: corretivas YM11), pela localização do equipamento (IH08);
    tipo pelo tipo da ordem no próprio apontamento (ou no IW38)."""
    if conf is None or not (f.areas or f.centros or f.tipos):
        return conf
    c = conf
    if f.centros:
        c = c[c["Centro de trabalho"].isin(f.centros)]
    ref = ordens_todas.drop_duplicates("Ordem").set_index("Ordem") if ordens_todas is not None else None
    if f.areas:
        area = c["Ordem"].map(ref["Localização"]) if ref is not None else pd.Series(pd.NA, index=c.index)
        if "Equipamento" in c:
            area = area.fillna(c["Equipamento"].map(_area_do_equipamento()))
        c = c[area.isin(f.areas)]
    if f.tipos:
        tipo = c["Tipo"].where(c["Tipo"] != "") if "Tipo" in c else pd.Series(pd.NA, index=c.index)
        if ref is not None:
            tipo = tipo.fillna(c["Ordem"].map(ref["Tipo"]))
        c = c[tipo.isin(f.tipos)]
    return c


@st.cache_resource(show_spinner="Preparando os indicadores…", max_entries=4)
def _dados(chave: str, f: Filtros) -> ind.Dados:
    o = bases.iw38().df
    ordens = f.ordens(o)
    conj = set(ordens["Ordem"])
    op = bases.operacoes().df
    oper = op[op["Ordem"].isin(conj)] if op is not None else None
    conf = filtrar_conf(bases.confirmacoes().df, f, o)
    ch = chamadas_classificadas()
    if ch is not None:
        if f.centros:
            ch = ch[ch["Centro de trabalho"].isin(f.centros)]
        if f.tipos and "Tipo de ordem" in ch:
            ch = ch[ch["Tipo de ordem"].isin(f.tipos) | (ch["Tipo de ordem"] == "")]
        if f.areas:      # a IP19 não traz a área: vale a do equipamento do plano (IH08) ou da ordem
            area = ch["Equipamento"].map(_area_do_equipamento())
            if "Ordem" in ch and o is not None:
                area = area.fillna(ch["Ordem"].map(o.drop_duplicates("Ordem").set_index("Ordem")["Localização"]))
            ch = ch[area.isin(f.areas)]
    eq = bases.equipe().df
    if eq is not None and f.centros:
        eq = eq[eq["Centro de trabalho"].isin(f.centros)]
    cad = metas()
    return ind.Dados(
        ordens=ordens, notas=f.notas(bases.notas().df), oper=oper, chamadas=ch, estoque=bases.mb52().df,
        requisicoes=bases.requisicoes().df, cad_eq=bases.ler_cadastro(bases.ARQ_CAD_EQUIP),
        cad_mat=bases.ler_cadastro(bases.ARQ_CAD_MAT), capacidade=ind.capacidade_de(cad), conf=conf, equipe=eq,
        tipos=ind.tipos_de(cad, bases.tipos_de_ordem_padrao()), horas_semana=ind.horas_semana_de(cad),
        # Gerenciador de AF: as áreas dele são outras, então nada de filtro de área/centro (só o período vale)
        afs=bases.afs().df, acoes_af=bases.acoes_af().df,
        hoje=pd.Timestamp(hoje_local()), centros=tuple(f.centros), tipos_filtro=tuple(f.tipos),
        filtro_area_tipo=bool(f.areas or f.tipos))


def _chave() -> str:
    return bases.assinatura_dados() + "|" + str(hoje_local())


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


@st.cache_data(show_spinner="Calculando a saúde dos ativos…", max_entries=16)
def _saude(chave: str, f: Filtros) -> pd.DataFrame:
    d = _dados(chave, f)
    return saude.calcular(d.ordens, d.hoje, quebras=d.memo("quebras", ind.quebras), afs=d.afs, chamadas=d.chamadas,
                          anomalias=d.memo("semeq", ind.anomalias_semeq), equip=bases.equipamentos().df,
                          cad_eq=d.cad_eq)


def saude_ativos(f: Filtros) -> pd.DataFrame:
    """Índice de saúde por equipamento no recorte de área/setor/centro/tipo (janela própria de 12 meses)."""
    return _saude(_chave(), Filtros(date.min, date.min, f.areas, f.centros, f.tipos, f.setores, f.centros_do_setor))


@st.cache_data(show_spinner=False, max_entries=128)
def _calc(chave: str, f: Filtros, ini: date, fim: date) -> dict:
    return ind.calcular(_dados(chave, f), ini, fim)


@st.cache_data(show_spinner="Calculando a evolução mês a mês…", max_entries=32)
def _mensal(chave: str, f: Filtros, ini: date, fim: date) -> pd.DataFrame:
    return ind.mensal(_dados(chave, f), ini, fim)


def resultados(f: Filtros) -> tuple[dict, dict]:
    """(valores do período, valores do período anterior de mesma duração). No anterior, só os indicadores
    cuja base cobre ao menos metade dele — senão a comparação enganaria (ex.: notas exportadas só deste ano)."""
    a, b = ind.periodo_anterior(f.ini, f.fim)
    return _calc(_chave(), f, f.ini, f.fim), ind.comparavel(_calc(_chave(), f, a, b))


def serie_mensal(f: Filtros, meses: int = 12) -> pd.DataFrame:
    """Série mensal dos últimos `meses` meses até o fim do período."""
    fim = pd.Timestamp(f.fim)
    ini = max(pd.Timestamp(f.ini), (fim - pd.DateOffset(months=meses - 1)).to_period("M").start_time)
    return _mensal(_chave(), f, ini.date(), f.fim)


def por_dimensao(f: Filtros, campo: str, valores: list[str]) -> dict[str, dict]:
    """Indicadores do período para cada área / centro de trabalho (scorecard)."""
    out = {}
    for v in valores:
        if campo == "setores":   # centros do setor (dentro do recorte de centros, se houver)
            base_c = f.centros or centros_conhecidos()
            centros = tuple(c for c in base_c if setor_do_centro(c) == v) or ("—",)
            g = Filtros(f.ini, f.fim, f.areas, centros, f.tipos, (v,), centros_do_setor=True)
        else:
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
  [class*="st-key-faixa-"] { border-left: 5px solid %(cinza)s !important; }
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
            f'<div class="cm-kpi-t" title="{html.escape(kpi.formula, quote=True)}"><span class="cm-dot" style="background:{COR_FAROL[cor]}">'
            f'</span>{kpi.nome}</div><div class="cm-kpi-v">{ind.formatar(kpi, valor)}</div>'
            f'<div class="cm-kpi-m">{_texto_meta(kpi, alvo)}{_texto_variacao(kpi, valor, anterior)}</div>',
            unsafe_allow_html=True, help=kpi.formula)
        if serie is not None and kpi.mensal and kpi.id in serie and serie[kpi.id].notna().sum() >= 2:
            st.markdown(mini_tendencia(serie, kpi, alvo), unsafe_allow_html=True)
        if link:
            st.page_link(kpi.pagina, label="Detalhar", icon=":material/arrow_forward:")
    return cor


def mini_tendencia(serie: pd.DataFrame, kpi: ind.Kpi, alvo: float | None) -> str:
    """Mini tendência mensal em SVG (linha + pontos + meta tracejada), na cor do texto do tema claro ou
    escuro. Leve: um gráfico Altair por cartão custava ~40 ms cada, 1 s por clique no Painel."""
    s = serie[["Mês", kpi.id]].dropna().sort_values("Mês")
    v = s[kpi.id].astype(float).tolist()
    if len(v) < 2:
        return ""
    lo, hi = min(v + ([alvo] if alvo is not None else [])), max(v + ([alvo] if alvo is not None else []))
    amp = (hi - lo) or 1.0
    larg, alt_, m = 100.0, 38.0, 4.0

    def y(val: float) -> float:
        return round(alt_ - m - (val - lo) / amp * (alt_ - 2 * m), 2)

    xs = [round(m + i * (larg - 2 * m) / (len(v) - 1), 2) for i in range(len(v))]
    pts = " ".join(f"{x},{y(val)}" for x, val in zip(xs, v))
    nao_escala = 'vector-effect="non-scaling-stroke"'
    pontos = "".join(f'<path d="M{x} {y(val)}h0" stroke="currentColor" stroke-width="4.5" stroke-linecap="round" '
                     f'{nao_escala}/>' for x, val in zip(xs, v))
    meta = (f'<line x1="0" x2="{larg}" y1="{y(alvo)}" y2="{y(alvo)}" stroke="{ui.VERDE}" stroke-width="1" '
            f'stroke-dasharray="3 3" {nao_escala}/>' if alvo is not None else "")
    return (f'<svg class="cm-spark" viewBox="0 0 {larg:g} {alt_:g}" preserveAspectRatio="none" width="100%" '
            f'height="{alt_:g}" style="opacity:.8" role="img" '
            f'aria-label="tendência mensal de {html.escape(kpi.nome)}">{meta}'
            f'<polyline points="{pts}" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" '
            f'{nao_escala}/>{pontos}</svg>')


def grade(kpis: list[ind.Kpi], atual: dict, anterior: dict, cad_metas: dict, serie: pd.DataFrame | None = None,
          colunas: int = 4, prefixo: str = "", link: bool = True) -> list[str]:
    ui.aplicar_css(CSS)
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
                   barras: bool = False, altura: int = 220, compacto: bool = False) -> alt.Chart:
    """Evolução mês a mês de um indicador, com a linha da meta.

    compacto: para gráficos pequenos — rotula só o último mês e usa poucos valores no eixo, sem sobreposição."""
    s = serie[["Mês", kpi.id]].dropna().copy()
    s["Rótulo"] = s[kpi.id].map(lambda v: ind.formatar(kpi, v))
    atual = pd.Timestamp(hoje_local()).to_period("M").start_time
    s["Mês txt"] = s["Mês"].map(lambda m: mes_pt(m) + ("*" if m >= atual else ""))   # * = mês em andamento
    eixo_y = alt.Axis(tickCount=3, labelFontSize=9, **({"format": "~s"} if kpi.unidade == "R$" else {})) \
        if compacto else alt.Axis()
    eixo_x = alt.Axis(labelAngle=0, labelOverlap="greedy", labelFontSize=9) if compacto else alt.Axis(labelAngle=0)
    base = alt.Chart(s).encode(x=alt.X("Mês txt:N", title=None, sort=list(s["Mês txt"]), axis=eixo_x),
                               y=alt.Y(f"{kpi.id}:Q", title=None, scale=alt.Scale(zero=barras), axis=eixo_y),
                               tooltip=[alt.Tooltip("Mês txt:N", title="Mês (* em andamento)"),
                                        alt.Tooltip("Rótulo:N", title=kpi.nome)])
    if barras:
        ch = base.mark_bar(color=cor, cornerRadiusEnd=3, size=10 if compacto else 18)
    else:
        ch = base.mark_line(color=cor, strokeWidth=2.4,
                            point=alt.OverlayMarkDef(size=28 if compacto else 50, filled=True, color=cor))
    if not compacto:
        ch = ch + base.mark_text(dy=-10, fontSize=10, color=ui.GRAFITE).encode(text="Rótulo:N")
    elif not barras and len(s):  # só o último ponto, à esquerda dele
        ch = ch + base.transform_filter(alt.datum["Mês txt"] == s["Mês txt"].iloc[-1]).mark_text(
            dy=-10, align="right", fontSize=10, fontWeight="bold", color=ui.GRAFITE).encode(text="Rótulo:N")
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
