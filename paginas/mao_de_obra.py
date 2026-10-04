import altair as alt
import pandas as pd
import streamlit as st

from central import bases, contexto, ui
from central import indicadores as ind
from central.leitura import CONF
from central.util import inteiro, pct, sem_acento

ui.cabecalho("Mão de obra e backlog · HH",
             "Horas apontadas (IW47) por pessoa, centro e tipo de manutenção, utilização da equipe (Gestão de HH) e "
             "carga pendente em semanas")

if bases.iw38().df is None:
    st.info("Coloque o export do IW38 na pasta para cruzar as horas com as ordens.")
    st.stop()
conf_base = bases.confirmacoes()
if conf_base.df is None:
    ui.aviso_base(conf_base, CONF)
    st.caption("Sem a IW47 os indicadores de HH usam o trabalho das operações concluídas do IW38OP.")

f = contexto.filtros_globais()
cad = contexto.metas()
d = contexto.dados(f)
atual, anterior = contexto.resultados(f)
serie = contexto.serie_mensal(f)
jan = ind.janela_apontamentos(d, f.ini, f.fim)
semanas = ((jan[1] - jan[0]).days + 1) / 7 if jan else 0.0
cob = atual.get("cobertura_hh")
st.caption(f"Recorte: **{f.desc}** · jornada: {d.horas_semana:.0f} h/semana por técnico (Metas e parâmetros)"
           + (f" · apontamentos de {jan[0]:%d/%m/%Y} a {jan[1]:%d/%m/%Y}" if jan else ""))
if cob is not None and cob < 90:
    st.warning(f"Só **{cob:.0f}%** das horas apontadas são de ordens que estão no IW38 carregado — as demais "
               "(provavelmente corretivas YM11/YM12, que não vieram no export) aparecem como "
               f"\"{ind.FORA_DO_IW38}\" e ficam fora dos % de plano e de emergencial. Exporte o IW38 com todos os "
               "tipos de ordem para completar a análise.", icon=":material/info:")

ks = [ind.POR_ID[k] for k in ["hh", "utilizacao", "pct_hh_plano", "hh_emergencial", "backlog_sem", "idade_backlog"]]
contexto.grade(ks, atual, anterior, cad, serie, colunas=3, prefixo="h-", link=False)

ex_all = ind.hh_executadas(d)
ex = ex_all[ui.entre(ex_all["Fim real"], f.ini, f.fim)].copy() if len(ex_all) else ex_all
equipe = d.equipe
tec = ind.tecnicos(d)

VISOES = ["Equipe e pessoas", "Distribuição das horas", "Backlog e carga futura"]
visao = st.segmented_control("Visão", VISOES, default=VISOES[0], key="h_visao", label_visibility="collapsed") or VISOES[0]

