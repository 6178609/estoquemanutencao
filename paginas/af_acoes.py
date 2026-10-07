import altair as alt
import numpy as np
import pandas as pd
import streamlit as st

from central import af, bases, contexto, ui
from central import indicadores as ind
from central.leitura import ACAO_AF
from central.util import inteiro, sem_acento

ui.cabecalho("Ações de AF · plano de ação",
             "Gestão das ações das análises de falha: execução e prazo por data limite, fila de prioridade, "
             "cumprimento por responsável e supervisor e tipos de ação WCM (causa raiz, TTR, padronização, expansão)")

base = bases.acoes_af()
if not ui.aviso_base(base, ACAO_AF):
    st.stop()
cad = contexto.metas()
hoje = pd.Timestamp.now().normalize()
PAGINA_AF = "paginas/af_planos.py"
SEM_NOME = "(sem nome)"
SEM_TIPO = "Sem tipo marcado"
FAIXAS = ["0–7", "8–30", "31–90", "> 90"]
COR_FAIXA = ["#F2B705", ui.LARANJA, ui.VERMELHO, "#8E1418"]

acoes = base.df
afs_base = bases.afs()
afs = afs_base.df
if afs is None:
    afs = pd.DataFrame({"Nº AF": pd.Series(dtype=str), "Situação": pd.Series(dtype=str),
                        "Criticidade": pd.Series(dtype=str), "Data da falha": pd.Series(dtype="datetime64[ns]"),
                        "Data limite": pd.Series(dtype="datetime64[ns]"),
                        "Dias para análise": pd.Series(dtype=float)})
    st.caption(":material/info: Análises de falha não encontradas: os dados da AF de origem (resumo, causa raiz, "
               "criticidade) e o indicador de ações por AF ficam limitados.")

BASES_ACAO = ["Data limite", "Data de início", "Data realizada"]
f = contexto.filtros_globais(
    datas=pd.concat([acoes["Data limite"], acoes["Data de início"]]), bases_data=BASES_ACAO, chave_base="aa_base",
    ajuda_base="Data usada para filtrar a tabela das ações. Os indicadores seguem a definição corporativa: execução e "
               "prazo pela data limite; geradas pela data de início.")
BASE_DATA = contexto.data_de_referencia("aa_base", BASES_ACAO)


def _chave() -> str:
    return bases.assinatura_geral() + "|" + str(hoje.date())


@st.cache_data(show_spinner=False, max_entries=16)
def _indicadores(chave: str, ini, fim) -> dict:
    a = bases.acoes_af().df
    b = bases.afs().df
    return af.indicadores(b if b is not None else afs, a, ini, fim, hoje)


@st.cache_data(show_spinner="Calculando a evolução mês a mês…", max_entries=8)
def _serie(chave: str, ini, fim) -> pd.DataFrame:
    a = bases.acoes_af().df
    b = bases.afs().df
    fim_ts = pd.Timestamp(fim)
    ini_s = max(pd.Timestamp(ini), (fim_ts - pd.DateOffset(months=11)).to_period("M").start_time)
    return af.mensal(b if b is not None else afs, a, ini_s, fim_ts, hoje)


def _nome(serie: pd.Series) -> pd.Series:
    return serie.replace("", SEM_NOME)


def _num(v) -> str:
    if v is None or (isinstance(v, float) and np.isnan(v)):
        return "—"
    return f"{v:,.1f}".replace(",", "X").replace(".", ",").replace("X", ".")


def _pct_txt(v) -> str:
    return "—" if v is None or pd.isna(v) else f"{v:.1f}%".replace(".", ",")


def _farol_pct(v) -> str:
    if v is None or pd.isna(v):
        return ""
    if v >= 90:
        return "background-color: rgba(14,159,70,.18)"
    if v >= 70:
        return "background-color: rgba(242,183,5,.25)"
    return "background-color: rgba(227,38,43,.18)"


def _cor_situacao(v) -> str:
    cor = af.COR.get(v)
    return f"color: {cor}; font-weight: 700" if cor else ""


def _link_http(serie: pd.Series) -> pd.Series:
    return serie.where(serie.str.match(r"^https?://", case=False), None)


vivas = acoes[acoes["Situação"] != af.AC_CANCELADA]
abertas = vivas[vivas["Situação"].isin(af.AC_ABERTAS)]
no_periodo = vivas[ui.entre(vivas["Data limite"], f.ini, f.fim)]
st.caption("Indicadores: execução e prazo pela **data limite**, geradas pela **data de "
           "início** · atrasadas, abertas e fila de prioridade são o retrato de hoje · canceladas não contam · os "
           "filtros de área/centro/tipo da barra lateral não se aplicam às AFs")

