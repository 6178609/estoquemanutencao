from datetime import timedelta

import pandas as pd
import streamlit as st

from central import bases, ui
from central.leitura import REQ
from central.util import brl, hoje_local, inteiro, sem_acento

ui.cabecalho("Requisições de compra", "O que está aguardando aprovação, com quem está parado e há quanto tempo")

base = bases.requisicoes()
if not ui.aviso_base(base, REQ):
    st.stop()

df = base.df

with ui.caixa_filtros():
    f = st.columns([3, 2, 2, 2])
    busca = f[0].text_input("Buscar", placeholder="nº da requisição, item, justificativa…", key="r_busca")
    so_pend = f[1].toggle("Só pendentes de aprovação", value=True, key="r_pend")
    aprov = f[2].multiselect("Aprovador atual", sorted(a for a in df["Aprovador"].unique() if a), key="r_apr", placeholder="Todos")
    solic = f[3].multiselect("Solicitado por", sorted(a for a in df["Solicitante"].unique() if a), key="r_sol", placeholder="Todos")
    datas = df["Enviado em"].dropna()
    padrao = (datas.min().date(), datas.max().date()) if len(datas) else (hoje_local() - timedelta(days=365), hoje_local())
    g = st.columns([3, 6])
    with g[0]:
        ini, fim = ui.filtro_datas("r_faixa", "Enviado em (de / até)", padrao, df["Enviado em"])

m = pd.Series(True, index=df.index)
if busca.strip():
    hay = (df["Requisição"] + " " + df["PO"] + " " + df["Itens"] + " " + df["Justificativa"] + " " + df["Solicitante"]).map(
        lambda s: sem_acento(s).upper())
    for termo in sem_acento(busca).upper().split():
        m &= hay.str.contains(termo, regex=False)
if so_pend:
    m &= df["Pendente"]
if aprov:
    m &= df["Aprovador"].isin(aprov)
if solic:
    m &= df["Solicitante"].isin(solic)
if (ini, fim) != padrao:  # requisição sem data de envio (rascunho) só some quando há filtro de data
    m &= ui.entre(df["Enviado em"], ini, fim)
f = df.loc[m].sort_values(["Pendente", "Total"], ascending=[False, False])

pend = f[f["Pendente"]]
c = st.columns(4)
c[0].metric("Aguardando aprovação", brl(pend["Total"].sum()), f"{inteiro(len(pend))} requisições", delta_color="off", border=True, delta_arrow="off")
c[1].metric("Total no filtro", brl(f["Total"].sum()), f"{inteiro(len(f))} requisições", delta_color="off", border=True, delta_arrow="off")
c[2].metric("Mais antiga pendente", f"{int(pend['Dias aguardando'].max())} dias" if pend["Dias aguardando"].notna().any() else "—",
            border=True, delta_arrow="off")
c[3].metric("Pendentes há mais de 7 dias", inteiro((pend["Dias aguardando"] > 7).sum()), border=True, delta_arrow="off")

e, d = st.columns(2)
with e, st.container(border=True):
    st.markdown("**Valor por status**")
    s = f.assign(Status=f["Status"].replace("", "(sem status)")).groupby("Status")["Total"].sum().reset_index()
    if len(s):
        ui.mostrar(ui.grafico_barras_h(s, "Status", "Total", ui.AZUL, ",.2f"))
with d, st.container(border=True):
    st.markdown("**Pendente por aprovador** (gargalos)")
    s = pend.assign(Aprovador=pend["Aprovador"].replace("", "(sem aprovador)")).groupby("Aprovador")["Total"].sum().reset_index()
    if len(s):
        ui.mostrar(ui.grafico_barras_h(s.nlargest(10, "Total"), "Aprovador", "Total", ui.VERMELHO, ",.2f"))
    else:
        st.caption("Nada pendente no filtro.")

COLS = ["Requisição", "Status", "Aprovador", "Solicitante", "Itens", "Enviado em", "Dias aguardando", "Total", "PO", "Justificativa"]
st.dataframe(f[COLS], hide_index=True, width="stretch", height=ui.altura_tabela(440),
             column_config={"Total": ui.col_moeda("Total (R$)"), "Enviado em": ui.col_data(), "Itens": st.column_config.TextColumn(width="large"),
                            "Dias aguardando": st.column_config.NumberColumn(format="%d")})
ui.baixar(f[COLS], "requisicoes", "Baixar requisições (Excel)")
