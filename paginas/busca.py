
import pandas as pd
import streamlit as st

from central import bases, busca, contexto, ui
from central.util import brl, hoje_local, inteiro

ui.cabecalho("Buscar", "Um número ou palavra procurado de uma vez em ordens, notas, equipamentos, materiais, planos "
                       "e análises de falha — sem filtro de período")

ss = st.session_state
if "busca_q" in ss:                       # veio da caixa de busca da barra lateral
    ss["bg_termo"] = ss.pop("busca_q")
termo = st.text_input("O que você procura?", key="bg_termo",
                      placeholder="nº da ordem, nota, equipamento, campo de ordenação, material, plano, AF, texto…")


@st.cache_data(show_spinner="Procurando…", max_entries=32)
def _buscar(chave: str, termo: str) -> dict[str, pd.DataFrame]:
    return busca.buscar(termo, ordens=bases.iw38().df, notas=bases.notas().df, equip=bases.equipamentos().df,
                        cad_eq=bases.ler_cadastro(bases.ARQ_CAD_EQUIP), estoque=bases.mb52().df,
                        chamadas=contexto.chamadas_classificadas(), afs=bases.afs().df)


if len(busca.normalizar(termo).replace(" ", "")) < 2:
    st.caption("Digite ao menos 2 caracteres. Todas as palavras precisam aparecer (sem diferença de acento); "
               "número exato vem primeiro.")
    st.stop()

res = _buscar(contexto._chave(), termo)
total = sum(len(v) for v in res.values())
if not total:
    st.info(f"Nada encontrado para **{termo}**.", icon=":material/search_off:")
    st.stop()
st.caption(f"**{inteiro(total)}** resultado(s) — até {busca.LIMITE} por tipo")

