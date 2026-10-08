import altair as alt
import pandas as pd
import streamlit as st

from central import bases, contexto, ui
from central import indicadores as ind
from central.leitura import IW38
from central.util import brl, brl_curto, inteiro, pct

ui.cabecalho("Custos de manutenção",
             "Custo real das ordens (IW38) por mês, tipo de manutenção, área, centro de trabalho e equipamento")

base = bases.iw38()
if not ui.aviso_base(base, IW38):
    st.stop()

f = contexto.filtros_globais()
cad = contexto.metas()
d = contexto.dados(f)
atual, anterior = contexto.resultados(f)
serie = contexto.serie_mensal(f)
tipos = d.tipos
st.caption(f"Recorte: **{f.desc}** · ordens canceladas não entram")

ks = [k for k in ind.KPIS if k.grupo == ind.CUSTOS]
contexto.grade(ks, atual, anterior, cad, serie, colunas=3, prefixo="cu-", link=False)

o = f.periodo(d.ordens)
o = o[o["Situação"] != "Cancelada"].copy()
if not len(o):
    st.info("Sem ordens no recorte.")
    st.stop()
o["Classe"] = o["Tipo"].map({t: ind.classe_tipo(t, tipos) or "Sem classe" for t in o["Tipo"].unique()})
o["Tipo (nome)"] = o["Tipo"].map(lambda t: ind.rotulo_tipo(t, tipos))
total = float(o["Custo real"].sum())
meses = max(1.0, ((pd.Timestamp(f.fim) - pd.Timestamp(f.ini)).days + 1) / 30.44)

c = st.columns(5)
c[0].metric("Custo total", brl_curto(total), brl(total), delta_color="off", border=True, delta_arrow="off")
c[1].metric("Com plano", brl_curto(o.loc[o["Com plano"], "Custo real"].sum()),
            pct(o.loc[o["Com plano"], "Custo real"].sum(), total), delta_color="off", border=True, delta_arrow="off")
c[2].metric("Backlog", brl_curto(o.loc[~o["Com plano"], "Custo real"].sum()),
            pct(o.loc[~o["Com plano"], "Custo real"].sum(), total), delta_color="off", border=True, delta_arrow="off")
if ind.tem_emergencial(d):
    emerg = float(o.loc[o["Classe"] == "Emergencial", "Custo real"].sum())
    c[3].metric("Emergencial", brl_curto(emerg), pct(emerg, total), delta_color="off", border=True, delta_arrow="off")
else:
    c[3].metric("Emergencial", "—", "IW38 sem tipo emergencial", delta_color="off", border=True, delta_arrow="off",
                help="O IW38 carregado não tem ordens de tipo emergencial (ex.: YM11). Exporte com todos os tipos.")
c[4].metric("Ordens com custo", inteiro((o["Custo real"] != 0).sum()), f"de {inteiro(len(o))}",
            delta_color="off", border=True, delta_arrow="off")

# ----------------------------------------------------------------------------
with st.container(border=True):
    st.markdown("**Custo por mês** — por classe de manutenção · linha = orçamento mensal (meta do custo médio mensal)")
    mes = o.dropna(subset=["Data"]).assign(Mês=lambda x: x["Data"].dt.to_period("M").dt.to_timestamp())
    q = mes.groupby(["Mês", "Classe"])["Custo real"].sum().reset_index().sort_values("Mês")
    q["Mês txt"] = q["Mês"].map(contexto.mes_pt)
    ch = alt.Chart(q).mark_bar().encode(
        x=alt.X("Mês txt:N", title=None, sort=list(dict.fromkeys(q["Mês txt"])), axis=alt.Axis(labelAngle=0)),
        y=alt.Y("Custo real:Q", title="R$", axis=alt.Axis(format="~s")),
        color=alt.Color("Classe:N", legend=alt.Legend(orient="top", title=None),
                        scale=alt.Scale(domain=ind.CLASSES_TIPO + ["Sem classe"],
                                        range=[ui.VERDE, ui.CIANO, ui.LIMA, "#7E57C2", ui.LARANJA, ui.VERMELHO,
                                               ui.AZUL, ui.CINZA, "#BDBDBD"])),
        tooltip=[alt.Tooltip("Mês txt:N", title="Mês"), "Classe:N", alt.Tooltip("Custo real:Q", format=",.2f")])
    orc = ind.meta(ind.POR_ID["custo"], cad)
    if orc:
        ch = ch + alt.Chart(pd.DataFrame({"y": [orc]})).mark_rule(color=ui.VERMELHO, strokeDash=[5, 4]).encode(y="y:Q")
    ui.mostrar(ch.properties(height=300))
    if not orc:
        st.caption("Defina o orçamento mensal em Configuração › Metas e parâmetros (meta do indicador Custo médio mensal).")

