import pandas as pd
import streamlit as st

from central import bases, contexto, qualidade, ui
from central import indicadores as ind
from central.leitura import IW38
from central.util import inteiro

ui.cabecalho("Qualidade dos dados",
             "O que nas bases do SAP distorce os indicadores, quanto distorce e como corrigir na origem — "
             "indicador bom começa no apontamento bem feito")

if not ui.aviso_base(bases.iw38(), IW38):
    st.stop()

f = contexto.filtros_globais(periodo=False)


@st.cache_data(show_spinner="Conferindo as bases…", max_entries=8)
def _checagens(chave: str, f: contexto.Filtros) -> list[qualidade.Checagem]:
    d = contexto.dados(f)
    return qualidade.verificar(d.hoje, ordens=d.ordens, oper=d.oper, notas=d.notas, conf=d.conf, equipe=d.equipe,
                               equip=bases.equipamentos().df, cad_eq=d.cad_eq, quebras=d.memo("quebras", ind.quebras),
                               fim_real=d.memo("fim_real", lambda x: ind.fim_real_por_ordem(x.oper)))


checagens = _checagens(contexto._chave(), f)
st.caption(f"Recorte: **{f.recorte or 'fábrica inteira'}** · últimos 12 meses até hoje · farol: até 2% verde, até "
           "10% amarelo, acima disso vermelho")
if not checagens:
    st.info("Sem bases para conferir.")
    st.stop()

idx = qualidade.indice(checagens)
n_cor = {cor: sum(1 for c in checagens if c.farol == cor) for cor in (qualidade.VERDE, qualidade.AMARELO,
                                                                      qualidade.VERMELHO)}
k = st.columns(4)
k[0].metric("Índice de qualidade", f"{idx:.0f}/100" if idx is not None else "—", "100 − média dos % com problema",
            delta_color="off", border=True, delta_arrow="off")
k[1].metric("Checagens OK", inteiro(n_cor[qualidade.VERDE]), border=True, delta_arrow="off")
k[2].metric("Em atenção", inteiro(n_cor[qualidade.AMARELO]), border=True, delta_arrow="off")
k[3].metric("Críticas", inteiro(n_cor[qualidade.VERMELHO]), border=True, delta_arrow="off")

ICONE = {qualidade.VERDE: "🟢", qualidade.AMARELO: "🟡", qualidade.VERMELHO: "🔴"}
ordem = sorted(checagens, key=lambda c: (-(c.pct or 0)))
tab = pd.DataFrame([{"": ICONE[c.farol], "Checagem": c.nome, "% com problema": c.pct, "Com problema": c.n,
                     "Total": c.total, "Afeta": c.afeta} for c in ordem])
st.dataframe(tab, hide_index=True, width="stretch", height=38 * (len(tab) + 1) + 4,
             column_config={"": st.column_config.TextColumn(width=40),
                            "% com problema": st.column_config.NumberColumn(format="%.1f%%"),
                            "Checagem": st.column_config.TextColumn(width="large"),
                            "Afeta": st.column_config.TextColumn(width="large")})

st.markdown("#### :material/list_alt: Registros com problema")
st.caption("Abra a checagem para ver como corrigir, a lista de registros e baixar em Excel para corrigir no SAP.")
for c in ordem:
    if not c.n:
        continue
    with st.expander(f"{ICONE[c.farol]} {c.nome} · {inteiro(c.n)} de {inteiro(c.total)}", icon=":material/rule:"):
        st.markdown(f":material/build: **Como corrigir:** {c.corrigir}  \n:material/table: **Base:** {c.base} · "
                    f"**Afeta:** {c.afeta}")
        cfg = {col: ui.col_data() for col in ("Data", "Fim", "Início", "Último") if col in c.problemas}
        st.dataframe(c.problemas.head(1000), hide_index=True, width="stretch", height=ui.altura_tabela(320),
                     column_config=cfg)
        ui.baixar(c.problemas, f"qualidade_{c.id}", "Baixar (Excel)", chave=f"q_baixar_{c.id}")
