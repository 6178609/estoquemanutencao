from datetime import date

import altair as alt
import pandas as pd
import streamlit as st

from central import bases, contexto, planos, ui
from central.leitura import IP19
from central.util import brl, inteiro, pct, sem_acento

ui.cabecalho("Planos de manutenção · IP19",
             "Calendário semanal de cada plano entre as datas escolhidas, cruzado com as ordens do IW38 — atualiza sozinho")

base_ip19 = bases.ip19()
base_iw38 = bases.iw38()
iw38 = base_iw38.df

if base_ip19.erro:
    ui.aviso_base(base_ip19, IP19)
    st.stop()


@st.cache_data(show_spinner="Montando o calendário dos planos…", max_entries=6)
def chamadas(_ip19: pd.DataFrame | None, _iw38: pd.DataFrame | None, chave_cache: str) -> pd.DataFrame:
    origem = _ip19 if _ip19 is not None else planos.de_iw38(_iw38)
    return planos.classificar(origem, _iw38)


hoje = pd.Timestamp.now().normalize()
if base_ip19.df is not None:
    ui.aviso_base(base_ip19, IP19)
    fonte = f"IP19 de {ui.local(base_ip19.atualizado)}" + (" · cruzada com o IW38" if iw38 is not None else "")
elif iw38 is not None:
    st.info("A exportação da **IP19** ainda não foi encontrada nas pastas. Enquanto isso, o calendário mostra as "
            "**ordens do IW38 que têm plano** — só o que já virou ordem. Para ver também as chamadas futuras, "
            "salve o export da IP19 numa das pastas monitoradas (ou na Downloads).", icon=":material/info:")
    fonte = f"ordens com plano do IW38 de {ui.local(base_iw38.atualizado)}"
else:
    ui.aviso_base(base_ip19, IP19)
    st.stop()

chave_cache = "|".join([base_ip19.origem.arquivo.assinatura if base_ip19.origem else "-",
                        base_iw38.origem.arquivo.assinatura if base_iw38.origem else "-", f"{hoje:%Y-%m-%d}"])
ch = chamadas(base_ip19.df, iw38, chave_cache)
if ch.empty:
    st.warning("A base de planos não tem chamadas com data.")
    st.stop()

# ----------------------------------------------------------------------------
# Filtros (área não existe na IP19; centro e tipo vêm dos filtros globais)
# ----------------------------------------------------------------------------
fg = contexto.filtros_globais()
if fg.centros:
    ch = ch[ch["Centro de trabalho"].isin(fg.centros)]
if fg.tipos and "Tipo de ordem" in ch:
    ch = ch[ch["Tipo de ordem"].isin(fg.tipos) | (ch["Tipo de ordem"] == "")]
st.caption("O calendário usa o período próprio abaixo (pode incluir semanas futuras); centro de trabalho e tipo de "
           "ordem seguem os filtros globais da barra lateral.")
ano_atual = hoje.date().year
with ui.caixa_filtros():
    f = st.columns([3, 3, 2, 2, 2])
    with f[0]:
        ini, fim = ui.filtro_datas("p_faixa", "Data planejada (de / até)",
                                   (date(ano_atual, 1, 1), date(ano_atual, 12, 31)), ch["Data"],
                                   atalhos=["Mês atual", "Próximos 30 dias", "Próximos 90 dias", "Últimos 90 dias",
                                            "Ano atual", "Tudo"])
    busca = f[1].text_input("Buscar plano", placeholder="nº do plano, descrição, equipamento…", key="p_busca")
    doano = ch[ui.entre(ch["Data"], ini, fim)]
    centros = sorted(c for c in doano["Centro de trabalho"].unique() if c)
    sel_ctr = f[2].multiselect("Centro de trabalho", centros, key="p_ctr", placeholder="Todos")
    sel_sit = f[3].multiselect("Situação", planos.SITUACOES, key="p_sit", placeholder="Todas",
                               help="Mostra só os planos com alguma chamada nessa situação no período")
    atividades = sorted(a for a in doano["Atividade"].unique() if a) if "Atividade" in doano else []
    sel_atv = f[4].multiselect("Atividade", atividades, key="p_atv", placeholder="Todas",
                               help="Inspeção, preventiva, preditiva… (vem da situação da chamada na IP19)")

filtro = ch
if sel_atv:
    filtro = filtro[filtro["Atividade"].isin(sel_atv)]
