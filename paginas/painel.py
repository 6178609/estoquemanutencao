import altair as alt
import pandas as pd
import streamlit as st

from central import bases, ui
from central.leitura import IW38
from central.util import MESES, brl, brl_curto, inteiro, pct

ui.cabecalho("Painel de manutenção", "Ordens, custos, estoque e compras numa tela só — atualiza sozinho quando chega export novo")

base = bases.iw38()
if not ui.aviso_base(base, IW38):
    st.stop()

df, todas, desc = ui.filtros_ordens(base.df)
estoque = bases.mb52()
req = bases.requisicoes()

st.caption(f"Período: **{desc}** · {inteiro(len(df))} ordens no recorte · base IW38 de {ui.local(base.atualizado)}")

# ----------------------------------------------------------------------------
# Indicadores
# ----------------------------------------------------------------------------
total = len(df)
prev = int(df["Com plano"].sum())
corr = total - prev
custo = df["Custo real"].sum()
custo_corr = df.loc[~df["Com plano"], "Custo real"].sum()
com_custo = int((df["Custo real"] != 0).sum())
pend = todas[todas["Situação"].isin(bases.PENDENTES)]
atrasadas = int(pend["Atrasada"].sum())

c = st.columns(5)
c[0].metric("Ordens no período", inteiro(total), border=True, delta_arrow="off")
c[1].metric("Com plano", pct(prev, total), f"{inteiro(prev)} preventivas", delta_color="off", border=True, delta_arrow="off",
            help="Ordens com plano de manutenção. Referência de classe mundial: acima de 70%.")
c[2].metric("Sem plano", inteiro(corr), f"{pct(corr, total)} do total", delta_color="off", border=True, delta_arrow="off")
c[3].metric("Backlog hoje", inteiro(len(pend)), f"{inteiro(atrasadas)} atrasadas", delta_color="inverse"
            if atrasadas else "off", border=True, delta_arrow="off", help="Ordens abertas ou liberadas, de qualquer data, com os filtros de centro e tipo.")
c[4].metric("Duração média", f"{df['Duração (dias)'].mean():.1f} d".replace(".", ",") if df["Duração (dias)"].notna().any() else "—",
            "início → fim", delta_color="off", border=True, delta_arrow="off")

c = st.columns(5)
c[0].metric("Custo real", brl_curto(custo), border=True, delta_arrow="off", help=brl(custo))
c[1].metric("Custo corretivo", brl_curto(custo_corr), f"{pct(custo_corr, custo)} do custo", delta_color="off", border=True, delta_arrow="off",
            help=brl(custo_corr))
c[2].metric("Custo médio", "R$ " + inteiro(round(custo / com_custo)) if com_custo else "—", f"por ordem · {inteiro(com_custo)} c/ custo",
            delta_color="off", border=True, delta_arrow="off")
if estoque.df is not None:
    zerados = int((estoque.df["Estoque"] <= 0).sum())
    c[3].metric("Itens zerados", inteiro(zerados), f"de {inteiro(len(estoque.df))} no MB52", delta_color="off", border=True, delta_arrow="off")
else:
    c[3].metric("Itens zerados", "—", "MB52 não encontrado", delta_color="off", border=True, delta_arrow="off")
if req.df is not None:
    p = req.df[req.df["Pendente"]]
    c[4].metric("Compras a aprovar", brl_curto(p["Total"].sum()), f"{inteiro(len(p))} requisições",
                delta_color="off", border=True, delta_arrow="off", help=brl(p["Total"].sum()))
else:
    c[4].metric("Compras a aprovar", "—", "base de requisições não encontrada", delta_color="off", border=True, delta_arrow="off")

# ----------------------------------------------------------------------------
# Notas (IW28) e carga em horas (IW38OP)
# ----------------------------------------------------------------------------
notas = bases.notas().df
oper = bases.operacoes().df
hh_pend = None
if oper is not None:
    abertas = set(pend["Ordem"])  # ordens abertas/liberadas hoje, com os filtros de centro e tipo
    hh_pend = oper[oper["Ordem"].isin(abertas) & ~oper["Concluída"] & ~oper["Cancelada"]]