# ----------------------------------------------------------------------------
# Cartões
# ----------------------------------------------------------------------------
r = _indicadores(_chave(), f.ini, f.fim)
a_ini, a_fim = ind.periodo_anterior(f.ini, f.fim)
r_ant = _indicadores(_chave(), a_ini, a_fim)
r["acoes_vencem_7d"] = float((vivas["Situação"] == af.AC_VENCE).sum())
concl = vivas[ui.entre(vivas["Data realizada"], f.ini, f.fim) & (vivas["Dias para concluir"] >= 0)]
r["acoes_dias_concluir"] = float(concl["Dias para concluir"].mean()) if len(concl) else None
if r.get("acoes_por_af") is None:  # sem a aba de análises: ações iniciadas ÷ AFs distintas dessas ações
    ger = vivas[ui.entre(vivas["Data de início"], f.ini, f.fim)]
    r["acoes_por_af"] = len(ger) / ger["Nº AF"].nunique() if len(ger) else None

CARTOES = [
    ("acoes_execucao", "Ações de AFs", "%",
     "Ações com data limite no período (até hoje) realizadas ÷ ações com data limite no período."),
    ("acoes_no_prazo", "Ações no prazo", "%",
     "Ações com data limite no período (até hoje) realizadas até a data limite ÷ ações com data limite no período."),
    ("acoes_atrasadas", "Atrasadas hoje", "un", "Ações abertas com a data limite vencida (retrato de hoje)."),
    ("acoes_abertas", "Ações abertas", "un", "Ações não concluídas e não canceladas (retrato de hoje)."),
    ("acoes_vencem_7d", "Vencem em 7 dias", "un", "Ações abertas com data limite entre hoje e os próximos 7 dias."),
    ("acoes_dias_concluir", "Dias p/ concluir", "dias",
     "Média de dias entre a data de início e a data realizada das ações concluídas no período."),
    ("acoes_por_af", "Ações por AF", "x",
     "Ações iniciadas no período ÷ AFs geradas no período (data da falha). Sem a aba de análises (ou sem AFs "
     "geradas no período): ações iniciadas ÷ AFs distintas dessas ações."),
]
usar_kpi = all(k in ind.POR_ID for k in ("acoes_execucao", "acoes_no_prazo", "acoes_atrasadas"))
serie = None
if usar_kpi:
    try:
        serie = _serie(_chave(), f.ini, f.fim)
    except Exception:  # noqa: BLE001 — sem série, os cartões só não mostram a mini tendência
        serie = None
    st.markdown(contexto.CSS, unsafe_allow_html=True)


def _cartao_simples(nome: str, valor: str, legenda: str, ajuda: str, chave: str) -> None:
    with st.container(border=True, key=f"kpi-neutro-aa-{chave}"):
        st.markdown(f'<div class="cm-kpi-t"><span class="cm-dot" style="background:{ui.CINZA}"></span>{nome}</div>'
                    f'<div class="cm-kpi-v">{valor}</div><div class="cm-kpi-m">{legenda}</div>',
                    unsafe_allow_html=True, help=ajuda)


def _valor_txt(unidade: str, v) -> str:
    if v is None or (isinstance(v, float) and np.isnan(v)):
        return "—"
    if unidade == "%":
        return _pct_txt(v)
    if unidade == "dias":
        return f"{_num(v)} dias"
    if unidade == "x":
        return _num(v)
    return inteiro(v)


for linha in (CARTOES[:4], CARTOES[4:]):
    cols = st.columns(4)
    for c, (kid, nome, unidade, ajuda) in zip(cols, linha):
        with c:
            v = r.get(kid)
            if usar_kpi and kid in ind.POR_ID:
                contexto.cartao(ind.POR_ID[kid], v, r_ant.get(kid), cad, serie, prefixo="aa-", link=False)
            elif usar_kpi:
                leg = "retrato de hoje" if kid in ("acoes_vencem_7d", "acoes_abertas") else "no período"
                _cartao_simples(nome, _valor_txt(unidade, v), leg, ajuda, kid)
            else:
                st.metric(nome, _valor_txt(unidade, v), help=ajuda, border=True, delta_arrow="off")

# ----------------------------------------------------------------------------
# Fila de prioridade
# ----------------------------------------------------------------------------
st.markdown("#### :material/priority_high: Fila de prioridade")
fila = vivas[vivas["Situação"].isin([af.AC_ATRASADA, af.AC_VENCE])].copy()
# texto: célula vazia nas atrasadas (número nulo aparece escrito "None" na tabela)
fila["Vence em (dias)"] = [f"{int(v)}" if s_ == af.AC_VENCE and pd.notna(v) else ""
                           for v, s_ in zip((fila["Data limite"] - hoje).dt.days, fila["Situação"])]
