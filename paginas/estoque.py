import numpy as np
import pandas as pd
import streamlit as st

from central import auth, bases, fotos, materiais, materiais_ui, ui
from central.leitura import MB52
from central.util import brl, brl_curto, inteiro, sem_acento

ui.cabecalho("Estoque de manutenção · MB52",
             "Material do almoxarifado (saldo, mínimo e informação técnica de cada item) e o material cadastrado no "
             "Sysmat, com as peças ligadas a cada equipamento")

eu = auth.usuario_atual()
edita = auth.pode_editar(eu)  # estoque mínimo e remover foto: só editor/administrador
envia = bool(eu)              # enviar foto: qualquer usuário logado
ss = st.session_state
VISOES = ["Material do almoxarifado", "Material cadastrado", "Fotos dos materiais"]
ICONES = {VISOES[0]: ":material/inventory_2:", VISOES[1]: ":material/menu_book:", VISOES[2]: ":material/photo_camera:"}


def apos_gravar() -> None:
    """Depois de gravar mínimo ou foto: o vigia da barra lateral não deve tratar a gravação
    como "arquivo novo" — o st.rerun dele roda antes desta página e apagaria as escolhas
    da tela (visão de fotos, material escolhido)."""
    ss["_assinatura"] = bases.assinatura_dados()


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

# informação técnica, categoria e status do cadastro (Sysmat) de cada material do almoxarifado
t = materiais.almoxarifado(base.df, bases.catalogo().df)
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

# a visão de fotos fica no topo, logo abaixo dos cartões, para ninguém precisar procurar
com_foto = sorted(k for k, v in cad_mat.items() if (v or {}).get("foto"))
visao = st.segmented_control(
    "Visão", VISOES, default=VISOES[0], required=True, key="m_visao", label_visibility="collapsed",
    # rótulos fixos (sem contagem): se mudassem entre execuções, o widget seria recriado e voltaria à lista
    format_func=lambda v: f"{ICONES[v]} {v}")

# ============================================================================
# Visão · Material cadastrado (catálogo do Sysmat)
# ============================================================================
if visao == VISOES[1]:
    materiais_ui.mostrar_cadastrados()
    st.stop()

# ============================================================================
# Visão · Fotos dos materiais
# ============================================================================
rotulo = dict(zip(t["Material"], t["Descrição"]))
POR_PAGINA = 40


def abrir_foto(codigo: str) -> None:
    ss["m_foto_mat"] = codigo


@st.cache_data(show_spinner=False, max_entries=512)
def foto_galeria(caminho: str, versao: str) -> str | None:
    """Foto reduzida da galeria, em cache pela versão: sem isso cada clique na tela relia até
    40 fotos inteiras da pasta (no SharePoint/GitHub, 40 downloads por execução)."""
    conteudo = bases.foto_material({"foto": caminho, "foto_versao": versao})
    try:
        return fotos.miniatura(conteudo, 360) if conteudo else None
    except fotos.FotoErro:
        return None