# ============================================================================
if visao == "Equipe e pessoas":
    if equipe is None or not len(equipe):
        st.info("Coloque a planilha **Gestão de HH** na pasta para ver a equipe (nome, cargo, área, turma).")
    else:
        c = st.columns(4)
        c[0].metric("Pessoas na equipe", inteiro(len(equipe)), border=True, delta_arrow="off")
        c[1].metric("Técnicos de execução", inteiro(len(tec)), "sem apoio e planejamento", delta_color="off",
                    border=True, delta_arrow="off")
        disp = ind.hh_disponiveis(d, f.ini, f.fim)
        c[2].metric("HH disponíveis no período", f"{inteiro(disp or 0)} h", f"{d.horas_semana:.0f} h/semana × técnico",
                    delta_color="off", border=True, delta_arrow="off")
        apont = float(ex.loc[ex["Nº pessoal"].isin(set(tec["Nº pessoal"])), "Horas"].sum()) if len(ex) else 0.0
        c[3].metric("HH apontadas pelos técnicos", f"{inteiro(apont)} h", pct(apont, disp or 0), delta_color="off",
                    border=True, delta_arrow="off")
        e, dd, t = st.columns(3)
        for col, campo, cor in [(e, "Especialidade", ui.AZUL), (dd, "Área", ui.VERDE), (t, "Turma", ui.CIANO)]:
            with col, st.container(border=True):
                st.markdown(f"**Equipe por {campo.lower()}**")
                s = equipe[campo].replace("", "—").value_counts().rename_axis(campo).reset_index(name="Pessoas")
                ui.mostrar(ui.grafico_barras_h(s, campo, "Pessoas", cor))

    st.markdown("#### :material/badge: Horas por pessoa")
    if not len(ex) or "Nº pessoal" not in ex or (ex["Nº pessoal"] == "").all():
        st.caption("Sem apontamentos por pessoa (IW47) no recorte.")
    else:
        emerg = ind.tem_emergencial(d)
        h = ex["Horas"]
        aux = pd.DataFrame({"Nº pessoal": ex["Nº pessoal"], "h": h, "conh": h.where(ex["No IW38"], 0.0),
                            "plano": h.where(ex["No IW38"] & ex["Com plano"], 0.0),
                            "emerg": h.where(ex["Classe"] == "Emergencial", 0.0), "fora": h.where(~ex["No IW38"], 0.0)})
        s_ = aux.groupby("Nº pessoal").sum()
        g = ex.groupby("Nº pessoal")
        conh = s_["conh"].where(s_["conh"] > 0)
        # % sobre as horas de ordens que estão no IW38 (as demais não têm tipo nem plano conhecidos)
        pes = pd.DataFrame({
            "HH apontadas": s_["h"],
            "Dias com apontamento": g["Fim real"].nunique(),
            "Ordens": g["Ordem"].nunique(),
            "% em plano": s_["plano"] / conh * 100,
            "% emergencial": (s_["emerg"] / conh * 100) if emerg else pd.Series(float("nan"), index=s_.index),
            "% fora do IW38": s_["fora"] / s_["h"].where(s_["h"] != 0) * 100,
            "Centro (mais apontado)": g["Centro de trabalho"].agg(lambda x: x.mode().iat[0] if len(x.mode()) else ""),
        }).reset_index()
        if equipe is not None:
            pes = pes.merge(equipe[["Nº pessoal", "Nome", "Cargo", "Especialidade", "Área", "Turma", "Centro de trabalho"]],
                            on="Nº pessoal", how="left")
        for c_ in ["Nome", "Cargo", "Especialidade", "Área", "Turma", "Centro de trabalho"]:
            if c_ not in pes:
                pes[c_] = ""
            pes[c_] = pes[c_].fillna("")
        pes["Nome"] = pes["Nome"].where(pes["Nome"] != "", "(sem cadastro na Gestão de HH)")
        pes["HH por dia"] = pes["HH apontadas"] / pes["Dias com apontamento"].clip(lower=1)
        pes["Utilização"] = pes["HH apontadas"] / (d.horas_semana * semanas) * 100 if semanas else None
        b1, b2, b3 = st.columns([3, 2, 2])
        busca = b1.text_input("Buscar pessoa", key="h_busca", placeholder="nome, matrícula, cargo, centro…")
        esp = sorted(v for v in pes["Especialidade"].unique() if v)
        sel_esp = b2.multiselect("Especialidade", esp, key="h_esp", placeholder="Todas")
        areas = sorted(v for v in pes["Área"].unique() if v)
        sel_area = b3.multiselect("Área (equipe)", areas, key="h_area", placeholder="Todas")
        m = pd.Series(True, index=pes.index)
        if busca.strip():
            hay = (pes["Nº pessoal"] + " " + pes["Nome"] + " " + pes["Cargo"] + " " + pes["Centro (mais apontado)"]
                   ).map(lambda s: sem_acento(s).upper())
            for termo in sem_acento(busca).upper().split():
                m &= hay.str.contains(termo, regex=False)
        if sel_esp:
            m &= pes["Especialidade"].isin(sel_esp)
        if sel_area:
            m &= pes["Área"].isin(sel_area)
        vis = pes[m].sort_values("HH apontadas", ascending=False)
        COLS = ["Nº pessoal", "Nome", "Cargo", "Especialidade", "Área", "Turma", "Centro (mais apontado)", "HH apontadas",
                "Utilização", "HH por dia", "Dias com apontamento", "Ordens", "% em plano", "% emergencial", "% fora do IW38"]
        st.dataframe(vis[COLS], hide_index=True, width="stretch", height=ui.altura_tabela(420),
                     column_config={
                         "HH apontadas": st.column_config.NumberColumn(format="%.1f"),
                         "HH por dia": st.column_config.NumberColumn(format="%.1f"),
                         "Utilização": st.column_config.ProgressColumn(
                             "Utilização", format="%.0f%%", min_value=0, max_value=100,
                             help=f"HH apontadas ÷ ({d.horas_semana:.0f} h × {semanas:.1f} semanas do período)"),
                         "% em plano": st.column_config.NumberColumn(format="%.0f%%"),
                         "% emergencial": st.column_config.NumberColumn(format="%.0f%%"),
                         "% fora do IW38": st.column_config.NumberColumn(format="%.0f%%")})
        ui.baixar(vis[COLS], "hh_por_pessoa", "Baixar (Excel)")
        if equipe is not None:
            sem_apont = tec[~tec["Nº pessoal"].isin(set(ex["Nº pessoal"]))]
            if len(sem_apont):
                with st.expander(f"{len(sem_apont)} técnico(s) da equipe sem apontamento no período", icon=":material/warning:"):
                    st.dataframe(sem_apont[["Nº pessoal", "Nome", "Cargo", "Área", "Turma", "Centro de trabalho"]],
                                 hide_index=True, width="stretch")

