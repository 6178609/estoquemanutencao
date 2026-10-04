import zlib

import altair as alt
import numpy as np
import pandas as pd
import streamlit as st

from central import af, bases, contexto, ui
from central import indicadores as ind
from central.leitura import AF
from central.util import inteiro, sem_acento

ui.cabecalho("Planos de AF · análise de falhas",
             "Gestão das análises de falha (AF) a partir do Gerenciador de AF mantido pelo PCM: prazos, execução, "
             "causas raiz e ações, no formato do resumo corporativo WCM")

base_af = bases.afs()
if not ui.aviso_base(base_af, AF):
    st.stop()
afs = base_af.df
if afs is None or not len(afs):
    st.info("O Gerenciador de AF foi encontrado, mas não tem nenhuma análise de falha preenchida.")
    st.stop()

acoes = bases.acoes_af().df
if acoes is None:
    acoes = pd.DataFrame({c: pd.Series(dtype="datetime64[ns]" if c.startswith("Data") else object)
                          for c in ["Nº AF", "Nº ação", "ID", "Ação", "Tipo da ação", "Responsável", "Status",
                                    "Situação", "Data de início", "Data limite", "Data realizada", "Dias de atraso",
                                    "Observações"]})
notas = bases.notas().df

f = contexto.filtros_globais()
cad = contexto.metas()
iw38 = bases.iw38().df
COM_FICHA = set(f.ordens(iw38)["Equip. (chave)"]) if iw38 is not None else set()
COM_FICHA |= set(bases.ler_cadastro(bases.ARQ_CAD_EQUIP))
COM_FICHA.discard("")
hoje = pd.Timestamp.today().normalize()
st.caption(f"Período: **{ui.descrever(f.ini, f.fim)}** (pela data da falha; execução e prazo pela data limite) · "
           "os filtros de área, centro e tipo da barra lateral não se aplicam aqui: as áreas do gerenciador são "
           "as de produção")

# ----------------------------------------------------------------------------
# Rótulos e cores
# ----------------------------------------------------------------------------
NAO_INF = "(não informado)"
G_NO_PRAZO, G_FORA, G_ABERTO, G_ATRASADA = "Analisada no prazo", "Analisada fora do prazo", "Em aberto", "Atrasada"
GRUPOS = [G_NO_PRAZO, G_FORA, G_ABERTO, G_ATRASADA]
CORES_GRUPO = [af.COR[af.AF_NO_PRAZO], af.COR[af.AF_FORA_PRAZO], af.COR[af.AF_ANDAMENTO], af.COR[af.AF_ATRASADA]]
PARA_GRUPO = {af.AF_NO_PRAZO: G_NO_PRAZO, af.AF_FORA_PRAZO: G_FORA, af.AF_ATRASADA: G_ATRASADA,
              af.AF_RISCO: G_ABERTO, af.AF_ANDAMENTO: G_ABERTO}
ORDEM_SITUACAO = {af.AF_ATRASADA: 0, af.AF_RISCO: 1, af.AF_ANDAMENTO: 2, af.AF_FORA_PRAZO: 3, af.AF_NO_PRAZO: 4,
                  af.AF_CANCELADA: 5}


def num(v, casas=1) -> str:
    if v is None or (isinstance(v, float) and np.isnan(v)):
        return "—"
    return f"{v:,.{casas}f}".replace(",", "X").replace(".", ",").replace("X", ".")


def pct_txt(v) -> str:
    return "—" if v is None or (isinstance(v, float) and np.isnan(v)) else f"{num(v)}%"


def fundo_pct(v) -> str:
    if v is None or (isinstance(v, float) and np.isnan(v)):
        return ""
    if v >= 90:
        return "background-color: rgba(14,159,70,.18)"
    if v >= 70:
        return "background-color: rgba(242,183,5,.25)"
    return "background-color: rgba(227,38,43,.18)"


def col_situacao(opcoes, rotulo="Situação"):
    """Situação como etiqueta colorida (cores de af.COR)."""
    return st.column_config.MultiselectColumn(rotulo, options=list(opcoes), color=[af.COR[s] for s in opcoes],
                                              width="medium")


def como_etiqueta(df: pd.DataFrame, col: str = "Situação") -> pd.DataFrame:
    return df.assign(**{col: df[col].map(lambda s: [s] if s else [])})


def ficha(codigo: str, rotulo: str, chave: str) -> None:
    """Botão da ficha só quando a aba Equipamentos consegue abri-la (o código está no IW38 ou no cadastro)."""
    if not codigo:
        st.caption("Sem código SAP no gerenciador: não dá para abrir a ficha do equipamento.")
    elif codigo in COM_FICHA:
        contexto.link_ficha(codigo, rotulo, chave=chave)
    else:
        st.caption(f"O equipamento {codigo} não tem ordens no IW38 (com os filtros da barra lateral) nem cadastro: "
                   "a ficha não está disponível.")


def link_acoes() -> None:
    try:
        st.page_link("paginas/af_acoes.py", label="Abrir Ações de AF", icon=":material/task_alt:")
    except Exception:  # noqa: BLE001 — a aba de ações ainda não está na navegação
        st.caption("A aba **Ações de AF** detalha o plano de ação de cada análise.")


