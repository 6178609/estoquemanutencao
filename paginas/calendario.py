from datetime import timedelta

import pandas as pd
import streamlit as st

from central import bases, contexto, ui
from central import calendario as cal
from central import mudanca_datas as md
from central.leitura import IW38
from central.util import hoje_local, inteiro, sem_acento, setor_do_centro, SETORES

ui.cabecalho("Calendário de ordens · IW38",
             "As ordens alocadas em cada dia (data-base de início do IW38), por turno, com quem apontou (IW47) "
             "e a duração planejada (IW38OP)")

if not ui.aviso_base(bases.iw38(), IW38):
    st.stop()

fg = contexto.filtros_globais(periodo=False)  # o calendário navega por semana/mês (inclui datas futuras)


@st.cache_resource(show_spinner="Montando o calendário das ordens…", max_entries=6)
def _agenda(chave: str, areas: tuple, centros: tuple, tipos: tuple, ajustes: tuple) -> pd.DataFrame:
    f = contexto.Filtros(hoje_local(), hoje_local(), areas, centros, tipos)
    ordens = cal.com_datas_alteradas(f.ordens(bases.iw38().df), dict(ajustes))
    return cal.agenda(ordens, bases.operacoes().df, bases.confirmacoes().df, bases.equipe().df,
                      pd.Timestamp(hoje_local()))


# mudanças de data feitas pelo robô (Programação do mês) que o IW38 exportado ainda não traz
ajustes = md.datas_alteradas(bases.ler_cadastro(md.ARQ_LOTES), bases.iw38().atualizado)
ag = _agenda(contexto._chave(), tuple(fg.areas), tuple(fg.centros), tuple(fg.tipos), tuple(sorted(ajustes.items())))
hoje = hoje_local()

# ----------------------------------------------------------------------------
# Período (entre datas: data inicial → data final)
# ----------------------------------------------------------------------------
ATALHOS_CAL = ["Esta semana", "Próxima semana", "Semana passada", "Este mês", "Próximo mês", "Próximos 30 dias"]
MAX_DIAS_GRADE = 63  # 9 semanas: acima disso o calendário fica ilegível (a lista mostra tudo)

with st.container(border=True, key="periodo-cal"):
    semana = cal.inicio_semana(hoje)
    ini, fim = ui.filtro_datas("cal_faixa", "Período (de / até)", (semana, semana + timedelta(days=6)), ag["Dia"],
                               atalhos=ATALHOS_CAL)
    if fim < ini:
        ini, fim = fim, ini
    st.markdown(f"#### :material/event_note: {ui.descrever(ini, fim)} · {(fim - ini).days + 1} dia(s)")

with ui.caixa_filtros():
    l1 = st.columns([3, 2, 2, 2])
    busca = l1[0].text_input("Buscar", key="cal_busca", placeholder="ordem, equipamento, texto, pessoa, centro…")
    sel_sit = l1[1].multiselect("Situação", cal.SITUACOES, default=[cal.PROGRAMADA, cal.ATRASADA, cal.CONCLUIDA],
                                key="cal_sit")
    sel_nat = l1[2].multiselect("Tipo de trabalho", bases.NATUREZAS, key="cal_nat", placeholder="Todos")
    sel_tur = l1[3].multiselect("Turno", cal.ORDEM_TURNOS, key="cal_tur", placeholder="Todos")
    l2 = st.columns([3, 2, 2])
    locais = [v for v in ag["Localização"].value_counts().index if v]
    sel_loc = l2[0].pills("Localização", locais, selection_mode="multi", key="cal_loc",
                          help="Coluna Localização do IW38. Nenhuma marcada = todas.")
    centros_cal = sorted(c for c in ag["Centro de trabalho"].unique() if c)
    sel_set = l2[1].multiselect("Setor", [s for s in SETORES if any(setor_do_centro(c) == s for c in centros_cal)],
                                key="cal_setor", placeholder="Todos",
                                help="Pelo código do centro de trabalho: …COMP = Componentes, …MONT = Montagem…")
    centros_cal = [c for c in centros_cal if not sel_set or setor_do_centro(c) in sel_set]
    if st.session_state.get("cal_ct"):
        st.session_state["cal_ct"] = [c for c in st.session_state["cal_ct"] if c in centros_cal]
    sel_ct = l2[2].multiselect("Centro de trabalho", centros_cal, key="cal_ct", placeholder="Todos")