if sel_ctr:
    filtro = filtro[filtro["Centro de trabalho"].isin(sel_ctr)]
if busca.strip():
    hay = (filtro["Chave"] + " " + filtro["Texto"] + " " + filtro["Equipamento"] + " " + filtro["Objeto técnico"]).map(
        lambda s: sem_acento(s).upper())
    m = pd.Series(True, index=filtro.index)
    for termo in sem_acento(busca).upper().split():
        m &= hay.str.contains(termo, regex=False)
    filtro = filtro[m]
if sel_sit:
    chaves = set(filtro[ui.entre(filtro["Data"], ini, fim) & filtro["Situação"].isin(sel_sit)]["Chave"])
    filtro = filtro[filtro["Chave"].isin(chaves)]
no_ano = filtro[ui.entre(filtro["Data"], ini, fim)]

# ----------------------------------------------------------------------------
# Indicadores
# ----------------------------------------------------------------------------
vencidas = no_ano[(no_ano["Data"] <= hoje) & (no_ano["Situação"] != planos.SALTADA)]
concl_venc = int((vencidas["Situação"] == planos.CONCLUIDA).sum())
c = st.columns(5)
c[0].metric("Planos no período", inteiro(no_ano["Chave"].nunique()), border=True, delta_arrow="off")
c[1].metric("Chamadas no período", inteiro(len(no_ano)), f"{inteiro((no_ano['Situação'] == planos.PROGRAMADA).sum())} ainda por vir",
            delta_color="off", border=True, delta_arrow="off")
c[2].metric("Aderência até hoje", pct(concl_venc, len(vencidas)), f"{inteiro(concl_venc)} de {inteiro(len(vencidas))} vencidas",
            delta_color="off", border=True, delta_arrow="off",
            help="Chamadas com data até hoje que foram concluídas (saltadas e canceladas não contam).")
c[3].metric("Atrasadas", inteiro((no_ano["Situação"] == planos.ATRASADA).sum()), border=True, delta_arrow="off")
c[4].metric("Custo das ordens", brl(no_ano["Custo real"].sum()) if iw38 is not None else "—",
            border=True, delta_arrow="off")

# ----------------------------------------------------------------------------
# Calendário
# ----------------------------------------------------------------------------
grade, situ = planos.montar_calendario(filtro, ini, fim)
semana_hoje = planos.coluna_da_semana(hoje.date(), ini, fim)  # rótulo da coluna de hoje, se estiver no período
legenda = " ".join(
    f'<span class="cm-chip" style="background:{planos.COR[s][0]};color:{planos.COR[s][1]};border:1px solid #DDE3E0">'
    f'{planos.SIMBOLO[s]} {s}</span>' for s in planos.SITUACOES)
st.markdown(f"**Calendário de {ui.descrever(ini, fim)}** · {inteiro(len(grade))} planos · fonte: {fonte}<br>{legenda}"
            + (f' <span class="cm-chip" style="border:2px solid {ui.VERDE}">semana atual: {semana_hoje}</span>' if semana_hoje else ""),
            unsafe_allow_html=True)

if grade.empty:
    st.info("Nenhum plano com chamada nesse período e filtro.")
    st.stop()

# planos com atraso primeiro; a grade de situações acompanha a mesma ordem
ordem_linhas = grade.sort_values(["Atrasadas", "Plano"], ascending=[False, True]).index
grade = grade.loc[ordem_linhas].reset_index(drop=True)
situ = situ.loc[ordem_linhas].reset_index(drop=True)
segundas = planos.semanas_entre(ini, fim)
cols_sem = planos.rotulos_semanas(segundas)
chave_vis = f"{ini:%Y%m%d}_{fim:%Y%m%d}"

aba_cal, aba_tab = st.tabs([":material/calendar_view_week: Calendário semanal", ":material/table: Tabela por semana"])