# ============================================================================
elif visao == "Distribuição das horas":
    if not len(ex):
        st.info("Sem horas apontadas no recorte.")
        st.stop()
    ex["Natureza"] = ex["Com plano"].map({True: bases.NAT_PLANO, False: bases.NAT_BACKLOG})
    ex.loc[~ex["No IW38"], "Natureza"] = ind.FORA_DO_IW38
    ex["Classe"] = ex["Classe"].replace("", "Sem classe")
    with st.container(border=True):
        st.markdown("**HH apontadas por semana** — por classe do tipo de ordem · linha = HH disponíveis dos técnicos")
        sem = ex.assign(Semana=ex["Fim real"].dt.to_period("W-SUN").dt.start_time)
        qs = sem.groupby(["Semana", "Classe"])["Horas"].sum().reset_index()
        barras = alt.Chart(qs).mark_bar().encode(
            x=alt.X("Semana:T", title=None, axis=alt.Axis(format="%d/%m")), y=alt.Y("Horas:Q", title="HH"),
            color=alt.Color("Classe:N", legend=alt.Legend(orient="top", title=None),
                            scale=alt.Scale(domain=ind.CLASSES_TIPO + ["Sem classe", ind.FORA_DO_IW38],
                                            range=[ui.VERDE, ui.CIANO, ui.LIMA, "#7E57C2", ui.LARANJA, ui.VERMELHO,
                                                   ui.AZUL, ui.CINZA, "#BDBDBD", "#D7CCC8"])),
            tooltip=[alt.Tooltip("Semana:T", format="%d/%m/%Y"), "Classe:N", alt.Tooltip("Horas:Q", format=",.0f")])
        ch = barras
        if len(tec):
            ch = ch + alt.Chart(pd.DataFrame({"y": [len(tec) * d.horas_semana]})).mark_rule(
                color=ui.GRAFITE, strokeDash=[5, 4]).encode(y="y:Q")
        ui.mostrar(ch.properties(height=300))
        st.caption("Classe do tipo de ordem: configure em Metas e parâmetros (padrão: nomes da planilha de Gestão de HH, "
                   "ex.: YM11 Corretiva Emergencial).")
    e, dd = st.columns(2)
    with e, st.container(border=True):
        st.markdown("**HH por centro de trabalho (real)**")
        ct = ex.groupby(["Centro de trabalho", "Natureza"])["Horas"].sum().reset_index()
        topo = ex.groupby("Centro de trabalho")["Horas"].sum().nlargest(14).index
        ct = ct[ct["Centro de trabalho"].isin(topo)]
        ui.mostrar(alt.Chart(ct).mark_bar(height=16).encode(
            y=alt.Y("Centro de trabalho:N", sort=list(topo), title=None),
            x=alt.X("Horas:Q", title="HH"), color=alt.Color("Natureza:N", legend=alt.Legend(orient="top", title=None),
                                                           scale=alt.Scale(domain=[*bases.NATUREZAS, ind.FORA_DO_IW38],
                                                                           range=[ui.VERDE, ui.LARANJA, "#BCAAA4"])),
            tooltip=["Centro de trabalho:N", "Natureza:N", alt.Tooltip("Horas:Q", format=",.0f")]
        ).properties(height=max(160, 26 * len(topo))))
    with dd, st.container(border=True):
        st.markdown("**HH por classe de manutenção**")
        cl = ex.groupby("Classe")["Horas"].sum().reset_index()
        cl["%"] = cl["Horas"] / cl["Horas"].sum() * 100
        cl["Rótulo"] = cl.apply(lambda r: f"{r['Horas']:,.0f} h · {r['%']:.0f}%".replace(",", "."), axis=1)
        ui.mostrar(alt.Chart(cl).mark_arc(innerRadius=60).encode(
            theta="Horas:Q", color=alt.Color("Classe:N", legend=alt.Legend(orient="right", title=None)),
            tooltip=["Classe:N", "Rótulo:N"]).properties(height=260))
    if "Atividade" in ex and (ex["Atividade"] != "").any():
        e, dd = st.columns(2)
        with e, st.container(border=True):
            st.markdown("**HH por tipo de atividade** (MECA, ELETRI…)")
            at = ex.assign(Atividade=ex["Atividade"].replace("", "—")).groupby("Atividade")["Horas"].sum()
            at = at.round(0).nlargest(10).rename_axis("Atividade").reset_index(name="Horas")
            ui.mostrar(ui.grafico_barras_h(at, "Atividade", "Horas", ui.AZUL))
        with dd, st.container(border=True):
            st.markdown("**Ordens com mais horas apontadas**")
            top = ex.groupby("Ordem")["Horas"].sum().nlargest(10).reset_index()
            ref = d.ordens.drop_duplicates("Ordem").set_index("Ordem")
            top["Texto"] = top["Ordem"].map(ref["Texto"]).fillna("")
            top["Tipo"] = top["Ordem"].map(ref["Tipo"]).fillna("")
            st.dataframe(top[["Ordem", "Tipo", "Texto", "Horas"]], hide_index=True, width="stretch",
                         column_config={"Horas": st.column_config.NumberColumn("HH", format="%.1f")})

