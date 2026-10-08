
import altair as alt
import pandas as pd
import streamlit as st

from central import bases, contexto, execucao_ui, hh, ui
from central import indicadores as ind
from central import semanal as sem
from central.leitura import OPER
from central.util import hoje_local, inteiro, sem_acento

META_ADERENCIA = 90.0   # SMRP: 90% ou mais da programação cumprida na semana é classe mundial

ui.cabecalho("Programação semanal",
             "Carga × capacidade por centro de trabalho, o que está programado na semana, o que pode completar a "
             "folga e a aderência à programação das semanas anteriores")

if not ui.aviso_base(bases.operacoes(), OPER):
    st.stop()

f = contexto.filtros_globais(periodo=False)
d = contexto.dados(f)
ops, _ap = execucao_ui.operacoes_do_recorte(f)
hoje = pd.Timestamp(hoje_local())

semanas = sem.semanas_para_escolher(hoje)
padrao = sem.segunda(hoje) + pd.Timedelta(weeks=1 if hoje.dayofweek >= 3 else 0)   # de quinta em diante: a próxima
c_sem, c_info = st.columns([2, 3], vertical_alignment="bottom")
seg = c_sem.selectbox("Semana", semanas, index=semanas.index(padrao), key="sem_semana",
                      format_func=lambda s: sem.rotulo_semana(s, hoje),
                      help="De quinta-feira em diante a página já abre na próxima semana, a que está sendo programada.")
c_info.caption(f"Recorte: **{f.recorte or 'fábrica inteira'}** · atividade = operação do IW38OP pela data programada · "
               "capacidade: Metas e parâmetros › Equipe e capacidade; sem configuração, a disponibilidade da equipe "
               "na semana pelo **Gerenciador de HH** (jornada, % disponível e ausências)")

prog = sem.programadas(ops, seg)
centros = sorted({c for c in prog["Centro de trabalho"] if c}) if len(prog) else []
executadas = d.memo("hh_exec", ind.hh_executadas)
disp_semana = hh.por_centro(ind.pessoas_hh(d), d.disponibilidade, seg, seg + pd.Timedelta(days=6))
cap = sem.capacidade(centros, ind.tecnicos(d), d.horas_semana, {k: v for k, v in d.capacidade.items() if k},
                     executadas, hoje, disp_semana)
carga = sem.carga_por_centro(prog, cap)
cand = sem.candidatos(ops, seg)

com_cap = carga[carga["Capacidade"].notna()] if len(carga) else carga
hh_cap = float(com_cap["Capacidade"].sum()) if len(com_cap) else 0.0
hh_prog_cap = float(com_cap["HH programadas"].sum()) if len(com_cap) else 0.0
k = st.columns(5)
k[0].metric("HH programadas", f"{inteiro(prog['Horas'].sum())} h" if len(prog) else "0 h",
            f"{inteiro(len(prog))} operações · {inteiro(prog['Ordem'].nunique() if len(prog) else 0)} ordens",
            delta_color="off", border=True, delta_arrow="off")
k[1].metric("Capacidade", f"{inteiro(hh_cap)} h" if hh_cap else "—",
            f"{inteiro(len(com_cap))} de {inteiro(len(carga))} centros", delta_color="off", border=True,
            delta_arrow="off", help="Soma da capacidade semanal dos centros com programação na semana.")
k[2].metric("Carga", f"{hh_prog_cap / hh_cap * 100:.0f}%" if hh_cap else "—",
            "da capacidade" if hh_cap else "sem capacidade", delta_color="off", border=True, delta_arrow="off",
            help="HH programadas ÷ capacidade dos centros com capacidade. Acima de 100% = mais trabalho que gente.")
k[3].metric("Liberadas", f"{prog['Pronta'].mean() * 100:.0f}%" if len(prog) else "—",
            "prontas p/ executar", delta_color="off", border=True, delta_arrow="off",
            help="Operações da semana cuja ordem já está Liberada no SAP (Aberta ainda precisa ser liberada).")
k[4].metric("Atrasadas", f"{inteiro(cand['Horas'].sum())} h" if len(cand) else "0 h",
            f"{inteiro(len(cand))} operações", delta_color="off", border=True, delta_arrow="off",
            help="Operações programadas antes desta semana e ainda em aberto (candidatas a completar a folga).")

