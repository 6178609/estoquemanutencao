import numpy as np
import pandas as pd
import streamlit as st

from central import auth, bases, fotos, ui
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
uso = {}  # sem anotação de tipo: a "magic" do Streamlit quebra com ela no Python 3.14
for k, v in cad_eq.items():
    for m in v.get("materiais", []):
        uso.setdefault(m, []).append(f"{k} ({v.get('criticidade', '?')})")

t = base.df.copy()
t["Mínimo"] = t["Material"].map(lambda c: (cad_mat.get(c) or {}).get("minimo")).astype(float)
t["Usado em"] = t["Material"].map(lambda c: ", ".join(uso.get(c, [])))
t["Foto"] = t["Material"].map(lambda c: bases.miniatura_material(cad_mat[c]["foto"], cad_mat[c].get("foto_versao", ""))
                              if (cad_mat.get(c) or {}).get("foto") else None)
TEM_FOTO = t["Foto"].notna()
t["Foto"] = t["Foto"].fillna(fotos.VAZIA)  # célula sem foto em branco (None aparece escrito na tabela)
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
if TEM_FOTO.any():  # coluna de foto só quando algum material tem foto
    COLS = ["Foto", *COLS]
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
        "Foto": st.column_config.ImageColumn("Foto", width="small", help="Envie a foto em **Foto do material**, abaixo"),
    },
)
b1, b2 = st.columns([1, 4])
mudou = editado["Mínimo"].fillna(-1) != vis["Mínimo"].fillna(-1)
if edita and b1.button(f"Salvar mínimos ({int(mudou.sum())})", icon=":material/save:", type="primary", disabled=not mudou.any()):
    # mesclar: muda só o mínimo (apagar o mínimo não apaga a foto do material)
    itens = {r["Material"]: {"minimo": None if pd.isna(r["Mínimo"]) else float(r["Mínimo"])}
             for _, r in editado[mudou].iterrows()}
    bases.gravar_cadastro_lote(bases.ARQ_CAD_MAT, itens, auth.nome_de(eu), mesclar=True)
    st.session_state["_m_salvos"] = st.session_state.get("_m_salvos", 0) + 1
    st.toast(f"{len(itens)} mínimo(s) salvo(s).", icon=":material/check:")
    st.rerun()
with b2:
    ui.baixar(vis[[c for c in COLS if c != "Foto"]], "estoque_filtrado", "Baixar lista (Excel)")

# ----------------------------------------------------------------------------
# Foto do material
# ----------------------------------------------------------------------------
ss = st.session_state
with st.container(border=True):
    st.markdown("**:material/photo_camera: Foto do material** — fica na pasta compartilhada do app; todos veem")
    rotulo = dict(zip(t["Material"], t["Descrição"]))
    opcoes = list(vis["Material"])
    if ss.get("m_foto_mat") and ss["m_foto_mat"] not in opcoes:
        opcoes = [ss["m_foto_mat"], *opcoes] if ss["m_foto_mat"] in rotulo else opcoes
    # index fixo: se mudasse entre execuções o Streamlit recriaria o widget e perderia a escolha
    mat = st.selectbox("Material", opcoes, key="m_foto_mat", index=None, format_func=lambda c: f"{c} · {rotulo.get(c, '')}",
                       placeholder="Escolha o material (a busca acima filtra esta lista)…")
    if mat:
        info = cad_mat.get(mat) or {}
        atual = bases.foto_material(info)
        esq, dir_ = st.columns([2, 3])
        with esq:
            if atual:
                st.image(atual, width="stretch")
                if info.get("atualizado_em"):
                    st.caption(f"Enviada por {info.get('atualizado_por') or 'sem nome'} em "
                               f"{info['atualizado_em'][:16].replace('T', ' ')} (UTC)")
            else:
                st.info("Este material ainda não tem foto.", icon=":material/hide_image:")
        with dir_:
            linha = t[t["Material"] == mat].iloc[0]
            qtd = f"{linha['Estoque']:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")
            st.markdown(f"**{mat}** · {rotulo.get(mat, '')}  \nEstoque: **{qtd} {linha['UM']}** · {linha['Situação']}"
                        + (f"  \nUsado em: {linha['Usado em']}" if linha["Usado em"] else ""))
            if not edita:
                st.caption(":material/lock: Seu perfil é de consulta — peça a um editor para enviar a foto.")
            else:
                n = ss.get("_m_fotos", 0)
                origem = st.segmented_control("Origem da foto", ["Arquivo", "Câmera"], default="Arquivo",
                                              key="m_foto_origem")
                if origem == "Câmera":
                    nova = st.camera_input("Tirar foto", key=f"m_cam_{mat}_{n}")
                else:
                    nova = st.file_uploader("Enviar foto (JPG, PNG ou WEBP)", type=fotos.TIPOS, key=f"m_up_{mat}_{n}")
                a1, a2 = st.columns(2)
                if a1.button("Salvar foto" if not atual else "Trocar foto", icon=":material/save:", type="primary",
                             width="stretch", disabled=nova is None):
                    try:
                        bases.gravar_foto_material(mat, nova.getvalue(), auth.nome_de(eu))
                    except fotos.FotoErro as e:
                        st.error(f"Não foi possível usar a foto: {e}.")
                    else:
                        ss["_m_fotos"] = n + 1
                        st.toast(f"Foto do material {mat} salva.", icon=":material/check:")
                        st.rerun()
                if atual and a2.button("Remover foto", icon=":material/delete:", width="stretch"):
                    bases.remover_foto_material(mat, auth.nome_de(eu))
                    st.rerun()

with st.expander("Saldo por depósito"):
    d = det if not sel_dep else det[det["Depósito"].isin(sel_dep)]
    d = d[d["Material"].isin(set(vis["Material"]))]
    st.dataframe(d, hide_index=True, width="stretch", height=ui.altura_tabela(320),
                 column_config={"Valor": ui.col_moeda(), "Estoque": st.column_config.NumberColumn(format="%.2f")})
