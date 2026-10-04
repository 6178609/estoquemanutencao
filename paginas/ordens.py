import pandas as pd
import streamlit as st

from central import bases, contexto, ui
from central import indicadores as ind
from central.leitura import IW38
from central.util import brl, brl_curto, inteiro, sem_acento

ui.cabecalho("Ordens de manutenção · IW38", "Filtre, pesquise, abra o detalhe de uma ordem e exporte o resultado")

base = bases.iw38()
if not ui.aviso_base(base, IW38):
    st.stop()

fg = contexto.filtros_globais()
enriq = contexto.ordens_enriquecidas()
df = fg.periodo(fg.ordens(enriq))
desc = fg.desc
cad = contexto.metas()
atual, anterior = contexto.resultados(fg)
contexto.grade([ind.POR_ID[k] for k in ["pct_plano", "pct_emergencial", "no_prazo", "idade_backlog"]], atual, anterior,
               cad, contexto.serie_mensal(fg), colunas=4, prefixo="o-", link=False)

ESSENCIAIS = ["Ordem", "Tipo (nome)", "Classe", "Texto", "Equipamento", "Objeto técnico", "Situação", "Status usuário",
              "Natureza", "Plano", "Início", "Fim", "Fim real", "Prazo", "Lead time (dias)", "HH apontadas",
              "Centro de trabalho", "Custo real"]
INTERNAS = {"_busca", "Equip. (chave)", "Data"}
todas_colunas = [c for c in df.columns if c not in INTERNAS]

# ----------------------------------------------------------------------------
# Filtros da página
# ----------------------------------------------------------------------------
with ui.caixa_filtros():
    l1 = st.columns([3, 2, 2, 2])
    busca = l1[0].text_input("Buscar", placeholder="nº da ordem, texto, equipamento, local, plano…", key="o_busca")
    situacoes = l1[1].multiselect("Situação", bases.SITUACOES, key="o_sit", placeholder="Todas")
    natureza = l1[2].segmented_control("Tipo de trabalho", ["Todas", bases.NAT_PLANO, bases.NAT_BACKLOG], default="Todas",
                                       key="o_nat", help="Plano de manutenção = número na coluna Plano; Backlog = sem número")
    tokens = sorted({t for s in df["Status usuário"].unique() for t in s.split()})
    rot = {t: f"{t} · {bases.STATUS_USUARIO[t]}" if t in bases.STATUS_USUARIO else t for t in tokens}
    sel_tok = l1[3].multiselect("Status do usuário", tokens, format_func=rot.get, key="o_tok", placeholder="Todos")

    l2 = st.columns([2, 2, 2, 3])
    classes = sorted(c for c in df["Classe"].unique() if c)
    sel_cls = l2[0].multiselect("Classe WCM", classes, key="o_cls", placeholder="Todas",
                                help="Classe do tipo de ordem (Metas e parâmetros › Tipos de ordem)")
    so_atrasadas = l2[1].toggle("Só atrasadas", key="o_atr", help="Abertas/liberadas com data-base já vencida")
    so_custo = l2[2].toggle("Só com custo", key="o_cst")
    padrao = ["Ordem", "Texto", "Situação", "Início", "Prazo"] if ui.eh_celular() else ESSENCIAIS
    colunas = l2[3].multiselect("Colunas", todas_colunas, default=[c for c in padrao if c in todas_colunas], key="o_cols")

m = pd.Series(True, index=df.index)
if busca.strip():
    for termo in sem_acento(busca).upper().split():
        m &= df["_busca"].str.contains(termo, regex=False)
if situacoes:
    m &= df["Situação"].isin(situacoes)
if natureza == bases.NAT_PLANO:
    m &= df["Com plano"]
elif natureza == bases.NAT_BACKLOG:
    m &= ~df["Com plano"]
if sel_tok:
    alvo = set(sel_tok)
    m &= df["Status usuário"].map(lambda s: bool(alvo & set(s.split())))