# ----------------------------------------------------------------------------
# Indicadores do período (com o período anterior de mesma duração)
# ----------------------------------------------------------------------------
GRUPO_AF = getattr(ind, "ANALISE_FALHA", "Análise de falha")
PAG = "paginas/af_planos.py"
PADRAO = {  # usados só se o motor de indicadores ainda não tiver os KPIs de AF
    "taxa_quebra_a": ind.Kpi("taxa_quebra_a", "Taxa de análise de quebra A", "%", +1, 100, GRUPO_AF, PAG,
                             "AFs de criticidade A com data da falha no período já analisadas ÷ AFs A com data da "
                             "falha no período (canceladas não contam).", mensal=True),
    "af_execucao": ind.Kpi("af_execucao", "Execução de AFs", "%", +1, 100, GRUPO_AF, PAG,
                           "AFs com data limite no período (até hoje) analisadas ÷ AFs com data limite no período.",
                           mensal=True),
    "af_no_prazo": ind.Kpi("af_no_prazo", "AFs no prazo", "%", +1, 90, GRUPO_AF, PAG,
                           "AFs com data limite no período (até hoje) analisadas até a data limite ÷ AFs com data "
                           "limite no período.", mensal=True),
    "af_geradas": ind.Kpi("af_geradas", "AFs geradas", "un", -1, None, GRUPO_AF, PAG,
                          "AFs com data da falha no período (canceladas não contam).", mensal=True),
    "af_atrasadas": ind.Kpi("af_atrasadas", "AFs atrasadas hoje", "un", -1, 0, GRUPO_AF, PAG,
                            "AFs sem análise com a data limite vencida (retrato de hoje, qualquer data).", foto=True),
    "dias_para_analise": ind.Kpi("dias_para_analise", "Dias médios p/ análise", "dias", -1, None, GRUPO_AF, PAG,
                                 "Média de dias entre a data da falha e a data da análise das AFs geradas no "
                                 "período e já analisadas.", mensal=True),
}
KS = [ind.POR_ID.get(i) or PADRAO[i] for i in PADRAO]

atual = af.indicadores(afs, acoes, f.ini, f.fim, hoje, notas)
a_ini, a_fim = ind.periodo_anterior(f.ini, f.fim)
anterior = af.indicadores(afs, acoes, a_ini, a_fim, hoje, notas)
serie = af.mensal(afs, acoes, f.ini, f.fim, hoje, notas)

vivas = afs[afs["Situação"] != af.AF_CANCELADA]
risco = vivas[vivas["Situação"].isin([af.AF_ATRASADA, af.AF_RISCO])
              | ((vivas["Situação"] == af.AF_ANDAMENTO) & (vivas["Data limite"] <= hoje + pd.Timedelta(days=3)))]

# ----------------------------------------------------------------------------
# Fila de AFs atrasadas / em risco (retrato de hoje)
# ----------------------------------------------------------------------------
if len(risco):
    fila = risco.assign(_o=risco["Situação"].map(ORDEM_SITUACAO)).sort_values(
        ["_o", "Dias de atraso", "Data limite"], ascending=[True, False, True])
    n_atr = int((fila["Situação"] == af.AF_ATRASADA).sum())
    with st.container(border=True):
        st.markdown(f":red[**:material/warning: {inteiro(len(fila))} AF(s) atrasada(s) ou em risco hoje**] · "
                    f"{inteiro(n_atr)} com o prazo vencido e {inteiro(len(fila) - n_atr)} vencendo (risco de atraso "
                    "ou data limite em até 3 dias). Cobre a análise com o supervisor responsável.")
        cols_fila = ["Nº AF", "Situação", "Dias de atraso", "Data limite", "Criticidade", "Equipamento", "Resumo",
                     "Supervisor", "Área", "Link"]
        st.dataframe(como_etiqueta(fila[cols_fila].assign(Link=fila["Link"].where(fila["Link"].str.startswith("http"), None))), hide_index=True, width="stretch",
                     height=min(36 * (len(fila) + 1) + 4, 300),
                     column_config={"Situação": col_situacao([af.AF_ATRASADA, af.AF_RISCO, af.AF_ANDAMENTO]),
                                    "Data limite": ui.col_data(), "Dias de atraso": st.column_config.NumberColumn(
                                        format="%d"),
                                    "Resumo": st.column_config.TextColumn(width="large"),
                                    "Link": st.column_config.LinkColumn("Link", display_text="Abrir AF")})

contexto.grade(KS, atual, anterior, cad, serie, colunas=3, prefixo="afp-", link=False)
m = st.columns(4)
m[0].metric("AFs A geradas", inteiro(atual.get("af_geradas_a")), border=True, delta_arrow="off",
            help="AFs de criticidade A com data da falha no período.")
m[1].metric("AFs em aberto", inteiro(atual.get("af_abertas")), border=True, delta_arrow="off",
            help="Em andamento, risco de atraso e atrasadas (retrato de hoje, qualquer data).")
m[2].metric("Execução de ações", pct_txt(atual.get("acoes_execucao")), border=True, delta_arrow="off",
            help="Ações com data limite no período (até hoje) realizadas ÷ ações com data limite no período.")
m[3].metric("Ações por AF", num(atual.get("acoes_por_af")), border=True, delta_arrow="off",
            help="Ações criadas no período (data de início) ÷ AFs geradas no período.")
st.caption(f"Variações comparadas a {ui.descrever(a_ini, a_fim)} (período anterior de mesma duração).")