n_atr = int((fila["Situação"] == af.AC_ATRASADA).sum())
n_vence = int((fila["Situação"] == af.AC_VENCE).sum())
with st.container(border=True):
    q1, q2 = st.columns([3, 2])
    q1.markdown(f"**{inteiro(n_atr)}** ações atrasadas e **{inteiro(n_vence)}** que vencem em até 7 dias, de "
                f"**{inteiro(fila['Responsável'].replace('', np.nan).nunique())}** responsáveis — as mais atrasadas "
                "primeiro.")
    modo = q2.segmented_control("Mostrar", ["Todas", "Atrasadas", "Vencem em 7 dias"], default="Todas",
                                key="aa_fila_modo", label_visibility="collapsed") or "Todas"
    if modo == "Atrasadas":
        fila = fila[fila["Situação"] == af.AC_ATRASADA]
    elif modo == "Vencem em 7 dias":
        fila = fila[fila["Situação"] == af.AC_VENCE]
    fila = fila.sort_values(["Dias de atraso", "Data limite"], ascending=[False, True]).reset_index(drop=True)
    COLS_FILA = ["Situação", "Dias de atraso", "Vence em (dias)", "Data limite", "Responsável", "Supervisor", "Nº AF",
                 "Nº ação", "Equipamento", "Ação", "Criticidade"]
    if len(fila):
        vis_fila = fila[COLS_FILA].head(500)
        maior = float(max(vis_fila["Dias de atraso"].fillna(0).max(), 1))
        estilo = (vis_fila.style.map(_cor_situacao, subset=["Situação"])
                  .map(lambda d: "color: #E3262B; font-weight: 700" if d and d > 0 else "", subset=["Dias de atraso"]))
        st.dataframe(estilo, hide_index=True, width="stretch", height=ui.altura_tabela(360), key="aa_fila",
                     column_config={
                         "Dias de atraso": st.column_config.ProgressColumn("Dias de atraso", format="%d", min_value=0,
                                                                           max_value=maior, color="red"),
                         "Data limite": ui.col_data(), "Ação": st.column_config.TextColumn(width="large"),
                         "Equipamento": st.column_config.TextColumn(width="medium")})
        if len(fila) > 500:
            st.caption(f"Mostrando as 500 primeiras de {inteiro(len(fila))} — baixe a lista completa.")
        ui.baixar(fila[COLS_FILA], "acoes_af_prioridade", "Baixar fila (Excel)", chave="aa_fila_baixar")
    else:
        st.success("Nenhuma ação atrasada ou vencendo nos próximos 7 dias.", icon=":material/task_alt:")

# ----------------------------------------------------------------------------
# Scorecard por responsável / supervisor
# ----------------------------------------------------------------------------
st.markdown("#### :material/groups: Cumprimento por responsável e supervisor")


def _scorecard(campo: str) -> pd.DataFrame:
    per = no_periodo.assign(_q=_nome(no_periodo[campo]))
    venc = per[per["Data limite"] <= hoje]
    hoje_v = vivas.assign(_q=_nome(vivas[campo]))
    atrasadas = per[per["Dias de atraso"] > 0]
    t = pd.DataFrame({
        "Ações no período": per.groupby("_q").size(),
        "Vencidas": venc.groupby("_q").size(),
        "No prazo": venc[venc["Situação"] == af.AC_NO_PRAZO].groupby("_q").size(),
        "Fora do prazo": per[per["Situação"] == af.AC_FORA_PRAZO].groupby("_q").size(),
        "Atrasadas hoje": hoje_v[hoje_v["Situação"] == af.AC_ATRASADA].groupby("_q").size(),
        "Abertas": hoje_v[hoje_v["Situação"].isin(af.AC_ABERTAS)].groupby("_q").size(),
        "Dias médios de atraso": atrasadas.groupby("_q")["Dias de atraso"].mean(),
    })
    cont = ["Ações no período", "Vencidas", "No prazo", "Fora do prazo", "Atrasadas hoje", "Abertas"]
    t[cont] = t[cont].fillna(0).astype(int)
    t["Concluídas no prazo %"] = np.where(t["Vencidas"] > 0, t["No prazo"] / t["Vencidas"].where(t["Vencidas"] > 0)
                                          * 100, np.nan)
    t = t[(t["Ações no período"] > 0) | (t["Abertas"] > 0)]
    t = t.rename_axis(campo).reset_index()
    return t[[campo, "Ações no período", "Concluídas no prazo %", "Fora do prazo", "Atrasadas hoje", "Abertas",
              "Dias médios de atraso", "Vencidas"]].sort_values(["Atrasadas hoje", "Ações no período"], ascending=False)


