import re

import altair as alt
import pandas as pd
import streamlit as st

from central import auth, bases, contexto, fotos, ui
from central import indicadores as ind
from central.leitura import IW38
from central.util import brl, inteiro, sem_acento

CRITICIDADES = ["Alta", "Média", "Baixa"]
CATEGORIAS = ["Mecânico", "Elétrico", "Instrumentação", "Hidráulico", "Pneumático", "Civil", "Utilidades", "Outro"]
COR_CRIT = {"Alta": "red", "Média": "orange", "Baixa": "green"}
VISOES = ["Cadastro de equipamentos", "Análise pelas ordens (IW38)"]
MAX_CANDIDATOS = 60  # itens da base de material listados por busca

eu = auth.usuario_atual()
cadastra = bool(eu)            # qualquer usuário logado cadastra e edita equipamentos (e envia fotos)
edita = auth.pode_editar(eu)   # remover equipamento: só editor/administrador
ss = st.session_state

base = bases.iw38()
estoque = bases.mb52()
ih08 = bases.equipamentos().df        # cadastro do SAP (nome, localização, código ABC)
notas = bases.notas().df
cad = bases.ler_cadastro(bases.ARQ_CAD_EQUIP)
cad_mat = bases.ler_cadastro(bases.ARQ_CAD_MAT)

est_por_cod = estoque.df.set_index("Material") if estoque.df is not None else None
rot_mat = dict(zip(estoque.df["Material"], estoque.df["Descrição"])) if estoque.df is not None else {}

# nome de cada equipamento no SAP, para sugerir no cadastro (IH08 primeiro, depois IW38)
nome_sap = {}  # sem anotação de tipo: a "magic" do Streamlit quebra com ela no Python 3.14
if base.df is not None:
    nome_sap.update(base.df[base.df["Equip. (chave)"] != ""].groupby("Equip. (chave)")["Objeto técnico"].first())
if ih08 is not None:
    nome_sap.update({k: v for k, v in zip(ih08["Equipamento"], ih08["Denominação"]) if v})
abc_sap = dict(zip(ih08["Equipamento"], ih08["Código ABC"])) if ih08 is not None else {}


def md(texto) -> str:
    """Texto livre (descrição do SAP, nome digitado) seguro dentro de Markdown."""
    return re.sub(r"([\\`*_{}\[\]<>()#+\-.!|$~:])", r"\\\1", str(texto or ""))


def situacao_peca(codigo: str) -> tuple[str, str]:
    """(cor, texto) da peça no estoque, com a mesma regra da página Estoque."""
    if est_por_cod is None or codigo not in est_por_cod.index:
        return "red", "não encontrado na base de material atual"
    q = est_por_cod["Estoque"].get(codigo)
    minimo = (cad_mat.get(codigo) or {}).get("minimo")
    texto = f"estoque: {q:,.0f}".replace(",", ".")
    if q <= 0:
        return "red", texto
    if minimo and q < minimo:
        return "orange", f"{texto} · mín. {minimo:,.0f}".replace(",", ".")
    return "green", texto


def pecas_em_alerta(codigos) -> int:
    return sum(situacao_peca(c)[0] != "green" for c in codigos)


def apos_gravar() -> None:
    """Depois de gravar um cadastro ou foto: o vigia da barra lateral não deve tratar a
    gravação como "arquivo novo" — o st.rerun dele roda antes desta página e apagaria o
    que está preenchido na tela (formulário aberto, visão escolhida)."""
    ss["_assinatura"] = bases.assinatura_dados()


# ----------------------------------------------------------------------------
# Componentes: miniatura da foto do material e ponto de adição de foto
# ----------------------------------------------------------------------------
def miniatura_de(codigo: str) -> str | None:
    info = cad_mat.get(codigo) or {}
    return bases.miniatura_material(info["foto"], info.get("foto_versao", "")) if info.get("foto") else None


