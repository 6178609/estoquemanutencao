"""Visão "Gestão de ativos" da aba Equipamentos: inventário, criticidade, custo, cobertura preventiva, ciclo de vida
e lacunas do cadastro (a conta fica em central/ativos.py)."""

from __future__ import annotations

from datetime import date

import altair as alt
import pandas as pd
import streamlit as st

from . import ativos, bases, contexto, ui
from . import indicadores as ind
from .util import brl, brl_curto, hoje_local, inteiro, sem_acento

COR_RECOMENDACAO = {ativos.SUBSTITUIR: ui.VERMELHO, ativos.CRIAR_PLANO: ui.LARANJA, ativos.ATACAR: ui.AMARELO,
                    ativos.CLASSIFICAR: ui.AZUL, ativos.MANTER: ui.VERDE}
COLS_TABELA = ["Código", "Equipamento", "Situação", "Criticidade", "Área", "Local de instalação", "Saúde",
               "Custo 12 meses", "Quebras 12 meses", "MTBF (dias)", "Planos preventivos", "Ordens pendentes",
               "Idade (anos)", "Garantia", "Recomendação", "Origem"]


@st.cache_data(show_spinner="Montando o inventário de ativos…", max_entries=4)
def _inventario(chave: str) -> pd.DataFrame:
    eq = bases.equipamentos().df
    cad = bases.ler_cadastro(bases.ARQ_CAD_EQUIP)
    if bases.iw38().df is None:          # sem ordens: só o IH08 e o cadastro do site
        return ativos.inventario(hoje_local(), equip=eq, cad_eq=cad, chamadas=contexto.chamadas_classificadas())
    f = contexto.Filtros(date.min, date.min)
    d = contexto.dados(f)
    return ativos.inventario(d.hoje, equip=eq, ordens=d.ordens, cad_eq=cad, quebras=d.memo("quebras", ind.quebras),
                             chamadas=d.chamadas, saude=contexto.saude_ativos(f))


def inventario() -> pd.DataFrame:
    return _inventario(contexto._chave())


def _pct(v) -> str:
    return "—" if v is None else f"{v:.0f}%"


def _kpis(r: dict) -> None:
    c = st.columns(3) + st.columns(3)
    c[0].metric("Ativos no inventário", inteiro(r["ativos"]), f"+ {inteiro(r['desativados'])} desativados",
                delta_color="off", delta_arrow="off", border=True,
                help="Equipamentos do IH08, do cadastro do site e das ordens do IW38 que não estão desativados.")
    c[1].metric("Criticidade Alta", inteiro(r["alta"]), f"{inteiro(r['sem_criticidade'])} sem criticidade",
                delta_color="off", delta_arrow="off", border=True,
                help="Criticidade do cadastro do site; sem ela, o código ABC do IH08 (A = Alta, B = Média, C = Baixa).")
    c[2].metric("Cobertura preventiva", _pct(r["cobertura_criticos"]), f"Alta: {_pct(r['cobertura_alta'])}",
                delta_color="off", delta_arrow="off", border=True,
                help="% dos ativos de criticidade Alta e Média com plano de manutenção preventiva (IP19 ou ordens de "
                     "plano no IW38 dos últimos 12 meses). Referência de mercado: 100% dos críticos cobertos.")
    c[3].metric("Ativos parados", inteiro(r["parados"]), border=True, delta_arrow="off",
                help="Ativos com a situação “Parado” no cadastro do site.")
    c[4].metric("Custo de manutenção", brl_curto(r["custo_12m"]), "últimos 12 meses", delta_color="off",
                delta_arrow="off", border=True)
    c[5].metric("Avaliar substituição", inteiro(r["substituir"]),
                f"{inteiro(r['garantia_vencendo'])} garantia(s) vencendo", delta_color="off", delta_arrow="off",
                border=True,
                help=f"Ativos a avaliar substituição: custo de 12 meses ≥ {ativos.LIMITE_SUBSTITUICAO:.0%} do valor de reposição, ou vida útil "
                     "vencida com saúde crítica (reparar ou substituir).")


