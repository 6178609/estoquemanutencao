
import altair as alt
import pandas as pd
import streamlit as st

from central import bases, contexto, execucao_ui, saude, ui
from central import indicadores as ind
from central.leitura import IW38
from central.util import brl, hoje_local, inteiro

ui.cabecalho("Painel WCM · Manutenção Profissional",
             "Visão gerencial do pilar e execução das atividades — cada cartão leva à aba onde ele é detalhado")

base = bases.iw38()
if not ui.aviso_base(base, IW38):
    st.stop()

f = contexto.filtros_globais(na_pagina=True)
cad = contexto.metas()
atual, anterior = contexto.resultados(f)
serie = contexto.serie_mensal(f)
a_ini, a_fim = ind.periodo_anterior(f.ini, f.fim)
ui.aplicar_css(contexto.CSS)
ICONES = {ind.CONFIABILIDADE: ":material/health_and_safety:", ind.PREDITIVA: ":material/sensors:",
          ind.PLANEJAMENTO: ":material/event_available:", ind.ANALISE_FALHA: ":material/troubleshoot:",
          ind.MAO_DE_OBRA: ":material/engineering:", ind.CUSTOS: ":material/payments:",
          ind.SUPRIMENTOS: ":material/inventory_2:"}
FILTRADO = bool(f.areas or f.centros or f.tipos)
CHAVE_SCORE = ["quebras", "mtbf", "mttr", "reincidencia", "pct_plano", "pct_emergencial", "no_prazo", "idade_backlog",
               "hh", "pct_hh_plano", "custo", "pct_custo_corr"]

# ============================================================================
# 1. VISÃO GERAL GERENCIAL
# ============================================================================
st.markdown("### :material/dashboard: Visão geral")
st.caption(f"Variações contra {ui.descrever(a_ini, a_fim)} (período anterior de mesma duração) · passe o mouse no "
           "título de cada indicador para ver a fórmula")
cores = {k.id: ind.farol(k, atual.get(k.id), ind.meta(k, cad)) for k in ind.KPIS}


def _indice(ids) -> float | None:
    ids = list(ids)
    return (sum(cores[i] == ind.VERDE for i in ids) + 0.5 * sum(cores[i] == ind.AMARELO for i in ids)) / len(ids) * 100 \
        if ids else None


indice = _indice([i for i, c_ in cores.items() if c_ != ind.NEUTRO])   # só vai no Excel do scorecard

# o IW38 sem as corretivas deixa "manutenção planejada" otimista: avisa (as horas da IW47 mostram o tamanho)
cob_hh = atual.get("cobertura_hh")
if cob_hh is not None and cob_hh < 90:
    st.warning(f"Só **{cob_hh:.0f}%** das horas apontadas (IW47) são de ordens que estão no IW38 carregado — as "
               "corretivas (YM11/YM12) provavelmente não vieram no export. **Manutenção planejada** e **HH em "
               "manutenção planejada** ficam otimistas; exporte o IW38 com todos os tipos de ordem.",
               icon=":material/info:")

# destaques: os indicadores que a gerência acompanha toda semana
DESTAQUES = ["pct_plano", "no_prazo", "backlog_sem", "quebras", "mtbf", "mttr", "custo", "af_execucao"]
contexto.grade([ind.POR_ID[k] for k in DESTAQUES], atual, anterior, cad, serie, colunas=4, prefixo="dest-")

# saúde por grupo do pilar + pontos de atenção
e, d = st.columns([3, 2])
with e, st.container(border=True):
    st.markdown("**Saúde por grupo do pilar** · indicadores na meta, em atenção e fora")
    linhas = []
    for g in ind.GRUPOS:
        for k in [k for k in ind.KPIS if k.grupo == g]:
            linhas.append({"Grupo": g, "Farol": contexto.NOME_FAROL[cores[k.id]], "Indicador": k.nome,
                           "Valor": ind.formatar(k, atual.get(k.id))})
    sg = pd.DataFrame(linhas)
    ordem_farol = [contexto.NOME_FAROL[c_] for c_ in (ind.VERDE, ind.AMARELO, ind.VERMELHO, ind.NEUTRO)]
    ui.mostrar(alt.Chart(sg).mark_bar(cornerRadius=2, height=16).encode(
        y=alt.Y("Grupo:N", title=None, sort=ind.GRUPOS, axis=alt.Axis(labelLimit=200, labelOverlap=False)),
        x=alt.X("count():Q", title=None, stack="zero", axis=alt.Axis(tickMinStep=1)),
        color=alt.Color("Farol:N", scale=alt.Scale(domain=ordem_farol, range=[contexto.COR_FAROL[c_] for c_ in (
            ind.VERDE, ind.AMARELO, ind.VERMELHO, ind.NEUTRO)]), legend=alt.Legend(orient="top", title=None, columns=4, labelFontSize=10,
                                                     symbolSize=60, columnPadding=6, labelLimit=90)),
        order=alt.Order("Farol:N", sort="ascending"),
        tooltip=["Grupo:N", "Farol:N", "Indicador:N", "Valor:N"]).properties(height=230))
