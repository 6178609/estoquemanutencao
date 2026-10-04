import numpy as np
import pandas as pd
import streamlit as st

from central import auth, bases, ui
from central.leitura import MB52
from central.util import brl, brl_curto, inteiro, sem_acento

ui.cabecalho("Estoque de manutenção · MB52", "Saldo atual do almoxarifado, com estoque mínimo por item e as peças ligadas a cada equipamento")

eu = auth.usuario_atual()
edita = auth.pode_editar(eu)
base = bases.mb52()
if not ui.aviso_base(base, MB52):
    st.stop()

cad_mat = bases.ler_cadastro(bases.ARQ_CAD_MAT)
cad_eq = bases.ler_cadastro(bases.ARQ_CAD_EQUIP)
det = base.extra

# quais equipamentos usam cada material
uso: dict[str, list[str]] = {}
for k, v in cad_eq.items():
    for m in v.get("materiais", []):
        uso.setdefault(m, []).append(f"{k} ({v.get('criticidade', '?')})")

t = base.df.copy()
t["Mínimo"] = t["Material"].map(lambda c: (cad_mat.get(c) or {}).get("minimo")).astype(float)
t["Usado em"] = t["Material"].map(lambda c: ", ".join(uso.get(c, [])))
t["Situação"] = np.select(
    [t["Estoque"] <= 0, t["Mínimo"].notna() & (t["Estoque"] < t["Mínimo"])],
    ["Zerado", "Abaixo do mínimo"], default="OK")

zerados = int((t["Situação"] == "Zerado").sum())
abaixo = int((t["Situação"] == "Abaixo do mínimo").sum())
criticos = t[(t["Situação"] != "OK") & (t["Usado em"].str.contains("Alta", regex=False))]

c = st.columns(5)
c[0].metric("Materiais", inteiro(len(t)), border=True, delta_arrow="off")
c[1].metric("Zerados", inteiro(zerados), border=True, delta_arrow="off")
c[2].metric("Abaixo do mínimo", inteiro(abaixo), f"{inteiro(t['Mínimo'].notna().sum())} com mínimo definido", delta_color="off", border=True, delta_arrow="off")
c[3].metric("Peças de equipamento crítico em falta", inteiro(len(criticos)), border=True, delta_arrow="off",
            help="Materiais vinculados a equipamentos de criticidade alta que estão zerados ou abaixo do mínimo.")
c[4].metric("Valor em estoque", brl_curto(t["Valor"].sum()) if t["Valor"].any() else "—",
            border=True, delta_arrow="off", help=brl(t["Valor"].sum()) if t["Valor"].any() else "O export não tem coluna de valor.")

if len(criticos):
    st.error(f"**{len(criticos)} peça(s) de equipamentos críticos sem estoque suficiente:** "
             + "; ".join(f"{r['Material']} {r['Descrição'][:40]} → {r['Usado em']}" for _, r in criticos.head(8).iterrows()),
             icon=":material/warning:")

with ui.caixa_filtros():
    f = st.columns([3, 3, 2])
    busca = f[0].text_input("Buscar material", placeholder="código ou descrição…", key="m_busca")
    situ = f[1].segmented_control("Situação", ["Todos", "Zerado", "Abaixo do mínimo", "OK", "Vinculado a equipamento"],
                                  default="Todos", key="m_sit")
    depositos = sorted({d for d in det["Depósito"].unique() if d})
    sel_dep = f[2].multiselect("Depósito", depositos, key="m_dep", placeholder="Todos")

m = pd.Series(True, index=t.index)
if busca.strip():
    hay = (t["Material"] + " " + t["Descrição"]).map(lambda s: sem_acento(s).upper())
    for termo in sem_acento(busca).upper().split():
        m &= hay.str.contains(termo, regex=False)
if situ in ("Zerado", "Abaixo do mínimo", "OK"):
    m &= t["Situação"] == situ
elif situ == "Vinculado a equipamento":
    m &= t["Usado em"] != ""
if sel_dep:
    mats = set(det.loc[det["Depósito"].isin(sel_dep), "Material"])
    m &= t["Material"].isin(mats)
ordem = t["Situação"].map({"Zerado": 0, "Abaixo do mínimo": 1, "OK": 2})
vis = t.loc[m].assign(_o=ordem).sort_values(["_o", "Descrição"]).drop(columns="_o").reset_index(drop=True)

st.caption(f"{inteiro(len(vis))} materiais" + (" · a coluna **Mínimo** é editável — altere e clique em Salvar mínimos" if edita else ""))
COLS = ["Material", "Descrição", "UM", "Estoque", "Mínimo", "Situação", "Depósitos", "Valor", "Usado em"]
editado = st.data_editor(
    vis[COLS], hide_index=True, width="stretch", height=ui.altura_tabela(480),
    # a chave muda com o filtro: edições pendentes nunca "pulam" para outra linha
    key=f"m_editor_{hash((busca, situ, tuple(sel_dep), st.session_state.get('_m_salvos', 0)))}",
    disabled=[c for c in COLS if c != "Mínimo" or not edita],
    column_config={
        "Estoque": st.column_config.NumberColumn(format="%.2f"),
        "Mínimo": st.column_config.NumberColumn(format="%.2f", min_value=0, help="Estoque mínimo / ponto de reposição"),
        "Valor": ui.col_moeda(),
        "Descrição": st.column_config.TextColumn(width="large"),
    },
)
b1, b2 = st.columns([1, 4])
mudou = editado["Mínimo"].fillna(-1) != vis["Mínimo"].fillna(-1)
if edita and b1.button(f"Salvar mínimos ({int(mudou.sum())})", icon=":material/save:", type="primary", disabled=not mudou.any()):
    itens = {}
    for _, r in editado[mudou].iterrows():
        anterior = cad_mat.get(r["Material"]) or {}
        itens[r["Material"]] = None if pd.isna(r["Mínimo"]) else {**anterior, "minimo": float(r["Mínimo"])}
    bases.gravar_cadastro_lote(bases.ARQ_CAD_MAT, itens, auth.nome_de(eu))
    st.session_state["_m_salvos"] = st.session_state.get("_m_salvos", 0) + 1
    st.toast(f"{len(itens)} mínimo(s) salvo(s).", icon=":material/check:")
    st.rerun()
with b2:
    ui.baixar(vis[COLS], "estoque_filtrado", "Baixar lista (Excel)")

with st.expander("Saldo por depósito"):
    d = det if not sel_dep else det[det["Depósito"].isin(sel_dep)]
    d = d[d["Material"].isin(set(vis["Material"]))]
    st.dataframe(d, hide_index=True, width="stretch", height=ui.altura_tabela(320),
                 column_config={"Valor": ui.col_moeda(), "Estoque": st.column_config.NumberColumn(format="%.2f")})
