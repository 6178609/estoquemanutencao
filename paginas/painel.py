import io

import altair as alt
import pandas as pd
import streamlit as st

from central import bases, contexto, ui
from central import indicadores as ind
from central.leitura import IW38
from central.util import brl, inteiro

ui.cabecalho("Painel WCM · Manutenção Profissional",
             "Indicadores do pilar com meta, farol e tendência — cada cartão leva à aba onde ele é detalhado")

base = bases.iw38()
if not ui.aviso_base(base, IW38):
    st.stop()

f = contexto.filtros_globais()
cad = contexto.metas()
atual, anterior = contexto.resultados(f)
serie = contexto.serie_mensal(f)
a_ini, a_fim = ind.periodo_anterior(f.ini, f.fim)
st.caption(f"Recorte: **{f.desc}** · variações contra {ui.descrever(a_ini, a_fim)} · passe o mouse no título de "
           "cada indicador para ver a fórmula")

# ----------------------------------------------------------------------------
# Índice WCM
# ----------------------------------------------------------------------------
cores = {k.id: ind.farol(k, atual.get(k.id), ind.meta(k, cad)) for k in ind.KPIS}
n = {c: sum(v == c for v in cores.values()) for c in (ind.VERDE, ind.AMARELO, ind.VERMELHO, ind.NEUTRO)}
com_meta = n[ind.VERDE] + n[ind.AMARELO] + n[ind.VERMELHO]
indice = (n[ind.VERDE] + 0.5 * n[ind.AMARELO]) / com_meta * 100 if com_meta else None
cor_indice = ui.VERDE if (indice or 0) >= 80 else ("#F2B705" if (indice or 0) >= 60 else ui.VERMELHO)
st.markdown(contexto.CSS, unsafe_allow_html=True)
c = st.columns([1.4, 1, 1, 1, 1])
with c[0], st.container(border=True):
    st.markdown(f'<div class="cm-kpi-t">Índice WCM do pilar</div><div class="cm-indice" style="color:{cor_indice}">'
                f'{"—" if indice is None else f"{indice:.0f}%"}</div>', unsafe_allow_html=True,
                help="(indicadores na meta + metade dos em atenção) ÷ indicadores com meta. Metas em Configuração › "
                     "Metas e parâmetros.")
for col, (cor, nome) in zip(c[1:], [(ind.VERDE, "Na meta"), (ind.AMARELO, "Atenção"),
                                     (ind.VERMELHO, "Fora da meta"), (ind.NEUTRO, "Sem meta definida")]):
    with col, st.container(border=True, key=f"kpi-{cor}-resumo"):
        st.markdown(f'<div class="cm-kpi-t"><span class="cm-dot" style="background:{contexto.COR_FAROL[cor]}"></span>'
                    f'{nome}</div><div class="cm-kpi-v">{n[cor]}</div>', unsafe_allow_html=True)

VISOES = ["Indicadores", "Scorecard por área", "Scorecard por centro de trabalho", "Evolução mensal",
          "Pontos de atenção"]
visao = st.segmented_control("Visão", VISOES, default=VISOES[0], key="p_visao", label_visibility="collapsed") or VISOES[0]
ICONES = {ind.CONFIABILIDADE: ":material/health_and_safety:", ind.PLANEJAMENTO: ":material/event_available:",
          ind.MAO_DE_OBRA: ":material/engineering:", ind.CUSTOS: ":material/payments:",
          ind.SUPRIMENTOS: ":material/inventory_2:"}
CHAVE_SCORE = ["quebras", "mtbf", "mttr", "reincidencia", "pct_plano", "pct_emergencial", "no_prazo", "idade_backlog",
               "hh", "pct_hh_plano", "custo", "pct_custo_corr"]

# ----------------------------------------------------------------------------
if visao == "Indicadores":
    for grupo in ind.GRUPOS:
        ks = [k for k in ind.KPIS if k.grupo == grupo]
        st.markdown(f"#### {ICONES[grupo]} {grupo}")
        contexto.grade(ks, atual, anterior, cad, serie, colunas=4)