with d, st.container(border=True):
    st.markdown("**Pontos de atenção** · fora da meta, do pior para o melhor")
    piores = sorted([k for k in ind.KPIS if cores[k.id] == ind.VERMELHO],
                    key=lambda k: -abs((atual.get(k.id) or 0) - (ind.meta(k, cad) or 0)) / max(abs(ind.meta(k, cad) or 1), 1e-9))
    piores += [k for k in ind.KPIS if cores[k.id] == ind.AMARELO]
    if not piores:
        st.success("Todos os indicadores com meta estão dentro dela no recorte.", icon=":material/verified:")
    for k in piores[:7]:
        alvo = ind.meta(k, cad)
        simbolo = ":red[:material/error:]" if cores[k.id] == ind.VERMELHO else ":orange[:material/warning:]"
        l1, l2 = st.columns([4, 1.3], vertical_alignment="center")
        l1.markdown(f"{simbolo} **{k.nome}** {ind.formatar(k, atual.get(k.id))} · meta "
                    f"{'≥' if k.sentido > 0 else '≤'} {ind.formatar(k, alvo)}")
        ui.link_pagina(k.pagina, label="Ver", icon=":material/arrow_forward:", onde=l2)
    if len(piores) > 7:
        st.caption(f"+{len(piores) - 7} indicador(es) — veja em Mais detalhes › Pontos de atenção.")

# tendência dos principais indicadores (12 meses)
TENDENCIA = [("quebras", ui.LARANJA), ("mttr", ui.LARANJA), ("pct_plano", ui.AZUL), ("custo", ui.AZUL)]
cols = st.columns(4)
for col, (kid, cor) in zip(cols, TENDENCIA):
    k = ind.POR_ID[kid]
    with col, st.container(border=True):
        tem = kid in serie and serie[kid].notna().sum()
        # o mês corrente está pela metade: o destaque é o último mês completo
        completos = serie[serie["Mês"] < pd.Timestamp(hoje_local()).to_period("M").start_time] if tem else serie
        val = completos[["Mês", kid]].dropna() if tem else completos
        ultimo = (f" · {contexto.mes_pt(val['Mês'].iloc[-1])} **{ind.formatar(k, val[kid].iloc[-1])}**"
                  if tem and len(val) else "")
        st.markdown(f"**{k.nome}** · 12 meses{ultimo}", help=k.formula)
        if tem:
            ui.mostrar(contexto.grafico_mensal(serie, k, ind.meta(k, cad), cor, barras=k.unidade in ("un", "R$"),
                                               altura=150, compacto=True))
        else:
            st.caption("Sem dados no recorte.")

# resumo da preditiva (SEMEQ)
if atual.get("semeq_detectadas") is not None:
    with st.container(border=True, key="faixa-semeq"):
        p1, p2 = st.columns([5, 1.3], vertical_alignment="center")

        def _pct(v):
            return "—" if v is None else f"{v:.0f}%"

        dias_tratar = atual.get("semeq_dias")
        dias_txt = "—" if dias_tratar is None else f"{dias_tratar:.1f}".replace(".", ",")
        p1.markdown(
            f":material/sensors: **Preditiva (SEMEQ)** · {inteiro(atual['semeq_detectadas'])} anomalias no período · "
            f"**{_pct(atual.get('semeq_tratadas'))} tratadas** · {_pct(atual.get('semeq_com_ordem'))} com ordem · "
            f":red[**{inteiro(atual.get('semeq_atrasadas') or 0)} atrasadas hoje**] · {dias_txt} dias para tratar")
        ui.link_pagina("paginas/preditiva.py", label="Abrir preditiva", icon=":material/arrow_forward:", onde=p2)

# resumo da saúde dos ativos (índice 0–100 por equipamento)
_saude = saude.resumo(contexto.saude_ativos(f))
if _saude["ativos"]:
    with st.container(border=True, key="faixa-saude"):
        s1, s2 = st.columns([5, 1.3], vertical_alignment="center")
        s1.markdown(
            f":material/monitor_heart: **Saúde dos ativos** · {inteiro(_saude['ativos'])} equipamentos · "
            f":red[**{inteiro(_saude['criticos'])} em saúde crítica**] ({inteiro(_saude['criticos_alta'])} de "
            f"criticidade Alta) · :orange[{inteiro(_saude['atencao'])} em atenção] · saúde média "
            f"{_saude['media']:.0f}/100")
        ui.link_pagina("paginas/saude.py", label="Fila de ataque", icon=":material/arrow_forward:", onde=s2)

# ============================================================================
# 2. EXECUÇÃO DAS ATIVIDADES
# ============================================================================
st.divider()
st.markdown("### :material/task_alt: Execução das atividades · IW38/IW38OP × IW47")
execucao_ui.mostrar(f)