# ----------------------------------------------------------------------------
# Acompanhamento semanal (RESUMO CORPORATIVO)
# ----------------------------------------------------------------------------
st.markdown("#### :material/calendar_view_week: Acompanhamento semanal · resumo corporativo")
sem = af.semanal(afs, acoes, f.ini, f.fim, hoje)
sem = sem[~sem["Futura"]]
semanas = sorted(pd.Timestamp(s) for s in sem["Semana"].unique())
with st.container(border=True):
    s1, s2 = st.columns([3, 2], vertical_alignment="center")
    s1.markdown("**Gerado × executado por semana** (segunda a domingo)",
                help="Taxa de análise de quebra crítica (A): AFs A pela data da falha. Execução de AFs e ações de "
                     "AFs: pela data limite. Cor do %: verde ≥ 90%, amarelo ≥ 70%, vermelho abaixo.")
    janela = s2.segmented_control("Semanas", ["Últimas 8", "Últimas 13", "Período todo"], default="Últimas 13",
                                  key="afp_semanas", label_visibility="collapsed") or "Últimas 13"
    if not semanas:
        st.caption("Sem semanas concluídas no período.")
    else:
        if janela != "Período todo":
            semanas = semanas[-int(janela.split()[-1]):]
        varios_anos = len({s.year for s in semanas}) > 1
        rot = {s: f"S{s.isocalendar().week:02d} · {s:%d/%m/%y}" if varios_anos else
               f"S{s.isocalendar().week:02d} · {s:%d/%m}" for s in semanas}
        sw = sem[sem["Semana"].isin(semanas)].copy()
        linhas, estilos = [], []
        for indicador in sw["Indicador"].unique():
            sub = sw[sw["Indicador"] == indicador].set_index("Semana")
            ger, exe = sub["Gerado"].sum(), sub["Executado"].sum()
            tot_pct = exe / ger * 100 if ger else None
            for linha in ["Gerado", "Executado", "%"]:
                r = {"Indicador": indicador, "Linha": linha}
                e = {"Indicador": "", "Linha": ""}
                for s in semanas:
                    g, x, p = sub.at[s, "Gerado"], sub.at[s, "Executado"], sub.at[s, "Percentual"]
                    if linha == "%":
                        r[rot[s]], e[rot[s]] = pct_txt(p), fundo_pct(p)
                    else:
                        r[rot[s]], e[rot[s]] = inteiro(g if linha == "Gerado" else x), ""
                if linha == "%":
                    r["Total"], e["Total"] = pct_txt(tot_pct), fundo_pct(tot_pct)
                else:
                    r["Total"], e["Total"] = inteiro(ger if linha == "Gerado" else exe), ""
                linhas.append(r)
                estilos.append(e)
        piv = pd.DataFrame(linhas)
        est = pd.DataFrame(estilos)
        st.dataframe(piv.style.apply(lambda _: est, axis=None), hide_index=True, width="stretch",
                     height=36 * (len(piv) + 1) + 4,
                     column_config={"Indicador": st.column_config.TextColumn(pinned=True, width="medium"),
                                    "Linha": st.column_config.TextColumn(pinned=True, width="small")})
        gl = sw[sw["Percentual"].notna()].copy()
        if len(gl):
            gl["Semana txt"] = gl["Semana"].map(lambda s: rot[pd.Timestamp(s)])
            gl["Rótulo"] = gl["Percentual"].map(pct_txt)
            ordem = [rot[s] for s in semanas]
            x = alt.X("Semana txt:N", sort=ordem, title=None,
                      axis=alt.Axis(labelAngle=-45 if len(ordem) > 8 else 0, labelOverlap=False, labelFontSize=10))
            linhas_ch = alt.Chart(gl).mark_line(strokeWidth=2.2, point=alt.OverlayMarkDef(size=45, filled=True)).encode(
                x=x, y=alt.Y("Percentual:Q", title="%", scale=alt.Scale(domain=[0, 105])),
                color=alt.Color("Indicador:N", scale=alt.Scale(range=[ui.VERMELHO, ui.AZUL, ui.LARANJA]),
                                legend=alt.Legend(orient="bottom", title=None)),
                tooltip=[alt.Tooltip("Semana txt:N", title="Semana"), "Indicador:N",
                         alt.Tooltip("Gerado:Q"), alt.Tooltip("Executado:Q"), alt.Tooltip("Rótulo:N", title="%")])
            meta = alt.Chart(pd.DataFrame({"y": [100], "t": ["meta 100%"]})).mark_rule(
                color=ui.VERDE, strokeDash=[5, 4], strokeWidth=1.6).encode(y="y:Q", tooltip=alt.Tooltip("t:N",
                                                                                                    title="Meta"))
            ui.mostrar((linhas_ch + meta).properties(height=260))