with st.container(border=True):
    s1, s2 = st.columns([3, 2])
    s1.markdown("**Scorecard** — ações com data limite no período; atrasadas e abertas são de hoje",
                help="Concluídas no prazo % = ações com data limite no período (até hoje) realizadas até a data "
                     "limite ÷ ações vencidas no período. Farol: ≥ 90% verde, ≥ 70% amarelo, abaixo vermelho. "
                     "Dias médios de atraso = média entre as ações do período que atrasaram (concluídas fora do "
                     "prazo ou ainda abertas com a data vencida).")
    dim = s2.segmented_control("Agrupar por", ["Responsável", "Supervisor"], default="Responsável", key="aa_sc_dim",
                               label_visibility="collapsed") or "Responsável"
    sc = _scorecard(dim).reset_index(drop=True)
    if len(sc):
        estilo = sc.style.map(_farol_pct, subset=["Concluídas no prazo %"]).format(
            {"Concluídas no prazo %": _pct_txt, "Dias médios de atraso": _num})
        st.dataframe(estilo, hide_index=True, width="stretch", height=ui.altura_tabela(min(420, 38 + 35 * len(sc))),
                     key=f"aa_sc_{dim}",
                     column_config={"Atrasadas hoje": st.column_config.ProgressColumn(
                         "Atrasadas hoje", format="%d", min_value=0, max_value=int(sc["Atrasadas hoje"].max() or 1),
                         color="red")})
        ui.baixar(sc, f"acoes_af_por_{sem_acento(dim).lower()}", "Baixar scorecard (Excel)", chave="aa_sc_baixar")
    else:
        st.info("Nenhuma ação com data limite no período.")

with st.container(border=True):
    st.markdown("**Ações atrasadas hoje por responsável** (20 maiores)")
    atr = vivas[vivas["Situação"] == af.AC_ATRASADA]
    if len(atr):
        g = _nome(atr["Responsável"]).value_counts().head(20).rename_axis("Responsável").reset_index(name="Atrasadas")
        ui.mostrar(ui.grafico_barras_h(g, "Responsável", "Atrasadas", ui.VERMELHO))
    else:
        st.caption("Nenhuma ação atrasada hoje.")

# ----------------------------------------------------------------------------
# Tipos de ação WCM
# ----------------------------------------------------------------------------
st.markdown("#### :material/category: Tipos de ação WCM")
geradas = vivas[ui.entre(vivas["Data de início"], f.ini, f.fim)]
linhas_tipo = []
for t in [*af.TIPOS_ACAO, SEM_TIPO]:
    m = (~geradas[af.TIPOS_ACAO].any(axis=1)) if t == SEM_TIPO else geradas[t]
    g = geradas[m]
    feitas = int(g["Situação"].isin(af.AC_CONCLUIDAS).sum())
    linhas_tipo.append({"Tipo da ação": t, "Ações": len(g), "% das ações": len(g) / len(geradas) * 100 if len(geradas)
                        else None, "Concluídas": feitas, "% concluída": feitas / len(g) * 100 if len(g) else None,
                        "No prazo": int((g["Situação"] == af.AC_NO_PRAZO).sum()),
                        "Atrasadas hoje": int((g["Situação"] == af.AC_ATRASADA).sum())})
tipos = pd.DataFrame(linhas_tipo)
e, d = st.columns([3, 2])
with e, st.container(border=True):
    st.markdown(f"**Ações iniciadas no período por tipo** ({inteiro(len(geradas))} ações)",
                help="Uma ação pode ter mais de um tipo marcado no gerenciador, então os percentuais somam mais "
                     "de 100%. % concluída = ações do tipo já concluídas ÷ ações do tipo iniciadas no período.")
    st.dataframe(tipos.style.format({"% das ações": _pct_txt}), hide_index=True, width="stretch", key="aa_tipos",
                 column_config={"% concluída": st.column_config.ProgressColumn(format="%.0f%%", min_value=0,
                                                                               max_value=100)})
