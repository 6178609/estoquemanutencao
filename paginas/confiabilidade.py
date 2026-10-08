import altair as alt
import pandas as pd
import streamlit as st

from central import bases, contexto, ui
from central import indicadores as ind
from central.leitura import NOTAS
from central.util import brl, inteiro, sem_acento

ui.cabecalho("Confiabilidade · quebras, MTBF e MTTR",
             "Análise de falhas do pilar Manutenção Profissional: onde quebra, quanto tempo leva para reparar e o que se repete")

if not ui.aviso_base(bases.notas(), NOTAS):
    st.stop()
if bases.iw38().df is None:
    st.info("Coloque o export do IW38 na pasta para cruzar as quebras com as ordens.")
    st.stop()

f = contexto.filtros_globais()
cad = contexto.metas()
d = contexto.dados(f)
atual, anterior = contexto.resultados(f)
serie = contexto.serie_mensal(f)
st.caption(f"Recorte: **{f.desc}** · quebra = nota Y1 da IW28 convertida em ordem YM11")

ks = [k for k in ind.KPIS if k.grupo == ind.CONFIABILIDADE]
contexto.grade(ks, atual, anterior, cad, serie, colunas=5, prefixo="c-", link=False)

q_all = ind.quebras(d)
q = q_all[ui.entre(q_all["Data"], f.ini, f.fim)].copy() if len(q_all) else q_all
if not len(q):
    st.info("Nenhuma quebra (nota Y1 convertida em ordem YM11) no recorte.")
    st.stop()
dias = (pd.Timestamp(f.fim) - pd.Timestamp(f.ini)).days + 1

# ----------------------------------------------------------------------------
# Evolução
# ----------------------------------------------------------------------------
e, dd = st.columns(2)
with e, st.container(border=True):
    st.markdown("**Quebras por mês**", help=ind.POR_ID["quebras"].formula)
    ui.mostrar(contexto.grafico_mensal(serie, ind.POR_ID["quebras"], ind.meta(ind.POR_ID["quebras"], cad),
                                       ui.LARANJA, barras=True))
with dd, st.container(border=True):
    st.markdown("**MTTR por mês** (horas de reparo por quebra)", help=ind.POR_ID["mttr"].formula)
    if serie["mttr"].notna().sum():
        ui.mostrar(contexto.grafico_mensal(serie, ind.POR_ID["mttr"], ind.meta(ind.POR_ID["mttr"], cad), ui.AZUL))
    else:
        st.caption("Sem horas de reparo das quebras no recorte (nota sem ordem ou ordem sem apontamento).")
    cob = q["Horas de reparo"].notna().mean() * 100
    st.caption(f"Cobertura: {cob:.0f}% das quebras têm horas de reparo (duração da parada na nota, apontamento na "
               "IW47 da ordem ou trabalho no IW38OP).")

# ----------------------------------------------------------------------------
# Pareto
# ----------------------------------------------------------------------------
DIM = {"Equipamento": "Equip. (chave)", "Local de instalação": "Local de instalação",
       "Centro de trabalho": "Centro de trabalho", "Área": "Localização", "Tipo de nota": "Tipo de nota"}
with st.container(border=True):
    p1, p2 = st.columns([3, 2])
    p1.markdown("**Pareto das quebras** — os poucos itens que concentram a maior parte das falhas (80/20)")
    dim = p2.segmented_control("Agrupar por", list(DIM), default="Equipamento", key="c_dim",
                               label_visibility="collapsed") or "Equipamento"
    col = DIM[dim]
    base = q[q[col] != ""]
    if dim == "Equipamento":
        nomes = base.groupby(col)["Objeto técnico"].first()
    par = base[col].value_counts().rename_axis("Item").reset_index(name="Quebras")
    par["% acumulado"] = par["Quebras"].cumsum() / par["Quebras"].sum() * 100
    n80 = int((par["% acumulado"] < 80).sum()) + 1
    par = par.head(25)
    par["Rótulo"] = par["Item"].map(lambda i: f"{i} · {nomes.get(i, '')[:28]}" if dim == "Equipamento" else i)
    ordem_x = list(par["Rótulo"])
    x = alt.X("Rótulo:N", sort=ordem_x, title=None, axis=alt.Axis(labelAngle=-50, labelLimit=190, labelOverlap=False,
                                                                 labelFontSize=10))
    barras = alt.Chart(par).mark_bar(color=ui.LARANJA, cornerRadiusTopLeft=3, cornerRadiusTopRight=3).encode(
        x=x, y=alt.Y("Quebras:Q", title="Quebras", axis=alt.Axis(format="d", tickMinStep=1)),   # contagem: sem 0,5
        tooltip=["Rótulo:N", "Quebras:Q", alt.Tooltip("% acumulado:Q", format=".1f")])
    linha = alt.Chart(par).mark_line(color=ui.GRAFITE, point=True).encode(
        x=x, y=alt.Y("% acumulado:Q", title="% acumulado", scale=alt.Scale(domain=[0, 100])))
    regra = alt.Chart(pd.DataFrame({"y": [80]})).mark_rule(color=ui.VERMELHO, strokeDash=[4, 4]).encode(y="y:Q")
    ui.mostrar(alt.layer(barras, alt.layer(linha, regra)).resolve_scale(y="independent").properties(height=420))
    st.caption(f"**{inteiro(n80)}** {dim.lower()}(s) concentram 80% das {inteiro(len(base))} quebras com {dim.lower()} "
               f"informado — foco para análise de falha (5 porquês / Ishikawa) e plano de ação.")

