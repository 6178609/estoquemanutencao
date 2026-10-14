"""Gestão de MRO (consulta): as peças de reposição vinculadas a cada equipamento e a situação delas no estoque.

O vínculo é o campo `materiais` do cadastro de equipamentos (o mesmo da aba Equipamentos). Vincular e desvincular
peças é feito no site novo (aba Gestão de MRO) ou no cadastro do equipamento."""

import pandas as pd
import streamlit as st

from central import bases, ui
from central.util import inteiro, sem_acento

ui.cabecalho("Gestão de MRO", "As peças de reposição de cada equipamento e onde cada material é usado")

cad = bases.ler_cadastro(bases.ARQ_CAD_EQUIP)
cad_mat = bases.ler_cadastro(bases.ARQ_CAD_MAT)
estoque = bases.mb52().df
ih08 = bases.equipamentos().df

nome_sap = dict(zip(ih08["Equipamento"], ih08["Denominação"])) if ih08 is not None else {}
abc = dict(zip(ih08["Equipamento"], ih08["Código ABC"])) if ih08 is not None else {}
saldo = dict(zip(estoque["Material"], estoque["Estoque"])) if estoque is not None else {}
descr = dict(zip(estoque["Material"], estoque["Descrição"])) if estoque is not None else {}
CRIT_ABC = {"A": "Alta", "B": "Média", "C": "Baixa"}

# campo de ordenação de cada equipamento: o mais usado nas ordens dele (IW38)
iw38 = bases.iw38().df
campo_de = {}  # sem anotação de tipo (a "magic" do Streamlit quebra com ela)
if iw38 is not None and "Campo de ordenação" in iw38:
    o = iw38[["Equip. (chave)", "Campo de ordenação"]].astype(str)
    o = o[(o["Equip. (chave)"] != "") & (o["Campo de ordenação"].str.strip() != "")]
    o["Campo de ordenação"] = o["Campo de ordenação"].str.strip().str.upper()
    campo_de = (o.groupby(["Equip. (chave)", "Campo de ordenação"]).size().reset_index(name="n")
                .sort_values(["n", "Campo de ordenação"], ascending=[False, True])
                .drop_duplicates("Equip. (chave)").set_index("Equip. (chave)")["Campo de ordenação"].to_dict())


def situacao(cod: str) -> str:
    if cod not in saldo:
        return "Sem saldo no MB52"
    q = saldo[cod]
    try:
        minimo = float((cad_mat.get(cod) or {}).get("minimo") or 0)
    except (TypeError, ValueError):
        minimo = 0
    if q <= 0:
        return "Zerado"
    return "Abaixo do mínimo" if minimo and q < minimo else "Em estoque"


linhas = []
for tag, info in cad.items():
    if not isinstance(info, dict):
        continue
    crit = info.get("criticidade") or CRIT_ABC.get(str(abc.get(tag, "")).upper().strip(), "")
    for cod in dict.fromkeys(str(m) for m in (info.get("materiais") or [])):
        linhas.append({"Campo de ordenação": campo_de.get(tag, ""), "Equipamento": tag, "Nome": str(info.get("nome") or nome_sap.get(tag) or ""), "Criticidade": crit,
                       "Material": cod, "Descrição": str(descr.get(cod) or ""), "Estoque": saldo.get(cod), "Situação da peça": situacao(cod)})

st.info("Para vincular ou desvincular peças, use a aba **Gestão de MRO** do site novo (ou o cadastro do equipamento).")
if not linhas:
    st.warning("Nenhuma peça vinculada a equipamentos ainda.")
    st.stop()

t = pd.DataFrame(linhas)
em_falta = t["Situação da peça"] != "Em estoque"
c = st.columns(4)
c[0].metric("Equipamentos com peças", inteiro(t["Equipamento"].nunique()))
c[1].metric("Materiais vinculados", inteiro(t["Material"].nunique()))
c[2].metric("Peças em falta", inteiro(t.loc[em_falta, "Material"].nunique()))
c[3].metric("Peças críticas em falta", inteiro(t.loc[em_falta & (t["Criticidade"] == "Alta"), "Material"].nunique()))

busca = st.text_input("Buscar", placeholder="campo de ordenação, equipamento, nome, material ou descrição…", key="mro_busca")
so_falta = st.toggle("Só peças em falta", key="mro_falta")
m = pd.Series(True, index=t.index)
if busca.strip():
    hay = (t["Campo de ordenação"] + " " + t["Equipamento"] + " " + t["Nome"] + " " + t["Material"] + " " + t["Descrição"]).map(lambda s: sem_acento(s).upper())
    for termo in sem_acento(busca).upper().split():
        m &= hay.str.contains(termo, regex=False)
if so_falta:
    m &= em_falta
st.dataframe(t[m], hide_index=True, use_container_width=True)
ui.baixar(t[m], "gestao_mro", "Baixar Excel")