with d, st.container(border=True):
    st.markdown("**% concluída por tipo**")
    tg = tipos[tipos["Ações"] > 0].copy()
    if len(tg):
        tg["Rótulo"] = tg["% concluída"].map(_pct_txt)
        base_t = alt.Chart(tg).encode(
            y=alt.Y("Tipo da ação:N", sort=[*af.TIPOS_ACAO, SEM_TIPO], title=None,
                    axis=alt.Axis(labelOverlap=False, labelLimit=160)),
            x=alt.X("% concluída:Q", title=None, scale=alt.Scale(domain=[0, 115]), axis=alt.Axis(grid=False)),
            tooltip=["Tipo da ação:N", alt.Tooltip("Ações:Q", format=",d"), alt.Tooltip("Rótulo:N", title="% concluída")])
        ui.mostrar((base_t.mark_bar(color=ui.VERDE, cornerRadiusEnd=3, height=18)
                    + base_t.mark_text(align="left", dx=4, fontSize=11).encode(text="Rótulo:N")).properties(height=190))
    else:
        st.caption("Nenhuma ação iniciada no período.")

# ----------------------------------------------------------------------------
# Evolução
# ----------------------------------------------------------------------------
st.markdown("#### :material/trending_up: Evolução")


def _janelas(ini, fim, gran: str) -> list[tuple[str, pd.Timestamp, pd.Timestamp]]:
    ini, fim = pd.Timestamp(ini), pd.Timestamp(fim)
    if gran == "Semana":
        s0 = ini - pd.Timedelta(days=ini.dayofweek)
        return [(f"{s:%d/%m/%y}", max(s, ini), min(s + pd.Timedelta(days=6), fim))
                for s in pd.date_range(s0, fim, freq="7D")]
    return [(contexto.mes_pt(m), max(m, ini), min(m + pd.offsets.MonthEnd(0), fim))
            for m in pd.date_range(ini.to_period("M").start_time, fim, freq="MS")]


gran = st.segmented_control("Granularidade", ["Mês", "Semana"], default="Mês", key="aa_gran") or "Mês"
jan = _janelas(f.ini, f.fim, gran)
linhas_ev, linhas_bk = [], []
for rot, a, b in jan:
    lim = vivas[ui.entre(vivas["Data limite"], a, b)]
    linhas_ev += [{"Período": rot, "Série": "Com data limite", "Ações": len(lim)},
                  {"Período": rot, "Série": "Realizadas", "Ações": int(ui.entre(vivas["Data realizada"], a, b).sum())},
                  {"Período": rot, "Série": "No prazo", "Ações": int((lim["Situação"] == af.AC_NO_PRAZO).sum())}]
    fim_j = min(b, hoje)
    if a > hoje:
        continue
    em_aberto = vivas[(vivas["Data de início"] <= fim_j)
                      & (vivas["Data realizada"].isna() | (vivas["Data realizada"] > fim_j))]
    linhas_bk += [{"Período": rot, "Série": "Abertas", "Ações": len(em_aberto)},
                  {"Período": rot, "Série": "Abertas vencidas", "Ações": int((em_aberto["Data limite"] < fim_j).sum())}]
ev = pd.DataFrame(linhas_ev)
bk = pd.DataFrame(linhas_bk)
ordem = [j[0] for j in jan]
eixo = alt.Axis(labelAngle=0 if gran == "Mês" and len(jan) <= 14 else -50, labelOverlap=False)
e, d = st.columns(2)
with e, st.container(border=True):
    st.markdown("**Data limite × realizadas × no prazo**",
                help="Com data limite: ações (não canceladas) que vencem na janela. Realizadas: ações com data "
                     "realizada na janela. No prazo: das que vencem na janela, as realizadas até a data limite.")
    if len(ev) and ev["Ações"].sum():
        cores = alt.Scale(domain=["Com data limite", "Realizadas", "No prazo"], range=[ui.GRAFITE, ui.AZUL, ui.VERDE])
        ui.mostrar(alt.Chart(ev).mark_bar(cornerRadiusTopLeft=2, cornerRadiusTopRight=2).encode(
            x=alt.X("Período:N", sort=ordem, title=None, axis=eixo),
            xOffset=alt.XOffset("Série:N", sort=["Com data limite", "Realizadas", "No prazo"]),
            y=alt.Y("Ações:Q", title=None, axis=alt.Axis(format="~s")),
            color=alt.Color("Série:N", scale=cores, legend=alt.Legend(orient="bottom", title=None)),
            tooltip=["Período:N", "Série:N", alt.Tooltip("Ações:Q", format=",d")]).properties(height=280))
    else:
        st.caption("Sem ações no período.")
