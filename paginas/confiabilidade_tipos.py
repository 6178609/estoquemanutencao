"""MTBF e MTTR por tipo de ordem: os indicadores da Confiabilidade (quebra Y1 → YM11) para os outros tipos de ordem."""

import pandas as pd
import streamlit as st

from central import bases, contexto, ui
from central import confiabilidade_tipos as ct
from central import indicadores as ind

ui.cabecalho("MTBF e MTTR por tipo de ordem",
             "Os mesmos indicadores da Confiabilidade (quebra Y1 → YM11) para os outros tipos de ordem do IW38")

if bases.iw38().df is None:
    st.info("Coloque o export do IW38 na pasta para calcular o MTBF e o MTTR por tipo de ordem.")
    st.stop()

f = contexto.filtros_globais()
d = contexto.dados(f)
disp = ct.tipos_disponiveis(d.ordens)
desc = {t: str((d.tipos.get(t) or {}).get("descricao") or "") for t in disp}
pedidos = st.multiselect("Tipos de ordem", disp, format_func=lambda t: f"{t} · {desc[t]}" if desc.get(t) else t,
                         help="Sem escolha, entram todos os tipos menos o YM11 (quebra, que está na aba Confiabilidade).")
escolhidos = ct.tipos_escolhidos(pedidos, disp)
st.caption(f"Recorte: **{f.desc}** · tipos: **{', '.join(escolhidos) or 'nenhum'}**")

rep = ind.horas_reparo_por_ordem(d.oper, d.conf_todos if d.conf_todos is not None else d.conf)
todos = ct.eventos(d.ordens, escolhidos, rep)
fim = min(pd.Timestamp(f.fim), d.hoje)
ini = pd.Timestamp(f.ini)
dias = max((fim - ini).days + 1, 0)
ev = todos[(todos["Data"] >= ini) & (todos["Data"] <= fim)]
if not len(ev):
    st.info("Nenhuma ordem desses tipos com equipamento no período.")
    st.stop()

r = ct.resumir(ev, dias)
fmt = lambda v, suf: "—" if v is None else f"{v:,.1f}{suf}".replace(",", "X").replace(".", ",").replace("X", ".")  # noqa: E731
c = st.columns(5)
c[0].metric("Ordens", f"{r['Ordens']:,}".replace(",", "."), help="Ordens dos tipos escolhidos, não canceladas, com equipamento.")
c[1].metric("MTBF", fmt(r["MTBF (dias)"], " d"), help="Dias do período × equipamentos com ordem ÷ ordens.")
c[2].metric("MTTR", fmt(r["MTTR (h)"], " h"), help="Média das horas de reparo (IW47: HH ÷ pessoas; sem IW47, IW38OP).")
c[3].metric("Disponibilidade", fmt(r["Disponibilidade (%)"], "%"))
c[4].metric("Ordens com horas", fmt(r["Ordens com horas (%)"], "%"))

st.subheader("Por tipo de ordem")
pt = ct.por_tipo(ev, dias)
pt.insert(1, "Descrição", pt["Tipo"].map(desc).fillna(""))
st.dataframe(pt, hide_index=True, use_container_width=True)

st.subheader("Por equipamento")
st.dataframe(ct.por_equipamento(ev, dias), hide_index=True, use_container_width=True)
