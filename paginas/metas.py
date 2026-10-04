from datetime import date

import pandas as pd
import streamlit as st

from central import auth, bases, contexto, ui
from central import indicadores as ind
from central.util import inteiro

ui.cabecalho("Metas e parâmetros WCM",
             "Metas de cada indicador, jornada da equipe, capacidade por centro de trabalho e classificação dos tipos de ordem")

eu = auth.usuario_atual()
edita = auth.pode_editar(eu)
cad = contexto.metas()
ss = st.session_state
if not edita:
    st.caption(":material/lock: Seu perfil é de consulta — só editores e administradores alteram metas e parâmetros.")
n = ss.get("_metas_salvas", 0)


def salvar(itens: dict, msg: str) -> None:
    bases.gravar_cadastro_lote(contexto.ARQ_METAS, itens, auth.nome_de(eu), mesclar=True)
    ss["_metas_salvas"] = n + 1
    st.toast(msg, icon=":material/check:")
    st.rerun()


aba = st.segmented_control("Seção", ["Metas dos indicadores", "Equipe e capacidade", "Tipos de ordem"],
                           default="Metas dos indicadores", key="mt_aba", label_visibility="collapsed") \
    or "Metas dos indicadores"

# ----------------------------------------------------------------------------
if aba == "Metas dos indicadores":
    st.caption("Deixe a célula **Meta** vazia para o indicador ficar sem meta (sem farol). Valores em % são de 0 a 100; "
               "custos em R$. O farol fica amarelo até 10% pior que a meta.")
    linhas = []
    for k in ind.KPIS:
        linhas.append({"id": k.id, "Grupo": k.grupo, "Indicador": k.nome, "Unidade": k.unidade,
                       "Sentido": "maior é melhor" if k.sentido > 0 else "menor é melhor",
                       "Meta padrão": k.meta, "Meta": ind.meta(k, cad), "Fórmula": k.formula})
    tab = pd.DataFrame(linhas)
    ed = st.data_editor(tab, hide_index=True, width="stretch", key=f"mt_ed_{n}", height=ui.altura_tabela(720),
                        disabled=[c for c in tab.columns if c != "Meta" or not edita], column_order=[
                            "Grupo", "Indicador", "Unidade", "Sentido", "Meta padrão", "Meta", "Fórmula"],
                        column_config={"Meta": st.column_config.NumberColumn(format="%.2f", min_value=0),
                                       "Meta padrão": st.column_config.NumberColumn(format="%.2f"),
                                       "Fórmula": st.column_config.TextColumn(width="large")})
    mud = ed["Meta"].fillna(-1e18) != tab["Meta"].fillna(-1e18)
    c1, c2, _ = st.columns([1.2, 1.2, 3])
    if edita and c1.button(f"Salvar metas ({int(mud.sum())})", icon=":material/save:", type="primary",
                           disabled=not mud.any(), width="stretch"):
        salvar({r["id"]: {"meta": "" if pd.isna(r["Meta"]) else float(r["Meta"])} for _, r in ed[mud].iterrows()},
               "Metas salvas.")
    if edita and any(k.id in cad for k in ind.KPIS) and c2.button("Voltar às metas padrão", icon=":material/restart_alt:",
                                                                  width="stretch"):
        bases.gravar_cadastro_lote(contexto.ARQ_METAS, {k.id: None for k in ind.KPIS if k.id in cad}, auth.nome_de(eu))
        ss["_metas_salvas"] = n + 1
        st.rerun()