# ----------------------------------------------------------------------------
# Evolução mensal
# ----------------------------------------------------------------------------
st.markdown("#### :material/insights: Evolução mensal")
ger_p = vivas[ui.entre(vivas["Data da falha"], f.ini, f.fim)].copy()
ger_p["Grupo"] = ger_p["Situação"].map(PARA_GRUPO).fillna(G_ABERTO)
with st.container(border=True):
    st.markdown("**AFs geradas por mês** (data da falha) por resultado da análise e **taxa de análise de quebra A**",
                help="Barras: AFs geradas no mês, separadas em analisadas no prazo, fora do prazo, em aberto e "
                     "atrasadas. Linha: AFs A do mês já analisadas ÷ AFs A do mês.")
    if not len(ger_p):
        st.caption("Nenhuma AF com data da falha no período.")
    else:
        mm = ger_p.assign(Mês=ger_p["Data da falha"].dt.to_period("M").dt.start_time)
        mm = mm.groupby(["Mês", "Grupo"]).size().reset_index(name="AFs")
        mm["Mês txt"] = mm["Mês"].map(contexto.mes_pt)
        mm["ordem"] = mm["Grupo"].map({g: i for i, g in enumerate(GRUPOS)})
        ordem_m = [contexto.mes_pt(m_) for m_ in serie["Mês"]]
        xm = alt.X("Mês txt:N", sort=ordem_m, title=None, axis=alt.Axis(labelAngle=0, labelOverlap=False))
        barras = alt.Chart(mm).mark_bar(size=22, cornerRadiusTopLeft=2, cornerRadiusTopRight=2).encode(
            x=xm, y=alt.Y("AFs:Q", stack="zero", title="AFs geradas"),
            color=alt.Color("Grupo:N", scale=alt.Scale(domain=GRUPOS, range=CORES_GRUPO),
                            legend=alt.Legend(orient="bottom", title=None)),
            order=alt.Order("ordem:Q"),
            tooltip=[alt.Tooltip("Mês txt:N", title="Mês"), alt.Tooltip("Grupo:N", title="Resultado"), "AFs:Q"])
        tx = serie[["Mês", "taxa_quebra_a"]].dropna().copy()
        camadas = [barras]
        if len(tx):
            tx["Mês txt"] = tx["Mês"].map(contexto.mes_pt)
            tx["Rótulo"] = tx["taxa_quebra_a"].map(pct_txt)
            bl = alt.Chart(tx).encode(x=xm, y=alt.Y("taxa_quebra_a:Q", title="Taxa de quebra A (%)",
                                                    scale=alt.Scale(domain=[0, 110])),
                                      tooltip=[alt.Tooltip("Mês txt:N", title="Mês"),
                                               alt.Tooltip("Rótulo:N", title="Taxa de quebra A")])
            camadas.append(alt.layer(bl.mark_line(color=ui.GRAFITE, strokeWidth=2.2,
                                                  point=alt.OverlayMarkDef(color=ui.GRAFITE, size=45, filled=True)),
                                     bl.mark_text(dy=-11, fontSize=10, color=ui.GRAFITE).encode(text="Rótulo:N")))
        ui.mostrar(alt.layer(*camadas).resolve_scale(y="independent").properties(height=300))
    with st.expander("Tabela mês a mês dos indicadores", icon=":material/table_chart:"):
        tab_m = pd.DataFrame({
            "Mês": serie["Mês"].map(contexto.mes_pt),
            "AFs geradas": serie["af_geradas"].map(lambda v: inteiro(v)),
            "AFs A": serie["af_geradas_a"].map(lambda v: inteiro(v)),
            "Taxa de quebra A": serie["taxa_quebra_a"].map(pct_txt),
            "Execução de AFs": serie["af_execucao"].map(pct_txt),
            "AFs no prazo": serie["af_no_prazo"].map(pct_txt),
            "Dias p/ análise": serie["dias_para_analise"].map(num),
            "Execução de ações": serie["acoes_execucao"].map(pct_txt),
            "Ações no prazo": serie["acoes_no_prazo"].map(pct_txt),
        })
        st.dataframe(tab_m, hide_index=True, width="stretch")

# ----------------------------------------------------------------------------
# Distribuições
# ----------------------------------------------------------------------------
st.markdown("#### :material/donut_small: Onde e por que falha")
st.caption(f"{inteiro(len(ger_p))} AFs geradas no período (data da falha; canceladas não contam).")


def barras_grupo(df: pd.DataFrame, campo: str, rotulos: dict | None = None, top: int = 15) -> alt.Chart | None:
    """Barras horizontais empilhadas pelo resultado da análise (no prazo, fora, em aberto, atrasada)."""
    if not len(df):
        return None
    d = df.assign(Cat=df[campo].replace("", NAO_INF))
    if rotulos:
        d["Cat"] = d["Cat"].map(lambda c: rotulos.get(c, c))
    tot = d["Cat"].value_counts().head(top)
    d = d[d["Cat"].isin(tot.index)]
    agg = d.groupby(["Cat", "Grupo"]).size().reset_index(name="AFs")
    agg["ordem"] = agg["Grupo"].map({g: i for i, g in enumerate(GRUPOS)})
    totais = tot.rename_axis("Cat").reset_index(name="AFs")
    totais["Rótulo"] = totais["AFs"].map(inteiro)
    y = alt.Y("Cat:N", sort=list(tot.index), title=None, axis=alt.Axis(labelLimit=220, labelOverlap=False))
    barras = alt.Chart(agg).mark_bar(height=16).encode(
        y=y, x=alt.X("AFs:Q", stack="zero", title=None, axis=alt.Axis(grid=False),
                     scale=alt.Scale(domainMax=float(tot.max()) * 1.15)),
        color=alt.Color("Grupo:N", scale=alt.Scale(domain=GRUPOS, range=CORES_GRUPO),
                        legend=alt.Legend(orient="bottom", title=None)),
        order=alt.Order("ordem:Q"), tooltip=[alt.Tooltip("Cat:N", title=campo), alt.Tooltip("Grupo:N", title="Resultado"),
                                             "AFs:Q"])
    texto = alt.Chart(totais).mark_text(align="left", dx=4, fontSize=11).encode(y=y, x="AFs:Q", text="Rótulo:N")
    return (barras + texto).properties(height=max(110, 26 * len(tot)))


def mostrar_ou_vazio(ch) -> None:
    if ch is None:
        st.caption("Sem AFs no período.")
    else:
        ui.mostrar(ch)


abas = st.tabs(["Situação e criticidade", "Área e pilar", "Causa raiz (Pareto)", "Especialidade e turno",
                "Supervisores", "Equipamentos"])