# ============================================================================
# 3. MAIS DETALHES
# ============================================================================
st.divider()
st.markdown("### :material/insights: Mais detalhes")
VISOES = ["Todos os indicadores", "Scorecard por área", "Scorecard por setor", "Scorecard por centro de trabalho",
          "Evolução mensal", "Pontos de atenção"]
visao = st.segmented_control("Visão", VISOES, default=VISOES[0], key="p_detalhe",
                             label_visibility="collapsed") or VISOES[0]

# ----------------------------------------------------------------------------
if visao == "Todos os indicadores":
    for grupo in ind.GRUPOS:
        ks = [k for k in ind.KPIS if k.grupo == grupo]
        st.markdown(f"#### {ICONES[grupo]} {grupo}")
        if grupo == ind.ANALISE_FALHA:
            st.caption("Do Gerenciador de AF, com a fábrica inteira: só o período vale (as áreas do gerenciador não são "
                       "as do SAP)" + (" — os filtros de área, centro e tipo não se aplicam aqui." if FILTRADO else "."))
        contexto.grade(ks, atual, anterior, cad, serie, colunas=4)

elif visao in ("Scorecard por área", "Scorecard por setor", "Scorecard por centro de trabalho"):
    dim = {"Scorecard por área": ("Localização", "areas", "Área", "áreas", 10),
           "Scorecard por setor": ("Setor", "setores", "Setor", "setores", 14),
           "Scorecard por centro de trabalho": ("Centro de trabalho", "centros", "Centro de trabalho",
                                                "centros de trabalho", 14)}[visao]
    campo, chave_dim, rotulo_dim, plural, n_topo = dim
    o = f.ordens(base.df)
    o = f.periodo(o)
    topo = o[o[campo] != ""][campo].value_counts().head(n_topo).index.tolist()
    if not topo:
        st.info("Sem ordens no recorte para montar o scorecard.")
        st.stop()
    valores = contexto.por_dimensao(f, chave_dim, topo)
    total = {"TOTAL DO RECORTE": atual}
    ks = [ind.POR_ID[k] for k in CHAVE_SCORE]
    st.caption(f"{len(topo)} {plural} com mais ordens no período · verde = na meta, "
               "amarelo = até 10% da meta, vermelho = fora · indicadores de suprimentos e de análise de falhas não têm "
               "área" + (" · setor pelo código do centro de trabalho (…COMP = Componentes, …MONT = Montagem…)"
                         if chave_dim == "setores" else ""))
    st.dataframe(contexto.scorecard({**valores, **total}, ks, cad, rotulo_dim), hide_index=True, width="stretch")
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
            ui.link_pagina(k.pagina, label="Detalhar", icon=":material/arrow_forward:", onde=cols[1])
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
            ui.link_pagina("paginas/confiabilidade.py", label="Análise de confiabilidade", icon=":material/arrow_forward:")
        else:
            st.caption("Nenhuma quebra registrada no período.")
    with dd, st.container(border=True):
        st.markdown("**Ordens mais antigas no backlog**")
        bk = ind.backlog(d).nlargest(8, "Idade (dias)")
        if len(bk):
            st.dataframe(bk[["Ordem", "Tipo", "Texto", "Centro de trabalho", "Idade (dias)", "Situação"]], hide_index=True,
                         width="stretch", column_config={"Texto": st.column_config.TextColumn(width="medium")})
            ui.link_pagina("paginas/ordens.py", label="Abrir ordens", icon=":material/arrow_forward:")
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
        ui.link_pagina("paginas/estoque.py", label="Abrir estoque", icon=":material/arrow_forward:")
    with dd, st.container(border=True):
        st.markdown("**Compras aguardando aprovação**")
        r = d.requisicoes
        if r is not None and r["Pendente"].any():
            p = r[r["Pendente"]].sort_values("Dias aguardando", ascending=False)
            st.markdown(f"{inteiro(len(p))} requisições · {brl(p['Total'].sum())} · a mais antiga há "
                        f"{int(p['Dias aguardando'].max() or 0)} dias")
            st.dataframe(p[["Requisição", "Aprovador", "Total", "Dias aguardando"]].head(8), hide_index=True,
                         width="stretch", column_config={"Total": ui.col_moeda("Total (R$)")})
        else:
            st.caption("Nenhuma requisição pendente.")
        ui.link_pagina("paginas/requisicoes.py", label="Abrir requisições", icon=":material/arrow_forward:")

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
resumo_xl = pd.DataFrame({"Recorte": [f.desc], "Período anterior": [ui.descrever(a_ini, a_fim)],
                          "Índice WCM": [None if indice is None else round(indice, 1)]})
mensal_xl = serie.rename(columns={k.id: k.nome for k in ind.KPIS}) if len(serie) else pd.DataFrame()
st.download_button("Baixar scorecard WCM (Excel)",
                   lambda: ui.excel_bytes(("Resumo", resumo_xl), ("Indicadores", tabela), ("Mês a mês", mensal_xl)),
                   "scorecard_wcm.xlsx", icon=":material/download:", mime=ui.MIME_XLSX, on_click="ignore")