def ponto_de_foto(codigo: str, chave: str) -> None:
    """Botão "Foto" do componente: envia ou troca a foto do material (arquivo ou câmera).

    O conteúdo só roda com o popover aberto (on_change="rerun"), então dezenas de
    componentes na tela não criam dezenas de campos de envio."""
    # sem "limpar" caracteres: TAGs como "AB.1" e "AB_1" virariam a mesma chave (StreamlitDuplicateElementKey)
    pre = f"eqp|{chave}|{codigo}"
    tem = bool((cad_mat.get(codigo) or {}).get("foto"))
    pop = st.popover("Foto", icon=":material/add_a_photo:", key=pre, on_change="rerun", width="stretch",
                     help="Trocar a foto deste material" if tem else "Adicionar a foto deste material")
    if not pop.open:
        return
    with pop:
        info = cad_mat.get(codigo) or {}
        atual = bases.foto_material(info)
        st.markdown(f"**{md(codigo)}**  {md(rot_mat.get(codigo, ''))}")
        if atual:
            st.image(atual, width=240)
        else:
            st.caption(":material/hide_image: Este material ainda não tem foto.")
        n = ss.get(f"{pre}_n", 0)
        origem = st.segmented_control("Origem da foto", ["Arquivo", "Câmera"], default="Arquivo", required=True,
                                      key=f"{pre}_origem")
        if origem == "Câmera":
            nova = st.camera_input("Tirar foto", key=f"{pre}_cam_{n}")
        else:
            nova = st.file_uploader("Enviar foto (JPG, PNG ou WEBP)", type=fotos.TIPOS, key=f"{pre}_up_{n}")
        if st.button("Trocar foto" if atual else "Salvar foto", icon=":material/save:", type="primary",
                     width="stretch", disabled=nova is None, key=f"{pre}_salvar"):
            try:
                bases.gravar_foto_material(codigo, nova.getvalue(), auth.nome_de(eu))
            except fotos.FotoErro as e:
                st.error(f"Não foi possível usar a foto: {e}.")
            else:
                ss[f"{pre}_n"] = n + 1
                apos_gravar()
                st.toast(f"Foto do material {codigo} salva.", icon=":material/check:")
                st.rerun()


def linha_componente(codigo: str, chave: str, desvincular_btn: bool = False) -> None:
    """Uma linha da lista de componentes: miniatura, código/descrição/estoque e o botão Foto."""
    cor, texto = situacao_peca(codigo)
    larg = [0.6, 4.4, 1.1, 1.3] if desvincular_btn else [0.6, 5, 1.1]
    col = st.columns(larg, vertical_alignment="center")
    mini = miniatura_de(codigo)
    if mini:
        col[0].image(mini, width=48)
    else:
        col[0].markdown(":gray[:material/hide_image:]", help="Sem foto — use o botão Foto")
    if codigo in rot_mat:
        col[1].markdown(f":blue[`{codigo}`]  {md(rot_mat[codigo])}  :{cor}-badge[{texto}]")
    else:
        col[1].markdown(f":blue[`{codigo}`]  :red[:material/link_off: {texto}]")
    if cadastra:
        with col[2]:
            ponto_de_foto(codigo, chave)
    if desvincular_btn:
        col[3].button("Desvincular", icon=":material/link_off:", key=f"eqf_rm_{codigo}", width="stretch",
                      on_click=desvincular, args=(codigo,))


# ----------------------------------------------------------------------------
# Formulário: estado e ações
# ----------------------------------------------------------------------------
def abrir_formulario(tag: str | None = None) -> None:
    """Abre o formulário vazio (novo) ou com o equipamento `tag` (editar/cadastrar a partir do SAP)."""
    info = cad.get(tag) or {} if tag else {}
    ss["eqf_aberto"] = True
    ss["eqf_editando"] = tag if tag in cad else None
    ss["eqf_tag"] = tag or ""
    ss["eqf_nome"] = info.get("nome") or nome_sap.get(tag or "", "")
    ss["eqf_cat"] = info.get("categoria") if info.get("categoria") in CATEGORIAS else CATEGORIAS[0]
    ss["eqf_crit"] = (info.get("criticidade") if info.get("criticidade") in CRITICIDADES
                      else bases.ABC_PARA_CRITICIDADE.get(abc_sap.get(tag or "", ""), "Média"))
    ss["eqf_ov"] = info.get("observacoes", "")
    ss["eqf_links"] = list(dict.fromkeys(info.get("materiais", [])))
    ss["eqf_busca"] = ""
    for k in [k for k in ss if str(k).startswith("eqf_l_")]:
        del ss[k]
    ss["eq_visao"] = VISOES[0]


