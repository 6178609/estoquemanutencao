from datetime import date, timedelta

import pandas as pd
import streamlit as st

from central import auth, bases, contexto, robo, ui
from central import calendario as cal
from central import mudanca_datas as md
from central.fontes import FonteErro
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
    l2 = st.columns([4, 2])
    locais = [v for v in ag["Localização"].value_counts().index if v]
    sel_loc = l2[0].pills("Localização", locais, selection_mode="multi", key="cal_loc",
                          help="Coluna Localização do IW38. Nenhuma marcada = todas.")
    centros_cal = sorted(c for c in ag["Centro de trabalho"].unique() if c)
    sel_ct = l2[1].multiselect("Centro de trabalho", centros_cal, key="cal_ct", placeholder="Todos")

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
# máquinas (campos de ordenação) programadas em cada dia — ver "Mudança de datas no SAP" abaixo
ordens_iw38 = fg.ordens(bases.iw38().df)
maq = md.maquinas(ordens_iw38, bases.equipamentos().df)
nome_maq = dict(zip(maq["Campo de ordenação"], maq["Máquina"]))
prog = md.programacao_valida(bases.ler_cadastro(md.ARQ_PROGRAMACAO))
paradas = {date.fromisoformat(k): [f"{c} {nome_maq.get(c, '')[:22]}".strip() for c in v] for k, v in prog.items()}

ui.aplicar_css(cal.CSS)
st.html(cal.html_calendario(vis, ini, fim_grade, hoje, max_cartoes=12 if (fim_grade - ini).days < 14 else 4,
                            paradas=paradas))
st.caption("Passe o mouse num cartão para ver a ordem, o texto e a situação. O turno vem da turma (Gestão de HH) de "
           "quem apontou na IW47; ordens sem apontamento ficam em \"Sem executante\" com o centro de trabalho.")

# ----------------------------------------------------------------------------
# Tabela
# ----------------------------------------------------------------------------
with st.expander(f"Lista das ordens do período ({inteiro(len(ordens))})", icon=":material/table:"):
    tab = no_periodo.assign(Duração=no_periodo["Duração (h)"].map(cal.duracao))
    cols = ["Dia", "Turno", "Ordem", "Título", "Texto", "Tipo", "Natureza", "Situação", "Situação da ordem", "Quem",
            "Duração", "Centro de trabalho", "Localização"]
    st.dataframe(tab[cols], hide_index=True, width="stretch", height=ui.altura_tabela(380),
                 column_config={"Dia": ui.col_data(), "Quem": st.column_config.TextColumn("Quem", width="large"),
                                "Texto": st.column_config.TextColumn(width="medium")})
    ui.baixar(tab[cols], f"calendario_ordens_{ini:%Y%m%d}_{fim:%Y%m%d}", "Baixar lista (Excel)")

# ----------------------------------------------------------------------------
# Mudança de datas no SAP (por campo de ordenação)
# ----------------------------------------------------------------------------
st.markdown("### :material/edit_calendar: Mudança de datas no SAP")
st.caption("Em cada dia, escolha os **campos de ordenação** (máquinas) que vão parar. As ordens pendentes dessas "
           "máquinas (abertas/liberadas, ainda não encerradas) passam a ter o início-base no dia escolhido — o fim "
           "anda junto, mantendo a duração. Confira a lista e clique em **Iniciar mudança de datas**: o robô do SAP "
           "abre cada ordem (a mesma tela que a IW38 abre), troca as datas, grava e confere.")
usuario = auth.usuario_atual()
pode = auth.pode_editar(usuario)
quem = auth.nome_de(usuario) or "site"
lotes = {k: v for k, v in bases.ler_cadastro(md.ARQ_LOTES).items() if isinstance(v, dict)}

# site rodando no PC do robô: traz o resultado do robô para o lote
if robo.disponivel():
    res_local = robo.resultado_mudanca()
    lid = res_local.get("lote")
    if lid in lotes and lotes[lid].get("status") == md.EM_EXECUCAO and not res_local.get("em_andamento"):
        try:
            bases.gravar_cadastro_lote(md.ARQ_LOTES, {lid: md.aplicar_resultado(lotes[lid], res_local)}, quem)
            st.rerun()
        except FonteErro as e:
            st.error(str(e))

abertos = {k: v for k, v in lotes.items() if v.get("status") in md.ABERTOS}