def _pareto(t: pd.DataFrame) -> None:
    st.markdown("**Bad actors · Pareto do custo de manutenção (12 meses)**",
                help="Os 15 ativos que mais custaram e o % acumulado do custo da planta: poucos ativos costumam "
                     "concentrar a maior parte do gasto.")
    p = ativos.pareto_custo(t)
    if not len(p):
        st.caption("Sem custo de manutenção nos últimos 12 meses.")
        return
    st.caption(f"Os {len(p)} primeiros somam **{p['% acumulado'].iloc[-1]:.0f}%** do custo de manutenção dos ativos "
               "em 12 meses.")
    p = p.assign(_custo=p["Custo 12 meses"].map(brl), _acum=p["% acumulado"].map(lambda v: f"{v:.0f}%"))
    base = alt.Chart(p).encode(x=alt.X("Código:N", sort=list(p["Código"]), title=None,
                                       axis=alt.Axis(labelAngle=-40, labelLimit=90)))
    tip = [alt.Tooltip("Código:N"), alt.Tooltip("Equipamento:N"), alt.Tooltip("Criticidade:N"),
           alt.Tooltip("_custo:N", title="Custo 12 meses"), alt.Tooltip("_acum:N", title="% acumulado")]
    barras = base.mark_bar(color=ui.AZUL, cornerRadiusEnd=3).encode(
        y=alt.Y("Custo 12 meses:Q", title="custo (R$)", axis=alt.Axis(format="~s")), tooltip=tip)
    linha = base.mark_line(color=ui.LARANJA, point=True).encode(
        y=alt.Y("% acumulado:Q", title="% acumulado", scale=alt.Scale(domain=[0, 100])), tooltip=tip)
    ui.mostrar(alt.layer(barras, linha).resolve_scale(y="independent").properties(height=260))


def _por_area(t: pd.DataFrame) -> None:
    st.markdown("**Ativos por área e criticidade**")
    a = t[t["Situação"] != ativos.DESATIVADO].assign(
        Área=lambda d: d["Área"].replace("", "(sem área)"),
        Criticidade=lambda d: d["Criticidade"].replace("", "Sem classe"))
    if not len(a):
        st.caption("Nenhum ativo.")
        return
    g = a.groupby(["Área", "Criticidade"]).size().reset_index(name="Ativos")
    ordem = list(a["Área"].value_counts().index[:15])
    g = g[g["Área"].isin(ordem)]
    ui.mostrar(alt.Chart(g).mark_bar(height=16).encode(
        y=alt.Y("Área:N", sort=ordem, title=None, axis=alt.Axis(labelLimit=160)),
        x=alt.X("Ativos:Q", title=None, stack="zero"),
        color=alt.Color("Criticidade:N", scale=alt.Scale(domain=["Alta", "Média", "Baixa", "Sem classe"],
                                                         range=[ui.VERMELHO, ui.LARANJA, ui.VERDE, ui.CINZA]),
                        legend=alt.Legend(orient="top", title=None)),
        order=alt.Order("Criticidade:N"),
        tooltip=["Área:N", "Criticidade:N", "Ativos:Q"]).properties(height=max(160, 26 * len(ordem))))


def _recomendacoes(t: pd.DataFrame) -> None:
    st.markdown("**O que fazer com os ativos**",
                help="Recomendação de cada ativo (a primeira regra que vale): avaliar substituição → criar plano "
                     "preventivo nos críticos sem plano → atacar a causa das falhas (saúde crítica) → classificar a "
                     "criticidade → manter.")
    a = t[t["Situação"] != ativos.DESATIVADO]
    cont = a["Recomendação"].value_counts().reindex(ativos.RECOMENDACOES, fill_value=0).reset_index()
    cont.columns = ["Recomendação", "Ativos"]
    ui.mostrar(alt.Chart(cont).mark_bar(height=18, cornerRadiusEnd=3).encode(
        y=alt.Y("Recomendação:N", sort=ativos.RECOMENDACOES, title=None, axis=alt.Axis(labelLimit=180)),
        x=alt.X("Ativos:Q", title=None),
        color=alt.Color("Recomendação:N", scale=alt.Scale(domain=list(COR_RECOMENDACAO),
                                                          range=list(COR_RECOMENDACAO.values())), legend=None),
        tooltip=["Recomendação:N", "Ativos:Q"]).properties(height=180))


def _lacunas(t: pd.DataFrame) -> None:
    st.markdown("**Lacunas do cadastro**",
                help="% dos ativos (não desativados) com cada informação. Ciclo de vida (fabricante, ano, valor de "
                     "reposição) se preenche em Cadastro de equipamentos → Editar.")
    c = ativos.completude(t)
    st.dataframe(c, hide_index=True, width="stretch",
                 column_config={"Preenchido %": st.column_config.ProgressColumn("Preenchido", format="%.0f%%",
                                                                                min_value=0, max_value=100),
                                "Faltando": st.column_config.NumberColumn("Faltando", format="localized")})


