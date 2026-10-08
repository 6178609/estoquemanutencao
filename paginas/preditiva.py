import altair as alt
import pandas as pd
import streamlit as st

from central import bases, contexto, ui
from central import indicadores as ind
from central import preditiva as pr
from central.leitura import IW38
from central.util import brl, inteiro, sem_acento

ui.cabecalho("Preditiva · SEMEQ",
             "Anomalias apontadas pela preditiva (notas IW28) e a tratativa pelas ordens (IW38): técnica, achado, "
             "equipamento, prazo e quem tratou")

if bases.iw38().df is None and bases.notas().df is None:
    ui.aviso_base(bases.iw38(), IW38)
    st.stop()

f = contexto.filtros_globais()
cad = contexto.metas()
d = contexto.dados(f)
an = d.memo("semeq", ind.anomalias_semeq)
if not len(an):
    st.info("Nenhuma nota ou ordem com **SEMEQ** no texto foi encontrada nas bases carregadas (IW28 e IW38). "
            "As anomalias da preditiva são reconhecidas pelo padrão SEMEQ-<técnica>-<nº>-<achado>.")
    st.stop()
atual, anterior = contexto.resultados(f)
serie = contexto.serie_mensal(f)
hoje = pd.Timestamp.today().normalize()
st.caption("Uma anomalia = técnica + nº do código SEMEQ (ex.: SEMEQ-AVB-333). A nota registra a detecção e a ordem é a "
           "tratativa; período pela data de detecção. Técnicas: AVB = vibração, AOL = análise de óleo, "
           "TMP = termografia.")

ks = [k for k in ind.KPIS if k.grupo == ind.PREDITIVA]
contexto.grade(ks, atual, anterior, cad, serie, colunas=5, prefixo="pd-", link=False)

vivas = an[an["Situação"] != pr.CANCELADA]
per = vivas[ui.entre(vivas["Detecção"], f.ini, f.fim)]
abertas = vivas[vivas["Situação"].isin(pr.ABERTAS)]

c = st.columns(4)
c[0].metric("Equipamentos com anomalia", inteiro(per["Equipamento"].replace("", pd.NA).nunique()), border=True,
            delta_arrow="off")
n_eq = per[per["Equipamento"] != ""].groupby("Equipamento").size()
c[1].metric("Reincidentes", inteiro((n_eq > 1).sum()), "mais de uma anomalia no período", delta_color="off",
            border=True, delta_arrow="off")
c[2].metric("Custo das tratativas", brl(per["Custo real"].sum()), border=True, delta_arrow="off")
c[3].metric("HH apontadas", f"{per['HH apontadas'].fillna(0).sum():,.0f} h".replace(",", "."),
            "IW47 nas ordens das anomalias", delta_color="off", border=True, delta_arrow="off")

# ----------------------------------------------------------------------------
# Fila: abertas, mais antigas primeiro
# ----------------------------------------------------------------------------
if len(abertas):
    with st.container(border=True):
        atr = int((abertas["Situação"] == pr.ATRASADA).sum())
        st.markdown(f":red[:material/warning:] **{inteiro(len(abertas))} anomalia(s) em aberto** · {inteiro(atr)} atrasada(s), "
                    f"{inteiro((abertas['Situação'] == pr.SEM_ORDEM).sum())} sem ordem — as mais antigas primeiro")
        fila = abertas.sort_values("Dias em aberto", ascending=False)
        st.dataframe(fila[["Código", "Técnica", "Achado", "Objeto técnico", "Equipamento", "Situação", "Detecção",
                           "Dias em aberto", "Nota", "Ordem", "Status SAP", "Fim previsto",
                           "Centro de trabalho"]].head(300)
                     .style.map(lambda s: f"color: {pr.COR.get(s, '')}; font-weight: 700" if s in pr.COR else "",
                                subset=["Situação"]),
                     hide_index=True, width="stretch", height=ui.altura_tabela(300),
                     column_config={"Detecção": ui.col_data(), "Fim previsto": ui.col_data("Fim previsto (data-base)"),
                                    "Dias em aberto": st.column_config.ProgressColumn(
                                        format="%d", min_value=0, max_value=float(fila["Dias em aberto"].max() or 1),
                                        color="red")})