elif visao in ("Scorecard por área", "Scorecard por centro de trabalho"):
    por_area = visao == "Scorecard por área"
    o = f.ordens(base.df)
    o = f.periodo(o)
    campo = "Localização" if por_area else "Centro de trabalho"
    topo = o[o[campo] != ""][campo].value_counts().head(10 if por_area else 14).index.tolist()
    if not topo:
        st.info("Sem ordens no recorte para montar o scorecard.")
        st.stop()
    valores = contexto.por_dimensao(f, "areas" if por_area else "centros", topo)
    total = {"TOTAL DO RECORTE": atual}
    ks = [ind.POR_ID[k] for k in CHAVE_SCORE]
    st.caption(f"{len(topo)} {'áreas' if por_area else 'centros de trabalho'} com mais ordens no período · verde = na meta, "
               "amarelo = até 10% da meta, vermelho = fora · indicadores de suprimentos não têm área")
    st.dataframe(contexto.scorecard({**valores, **total}, ks, cad, "Área" if por_area else "Centro de trabalho"),
                 hide_index=True, width="stretch")
    # ranking visual
    k_sel = st.selectbox("Comparar pelo indicador", ks, index=4, format_func=lambda k: k.nome, key="p_rank")
    dfr = pd.DataFrame({"Nome": list(valores), "Valor": [v.get(k_sel.id) for v in valores.values()]}).dropna()
    if len(dfr):
        alvo = ind.meta(k_sel, cad)
        dfr["Farol"] = dfr["Valor"].map(lambda v: ind.farol(k_sel, v, alvo))
        dfr["Rótulo"] = dfr["Valor"].map(lambda v: ind.formatar(k_sel, v))
        b = alt.Chart(dfr).encode(
            y=alt.Y("Nome:N", sort="-x" if k_sel.sentido > 0 else "x", title=None),
            x=alt.X("Valor:Q", title=k_sel.nome), tooltip=["Nome:N", alt.Tooltip("Rótulo:N", title=k_sel.nome)])
        ch = b.mark_bar(cornerRadiusEnd=3, height=18).encode(
            color=alt.Color("Farol:N", legend=None, scale=alt.Scale(domain=list(contexto.COR_FAROL),
                                                                     range=list(contexto.COR_FAROL.values()))))
        ch = ch + b.mark_text(align="left", dx=4, fontSize=11).encode(text="Rótulo:N")
        if alvo is not None:
            ch = ch + alt.Chart(pd.DataFrame({"m": [alvo]})).mark_rule(color=ui.VERDE, strokeDash=[5, 4]).encode(x="m:Q")
        ui.mostrar(ch.properties(height=max(160, 28 * len(dfr))))

elif visao == "Evolução mensal":
    ks = [k for k in ind.KPIS if k.mensal]
    st.caption("Últimos 12 meses até o fim do período · linha verde tracejada = meta")
    for i in range(0, len(ks), 2):
        cols = st.columns(2)
        for col, k in zip(cols, ks[i:i + 2]):
            with col, st.container(border=True):
                st.markdown(f"**{k.nome}** · {k.grupo}", help=k.formula)
                if k.id in serie and serie[k.id].notna().sum():
                    cor = ui.LARANJA if k.sentido < 0 else ui.AZUL
                    ui.mostrar(contexto.grafico_mensal(serie, k, ind.meta(k, cad), cor,
                                                       barras=k.unidade in ("un", "h", "R$")))
                else:
                    st.caption("Sem dados para este indicador no recorte.")

