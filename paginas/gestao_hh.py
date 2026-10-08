from datetime import timedelta

import altair as alt
import pandas as pd
import streamlit as st

from central import auth, bases, contexto, hh, ui
from central import indicadores as ind
from central.fontes import FonteErro
from central.leitura import EQUIPE
from central.util import hoje_local, inteiro, sem_acento

ui.cabecalho("Gerenciador de HH · disponibilidade da equipe",
             "Jornada, % disponível para manutenção e ausências (férias, afastamento, treinamento…) de cada "
             "manutentor — alimenta a utilização da mão de obra, a capacidade do backlog e a programação semanal")

eu = auth.usuario_atual()
edita = auth.pode_editar(eu)
quem = auth.nome_de(eu)
ss = st.session_state

base = bases.equipe()
if not ui.aviso_base(base, EQUIPE):
    st.stop()
horas_semana = ind.horas_semana_de(contexto.metas())
cad = bases.ler_cadastro(hh.ARQ)
pes = hh.pessoas(base.df, cad, horas_semana)
hoje = hoje_local()

if "ghh_msg" in ss:
    st.toast(ss.pop("ghh_msg"), icon=":material/check:")


def _gravar(itens: dict, msg: str) -> None:
    if not auth.ainda_pode("gestao_hh", editar=True):
        st.error("Sem permissão para alterar a disponibilidade.")
        return
    try:
        bases.gravar_cadastro_lote(hh.ARQ, itens, quem, mesclar=True)
    except FonteErro as e:
        st.error(str(e))
        return
    ss["ghh_msg"] = msg
    ss["_assinatura"] = bases.assinatura_dados()     # a gravação não conta como "arquivo novo" no vigia
    st.rerun()


# ----------------------------------------------------------------------------
# Período e filtros
# ----------------------------------------------------------------------------
fim_mes = (hoje.replace(day=1) + timedelta(days=32)).replace(day=1) - timedelta(days=1)
with ui.caixa_filtros():
    l1 = st.columns([2.2, 2, 1.5, 1.5, 1.5])
    with l1[0]:
        ini, fim = ui.filtro_datas("ghh_periodo", "Período", (hoje.replace(day=1), fim_mes),
                                   atalhos=["Esta semana", "Próxima semana", "Este mês", "Próximo mês",
                                            "Próximos 30 dias"])
    busca = l1[1].text_input("Buscar", key="ghh_busca", placeholder="nome, matrícula, cargo…")
    sel_ctr = l1[2].multiselect("Centro de trabalho", sorted(v for v in pes["Centro de trabalho"].unique() if v),
                                key="ghh_ctr", placeholder="Todos")
    sel_turma = l1[3].multiselect("Turma", sorted(v for v in pes["Turma"].unique() if v), key="ghh_turma",
                                  placeholder="Todas")
    sel_esp = l1[4].multiselect("Especialidade", sorted(v for v in pes["Especialidade"].unique() if v),
                                key="ghh_esp", placeholder="Todas")

m = pd.Series(True, index=pes.index)
if busca.strip():
    hay = (pes["Nº pessoal"] + " " + pes["Nome"] + " " + pes["Cargo"] + " " + pes["Centro de trabalho"]).map(
        lambda s: sem_acento(s).upper())
    for termo in sem_acento(busca).upper().split():
        m &= hay.str.contains(termo, regex=False)
for col, sel in (("Centro de trabalho", sel_ctr), ("Turma", sel_turma), ("Especialidade", sel_esp)):
    if sel:
        m &= pes[col].isin(sel)
vis = pes[m]
disp = hh.disponibilidade(vis, cad, ini, fim)
cap = disp[disp["Conta na capacidade"]] if len(disp) else disp
ausentes_hoje = hh.ausentes_em(vis, cad, hoje)
brutas = float(cap["Horas brutas"].sum()) if len(cap) else 0.0
livres = float(cap["Horas disponíveis"].sum()) if len(cap) else 0.0