with abas[0]:
    e, d = st.columns(2)
    with e, st.container(border=True):
        st.markdown("**Por situação** (inclui canceladas)")
        todas_p = afs[ui.entre(afs["Data da falha"], f.ini, f.fim)]
        sit = todas_p["Situação"].value_counts().reindex(af.SITUACOES_AF, fill_value=0)
        sit = sit[sit > 0].rename_axis("Situação").reset_index(name="AFs")
        if len(sit):
            sit["Rótulo"] = [f"{inteiro(v)} · {num(v / sit['AFs'].sum() * 100, 0)}%" for v in sit["AFs"]]
            ys = alt.Y("Situação:N", sort=af.SITUACOES_AF, title=None, axis=alt.Axis(labelLimit=200, labelOverlap=False))
            b = alt.Chart(sit).encode(y=ys, x=alt.X("AFs:Q", title=None, axis=alt.Axis(grid=False),
                                                    scale=alt.Scale(domainMax=float(sit["AFs"].max()) * 1.3)),
                                      tooltip=["Situação:N", "AFs:Q"])
            ui.mostrar((b.mark_bar(height=18, cornerRadiusEnd=3).encode(
                color=alt.Color("Situação:N", scale=alt.Scale(domain=af.SITUACOES_AF,
                                                              range=[af.COR[s] for s in af.SITUACOES_AF]), legend=None))
                + b.mark_text(align="left", dx=4, fontSize=11).encode(text="Rótulo:N")).properties(height=200))
        else:
            st.caption("Sem AFs no período.")
    with d, st.container(border=True):
        st.markdown("**Por criticidade do equipamento**",
                    help="A = crítico (toda quebra A gera AF e entra na taxa de análise de quebra crítica).")
        mostrar_ou_vazio(barras_grupo(ger_p, "Criticidade", {"A": "A · crítico", "B": "B", "C": "C"}))

with abas[1]:
    e, d = st.columns(2)
    with e, st.container(border=True):
        st.markdown("**Por área** (top 15)")
        mostrar_ou_vazio(barras_grupo(ger_p, "Área"))
    with d, st.container(border=True):
        st.markdown("**Por pilar WCM da causa**", help="Pilar responsável por eliminar a causa raiz da falha.")
        mostrar_ou_vazio(barras_grupo(ger_p, "Pilar", {k: f"{k} · {v}" for k, v in af.PILARES.items()}))

with abas[2], st.container(border=True):
    st.markdown("**Pareto das causas raiz** — as poucas causas que concentram a maior parte das falhas (80/20)")
    cr = ger_p[ger_p["Causa raiz"] != ""]
    if not len(cr):
        st.caption("Nenhuma AF com causa raiz preenchida no período.")
    else:
        par = cr["Causa raiz"].value_counts().rename_axis("Causa").reset_index(name="AFs")
        par["% acumulado"] = par["AFs"].cumsum() / par["AFs"].sum() * 100
        par["Acum txt"] = par["% acumulado"].map(pct_txt)
        n80 = int((par["% acumulado"] < 80).sum()) + 1
        par = par.head(20)
        xp = alt.X("Causa:N", sort=list(par["Causa"]), title=None,
                   axis=alt.Axis(labelAngle=-40, labelLimit=200, labelOverlap=False, labelFontSize=10))
        bp = alt.Chart(par).mark_bar(color=ui.LARANJA, cornerRadiusTopLeft=3, cornerRadiusTopRight=3).encode(
            x=xp, y=alt.Y("AFs:Q", title="AFs"),
            tooltip=["Causa:N", "AFs:Q", alt.Tooltip("Acum txt:N", title="% acumulado")])
        lp = alt.Chart(par).mark_line(color=ui.GRAFITE, point=True).encode(
            x=xp, y=alt.Y("% acumulado:Q", title="% acumulado", scale=alt.Scale(domain=[0, 100])),
            tooltip=["Causa:N", alt.Tooltip("Acum txt:N", title="% acumulado")])
        rp = alt.Chart(pd.DataFrame({"y": [80]})).mark_rule(color=ui.VERMELHO, strokeDash=[4, 4]).encode(y="y:Q")
        ui.mostrar(alt.layer(bp, alt.layer(lp, rp)).resolve_scale(y="independent").properties(height=420))
        sem_causa = len(ger_p) - len(cr)
        st.caption(f"**{inteiro(n80)}** causa(s) concentram 80% das {inteiro(len(cr))} AFs com causa raiz informada"
                   + (f" · {inteiro(sem_causa)} AF(s) do período sem causa raiz preenchida." if sem_causa else "."))

with abas[3]:
    e, d = st.columns(2)
    with e, st.container(border=True):
        st.markdown("**Por especialidade**")
        mostrar_ou_vazio(barras_grupo(ger_p, "Especialidade"))
    with d, st.container(border=True):
        st.markdown("**Por turno**")
        mostrar_ou_vazio(barras_grupo(ger_p, "Turno"))