# ----------------------------------------------------------------------------
elif aba == "Equipe e capacidade":
    horas = ind.horas_semana_de(cad)
    with st.container(border=True):
        st.markdown("**Jornada semanal por técnico** — base da utilização da mão de obra e da capacidade sugerida")
        c1, c2 = st.columns([1, 3])
        novo = c1.number_input("Horas por semana", min_value=1.0, max_value=80.0, value=float(horas), step=0.5,
                               key=f"mt_hs_{n}", disabled=not edita)
        if edita and novo != horas and c2.button("Salvar jornada", icon=":material/save:", type="primary"):
            salvar({"_parametros": {"horas_semana": float(novo)}}, "Jornada salva.")

    st.markdown("**Capacidade semanal por centro de trabalho (HH/semana)**")
    st.caption("Usada no backlog em semanas. Vazio = o site usa a média de HH apontadas nas últimas 12 semanas.")
    d = contexto.dados(contexto.Filtros(date.today(), date.today()))  # sem filtros: a fábrica toda
    centros = set()
    for df_ in (d.conf, d.oper):
        if df_ is not None:
            centros |= set(df_["Centro de trabalho"].unique())
    centros |= set(d.ordens["Centro de trabalho"].unique())
    centros.discard("")
    equipe = d.equipe
    tec = ind.tecnicos(d)
    cap_cfg = ind.capacidade_de(cad)
    linhas = []
    for ctr in sorted(centros):
        media, _ = ind.capacidade_semanal(ind.Dados(ordens=d.ordens, oper=d.oper, conf=d.conf, hoje=d.hoje), [ctr])
        n_tec = int((tec["Centro de trabalho"] == ctr).sum()) if len(tec) and "Centro de trabalho" in tec else 0
        linhas.append({"Centro de trabalho": ctr, "Técnicos (Gestão de HH)": n_tec,
                       "Sugestão (técnicos × jornada)": n_tec * horas if n_tec else None,
                       "Média apontada (12 sem)": media, "Capacidade configurada": cap_cfg.get(ctr)})
    tab = pd.DataFrame(linhas).sort_values("Média apontada (12 sem)", ascending=False, na_position="last")
    tab = tab.reset_index(drop=True)
    ed = st.data_editor(tab, hide_index=True, width="stretch", key=f"mt_cap_{n}", height=ui.altura_tabela(480),
                        disabled=[c for c in tab.columns if c != "Capacidade configurada" or not edita],
                        column_config={c: st.column_config.NumberColumn(format="%.0f") for c in tab.columns
                                       if c not in ("Centro de trabalho", "Técnicos (Gestão de HH)")})
    mud = ed["Capacidade configurada"].fillna(-1) != tab["Capacidade configurada"].fillna(-1)
    if edita and st.button(f"Salvar capacidades ({int(mud.sum())})", icon=":material/save:", type="primary",
                           disabled=not mud.any()):
        itens = {f"capacidade:{r['Centro de trabalho']}": (None if pd.isna(r["Capacidade configurada"])
                                                          else {"hh": float(r["Capacidade configurada"])})
                 for _, r in ed[mud].iterrows()}
        bases.gravar_cadastro_lote(contexto.ARQ_METAS, itens, auth.nome_de(eu))
        ss["_metas_salvas"] = n + 1
        st.rerun()
    if equipe is not None:
        st.caption(f"Equipe lida da planilha de Gestão de HH: {inteiro(len(equipe))} pessoas, "
                   f"{inteiro(len(tec))} técnicos de execução.")

# ----------------------------------------------------------------------------
else:
    st.caption("A classe WCM de cada tipo de ordem alimenta os indicadores de corretiva emergencial e os gráficos por "
               "classe. Sem classe definida, ela é deduzida do nome (ex.: \"Corretiva Emergencial\" → Emergencial). "
               "Os nomes padrão vêm da aba de apoio da planilha de Gestão de HH.")
    o = bases.iw38().df
    tipos = contexto.tipos()
    codigos = sorted(set(tipos) | (set(o["Tipo"].unique()) if o is not None else set()) - {""})
    contagem = o["Tipo"].value_counts() if o is not None else pd.Series(dtype=int)
    tab = pd.DataFrame([{"Código": c, "Descrição": (tipos.get(c) or {}).get("descricao", ""),
                         "Classe": (tipos.get(c) or {}).get("classe", ""),
                         "Classe deduzida": ind.classe_tipo(c, {c: {"descricao": (tipos.get(c) or {}).get("descricao", "")}}),
                         "Ordens no IW38": int(contagem.get(c, 0))} for c in codigos])
    if not len(tab):
        st.info("Nenhum tipo de ordem encontrado.")
        st.stop()
    ed = st.data_editor(tab, hide_index=True, width="stretch", key=f"mt_tp_{n}",
                        disabled=[c for c in tab.columns if c not in ("Descrição", "Classe") or not edita],
                        column_config={"Classe": st.column_config.SelectboxColumn(options=[""] + ind.CLASSES_TIPO,
                                                                                  help="Vazio = usa a classe deduzida")})
    mud = (ed["Descrição"] != tab["Descrição"]) | (ed["Classe"].fillna("") != tab["Classe"].fillna(""))
    if edita and st.button(f"Salvar tipos ({int(mud.sum())})", icon=":material/save:", type="primary",
                           disabled=not mud.any()):
        salvar({f"tipo:{r['Código']}": {"descricao": r["Descrição"] or "", "classe": r["Classe"] or ""}
                for _, r in ed[mud].iterrows()}, "Tipos de ordem salvos.")