k = st.columns(5)
k[0].metric("Pessoas", inteiro(len(vis)), f"{inteiro(len(cap))} contam na capacidade", delta_color="off",
            border=True, delta_arrow="off")
k[1].metric("HH da jornada", f"{inteiro(brutas)} h", ui.descrever(ini, fim), delta_color="off", border=True,
            delta_arrow="off", help="Jornada semanal × dias do período ÷ 7, de quem conta na capacidade.")
k[2].metric("Ausências", f"{inteiro(cap['Horas ausente'].sum() if len(cap) else 0)} h",
            f"{inteiro(cap['Dias ausente'].sum() if len(cap) else 0)} dia(s)", delta_color="off", border=True,
            delta_arrow="off")
k[3].metric("HH disponíveis", f"{inteiro(livres)} h", f"{livres / brutas * 100:.0f}% da jornada" if brutas else None,
            delta_color="off", border=True, delta_arrow="off",
            help="(Jornada − ausências) × % disponível para manutenção. É a base da utilização da mão de obra, da "
                 "capacidade do backlog e da programação semanal.")
k[4].metric("Ausentes hoje", inteiro(ausentes_hoje["Nº pessoal"].nunique() if len(ausentes_hoje) else 0),
            border=True, delta_arrow="off")
if not edita:
    st.caption(":material/lock: Seu perfil é de consulta — só editores e administradores alteram a disponibilidade.")

VISOES = ["Pessoas", "Ausências", "Calendário"]
visao = st.segmented_control("Visão", VISOES, default=VISOES[0], key="ghh_visao",
                             label_visibility="collapsed") or VISOES[0]

# ============================================================================
if visao == "Pessoas":
    st.caption("Altere **Jornada**, **Disponível %**, **Conta na capacidade** e **Observação** direto na tabela e "
               f"clique em Salvar. Jornada padrão: {horas_semana:.0f} h/semana (Metas e parâmetros); apoio/gestão e "
               "planejamento não contam na capacidade, a menos que você marque.")
    COLS = ["Nº pessoal", "Nome", "Cargo", "Centro de trabalho", "Turma", "Jornada (h/sem)", "Disponível %",
            "Conta na capacidade", "Observação", "Dias ausente", "Horas disponíveis"]
    EDITAVEIS = ["Jornada (h/sem)", "Disponível %", "Conta na capacidade", "Observação"]
    tab = disp[COLS].sort_values(["Centro de trabalho", "Nome"]).reset_index(drop=True)
    editado = st.data_editor(
        tab, hide_index=True, width="stretch", height=ui.altura_tabela(460), key="ghh_editor",
        disabled=[c for c in COLS if not edita or c not in EDITAVEIS],
        column_config={
            "Jornada (h/sem)": st.column_config.NumberColumn(min_value=0, max_value=80, step=0.5, format="%.1f h"),
            "Disponível %": st.column_config.NumberColumn(min_value=0, max_value=100, step=5, format="%.0f%%",
                                                         help="Parte da jornada disponível para manutenção "
                                                              "(ex.: 80% se 20% vai para reuniões, treinamentos…)"),
            "Conta na capacidade": st.column_config.CheckboxColumn(),
            "Observação": st.column_config.TextColumn(width="medium"),
            "Dias ausente": st.column_config.NumberColumn("Dias ausente no período", format="%d"),
            "Horas disponíveis": st.column_config.NumberColumn("HH disponíveis no período", format="%.1f h")})
    original = tab.set_index("Nº pessoal")
    novo = editado.set_index("Nº pessoal")
    padrao_cap = pes.set_index("Nº pessoal")["Especialidade"].map(lambda e: e not in hh.SEM_CAPACIDADE)
    mudou = [mat for mat in novo.index if any(str(novo.at[mat, c]) != str(original.at[mat, c]) for c in EDITAVEIS)]
    b1, b2 = st.columns([1, 3])
    if b1.button(f"Salvar ({len(mudou)})", type="primary", icon=":material/save:", disabled=not (edita and mudou),
                 key="ghh_salvar"):
        itens = {}
        for mat in mudou:
            j, p_, c_, o_ = (novo.at[mat, c] for c in EDITAVEIS)
            itens[mat] = {
                "jornada": None if pd.isna(j) or float(j) == horas_semana else float(j),
                "percentual": None if pd.isna(p_) or float(p_) == 100 else float(p_),
                "capacidade": None if bool(c_) == bool(padrao_cap.get(mat, True)) else bool(c_),
                "obs": (str(o_).strip() or None) if isinstance(o_, str) else None}
        _gravar(itens, f"Disponibilidade de {len(itens)} pessoa(s) salva.")
    b2.caption("A tabela mostra o período escolhido acima; jornada e % valem para todos os períodos.")
    ui.baixar(disp[COLS + ["Horas brutas", "Horas ausente"]], "gerenciador_hh", "Baixar (Excel)", chave="ghh_baixar")