# ----------------------------------------------------------------------------
# Gráficos
# ----------------------------------------------------------------------------
if len(per):
    e, dd = st.columns(2)
    with e, st.container(border=True):
        st.markdown("**Anomalias por mês** — por técnica")
        m = per.dropna(subset=["Detecção"]).assign(Mês=lambda x: x["Detecção"].dt.to_period("M").dt.to_timestamp())
        q = m.groupby(["Mês", "Técnica"]).size().reset_index(name="Anomalias").sort_values("Mês")
        q["Mês txt"] = q["Mês"].map(contexto.mes_pt)
        ui.mostrar(alt.Chart(q).mark_bar().encode(
            x=alt.X("Mês txt:N", sort=list(dict.fromkeys(q["Mês txt"])), title=None, axis=alt.Axis(labelAngle=0)),
            y=alt.Y("Anomalias:Q", title=None),
            color=alt.Color("Técnica:N", legend=alt.Legend(orient="top", title=None),
                            scale=alt.Scale(range=[ui.AZUL, ui.LARANJA, ui.VERMELHO, ui.CIANO, ui.LIMA])),
            tooltip=["Mês txt:N", "Técnica:N", "Anomalias:Q"]).properties(height=260))
    with dd, st.container(border=True):
        st.markdown("**Situação por técnica**")
        q = per.groupby(["Técnica", "Situação"]).size().reset_index(name="Anomalias")
        ui.mostrar(alt.Chart(q).mark_bar(height=22).encode(
            y=alt.Y("Técnica:N", title=None, axis=alt.Axis(labelOverlap=False)), x=alt.X("Anomalias:Q", title=None),
            color=alt.Color("Situação:N", scale=alt.Scale(domain=pr.SITUACOES, range=[pr.COR[s] for s in pr.SITUACOES]),
                            legend=alt.Legend(orient="top", title=None)),
            tooltip=["Técnica:N", "Situação:N", "Anomalias:Q"]).properties(height=200))

    e, dd = st.columns(2)
    with e, st.container(border=True):
        st.markdown("**Pareto dos achados** — modos de falha mais apontados")
        ach = per["Achado"].replace("", "(não informado)").value_counts().head(12).rename_axis("Achado")
        ui.mostrar(ui.grafico_barras_h(ach.reset_index(name="Anomalias"), "Achado", "Anomalias", ui.LARANJA))
    with dd, st.container(border=True):
        st.markdown("**Equipamentos com mais anomalias** — reincidência")
        top = (per[per["Equipamento"] != ""].groupby("Equipamento")
               .agg(Nome=("Objeto técnico", "first"), Anomalias=("Código", "size"),
                    Abertas=("Situação", lambda s: int(s.isin(pr.ABERTAS).sum())))
               .reset_index().sort_values(["Anomalias", "Abertas"], ascending=False).head(12))
        if len(top):
            top["Rótulo"] = top["Equipamento"] + " · " + top["Nome"].str[:30]
            ui.mostrar(ui.grafico_barras_h(top, "Rótulo", "Anomalias", ui.AZUL))

# ----------------------------------------------------------------------------
# Tabela
# ----------------------------------------------------------------------------
st.markdown("#### :material/sensors: Anomalias")
with ui.caixa_filtros():
    l1 = st.columns([3, 2, 2, 2])
    busca = l1[0].text_input("Buscar", key="pd_busca", placeholder="código, achado, equipamento, nota, ordem…")
    sel_tec = l1[1].multiselect("Técnica", sorted(an["Técnica"].unique()), key="pd_tec", placeholder="Todas")
    sel_sit = l1[2].multiselect("Situação", pr.SITUACOES, key="pd_sit", placeholder="Todas")
    todas_datas = l1[3].toggle("Todas as datas", key="pd_todas", help="Desligado: só anomalias detectadas no período.")
tab = an if todas_datas else an[ui.entre(an["Detecção"], f.ini, f.fim)]
mk = pd.Series(True, index=tab.index)
if busca.strip():
    hay = (tab["Código"] + " " + tab["Achado"] + " " + tab["Equipamento"] + " " + tab["Objeto técnico"] + " "
           + tab["Nota"] + " " + tab["Ordem"] + " " + tab["Tratado por"]).map(lambda s: sem_acento(s).upper())
    for termo in sem_acento(busca).upper().split():
        mk &= hay.str.contains(termo, regex=False)
if sel_tec:
    mk &= tab["Técnica"].isin(sel_tec)
if sel_sit:
    mk &= tab["Situação"].isin(sel_sit)
vis = tab[mk].reset_index(drop=True)
COLS = ["Código", "Técnica", "Achado", "Situação", "Status SAP", "Detecção", "Objeto técnico", "Equipamento", "Área",
        "Centro de trabalho", "Nota", "Ordem", "Tipo", "Fim previsto", "Fim real", "Dias para tratar",
        "Dias em aberto", "Tratado por", "HH apontadas", "Custo real"]
st.caption(f"{inteiro(len(vis))} anomalia(s) · selecione uma linha para abrir a ficha do equipamento")
ev = st.dataframe(vis[COLS].style.map(lambda s: f"color: {pr.COR.get(s, '')}; font-weight: 700" if s in pr.COR else "",
                                      subset=["Situação"]),
                  hide_index=True, width="stretch", height=ui.altura_tabela(420), on_select="rerun",
                  selection_mode="single-row", key=f"pd_tab_{f.ini}_{f.fim}_{todas_datas}_{len(vis)}",
                  column_config={"Detecção": ui.col_data(), "Fim previsto": ui.col_data(), "Fim real": ui.col_data(),
                                 "Custo real": ui.col_moeda("Custo real (R$)"), "HH apontadas": st.column_config.NumberColumn(format="%.1f"),
                                 "Achado": st.column_config.TextColumn(width="medium")})
ui.baixar(vis[COLS], "anomalias_semeq", "Baixar anomalias (Excel)")
linhas = ev.selection.rows if ev and ev.selection else []
if linhas and linhas[0] < len(vis) and vis.iloc[linhas[0]]["Equipamento"]:
    contexto.link_ficha(vis.iloc[linhas[0]]["Equipamento"], f"Abrir ficha de {vis.iloc[linhas[0]]['Equipamento']}",
                        chave="pd_ficha")