def fechar_formulario() -> None:
    ss["eqf_aberto"] = False
    ss["eqf_editando"] = None


def sugerir_nome() -> None:
    tag = ss.get("eqf_tag", "").strip().upper()
    if tag and not ss.get("eqf_nome", "").strip() and tag in nome_sap:
        ss["eqf_nome"] = nome_sap[tag]


def marcar(codigo: str) -> None:
    links = ss.setdefault("eqf_links", [])
    if ss.get(f"eqf_l_{codigo}"):
        if codigo not in links:
            links.append(codigo)
    elif codigo in links:
        links.remove(codigo)


def desvincular(codigo: str) -> None:
    if codigo in ss.get("eqf_links", []):
        ss["eqf_links"].remove(codigo)
    ss[f"eqf_l_{codigo}"] = False


if "eq_sel" in ss:  # veio da página de Ordens: abre a análise com a ficha do equipamento
    ss["eq_ficha"] = ss.pop("eq_sel")
    ss["eq_visao"] = VISOES[1]

# ----------------------------------------------------------------------------
# Cabeçalho
# ----------------------------------------------------------------------------
h1, h2 = st.columns([4, 1.4], vertical_alignment="center")
with h1:
    ui.cabecalho("Gerenciamento de equipamentos", "Categoria, criticidade e componentes vinculados à base de material")
if cadastra:
    h2.button("Novo equipamento", icon=":material/add:", type="primary", width="stretch", on_click=abrir_formulario)

if ss.get("eq_visao") not in VISOES:
    ss["eq_visao"] = VISOES[0]
visao = st.segmented_control("Visão", VISOES, key="eq_visao", label_visibility="collapsed")
if visao is None:  # clique na opção já marcada desmarca: volta para o cadastro
    visao = VISOES[0]