# ============================================================================
elif visao == "Ausências":
    nomes = dict(zip(pes["Nº pessoal"], pes["Nome"] + " · " + pes["Centro de trabalho"]))
    if edita:
        with st.form("ghh_nova", clear_on_submit=True, border=True):
            st.markdown("**Nova ausência**")
            a = st.columns([3, 2, 2, 3])
            pessoa = a[0].selectbox("Pessoa", list(pes["Nº pessoal"]), index=None,
                                    format_func=lambda x: f"{nomes.get(x, x)} ({x})", placeholder="Escolha a pessoa")
            tipo = a[1].selectbox("Tipo", hh.TIPOS_AUSENCIA)
            periodo = a[2].date_input("De / até", (hoje, hoje), format="DD/MM/YYYY")
            obs = a[3].text_input("Observação", placeholder="opcional")
            ok = st.form_submit_button("Adicionar", type="primary", icon=":material/event_busy:")
        if ok:
            datas = list(periodo) if isinstance(periodo, (list, tuple)) else [periodo]
            if not pessoa or not datas:
                st.error("Escolha a pessoa e as datas.")
            else:
                de, ate = datas[0], datas[-1]
                atual = ((bases._ler_json_agora(hh.ARQ).get(pessoa) or {}).get("ausencias") or [])
                nova = {"id": f"{pessoa}-{de:%Y%m%d}-{ate:%Y%m%d}-{len(atual) + 1}", "tipo": tipo,
                        "de": de.isoformat(), "ate": ate.isoformat(), "obs": obs.strip()}
                _gravar({pessoa: {"ausencias": [*atual, nova]}},
                        f"{tipo} de {nomes.get(pessoa, pessoa).split(' · ')[0]} adicionada.")

    aus = hh.ausencias(cad)
    if len(aus):
        aus = aus.merge(pes[["Nº pessoal", "Nome", "Centro de trabalho"]], on="Nº pessoal", how="left")
        aus["Nome"] = aus["Nome"].fillna("(fora da planilha de Gestão de HH)")
        aus["Centro de trabalho"] = aus["Centro de trabalho"].fillna("")
        filtrado = bool(busca.strip() or sel_ctr or sel_turma or sel_esp)
        if filtrado:
            aus = aus[aus["Nº pessoal"].isin(set(vis["Nº pessoal"]))]
    passadas = st.toggle("Mostrar também as que já terminaram", key="ghh_passadas")
    if len(aus) and not passadas:
        aus = aus[aus["Até"] >= pd.Timestamp(hoje)]
    if not len(aus):
        st.info("Nenhuma ausência cadastrada" + ("" if passadas else " em andamento ou futura") + ".",
                icon=":material/event_available:")
    else:
        aus = aus.sort_values(["De", "Nome"]).reset_index(drop=True)
        aus["Dias"] = (aus["Até"] - aus["De"]).dt.days + 1
        h0 = pd.Timestamp(hoje)
        aus["Situação"] = ["Em andamento" if de <= h0 <= ate else "Futura" if de > h0 else "Encerrada"
                           for de, ate in zip(aus["De"], aus["Até"])]
        cols = ["Nome", "Nº pessoal", "Centro de trabalho", "Tipo", "De", "Até", "Dias", "Situação", "Obs"]
        ev = st.dataframe(aus[cols], hide_index=True, width="stretch", height=ui.altura_tabela(380),
                          on_select="rerun" if edita else "ignore", selection_mode="multi-row", key="ghh_aus",
                          column_config={"De": ui.col_data(), "Até": ui.col_data()})
        if edita:
            sel = [i for i in (ev.selection.rows if ev and ev.selection else []) if i < len(aus)]
            if st.button(f"Remover selecionadas ({len(sel)})", icon=":material/delete:", disabled=not sel,
                         key="ghh_remover"):
                fresco = bases._ler_json_agora(hh.ARQ)
                itens = {}
                for mat, g in aus.iloc[sel].groupby("Nº pessoal"):
                    tirar = set(g["id"])
                    lista = [x for x in ((fresco.get(mat) or {}).get("ausencias") or []) if x.get("id") not in tirar]
                    itens[mat] = {"ausencias": lista or None}
                _gravar(itens, f"{len(sel)} ausência(s) removida(s).")
        ui.baixar(aus[cols], "ausencias_equipe", "Baixar (Excel)", chave="ghh_baixar_aus")

