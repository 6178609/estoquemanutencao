"""Visão "Execução das atividades" do Painel: taxa de execução IW38/IW38OP e quem fez o quê (IW47)."""

from __future__ import annotations

from datetime import date

import altair as alt
import pandas as pd
import streamlit as st

from . import bases, contexto, ui
from . import execucao as ex
from .util import inteiro, sem_acento


def _num(v, casas=1, suf="") -> str:
    if v is None or (isinstance(v, float) and pd.isna(v)):
        return "—"
    return f"{v:,.{casas}f}".replace(",", "X").replace(".", ",").replace("X", ".") + suf


@st.cache_resource(show_spinner="Cruzando operações (IW38OP) com os apontamentos (IW47)…", max_entries=6)
def _ops(chave: str, areas: tuple, centros: tuple, tipos: tuple) -> tuple[pd.DataFrame, pd.DataFrame]:
    f = contexto.Filtros(date.today(), date.today(), areas, centros, tipos)
    o = bases.iw38().df
    ordens = f.ordens(o) if o is not None else None
    op = bases.operacoes().df
    if op is not None and ordens is not None:
        op = op[op["Ordem"].isin(set(ordens["Ordem"]))]
    eq = bases.equipe().df
    conf = bases.confirmacoes().df
    ap = ex.apontamentos(conf, eq)
    if centros and len(ap):
        ap = ap[ap["Centro de trabalho"].isin(centros)]
    return ex.operacoes(op, ordens, conf, eq, pd.Timestamp(date.today())), ap