with aba_cal:
    st.caption("Uma linha por plano, uma coluna por semana do período (S01 = 1ª semana ISO do ano). A cor mostra a pior situação da "
               "semana; o número, quantas chamadas caíram nela. Passe o mouse para ver datas e ordens; clique numa "
               "linha para abrir o plano.")
    cel = planos.celulas(filtro, ini, fim, list(grade["Plano"]), dict(zip(grade["Plano"], grade["Descrição"])))
    rotulos = [f"{p} · {d[:34]}" for p, d in zip(grade["Plano"], grade["Descrição"])]
    meses = planos.marcas_dos_meses(segundas)
    expr = "{" + ",".join(f"'{w}':'{m}'" for w, m in meses.items()) + "}[datum.value] || ''"
    celular = ui.eh_celular()
    alto = 20 * len(rotulos)
    sel = alt.selection_point(fields=["Chave"], name="plano", on="click", clear="dblclick")
    x = alt.X("Semana:O", title=None, scale=alt.Scale(domain=cols_sem, paddingInner=0.12),
              axis=alt.Axis(orient="top", labelAngle=0, labelExpr=expr, values=list(meses), ticks=False,
                            domain=False, labelFontWeight="bold"))
    y = alt.Y("Plano:N", title=None, sort=rotulos, scale=alt.Scale(domain=rotulos, paddingInner=0.12),
              axis=alt.Axis(labelLimit=150 if celular else 300, ticks=False, domain=False))
    fundo = alt.Chart(pd.DataFrame([{"Plano": r, "Semana": w} for r in rotulos for w in cols_sem])).mark_rect(
        color="#EEF1EF", cornerRadius=2).encode(x=x, y=y)
    marcas = alt.Chart(cel).mark_rect(cornerRadius=2, stroke="white", strokeWidth=0.5).encode(
        x=x, y=y,
        color=alt.Color("Situação:N", legend=None,
                        scale=alt.Scale(domain=planos.SITUACOES, range=[planos.COR[s][1] if s in (planos.CONCLUIDA, planos.ABERTA,
                                        planos.ATRASADA) else ("#B8C0BC" if s == planos.PROGRAMADA else "#D9DEDB")
                                        for s in planos.SITUACOES])),
        opacity=alt.condition(sel, alt.value(1), alt.value(0.35)),
        tooltip=[alt.Tooltip("Plano:N"), alt.Tooltip("Semana:O"), alt.Tooltip("Período:N"),
                 alt.Tooltip("Situação:N"), alt.Tooltip("Chamadas:Q"), alt.Tooltip("Datas:N"), alt.Tooltip("Ordens:N")],
    ).add_params(sel)
    numeros = alt.Chart(cel[cel["Chamadas"] > 1]).mark_text(fontSize=9, color="white", fontWeight="bold").encode(
        x=x, y=y, text="Chamadas:Q")
    camadas = [fundo, marcas, numeros]
    if semana_hoje:
        camadas.append(alt.Chart(pd.DataFrame({"Semana": [semana_hoje]})).mark_rule(
            color=ui.VERDE, strokeWidth=2, strokeDash=[3, 2]).encode(x=x))
    largura = max(len(cols_sem) * 14, 700) if celular or len(cols_sem) > 60 else "container"
    grafico = alt.layer(*camadas).properties(height=alto, width=largura).configure_view(stroke=None)
    with st.container(height=min(640, alto + 70) if len(rotulos) > 25 else None, border=False):
        ev_cal = st.altair_chart(grafico, width="stretch" if not celular else "content", on_select="rerun",
                                 key=f"p_cal_{chave_vis}", selection_mode="plano")
    escolhido_cal = None
    try:
        pts = ev_cal.selection.get("plano") if ev_cal and ev_cal.selection else None
        if pts:
            escolhido_cal = pts[0].get("Chave")
    except AttributeError:
        pass

with aba_tab:
    st.caption("Mesma informação em tabela: ✓ concluída · ● em aberto · ! atrasada · ○ programada · – saltada. "
               "Ciclo com * = estimado pelo intervalo entre as chamadas. Clique numa linha para abrir o plano.")
    ordem_cols = ["Plano", "Descrição", "Atrasadas", *cols_sem, "Equipamento", "Centro", "Ciclo", "Chamadas"]
    config = {
        "Plano": st.column_config.TextColumn(pinned=True, width="small"),
        "Descrição": st.column_config.TextColumn(pinned=True, width="medium"),
        "Atrasadas": st.column_config.NumberColumn("Atras.", width="small", help="Chamadas atrasadas no período"),
        "Equipamento": st.column_config.TextColumn(width="medium"),
    }
    for col, seg in zip(cols_sem, segundas):
        config[col] = st.column_config.TextColumn(
            col, width=38 if "/" not in col else 52, alignment="center",
            help=f"Semana de {seg:%d/%m} a {(seg + pd.Timedelta(days=6)):%d/%m/%Y}")
    ev = st.dataframe(planos.estilo(grade[ordem_cols], situ[ordem_cols], semana_hoje), hide_index=True, width="stretch",
                      height=ui.altura_tabela(min(620, 38 + 35 * len(grade))), column_config=config,
                      on_select="rerun", selection_mode="single-row", key=f"p_grade_{chave_vis}")
    ui.baixar(grade[ordem_cols], f"calendario_planos_{ini:%Y%m%d}_{fim:%Y%m%d}", "Baixar calendário (Excel)")
    linhas_tab = ev.selection.rows if ev and ev.selection else []
    escolhido_tab = grade.iloc[linhas_tab[0]]["Plano"] if linhas_tab else None