if visao == VISOES[2]:
    # materiais da MB52 + os que têm foto mas saíram do export (a foto continua valendo)
    opcoes = list(t.sort_values("Descrição")["Material"]) + [c for c in com_foto if c not in rotulo]
    if ss.get("m_foto_mat") is not None and ss["m_foto_mat"] not in opcoes:
        del ss["m_foto_mat"]
    with st.container(border=True):
        st.markdown("**:material/add_a_photo: Foto do material** — fica na pasta compartilhada do app; todos veem")
        # index fixo: se mudasse entre execuções o Streamlit recriaria o widget e perderia a escolha
        mat = st.selectbox("Material", opcoes, key="m_foto_mat", index=None,
                           format_func=lambda c: f"{c} · {rotulo.get(c, '(fora da MB52 atual)')}",
                           placeholder="Digite o código ou a descrição do material…")
        if not mat:
            st.caption("Escolha um material acima ou clique em **Abrir** numa foto da galeria abaixo.")
        else:
            info = cad_mat.get(mat) or {}
            atual = bases.foto_material(info)
            esq, dir_ = st.columns([3, 2])
            with esq:
                if atual:
                    st.image(atual, width="stretch")
                    if info.get("atualizado_em"):
                        st.caption(f"Última alteração por {info.get('atualizado_por') or 'sem nome'} em "
                                   f"{info['atualizado_em'][:16].replace('T', ' ')} (UTC)")
                else:
                    st.info("Este material ainda não tem foto.", icon=":material/hide_image:")
            with dir_:
                linhas = t[t["Material"] == mat]
                if len(linhas):
                    linha = linhas.iloc[0]
                    qtd = f"{linha['Estoque']:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")
                    st.markdown(f"**{mat}** · {rotulo.get(mat, '')}  \nEstoque: **{qtd} {linha['UM']}** · "
                                f"{linha['Situação']}" + (f"  \nUsado em: {linha['Usado em']}" if linha["Usado em"] else ""))
                else:
                    st.markdown(f"**{mat}**  \n:gray[Não está no export atual da MB52.]")
                if envia:
                    n = ss.get("_m_fotos", 0)
                    origem = st.segmented_control("Origem da foto", ["Arquivo", "Câmera"], default="Arquivo",
                                                  required=True, key="m_foto_origem")
                    if origem == "Câmera":
                        nova = st.camera_input("Tirar foto", key=f"m_cam_{mat}_{n}")
                    else:
                        nova = st.file_uploader("Enviar foto (JPG, PNG ou WEBP)", type=fotos.TIPOS,
                                                key=f"m_up_{mat}_{n}")
                    a1, a2 = st.columns(2)
                    if a1.button("Trocar foto" if atual else "Salvar foto", icon=":material/save:", type="primary",
                                 width="stretch", disabled=nova is None):
                        try:
                            bases.gravar_foto_material(mat, nova.getvalue(), auth.nome_de(eu))
                        except fotos.FotoErro as e:
                            st.error(f"Não foi possível usar a foto: {e}.")
                        else:
                            ss["_m_fotos"] = n + 1
                            apos_gravar()
                            st.toast(f"Foto do material {mat} salva.", icon=":material/check:")
                            st.rerun()
                    if atual and edita and a2.button("Remover foto", icon=":material/delete:", width="stretch"):
                        bases.remover_foto_material(mat, auth.nome_de(eu))
                        apos_gravar()
                        st.rerun()

    # ------------------------------ galeria ---------------------------------
    st.markdown(f"#### :material/photo_library: Galeria · {inteiro(len(com_foto))} materiais com foto")
    if not com_foto:
        st.caption("Nenhum material tem foto ainda — escolha um material acima e envie a primeira.")
        st.stop()
    g1, g2 = st.columns([3, 1], vertical_alignment="bottom")
    filtro = g1.text_input("Filtrar galeria", key="m_gal_busca", placeholder="código ou descrição…",
                           icon=":material/search:", label_visibility="collapsed")
    gal = com_foto
    if filtro.strip():
        termos = sem_acento(filtro).upper().split()
        gal = [c for c in gal if all(x in sem_acento(f"{c} {rotulo.get(c, '')}").upper() for x in termos)]
    paginas = max(1, -(-len(gal) // POR_PAGINA))
    # a chave muda com o filtro: a página volta para 1 e nunca passa do novo máximo
    pagina = (g2.number_input("Página", min_value=1, max_value=paginas, value=1, step=1, key=f"m_gal_pag_{filtro}")
              if paginas > 1 else 1)
    pagina = min(int(pagina), paginas)
    trecho = gal[(pagina - 1) * POR_PAGINA:pagina * POR_PAGINA]
    if not trecho:
        st.caption("Nenhuma foto com esse filtro.")
    elif paginas > 1:
        st.caption(f"Mostrando {len(trecho)} de {inteiro(len(gal))} fotos · página {pagina} de {paginas}")
    for i in range(0, len(trecho), 4):
        cols = st.columns(4)
        for col, cod in zip(cols, trecho[i:i + 4]):
            with col.container(border=True):
                info_g = cad_mat.get(cod) or {}
                img = foto_galeria(info_g["foto"], info_g.get("foto_versao", "")) if info_g.get("foto") else None
                if img:
                    st.image(img, width="stretch")
                else:
                    st.caption(":material/broken_image: arquivo da foto não encontrado")
                st.markdown(f"**{cod}**  \n:gray[{rotulo.get(cod, '(fora da MB52 atual)')}]")
                st.button("Abrir", icon=":material/open_in_full:", key=f"m_gal_{cod}", width="stretch",
                          on_click=abrir_foto, args=(cod,))
    st.stop()

# ============================================================================
# Visão · Material do almoxarifado
# ============================================================================
if len(criticos):
    st.error(f"**{len(criticos)} peça(s) de equipamentos críticos sem estoque suficiente:** "
             + "; ".join(f"{r['Material']} {r['Descrição'][:40]} → {r['Usado em']}" for _, r in criticos.head(8).iterrows()),
             icon=":material/warning:")

with ui.caixa_filtros():
    f = st.columns([3, 3, 2])
    busca = f[0].text_input("Buscar material", placeholder="código, descrição, informação técnica, fabricante…",
                            key="m_busca")
    situ = f[1].segmented_control("Situação", ["Todos", "Zerado", "Abaixo do mínimo", "OK", "Vinculado a equipamento"],
                                  default="Todos", key="m_sit")
    depositos = sorted({d for d in det["Depósito"].unique() if d})
    sel_dep = f[2].multiselect("Depósito", depositos, key="m_dep", placeholder="Todos")
    g = st.columns([3, 3, 2])
    sel_cat = g[0].multiselect("Categoria (Sysmat)", sorted(x for x in t["Categoria"].unique() if x), key="m_cat",
                               placeholder="Todas")
    sel_cad = g[1].multiselect("Cadastro no Sysmat", sorted(t["Cadastro"].unique()), key="m_cad", placeholder="Todos",
                               help="Ativo = aprovado (ou em inventário/inclusão); Bloqueado, Cancelado e Duplicado "
                                    "pedem revisão do cadastro; Não encontrado = o código não está na extração.")

m = pd.Series(True, index=t.index)
if busca.strip():
    hay = (t["Material"] + " " + t["Descrição"] + " " + t["Informação técnica"] + " " + t["Fabricante / referência"]
           + " " + t["Sysmat"]).map(lambda s: sem_acento(s).upper())
    for termo in sem_acento(busca).upper().split():
        m &= hay.str.contains(termo, regex=False)
if situ in ("Zerado", "Abaixo do mínimo", "OK"):
    m &= t["Situação"] == situ
elif situ == "Vinculado a equipamento":
    m &= t["Usado em"] != ""
if sel_dep:
    mats = set(det.loc[det["Depósito"].isin(sel_dep), "Material"])
    m &= t["Material"].isin(mats)
if sel_cat:
    m &= t["Categoria"].isin(sel_cat)
if sel_cad:
    m &= t["Cadastro"].isin(sel_cad)
ordem = t["Situação"].map({"Zerado": 0, "Abaixo do mínimo": 1, "OK": 2})
vis = t.loc[m].assign(_o=ordem).sort_values(["_o", "Descrição"]).drop(columns="_o").reset_index(drop=True)

modo = st.segmented_control(
    "Exibir", ["Ficha técnica", "Tabela"], default="Ficha técnica", required=True, key="m_modo",
    label_visibility="collapsed",
    format_func=lambda v: ":material/description: Ficha técnica" if v == "Ficha técnica"
    else ":material/table: Tabela" + (" (editar mínimo)" if edita else ""))
COLS = ["Material", "Descrição", "Informação técnica", "UM", "Estoque", "Mínimo", "Situação", "Cadastro", "Categoria",
        "Fabricante / referência", "Depósitos", "Valor", "Usado em"]
if modo == "Ficha técnica":
    # informação técnica com quebra de linha em cada atributo, em páginas (e sem cortar o item na impressão)
    pag = materiais_ui.paginar(vis, f"m_pag_{hash((busca, situ, tuple(sel_dep), tuple(sel_cat), tuple(sel_cad)))}",
                               "materiais")
    st.html(materiais_ui.tabela_ficha(pag, ["Material", "Descrição", "Informação técnica", "UM", "Estoque", "Mínimo",
                                            "Situação", "Cadastro", "Depósitos", "Usado em"]))
    ui.baixar(vis[COLS], "estoque_filtrado", "Baixar lista (Excel)", chave="m_baixar_ficha")
    st.stop()

st.caption(f"{inteiro(len(vis))} materiais" + (" · a coluna **Mínimo** é editável — altere e clique em Salvar mínimos" if edita else ""))
if TEM_FOTO.any():  # coluna de foto só quando algum material tem foto
    COLS = ["Foto", *COLS]
editado = st.data_editor(
    vis[COLS], hide_index=True, width="stretch", height=ui.altura_tabela(480),
    # a chave muda com o filtro: edições pendentes nunca "pulam" para outra linha
    key=f"m_editor_{hash((busca, situ, tuple(sel_dep), tuple(sel_cat), tuple(sel_cad), ss.get('_m_salvos', 0)))}",
    disabled=[c for c in COLS if c != "Mínimo" or not edita],
    column_config={
        "Estoque": ui.col_num(),
        "Mínimo": ui.col_num(min_value=0, help="Estoque mínimo / ponto de reposição"),
        "Valor": ui.col_moeda("Valor (R$)"),
        "Descrição": st.column_config.TextColumn(width="medium"),
        "Informação técnica": st.column_config.TextColumn(width="large",
                                                          help="Descrição completa do Sysmat — veja inteira em Ficha técnica"),
        "Foto": st.column_config.ImageColumn("Foto", width="small",
                                             help="Envie a foto na visão **Fotos dos materiais**, no topo da página"),
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
    apos_gravar()
    st.toast(f"{len(itens)} mínimo(s) salvo(s).", icon=":material/check:")
    st.rerun()
with b2:
    ui.baixar(vis[[c for c in COLS if c != "Foto"]], "estoque_filtrado", "Baixar lista (Excel)")

with st.expander("Saldo por depósito"):
    d = det if not sel_dep else det[det["Depósito"].isin(sel_dep)]
    d = d[d["Material"].isin(set(vis["Material"]))]
    st.dataframe(d, hide_index=True, width="stretch", height=ui.altura_tabela(320),
                 column_config={"Valor": ui.col_moeda("Valor (R$)"), "Estoque": ui.col_num()})
