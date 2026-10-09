"""Telas do Estoque ligadas ao catálogo de materiais: a ficha técnica paginada (informação técnica com quebra de
linha em cada atributo e quebra de página na impressão) e a área "Material cadastrado"."""

from __future__ import annotations

import html

import pandas as pd
import streamlit as st

from . import bases, materiais, ui
from .leitura import CATMAT
from .util import inteiro, sem_acento

POR_PAGINA = [25, 50, 100]
_CSS = """
<style>
.cm-ficha{width:100%;border-collapse:collapse;font-size:.86rem;line-height:1.35}
.cm-ficha th{text-align:left;font-weight:600;padding:.45rem .5rem;
  border-bottom:2px solid rgba(128,128,128,.45)}
.cm-ficha td{vertical-align:top;padding:.45rem .5rem;border-bottom:1px solid rgba(128,128,128,.25)}
.cm-ficha td.cm-num{text-align:right;white-space:nowrap}
.cm-ficha td.cm-cod{white-space:nowrap;font-family:monospace}
.cm-ficha td.cm-tec{min-width:22rem}
.cm-ficha .cm-vazio{opacity:.6;font-style:italic}
.cm-ficha .cm-sel{display:inline-block;padding:0 .4rem;border-radius:.6rem;font-size:.75rem;
  background:rgba(128,128,128,.18)}
.cm-ficha .cm-sel.ruim{background:rgba(227,38,43,.18)}
@media (max-width:640px){.cm-ficha thead{display:none}.cm-ficha tr{display:block;padding:.4rem 0;
  border-bottom:1px solid rgba(128,128,128,.35)}.cm-ficha td{display:block;border:0;padding:.15rem .2rem;min-width:0!important;
  text-align:left!important}.cm-ficha td::before{content:attr(data-rotulo);display:block;font-size:.7rem;opacity:.65;
  text-transform:uppercase}}
@media print{.cm-ficha tr{break-inside:avoid;page-break-inside:avoid}
  .cm-ficha thead{display:table-header-group}.cm-pagina{break-after:page;page-break-after:always}}
</style>
"""


def _num(v, casas: int = 2) -> str:
    if v is None or pd.isna(v):
        return "—"
    s = f"{float(v):,.{casas}f}".replace(",", "X").replace(".", ",").replace("X", ".")
    return s[:-3] if s.endswith(",00") else s


def _celula(col: str, v) -> str:
    return _td(col, v).replace("<td", f"<td data-rotulo='{html.escape(col, quote=True)}'", 1)


def _td(col: str, v) -> str:
    if col == "Informação técnica":
        return f"<td class='cm-tec'>{materiais.info_html(v)}</td>"
    if col in ("Estoque", "Mínimo"):
        return f"<td class='cm-num'>{_num(v)}</td>"
    if col in ("Material", "Sysmat"):
        return f"<td class='cm-cod'>{html.escape(str(v or '—'))}</td>"
    if col in ("Cadastro", "Status", "Situação"):
        ruim = str(v) in ("Zerado", "Abaixo do mínimo", "Não encontrado no Sysmat", "Bloqueado", "Cancelado",
                          "Duplicado", *materiais.INATIVOS)
        return f"<td><span class='cm-sel{' ruim' if ruim else ''}'>{html.escape(str(v or '—'))}</span></td>"
    texto = "" if v is None or (isinstance(v, float) and pd.isna(v)) else str(v)
    return f"<td>{html.escape(texto) if texto else '—'}</td>"


def tabela_ficha(df: pd.DataFrame, colunas: list[str]) -> str:
    """Tabela HTML (texto escapado) com a informação técnica um atributo por linha."""
    cab = "".join(f"<th>{html.escape(c)}</th>" for c in colunas)
    linhas = "".join("<tr>" + "".join(_celula(c, r[c]) for c in colunas) + "</tr>"
                     for r in df[colunas].to_dict("records"))
    return f"{_CSS}<div class='cm-pagina' style='overflow-x:auto'><table class='cm-ficha'><thead><tr>{cab}</tr></thead><tbody>{linhas}" \
           "</tbody></table></div>"