with abas[4], st.container(border=True):
    st.markdown("**Scorecard dos supervisores** — AFs geradas no período",
                help="% no prazo = analisadas no prazo ÷ AFs já decididas (analisadas ou atrasadas); as que ainda "
                     "estão dentro do prazo não contam. Dias médios = data da falha até a data da análise.")
    if not len(ger_p):
        st.caption("Sem AFs no período.")
    else:
        sp = ger_p.assign(Supervisor=ger_p["Supervisor"].replace("", NAO_INF))
        g = sp.groupby("Supervisor")
        sc = pd.DataFrame({
            "Geradas": g.size(),
            "A": g["Criticidade"].apply(lambda s: int((s == "A").sum())),
            "No prazo": g["Situação"].apply(lambda s: int((s == af.AF_NO_PRAZO).sum())),
            "Fora do prazo": g["Situação"].apply(lambda s: int((s == af.AF_FORA_PRAZO).sum())),
            "Atrasadas": g["Situação"].apply(lambda s: int((s == af.AF_ATRASADA).sum())),
            "Em aberto": g["Situação"].apply(lambda s: int(s.isin([af.AF_RISCO, af.AF_ANDAMENTO]).sum())),
            "Dias médios": g["Dias para análise"].apply(lambda s: s[s >= 0].mean()),
        })
        decididas = sc["No prazo"] + sc["Fora do prazo"] + sc["Atrasadas"]
        sc["% no prazo"] = (sc["No prazo"] / decididas.where(decididas > 0) * 100)
        sc = sc.sort_values(["Geradas"], ascending=False).reset_index()
        sc = sc[["Supervisor", "Geradas", "A", "% no prazo", "No prazo", "Fora do prazo", "Atrasadas", "Em aberto",
                 "Dias médios"]]
        cores_sc = pd.DataFrame("", index=sc.index, columns=sc.columns)
        cores_sc["% no prazo"] = sc["% no prazo"].map(fundo_pct)
        cores_sc["Atrasadas"] = sc["Atrasadas"].map(lambda v: "color: #E3262B; font-weight: 700" if v else "")
        fmt = {c: inteiro for c in ["Geradas", "A", "No prazo", "Fora do prazo", "Atrasadas", "Em aberto"]}
        fmt.update({"% no prazo": pct_txt, "Dias médios": num})
        st.dataframe(sc.style.apply(lambda _: cores_sc, axis=None).format(fmt), hide_index=True, width="stretch")

with abas[5], st.container(border=True):
    st.markdown("**Equipamentos com mais AFs no período**",
                help="Equipamentos que mais geram análises de falha: candidatos a revisão de plano de manutenção, "
                     "melhoria (fragilidade de projeto) e expansão horizontal das ações.")
    if not len(ger_p):
        st.caption("Sem AFs no período.")
    else:
        eq = ger_p.assign(Chave=np.where(ger_p["Código SAP"] != "", ger_p["Código SAP"], ger_p["Equipamento"]))
        eq = eq[eq["Chave"] != ""]
        ge = eq.groupby("Chave")
        top = pd.DataFrame({
            "Código SAP": ge["Código SAP"].first(),
            "Equipamento": ge["Equipamento"].agg(lambda s: next((v for v in s if v), "")),
            "Área": ge["Área"].agg(lambda s: next((v for v in s if v), "")),
            "AFs": ge.size(),
            "AFs A": ge["Criticidade"].apply(lambda s: int((s == "A").sum())),
            "Em aberto": ge["Situação"].apply(lambda s: int(s.isin(af.AF_ABERTAS).sum())),
            "Parada (h)": ge["Duração da parada (h)"].sum().round(1),
            "Causa mais frequente": ge["Causa raiz"].agg(
                lambda s: s[s != ""].mode().iloc[0] if (s != "").any() else ""),
            "Última falha": ge["Data da falha"].max(),
        }).sort_values(["AFs", "Parada (h)"], ascending=False).head(30).reset_index(drop=True)
        ev_eq = st.dataframe(top, hide_index=True, width="stretch", height=ui.altura_tabela(380), on_select="rerun",
                             selection_mode="single-row", key=f"afp_tab_eq_{f.ini}_{f.fim}",
                             column_config={
                                 "AFs": st.column_config.ProgressColumn("AFs", format="%d", min_value=0,
                                                                        max_value=int(top["AFs"].max() or 1)),
                                 "Parada (h)": st.column_config.NumberColumn(format="localized"),
                                 "Última falha": ui.col_data(),
                                 "Equipamento": st.column_config.TextColumn(width="medium")})
        sel_eq = [r for r in (ev_eq.selection.rows if ev_eq and ev_eq.selection else []) if r < len(top)]
        if sel_eq:
            eqs = top.iloc[sel_eq[0]]
            ficha(eqs["Código SAP"], f"Abrir ficha de {eqs['Código SAP']} · {eqs['Equipamento'][:40]}", "afp_ficha_eq")
        else:
            st.caption("Selecione uma linha para abrir a ficha do equipamento (quebras, ordens e componentes).")