if not len(prog):
    st.info(f"Nenhuma operação programada em {sem.rotulo_semana(seg, hoje).split(' · ', 1)[1]} no recorte.",
            icon=":material/event_busy:")
else:
    # ------------------------------------------------------------------------
    # Carga × capacidade
    # ------------------------------------------------------------------------
    e, dd = st.columns([3, 2])
    with e, st.container(border=True):
        st.markdown("**Carga × capacidade por centro de trabalho** — barra = HH programadas, traço = capacidade",
                    help="Vermelho: carga acima de 100% da capacidade; laranja: de 85% a 100%; cinza: centro sem "
                         "capacidade cadastrada (configure em Metas e parâmetros).")
        top = carga.head(15).copy()
        top["Faixa"] = pd.cut(top["Carga %"].fillna(-1), [-2, -0.5, 85, 100, 10 ** 9],
                              labels=["Sem capacidade", "Folga", "Cheia", "Sobrecarga"]).astype(str)
        top["Rótulo"] = top.apply(lambda r: f"{r['HH programadas']:.0f} h" + (
            f" · {r['Carga %']:.0f}%" if pd.notna(r["Carga %"]) else ""), axis=1)
        base = alt.Chart(top).encode(y=alt.Y("Centro de trabalho:N", sort=list(top["Centro de trabalho"]), title=None,
                                             axis=alt.Axis(labelOverlap=False, labelLimit=160)))
        barras = base.mark_bar(height=16, cornerRadiusEnd=3).encode(
            x=alt.X("HH programadas:Q", title="HH"),
            color=alt.Color("Faixa:N", legend=alt.Legend(orient="top", title=None),
                            scale=alt.Scale(domain=["Folga", "Cheia", "Sobrecarga", "Sem capacidade"],
                                            range=[ui.AZUL, ui.LARANJA, ui.VERMELHO, ui.CINZA])),
            tooltip=["Centro de trabalho:N", alt.Tooltip("HH programadas:Q", format=",.0f"),
                     alt.Tooltip("Capacidade:Q", format=",.0f"), alt.Tooltip("Carga %:Q", format=".0f"), "Origem:N"])
        traco = base.mark_tick(color=ui.GRAFITE, thickness=3, size=22).encode(x="Capacidade:Q")
        texto = base.mark_text(align="left", dx=4, fontSize=11).encode(x="HH programadas:Q", text="Rótulo:N")
        ui.mostrar((barras + traco + texto).properties(height=max(180, 34 * len(top))))
    with dd, st.container(border=True):
        st.markdown("**Quadro da semana** — HH programadas por dia")
        ordem_c = [c for c in carga["Centro de trabalho"] if c][:15]
        dia = sem.por_dia(prog)
        dia = dia[dia["Centro de trabalho"].isin(ordem_c)].melt(id_vars="Centro de trabalho", var_name="Dia",
                                                                 value_name="HH")
        dia["Rótulo"] = dia["HH"].map(lambda v: f"{v:.0f}" if v >= 0.5 else "")
        quadro = alt.Chart(dia).encode(x=alt.X("Dia:N", sort=sem.DIAS, title=None, axis=alt.Axis(labelAngle=0,
                                                                                                orient="top")),
                                       y=alt.Y("Centro de trabalho:N", sort=ordem_c, title=None))
        ui.mostrar((quadro.mark_rect(cornerRadius=3).encode(
            color=alt.Color("HH:Q", scale=alt.Scale(scheme="blues"), legend=None),
            tooltip=["Centro de trabalho:N", "Dia:N", alt.Tooltip("HH:Q", format=",.1f")])
            + quadro.mark_text(fontSize=11).encode(
                text="Rótulo:N", color=alt.condition(alt.datum.HH > float(dia["HH"].max() or 0) * 0.55,
                                                     alt.value("white"), alt.value(ui.GRAFITE))))
            .properties(height=max(160, 30 * len(ordem_c))))

    with st.container(border=True):
        st.markdown("**Carga por centro de trabalho**")
        st.dataframe(carga, hide_index=True, width="stretch",
                     column_config={"HH programadas": st.column_config.NumberColumn(format="%.0f"),
                                    "Capacidade": st.column_config.NumberColumn(format="%.0f"),
                                    "Folga (HH)": st.column_config.NumberColumn(format="%.0f"),
                                    "Prontas %": st.column_config.NumberColumn(format="%.0f%%"),
                                    "Carga %": st.column_config.ProgressColumn(format="%.0f%%", min_value=0,
                                                                               max_value=max(150.0, float(
                                                                                   carga["Carga %"].max() or 0)))})

    # ------------------------------------------------------------------------
    # Lista da programação
    # ------------------------------------------------------------------------
    st.markdown("#### :material/checklist: Programação da semana")
    l1, l2, l3 = st.columns([3, 3, 2])
    busca = l1.text_input("Buscar", key="sem_busca", placeholder="ordem, equipamento, texto…")
    ctr = l2.multiselect("Centro de trabalho", centros, key="sem_ctr", placeholder="Todos")
    so_nao_prontas = l3.toggle("Só não liberadas", key="sem_nao_prontas",
                               help="Ordens ainda Abertas no SAP: precisam ser liberadas antes da semana.")
    lista = prog
    if ctr:
        lista = lista[lista["Centro de trabalho"].isin(ctr)]
    if so_nao_prontas:
        lista = lista[~lista["Pronta"]]
    if busca.strip():
        hay = (lista["Ordem"] + " " + lista["Texto da operação"].fillna("") + " " + lista["Texto da ordem"].fillna("")
               + " " + lista["Equipamento"].fillna("") + " " + lista["Objeto técnico"].fillna("")).map(
            lambda s: sem_acento(s).upper())
        for termo in sem_acento(busca).upper().split():
            lista = lista[hay.loc[lista.index].str.contains(termo, regex=False)]
    COLS = ["Dia", "Início", "Ordem", "Operação", "Texto da operação", "Texto da ordem", "Objeto técnico",
            "Centro de trabalho", "Horas", "Pessoas", "Pronta", "Situação", "Natureza", "Executado por"]
    COLS = [c for c in COLS if c in lista]
    st.dataframe(lista[COLS], hide_index=True, width="stretch", height=ui.altura_tabela(420),
                 column_config={"Início": ui.col_data("Data"), "Horas": st.column_config.NumberColumn("HH", format="%.1f"),
                                "Pronta": st.column_config.CheckboxColumn("Liberada"),
                                "Texto da operação": st.column_config.TextColumn(width="medium"),
                                "Texto da ordem": st.column_config.TextColumn(width="medium")})
    ui.baixar(lista[COLS], f"programacao_semana_{seg:%Y%m%d}", "Baixar a programação (Excel)", chave="sem_baixar")

