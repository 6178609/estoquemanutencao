import altair as alt
import pandas as pd
import streamlit as st

from central import auth, bases, ui
from central.leitura import IW38
from central.util import brl, inteiro, sem_acento

ui.cabecalho("Equipamentos", "Lista montada automaticamente a partir das ordens do IW38 — complete com criticidade e peças de reposição")

eu = auth.usuario_atual()
edita = auth.pode_editar(eu)
base = bases.iw38()
if not ui.aviso_base(base, IW38):
    st.stop()

df, todas, desc = ui.filtros_ordens(base.df)
estoque = bases.mb52()
ih08 = bases.equipamentos().df        # cadastro do SAP (nome, localização, código ABC)
notas = bases.notas().df
cad = bases.ler_cadastro(bases.ARQ_CAD_EQUIP)
cad_mat = bases.ler_cadastro(bases.ARQ_CAD_MAT)
CRITICIDADES = ["Alta", "Média", "Baixa"]
CATEGORIAS = ["Mecânico", "Elétrico", "Instrumentação", "Hidráulico", "Pneumático", "Civil", "Utilidades", "Outro"]

est_por_cod = estoque.df.set_index("Material") if estoque.df is not None else None


def sem_estoque(codigos) -> int:
    if est_por_cod is None:
        return 0
    n = 0
    for c in codigos:
        q = est_por_cod["Estoque"].get(c)
        minimo = (cad_mat.get(c) or {}).get("minimo") or 0
        if q is None or q <= max(0, minimo):
            n += 1
    return n


# ----------------------------------------------------------------------------
# Tabela de equipamentos
# ----------------------------------------------------------------------------
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
    por_eq = notas.groupby("Equip. (chave)").agg(Notas=("Nota", "size"), Paradas=("Com parada", "sum"),
                                                  _sem=("Com ordem", lambda s: int((~s).sum())))
    tab["Notas"] = tab["Código"].map(por_eq["Notas"]).fillna(0).astype(int)
    tab["Notas sem ordem"] = tab["Código"].map(por_eq["_sem"]).fillna(0).astype(int)
    tab["Paradas"] = tab["Código"].map(por_eq["Paradas"]).fillna(0).astype(int)
tab["Categoria"] = tab["Código"].map(lambda k: (cad.get(k) or {}).get("categoria", ""))
tab["Peças"] = tab["Código"].map(lambda k: len((cad.get(k) or {}).get("materiais", [])))
tab["Peças em falta"] = tab["Código"].map(lambda k: sem_estoque((cad.get(k) or {}).get("materiais", [])))

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
        *(["Notas", "Notas sem ordem", "Paradas"] if notas is not None else []),
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
if "eq_sel" in st.session_state:  # veio da página de Ordens
    st.session_state["eq_ficha"] = st.session_state.pop("eq_sel")
linhas = ev.selection.rows if ev and ev.selection else []
if linhas:
    escolhido = vis.iloc[linhas[0]]["Código"]
    if st.session_state.get("_eq_ultima_sel") != escolhido:
        st.session_state["eq_ficha"] = escolhido
        st.session_state["_eq_ultima_sel"] = escolhido

nomes = dict(zip(tab["Código"], tab["Nome"].fillna("")))
opcoes = list(tab.sort_values("Custo", ascending=False)["Código"])
if st.session_state.get("eq_ficha") not in nomes:
    st.session_state.pop("eq_ficha", None)

st.divider()
if edita:
    with st.expander("Cadastrar equipamento que não aparece no IW38", icon=":material/add:"):
        with st.form("novo_eq", clear_on_submit=True):
            n1, n2 = st.columns(2)
            cod = n1.text_input("Código / TAG")
            nome = n2.text_input("Nome")
            if st.form_submit_button("Cadastrar", icon=":material/save:"):
                if cod.strip() and nome.strip():
                    bases.gravar_cadastro(bases.ARQ_CAD_EQUIP, cod.strip(), {"nome": nome.strip(), "criticidade": "Média",
                                                                             "categoria": "Outro", "observacoes": "", "materiais": []},
                                          auth.nome_de(eu))
                    st.session_state["eq_ficha"] = cod.strip()
                    st.rerun()
                else:
                    st.error("Preencha código e nome.")