if sel_cls:
    m &= df["Classe"].isin(sel_cls)
if so_atrasadas:
    m &= df["Atrasada"]
if so_custo:
    m &= df["Custo real"] != 0
f = df.loc[m].sort_values("Data", ascending=False, na_position="last")

# ----------------------------------------------------------------------------
# Indicadores do filtro
# ----------------------------------------------------------------------------
c = st.columns(5)
c[0].metric("Ordens", inteiro(len(f)), f"de {inteiro(len(df))} no recorte", delta_color="off", border=True, delta_arrow="off")
c[1].metric("Custo real", brl_curto(f["Custo real"].sum()), brl(f["Custo real"].sum()), delta_color="off", border=True,
            delta_arrow="off")
cc = int((f["Custo real"] != 0).sum())
c[2].metric("Custo / ordem", brl(f["Custo real"].sum() / cc if cc else 0), border=True, delta_arrow="off")
c[3].metric("Lead time médio", f"{f['Lead time (dias)'].mean():.1f} dias".replace(".", ",") if f["Lead time (dias)"].notna().any()
            else "—", "início → fim real", delta_color="off", border=True, delta_arrow="off")
c[4].metric("Atrasadas", inteiro(f["Atrasada"].sum()), border=True, delta_arrow="off")

# ----------------------------------------------------------------------------
# Tabela
# ----------------------------------------------------------------------------
cols = colunas or padrao
config_cols = {
    "Custo real": ui.col_moeda(), "Custo planejado": ui.col_moeda(),
    "Início": ui.col_data(), "Fim": ui.col_data(), "Entrada": ui.col_data(), "Fim real": ui.col_data(),
    "Lead time (dias)": st.column_config.NumberColumn(format="%d"),
    "HH apontadas": st.column_config.NumberColumn(format="%.1f"), "Tipo (nome)": "Tipo",
    "Atrasada": st.column_config.CheckboxColumn(), "Com plano": st.column_config.CheckboxColumn(),
    "Texto": st.column_config.TextColumn(width="large"), "Objeto técnico": st.column_config.TextColumn(width="medium"),
    "Duração (dias)": st.column_config.NumberColumn(format="%d"), "Dias em aberto": st.column_config.NumberColumn(format="%d"),
}
LIMITE = 20000
st.caption(f"{inteiro(len(f))} ordens · clique numa linha para ver o detalhe · clique no cabeçalho para ordenar"
           + (f" · exibindo as {inteiro(LIMITE)} mais recentes (a exportação leva todas)" if len(f) > LIMITE else ""))
evento = st.dataframe(f[cols].head(LIMITE), hide_index=True, width="stretch", height=ui.altura_tabela(460),
                      column_config=config_cols, on_select="rerun", selection_mode="single-row", key="o_tabela")
ui.baixar(f[cols], "ordens_filtradas", "Baixar ordens filtradas (Excel)")