# ============================================================================
else:
    aus = hh.ausencias(cad)
    if len(aus):
        aus = aus[aus["Nº pessoal"].isin(set(vis["Nº pessoal"]))]
        aus = aus[(aus["Até"] >= pd.Timestamp(ini)) & (aus["De"] <= pd.Timestamp(fim))]
    if not len(aus):
        st.info(f"Ninguém do recorte tem ausência entre {ui.descrever(ini, fim)}.", icon=":material/event_available:")
    else:
        nomes = dict(zip(pes["Nº pessoal"], pes["Nome"]))
        linhas = [{"Pessoa": nomes.get(mat, mat), "Dia": dia, "Tipo": tipo}
                  for mat, de, tipo, ate in aus[["Nº pessoal", "De", "Tipo", "Até"]].itertuples(index=False, name=None)
                  for dia in pd.date_range(max(de, pd.Timestamp(ini)), min(ate, pd.Timestamp(fim)), freq="D")]
        cal = pd.DataFrame(linhas).drop_duplicates(["Pessoa", "Dia"])
        n = cal["Pessoa"].nunique()
        st.markdown(f"**Ausências de {ui.descrever(ini, fim)}** · {inteiro(n)} pessoa(s)")
        ui.mostrar(alt.Chart(cal).mark_rect(cornerRadius=2).encode(
            x=alt.X("Dia:T", title=None, axis=alt.Axis(format="%d/%m", labelAngle=0),
                    scale=alt.Scale(domain=[pd.Timestamp(ini).isoformat(),
                                            (pd.Timestamp(fim) + pd.Timedelta(days=1)).isoformat()])),
            y=alt.Y("Pessoa:N", title=None, sort="ascending", axis=alt.Axis(labelLimit=220)),
            color=alt.Color("Tipo:N", legend=alt.Legend(orient="top", title=None),
                            scale=alt.Scale(domain=hh.TIPOS_AUSENCIA, range=[ui.AZUL, ui.VERMELHO, ui.VERDE, ui.CIANO,
                                                                             ui.LARANJA, ui.LIMA, ui.CINZA])),
            tooltip=["Pessoa:N", alt.Tooltip("Dia:T", format="%d/%m/%Y"), "Tipo:N"],
        ).properties(height=max(120, 24 * n)))