e, dd = st.columns(2)
with e, st.container(border=True):
    st.markdown("**Custo por tipo de ordem**")
    t = o.groupby("Tipo (nome)")["Custo real"].sum().nlargest(12).rename_axis("Tipo").reset_index(name="Custo")
    ui.mostrar(ui.grafico_barras_h(t, "Tipo", "Custo", ui.AZUL, ",.2f"))
with dd, st.container(border=True):
    st.markdown("**Custo por área**")
    a = o.assign(Área=o["Localização"].replace("", "—")).groupby("Área")["Custo real"].sum().nlargest(10)
    a = a.rename_axis("Área").reset_index(name="Custo")
    ui.mostrar(ui.grafico_barras_h(a, "Área", "Custo", ui.VERDE, ",.2f"))

e, dd = st.columns(2)
with e, st.container(border=True):
    st.markdown("**Custo por centro de trabalho**")
    ct = o.assign(Centro=o["Centro de trabalho"].replace("", "—")).groupby("Centro")["Custo real"].sum().nlargest(12)
    ct = ct.rename_axis("Centro").reset_index(name="Custo")
    ui.mostrar(ui.grafico_barras_h(ct, "Centro", "Custo", ui.CIANO, ",.2f"))
with dd, st.container(border=True):
    st.markdown("**Pareto de custo por equipamento** — 80% do gasto")
    eq = o[o["Equip. (chave)"] != ""].groupby("Equip. (chave)").agg(
        Equipamento=("Objeto técnico", "first"), Custo=("Custo real", "sum"), Ordens=("Ordem", "size"),
        Backlog=("Com plano", lambda s: int((~s).sum()))).reset_index().sort_values("Custo", ascending=False)
    eq = eq[eq["Custo"] > 0]
    if len(eq):
        eq["% acumulado"] = eq["Custo"].cumsum() / eq["Custo"].sum() * 100
        n80 = int((eq["% acumulado"] < 80).sum()) + 1
        st.markdown(f"**{inteiro(n80)}** de {inteiro(len(eq))} equipamentos com custo respondem por 80% do gasto "
                    f"com equipamento.")
        top = eq.head(12).assign(Nome=lambda x: (x["Equip. (chave)"] + " · " + x["Equipamento"].str[:28]))
        ui.mostrar(ui.grafico_barras_h(top, "Nome", "Custo", ui.LARANJA, ",.2f"))

st.markdown("#### :material/receipt_long: Equipamentos e ordens que mais custaram")
e, dd = st.columns(2)
with e:
    st.markdown("**Por equipamento**")
    if len(eq):
        eq["Custo médio por ordem"] = eq["Custo"] / eq["Ordens"]
        ev = st.dataframe(eq[["Equip. (chave)", "Equipamento", "Custo", "Ordens", "Backlog", "Custo médio por ordem",
                              "% acumulado"]].head(200), hide_index=True, width="stretch", height=ui.altura_tabela(360),
                          on_select="rerun", selection_mode="single-row", key="cu_eq",
                          column_config={"Equip. (chave)": "Código", "Custo": ui.col_moeda("Custo (R$)"),
                                         "Custo médio por ordem": ui.col_moeda("Custo médio por ordem (R$)"),
                                         "% acumulado": st.column_config.NumberColumn(format="%.1f%%")})
        linhas = ev.selection.rows if ev and ev.selection else []
        if linhas:
            contexto.link_ficha(eq.iloc[linhas[0]]["Equip. (chave)"], chave="cu_ficha")
        else:
            st.caption("Selecione um equipamento para abrir a ficha.")
with dd:
    st.markdown("**Por ordem**")
    top_o = o.nlargest(200, "Custo real")[["Ordem", "Tipo (nome)", "Natureza", "Texto", "Equip. (chave)", "Custo real",
                                          "Data", "Situação"]]
    st.dataframe(top_o, hide_index=True, width="stretch", height=ui.altura_tabela(360),
                 column_config={"Custo real": ui.col_moeda("Custo real (R$)"), "Data": ui.col_data(), "Tipo (nome)": "Tipo",
                                "Equip. (chave)": "Equipamento", "Texto": st.column_config.TextColumn(width="medium")})
    ui.baixar(top_o, "ordens_mais_caras", "Baixar (Excel)", chave="cu_baixar_o")
meses_txt = f"{meses:.1f}".replace(".", ",")      # só o nº de meses: o valor em R$ já vem formatado (1.234,56)
st.caption(f"Custo médio mensal no período: {brl(total / meses)} ({meses_txt} meses)")