def _ciclo_de_vida(t: pd.DataFrame) -> None:
    a = t[t["Situação"] != ativos.DESATIVADO]
    com_ano = a[a["Idade (anos)"].notna()]
    fora_vida = a[a["Vida restante (anos)"].notna() & (a["Vida restante (anos)"] <= 0)]
    garantia = a[a["Garantia"].isin(ativos.GARANTIAS[:2])]
    c = st.columns(4)
    c[0].metric("Com ano de instalação", inteiro(len(com_ano)), f"de {inteiro(len(a))} ativos", delta_color="off",
                delta_arrow="off", border=True)
    c[1].metric("Idade média", f"{com_ano['Idade (anos)'].mean():.0f} anos" if len(com_ano) else "—",
                border=True, delta_arrow="off")
    c[2].metric("Vida útil vencida", inteiro(len(fora_vida)), border=True, delta_arrow="off",
                help="Idade ≥ vida útil cadastrada.")
    c[3].metric("Em garantia", inteiro(len(garantia)),
                f"{inteiro((garantia['Garantia'] == ativos.GARANTIAS[1]).sum())} vencendo em "
                f"{ativos.AVISO_GARANTIA_DIAS} dias", delta_color="off", delta_arrow="off", border=True)
    alerta = a[(a["Recomendação"] == ativos.SUBSTITUIR) | (a["Garantia"] == ativos.GARANTIAS[1])
               | (a["Vida restante (anos)"].notna() & (a["Vida restante (anos)"] <= 1))]
    if not len(com_ano) and not a["Valor de reposição"].notna().any() and not len(garantia):
        st.info("Nenhum ativo tem ciclo de vida cadastrado ainda. Em **Cadastro de equipamentos → Editar**, preencha "
                "fabricante, modelo, ano de instalação, vida útil, garantia e valor de reposição — com eles a gestão "
                "mostra idade, garantias a vencer e quando vale mais substituir do que reparar.",
                icon=":material/info:")
        return
    st.markdown("**Atenção no ciclo de vida** — substituição a avaliar, garantia vencendo ou fim da vida útil")
    if not len(alerta):
        st.caption("Nenhum ativo em alerta de ciclo de vida.")
        return
    cols = ["Código", "Equipamento", "Criticidade", "Fabricante", "Modelo", "Ano de instalação", "Idade (anos)",
            "Vida útil (anos)", "Vida restante (anos)", "Garantia até", "Valor de reposição", "Custo 12 meses",
            "Custo ÷ reposição %", "Recomendação"]
    st.dataframe(alerta[cols], hide_index=True, width="stretch", height=ui.altura_tabela(260),
                 column_config={"Garantia até": ui.col_data(), "Valor de reposição": ui.col_moeda("Reposição (R$)"),
                                "Custo 12 meses": ui.col_moeda("Custo 12 meses (R$)"),
                                "Custo ÷ reposição %": st.column_config.NumberColumn(format="%.0f%%")})


