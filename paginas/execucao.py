from datetime import timedelta

import streamlit as st

from central import bases, contexto, execucao_ui, ui
from central.leitura import OPER
from central.util import hoje_local

ui.cabecalho("Execução das atividades · IW38/IW38OP × IW47",
             "Programado × executado, quem fez o quê e a lista de atividades — com filtros próprios (os filtros das "
             "outras abas não valem aqui)")

base_op = bases.operacoes()
if not ui.aviso_base(base_op, OPER):
    st.stop()

hoje = hoje_local()
fim_mes = (hoje.replace(day=1) + timedelta(days=32)).replace(day=1) - timedelta(days=1)
o = bases.iw38().df
with ui.caixa_filtros("Filtros da execução"):
    c = st.columns([2.2, 1.6, 1.6])
    with c[0]:
        ini, fim = ui.filtro_datas("exa_periodo", "Período (data programada da atividade)",
                                   (hoje.replace(day=1), fim_mes), base_op.df["Início"],
                                   atalhos=["Esta semana", "Semana passada", "Este mês", "Últimos 30 dias",
                                            "Últimos 90 dias", "Ano atual", "Tudo"])
    areas = sorted(v for v in o["Localização"].astype(str).unique() if v.strip()) if o is not None else []
    sel_area = c[1].multiselect("Área", areas, key="exa_areas", placeholder="Todas",
                                help="Localização da ordem no IW38.")
    tps = contexto.tipos()
    tipos = sorted(v for v in o["Tipo"].astype(str).unique() if v.strip()) if o is not None else []
    sel_tipo = c[2].multiselect("Tipo de ordem", tipos, key="exa_tipos", placeholder="Todos",
                                format_func=lambda t: f"{t} · {(tps.get(t) or {}).get('descricao', '')}".rstrip(" ·"))

f = contexto.Filtros(ini, fim, tuple(sel_area), (), tuple(sel_tipo))
st.caption(f"Recorte: **{ui.descrever(ini, fim)}**"
           + (f" · área: {', '.join(sel_area)}" if sel_area else "")
           + (f" · tipo: {', '.join(sel_tipo)}" if sel_tipo else "")
           + " · setor e centro de trabalho logo abaixo")
execucao_ui.mostrar(f)