# ============================================================================
# Visão 1 · Cadastro (configuração da antiga tela de equipamentos)
# ============================================================================
if visao == VISOES[0]:
    if cad:
        cards = st.columns(len(CRITICIDADES) + 1)
        for col, crit in zip(cards, CRITICIDADES):
            col.metric(f"Criticidade {crit}", inteiro(sum(v.get("criticidade") == crit for v in cad.values())),
                       border=True)
        cards[-1].metric("Total", inteiro(len(cad)), border=True)

    # ---------------------------- formulário --------------------------------
    if ss.get("eqf_aberto") and cadastra:
        editando = ss.get("eqf_editando")
        with st.container(border=True):
            st.markdown(f"**:blue[{'EDITAR EQUIPAMENTO' if editando else 'NOVO EQUIPAMENTO'}]**")
            l1 = st.columns([1.2, 1.8, 1.1, 1.1])
            l1[0].text_input("TAG (obrigatório)", key="eqf_tag", placeholder="Ex: MT-102", on_change=sugerir_nome,
                             help="Código do equipamento no SAP (IW38/IH08) ou uma TAG própria. Sendo do SAP, o nome é sugerido.")
            l1[1].text_input("Nome (obrigatório)", key="eqf_nome", placeholder="Ex: Motor bomba centrífuga")
            l1[2].selectbox("Categoria", CATEGORIAS, key="eqf_cat")
            l1[3].selectbox("Criticidade", CRITICIDADES, key="eqf_crit")
            st.text_area("Visão geral", key="eqf_ov", height=80,
                         placeholder="Função do equipamento, observações gerais de manutenção…")

            st.markdown("<div class='cm-rotulo'>COMPONENTES VINCULADOS (BASE DE MATERIAL)</div>", unsafe_allow_html=True)
            links = ss.setdefault("eqf_links", [])
            if estoque.df is None:
                st.caption("Coloque o export do **MB52** na pasta do site para vincular componentes.")
            else:
                b = st.columns([1.6, 3])
                busca = b[0].text_input("Buscar código ou descrição", key="eqf_busca", label_visibility="collapsed",
                                        placeholder="Buscar código ou descrição…", icon=":material/search:")
                cand = estoque.df[["Material", "Descrição"]]
                if busca.strip():
                    hay = (cand["Material"] + " " + cand["Descrição"]).map(lambda x: sem_acento(x).upper())
                    for termo in sem_acento(busca).upper().split():
                        cand = cand[hay.loc[cand.index].str.contains(termo, regex=False)]
                total = len(cand)
                cand = cand.head(MAX_CANDIDATOS)
                with st.container(height=190, border=True):
                    if not total:
                        st.caption("Nenhum item encontrado.")
                    for cod, desc in zip(cand["Material"], cand["Descrição"]):
                        k = f"eqf_l_{cod}"
                        if k not in ss:
                            ss[k] = cod in links
                        st.checkbox(f":blue[`{cod}`]  {md(desc)}", key=k, on_change=marcar, args=(cod,))
                if total > MAX_CANDIDATOS:
                    b[1].caption(f"Mostrando {MAX_CANDIDATOS} de {inteiro(total)} materiais — refine a busca.")
            if links:
                st.markdown(f"<div class='cm-rotulo'>VINCULADOS ({len(links)}) · FOTO DE CADA MATERIAL</div>",
                            unsafe_allow_html=True)
                with st.container(border=True):
                    for cod in list(links):
                        linha_componente(cod, "form", desvincular_btn=True)

            a = st.columns([1.3, 1, 4])
            salvar = a[0].button("Salvar equipamento", icon=":material/check:", type="primary", width="stretch")
            a[1].button("Cancelar", icon=":material/close:", width="stretch", on_click=fechar_formulario)
            if salvar:
                tag, nome = ss.get("eqf_tag", "").strip().upper(), ss.get("eqf_nome", "").strip()
                if not tag or not nome:
                    st.error("Preencha a **TAG** e o **nome** do equipamento.")
                elif tag != editando and tag in cad:
                    st.error(f"A TAG **{md(tag)}** já está cadastrada — use **Editar** na lista abaixo.")
                else:
                    itens = {tag: {"nome": nome, "categoria": ss["eqf_cat"], "criticidade": ss["eqf_crit"],
                                   "observacoes": ss.get("eqf_ov", "").strip(), "materiais": list(links)}}
                    if editando and editando != tag:  # TAG renomeada
                        itens[editando] = None
                    bases.gravar_cadastro_lote(bases.ARQ_CAD_EQUIP, itens, auth.nome_de(eu))
                    apos_gravar()
                    fechar_formulario()
                    st.toast(f"Equipamento {tag} salvo.", icon=":material/check:")
                    st.rerun()

    # ------------------------------ lista -----------------------------------
    if not cad and not ss.get("eqf_aberto"):
        with st.container(border=True):
            st.markdown("#### :material/build: Nenhum equipamento cadastrado")
            st.caption("Cadastre os equipamentos da planta com categoria, criticidade e vincule os componentes de "
                       "reposição da base de material.")
    elif cad:
        f = st.columns([3, 2])
        busca_l = f[0].text_input("Buscar equipamento", key="eqc_busca", label_visibility="collapsed",
                                  placeholder="Buscar TAG, nome ou componente…", icon=":material/search:")
        crit_l = f[1].pills("Criticidade", CRITICIDADES, selection_mode="multi", key="eqc_crit",
                            label_visibility="collapsed")
        resumo_iw38 = None
        if base.df is not None:
            resumo_iw38 = base.df[base.df["Equip. (chave)"] != ""].groupby("Equip. (chave)").agg(
                Ordens=("Ordem", "size"), Pendentes=("Situação", lambda s: int(s.isin(bases.PENDENTES).sum())))
        itens = sorted(cad.items())
        if busca_l.strip():
            termos = sem_acento(busca_l).upper().split()
            itens = [(k, v) for k, v in itens
                     if all(t in sem_acento(" ".join([k, v.get("nome", ""), *v.get("materiais", []),
                                                      *(rot_mat.get(m, "") for m in v.get("materiais", []))])).upper()
                            for t in termos)]
        if crit_l:
            itens = [(k, v) for k, v in itens if v.get("criticidade") in crit_l]
        if not itens:
            st.caption("Nenhum equipamento com esse filtro.")
        for tag, v in itens:
            comps = v.get("materiais", [])
            crit = v.get("criticidade", "")
            alerta = pecas_em_alerta(comps)
            rotulo = (f"**{md(tag)}**  {md(v.get('nome', ''))}  :blue-badge[{md(v.get('categoria', '—'))}]"
                      f"  :{COR_CRIT.get(crit, 'gray')}-badge[{md(crit or 'sem criticidade')}]"
                      f"  :gray[:material/link: {len(comps)}]" + ("  :red[:material/warning:]" if alerta else ""))
            with st.expander(rotulo):
                if v.get("observacoes"):
                    st.markdown(f"> {md(v['observacoes'])}")
                if resumo_iw38 is not None and tag in resumo_iw38.index:
                    r = resumo_iw38.loc[tag]
                    st.caption(f":material/assignment: {inteiro(r['Ordens'])} ordens no IW38 · "
                               f"{inteiro(r['Pendentes'])} pendentes" + (f" · ABC {abc_sap[tag]} no SAP" if abc_sap.get(tag) else ""))
                st.markdown("<div class='cm-rotulo'>COMPONENTES VINCULADOS</div>", unsafe_allow_html=True)
                if not comps:
                    st.caption("Nenhum componente vinculado.")
                for c in dict.fromkeys(comps):  # código repetido no cadastro repetiria a chave do widget
                    linha_componente(c, f"lista|{tag}")
                if v.get("atualizado_em"):
                    st.caption(f"Última edição: {v.get('atualizado_por') or 'sem nome'} em "
                               f"{v['atualizado_em'][:16].replace('T', ' ')} (UTC)")
                if cadastra:
                    e1, e2, _ = st.columns([1, 1, 4])
                    e1.button("Editar", icon=":material/edit:", key=f"eqc_ed_{tag}", width="stretch",
                              on_click=abrir_formulario, args=(tag,))
                if edita:
                    with e2.popover("Remover", icon=":material/delete:", width="stretch", key=f"eqc_rmp_{tag}"):
                        st.markdown(f"Remover **{md(tag)}** do cadastro? As ordens do SAP não são afetadas.")
                        if st.button("Remover", type="primary", key=f"eqc_rm_{tag}"):
                            bases.gravar_cadastro(bases.ARQ_CAD_EQUIP, tag, None, auth.nome_de(eu))
                            apos_gravar()
                            if ss.get("eqf_editando") == tag:
                                fechar_formulario()
                            st.rerun()
    st.stop()