# ----------------------------------------------------------------------------
# Para completar a folga
# ----------------------------------------------------------------------------
st.markdown("#### :material/playlist_add: Para completar a folga · atrasadas antes da semana")
if not len(cand):
    st.success("Nenhuma operação atrasada antes desta semana no recorte.", icon=":material/verified:")
else:
    tab_saude = contexto.saude_ativos(f).set_index("Código") if len(ops) else pd.DataFrame()
    crit = tab_saude["Criticidade"].to_dict() if len(tab_saude) else {}
    risco = tab_saude["Risco"].to_dict() if len(tab_saude) else {}
    cand = sem.candidatos(ops, seg, crit, risco)
    folga = dict(zip(carga["Centro de trabalho"], carga["Folga (HH)"])) if len(carga) else {}
    # centros sem nada programado na semana: a capacidade inteira é folga
    livres = sem.capacidade(sorted({c for c in cand["Centro de trabalho"] if c and c not in folga}),
                            ind.tecnicos(d), d.horas_semana, {k_: v for k_, v in d.capacidade.items() if k_},
                            executadas, hoje, disp_semana)
    folga.update(dict(zip(livres["Centro de trabalho"], livres["Capacidade"])))
    cand["Cabe na folga"] = sem.encaixar(cand, folga)
    st.caption(f"{inteiro(len(cand))} operações ({inteiro(cand['Horas'].sum())} HH) atrasadas e em aberto, na ordem de "
               "prioridade: ordem liberada primeiro, depois o equipamento de maior risco (Saúde dos ativos) e a mais "
               f"antiga. **{inteiro(cand['Cabe na folga'].sum())}** cabem na folga de capacidade dos seus centros.")
    COLS_C = ["Cabe na folga", "Ordem", "Operação", "Texto da operação", "Objeto técnico", "Centro de trabalho",
              "Horas", "Pronta", "Criticidade", "Risco do equipamento", "Início", "Dias de atraso", "Natureza"]
    COLS_C = [c for c in COLS_C if c in cand]
    st.dataframe(cand[COLS_C].head(500), hide_index=True, width="stretch", height=ui.altura_tabela(360),
                 column_config={"Início": ui.col_data("Programada para"), "Pronta": st.column_config.CheckboxColumn(
                     "Liberada"), "Horas": st.column_config.NumberColumn("HH", format="%.1f"),
                     "Risco do equipamento": st.column_config.NumberColumn(format="%.0f"),
                     "Texto da operação": st.column_config.TextColumn(width="medium")})
    ui.baixar(cand[COLS_C], f"candidatos_semana_{seg:%Y%m%d}", "Baixar candidatos (Excel)", chave="sem_baixar_cand")