def paginar(df: pd.DataFrame, chave: str, rotulo: str = "itens") -> pd.DataFrame:
    """Controles de página (itens por página e página) e o trecho da página escolhida."""
    total = len(df)
    c = st.columns([1.2, 1.2, 3], vertical_alignment="bottom")
    n = c[0].selectbox("Itens por página", POR_PAGINA, key=f"{chave}_n")
    paginas = max(1, -(-total // n))
    # a chave muda com o total (filtro novo): a página volta para 1 e nunca passa do novo máximo
    pagina = c[1].number_input(f"Página (de {paginas})", min_value=1, max_value=paginas, value=1, step=1,
                               key=f"{chave}_p_{total}_{n}")
    pagina = min(int(pagina), paginas)
    ini = (pagina - 1) * n
    c[2].caption(f"{inteiro(ini + 1 if total else 0)}–{inteiro(min(ini + n, total))} de {inteiro(total)} {rotulo} · "
                 f"página {pagina} de {paginas} · para imprimir, use Ctrl+P (cada página fica sem cortar o item)")
    return df.iloc[ini:ini + n]


# ----------------------------------------------------------------------------
# Material cadastrado
# ----------------------------------------------------------------------------
@st.cache_resource(show_spinner="Cruzando o catálogo com o almoxarifado…", max_entries=2)
def _cadastrados(chave: str) -> pd.DataFrame:
    cat = bases.catalogo().df
    t = materiais.cadastrados(cat, bases.mb52().df)
    hay = (t["Material"] + " " + t["Sysmat"] + " " + t["NCM"] + " " + t["Descrição curta"] + " " + t["PDM"] + " "
           + t["Fabricante / referência"] + " " + t["Informação técnica"].str.slice(0, 400))
    t["_busca"] = (hay.str.normalize("NFKD").str.encode("ascii", "ignore").str.decode("ascii").str.upper())
    return t


def mostrar_cadastrados() -> None:
    cat = bases.catalogo()
    if not ui.aviso_base(cat, CATMAT):
        st.caption("Coloque na pasta do site a **extração do cadastro de materiais (Sysmat)** — a planilha com Código "
                   "Sysmat, Código Alpargatas, Descr Completa e Status. O site reconhece sozinho pelas colunas.")
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
                                placeholder="código, Sysmat, descrição, fabricante, referência, NCM…")
        status_existentes = [s for s in [*materiais.ATIVOS, *materiais.INATIVOS] if s in set(t["Status"])]
        status_existentes += sorted(set(t["Status"]) - set(status_existentes) - {""})
        sts = f[1].multiselect("Status do cadastro", status_existentes, key="mc_status", placeholder="Todos",
                               default=[s for s in ("APROVADO",) if s in status_existentes])
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
    vis = t[m].sort_values(["No almoxarifado", "Descrição curta"], ascending=[False, True]).drop(columns="_busca")

    modo = st.segmented_control("Exibir", ["Ficha técnica", "Tabela"], default="Ficha técnica", required=True,
                                key="mc_modo", label_visibility="collapsed",
                                format_func=lambda v: (":material/description: " if v == "Ficha técnica"
                                                       else ":material/table: ") + v)
    pag = paginar(vis, "mc_pag", "materiais")
    if modo == "Ficha técnica":
        st.html(tabela_ficha(pag, ["Material", "Sysmat", "Descrição curta", "UM", "Categoria", "Informação técnica",
                                   "Fabricante / referência", "Status", "Estoque"]))
    else:
        st.dataframe(pag[["Material", "Sysmat", "Descrição curta", "UM", "NCM", "Categoria", "Subcategoria",
                          "Fabricante / referência", "Status", "Substituto", "No almoxarifado", "Estoque",
                          "Informação técnica"]],
                     hide_index=True, width="stretch", height=ui.altura_tabela(520),
                     column_config={"Estoque": ui.col_num(), "Informação técnica": st.column_config.TextColumn(
                         width="large"), "No almoxarifado": st.column_config.CheckboxColumn("No almox.")})
    ui.baixar(vis, "materiais_cadastrados", f"Baixar os {inteiro(len(vis))} filtrados (Excel)", chave="mc_baixar")