with d, st.container(border=True):
    st.markdown("**Backlog de ações abertas** (no fim de cada janela)",
                help="Ações com data de início até o fim da janela e sem data realizada (ou realizadas depois). "
                     "Abertas vencidas: dessas, as com data limite já passada. Canceladas ficam fora. A janela "
                     "atual é medida hoje.")
    if len(bk):
        cores = alt.Scale(domain=["Abertas", "Abertas vencidas"], range=[ui.AZUL, ui.VERMELHO])
        ui.mostrar(alt.Chart(bk).mark_line(strokeWidth=2.4, point=alt.OverlayMarkDef(size=40, filled=True)).encode(
            x=alt.X("Período:N", sort=ordem, title=None, axis=eixo),
            y=alt.Y("Ações:Q", title=None, axis=alt.Axis(format="~s")),
            color=alt.Color("Série:N", scale=cores, legend=alt.Legend(orient="bottom", title=None)),
            tooltip=["Período:N", "Série:N", alt.Tooltip("Ações:Q", format=",d")]).properties(height=280))
    else:
        st.caption("Sem janelas até hoje no período.")

# ----------------------------------------------------------------------------
# Idade das abertas e situação geral
# ----------------------------------------------------------------------------
e, d = st.columns(2)
with e, st.container(border=True):
    st.markdown(f"**Idade das ações abertas** — dias de atraso ({inteiro(len(abertas))} abertas hoje)",
                help="Ações abertas (não concluídas e não canceladas), de qualquer data, pela quantidade de dias "
                     "que já passaram da data limite (0 = ainda no prazo ou sem data limite).")
    if len(abertas):
        fx = pd.cut(abertas["Dias de atraso"].fillna(0), [-1, 7, 30, 90, 10**7], labels=FAIXAS)
        idade = fx.value_counts().reindex(FAIXAS, fill_value=0).rename_axis("Faixa").reset_index(name="Ações")
        idade["Rótulo"] = idade["Ações"].map(inteiro)
        base_i = alt.Chart(idade).encode(
            x=alt.X("Faixa:N", sort=FAIXAS, title="dias de atraso", axis=alt.Axis(labelAngle=0)),
            y=alt.Y("Ações:Q", title=None, axis=alt.Axis(format="~s")),
            tooltip=["Faixa:N", alt.Tooltip("Ações:Q", format=",d")])
        ui.mostrar((base_i.mark_bar(cornerRadiusTopLeft=3, cornerRadiusTopRight=3, size=46).encode(
            color=alt.Color("Faixa:N", scale=alt.Scale(domain=FAIXAS, range=COR_FAIXA), legend=None))
            + base_i.mark_text(dy=-8, fontSize=11).encode(text="Rótulo:N")).properties(height=240))
    else:
        st.caption("Nenhuma ação aberta.")
with d, st.container(border=True):
    todas_per = acoes[ui.entre(acoes["Data limite"], f.ini, f.fim)]
    st.markdown(f"**Situação das ações com data limite no período** ({inteiro(len(todas_per))})")
    if len(todas_per):
        sit = todas_per["Situação"].value_counts().reindex(af.SITUACOES_ACAO, fill_value=0)
        sit = sit[sit > 0].rename_axis("Situação").reset_index(name="Ações")
        sit["%"] = sit["Ações"] / sit["Ações"].sum() * 100
        sit["Rótulo"] = [f"{inteiro(n)} · {_pct_txt(p)}" for n, p in zip(sit["Ações"], sit["%"])]
        dom = list(sit["Situação"])
        base_s = alt.Chart(sit).encode(
            y=alt.Y("Situação:N", sort=dom, title=None, axis=alt.Axis(labelOverlap=False, labelLimit=180)),
            x=alt.X("Ações:Q", title=None, axis=alt.Axis(format="~s", grid=False),
                    scale=alt.Scale(domainMax=float(sit["Ações"].max()) * 1.35)),
            tooltip=["Situação:N", alt.Tooltip("Rótulo:N", title="Ações")])
        ui.mostrar((base_s.mark_bar(cornerRadiusEnd=3, height=18).encode(
            color=alt.Color("Situação:N", scale=alt.Scale(domain=dom, range=[af.COR[s] for s in dom]), legend=None))
            + base_s.mark_text(align="left", dx=4, fontSize=11).encode(text="Rótulo:N")).properties(height=240))
    else:
        st.caption("Nenhuma ação com data limite no período.")

# ----------------------------------------------------------------------------
# Tabela completa
# ----------------------------------------------------------------------------
st.markdown("#### :material/table_view: Todas as ações")


def _opcoes(col: str) -> list[str]:
    return sorted((v for v in acoes[col].unique() if v), key=lambda v: (len(v), v) if v.isdigit() else (99, v))