if notas is not None or hh_pend is not None:
    c = st.columns(4)
    if notas is not None:
        sem_ordem = notas[~notas["Com ordem"]]
        recentes = notas[notas["Data"] >= pd.Timestamp.now().normalize() - pd.Timedelta(days=30)]
        c[0].metric("Notas sem ordem", inteiro(len(sem_ordem)), f"{inteiro((sem_ordem['Dias'] > 7).sum())} há mais de 7 dias",
                    delta_color="off", border=True, delta_arrow="off", help="Pedidos da fábrica (IW28) que ainda não viraram ordem.")
        c[1].metric("Paradas de máquina (30 dias)", inteiro(recentes["Com parada"].sum()),
                    f"{inteiro(len(recentes))} notas no período", delta_color="off", border=True, delta_arrow="off")
    if hh_pend is not None:
        c[2].metric("Backlog em horas (HH)", f"{hh_pend['Horas'].sum():,.0f} h".replace(",", "."),
                    f"{inteiro(hh_pend['Ordem'].nunique())} ordens com operação aberta", delta_color="off", border=True,
                    delta_arrow="off", help="Trabalho planejado das operações não confirmadas das ordens abertas (IW38OP).")
        c[3].metric("Pessoas-hora por dia útil", f"{hh_pend['Horas'].sum() / 22:,.0f} h/dia".replace(",", "."),
                    "para zerar o backlog em 1 mês", delta_color="off", border=True, delta_arrow="off")

# ----------------------------------------------------------------------------
# Evolução mensal
# ----------------------------------------------------------------------------
mensal = df.dropna(subset=["Data"]).assign(Mês=lambda d: d["Data"].dt.to_period("M").dt.to_timestamp())
mensal["Rótulo"] = mensal["Mês"].map(lambda m: f"{MESES[m.month - 1]}/{m:%y}")
with st.container(border=True):
    st.markdown("**Ordens e custo por mês**")
    if mensal.empty:
        st.caption("Sem ordens datadas no período.")
    else:
        qtd = mensal.groupby(["Mês", "Rótulo", "Natureza"], observed=True).size().reset_index(name="Ordens")
        cst = mensal.groupby(["Mês", "Rótulo"])["Custo real"].sum().reset_index()
        ordem_x = list(cst.sort_values("Mês")["Rótulo"])
        x = alt.X("Rótulo:N", title=None, sort=ordem_x, axis=alt.Axis(labelAngle=0))
        barras = alt.Chart(qtd).mark_bar(cornerRadiusTopLeft=2, cornerRadiusTopRight=2).encode(
            x=x, y=alt.Y("Ordens:Q", title="Ordens"),
            color=alt.Color("Natureza:N", scale=alt.Scale(domain=["Preventiva (com plano)", "Corretiva / avulsa"],
                                                          range=[ui.VERDE, ui.LARANJA]),
                            legend=alt.Legend(orient="top", title=None)),
            tooltip=[alt.Tooltip("Rótulo:N", title="Mês"), "Natureza:N", "Ordens:Q"],
        )
        linha = alt.Chart(cst).mark_line(color=ui.AZUL, point=True, strokeWidth=2).encode(
            x=x, y=alt.Y("Custo real:Q", title="Custo real (R$)", axis=alt.Axis(format="~s")),
            tooltip=[alt.Tooltip("Rótulo:N", title="Mês"), alt.Tooltip("Custo real:Q", format=",.2f")],
        )
        ui.mostrar(alt.layer(barras, linha).resolve_scale(y="independent").properties(height=280))
        st.caption("Barras: quantidade de ordens (verde = com plano, laranja = sem plano) · linha azul: custo real no mês.")

# ----------------------------------------------------------------------------
# Equipamentos que mais pesam
# ----------------------------------------------------------------------------
por_eq = (df[df["Equip. (chave)"] != ""]
          .groupby("Equip. (chave)")
          .agg(Nome=("Objeto técnico", "first"), Ordens=("Ordem", "size"), Corretivas=("Com plano", lambda s: int((~s).sum())),
               Custo=("Custo real", "sum"))
          .reset_index())
por_eq["Equipamento"] = por_eq.apply(lambda r: f"{r['Nome'] or r['Equip. (chave)']}"[:45], axis=1)

e, d = st.columns(2)
with e, st.container(border=True):
    st.markdown("**Top 10 — custo por equipamento**")
    top = por_eq.nlargest(10, "Custo")
    if top["Custo"].sum() > 0:
        ui.mostrar(ui.grafico_barras_h(top, "Equipamento", "Custo", ui.AZUL, ",.2f"))
    else:
        st.caption("Sem custo lançado no período.")
with d, st.container(border=True):
    st.markdown("**Top 10 — reincidência de corretivas**")
    top = por_eq[por_eq["Corretivas"] > 0].nlargest(10, "Corretivas")
    if len(top):
        ui.mostrar(ui.grafico_barras_h(top, "Equipamento", "Corretivas", ui.LARANJA))
        st.caption("Muitas corretivas no mesmo equipamento = candidato a análise de causa raiz ou a um plano preventivo.")
    else:
        st.caption("Nenhuma corretiva no período.")

# ----------------------------------------------------------------------------
# Distribuições
# ----------------------------------------------------------------------------
a, b, c3 = st.columns(3)
with a, st.container(border=True):
    st.markdown("**Ordens por centro de trabalho**")
    s = df["Centro de trabalho"].replace("", "—").value_counts().head(10).rename_axis("Centro").reset_index(name="Ordens")
    ui.mostrar(ui.grafico_barras_h(s, "Centro", "Ordens", ui.VERDE))