# ----------------------------------------------------------------------------
# Bad actors: confiabilidade por equipamento
# ----------------------------------------------------------------------------
st.markdown("#### :material/precision_manufacturing: Confiabilidade por equipamento")
eq = q[q["Equip. (chave)"] != ""]
ordens_per = f.periodo(d.ordens)
custo_eq = ordens_per.groupby("Equip. (chave)")["Custo real"].sum()
ordens_eq = ordens_per.groupby("Equip. (chave)").size()
tab = eq.groupby("Equip. (chave)").agg(
    Equipamento=("Objeto técnico", "first"), Local=("Local de instalação", "first"), Área=("Localização", "first"),
    Quebras=("Nota", "size"), Reincidências=("Reincidente", "sum"), Reparo_h=("Horas de reparo", "sum"),
    MTTR=("Horas de reparo", "mean"), ClasseA=("Classe A", "max"), Última=("Data", "max")).reset_index()
tab["MTBF (dias)"] = dias / tab["Quebras"]
tab["Custo no período"] = tab["Equip. (chave)"].map(custo_eq).fillna(0.0)
tab["Ordens no período"] = tab["Equip. (chave)"].map(ordens_eq).fillna(0).astype(int)
crit_cad = {k: (v or {}).get("criticidade", "") for k, v in d.cad_eq.items()}
abc = bases.equipamentos().df
abc = dict(zip(abc["Equipamento"], abc["Código ABC"])) if abc is not None else {}
tab["ABC"] = tab["Equip. (chave)"].map(abc).fillna("")
tab["Criticidade"] = [crit_cad.get(k) or bases.ABC_PARA_CRITICIDADE.get(a, "") for k, a in zip(tab["Equip. (chave)"],
                                                                                             tab["ABC"])]
tab = tab.rename(columns={"Equip. (chave)": "Código", "Reparo_h": "Horas de reparo", "MTTR": "MTTR (h)"})
tab = tab.drop(columns=["ClasseA"]).sort_values(["Quebras", "Horas de reparo"], ascending=False).reset_index(drop=True)

b1, b2, b3 = st.columns([3, 2, 2])
busca = b1.text_input("Buscar equipamento", key="c_busca", placeholder="código, nome ou local…")
sel_crit = b2.multiselect("Criticidade", ["Alta", "Média", "Baixa"], key="c_crit", placeholder="Todas")
so_reinc = b3.toggle("Só com reincidência", key="c_reinc")
m = pd.Series(True, index=tab.index)
if busca.strip():
    hay = (tab["Código"] + " " + tab["Equipamento"] + " " + tab["Local"]).map(lambda s: sem_acento(s).upper())
    for termo in sem_acento(busca).upper().split():
        m &= hay.str.contains(termo, regex=False)
if sel_crit:
    m &= tab["Criticidade"].isin(sel_crit)
if so_reinc:
    m &= tab["Reincidências"] > 0
vis = tab[m].reset_index(drop=True)
COLS = ["Código", "Equipamento", "Criticidade", "ABC", "Área", "Quebras", "Reincidências", "MTBF (dias)", "MTTR (h)",
        "Horas de reparo", "Ordens no período", "Custo no período", "Última", "Local"]
ev = st.dataframe(vis[COLS], hide_index=True, width="stretch", height=ui.altura_tabela(380), on_select="rerun",
                  selection_mode="single-row", key="c_tab",
                  column_config={"MTBF (dias)": st.column_config.NumberColumn(format="%.0f"),
                                 "MTTR (h)": st.column_config.NumberColumn(format="%.1f"),
                                 "Horas de reparo": st.column_config.NumberColumn(format="%.1f"),
                                 "Custo no período": ui.col_moeda("Custo no período (R$)"), "Última": ui.col_data("Última quebra"),
                                 "Quebras": st.column_config.ProgressColumn(
                                     "Quebras", format="%d", min_value=0, max_value=int(tab["Quebras"].max() or 1))})