extra = {} if "eq_ficha" in st.session_state else {"index": None}
sel = st.selectbox("Ficha do equipamento", opcoes, key="eq_ficha", placeholder="Selecione na tabela acima ou busque aqui…",
                   format_func=lambda k: f"{k} · {nomes.get(k, '')}", **extra)
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

g, form = st.columns([3, 2])
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
                    f"{inteiro(ne['Com parada'].sum())} com parada, {inteiro((~ne['Com ordem']).sum())} sem ordem")
        if len(ne):
            st.dataframe(ne[["Nota", "Data", "Tipo de nota", "Descrição", "Com parada", "Ordem", "Notificador"]].head(200),
                         hide_index=True, width="stretch", height=ui.altura_tabela(220),
                         column_config={"Data": ui.col_data(), "Com parada": st.column_config.CheckboxColumn("Parada"),
                                        "Descrição": st.column_config.TextColumn(width="large")})

with form, st.container(border=True):
    st.markdown("**Cadastro** — fica salvo na pasta compartilhada; todos veem")
    opcoes_mat, rot_mat = [], {}
    if estoque.df is not None:
        opcoes_mat = list(estoque.df["Material"])
        rot_mat = dict(zip(estoque.df["Material"], estoque.df["Descrição"]))
    atuais = [m for m in info.get("materiais", [])]
    opcoes_mat = list(dict.fromkeys(atuais + opcoes_mat))
    if not edita:
        st.caption(":material/lock: Seu perfil é de consulta — peça a um editor para alterar o cadastro.")
    with st.form(f"cad_{sel}"):
        crit_atual = info.get("criticidade") or dict(zip(tab["Código"], tab["Criticidade"])).get(sel, "")
        cr = st.selectbox("Criticidade", CRITICIDADES, index=CRITICIDADES.index(crit_atual) if crit_atual in CRITICIDADES else 1,
                          help="Sem cadastro aqui, vale o código ABC do SAP (IH08): A = Alta, B = Média, C = Baixa.")
        ca = st.selectbox("Categoria", CATEGORIAS, index=CATEGORIAS.index(info["categoria"]) if info.get("categoria") in CATEGORIAS else 0)
        ob = st.text_area("Observações", info.get("observacoes", ""), placeholder="Função, cuidados, histórico relevante…")
        mats = st.multiselect("Peças de reposição (materiais do MB52)", opcoes_mat, default=atuais,
                              format_func=lambda c: f"{c} · {rot_mat.get(c, 'fora do MB52 atual')}",
                              placeholder="Digite código ou descrição…")
        s1, s2 = st.columns(2)
        salvar = s1.form_submit_button("Salvar", icon=":material/save:", type="primary", width="stretch", disabled=not edita)
        limpar = s2.form_submit_button("Apagar cadastro", icon=":material/delete:", width="stretch", disabled=not (info and edita))
    if salvar and edita:
        bases.gravar_cadastro(bases.ARQ_CAD_EQUIP, sel, {"nome": nomes.get(sel) or info.get("nome", ""), "criticidade": cr,
                                                         "categoria": ca, "observacoes": ob, "materiais": mats}, auth.nome_de(eu))
        st.toast("Cadastro salvo.", icon=":material/check:")
        st.rerun()
    if limpar and edita:
        bases.gravar_cadastro(bases.ARQ_CAD_EQUIP, sel, None, auth.nome_de(eu))
        st.rerun()
    if info.get("atualizado_em"):
        st.caption(f"Última edição: {info.get('atualizado_por') or 'sem nome'} em {info['atualizado_em'][:16].replace('T', ' ')} (UTC)")

    if atuais and est_por_cod is not None:
        st.markdown("**Situação das peças vinculadas**")
        linhas_p = []
        for c in atuais:
            q = est_por_cod["Estoque"].get(c)
            minimo = (cad_mat.get(c) or {}).get("minimo")
            situ = "fora do MB52" if q is None else ("zerado" if q <= 0 else ("abaixo do mínimo" if minimo and q < minimo else "ok"))
            linhas_p.append({"Material": c, "Descrição": rot_mat.get(c, ""), "Estoque": q, "Mínimo": minimo, "Situação": situ})
        st.dataframe(pd.DataFrame(linhas_p), hide_index=True, width="stretch")