# ============================================================================
else:
    bk = ind.backlog(d)
    cap, origem = ind.capacidade_semanal(d)
    c = st.columns(4)
    c[0].metric("Ordens em aberto (até hoje)", inteiro(len(bk)), border=True, delta_arrow="off")
    c[1].metric("HH pendentes", f"{inteiro(bk['HH pendentes'].sum())} h" if bk["HH pendentes"].notna().any() else "—",
                "operações abertas (IW38OP)", delta_color="off", border=True, delta_arrow="off")
    c[2].metric("Capacidade semanal", f"{inteiro(cap)} h" if cap else "—", origem, delta_color="off", border=True,
                delta_arrow="off")
    c[3].metric("Backlog em semanas", ind.formatar(ind.POR_ID["backlog_sem"], atual.get("backlog_sem")),
                f"meta ≤ {ind.formatar(ind.POR_ID['backlog_sem'], ind.meta(ind.POR_ID['backlog_sem'], cad))}",
                delta_color="off", border=True, delta_arrow="off")
    if not len(bk):
        st.success("Sem ordens em aberto no recorte.")
        st.stop()
    e, dd = st.columns(2)
    with e, st.container(border=True):
        st.markdown("**Semanas de backlog por centro de trabalho**",
                    help="HH pendentes do centro ÷ capacidade semanal do centro (configurada ou média apontada nas "
                         "últimas 12 semanas).")
        linhas = []
        for ctr, grp in bk.groupby("Centro de trabalho"):
            if not ctr:
                continue
            cap_c, _ = ind.capacidade_semanal(d, [ctr])
            hh = float(grp["HH pendentes"].sum())
            linhas.append({"Centro": ctr, "HH pendentes": hh, "Capacidade/semana": cap_c,
                           "Semanas": hh / cap_c if cap_c else None, "Ordens": len(grp)})
        sc = pd.DataFrame(linhas).sort_values("HH pendentes", ascending=False)
        alvo = ind.meta(ind.POR_ID["backlog_sem"], cad)
        sc["Farol"] = sc["Semanas"].map(lambda v: ind.farol(ind.POR_ID["backlog_sem"], v, alvo))
        st.dataframe(sc.drop(columns="Farol"), hide_index=True, width="stretch",
                     column_config={"HH pendentes": st.column_config.NumberColumn(format="%.0f"),
                                    "Capacidade/semana": st.column_config.NumberColumn(format="%.0f"),
                                    "Semanas": st.column_config.ProgressColumn(format="%.1f sem", min_value=0,
                                                                               max_value=max(8.0, float(sc["Semanas"].max() or 0)))})
    with dd, st.container(border=True):
        st.markdown("**Idade do backlog**")
        faixas = pd.cut(bk["Idade (dias)"], [-1, 7, 30, 90, 180, 10**6],
                        labels=["até 7 d", "8–30 d", "31–90 d", "91–180 d", "mais de 180 d"])
        s = bk.assign(Faixa=faixas, Natureza=bk["Com plano"].map({True: bases.NAT_PLANO, False: bases.NAT_BACKLOG}))
        s = s.groupby(["Faixa", "Natureza"], observed=False).size().reset_index(name="Ordens")
        ui.mostrar(alt.Chart(s).mark_bar(height=18).encode(
            y=alt.Y("Faixa:N", sort=["até 7 d", "8–30 d", "31–90 d", "91–180 d", "mais de 180 d"], title=None),
            x=alt.X("Ordens:Q", title=None), color=alt.Color("Natureza:N", legend=alt.Legend(orient="top", title=None),
                                                             scale=alt.Scale(domain=bases.NATUREZAS,
                                                                             range=[ui.VERDE, ui.LARANJA])),
            tooltip=["Faixa:N", "Natureza:N", "Ordens:Q"]).properties(height=200))
    if d.oper is not None:
        with st.container(border=True):
            st.markdown("**Carga programada das próximas 12 semanas** — trabalho das operações abertas pela data de início, "
                        "contra a capacidade semanal")
            op = d.oper[~d.oper["Concluída"] & ~d.oper["Cancelada"] & d.oper["Início"].notna()]
            hoje = pd.Timestamp.today().normalize()
            op = op[(op["Início"] >= hoje - pd.Timedelta(days=hoje.dayofweek)) & (op["Início"] < hoje + pd.Timedelta(weeks=12))]
            if len(op):
                cg = op.assign(Semana=op["Início"].dt.to_period("W-SUN").dt.start_time).groupby("Semana")["Horas"].sum()
                cg = cg.reset_index()
                ch = alt.Chart(cg).mark_bar(color=ui.AZUL, cornerRadiusTopLeft=3, cornerRadiusTopRight=3).encode(
                    x=alt.X("Semana:T", title=None, axis=alt.Axis(format="%d/%m")), y=alt.Y("Horas:Q", title="HH"),
                    tooltip=[alt.Tooltip("Semana:T", format="%d/%m/%Y"), alt.Tooltip("Horas:Q", format=",.0f")])
                if cap:
                    ch = ch + alt.Chart(pd.DataFrame({"y": [cap]})).mark_rule(color=ui.VERMELHO, strokeDash=[5, 4]).encode(y="y:Q")
                ui.mostrar(ch.properties(height=240))
            else:
                st.caption("Sem operações abertas programadas para as próximas 12 semanas.")
    with st.container(border=True):
        st.markdown("**Ordens em aberto** — mais antigas primeiro")
        cols = ["Ordem", "Tipo", "Natureza", "Texto", "Equipamento", "Centro de trabalho", "Data", "Idade (dias)",
                "HH pendentes", "Situação"]
        st.dataframe(bk.sort_values("Idade (dias)", ascending=False)[cols], hide_index=True, width="stretch",
                     height=ui.altura_tabela(360),
                     column_config={"Data": ui.col_data("Início (data-base)"),
                                    "Texto": st.column_config.TextColumn(width="large"),
                                    "HH pendentes": st.column_config.NumberColumn(format="%.1f")})
        ui.baixar(bk[cols], "backlog", "Baixar backlog (Excel)")
