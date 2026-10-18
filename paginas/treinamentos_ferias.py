"""Treinamentos e férias (consulta): as férias e os treinamentos da equipe, do cadastro da Gestão de HH.

Lançar e remover é feito no site novo (aba Treinamentos e férias ou Gestão de HH)."""

import pandas as pd
import streamlit as st

from central import bases, hh, ui
from central.util import hoje_local, sem_acento

ui.cabecalho("Treinamentos e férias", "As férias e os treinamentos de cada pessoa da equipe (cadastro da Gestão de HH)")
st.info("Para lançar férias ou treinamentos, use a aba **Treinamentos e férias** do site novo.", icon=":material/info:")

eq = bases.equipe().df
if eq is None or not len(eq):
    st.info("Nenhuma pessoa na equipe. Cadastre a equipe na Gestão de HH do site novo.")
    st.stop()
aus = hh.ausencias(bases.ler_cadastro(hh.ARQ))
aus = aus[aus["Nº pessoal"].isin(set(eq["Nº pessoal"]))].merge(eq[["Nº pessoal", "Nome", "Centro de trabalho"]], on="Nº pessoal")
hoje = pd.Timestamp(hoje_local())

ferias = aus[aus["Tipo"] == "Férias"]
treinos = aus[aus["Tipo"] == "Treinamento"]
c = st.columns(3)
c[0].metric("Em férias hoje", int(ferias[(ferias["De"] <= hoje) & (ferias["Até"] >= hoje)]["Nº pessoal"].nunique()))
c[1].metric("Em treinamento hoje", int(treinos[(treinos["De"] <= hoje) & (treinos["Até"] >= hoje)]["Nº pessoal"].nunique()))
c[2].metric("Começam nos próximos 30 dias", int(len(aus[(aus["De"] > hoje) & (aus["De"] <= hoje + pd.Timedelta(days=30))
                                                     & aus["Tipo"].isin(["Férias", "Treinamento"])])))

st.subheader("Férias")
st.dataframe(ferias[ferias["Até"] >= hoje - pd.Timedelta(days=60)].sort_values("De")[["De", "Até", "Nome", "Nº pessoal", "Centro de trabalho", "Obs"]],
             hide_index=True, use_container_width=True)

st.subheader("Treinamentos e reciclagens")
if len(treinos):
    t = treinos[treinos["Treinamento"].astype(str).str.strip() != ""].copy()
    t["chave"] = t["Treinamento"].astype(str).map(lambda s: sem_acento(s).upper().strip())
    t = t.sort_values("Até").drop_duplicates(["Nº pessoal", "chave"], keep="last")
    dias = (t["Validade"] - hoje).dt.days
    t["Situação"] = [("Sem validade" if pd.isna(d) else "Vencido" if d < 0 else "Vence em breve" if d <= 60 else "Em dia") for d in dias]
    st.dataframe(t.sort_values("Validade")[["Situação", "Treinamento", "Nome", "Centro de trabalho", "Até", "Validade", "Horas", "Entidade"]],
                 hide_index=True, use_container_width=True)
else:
    st.caption("Nenhum treinamento cadastrado.")
