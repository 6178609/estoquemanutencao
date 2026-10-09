"""Telas do Estoque ligadas ao catálogo de materiais (Sysmat): a lista sem limite (rolagem contínua, com a
Descr Completa quebrando linha dentro da célula), a ficha técnica do material escolhido e a área
"Material cadastrado"."""

from __future__ import annotations

import pandas as pd
import streamlit as st

from . import auth, bases, materiais, ui
from .leitura import CATMAT, EXTENSOES, NOMES_BASE
from .util import inteiro, sem_acento

DESCR = "Descr Completa"          # a coluna da extração, com o mesmo nome
ALTURAS = {"Compacta": 35, "Média": 80, "Alta": 130, "Muito alta": 220}


def altura_linha(chave: str) -> int:
    """Altura de cada linha da lista: quanto maior, mais da Descr Completa aparece sem precisar abrir a ficha."""
    esc = st.segmented_control("Altura da linha", list(ALTURAS), default="Alta", required=True, key=chave,
                               help="A Descr Completa quebra linha dentro da célula; aumente a altura para ler mais "
                                    "sem abrir a ficha técnica.")
    return ALTURAS.get(esc, ALTURAS["Alta"])


def col_descr(rotulo: str = DESCR):
    return st.column_config.TextColumn(rotulo, width=520,
                                       help="Descr Completa do cadastro de materiais (Sysmat) — a informação técnica")


def ficha(linha: pd.Series, titulo: str) -> None:
    """Ficha técnica de um material: a Descr Completa um atributo por linha."""
    with st.container(border=True):
        st.markdown(f"**:material/description: {titulo}**")
        info = str(linha.get("Informação técnica") or "")
        if not info:
            st.caption("Sem Descr Completa: o código não está no catálogo do Sysmat ou o cadastro está vazio.")
        else:
            st.markdown("  \n".join(f"- {sem_markdown(x)}" for x in materiais.linhas_tecnicas(info)))
        extras = [f"{k}: **{sem_markdown(linha.get(k))}**" for k in ("Sysmat", "Categoria", "Subcategoria", "NCM",
                                                                     "Fabricante / referência", "Status", "Cadastro")
                  if str(linha.get(k) or "").strip()]
        if extras:
            st.caption(" · ".join(extras))


def sem_markdown(v) -> str:
    import re

    return re.sub(r"([\\`*_{}\[\]<>()#+\-!|$~])", r"\\\1", str(v or ""))


def aviso_sem_catalogo(edita: bool, chave: str) -> None:
    """Sem a extração do Sysmat a Descr Completa fica vazia: diz onde pôr o arquivo e deixa enviar aqui mesmo."""
    with st.container(border=True):
        st.warning("O **catálogo de materiais (Sysmat)** não está carregado, por isso a coluna **Descr Completa** está "
                   "vazia. Coloque a extração (planilha com Codigo Sysmat, CodigoAlpargatas, Descr Completa e Status) "
                   "na pasta das bases" + (" ou envie aqui:" if edita else " ou peça a um editor para enviar."),
                   icon=":material/menu_book:")
        if not edita:
            return
        up = st.file_uploader(f"Enviar {NOMES_BASE[CATMAT]}", type=[e.strip(".") for e in EXTENSOES], key=chave)
        if up is not None and st.button("Gravar e usar este arquivo", key=f"{chave}_ok", icon=":material/upload:",
                                        type="primary"):
            if not auth.ainda_pode("estoque", editar=True):
                st.error("Seu acesso mudou: você não pode mais enviar arquivos.")
                return
            try:
                with st.spinner("Conferindo e gravando a extração…"):
                    nome = bases.enviar_arquivo(CATMAT, up.name, up.getvalue())
            except Exception as e:  # noqa: BLE001
                st.error(f"Arquivo não aceito: {e}")
            else:
                st.success(f"Gravado como `{nome}`.")
                st.rerun()


# ----------------------------------------------------------------------------
# Material cadastrado
# ----------------------------------------------------------------------------
@st.cache_resource(show_spinner="Cruzando o catálogo com o almoxarifado…", max_entries=2)
def _cadastrados(chave: str) -> pd.DataFrame:
    cat = bases.catalogo().df
    t = materiais.cadastrados(cat, bases.mb52().df)
    hay = (t["Material"] + " " + t["Sysmat"] + " " + t["NCM"] + " " + t["Descrição curta"] + " " + t["PDM"] + " "
           + t["Fabricante / referência"] + " " + t["Informação técnica"])
    t["_busca"] = (hay.str.normalize("NFKD").str.encode("ascii", "ignore").str.decode("ascii").str.upper())
    return t