def mostrar(f: contexto.Filtros) -> None:
    if bases.operacoes().df is None:
        st.info("Coloque o export do **IW38OP** (operações) na pasta para medir a execução das atividades.")
        return
    ops, ap = _ops(contexto._chave(), f.areas, f.centros, f.tipos)
    o = bases.iw38().df
    ordens = f.ordens(o) if o is not None else None
    hoje = pd.Timestamp(date.today())
    r = ex.indicadores(ops, ordens, ap, f.ini, f.fim, hoje)
    a_ini, a_fim = (pd.Timestamp(f.ini) - (pd.Timestamp(f.fim) - pd.Timestamp(f.ini)) - pd.Timedelta(days=1)).date(), \
        (pd.Timestamp(f.ini) - pd.Timedelta(days=1)).date()
    ra = ex.indicadores(ops, ordens, ap, a_ini, a_fim, hoje)
    tem_iw47 = bases.confirmacoes().df is not None

    st.caption("Atividade = operação do IW38OP pela **data programada** (1ª data de início); executada = operação "
               "confirmada; a taxa considera só o que já venceu (até hoje). Quem fez vem dos apontamentos da **IW47** "
               "(ordem + operação) com o nome da planilha de Gestão de HH.")

    def delta(k, pp=True):
        if r.get(k) is None or ra.get(k) is None:
            return None
        d = r[k] - ra[k]
        return f"{d:+.1f} p.p.".replace(".", ",") if pp else f"{d:+,.0f}".replace(",", ".")

    c = st.columns(4)
    c[0].metric("Taxa de execução", _num(r["taxa_execucao"], 1, "%"), delta("taxa_execucao"), border=True,
                help="Operações executadas ÷ operações programadas no período com data até hoje (canceladas fora). "
                     "A variação compara com o período anterior de mesma duração.")
    c[1].metric("Executadas", inteiro(r["executadas"]),
                f"de {inteiro(r['devidas'])} devidas · {inteiro(r['programadas'] - r['devidas'])} a vencer",
                delta_color="off", border=True, delta_arrow="off")
    c[2].metric("Atrasadas", inteiro(r["atrasadas"]), "vencidas e não confirmadas",
                delta_color="off", border=True, delta_arrow="off")
    c[3].metric("Execução das ordens", _num(r["taxa_ordens"], 1, "%"), delta("taxa_ordens"), border=True,
                help="Ordens do IW38 com data-base no período (até hoje) concluídas (CONF + ENTE) ÷ ordens devidas.")
    c = st.columns(4)
    jan = r.get("janela_iw47")
    txt_jan = f" (executadas entre {jan[0]:%d/%m/%Y} e {jan[1]:%d/%m/%Y}, período coberto pela IW47)" if jan else ""
    c[0].metric("HH real ÷ programada", _num(r["aderencia_hh"], 0, "%"),
                f"{_num(r['hh_reais'], 0)} h reais de {_num(r['hh_executadas_plan'], 0)} h" if r["aderencia_hh"] is not None
                else None,
                delta_color="off", border=True, delta_arrow="off",
                help="Trabalho planejado (IW38OP) das atividades executadas × horas apontadas na IW47 nelas" + txt_jan
                     + ".")
    c[1].metric("Com apontamento", _num(r["rastreadas"], 1, "%") if tem_iw47 else "—",
                "dá para saber quem fez" if tem_iw47 else "IW47 não encontrada", delta_color="off", border=True,
                delta_arrow="off", help="Atividades executadas que têm apontamento de horas na IW47" + txt_jan + ".")
    c[2].metric("Pessoas", inteiro(r["pessoas"]) if r["pessoas"] is not None else "—",
                f"{_num(r['hh_apontadas'], 0)} h no período" if r["hh_apontadas"] is not None else None,
                delta_color="off", border=True, delta_arrow="off")
    c[3].metric("Dias até executar", _num(r["dias_apos_programacao"], 1),
                "da data programada ao fim real", delta_color="off", border=True, delta_arrow="off")

    # ---------------- programado × executado por semana
    sem = ex.semanal(ops, f.ini, f.fim, hoje)
    if len(sem):
        with st.container(border=True):
            st.markdown("**Programado × executado por semana** — barras = atividades; linha = taxa de execução (%)")
            sem["Rótulo"] = sem["Semana"].dt.strftime("%d/%m")
            ordem_x = list(sem["Rótulo"])
            x = alt.X("Rótulo:N", sort=ordem_x, title="Semana de", axis=alt.Axis(labelAngle=-45, labelOverlap=False))
            longo = sem.melt(id_vars=["Rótulo"], value_vars=["Programadas", "Executadas"], var_name="Tipo",
                             value_name="Atividades")
            barras = alt.Chart(longo).mark_bar().encode(
                x=x, xOffset="Tipo:N", y=alt.Y("Atividades:Q", title="Atividades"),
                color=alt.Color("Tipo:N", scale=alt.Scale(domain=["Programadas", "Executadas"],
                                                         range=[ui.CINZA, ui.VERDE]),
                                legend=alt.Legend(orient="top", title=None)),
                tooltip=["Rótulo:N", "Tipo:N", "Atividades:Q"])
            linha = alt.Chart(sem.dropna(subset=["Taxa"])).mark_line(color=ui.AZUL, point=True, strokeWidth=2).encode(
                x=x, y=alt.Y("Taxa:Q", title="Taxa (%)", scale=alt.Scale(domain=[0, 100])),
                tooltip=["Rótulo:N", alt.Tooltip("Taxa:Q", format=".1f")])
            ui.mostrar(alt.layer(barras, linha).resolve_scale(y="independent").properties(height=300))

    # ---------------- taxa por centro / natureza / área
    vivas = ops[(ops["Situação"] != ex.CANCELADA) & ui.entre(ops["Início"], f.ini, f.fim) & (ops["Início"] <= hoje)]
    if len(vivas):
        e, d = st.columns(2)
        with e, st.container(border=True):
            st.markdown("**Execução por centro de trabalho**")
            g = vivas.groupby("Centro de trabalho")
            t = pd.DataFrame({"Programadas": g.size(), "Executadas": g["Concluída"].sum(),
                              "Atrasadas": g["Situação"].apply(lambda s: int((s == ex.ATRASADA).sum())),
                              "HH programadas": g["Horas"].sum()}).reset_index()
            t["Taxa"] = t["Executadas"] / t["Programadas"] * 100
            t = t.sort_values("Programadas", ascending=False)
            st.dataframe(t, hide_index=True, width="stretch", height=ui.altura_tabela(320),
                         column_config={"Taxa": st.column_config.ProgressColumn("Taxa de execução", format="%.0f%%",
                                                                                min_value=0, max_value=100),
                                        "HH programadas": st.column_config.NumberColumn(format="%.0f")})
        with d, st.container(border=True):
            st.markdown("**Execução por tipo de trabalho e por área**")
            for col, rot in (("Natureza", "Tipo de trabalho"), ("Área", "Área")):
                if col in vivas:
                    g = vivas.assign(**{col: vivas[col].fillna("—").replace("", "—")}).groupby(col)
                    t = pd.DataFrame({"Programadas": g.size(), "Executadas": g["Concluída"].sum()}).reset_index()
                    t["Taxa"] = t["Executadas"] / t["Programadas"] * 100
                    st.dataframe(t.rename(columns={col: rot}).sort_values("Programadas", ascending=False).head(8),
                                 hide_index=True, width="stretch",
                                 column_config={"Taxa": st.column_config.ProgressColumn(
                                     "Taxa de execução", format="%.0f%%", min_value=0, max_value=100)})

    # ---------------- quem fez o quê
    st.markdown("#### :material/badge: Quem fez o quê")
    if not tem_iw47:
        st.info("Coloque o export da **IW47** (apontamentos) na pasta para ver quem executou cada atividade.")
    else:
        pes = ex.por_pessoa(ap, ops, bases.equipe().df, f.ini, f.fim)
        if not len(pes):
            st.caption("Nenhum apontamento na IW47 no período.")
        else:
            st.caption(f"{inteiro(len(pes))} pessoas apontaram horas no período (data do apontamento) · selecione uma "
                       "pessoa para ver as atividades que ela executou")
            ev = st.dataframe(
                pes[["Pessoa", "Nº pessoal", "Cargo", "Área", "Turma", "Centro (mais apontado)", "HH apontadas",
                     "Ordens", "Operações", "Dias com apontamento", "% HH em plano", "Último apontamento"]],
                hide_index=True, width="stretch", height=ui.altura_tabela(320), on_select="rerun",
                selection_mode="single-row", key=f"ex_pes_{f.ini}_{f.fim}_{f.centros}",
                column_config={"HH apontadas": st.column_config.ProgressColumn(
                                   "HH apontadas", format="%.1f h", min_value=0,
                                   max_value=float(pes["HH apontadas"].max() or 1)),
                               "% HH em plano": st.column_config.NumberColumn(format="%.0f%%"),
                               "Último apontamento": ui.col_data()})
            linhas = ev.selection.rows if ev and ev.selection else []
            if linhas and linhas[0] < len(pes):
                p = pes.iloc[linhas[0]]
                a = ap[(ap["Nº pessoal"] == p["Nº pessoal"]) & ui.entre(ap["Data"], f.ini, f.fim)]
                info = ops.drop_duplicates(["Ordem", "Op"]).set_index(["Ordem", "Op"])
                a = a.join(info[["Texto da operação", "Equipamento", "Objeto técnico", "Situação", "Natureza"]]
                           if "Natureza" in info else info[["Texto da operação", "Equipamento", "Objeto técnico",
                                                             "Situação"]], on=["Ordem", "Op"])
                st.markdown(f"**{p['Pessoa']}** ({p['Nº pessoal']}) · {_num(p['HH apontadas'])} h em "
                            f"{inteiro(p['Ordens'])} ordens / {inteiro(p['Operações'])} atividades")
                cols = [c for c in ["Data", "Ordem", "Operação", "Texto da operação", "Objeto técnico", "Equipamento",
                                    "Natureza", "Centro de trabalho", "Horas", "Situação"] if c in a]
                st.dataframe(a.sort_values("Data", ascending=False)[cols], hide_index=True, width="stretch",
                             height=ui.altura_tabela(300),
                             column_config={"Data": ui.col_data(), "Horas": st.column_config.NumberColumn(format="%.2f"),
                                            "Situação": "Situação da atividade"})
            ui.baixar(pes, "quem_fez_o_que", "Baixar por pessoa (Excel)", chave="ex_baixar_pes")

    # ---------------- atividades
    st.markdown("#### :material/checklist: Atividades do período")
    per = ops[ui.entre(ops["Início"], f.ini, f.fim)]
    with ui.caixa_filtros("Filtros das atividades"):
        l1 = st.columns([3, 2, 2, 2])
        busca = l1[0].text_input("Buscar", key="ex_busca", placeholder="ordem, atividade, equipamento, pessoa…")
        sel_sit = l1[1].multiselect("Situação", ex.SITUACOES, key="ex_sit", placeholder="Todas")
        sel_ctr = l1[2].multiselect("Centro de trabalho", sorted(c for c in per["Centro de trabalho"].unique() if c),
                                    key="ex_ctr", placeholder="Todos")
        pessoas = sorted({n.strip() for s in per["Executado por"] for n in s.split(",") if n.strip()})
        sel_pes = l1[3].multiselect("Executado por", pessoas, key="ex_pes", placeholder="Todos")
    m = pd.Series(True, index=per.index)
    if busca.strip():
        hay = (per["Ordem"] + " " + per["Texto da operação"] + " " + per["Equipamento"] + " " + per["Objeto técnico"]
               + " " + per["Executado por"]).map(lambda s: sem_acento(s).upper())
        for termo in sem_acento(busca).upper().split():
            m &= hay.str.contains(termo, regex=False)
    if sel_sit:
        m &= per["Situação"].isin(sel_sit)
    if sel_ctr:
        m &= per["Centro de trabalho"].isin(sel_ctr)
    if sel_pes:
        m &= per["Executado por"].map(lambda s: any(p in s.split(", ") for p in sel_pes))
    vis = per[m]
    cols = [c for c in ["Início", "Ordem", "Operação", "Texto da operação", "Objeto técnico", "Equipamento",
                        "Centro de trabalho", "Natureza", "Situação", "Executado por", "Horas", "HH real", "Fim real",
                        "Dias após a programação"] if c in vis]
    st.caption(f"{inteiro(len(vis))} atividades · " + " · ".join(
        f"{inteiro((vis['Situação'] == s).sum())} {s.lower()}" for s in ex.SITUACOES if (vis["Situação"] == s).any()))
    st.dataframe(vis[cols].head(5000).style.map(
        lambda s: f"color: {ex.COR.get(s, '')}; font-weight: 700" if s in ex.COR else "", subset=["Situação"]),
        hide_index=True, width="stretch", height=ui.altura_tabela(420),
        column_config={"Início": ui.col_data("Programada"), "Fim real": ui.col_data(),
                       "Horas": st.column_config.NumberColumn("HH plan.", format="%.2f"),
                       "HH real": st.column_config.NumberColumn("HH real", format="%.2f"),
                       "Texto da operação": st.column_config.TextColumn("Atividade", width="large"),
                       "Executado por": st.column_config.TextColumn(width="medium")})
    if len(vis) > 5000:
        st.caption("Mostrando as 5.000 primeiras — baixe a lista completa.")
    ui.baixar(vis[cols], "atividades_execucao", "Baixar atividades (Excel)", chave="ex_baixar_ativ")