c1, c2 = st.columns([1, 3])
with c1:
    ui.baixar(vis[COLS], "confiabilidade_equipamentos", "Baixar (Excel)")
linhas = ev.selection.rows if ev and ev.selection else []
if linhas:
    escolhido = vis.iloc[linhas[0]]
    with c2:
        contexto.link_ficha(escolhido["Código"], f"Abrir ficha de {escolhido['Código']} · {escolhido['Equipamento'][:40]}")
    hist = q_all[q_all["Equip. (chave)"] == escolhido["Código"]].sort_values("Data", ascending=False)
    st.markdown(f"**Quebras de {escolhido['Código']}** (todas as datas)")
    st.dataframe(hist[["Nota", "Data", "Tipo de nota", "Descrição", "Ordem", "Horas de reparo", "Dias desde a anterior",
                       "Reincidente", "Notificador"]], hide_index=True, width="stretch",
                 column_config={"Data": ui.col_data(), "Descrição": st.column_config.TextColumn(width="large")})
else:
    c2.caption("Selecione uma linha para ver as quebras do equipamento e abrir a ficha.")

# ----------------------------------------------------------------------------
# Matriz de criticidade, dia da semana e reincidências
# ----------------------------------------------------------------------------
e, dd = st.columns(2)
with e, st.container(border=True):
    st.markdown("**Matriz criticidade × frequência de quebras**",
                help="Equipamentos de criticidade Alta com muitas quebras são a prioridade de ataque (quadrante vermelho).")
    if len(tab):
        mt = tab.assign(Criticidade=tab["Criticidade"].replace("", "Sem classe"),
                        Faixa=pd.cut(tab["Quebras"], [0, 1, 3, 6, 10**6], labels=["1", "2–3", "4–6", "7 ou mais"]))
        mt = mt.groupby(["Criticidade", "Faixa"], observed=False).size().reset_index(name="Equipamentos")
        heat = alt.Chart(mt).encode(
            x=alt.X("Faixa:O", title="Quebras no período", sort=["1", "2–3", "4–6", "7 ou mais"]),
            y=alt.Y("Criticidade:N", sort=["Alta", "Média", "Baixa", "Sem classe"], title=None))
        ui.mostrar((heat.mark_rect(cornerRadius=4).encode(
            color=alt.Color("Equipamentos:Q", scale=alt.Scale(scheme="orangered"), legend=None),
            tooltip=["Criticidade:N", "Faixa:O", "Equipamentos:Q"])
            + heat.mark_text(fontSize=13, fontWeight="bold").encode(text="Equipamentos:Q")).properties(height=200))
with dd, st.container(border=True):
    st.markdown("**Quebras por dia da semana**")
    dias_sem = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"]
    ds = q.assign(Dia=q["Data"].dt.dayofweek.map(dict(enumerate(dias_sem))))["Dia"].value_counts()
    ds = ds.reindex(dias_sem, fill_value=0).rename_axis("Dia").reset_index(name="Quebras")
    ui.mostrar(alt.Chart(ds).mark_bar(color=ui.LARANJA, cornerRadiusTopLeft=3, cornerRadiusTopRight=3).encode(
        x=alt.X("Dia:N", sort=dias_sem, title=None, axis=alt.Axis(labelAngle=0)), y=alt.Y("Quebras:Q", title=None, axis=alt.Axis(format="d", tickMinStep=1)),
        tooltip=["Dia:N", "Quebras:Q"]).properties(height=200))

with st.container(border=True):
    st.markdown("**Reincidências** — quebra no mesmo equipamento em até 30 dias da anterior",
                help="Reincidência indica reparo que não eliminou a causa: candidata a análise de falha e "
                     "a revisão do plano de manutenção.")
    rc = q[q["Reincidente"]].sort_values("Data", ascending=False)
    st.caption(f"{inteiro(len(rc))} reincidências em {inteiro(rc['Equip. (chave)'].nunique())} equipamentos no período")
    st.dataframe(rc[["Data", "Equip. (chave)", "Objeto técnico", "Dias desde a anterior", "Descrição", "Nota", "Ordem",
                     "Centro de trabalho"]].head(300), hide_index=True, width="stretch", height=ui.altura_tabela(300),
                 column_config={"Data": ui.col_data(), "Equip. (chave)": "Código",
                                "Descrição": st.column_config.TextColumn(width="large")})

st.caption(f"Custo total das ordens dos equipamentos que quebraram no período: {brl(tab['Custo no período'].sum())}.")