# ----------------------------------------------------------------------------
# Aderência à programação
# ----------------------------------------------------------------------------
st.markdown("#### :material/fact_check: Aderência à programação · semanas anteriores")
ad = sem.aderencia(ops, seg, 12, dados_ate=bases.operacoes().atualizado)
if not len(ad):
    st.caption("Sem operações programadas nas 12 semanas anteriores.")
else:
    a1, a2 = st.columns([3, 2])
    with a1, st.container(border=True):
        st.markdown("**Cumprido dentro da própria semana** (operações e HH)",
                    help="Operações programadas na semana e concluídas até o domingo dela ÷ programadas. A meta de "
                         f"{META_ADERENCIA:.0f}% é a referência de classe mundial (SMRP). Reprogramar a data no SAP "
                         "muda a semana da operação — use a tendência. Só entram semanas completas no export do "
                         "IW38OP.")
        longo = ad.melt(id_vars="Semana", value_vars=["Aderência %", "Aderência HH %"], var_name="Medida",
                        value_name="%")
        linhas = alt.Chart(longo).mark_line(point=True, strokeWidth=2.4).encode(
            x=alt.X("Semana:T", title=None, axis=alt.Axis(format="%d/%m")),
            y=alt.Y("%:Q", title=None, scale=alt.Scale(domain=[0, 100])),
            color=alt.Color("Medida:N", legend=alt.Legend(orient="top", title=None),
                            scale=alt.Scale(range=[ui.AZUL, ui.LARANJA])),
            tooltip=[alt.Tooltip("Semana:T", format="%d/%m/%Y"), "Medida:N", alt.Tooltip("%:Q", format=".1f")])
        meta = alt.Chart(pd.DataFrame({"y": [META_ADERENCIA]})).mark_rule(color=ui.VERDE, strokeDash=[5, 4]).encode(
            y="y:Q")
        ui.mostrar((linhas + meta).properties(height=240))
    with a2, st.container(border=True):
        ult = ad.iloc[-1]
        st.metric(f"Última semana completa ({ult['Semana']:%d/%m})", f"{ult['Aderência %']:.0f}%",
                  f"{inteiro(ult['Na semana'])} de {inteiro(ult['Programadas'])} operações na semana",
                  delta_color="off", border=False, delta_arrow="off")
        st.metric("Média das 12 semanas", f"{ad['Aderência %'].mean():.0f}%", f"meta ≥ {META_ADERENCIA:.0f}%",
                  delta_color="off", border=False, delta_arrow="off")
    st.dataframe(ad.sort_values("Semana", ascending=False), hide_index=True, width="stretch",
                 column_config={"Semana": ui.col_data("Semana (segunda)"),
                                "Aderência %": st.column_config.NumberColumn(format="%.1f%%"),
                                "Aderência HH %": st.column_config.NumberColumn(format="%.1f%%"),
                                "HH programadas": st.column_config.NumberColumn(format="%.0f"),
                                "HH na semana": st.column_config.NumberColumn(format="%.0f")})