# ============================================================================
# Visão 2 · Análise pelas ordens do IW38
# ============================================================================
if not ui.aviso_base(base, IW38):
    st.stop()

fg = contexto.filtros_globais()
todas = fg.ordens(base.df)
df, desc = fg.periodo(todas), fg.desc


@st.cache_data(show_spinner=False, max_entries=8)
def agregar(_todas: pd.DataFrame, _df: pd.DataFrame, chave: str) -> pd.DataFrame:
    t = _todas[_todas["Equip. (chave)"] != ""]
    geral = t.groupby("Equip. (chave)").agg(
        Nome=("Objeto técnico", "first"), Local=("Local de instalação", lambda s: s.mode().iat[0] if len(s.mode()) else ""),
        Centro=("Centro de trabalho", lambda s: s.mode().iat[0] if len(s.mode()) else ""),
        Pendentes=("Situação", lambda s: int(s.isin(bases.PENDENTES).sum())), Última=("Data", "max"),
    )
    p = _df[_df["Equip. (chave)"] != ""]
    per = p.groupby("Equip. (chave)").agg(Ordens=("Ordem", "size"), Backlog=("Com plano", lambda s: int((~s).sum())),
                                          Custo=("Custo real", "sum"))
    out = geral.join(per, how="left").fillna({"Ordens": 0, "Backlog": 0, "Custo": 0.0})
    out[["Ordens", "Backlog"]] = out[["Ordens", "Backlog"]].astype(int)
    return out.reset_index().rename(columns={"Equip. (chave)": "Código"})