with ui.caixa_filtros("Filtros da tabela"):
    l1 = st.columns([3, 2, 2, 2])
    busca = l1[0].text_input("Buscar", key="aa_busca", placeholder="ação, AF, equipamento, responsável…")
    sel_sit = l1[1].multiselect("Situação", af.SITUACOES_ACAO, key="aa_sit", placeholder="Todas")
    sel_resp = l1[2].multiselect("Responsável", _opcoes("Responsável"), key="aa_resp", placeholder="Todos")
    sel_sup = l1[3].multiselect("Supervisor", _opcoes("Supervisor"), key="aa_sup", placeholder="Todos")
    l2 = st.columns([2, 2, 2, 2])
    sel_area = l2[0].multiselect("Área", _opcoes("Área"), key="aa_area", placeholder="Todas")
    sel_tipo = l2[1].multiselect("Tipo da ação", [*af.TIPOS_ACAO, SEM_TIPO], key="aa_tipo", placeholder="Todos")
    sel_af = l2[2].selectbox("Só da AF", _opcoes("Nº AF"), index=None, key="aa_af", placeholder="Todas as AFs")
    so_periodo = l2[3].toggle("Só no período", value=True, key="aa_so_per",
                              help="Ligado: só ações com a data de referência (escolhida no topo) no período. "
                                   "Desligue para ver as ações de qualquer data.")

m = pd.Series(True, index=acoes.index)
if so_periodo and not sel_af:
    m &= ui.entre(acoes[BASE_DATA], f.ini, f.fim)
if busca.strip():
    hay = (acoes["ID"] + " " + acoes["Ação"] + " " + acoes["Equipamento"] + " " + acoes["Código SAP"] + " "
           + acoes["Responsável"] + " " + acoes["Supervisor"] + " " + acoes["Observações"]).map(
        lambda s: sem_acento(s).upper())
    for termo in sem_acento(busca).upper().split():
        m &= hay.str.contains(termo, regex=False)
if sel_sit:
    m &= acoes["Situação"].isin(sel_sit)
if sel_resp:
    m &= acoes["Responsável"].isin(sel_resp)
if sel_sup:
    m &= acoes["Supervisor"].isin(sel_sup)
if sel_area:
    m &= acoes["Área"].isin(sel_area)
if sel_tipo:
    mt = pd.Series(False, index=acoes.index)
    for t in sel_tipo:
        mt |= (~acoes[af.TIPOS_ACAO].any(axis=1)) if t == SEM_TIPO else acoes[t]
    m &= mt
if sel_af:
    m &= acoes["Nº AF"] == sel_af

COLS = ["ID", "Situação", "Nº AF", "Nº ação", "Ação", "Tipo da ação", "Responsável", "Supervisor", "Data de início",
        "Data limite", "Data realizada", "Dias de atraso", "Dias para concluir", "Equipamento", "Código SAP", "Área",
        "Especialidade", "Criticidade", "Pilar", "Status", "OS de correção", "Link", "Observações"]
vis = acoes[m].sort_values(["Data limite", "Nº AF", "Nº ação"], ascending=[False, True, True]).reset_index(drop=True)
tabela = vis[COLS].assign(Link=_link_http(vis["Link"]))
st.caption(f"{inteiro(len(vis))} ações · {inteiro(vis['Nº AF'].nunique())} AFs · "
           f"{inteiro((vis['Situação'] == af.AC_ATRASADA).sum())} atrasadas"
           + (f" · {BASE_DATA.lower()} no período" if so_periodo and not sel_af else ""))
ev_tab = st.dataframe(
    tabela.style.map(_cor_situacao, subset=["Situação"]) if len(tabela) <= 3000 else tabela, hide_index=True, width="stretch",
    height=ui.altura_tabela(420), on_select="rerun", selection_mode="single-row", key="aa_tab",
    column_config={"Data de início": ui.col_data(), "Data limite": ui.col_data(), "Data realizada": ui.col_data(),
                   "Dias de atraso": st.column_config.NumberColumn(format="%d"),
                   "Dias para concluir": st.column_config.NumberColumn(format="%d"),
                   "Ação": st.column_config.TextColumn(width="large"),
                   "Observações": st.column_config.TextColumn(width="medium"),
                   "Link": st.column_config.LinkColumn("Link", display_text="Abrir")})
b1, b2 = st.columns([1, 3])
with b1:
    ui.baixar(vis[COLS], "acoes_af", "Baixar (Excel)", chave="aa_baixar")

sel = ev_tab.selection.rows if ev_tab and ev_tab.selection else []
sel = [i for i in sel if 0 <= i < len(vis)]  # a seleção pode sobrar de um filtro anterior
if not sel:
    b2.caption("Selecione uma linha para ver a ação completa e a análise de falha de origem.")