# ----------------------------------------------------------------------------
# Referência IW28
# ----------------------------------------------------------------------------
st.markdown("#### :material/compare_arrows: Referência IW28 · quebras A × AFs A")
with st.container(border=True):
    datas_iw28 = notas["Data"].dropna() if notas is not None and len(notas) else pd.Series(dtype="datetime64[ns]")
    if not len(datas_iw28):
        st.caption("Coloque o export da IW28 (notas) na pasta para comparar as quebras classe A com as AFs A geradas.")
    else:
        # o export da IW28 cobre só uma janela: fora dela não dá para comparar (seria zero quebras contra N AFs)
        cob_ini, cob_fim = datas_iw28.min().normalize(), datas_iw28.max().normalize()
        r_ini, r_fim = max(pd.Timestamp(f.ini), cob_ini), min(pd.Timestamp(f.fim), cob_fim)
        if r_ini > r_fim:
            st.caption(f"O export da IW28 carregado cobre {ui.descrever(cob_ini.date(), cob_fim.date())}, fora do "
                       "período escolhido: não há quebras para comparar com as AFs.")
        else:
            q = af.quebras_a_iw28(notas)
            q = q[ui.entre(q["Data"], r_ini, r_fim)]
            ga_df = ger_p[(ger_p["Criticidade"] == "A") & ui.entre(ger_p["Data da falha"], r_ini, r_fim)]
            meses = pd.date_range(r_ini.to_period("M").start_time, r_fim, freq="MS")
            qa = q["Data"].dt.to_period("M").dt.start_time.value_counts()
            ga = ga_df["Data da falha"].dt.to_period("M").dt.start_time.value_counts()
            ref = pd.DataFrame({"Mês": meses})
            ref["Quebras A (IW28)"] = ref["Mês"].map(qa).fillna(0).astype(int)
            ref["AFs A geradas"] = ref["Mês"].map(ga).fillna(0).astype(int)
            ref["Mês txt"] = ref["Mês"].map(contexto.mes_pt)
            longo = ref.melt(id_vars=["Mês", "Mês txt"], value_vars=["Quebras A (IW28)", "AFs A geradas"],
                             var_name="Série", value_name="Qtd")
            ui.mostrar(alt.Chart(longo).mark_bar(cornerRadiusTopLeft=2, cornerRadiusTopRight=2).encode(
                x=alt.X("Mês txt:N", sort=list(ref["Mês txt"]), title=None,
                        axis=alt.Axis(labelAngle=0, labelOverlap=False)),
                xOffset=alt.XOffset("Série:N", sort=["Quebras A (IW28)", "AFs A geradas"]),
                y=alt.Y("Qtd:Q", title=None),
                color=alt.Color("Série:N", scale=alt.Scale(domain=["Quebras A (IW28)", "AFs A geradas"],
                                                           range=[ui.CINZA, ui.VERMELHO]),
                                legend=alt.Legend(orient="bottom", title=None)),
                tooltip=[alt.Tooltip("Mês txt:N", title="Mês"), "Série:N", "Qtd:Q"]).properties(height=240))
            tq, tg = int(ref["Quebras A (IW28)"].sum()), int(ref["AFs A geradas"].sum())
            recorte = ui.descrever(r_ini.date(), r_fim.date())
            st.caption(f"De {recorte} (parte do período coberta pelo export da IW28): **{inteiro(tq)}** quebras "
                       f"classe A na IW28 (notas com parada em equipamento A) e **{inteiro(tg)}** AFs A geradas"
                       + (f" ({num(tg / tq * 100, 0)}% das quebras)." if tq else ".")
                       + " Referência apenas: nem toda parada vira AF (o gatilho depende da duração da parada) e a "
                         "nota quase nunca traz o número da AF, por isso as duas contagens não se cruzam uma a uma.")

# ----------------------------------------------------------------------------
# Tabela das AFs, com detalhe e ações
# ----------------------------------------------------------------------------
st.markdown("#### :material/fact_check: Análises de falha")
qtd_acoes = acoes.groupby("Nº AF").size() if len(acoes) else pd.Series(dtype=int)
abertas_ac = (acoes[acoes["Situação"].isin(af.AC_ABERTAS)].groupby("Nº AF").size() if len(acoes)
              else pd.Series(dtype=int))
with ui.caixa_filtros():
    l1 = st.columns([3, 2, 2, 1.4])
    busca = l1[0].text_input("Buscar", key="afp_busca", placeholder="nº da AF, resumo, equipamento ou causa…")
    sel_sit = l1[1].multiselect("Situação", af.SITUACOES_AF, key="afp_sit", placeholder="Todas")
    sel_area = l1[2].multiselect("Área", sorted(a for a in afs["Área"].unique() if a), key="afp_area",
                                 placeholder="Todas")
    todas_datas = l1[3].toggle("Todas as datas", key="afp_todas",
                               help="Desligado: só AFs com data da falha no período da barra lateral.")
    l2 = st.columns(3)
    sel_crit = l2[0].multiselect("Criticidade", sorted(c for c in afs["Criticidade"].unique() if c), key="afp_crit",
                                 placeholder="Todas")
    sel_pilar = l2[1].multiselect("Pilar", sorted(p for p in afs["Pilar"].unique() if p), key="afp_pilar",
                                  placeholder="Todos", format_func=lambda p: f"{p} · {af.PILARES[p]}"
                                  if p in af.PILARES else p)
    sel_sup = l2[2].multiselect("Supervisor", sorted(s for s in afs["Supervisor"].unique() if s), key="afp_sup",
                                placeholder="Todos")

tab = afs if todas_datas else afs[ui.entre(afs["Data da falha"], f.ini, f.fim)]
mk = pd.Series(True, index=tab.index)
if busca.strip():
    hay = (tab["Nº AF"] + " " + tab["OS corretiva"] + " " + tab["Resumo"] + " " + tab["Equipamento"] + " "
           + tab["Código SAP"] + " " + tab["Causa raiz"] + " " + tab["Componente"]).map(lambda s: sem_acento(s).upper())
    for termo in sem_acento(busca).upper().split():
        mk &= hay.str.contains(termo, regex=False)
for col, sel in (("Situação", sel_sit), ("Área", sel_area), ("Criticidade", sel_crit), ("Pilar", sel_pilar),
                 ("Supervisor", sel_sup)):
    if sel:
        mk &= tab[col].isin(sel)
vis = tab[mk].copy()
vis["Ações"] = vis["Nº AF"].map(qtd_acoes).fillna(0).astype(int)
vis["Ações abertas"] = vis["Nº AF"].map(abertas_ac).fillna(0).astype(int)
vis["_o"] = vis["Situação"].map(ORDEM_SITUACAO)
vis = vis.sort_values(["_o", "Dias de atraso", "Data da falha"], ascending=[True, False, False]).drop(columns="_o")
vis = vis.reset_index(drop=True)
vis["Link"] = vis["Link"].where(vis["Link"].str.startswith("http"), None)  # texto solto não vira link quebrado
assinatura = zlib.crc32(repr((busca, todas_datas, f.ini, f.fim, sel_sit, sel_area, sel_crit, sel_pilar,
                              sel_sup)).encode())
COLS = ["Nº AF", "Situação", "Criticidade", "Data da falha", "Data limite", "Data da análise", "Dias de atraso",
        "Dias para análise", "Área", "Equipamento", "Código SAP", "Resumo", "Causa raiz", "Pilar", "Especialidade",
        "Supervisor", "Turno", "Duração da parada (h)", "% ações concluídas", "Ações", "Ações abertas", "Link"]
