from datetime import date, timedelta

import pandas as pd
import streamlit as st

from central import bases, contexto, ui
from central import calendario as cal
from central.leitura import IW38
from central.util import inteiro, sem_acento

ui.cabecalho("Calendário de ordens · IW38",
             "As ordens alocadas em cada dia (data-base de início do IW38), por turno, com quem apontou (IW47) "
             "e a duração planejada (IW38OP)")

if not ui.aviso_base(bases.iw38(), IW38):
    st.stop()

fg = contexto.filtros_globais(periodo=False)  # o calendário navega por semana/mês (inclui datas futuras)


@st.cache_resource(show_spinner="Montando o calendário das ordens…", max_entries=6)
def _agenda(chave: str, areas: tuple, centros: tuple, tipos: tuple) -> pd.DataFrame:
    f = contexto.Filtros(date.today(), date.today(), areas, centros, tipos)
    ordens = f.ordens(bases.iw38().df)
    return cal.agenda(ordens, bases.operacoes().df, bases.confirmacoes().df, bases.equipe().df,
                      pd.Timestamp(date.today()))


ag = _agenda(contexto._chave(), tuple(fg.areas), tuple(fg.centros), tuple(fg.tipos))
hoje = date.today()

# ----------------------------------------------------------------------------
# Navegação
# ----------------------------------------------------------------------------
if "cal_ref" not in st.session_state:
    st.session_state["cal_ref"] = hoje


def _mover(sinal: int) -> None:
    ref = st.session_state["cal_ref"]
    if st.session_state.get("cal_modo") == "Mês":
        m = ref.month - 1 + sinal
        st.session_state["cal_ref"] = date(ref.year + m // 12, m % 12 + 1, 1)
    else:
        st.session_state["cal_ref"] = ref + timedelta(days=7 * sinal)


def _hoje() -> None:
    st.session_state["cal_ref"] = hoje


with st.container(border=True):
    n = st.columns([3, 1, 1, 1, 3], vertical_alignment="bottom")
    modo = n[0].segmented_control("Visão", ["Semana", "Mês"], default="Semana", key="cal_modo")
    n[1].button("◀", on_click=_mover, args=(-1,), width="stretch", help="Semana/mês anterior")
    n[2].button("Hoje", on_click=_hoje, width="stretch")
    n[3].button("▶", on_click=_mover, args=(1,), width="stretch", help="Próxima semana/mês")
    n[4].date_input("Ir para", key="cal_ref", format="DD/MM/YYYY")
    ref = st.session_state["cal_ref"]
    if modo == "Mês":
        ini = date(ref.year, ref.month, 1)
        fim = (date(ref.year + ref.month // 12, ref.month % 12 + 1, 1) - timedelta(days=1))
        titulo = f"{cal.NOMES_MESES[ini.month - 1]} de {ini.year}"
    else:
        ini = cal.inicio_semana(ref)
        fim = ini + timedelta(days=6)
        titulo = f"Semana de {ini:%d/%m} a {fim:%d/%m/%Y}"
    st.markdown(f"#### :material/event_note: {titulo}")

with ui.caixa_filtros():
    l1 = st.columns([3, 2, 2, 2])
    busca = l1[0].text_input("Buscar", key="cal_busca", placeholder="ordem, equipamento, texto, pessoa, centro…")
    sel_sit = l1[1].multiselect("Situação", cal.SITUACOES, default=[cal.PROGRAMADA, cal.ATRASADA, cal.CONCLUIDA],
                                key="cal_sit")
    sel_nat = l1[2].multiselect("Tipo de trabalho", bases.NATUREZAS, key="cal_nat", placeholder="Todos")
    sel_tur = l1[3].multiselect("Turno", cal.ORDEM_TURNOS, key="cal_tur", placeholder="Todos")

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

st.html(cal.html_calendario(vis, ini, fim, hoje, mes_ref=ini.month if modo == "Mês" else None,
                            max_cartoes=4 if modo == "Mês" else 12))
st.caption("Passe o mouse num cartão para ver a ordem, o texto e a situação. O turno vem da turma (Gestão de HH) de "
           "quem apontou na IW47; ordens sem apontamento ficam em \"Sem executante\" com o centro de trabalho.")

# ----------------------------------------------------------------------------
# Tabela
# ----------------------------------------------------------------------------
with st.expander(f"Lista das ordens do período ({inteiro(len(ordens))})", icon=":material/table:"):
    tab = no_periodo.assign(Duração=no_periodo["Duração (h)"].map(cal.duracao))
    cols = ["Dia", "Turno", "Ordem", "Título", "Texto", "Tipo", "Natureza", "Situação", "Situação da ordem", "Quem",
            "Duração", "Centro de trabalho"]
    st.dataframe(tab[cols], hide_index=True, width="stretch", height=ui.altura_tabela(380),
                 column_config={"Dia": ui.col_data(), "Quem": st.column_config.TextColumn("Quem", width="large"),
                                "Texto": st.column_config.TextColumn(width="medium")})
    ui.baixar(tab[cols], f"calendario_ordens_{ini:%Y%m%d}_{fim:%Y%m%d}", "Baixar lista (Excel)")