else:
    a_sel = vis.iloc[sel[0]]
    numero = a_sel["Nº AF"]
    st.session_state["af_sel"] = numero
    st.markdown(f"##### Ação {a_sel['ID']}")
    e, d = st.columns(2)
    with e, st.container(border=True):
        cor = af.COR.get(a_sel["Situação"], ui.CINZA)
        st.markdown(f'<span style="color:{cor};font-weight:800">● {a_sel["Situação"]}</span>'
                    + (f" · {inteiro(a_sel['Dias de atraso'])} dias de atraso"
                       if pd.notna(a_sel["Dias de atraso"]) and a_sel["Dias de atraso"] > 0 else ""),
                    unsafe_allow_html=True)
        st.markdown(f"**Ação:** {a_sel['Ação']}")

        def _data(v) -> str:
            return "—" if pd.isna(v) else f"{v:%d/%m/%Y}"

        info = {"Tipo da ação": a_sel["Tipo da ação"] or "—", "Responsável": a_sel["Responsável"] or "—",
                "Supervisor": a_sel["Supervisor"] or "—", "Data de início": _data(a_sel["Data de início"]),
                "Data limite": _data(a_sel["Data limite"]), "Data realizada": _data(a_sel["Data realizada"]),
                "Equipamento": " · ".join(x for x in (a_sel["Código SAP"], a_sel["Equipamento"]) if x) or "—",
                "Área": a_sel["Área"] or a_sel["Área da falha"] or "—", "Especialidade": a_sel["Especialidade"] or "—",
                "OS de correção": a_sel["OS de correção"] or "—", "Status no gerenciador": a_sel["Status"] or "—"}
        st.markdown("\n".join(f"- **{k}:** {v}" for k, v in info.items()))
        if a_sel["Observações"]:
            st.caption(f"Observações: {a_sel['Observações']}")
        if str(a_sel["Link"]).lower().startswith("http"):
            st.link_button("Abrir evidência", a_sel["Link"], icon=":material/open_in_new:")
        elif a_sel["Link"]:
            st.caption(f"Link: {a_sel['Link']}")
    with d, st.container(border=True):
        st.markdown(f"**Análise de falha de origem · AF {numero}**")
        orig = afs[afs["Nº AF"] == numero] if "Nº AF" in afs else afs.iloc[0:0]
        if len(orig):
            o = orig.iloc[0]
            cor = af.COR.get(o.get("Situação", ""), ui.CINZA)
            st.markdown(f'<span style="color:{cor};font-weight:800">● {o.get("Situação", "")}</span>',
                        unsafe_allow_html=True)
            info_af = {"Resumo": o.get("Resumo") or "—", "Causa raiz": o.get("Causa raiz") or "—",
                       "Criticidade": o.get("Criticidade") or "—",
                       "Pilar": af.PILARES.get(o.get("Pilar", ""), o.get("Pilar") or "—"),
                       "Equipamento": " · ".join(x for x in (o.get("Código SAP", ""), o.get("Equipamento", "")) if x)
                       or "—",
                       "Data da falha": _data(o.get("Data da falha")), "Data limite da análise": _data(o.get("Data limite")),
                       "Supervisor": o.get("Supervisor") or "—"}
            st.markdown("\n".join(f"- **{k}:** {v}" for k, v in info_af.items()))
            link_af = str(o.get("Link", "") or "")
            if link_af.lower().startswith("http"):
                st.link_button("Abrir análise (documento)", link_af, icon=":material/open_in_new:")
        else:
            st.caption("Esta AF não está na aba de análises de falha do gerenciador.")
            if a_sel["Causa raiz da AF"]:
                st.markdown(f"- **Causa raiz:** {a_sel['Causa raiz da AF']}")
        try:
            st.page_link(PAGINA_AF, label="Abrir em Planos de AF", icon=":material/arrow_forward:")
        except Exception:  # noqa: BLE001 — a aba de planos ainda não está registrada na navegação
            pass
        if a_sel["Código SAP"]:
            contexto.link_ficha(a_sel["Código SAP"], "Abrir ficha do equipamento", chave="aa_ficha")
    outras = af.acoes_da_af(acoes, numero)
    st.markdown(f"**Todas as ações da AF {numero}** ({inteiro(len(outras))})")
    st.dataframe(outras[["Nº ação", "Situação", "Ação", "Tipo da ação", "Responsável", "Data limite", "Data realizada",
                         "Dias de atraso"]].style.map(_cor_situacao, subset=["Situação"]),
                 hide_index=True, width="stretch", key="aa_outras",
                 column_config={"Data limite": ui.col_data(), "Data realizada": ui.col_data(),
                                "Dias de atraso": st.column_config.NumberColumn(format="%d"),
                                "Ação": st.column_config.TextColumn(width="large")})