st.caption(f"{inteiro(len(vis))} AF(s) · atrasadas e em risco primeiro · selecione uma linha para ver o detalhe e as ações")
ev = st.dataframe(como_etiqueta(vis[COLS]), hide_index=True, width="stretch", height=ui.altura_tabela(460),
                  on_select="rerun", selection_mode="single-row", key=f"afp_tab_{assinatura}",
                  column_config={
                      "Nº AF": st.column_config.TextColumn(pinned=True, width="small"),
                      "Situação": col_situacao(af.SITUACOES_AF),
                      "Data da falha": ui.col_data(), "Data limite": ui.col_data(), "Data da análise": ui.col_data(),
                      "Dias de atraso": st.column_config.NumberColumn(format="%d"),
                      "Dias para análise": st.column_config.NumberColumn(format="%d"),
                      "Duração da parada (h)": st.column_config.NumberColumn("Parada (h)", format="localized"),
                      "% ações concluídas": st.column_config.ProgressColumn("Ações concluídas", format="%.0f%%",
                                                                            min_value=0, max_value=100),
                      "Resumo": st.column_config.TextColumn(width="large"),
                      "Equipamento": st.column_config.TextColumn(width="medium"),
                      "Link": st.column_config.LinkColumn("Link", display_text="Abrir AF")})
b1, b2 = st.columns([1, 3])
with b1:
    ui.baixar(vis[COLS + ["Tipo de análise", "Área da falha", "Conjunto", "Subconjunto", "Componente", "OS corretiva",
                          "Status", "Ajuste", "Observações"]], "planos_de_af", "Baixar (Excel)", chave="afp_baixar")
with b2:
    link_acoes()

sel = [r for r in (ev.selection.rows if ev and ev.selection else []) if r < len(vis)]
if sel:
    a = vis.iloc[sel[0]]
    with st.container(border=True):
        cor = af.COR.get(a["Situação"], ui.CINZA)
        st.markdown(f"##### AF {a['Nº AF']} · {a['Equipamento'] or 'equipamento não informado'}")
        st.markdown(f'<span class="cm-chip" style="background:{cor}22;color:{cor}">{a["Situação"]}</span>'
                    + (f'<span class="cm-chip cm-falta">{int(a["Dias de atraso"])} dia(s) de atraso</span>'
                       if a["Dias de atraso"] and a["Dias de atraso"] > 0 else ""),
                    unsafe_allow_html=True)
        if a["Resumo"]:
            st.markdown(f"**Resumo da falha:** {a['Resumo']}")

        def valor(c):
            v = a[c]
            if isinstance(v, pd.Timestamp):
                return f"{v:%d/%m/%Y}"
            if v is None or (isinstance(v, float) and np.isnan(v)) or v is pd.NaT:
                return "—"
            if isinstance(v, float):
                return num(v, 0 if c.startswith("Dias") or c.startswith("%") else 1) + ("%" if c.startswith("%") else "")
            if c == "Pilar" and v in af.PILARES:
                return f"{v} · {af.PILARES[v]}"
            return str(v) or "—"

        CAMPOS = ["Nº AF", "Tipo de análise", "Situação", "Status", "Criticidade", "Área", "Área da falha", "Código SAP",
                  "Equipamento", "Conjunto", "Subconjunto", "Componente", "Pilar", "Causa raiz", "Especialidade",
                  "OS corretiva", "Duração da parada (h)", "Supervisor", "Turno", "Data da falha", "Data limite", "Ajuste",
                  "Data da análise", "Dias para análise", "Dias de atraso", "% ações concluídas", "Observações"]
        campos = pd.DataFrame({"Campo": CAMPOS, "Valor": [valor(c) for c in CAMPOS]})
        meio = (len(campos) + 1) // 2
        c1, c2 = st.columns(2)
        cfg = {"Campo": st.column_config.TextColumn(width="small"), "Valor": st.column_config.TextColumn(width="large")}
        c1.dataframe(campos.iloc[:meio], hide_index=True, width="stretch", column_config=cfg)
        c2.dataframe(campos.iloc[meio:], hide_index=True, width="stretch", column_config=cfg)
        k1, k2, k3 = st.columns(3)
        with k1:
            if isinstance(a["Link"], str) and a["Link"]:
                st.link_button("Abrir a AF (arquivo)", a["Link"], icon=":material/open_in_new:")
        with k2:
            ficha(a["Código SAP"], "Abrir ficha do equipamento", "afp_ficha_af")
        with k3:
            link_acoes()

        acs = af.acoes_da_af(acoes, a["Nº AF"]) if len(acoes) else acoes
        st.markdown(f"**Plano de ação da AF** · {inteiro(len(acs))} ação(ões)")
        if not len(acs):
            st.caption("Nenhuma ação cadastrada para esta AF no gerenciador.")
        else:
            ca = [c for c in ["Nº ação", "Situação", "Ação", "Tipo da ação", "Responsável", "Data de início",
                              "Data limite", "Data realizada", "Dias de atraso", "Status", "Observações"] if c in acs]
            st.dataframe(como_etiqueta(acs[ca]), hide_index=True, width="stretch",
                         column_config={"Situação": col_situacao(af.SITUACOES_ACAO),
                                        "Ação": st.column_config.TextColumn(width="large"),
                                        "Data de início": ui.col_data(), "Data limite": ui.col_data(),
                                        "Data realizada": ui.col_data(),
                                        "Dias de atraso": st.column_config.NumberColumn(format="%d")})