def mostrar_cadastrados(edita: bool) -> None:
    cat = bases.catalogo()
    if cat.df is None:
        if cat.erro:
            st.error(f"Não foi possível ler a extração do Sysmat: {cat.erro}")
        aviso_sem_catalogo(edita, "mc_up")
        return
    t = _cadastrados(bases.assinatura_dados())
    ativos_ = t["Status"].isin(materiais.ATIVOS)
    c = st.columns(4)
    c[0].metric("Materiais cadastrados", inteiro(len(t)), border=True, delta_arrow="off",
                help="Itens da extração do Sysmat (um por código).")
    c[1].metric("Cadastro ativo", inteiro(ativos_.sum()), f"{inteiro((t['Status'] == 'APROVADO').sum())} aprovados",
                delta_color="off", border=True, delta_arrow="off",
                help="Aprovado, inventário, controladoria ou em inclusão/validação.")
    c[2].metric("Bloqueados, cancelados ou duplicados", inteiro(t["Status"].isin(materiais.INATIVOS).sum()),
                border=True, delta_arrow="off")
    c[3].metric("No almoxarifado", inteiro(t["No almoxarifado"].sum()), "estão na MB52", delta_color="off",
                border=True, delta_arrow="off")

    with ui.caixa_filtros():
        f = st.columns([3, 2, 2, 2])
        busca = f[0].text_input("Buscar material cadastrado", key="mc_busca",
                                placeholder="código, Sysmat, descrição, Descr Completa, fabricante, NCM…",
                                help="Procura em todo o catálogo, inclusive no texto inteiro da Descr Completa.")
        status_existentes = [s for s in [*materiais.ATIVOS, *materiais.INATIVOS] if s in set(t["Status"])]
        status_existentes += sorted(set(t["Status"]) - set(status_existentes) - {""})
        sts = f[1].multiselect("Status do cadastro", status_existentes, key="mc_status", placeholder="Todos")
        cats = f[2].multiselect("Categoria", sorted(x for x in t["Categoria"].unique() if x), key="mc_cat",
                                placeholder="Todas")
        onde = f[3].segmented_control("Almoxarifado", ["Todos", "No almox.", "Fora"], default="Todos",
                                      required=True, key="mc_onde")
    m = pd.Series(True, index=t.index)
    if busca.strip():
        for termo in sem_acento(busca).upper().split():
            m &= t["_busca"].str.contains(termo, regex=False)
    if sts:
        m &= t["Status"].isin(sts)
    if cats:
        m &= t["Categoria"].isin(cats)
    if onde == "No almox.":
        m &= t["No almoxarifado"]
    elif onde == "Fora":
        m &= ~t["No almoxarifado"]
    vis = (t[m].sort_values(["No almoxarifado", "Descrição curta"], ascending=[False, True])
           .drop(columns="_busca").reset_index(drop=True))

    a, b = st.columns([3, 2], vertical_alignment="bottom")
    a.caption(f"**{inteiro(len(vis))}** material(is) — a lista não tem limite: role até o fim. Clique numa linha "
              "para ver a ficha técnica completa.")
    with b:
        alt_linha = altura_linha("mc_altura")
    cols = ["Material", "Sysmat", "Descrição curta", "Informação técnica", "UM", "Categoria", "Subcategoria", "NCM",
            "Fabricante / referência", "Status", "Substituto", "No almoxarifado", "Estoque"]
    ev = st.dataframe(vis[cols], hide_index=True, width="stretch", height=ui.altura_tabela(720),
                      row_height=alt_linha, on_select="rerun", selection_mode="single-row", key="mc_tabela",
                      column_config={"Informação técnica": col_descr(), "Estoque": ui.col_num(),
                                     "Descrição curta": st.column_config.TextColumn(width="medium"),
                                     "No almoxarifado": st.column_config.CheckboxColumn("No almox.")})
    ui.baixar(vis.rename(columns={"Informação técnica": DESCR}), "materiais_cadastrados",
              f"Baixar os {inteiro(len(vis))} materiais (Excel)", chave="mc_baixar")
    sel = ev.selection.rows if ev and ev.selection else []
    if sel and sel[0] < len(vis):
        r = vis.iloc[sel[0]]
        ficha(r, f"{r['Material'] or r['Sysmat']} · {r['Descrição curta']}")
