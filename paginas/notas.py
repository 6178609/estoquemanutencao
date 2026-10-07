
import altair as alt
import pandas as pd
import streamlit as st

from central import bases, contexto, ui
from central import indicadores as ind
from central.leitura import NOTAS
from central.util import MESES, inteiro, pct, sem_acento

ui.cabecalho("Notas de manutenção · IW28",
             "Pedidos e falhas registrados pela fábrica: o que ainda não virou ordem, o que parou máquina e onde se repete")

base = bases.notas()
if not ui.aviso_base(base, NOTAS):
    st.stop()
df = base.df
if len(base.origens) > 1:
    st.caption("Base somando " + " + ".join(f"`{o.arquivo.arquivo}`" for o in base.origens)
               + " — a mesma nota em mais de um arquivo conta uma vez (vale o arquivo mais novo).")

# ----------------------------------------------------------------------------
# Filtros
# ----------------------------------------------------------------------------
fg = contexto.filtros_globais()
ini, fim = fg.ini, fg.fim
if bases.iw38().df is not None:
    atual, anterior = contexto.resultados(fg)
    contexto.grade([ind.POR_ID[k] for k in ["quebras", "quebras_a", "reincidencia", "notas_7d"]], atual, anterior,
                   contexto.metas(), contexto.serie_mensal(fg), colunas=4, prefixo="n-", link=False)
df = fg.notas(df)
with ui.caixa_filtros():
    f = st.columns([3, 2, 2, 2, 2])
    busca = f[0].text_input("Buscar", placeholder="nº da nota, descrição, equipamento, notificador…", key="n_busca")
    tipos = sorted(t for t in df["Tipo de nota"].unique() if t)
    sel_tipo = f[1].multiselect("Tipo de nota", tipos, key="n_tipo", placeholder="Todos")
    abcs = [a for a in ["A", "B", "C"] if (df["Código ABC"] == a).any()]
    sel_abc = f[2].multiselect("Criticidade ABC", abcs, key="n_abc", placeholder="Todas")
    so_sem_ordem = f[3].toggle("Só sem ordem", key="n_sem", help="Notas que ainda não viraram ordem de manutenção")
    so_parada = f[4].toggle("Só quebras", key="n_par", help="Quebra = nota Y1 convertida em ordem YM11 (regra da planta)")

m = pd.Series(True, index=df.index)
m &= ui.entre(df["Data"], ini, fim)
if busca.strip():
    hay = (df["Nota"] + " " + df["Ordem"] + " " + df["Descrição"] + " " + df["Objeto técnico"] + " " + df["Equipamento"]
           + " " + df["Notificador"] + " " + df["Local de instalação"]).map(lambda s: sem_acento(s).upper())
    for termo in sem_acento(busca).upper().split():
        m &= hay.str.contains(termo, regex=False)
if sel_tipo:
    m &= df["Tipo de nota"].isin(sel_tipo)
if so_sem_ordem:
    m &= ~df["Com ordem"]
if so_parada:
    m &= df["Quebra"]
if sel_abc:
    m &= df["Código ABC"].isin(sel_abc)
f_ = df.loc[m].sort_values("Data", ascending=False)

# ----------------------------------------------------------------------------
# Indicadores
# ----------------------------------------------------------------------------
sem_ordem = f_[~f_["Com ordem"]]
c = st.columns(5)
c[0].metric("Notas", inteiro(len(f_)), ui.descrever(ini, fim), delta_color="off", border=True, delta_arrow="off")
c[1].metric("Sem ordem", inteiro(len(sem_ordem)), f"{pct(len(sem_ordem), len(f_))} das notas", delta_color="off",
            border=True, delta_arrow="off", help="Ainda não viraram ordem: é a fila de pedidos da fábrica.")
c[2].metric("Sem ordem há mais de 7 dias", inteiro((sem_ordem["Dias"] > 7).sum()), border=True, delta_arrow="off")
c[3].metric("Quebras", inteiro(f_["Quebra"].sum()), f"{pct(int(f_['Quebra'].sum()), len(f_))} das notas",
            delta_color="off", border=True, delta_arrow="off", help="Notas Y1 convertidas em ordem YM11 (regra da planta).")
c[4].metric("Em equipamento classe A", inteiro((f_["Código ABC"] == "A").sum()),
            f"{pct(int((f_['Código ABC'] == 'A').sum()), len(f_))} das notas", delta_color="off", border=True, delta_arrow="off")

# ----------------------------------------------------------------------------
# Gráficos
# ----------------------------------------------------------------------------
if len(f_):
    e, d = st.columns([3, 2])
    with e, st.container(border=True):
        st.markdown("**Notas por semana** — por tipo de nota")
        sem = f_.dropna(subset=["Data"]).assign(Semana=lambda x: x["Data"].dt.to_period("W-SUN").dt.start_time)
        q = sem.groupby(["Semana", "Tipo de nota"]).size().reset_index(name="Notas")
        q["Rótulo"] = q["Semana"].map(lambda s: f"{s:%d}/{MESES[s.month - 1]}")
        ordem_x = list(dict.fromkeys(q.sort_values("Semana")["Rótulo"]))
        ui.mostrar(alt.Chart(q).mark_bar().encode(
            x=alt.X("Rótulo:N", sort=ordem_x, title=None, axis=alt.Axis(labelAngle=-45 if len(ordem_x) > 14 else 0)),
            y=alt.Y("Notas:Q", title=None),
            color=alt.Color("Tipo de nota:N", legend=alt.Legend(orient="top", title=None),
                            scale=alt.Scale(range=[ui.VERDE, ui.LARANJA, ui.AZUL, ui.VERMELHO, ui.CIANO])),
            tooltip=[alt.Tooltip("Rótulo:N", title="Semana de"), "Tipo de nota:N", "Notas:Q"],
        ).properties(height=240))
    with d, st.container(border=True):
        st.markdown("**Equipamentos com mais notas** — reincidência")
        top = (f_[f_["Equip. (chave)"] != ""].groupby("Equip. (chave)")
               .agg(Nome=("Objeto técnico", "first"), Notas=("Nota", "size"), Quebras=("Quebra", "sum"))
               .reset_index().nlargest(10, "Notas"))
        top["Equipamento"] = top.apply(lambda r: (r["Nome"] or r["Equip. (chave)"])[:40], axis=1)
        if len(top):
            ui.mostrar(ui.grafico_barras_h(top, "Equipamento", "Notas", ui.LARANJA))
        else:
            st.caption("Notas sem equipamento informado.")

# ----------------------------------------------------------------------------
# Tabela
# ----------------------------------------------------------------------------
COLS = ["Nota", "Data", "Tipo de nota", "Descrição", "Objeto técnico", "Equipamento", "Código ABC", "Quebra",
        "Com parada", "Ordem", "Tipo da ordem", "Dias", "Centro de trabalho", "Local de instalação", "Notificador"]
st.caption(f"{inteiro(len(f_))} notas · mais recentes primeiro")
st.dataframe(f_[COLS], hide_index=True, width="stretch", height=ui.altura_tabela(460),
             column_config={"Data": ui.col_data(), "Descrição": st.column_config.TextColumn(width="large"),
                            "Com parada": st.column_config.CheckboxColumn("Parada"),
                            "Quebra": st.column_config.CheckboxColumn("Quebra", help="Nota Y1 convertida em ordem YM11"),
                            "Dias": st.column_config.NumberColumn("Dias desde a nota", format="%d"),
                            "Código ABC": st.column_config.TextColumn("ABC", width="small")})
ui.baixar(f_[COLS], "notas", "Baixar notas (Excel)")