with b, st.container(border=True):
    st.markdown("**Ordens por tipo**")
    s = df["Tipo"].replace("", "—").value_counts().head(10).rename_axis("Tipo").reset_index(name="Ordens")
    ui.mostrar(ui.grafico_barras_h(s, "Tipo", "Ordens", ui.CIANO))
with c3, st.container(border=True):
    st.markdown("**Idade do backlog (hoje)**")
    if len(pend):
        faixas = pd.cut(pend["Dias em aberto"], [-1, 30, 90, 180, 365, 10**6],
                        labels=["até 30 d", "31–90 d", "91–180 d", "181–365 d", "mais de 1 ano"])
        s = faixas.value_counts(sort=False).rename_axis("Idade").reset_index(name="Ordens")
        ch = alt.Chart(s).mark_bar(color=ui.VERMELHO, cornerRadiusEnd=3, height=16).encode(
            y=alt.Y("Idade:N", sort=list(s["Idade"]), title=None), x=alt.X("Ordens:Q", title=None),
            tooltip=["Idade:N", "Ordens:Q"]).properties(height=170)
        ui.mostrar(ch)
    else:
        st.caption("Nenhuma ordem pendente.")

if hh_pend is not None and len(hh_pend):
    with st.container(border=True):
        st.markdown("**Backlog em horas por centro de trabalho** — operações abertas (IW38OP)")
        hh = hh_pend.assign(Centro=hh_pend["Centro de trabalho"].replace("", "—")).groupby("Centro")["Horas"].sum()
        hh = hh.round(0).astype(int).nlargest(12).rename_axis("Centro").reset_index(name="Horas")
        ui.mostrar(ui.grafico_barras_h(hh, "Centro", "Horas", ui.AZUL))

# ----------------------------------------------------------------------------
# Leitura rápida
# ----------------------------------------------------------------------------
frases = []
if total:
    frases.append(("Boa aderência ao plano" if prev / total >= 0.7 else "Aderência ao plano abaixo do ideal")
                  + f": **{pct(prev, total)}** das ordens têm plano de manutenção (referência: acima de 70%).")
if custo:
    frases.append(f"O custo corretivo representa **{pct(custo_corr, custo)}** do gasto ({brl(custo_corr)} de {brl(custo)}).")
if len(por_eq) and por_eq["Custo"].max() > 0:
    t = por_eq.nlargest(1, "Custo").iloc[0]
    frases.append(f"Maior consumidor: **{t['Equipamento']}** — {brl(t['Custo'])} em {t['Ordens']} ordens.")
if len(por_eq) and por_eq["Corretivas"].max() > 1:
    t = por_eq.nlargest(1, "Corretivas").iloc[0]
    frases.append(f"Maior reincidência: **{t['Equipamento']}** com {t['Corretivas']} corretivas no período.")
if atrasadas:
    velhas = int((pend["Dias em aberto"] > 365).sum())
    frases.append(f"**{inteiro(atrasadas)}** ordens pendentes já passaram da data-base"
                  + (f"; {inteiro(velhas)} estão abertas há mais de 1 ano — vale uma limpeza no SAP." if velhas else "."))
if estoque.df is not None:
    cad = bases.ler_cadastro(bases.ARQ_CAD_MAT)
    minimos = {k: v.get("minimo") for k, v in cad.items() if v.get("minimo") is not None}
    if minimos:
        abaixo = estoque.df[estoque.df["Material"].map(minimos).fillna(-1) > estoque.df["Estoque"]]
        if len(abaixo):
            frases.append(f"Estoque: **{inteiro(len(abaixo))}** materiais abaixo do mínimo cadastrado.")
if notas is not None and (~notas["Com ordem"]).any():
    velhas = notas[~notas["Com ordem"] & (notas["Dias"] > 30)]
    frases.append(f"Notas: **{inteiro((~notas['Com ordem']).sum())}** sem ordem"
                  + (f", {inteiro(len(velhas))} delas há mais de 30 dias." if len(velhas) else "."))
if hh_pend is not None and len(hh_pend):
    frases.append(f"Carga pendente: **{hh_pend['Horas'].sum():,.0f} horas** de operações abertas".replace(",", ".")
                  + f", a maior em {hh_pend.groupby('Centro de trabalho')['Horas'].sum().idxmax()}.")
if req.df is not None and req.df["Pendente"].any():
    p = req.df[req.df["Pendente"]]
    frases.append(f"Compras: **{inteiro(len(p))}** requisições aguardando aprovação ({brl(p['Total'].sum())}), "
                  f"a mais antiga há {int(p['Dias aguardando'].max() or 0)} dias.")

if frases:
    with st.container(border=True):
        st.markdown("**Leitura rápida**")
        st.markdown("\n".join(f"- {f}" for f in frases))