# ----------------------------------------------------------------------------
# Carga por semana
# ----------------------------------------------------------------------------
carga = planos.carga_semanal(filtro, ini, fim)
if len(carga):
    with st.container(border=True):
        st.markdown("**Chamadas por semana** — carga de trabalho dos planos no período")
        ordem = [s for s in planos.SITUACOES if s in set(carga["Situação"])]
        barras = alt.Chart(carga).mark_bar().encode(
            x=alt.X("Semana:O", title="Semana", sort=cols_sem, scale=alt.Scale(domain=cols_sem),
                    axis=alt.Axis(labelAngle=0, values=cols_sem[::4])),
            y=alt.Y("Chamadas:Q", title=None, stack=True),
            color=alt.Color("Situação:N", sort=ordem, legend=alt.Legend(orient="top", title=None),
                            scale=alt.Scale(domain=planos.SITUACOES,
                                            range=[ui.VERDE, ui.AZUL, ui.VERMELHO, "#C9CFCC", "#8C9491", "#E3E7E5"])),
            order=alt.Order("ordem:Q"),
            tooltip=["Semana:O", "Situação:N", "Chamadas:Q"],
        ).transform_calculate(ordem=f"indexof({ordem}, datum['Situação'])")
        camadas = [barras]
        if semana_hoje:
            camadas.append(alt.Chart(pd.DataFrame({"Semana": [semana_hoje]})).mark_rule(color=ui.GRAFITE, strokeDash=[4, 3])
                           .encode(x=alt.X("Semana:O", sort=cols_sem, scale=alt.Scale(domain=cols_sem))))
        ui.mostrar(alt.layer(*camadas).properties(height=220))

# ----------------------------------------------------------------------------
# Detalhe do plano
# ----------------------------------------------------------------------------
plano = escolhido_cal or escolhido_tab
if plano:
    d = filtro[filtro["Chave"] == plano].sort_values("Data")
    st.divider()
    st.subheader(f"Plano {plano} — {dict(zip(grade['Plano'], grade['Descrição'])).get(plano, '')}")
    k = st.columns(4)
    venc = d[(d["Data"] <= hoje) & (d["Situação"] != planos.SALTADA)]
    k[0].metric("Chamadas (todas as datas)", inteiro(len(d)), border=True, delta_arrow="off")
    k[1].metric("Aderência até hoje", pct(int((venc["Situação"] == planos.CONCLUIDA).sum()), len(venc)), border=True, delta_arrow="off")
    k[2].metric("Próxima chamada", d.loc[d["Data"] > hoje, "Data"].min().strftime("%d/%m/%Y")
                if (d["Data"] > hoje).any() else "—", border=True, delta_arrow="off")
    k[3].metric("Custo das ordens", brl(d["Custo real"].sum()), border=True, delta_arrow="off")
    cols = [c for c in ["Data planejada", "Data chamada", "Data conclusão", "Semana", "Situação", "Ordem", "Situação IW38",
                        "Custo real", "Tipo de programação", "Atividade", "Pacote", "Operações", "Horas",
                        "Objeto técnico", "Centro de trabalho"] if c in d and (d[c] != "").any()]
    st.dataframe(d[cols].sort_values("Data planejada", ascending=False), hide_index=True, width="stretch",
                 height=ui.altura_tabela(320),
                 column_config={"Data planejada": ui.col_data(), "Data chamada": ui.col_data(), "Data conclusão": ui.col_data(),
                                "Custo real": ui.col_moeda(),
                                "Horas": st.column_config.NumberColumn(format="%.1f")})