vis = ag[ui.entre(ag["Dia"], cal.inicio_semana(ini), cal.inicio_semana(fim) + timedelta(days=6))]
m = pd.Series(True, index=vis.index)
if busca.strip():
    hay = (vis["Ordem"] + " " + vis["Título"] + " " + vis["Texto"] + " " + vis["Quem"].fillna("") + " "
           + vis["Centro de trabalho"] + " " + vis["Tipo"]).map(lambda s: sem_acento(s).upper())
    for termo in sem_acento(busca).upper().split():
        m &= hay.str.contains(termo, regex=False)
if sel_sit:
    m &= vis["Situação"].isin(sel_sit)
if sel_nat:
    m &= vis["Natureza"].isin(sel_nat)
if sel_tur:
    m &= vis["Turno"].isin(sel_tur)
if sel_loc:
    m &= vis["Localização"].isin(sel_loc)
if sel_ct:
    m &= vis["Centro de trabalho"].isin(sel_ct)
elif sel_set:
    m &= vis["Centro de trabalho"].isin(centros_cal)
vis = vis[m]
no_periodo = vis[ui.entre(vis["Dia"], ini, fim)]
ordens = no_periodo.drop_duplicates("Ordem")

c = st.columns(5)
c[0].metric("Ordens", inteiro(len(ordens)), border=True)
c[1].metric("Concluídas", inteiro((ordens["Situação"] == cal.CONCLUIDA).sum()), border=True,
            help="Concluída no IW38 (CONF + ENTE) ou com CONF + ENTE na IW47.")
c[2].metric("Atrasadas", inteiro((ordens["Situação"] == cal.ATRASADA).sum()), border=True,
            help="Abertas/liberadas com a data-base de início já passada.")
c[3].metric("HH planejado", f"{ordens['Duração (h)'].sum():,.0f} h".replace(",", "."), border=True,
            help="Trabalho planejado das operações (IW38OP).")
c[4].metric("Sem IW47", inteiro((ordens["Ordem"].isin(set(no_periodo.loc[
    no_periodo["Turno"] == cal.SEM_EXECUTANTE, "Ordem"]))).sum()), border=True,
            help="Ordens sem apontamento na IW47: aparecem com o centro de trabalho e as pessoas previstas.")

fim_grade = min(fim, ini + timedelta(days=MAX_DIAS_GRADE - 1))
if fim_grade < fim:
    st.info(f"Período longo: o calendário mostra as 9 primeiras semanas (até {fim_grade:%d/%m/%Y}). "
            "Os números acima e a lista abaixo valem para o período inteiro.", icon=":material/info:")
ui.aplicar_css(cal.CSS)
st.html(cal.html_calendario(vis, ini, fim_grade, hoje, max_cartoes=12 if (fim_grade - ini).days < 14 else 4))
st.caption("Passe o mouse num cartão para ver a ordem, o texto e a situação. O turno vem da turma (Gestão de HH) de "
           "quem apontou na IW47; ordens sem apontamento ficam em \"Sem executante\" com o centro de trabalho."
           + (f" ↻ = data alterada pelo robô do SAP ({len(ajustes)} ordem(ns)), ainda não no IW38 exportado."
              if ajustes else ""))
st.page_link("paginas/programacao.py", label="Programação do mês (previsão manual e mudança de datas no SAP)",
             icon=":material/edit_calendar:")

# ----------------------------------------------------------------------------
# Tabela
# ----------------------------------------------------------------------------
with st.expander(f"Lista das ordens do período ({inteiro(len(ordens))})", icon=":material/table:"):
    tab = no_periodo.assign(Duração=no_periodo["Duração (h)"].map(cal.duracao))
    cols = ["Dia", "Turno", "Ordem", "Título", "Texto", "Tipo", "Natureza", "Situação", "Situação da ordem", "Quem",
            "Duração", "Centro de trabalho", "Localização"]
    tab = tab.assign(Setor=tab["Centro de trabalho"].map(setor_do_centro))
    cols.insert(cols.index("Centro de trabalho"), "Setor")
    st.dataframe(tab[cols], hide_index=True, width="stretch", height=ui.altura_tabela(380),
                 column_config={"Dia": ui.col_data(), "Quem": st.column_config.TextColumn("Quem", width="large"),
                                "Texto": st.column_config.TextColumn(width="medium")})
    ui.baixar(tab[cols], f"calendario_ordens_{ini:%Y%m%d}_{fim:%Y%m%d}", "Baixar lista (Excel)")