tab = agregar(todas, df, f"{base.origem.arquivo.assinatura}|{desc}|{pd.Timestamp.today():%Y-%m-%d}")
# equipamentos cadastrados à mão (sem ordem no IW38) também aparecem
extras = [k for k in cad if k not in set(tab["Código"])]
if extras:
    tab = pd.concat([tab, pd.DataFrame({"Código": extras, "Nome": [cad[k].get("nome", "") for k in extras]})], ignore_index=True)
    tab = tab.fillna({"Ordens": 0, "Backlog": 0, "Custo": 0.0, "Pendentes": 0, "Local": "", "Centro": ""})
if ih08 is not None:
    ref = ih08.set_index("Equipamento")
    tab["ABC"] = tab["Código"].map(ref["Código ABC"]).fillna("")
    tab["Nome"] = tab["Nome"].where(tab["Nome"].fillna("") != "", tab["Código"].map(ref["Denominação"])).fillna("")
    tab["Desativado"] = tab["Código"].map(ref["Desativado"]).fillna(False).astype(bool)
else:
    tab["ABC"], tab["Desativado"] = "", False
# criticidade: a cadastrada no site vale; sem cadastro, vem do código ABC do SAP (IH08)
tab["Criticidade"] = [(cad.get(k) or {}).get("criticidade") or bases.ABC_PARA_CRITICIDADE.get(a, "")
                      for k, a in zip(tab["Código"], tab["ABC"])]
if notas is not None:
    por_eq = notas.groupby("Equip. (chave)").agg(Notas=("Nota", "size"), Quebras=("Quebra", "sum"),
                                                  _sem=("Com ordem", lambda s: int((~s).sum())))
    tab["Notas"] = tab["Código"].map(por_eq["Notas"]).fillna(0).astype(int)
    tab["Notas sem ordem"] = tab["Código"].map(por_eq["_sem"]).fillna(0).astype(int)
    tab["Quebras"] = tab["Código"].map(por_eq["Quebras"]).fillna(0).astype(int)
tab["Categoria"] = tab["Código"].map(lambda k: (cad.get(k) or {}).get("categoria", ""))
tab["Peças"] = tab["Código"].map(lambda k: len((cad.get(k) or {}).get("materiais", [])))
tab["Peças em falta"] = tab["Código"].map(lambda k: pecas_em_alerta((cad.get(k) or {}).get("materiais", [])))

c = st.columns(4)
c[0].metric("Equipamentos com ordens", inteiro((tab["Ordens"] > 0).sum()), f"período: {desc}", delta_color="off", border=True, delta_arrow="off")
c[1].metric("Criticidade alta", inteiro((tab["Criticidade"] == "Alta").sum()),
            "classe A no SAP (IH08) ou cadastrada no site" if ih08 is not None else "cadastrada no site",
            delta_color="off", border=True, delta_arrow="off")
c[2].metric("Com ordens pendentes", inteiro((tab["Pendentes"] > 0).sum()), border=True, delta_arrow="off")
c[3].metric("Com peça em falta", inteiro((tab["Peças em falta"] > 0).sum()), "peças vinculadas sem estoque / abaixo do mínimo",
            delta_color="off", border=True, delta_arrow="off")

with ui.caixa_filtros():
    f1 = st.columns([3, 2, 2, 2])
    busca = f1[0].text_input("Buscar equipamento", placeholder="código, nome ou local…", key="eq_busca")
    sel_crit = f1[1].multiselect("Criticidade", CRITICIDADES + ["(não classificado)"], key="eq_crit", placeholder="Todas")
    so_pend = f1[2].toggle("Só com pendências", key="eq_pend")
    so_periodo = f1[3].toggle("Só com ordens no período", value=True, key="eq_per")

m = pd.Series(True, index=tab.index)
if busca.strip():
    hay = (tab["Código"] + " " + tab["Nome"].fillna("") + " " + tab["Local"].fillna("")).map(lambda s: sem_acento(s).upper())
    for termo in sem_acento(busca).upper().split():
        m &= hay.str.contains(termo, regex=False)
if sel_crit:
    m &= tab["Criticidade"].replace("", "(não classificado)").isin(sel_crit)
if so_pend:
    m &= tab["Pendentes"] > 0
if so_periodo:
    m &= tab["Ordens"] > 0
vis = tab.loc[m].sort_values(["Custo", "Ordens"], ascending=False).reset_index(drop=True)