def mostrar(cadastra: bool, ao_cadastrar, ao_ficha) -> None:
    """ao_cadastrar(código) abre o formulário do cadastro; ao_ficha(código) abre a análise pelas ordens (None = quem
    só vê a Gestão de ativos: sem os botões)."""
    t = inventario()
    if not len(t):
        with st.container(border=True):
            st.markdown("#### :material/precision_manufacturing: Nenhum ativo encontrado")
            st.caption("Coloque o export do **IH08** (cadastro de equipamentos) ou do **IW38** na pasta do site, ou "
                       "cadastre os equipamentos em **Cadastro de equipamentos**.")
        return

    _kpis(ativos.resumo(t))

    e, d = st.columns([3, 2])
    with e, st.container(border=True):
        _pareto(t)
    with d, st.container(border=True):
        _recomendacoes(t)

    aba_inv, aba_area, aba_vida, aba_lac = st.tabs([":material/inventory: Inventário",
                                                    ":material/account_tree: Por área",
                                                    ":material/hourglass_bottom: Ciclo de vida",
                                                    ":material/rule: Lacunas do cadastro"])
    with aba_area:
        _por_area(t)
    with aba_vida:
        _ciclo_de_vida(t)
    with aba_lac:
        _lacunas(t)

    with aba_inv:
        with ui.caixa_filtros():
            f1 = st.columns([3, 2, 2, 2])
            busca = f1[0].text_input("Buscar ativo", key="at_busca",
                                     placeholder="código, nome, local, fabricante, nº de série…")
            areas = f1[1].multiselect("Área", sorted(x for x in t["Área"].unique() if x), key="at_area",
                                      placeholder="Todas")
            crits = f1[2].multiselect("Criticidade", ["Alta", "Média", "Baixa", "Sem classe"], key="at_crit",
                                      placeholder="Todas")
            sits = f1[3].multiselect("Situação", ativos.SITUACOES, key="at_sit", placeholder="Todas (sem desativados)")
            f2 = st.columns([5, 2, 2])
            recs = f2[0].pills("Recomendação", ativos.RECOMENDACOES, selection_mode="multi", key="at_rec")
            so_sem_plano = f2[1].toggle("Só sem plano preventivo", key="at_sem_plano")
            so_site = f2[2].toggle("Só cadastrados no site", key="at_site")

        m = pd.Series(True, index=t.index)
        if busca.strip():
            hay = (t["Código"] + " " + t["Equipamento"] + " " + t["Local de instalação"] + " " + t["Área"] + " "
                   + t["Fabricante"] + " " + t["Modelo"] + " " + t["Nº de série"]).map(lambda s: sem_acento(s).upper())
            for termo in sem_acento(busca).upper().split():
                m &= hay.str.contains(termo, regex=False)
        if areas:
            m &= t["Área"].isin(areas)
        if crits:
            m &= t["Criticidade"].replace("", "Sem classe").isin(crits)
        m &= t["Situação"].isin(sits) if sits else t["Situação"] != ativos.DESATIVADO
        if recs:
            m &= t["Recomendação"].isin(recs)
        if so_sem_plano:
            m &= ~t["Coberto por plano"]
        if so_site:
            m &= t["Origem"] != "SAP"
        vis = t[m].reset_index(drop=True)

        st.caption(f"{inteiro(len(vis))} de {inteiro(len(t))} ativo(s) · selecione uma linha para abrir a ficha ou "
                   "editar o cadastro")
        ev = st.dataframe(
            vis[COLS_TABELA], hide_index=True, width="stretch", height=ui.altura_tabela(420), on_select="rerun",
            selection_mode="single-row", key="at_tabela",
            column_config={"Saúde": st.column_config.ProgressColumn("Saúde", format="%d", min_value=0, max_value=100),
                           "Custo 12 meses": ui.col_moeda("Custo 12 meses (R$)"),
                           "MTBF (dias)": st.column_config.NumberColumn(format="%d"),
                           "Planos preventivos": st.column_config.NumberColumn("Planos"),
                           "Ordens pendentes": st.column_config.NumberColumn("Pendentes"),
                           "Equipamento": st.column_config.TextColumn(width="medium")})
        ui.baixar(vis, "gestao_de_ativos", "Baixar inventário (Excel)", chave="at_baixar")

        sel = ev.selection.rows if ev and ev.selection else []
        if not sel or sel[0] >= len(vis):
            return
        r = vis.iloc[sel[0]]
        tag = r["Código"]
        with st.container(border=True):
            st.markdown(f"**{tag} · {r['Equipamento'] or '—'}** — {r['Situação']} · criticidade "
                        f"{r['Criticidade'] or 'sem classe'} · {r['Recomendação']}")
            info = [f"Local: {r['Local de instalação'] or '—'}", f"Área: {r['Área'] or '—'}",
                    f"Custo total: {brl(r['Custo total'])}", f"Planos preventivos: {inteiro(r['Planos preventivos'])}"]
            if r["Fabricante"] or r["Modelo"]:
                info.append(f"Fabricante/modelo: {' '.join(x for x in (r['Fabricante'], r['Modelo']) if x)}")
            if pd.notna(r["Ano de instalação"]):
                info.append(f"Instalado em {int(r['Ano de instalação'])} ({int(r['Idade (anos)'])} anos)")
            if pd.notna(r["Valor de reposição"]):
                info.append(f"Reposição: {brl(r['Valor de reposição'])}")
            st.caption(" · ".join(info))
            b = st.columns([1.3, 1.3, 3])
            if ao_ficha and bases.iw38().df is not None:
                b[0].button("Abrir ficha (ordens)", icon=":material/assignment:", key="at_ficha", width="stretch",
                            on_click=ao_ficha, args=(tag,))
            if cadastra:
                no_site = r["Origem"] != "SAP"
                b[1].button("Editar cadastro" if no_site else "Cadastrar no site", icon=":material/edit:",
                            key="at_cad", width="stretch", type="primary", on_click=ao_cadastrar, args=(tag,))