else:  # Pontos de atenção
    d = contexto.dados(f)
    vermelhos = [k for k in ind.KPIS if cores[k.id] == ind.VERMELHO]
    amarelos = [k for k in ind.KPIS if cores[k.id] == ind.AMARELO]
    with st.container(border=True):
        st.markdown("**Indicadores fora da meta**")
        if not vermelhos and not amarelos:
            st.success("Todos os indicadores com meta estão dentro dela no recorte.", icon=":material/verified:")
        for k in vermelhos + amarelos:
            alvo = ind.meta(k, cad)
            cols = st.columns([5, 1.2])
            simbolo = ":red[:material/error:]" if k in vermelhos else ":orange[:material/warning:]"
            cols[0].markdown(f"{simbolo} **{k.nome}**: {ind.formatar(k, atual.get(k.id))} "
                             f"(meta {'≥' if k.sentido > 0 else '≤'} {ind.formatar(k, alvo)}) — {k.formula}")
            cols[1].page_link(k.pagina, label="Detalhar", icon=":material/arrow_forward:")
    e, dd = st.columns(2)
    with e, st.container(border=True):
        st.markdown("**Equipamentos com mais quebras no período** (bad actors)")
        q = ind.quebras(d)
        q = q[ui.entre(q["Data"], f.ini, f.fim) & (q["Equip. (chave)"] != "")] if len(q) else q
        if len(q):
            t = (q.groupby("Equip. (chave)").agg(Equipamento=("Objeto técnico", "first"), Quebras=("Nota", "size"),
                                                  Reincidentes=("Reincidente", "sum"))
                 .reset_index().nlargest(8, "Quebras"))
            st.dataframe(t, hide_index=True, width="stretch",
                         column_config={"Equip. (chave)": "Código"})
            st.page_link("paginas/confiabilidade.py", label="Análise de confiabilidade", icon=":material/arrow_forward:")
        else:
            st.caption("Nenhuma quebra registrada no período.")
    with dd, st.container(border=True):
        st.markdown("**Ordens mais antigas no backlog**")
        bk = ind.backlog(d).nlargest(8, "Idade (dias)")
        if len(bk):
            st.dataframe(bk[["Ordem", "Tipo", "Texto", "Centro de trabalho", "Idade (dias)", "Situação"]], hide_index=True,
                         width="stretch", column_config={"Texto": st.column_config.TextColumn(width="medium")})
            st.page_link("paginas/ordens.py", label="Abrir ordens", icon=":material/arrow_forward:")
        else:
            st.caption("Sem ordens em aberto.")
    e, dd = st.columns(2)
    with e, st.container(border=True):
        st.markdown("**Peças de equipamentos críticos em falta**")
        pc = ind.pecas_criticas_em_falta(d)
        if len(pc):
            st.dataframe(pc, hide_index=True, width="stretch")
        else:
            st.caption("Nenhuma peça de equipamento de criticidade Alta em falta (cadastre as peças em Equipamentos).")
        st.page_link("paginas/estoque.py", label="Abrir estoque", icon=":material/arrow_forward:")
    with dd, st.container(border=True):
        st.markdown("**Compras aguardando aprovação**")
        r = d.requisicoes
        if r is not None and r["Pendente"].any():
            p = r[r["Pendente"]].sort_values("Dias aguardando", ascending=False)
            st.markdown(f"{inteiro(len(p))} requisições · {brl(p['Total'].sum())} · a mais antiga há "
                        f"{int(p['Dias aguardando'].max() or 0)} dias")
            st.dataframe(p[["Requisição", "Aprovador", "Total", "Dias aguardando"]].head(8), hide_index=True,
                         width="stretch", column_config={"Total": ui.col_moeda()})
        else:
            st.caption("Nenhuma requisição pendente.")
        st.page_link("paginas/requisicoes.py", label="Abrir requisições", icon=":material/arrow_forward:")

# ----------------------------------------------------------------------------
# Scorecard para baixar
# ----------------------------------------------------------------------------
linhas = []
for k in ind.KPIS:
    alvo = ind.meta(k, cad)
    delta, melhorou = ind.variacao(k, atual.get(k.id), anterior.get(k.id))
    linhas.append({"Grupo": k.grupo, "Indicador": k.nome, "Valor": atual.get(k.id), "Unidade": k.unidade,
                   "Meta": alvo, "Sentido": "maior é melhor" if k.sentido > 0 else "menor é melhor",
                   "Farol": contexto.NOME_FAROL[cores[k.id]], "Período anterior": anterior.get(k.id),
                   "Variação": delta, "Melhorou": {True: "sim", False: "não"}.get(melhorou, ""), "Fórmula": k.formula})
tabela = pd.DataFrame(linhas)
buf = io.BytesIO()
with pd.ExcelWriter(buf, engine="openpyxl") as xw:
    pd.DataFrame({"Recorte": [f.desc], "Período anterior": [ui.descrever(a_ini, a_fim)],
                  "Índice WCM": [None if indice is None else round(indice, 1)]}).to_excel(xw, sheet_name="Resumo", index=False)
    tabela.to_excel(xw, sheet_name="Indicadores", index=False)
    if len(serie):
        serie.rename(columns={k.id: k.nome for k in ind.KPIS}).to_excel(xw, sheet_name="Mês a mês", index=False)
st.download_button("Baixar scorecard WCM (Excel)", buf.getvalue(), "scorecard_wcm.xlsx", icon=":material/download:",
                   mime="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