COLS = ["Código", "Nome", "Criticidade", "ABC", "Categoria", "Local", "Centro", "Ordens", "Backlog", "Custo", "Pendentes",
        *(["Notas", "Notas sem ordem", "Quebras"] if notas is not None else []),
        "Última", "Peças", "Peças em falta"]
ev = st.dataframe(vis[COLS], hide_index=True, width="stretch", height=ui.altura_tabela(380), on_select="rerun",
                  selection_mode="single-row", key="eq_tabela",
                  column_config={"Custo": ui.col_moeda("Custo no período"), "Última": ui.col_data("Última ordem"),
                                 "Nome": st.column_config.TextColumn(width="medium"),
                                 "Ordens": st.column_config.NumberColumn("Ordens no período")})
ui.baixar(vis[COLS], "equipamentos", "Baixar lista (Excel)")

# ----------------------------------------------------------------------------
# Ficha do equipamento
# ----------------------------------------------------------------------------
linhas = ev.selection.rows if ev and ev.selection else []
if linhas:
    escolhido = vis.iloc[linhas[0]]["Código"]
    if ss.get("_eq_ultima_sel") != escolhido:
        ss["eq_ficha"] = escolhido
        ss["_eq_ultima_sel"] = escolhido

nomes = dict(zip(tab["Código"], tab["Nome"].fillna("")))
opcoes = list(tab.sort_values("Custo", ascending=False)["Código"])
if ss.get("eq_ficha") not in nomes:
    ss.pop("eq_ficha", None)

st.divider()
# index fixo: se mudasse entre execuções o Streamlit recriaria o widget e perderia a escolha
sel = st.selectbox("Ficha do equipamento", opcoes, key="eq_ficha", index=None,
                   placeholder="Selecione na tabela acima ou busque aqui…",
                   format_func=lambda k: f"{k} · {nomes.get(k, '')}")
if not sel:
    st.stop()

hist = base.df[base.df["Equip. (chave)"] == sel].sort_values("Data", ascending=False)
info = cad.get(sel) or {}
st.subheader(f"{nomes.get(sel) or info.get('nome', '')}  ·  {sel}")

corr = hist[~hist["Com plano"]].dropna(subset=["Data"]).sort_values("Data")
intervalo = corr["Data"].diff().dt.days.mean() if len(corr) > 1 else None
k = st.columns(5)
k[0].metric("Ordens (todas as datas)", inteiro(len(hist)), border=True, delta_arrow="off")
k[1].metric("Custo total", brl(hist["Custo real"].sum()), border=True, delta_arrow="off")
k[2].metric("Backlog", inteiro(len(corr)), f"{inteiro(hist['Com plano'].sum())} de plano de manutenção", delta_color="off", border=True, delta_arrow="off")
k[3].metric("Intervalo médio do backlog", f"{intervalo:.0f} dias" if intervalo else "—", border=True, delta_arrow="off",
            help="Média de dias entre uma ordem de backlog (sem plano) e a seguinte (aproxima o MTBF).")
k[4].metric("Pendentes hoje", inteiro(hist["Situação"].isin(bases.PENDENTES).sum()),
            f"{inteiro(hist['Atrasada'].sum())} atrasadas", delta_color="off", border=True, delta_arrow="off")

q_eq = ind.quebras(contexto.dados(contexto.Filtros(fg.ini, fg.fim)))
q_eq = q_eq[q_eq["Equip. (chave)"] == sel] if len(q_eq) else q_eq
q_per = q_eq[ui.entre(q_eq["Data"], fg.ini, fg.fim)] if len(q_eq) else q_eq
dias_per = (pd.Timestamp(fg.fim) - pd.Timestamp(fg.ini)).days + 1
conf_all = bases.confirmacoes().df
hh_eq = (conf_all[conf_all["Ordem"].isin(set(hist["Ordem"]))]["Horas"].sum() if conf_all is not None else None)
k = st.columns(5)
k[0].metric("Quebras no período", inteiro(len(q_per)), f"{inteiro(len(q_eq))} em todas as datas", delta_color="off",
            border=True, delta_arrow="off", help="Notas Y1 da IW28 convertidas em ordem YM11 neste equipamento.")
