import altair as alt
import pandas as pd
import streamlit as st

from central import bases, contexto, saude, ui
from central.leitura import IW38
from central.util import brl, inteiro, sem_acento

ui.cabecalho("Saúde dos ativos",
             "Índice de 0 a 100 por equipamento a partir das quebras, falhas analisadas, corretivas, backlog, "
             "preventivas, preditiva e custo — e a fila de ataque pelo risco (saúde × criticidade)")

if not ui.aviso_base(bases.iw38(), IW38):
    st.stop()

f = contexto.filtros_globais(periodo=False)
t = contexto.saude_ativos(f)
st.caption(f"Recorte: **{f.recorte or 'fábrica inteira'}** · eventos dos últimos 12 meses até hoje e pendências de "
           "hoje (o período dos filtros não se aplica aqui)")

with st.expander("Como o índice é calculado", icon=":material/help:"):
    st.markdown("Cada contribuinte tira pontos da saúde do equipamento, até o seu peso; a soma dos pesos é 100. "
                f"**Boa** ≥ {saude.LIMITES[saude.BOA]} · **Atenção** {saude.LIMITES[saude.ATENCAO]}–"
                f"{saude.LIMITES[saude.BOA] - 1} · **Crítica** < {saude.LIMITES[saude.ATENCAO]}. "
                "**Risco** = pontos perdidos × peso da criticidade (Alta 3, Média 2, Baixa 1, sem classe 1,5): "
                "a fila de ataque começa pelo equipamento crítico com a pior saúde.")
    st.dataframe(pd.DataFrame([{"Contribuinte": c.nome, "Peso": c.peso, "Regra": c.regra}
                               for c in saude.CONTRIBUINTES]), hide_index=True, width="stretch",
                 column_config={"Peso": st.column_config.NumberColumn(format="%d pts"),
                                "Regra": st.column_config.TextColumn(width="large")})
    st.caption("Criticidade: a do cadastro de equipamentos do site; sem ela, o código ABC do IH08 (A = Alta, "
               "B = Média, C = Baixa). Equipamentos desativados no IH08 ficam de fora.")

if not len(t):
    st.info("Nenhum equipamento com ordens no recorte.", icon=":material/search_off:")
    st.stop()

r = saude.resumo(t)
c = st.columns(5)
c[0].metric("Equipamentos", inteiro(r["ativos"]), border=True, delta_arrow="off",
            help="Equipamentos com ordem, quebra ou chamada de plano no recorte (desativados no IH08 ficam fora).")
c[1].metric("Saúde média", f"{r['media']:.0f}", border=True, delta_arrow="off")
c[2].metric("Saúde crítica", inteiro(r["criticos"]), f"{inteiro(r['criticos_alta'])} de crit. Alta",
            delta_color="off", border=True, delta_arrow="off")
c[3].metric("Em atenção", inteiro(r["atencao"]), border=True, delta_arrow="off")
c[4].metric("Em boa saúde", f"{r['boa_pct']:.0f}%".replace(".", ","), border=True, delta_arrow="off")

# ----------------------------------------------------------------------------
# Matriz criticidade × saúde e o que mais derruba a saúde
# ----------------------------------------------------------------------------
e, d = st.columns([3, 2])
with e, st.container(border=True):
    st.markdown("**Matriz criticidade × saúde** — o canto Alta × Crítica é a prioridade",
                help="Quantidade de equipamentos em cada combinação de criticidade e faixa de saúde.")
    m = saude.matriz(t)
    base = alt.Chart(m).encode(
        x=alt.X("Faixa:N", sort=saude.FAIXAS, title=None, axis=alt.Axis(labelAngle=0, orient="top")),
        y=alt.Y("Criticidade:N", sort=saude.CRITICIDADES, title=None))
    cor = alt.Color("Faixa:N", scale=alt.Scale(domain=list(saude.COR_FAIXA), range=list(saude.COR_FAIXA.values())),
                    legend=None)
    opac = alt.condition(alt.datum.Equipamentos > 0, alt.value(0.85), alt.value(0.12))
    ui.mostrar((base.mark_rect(cornerRadius=6).encode(color=cor, opacity=opac,
                                                       tooltip=["Criticidade:N", "Faixa:N", "Equipamentos:Q"])
                + base.mark_text(fontSize=16, fontWeight="bold", color="white").encode(text="Equipamentos:Q"))
               .properties(height=230))
with d, st.container(border=True):
    st.markdown("**O que mais derruba a saúde** — pontos perdidos nos equipamentos em atenção ou críticos",
                help="Soma dos pontos que cada contribuinte tirou dos equipamentos fora da faixa Boa.")
    ruins = t[t["Faixa"] != saude.BOA]
    if len(ruins):
        pts = pd.DataFrame([{"Contribuinte": cc.nome, "Pontos": float(ruins[f"pts_{cc.id}"].sum())}
                            for cc in saude.CONTRIBUINTES])
        pts = pts[pts["Pontos"] > 0]
        ui.mostrar(ui.grafico_barras_h(pts, "Contribuinte", "Pontos", cor=ui.LARANJA, altura=230))
    else:
        st.success("Todos os equipamentos do recorte estão em boa saúde.", icon=":material/verified:")

# ----------------------------------------------------------------------------
# Fila de ataque
# ----------------------------------------------------------------------------
st.markdown("#### :material/format_list_numbered: Fila de ataque · maior risco primeiro")
with ui.caixa_filtros():
    b1, b2, b3, b4 = st.columns([3, 2, 2, 2])
    busca = b1.text_input("Buscar equipamento", key="s_busca", placeholder="código, nome, área ou centro…")
    faixas = b2.pills("Faixa de saúde", saude.FAIXAS, selection_mode="multi", default=[saude.CRITICA, saude.ATENCAO],
                      key="s_faixa")
    crits = b3.multiselect("Criticidade", saude.CRITICIDADES, key="s_crit", placeholder="Todas")
    causas = b4.multiselect("Principal causa", sorted(t["Principal causa"].unique()), key="s_causa",
                            placeholder="Todas")