# ----------------------------------------------------------------------------
# Detalhe
# ----------------------------------------------------------------------------
linhas = evento.selection.rows if evento and evento.selection else []
if linhas:
    o = f.head(LIMITE).iloc[linhas[0]]
    st.divider()
    st.subheader(f"Ordem {o['Ordem']} — {o['Texto']}")
    d = st.columns(4)
    d[0].markdown(f"**Situação**  \n{o['Situação']}" + (" · :red[atrasada]" if o["Atrasada"] else ""))
    d[1].markdown(f"**Tipo / classe**  \n{o['Tipo (nome)'] or '—'} / {o['Classe'] or '—'}")
    d[2].markdown(f"**Natureza**  \n{o['Natureza']}" + (f" (plano {o['Plano']})" if o["Plano"] else ""))
    d[3].markdown(f"**Custo real**  \n{brl(o['Custo real'])}")
    d = st.columns(4)
    d[0].markdown(f"**Equipamento**  \n{o['Equipamento'] or '—'} · {o['Objeto técnico'] or '—'}")
    d[1].markdown(f"**Local**  \n{o['Local de instalação'] or '—'}")
    d[2].markdown(f"**Centro de trabalho**  \n{o['Centro de trabalho'] or '—'}")
    fmt = lambda v: v.strftime("%d/%m/%Y") if pd.notna(v) else "—"  # noqa: E731
    d[3].markdown(f"**Datas-base → fim real**  \n{fmt(o['Início'])} → {fmt(o['Fim'])} · real {fmt(o['Fim real'])}"
                  + (f" ({o['Prazo'].lower()})" if o["Prazo"] else ""))
    st.caption(f"Status do sistema: `{o['Status sistema'] or '—'}` · status do usuário: `{o['Status usuário'] or '—'}` · "
               f"criada por {o['Criado por'] or '—'}")

    oper = bases.operacoes().df
    if oper is not None:
        ops = oper[oper["Ordem"] == o["Ordem"]].sort_values("Operação")
        if len(ops):
            st.markdown(f"**Operações (IW38OP)** — {len(ops)} operação(ões), {ops['Horas'].sum():.1f} h planejadas".replace(".", ","))
            st.dataframe(ops[["Operação", "Texto da operação", "Centro de trabalho", "Horas", "Pessoas", "Concluída",
                              "Início", "Fim real"]], hide_index=True, width="stretch",
                         column_config={"Horas": st.column_config.NumberColumn(format="%.1f"), "Início": ui.col_data(),
                                        "Fim real": ui.col_data(), "Concluída": st.column_config.CheckboxColumn("Confirmada")})

    conf = bases.confirmacoes().df
    if conf is not None:
        ap = conf[conf["Ordem"] == o["Ordem"]].sort_values("Data")
        if len(ap):
            eq = bases.equipe().df
            if eq is not None:
                ap = ap.merge(eq[["Nº pessoal", "Cargo"]].rename(columns={"Cargo": "Cargo (equipe)"}), on="Nº pessoal",
                              how="left").assign(Nome=lambda x: x["Nome"].where(x["Nome"] != "", x["Nº pessoal"].map(
                                  dict(zip(eq["Nº pessoal"], eq["Nome"])))))
            st.markdown(f"**Apontamentos (IW47)** — {ap['Horas'].sum():.1f} h reais por {ap['Nº pessoal'].nunique()} "
                        f"pessoa(s)".replace(".", ",", 1))
            st.dataframe(ap[[c for c in ["Data", "Nº pessoal", "Nome", "Cargo (equipe)", "Operação", "Centro de trabalho",
                                         "Atividade", "Horas", "Status sistema"] if c in ap]], hide_index=True,
                         width="stretch", column_config={"Data": ui.col_data(),
                                                         "Horas": st.column_config.NumberColumn(format="%.2f")})

    if o["Equip. (chave)"]:
        hist = base.df[base.df["Equip. (chave)"] == o["Equip. (chave)"]].sort_values("Data", ascending=False)
        st.markdown(f"**Histórico do equipamento** — {inteiro(len(hist))} ordens, {brl(hist['Custo real'].sum())} no total "
                    f"({inteiro((~hist['Com plano']).sum())} de backlog)")
        st.dataframe(hist[["Ordem", "Data", "Tipo", "Natureza", "Texto", "Situação", "Custo real"]].head(200),
                     hide_index=True, width="stretch", height=ui.altura_tabela(260),
                     column_config={"Data": ui.col_data(), "Custo real": ui.col_moeda(),
                                    "Texto": st.column_config.TextColumn(width="large")})
        if st.button("Abrir ficha do equipamento", icon=":material/precision_manufacturing:"):
            st.session_state["eq_sel"] = o["Equip. (chave)"]
            st.switch_page("paginas/equipamentos.py")