k[1].metric("MTBF no período", f"{dias_per / len(q_per):.0f} dias" if len(q_per) else "—", border=True, delta_arrow="off",
            help=ind.POR_ID["mtbf"].formula)
rep = q_per["Horas de reparo"].dropna() if len(q_per) else pd.Series(dtype=float)
rep = rep[rep > 0]
k[2].metric("MTTR no período", f"{rep.mean():.1f} h".replace(".", ",") if len(rep) else "—", border=True,
            delta_arrow="off", help=ind.POR_ID["mttr"].formula)
k[3].metric("Reincidências (≤ 30 dias)", inteiro(q_per["Reincidente"].sum()) if len(q_per) else "0", border=True,
            delta_arrow="off")
k[4].metric("HH apontadas (IW47)", f"{inteiro(hh_eq)} h" if hh_eq is not None else "—",
            "nas ordens do IW38 deste equipamento", delta_color="off", border=True, delta_arrow="off")

g, lado = st.columns([3, 2])
with g:
    anual = hist.dropna(subset=["Data"]).assign(Ano=lambda d: d["Data"].dt.year.astype(str))
    if len(anual):
        q = anual.groupby(["Ano", "Natureza"]).agg(Ordens=("Ordem", "size"), Custo=("Custo real", "sum")).reset_index()
        ch = alt.Chart(q).mark_bar().encode(
            x=alt.X("Ano:N", title=None, axis=alt.Axis(labelAngle=0)), y=alt.Y("Ordens:Q"),
            color=alt.Color("Natureza:N", scale=alt.Scale(domain=bases.NATUREZAS,
                                                          range=[ui.VERDE, ui.LARANJA]), legend=alt.Legend(orient="top", title=None)),
            tooltip=["Ano", "Natureza", "Ordens", alt.Tooltip("Custo:Q", format=",.2f")]).properties(height=ui.altura_tabela(220))
        ui.mostrar(ch)
    st.dataframe(hist[["Ordem", "Data", "Tipo", "Natureza", "Texto", "Situação", "Custo real"]].head(300), hide_index=True,
                 width="stretch", height=ui.altura_tabela(280),
                 column_config={"Data": ui.col_data(), "Custo real": ui.col_moeda(), "Texto": st.column_config.TextColumn(width="large")})
    if notas is not None:
        ne = notas[notas["Equip. (chave)"] == sel].sort_values("Data", ascending=False)
        st.markdown(f"**Notas do equipamento (IW28)** — {inteiro(len(ne))} notas, "
                    f"{inteiro(ne['Quebra'].sum())} quebra(s) (Y1 → YM11), {inteiro((~ne['Com ordem']).sum())} sem ordem")
        if len(ne):
            st.dataframe(ne[["Nota", "Data", "Tipo de nota", "Descrição", "Quebra", "Com parada", "Ordem", "Tipo da ordem", "Notificador"]].head(200),
                         hide_index=True, width="stretch", height=ui.altura_tabela(220),
                         column_config={"Data": ui.col_data(), "Com parada": st.column_config.CheckboxColumn("Parada"),
                                        "Quebra": st.column_config.CheckboxColumn("Quebra"),
                                        "Descrição": st.column_config.TextColumn(width="large")})

with lado, st.container(border=True):
    st.markdown("**Cadastro do equipamento**")
    if info:
        crit = info.get("criticidade", "")
        st.markdown(f":blue-badge[{md(info.get('categoria', '—'))}]  :{COR_CRIT.get(crit, 'gray')}-badge[{md(crit or '—')}]")
        if info.get("observacoes"):
            st.markdown(f"> {md(info['observacoes'])}")
        for c in dict.fromkeys(info.get("materiais", [])):
            linha_componente(c, f"ficha|{sel}")
        if not info.get("materiais"):
            st.caption("Nenhum componente vinculado.")
    else:
        crit_sap = bases.ABC_PARA_CRITICIDADE.get(abc_sap.get(sel, ""), "")
        st.caption("Ainda não cadastrado no site."
                   + (f" Criticidade pelo código ABC do SAP: **{crit_sap}**." if crit_sap else ""))
    if cadastra:
        st.button("Editar cadastro" if info else "Cadastrar equipamento", icon=":material/edit:", width="stretch",
                  on_click=abrir_formulario, args=(sel,))