mask = pd.Series(True, index=t.index)
if busca.strip():
    hay = (t["Código"] + " " + t["Equipamento"] + " " + t["Área"] + " " + t["Centro"]).map(
        lambda s: sem_acento(s).upper())
    for termo in sem_acento(busca).upper().split():
        mask &= hay.str.contains(termo, regex=False)
if faixas:
    mask &= t["Faixa"].isin(faixas)
if crits:
    mask &= t["Criticidade"].replace("", "Sem classe").isin(crits)
if causas:
    mask &= t["Principal causa"].isin(causas)
vis = t[mask].reset_index(drop=True)
COLS = ["Código", "Equipamento", "Criticidade", "Saúde", "Faixa", "Risco", "Principal causa", "Quebras", "Falhas AF",
        "Corretivas", "Backlog atrasado", "Preventivas atrasadas", "Anomalias abertas", "Custo 12 meses",
        "Última falha", "Área", "Centro"]
st.caption(f"{inteiro(len(vis))} equipamento(s) · selecione uma linha para ver o que derruba a saúde dele")
ev = st.dataframe(
    vis[COLS], hide_index=True, width="stretch", height=ui.altura_tabela(420), on_select="rerun",
    selection_mode="single-row", key="s_tab",
    column_config={"Saúde": st.column_config.ProgressColumn("Saúde", format="%d", min_value=0, max_value=100),
                   "Risco": st.column_config.NumberColumn(format="%d"), "Custo 12 meses": ui.col_moeda("Custo 12 meses (R$)"),
                   "Última falha": ui.col_data(), "Equipamento": st.column_config.TextColumn(width="medium")})
c1, c2 = st.columns([1, 3])
with c1:
    ui.baixar(vis.drop(columns=[x for x in vis.columns if x.startswith("pts_")]), "saude_dos_ativos",
              "Baixar (Excel)")

sel = ev.selection.rows if ev and ev.selection else []
if not sel or sel[0] >= len(vis):
    c2.caption("Dica: comece pelos críticos de criticidade Alta — análise de falha, revisão do plano de manutenção "
               "e ataque ao backlog atrasado do equipamento.")
    st.stop()

linha = vis.iloc[sel[0]]
with c2:
    contexto.link_ficha(linha["Código"], f"Abrir ficha de {linha['Código']} · {str(linha['Equipamento'])[:40]}",
                        chave="s_ficha")
with st.container(border=True):
    st.markdown(f"**{linha['Código']} · {linha['Equipamento']}** — saúde **{linha['Saúde']:.0f}** "
                f"({linha['Faixa']}) · criticidade {linha['Criticidade'] or 'sem classe'} · risco {linha['Risco']:.0f}")
    g1, g2 = st.columns([3, 2])
    with g1:
        contrib = saude.contribuicao(linha)
        contrib["Restante"] = contrib["Peso"] - contrib["Pontos perdidos"]
        longo = contrib.melt(id_vars="Contribuinte", value_vars=["Pontos perdidos", "Restante"], var_name="Parte",
                             value_name="Pontos")
        ui.mostrar(alt.Chart(longo).mark_bar(height=16, cornerRadius=2).encode(
            y=alt.Y("Contribuinte:N", sort=[cc.nome for cc in saude.CONTRIBUINTES], title=None,
                    axis=alt.Axis(labelLimit=200)),
            x=alt.X("Pontos:Q", title="pontos do peso (perdidos em vermelho)", stack="zero"),
            color=alt.Color("Parte:N", scale=alt.Scale(domain=["Pontos perdidos", "Restante"],
                                                       range=[ui.VERMELHO, "#D9DEDC"]), legend=None),
            order=alt.Order("Parte:N", sort="ascending"),
            tooltip=["Contribuinte:N", "Parte:N", alt.Tooltip("Pontos:Q", format=".1f")]).properties(height=230))
    with g2:
        horas_af = f"{linha['Horas paradas (AF)']:.1f}".replace(".", ",")
        st.markdown(
            f"- **{inteiro(linha['Quebras'])}** quebra(s) e **{inteiro(linha['Falhas AF'])}** falha(s) registradas no "
            f"Gerenciador de AF ({horas_af} h paradas)\n"
            + f"- **{inteiro(linha['Corretivas'])}** ordem(ns) sem plano em 12 meses\n"
            + f"- **{inteiro(linha['Backlog atrasado'])}** ordem(ns) atrasada(s) e **{inteiro(linha['Preventivas atrasadas'])}**"
              " preventiva(s) atrasada(s) hoje\n"
            + f"- **{inteiro(linha['Anomalias abertas'])}** anomalia(s) preditiva(s) em aberto\n"
            + f"- custo de manutenção em 12 meses: **{brl(linha['Custo 12 meses'])}**")
    dd = contexto.dados(f)
    pend = dd.ordens[(dd.ordens["Equip. (chave)"] == linha["Código"]) & dd.ordens["Atrasada"]]
    if len(pend):
        st.markdown("**Ordens atrasadas do equipamento**")
        st.dataframe(pend.sort_values("Fim")[["Ordem", "Tipo", "Natureza", "Texto", "Situação", "Início", "Fim",
                                              "Centro de trabalho"]],
                     hide_index=True, width="stretch", height=ui.altura_tabela(240),
                     column_config={"Início": ui.col_data(), "Fim": ui.col_data("Prazo (fim-base)"),
                                    "Texto": st.column_config.TextColumn(width="large")})