@st.fragment(run_every="5s" if robo.disponivel() else "20s")
def _andamento():
    """Andamento do lote aberto; quando o robô termina, recarrega a página com o resultado."""
    if robo.disponivel():
        r = robo.resultado_mudanca()
        if r.get("em_andamento"):
            feitas = len(r.get("itens", []))
            st.progress(feitas / max(r.get("total") or 1, 1),
                        text=f"Robô do SAP alterando as ordens… {feitas} de {r.get('total', '?')}")
            return
        if r.get("lote") in abertos:
            st.rerun()
    try:
        atuais = bases._ler_json_agora(md.ARQ_LOTES)
    except FonteErro:
        atuais = lotes
    if any((atuais.get(k) or {}).get("status") != v.get("status") for k, v in abertos.items()):
        bases.recarregar()
        st.rerun()
    for lid, lote_ab in abertos.items():
        st.info(f"Lote {lid}: **{md.ROTULO_STATUS.get(lote_ab['status'])}** · {len(lote_ab.get('itens', []))} ordem(ns)"
                + ("" if robo.disponivel() else " · o robô do PC com o SAP (sincronizador) pega o pedido em até 1 "
                   "minuto"), icon=":material/smart_toy:")


if abertos:
    _andamento()

dias_prog = md.dias(ini, fim, 14)
if (fim - ini).days + 1 > len(dias_prog):
    st.caption(f"Programação dos primeiros {len(dias_prog)} dias do período (até {dias_prog[-1]:%d/%m}).")
opcoes = list(maq["Campo de ordenação"])
rotulos = dict(zip(maq["Campo de ordenação"], maq["Campo de ordenação"] + maq["Máquina"].map(
    lambda n: f" · {n[:24]}" if n else "") + maq["Pendentes"].map(lambda n: f" ({n})" if n else "")))
SEMANA = ["SEG", "TER", "QUA", "QUI", "SEX", "SÁB", "DOM"]
with st.form("md_programacao", border=True):
    st.markdown("**Máquinas por dia** · campo de ordenação (nº de ordens pendentes)")
    for i in range(0, len(dias_prog), 2):   # 2 dias por linha: o nº e o nome da máquina cabem no campo
        cols = st.columns(2)
        for col, d in zip(cols, dias_prog[i:i + 2]):
            col.multiselect(f"{SEMANA[d.weekday()]} {d:%d/%m}", opcoes,
                            default=[c for c in prog.get(d.isoformat(), []) if c in rotulos],
                            format_func=lambda c: rotulos.get(c, c), key=f"md_dia_{d.isoformat()}",
                            placeholder="Máquinas")
    salvar = st.form_submit_button("Salvar programação", icon=":material/save:", disabled=not pode,
                                   help=None if pode else "Só administrador ou editor.")
if salvar:
    itens = {d.isoformat(): ({"campos": st.session_state.get(f"md_dia_{d.isoformat()}") or []}
                             if st.session_state.get(f"md_dia_{d.isoformat()}") else None) for d in dias_prog}
    try:
        bases.gravar_cadastro_lote(md.ARQ_PROGRAMACAO, itens, quem)
        st.toast("Programação salva.", icon=":material/check:")
        st.rerun()
    except FonteErro as e:
        st.error(str(e))

prog_periodo = {k: v for k, v in prog.items() if k in {d.isoformat() for d in dias_prog}}
if not prog_periodo:
    st.caption("Nenhuma máquina programada nos dias acima.")