com = [c for c in busca.CATEGORIAS if len(res[c])]
abas = st.tabs([f"{c} ({inteiro(len(res[c]))}{'+' if len(res[c]) >= busca.LIMITE else ''})" for c in com])
for aba, cat in zip(abas, com):
    with aba:
        df = res[cat]
        cfg = {"Data": ui.col_data(), "Fim": ui.col_data("Prazo"), "Data da falha": ui.col_data(),
               "Custo real": ui.col_moeda(), "Valor": ui.col_moeda(),
               "Texto": st.column_config.TextColumn(width="large"),
               "Descrição": st.column_config.TextColumn(width="large"),
               "Resumo": st.column_config.TextColumn(width="large")}
        ev = st.dataframe(df, hide_index=True, width="stretch", height=ui.altura_tabela(380), on_select="rerun",
                          selection_mode="single-row", key=f"bg_tab_{cat}", column_config=cfg)
        sel = ev.selection.rows if ev and ev.selection else []
        if not sel or sel[0] >= len(df):
            st.caption("Selecione uma linha para ver os detalhes.")
            continue
        linha = df.iloc[sel[0]]
        with st.container(border=True):
            if cat == "Ordens":
                o = bases.iw38().df
                info = o[o["Ordem"] == linha["Ordem"]].iloc[0]
                st.markdown(f"**Ordem {info['Ordem']}** · {info['Tipo']} · {info['Texto']}")
                k = st.columns(4)
                k[0].metric("Situação", str(info["Situação"]), border=True, delta_arrow="off")
                k[1].metric("Data-base", f"{info['Início']:%d/%m/%Y}" if pd.notna(info["Início"]) else "—", border=True,
                            delta_arrow="off")
                k[2].metric("Prazo (fim-base)", f"{info['Fim']:%d/%m/%Y}" if pd.notna(info["Fim"]) else "—",
                            border=True, delta_arrow="off")
                k[3].metric("Custo real", brl(info["Custo real"]), border=True, delta_arrow="off")
                st.caption(f"Equipamento: **{info['Equip. (chave)']}** {info['Objeto técnico']} · centro "
                           f"{info['Centro de trabalho']} · {info['Natureza']} · status {info['Status sistema']}")
                op = bases.operacoes().df
                if op is not None:
                    ops = op[op["Ordem"] == info["Ordem"]]
                    if len(ops):
                        st.dataframe(ops[["Operação", "Texto da operação", "Centro de trabalho", "Horas", "Pessoas",
                                          "Início", "Fim real", "Status sistema"]], hide_index=True, width="stretch",
                                     column_config={"Início": ui.col_data("Programada"), "Fim real": ui.col_data(),
                                                    "Horas": st.column_config.NumberColumn("HH", format="%.2f")})
                conf = bases.confirmacoes().df
                if conf is not None:
                    ap = conf[conf["Ordem"] == info["Ordem"]]
                    if len(ap):
                        st.caption(f"Apontamentos (IW47): **{ap['Horas'].sum():.1f} HH** por "
                                   f"{ap['Nº pessoal'].nunique()} pessoa(s), de {ap['Data'].min():%d/%m/%Y} a "
                                   f"{ap['Data'].max():%d/%m/%Y}".replace(".", ",", 1))
                if info["Equip. (chave)"]:
                    contexto.link_ficha(info["Equip. (chave)"], chave=f"bg_ficha_o_{info['Ordem']}")
            elif cat == "Equipamentos":
                cod = linha["Equipamento"]
                st.markdown(f"**{cod}** · {linha.get('Denominação', '')}")
                saude_t = contexto.saude_ativos(contexto.Filtros(hoje_local(), hoje_local()))
                s_eq = saude_t[saude_t["Código"] == cod]
                if len(s_eq):
                    s0 = s_eq.iloc[0]
                    st.markdown(f"Saúde **{s0['Saúde']:.0f}/100** ({s0['Faixa']}) · risco {s0['Risco']:.0f} · "
                                f"principal causa: {s0['Principal causa']} · {inteiro(s0['Backlog atrasado'])} ordem(ns) "
                                "atrasada(s)")
                contexto.link_ficha(cod, chave=f"bg_ficha_{cod}")
            elif cat == "Materiais":
                st.markdown(f"**{linha['Material']}** · {linha['Descrição']} · estoque **{linha['Estoque']:,.0f}**"
                            .replace(",", "."))
                if st.button("Abrir no Estoque", icon=":material/inventory_2:", key=f"bg_mat_{linha['Material']}"):
                    ss["m_busca"] = linha["Material"]
                    st.switch_page("paginas/estoque.py")
            elif cat == "Notas":
                st.markdown(f"**Nota {linha['Nota']}** · {linha.get('Tipo de nota', '')} · {linha.get('Descrição', '')}")
                st.caption(f"Ordem: {linha.get('Ordem') or 'sem ordem'} · equipamento {linha.get('Equip. (chave)', '')} "
                           f"{linha.get('Objeto técnico', '')}" + (" · **quebra**" if linha.get("Quebra") else ""))
                if linha.get("Equip. (chave)"):
                    contexto.link_ficha(linha["Equip. (chave)"], chave=f"bg_ficha_n_{linha['Nota']}")
            elif cat == "Planos":
                if st.button("Abrir em Planos", icon=":material/calendar_month:", key=f"bg_plano_{sel[0]}"):
                    ss["p_busca"] = linha["Plano"]
                    st.switch_page("paginas/planos.py")
            elif cat == "Análises de falha":
                st.markdown(f"**{linha['Nº AF']}** · {linha.get('Equipamento', '')} · {linha.get('Resumo', '')}")
                st.caption(f"Situação: {linha.get('Situação', '')} · causa raiz: {linha.get('Causa raiz', '') or '—'}")
                if st.button("Abrir em Planos de AF", icon=":material/troubleshoot:", key=f"bg_af_{sel[0]}"):
                    ss["afp_busca"] = linha["Nº AF"]
                    st.switch_page("paginas/af_planos.py")