else:
    escopo = st.radio("Quais ordens de cada máquina mudam de data", md.ESCOPOS, horizontal=True, key="md_escopo",
                      help="Atrasadas e até o dia: as pendentes com início até o dia escolhido (as atrasadas "
                           "vêm junto). Só as do período: início dentro do período do calendário. Todas: qualquer "
                           "data, inclusive futuras.")
    concluidas = set(ag.loc[ag["Situação"] == cal.CONCLUIDA, "Ordem"])
    proposta, avisos = md.propor(ordens_iw38, prog_periodo, escopo, ini, fim, concluidas, nome_maq)
    for a in avisos:
        st.warning(a, icon=":material/warning:")
    if not len(proposta):
        st.info("Nenhuma ordem pendente dessas máquinas para mudar (ou todas já estão no dia escolhido).")
    else:
        editada = st.data_editor(
            proposta, hide_index=True, width="stretch", height=ui.altura_tabela(360),
            key=f"md_editor_{hash(tuple(sorted((k, tuple(v)) for k, v in prog_periodo.items())))}_{escopo}",
            disabled=[c for c in proposta.columns if c != "Mudar"],
            column_config={"Mudar": st.column_config.CheckboxColumn("Mudar", help="Desmarque para manter a data"),
                           "Início atual": ui.col_data(), "Fim atual": ui.col_data(),
                           "Novo início": ui.col_data(), "Novo fim": ui.col_data(),
                           "Texto": st.column_config.TextColumn(width="medium")})
        n = int(editada["Mudar"].sum())
        c1, c2 = st.columns([2, 3])
        simular = c1.toggle("Só simular", key="md_simular",
                            help="O robô abre cada ordem e confere se o SAP aceita as datas, mas não grava.")
        confirma = c2.checkbox(f"Confirmo {'simular' if simular else 'alterar no SAP'} a data de {n} ordem(ns)",
                               key="md_confirma")
        bloqueio = ("Só administrador ou editor pode iniciar." if not pode else
                    "Já há um lote em andamento." if abertos else
                    "Marque a confirmação." if not confirma else "")
        if st.button("Iniciar mudança de datas", type="primary", icon=":material/play_arrow:",
                     disabled=bool(bloqueio) or n == 0, help=bloqueio or None):
            try:
                lote_id, lote = md.novo_lote(editada, quem, simular=simular, origem="calendário")
                if robo.disponivel():
                    lote["status"] = md.EM_EXECUCAO
                bases.gravar_cadastro_lote(md.ARQ_LOTES, {lote_id: lote}, quem)
                if robo.disponivel():
                    robo.iniciar_mudanca(md.job(lote_id, lote))
                st.session_state.pop("md_confirma", None)  # pede nova confirmação no próximo lote
                st.toast(f"Lote {lote_id} enviado ao robô do SAP.", icon=":material/smart_toy:")
                st.rerun()
            except (ValueError, FonteErro) as e:
                st.error(str(e))
        if not robo.disponivel():
            st.caption(":material/info: Este site não está no PC do SAP: o pedido fica guardado e o robô desse PC "
                       "(sincronizador ligado e robô configurado) executa em até 1 minuto.")

# histórico
if lotes:
    with st.expander(f"Histórico de mudanças de datas ({len(lotes)})", icon=":material/history:"):
        tab_l = md.tabela_lotes(lotes)
        ev = st.dataframe(tab_l, hide_index=True, width="stretch", on_select="rerun", selection_mode="single-row",
                          key="md_hist", column_config={"Criado em": st.column_config.DatetimeColumn(
                              format="DD/MM/YYYY HH:mm"), "Resumo": st.column_config.TextColumn(width="large")})
        sel = ev.selection.rows if ev and ev.selection else []
        if sel and sel[0] < len(tab_l):
            lid = tab_l.iloc[sel[0]]["Lote"]
            lote = lotes[lid]
            itens = pd.DataFrame(lote.get("itens", []))
            if len(itens):
                itens = itens.rename(columns={"ordem": "Ordem", "campo": "Campo de ordenação", "maquina": "Máquina",
                                              "de_inicio": "Início antes", "de_fim": "Fim antes",
                                              "para_inicio": "Novo início", "para_fim": "Novo fim",
                                              "resultado": "Resultado", "mensagem": "Mensagem do SAP"})
                st.dataframe(itens, hide_index=True, width="stretch", height=ui.altura_tabela(300))
                ui.baixar(itens, f"mudanca_datas_{lid}", "Baixar resultado (Excel)")
            b1, b2 = st.columns(2)
            if lote.get("status") in (md.CONCLUIDA, md.COM_ERROS) and not lote.get("simular") and \
                    b1.button("Desfazer este lote (volta as datas antigas)", icon=":material/undo:",
                              disabled=not pode or bool(abertos)):
                try:
                    novo_id, novo = md.lote_desfazer(lote, quem)
                    if robo.disponivel():
                        novo["status"] = md.EM_EXECUCAO
                    bases.gravar_cadastro_lote(md.ARQ_LOTES, {novo_id: novo}, quem)
                    if robo.disponivel():
                        robo.iniciar_mudanca(md.job(novo_id, novo))
                    st.rerun()
                except (ValueError, FonteErro) as e:
                    st.error(str(e))
            if lote.get("status") in md.ABERTOS and b2.button("Cancelar este pedido", icon=":material/cancel:",
                                                              disabled=not pode,
                                                              help="Use se o robô não pegou o pedido ou parou no meio."):
                try:
                    bases.gravar_cadastro_lote(md.ARQ_LOTES, {lid: {**lote, "status": md.CANCELADA,
                                                                   "resumo": f"cancelado por {quem}"}}, quem)
                    st.rerun()
                except FonteErro as e:
                    st.error(str(e))
