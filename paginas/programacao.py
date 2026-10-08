from datetime import timedelta

import pandas as pd
import streamlit as st

from central import auth, bases, contexto, robo, ui
from central import calendario as cal
from central import mudanca_datas as md
from central.fontes import FonteErro
from central.util import hoje_local, inteiro

ui.cabecalho("Programação do mês · previsão",
             "Calendário manual das paradas das máquinas (campo de ordenação), à parte do calendário da IW38. "
             "Daqui o robô do SAP muda as datas das ordens na IW38 e o calendário principal se atualiza.")

usuario = auth.usuario_atual()
pode = auth.pode_editar(usuario)
quem = auth.nome_de(usuario) or "site"
hoje = hoje_local()
ss = st.session_state


@st.cache_resource(show_spinner="Lendo os nomes dos ativos (IH08/IW38)…", max_entries=2)
def _referencias(chave: str) -> tuple[dict, pd.DataFrame | None, set]:
    ordens = bases.iw38().df
    conf = bases.confirmacoes().df
    concluidas: set = set()
    if conf is not None and len(conf) and "Status sistema" in conf:   # IW47 mais nova que o IW38
        st_ = conf["Status sistema"].fillna("").astype(str).groupby(conf["Ordem"]).agg(lambda s: set(" ".join(s).split()))
        concluidas = {o for o, t in st_.items() if {"CONF", "ENTE"} <= t}
    return md.nomes_de_ativos(ordens, bases.equipamentos().df), ordens, concluidas


nomes, ordens_iw38, concluidas = _referencias(contexto._chave())
lotes = {k: v for k, v in bases.ler_cadastro(md.ARQ_LOTES).items() if isinstance(v, dict)}

# site rodando no PC do robô: traz o resultado do robô para o lote
if robo.disponivel():
    res_local = robo.resultado_mudanca()
    lid_local = res_local.get("lote")
    if lid_local in lotes and lotes[lid_local].get("status") == md.EM_EXECUCAO and not res_local.get("em_andamento"):
        try:
            bases.gravar_cadastro_lote(md.ARQ_LOTES, {lid_local: md.aplicar_resultado(lotes[lid_local], res_local)}, quem)
            st.rerun()
        except FonteErro as e:
            st.error(str(e))
abertos = {k: v for k, v in lotes.items() if v.get("status") in md.ABERTOS}

# ----------------------------------------------------------------------------
# Mês
# ----------------------------------------------------------------------------
inicio_mes_atual = hoje.replace(day=1)
meses = []
d = (inicio_mes_atual - timedelta(days=62)).replace(day=1)
for _ in range(15):
    meses.append(d)
    d = (d + timedelta(days=32)).replace(day=1)
c_mes, c_info = st.columns([2, 5], vertical_alignment="bottom")
mes = c_mes.selectbox("Mês", meses, index=meses.index(inicio_mes_atual), key="pm_mes",
                      format_func=lambda m: f"{md.MESES[m.month - 1]} de {m.year}")
fim_mes = md.fim_do_mes(mes)
c_info.caption("Digite em cada dia os **campos de ordenação** das máquinas que vão parar (separe por vírgula ou "
               "espaço) e tecle Enter: o nome do ativo aparece embaixo e a programação fica salva para todos. "
               + ("" if pode else "Só administrador ou editor pode alterar."))

prog = md.programacao_valida(bases.ler_cadastro(md.ARQ_PROGRAMACAO))

# ordens abertas do mês por máquina (pelo IW38 exportado), só para orientar
no_mes: dict[str, int] = {}
if ordens_iw38 is not None and len(ordens_iw38) and "Campo de ordenação" in ordens_iw38:
    o = ordens_iw38[ordens_iw38["Situação"].isin(["Aberta", "Liberada"]) & ~ordens_iw38["Ordem"].isin(concluidas)]
    o = o[ui.entre(o["Início"], mes, fim_mes)]
    no_mes = o.groupby(o["Campo de ordenação"].astype(str).str.strip().str.upper()).size().to_dict()


def _salvar_dia(iso: str) -> None:
    campos = md.separar_campos(ss.get(f"pm_{iso}", ""))
    try:
        bases.gravar_cadastro_lote(md.ARQ_PROGRAMACAO, {iso: {"campos": campos} if campos else None}, quem)
        ss.pop("pm_erro", None)
    except FonteErro as e:
        ss["pm_erro"] = str(e)


if ss.get("pm_erro"):
    st.error(ss["pm_erro"])

ui.aplicar_css("""
[class*="st-key-pmd-"] { min-height: 128px; gap: .25rem; padding: .45rem .55rem !important; }
[class*="st-key-pmd-hoje"] { border: 2px solid #0A6EBD !important; background: rgba(10,110,189,.05); }
[class*="st-key-pmd-"] [data-testid="stCaptionContainer"] { font-size: .72rem; line-height: 1.2; }
.pm-cab { text-align: center; font-size: .72rem; font-weight: 800; letter-spacing: .05em; opacity: .7;
          background: rgba(128,128,128,.10); border-radius: 8px; padding: 6px 0; }
.pm-num { font-weight: 800; font-size: 1.05rem; }
""")
cab = st.columns(7)
for col, nome_dia in zip(cab, cal.DIAS):
    col.markdown(f'<div class="pm-cab">{nome_dia}</div>', unsafe_allow_html=True)
semana = cal.inicio_semana(mes)
while semana <= fim_mes:
    cols = st.columns(7)
    for i, col in enumerate(cols):
        dia = semana + timedelta(days=i)
        if dia.month != mes.month:
            continue
        iso = dia.isoformat()
        chave_txt = f"pm_{iso}"
        with col, st.container(border=True, key=f"pmd-{'hoje-' if dia == hoje else ''}{iso}"):
            st.markdown(f'<span class="pm-num">{dia.day}</span>', unsafe_allow_html=True)
            st.text_input(f"Campos de ordenação de {dia:%d/%m}", value=", ".join(prog.get(iso, [])), key=chave_txt,
                          label_visibility="collapsed", placeholder="máquina", disabled=not pode,
                          on_change=_salvar_dia, args=(iso,))
            for campo in md.separar_campos(ss.get(chave_txt, "")):
                nome = nomes.get(campo)
                n = no_mes.get(campo, 0)
                st.caption(f"**{campo}** · {nome or ':orange[não encontrado no IH08/IW38]'}"
                           + (f" · {n} ordem(ns) no mês" if n else ""))
    semana += timedelta(days=7)

# ----------------------------------------------------------------------------
# Mudar as datas no SAP
# ----------------------------------------------------------------------------
st.markdown("### :material/smart_toy: Mudar as datas no SAP")
st.caption("Para cada dia: o robô abre a **IW38**, usa a **seta à direita** do *Campo de ordenação* para colocar os "
           "campos do dia, filtra o período das ordens e executa. Em cada ordem da lista, **InícioBase e Fim-base "
           "recebem a data do dia**; o robô grava e confere. Quando uma máquina para mais de uma vez no mês, cada "
           "parada leva as ordens até ela (a última leva até o fim do mês).")


def _sinais() -> dict:
    try:
        return bases.ler_cadastro(md.ARQ_ROBO_PC)
    except FonteErro:
        return {}


COMO_ATIVAR = """**Para o robô atender os pedidos do site** (no PC que tem o SAP, uma vez só):

1. Na pasta do sistema (a mesma do `iniciar.bat`), dê duplo clique em **`atualizar.bat`**: ele baixa a versão nova e
   reinicia o sincronizador. Se o arquivo não existir (instalação antiga), baixe o
   [ZIP novo](https://github.com/6178609/estoquemanutencao/archive/refs/heads/main.zip), extraia e **copie por cima**
   da pasta do sistema (substituir os arquivos; as configurações deste PC ficam) e **reinicie o computador**.
2. Se ainda não fez: `automacao\\configurar_robo.bat` (guarda o usuário do SAP no Windows) e
   `sincronizador\\configurar.bat`.
3. Volte aqui e clique em **Testar o robô**: ele confere cada passo no SAP sem alterar nada.

Depois disso o sincronizador se atualiza sozinho (a cada 6 h) e avisa o site que está ligado."""


def _painel_robo() -> None:
    """Se o robô vai atender: PC ligado, código atual e robô configurado (sinal do sincronizador)."""
    if robo.disponivel():
        st.success("Robô do SAP **neste PC**: o pedido é executado na hora.", icon=":material/smart_toy:")
        return
    sit = md.situacao_robo(_sinais())
    pronto = [x for x in sit if x["estado"] == "ok"]
    if pronto:
        p = pronto[0]
        st.success(f"Robô do SAP **pronto** no PC **{p['pc']}** · visto há {md.tempo(p['visto_min'])} · código "
                   f"{p['versao']} · pega cada pedido em até 1 minuto.", icon=":material/smart_toy:")
        return
    if not sit:
        st.error("**Nenhum PC com o robô do SAP deu sinal ao site.** O PC do SAP está com o código antigo (instalado "
                 "pelo Download ZIP antes destas melhorias) ou o sincronizador está desligado — por isso os pedidos "
                 "ficam em \"Aguardando o robô do SAP\".", icon=":material/report:")
    for x in sit[:3]:
        (st.warning if x["estado"] == "nao_configurado" else st.error)(
            f"PC **{x['pc']}**: {x['texto']}", icon=":material/smart_toy:")
    with st.expander("Como colocar o robô para funcionar", icon=":material/build:", expanded=not sit):
        st.markdown(COMO_ATIVAR)


def _etapas(lote: dict) -> None:
    """Checklist do teste do robô."""
    etapas = lote.get("etapas") or []
    if etapas:
        st.dataframe(pd.DataFrame([{"": "✅" if e.get("ok") else "❌", "Etapa": e.get("etapa", ""),
                                    "Detalhe": e.get("detalhe", "")} for e in etapas]),
                     hide_index=True, width="stretch",
                     column_config={"": st.column_config.TextColumn(width=40),
                                    "Detalhe": st.column_config.TextColumn(width="large")})
    if lote.get("ordens_encontradas"):
        st.caption(f"Ordens que a IW38 trouxe no teste: {', '.join(lote['ordens_encontradas'][:60])}")
    if lote.get("campos_tela"):
        with st.expander(f"Campos da tela de seleção da IW38 ({len(lote['campos_tela'])})", icon=":material/list:"):
            st.caption("Para conferir os IDs usados pelo robô em automacao/transacoes.toml.")
            st.dataframe(pd.DataFrame(lote["campos_tela"]).rename(columns={"id": "ID", "tipo": "Tipo",
                                                                           "texto": "Texto"}),
                         hide_index=True, width="stretch", height=ui.altura_tabela(300))


def _testar_robo() -> None:
    with st.popover("Testar o robô", icon=":material/troubleshoot:", disabled=not pode or bool(abertos),
                    help="Só administrador ou editor." if not pode else
                    "Já há um pedido em andamento." if abertos else
                    "O robô confere cada passo no SAP (IW38, seta à direita, período, tela da ordem) sem alterar nada."):
        st.markdown("O robô abre o SAP numa **janela própria**, entra na IW38 e confere cada passo, **sem gravar "
                    "nada**. Opcional: um campo de ordenação para uma busca de verdade e uma ordem para ler as "
                    "datas na IW33.")
        campo = st.text_input("Campo de ordenação para testar (opcional)", key="pm_t_campo",
                              placeholder="ex.: 41020389")
        ordem = st.text_input("Ordem para ler as datas (opcional)", key="pm_t_ordem", placeholder="ex.: 4001234567")
        if st.button("Iniciar teste", type="primary", icon=":material/play_arrow:", key="pm_t_ir"):
            try:
                lote_id, lote = md.novo_diagnostico(quem, campo, ordem, mes, fim_mes)
                if robo.disponivel():
                    lote["status"] = md.EM_EXECUCAO
                bases.gravar_cadastro_lote(md.ARQ_LOTES, {lote_id: lote}, quem)
                if robo.disponivel():
                    robo.iniciar_mudanca(md.job(lote_id, lote))
                st.toast("Teste enviado ao robô do SAP.", icon=":material/smart_toy:")
                st.rerun()
            except (ValueError, FonteErro) as e:
                st.error(str(e))


@st.fragment(run_every="5s" if robo.disponivel() else "20s")
def _andamento():
    """Andamento do lote aberto; quando o robô termina, recarrega a página com o resultado."""
    if robo.disponivel():
        r = robo.resultado_mudanca()
        if r.get("em_andamento"):
            if r.get("aguardando"):
                st.info(r["aguardando"], icon=":material/hourglass_top:")
            elif r.get("tipo") == md.DIAGNOSTICO:
                st.info(f"Testando o robô… {len(r.get('etapas', []))} etapa(s) feitas", icon=":material/troubleshoot:")
            else:
                feitas = len(r.get("itens", []))
                st.progress(min(feitas / max(r.get("total") or 1, 1), 1.0),
                            text=f"Robô do SAP alterando as ordens… {feitas} de {r.get('total', '?')} "
                                 f"(consultas na IW38: {len(r.get('consultas', []))})")
            return
        if r.get("lote") in abertos:
            st.rerun()
    try:
        atuais = bases._ler_json_agora(md.ARQ_LOTES)
    except FonteErro:
        atuais = lotes
    if any((atuais.get(k) or {}).get("status") != v.get("status") for k, v in abertos.items()):
        bases.recarregar()
        st.rerun()
    pronto = robo.disponivel() or any(x["estado"] == "ok" for x in md.situacao_robo(_sinais()))
    for lid, lote_ab in abertos.items():
        lote_ab = {**lote_ab, **(atuais.get(lid) or {})}
        prog = lote_ab.get("progresso") or {}
        parado = md.parado_ha(lote_ab)
        oque = "Teste do robô" if lote_ab.get("tipo") == md.DIAGNOSTICO else f"Lote {lid}"
        texto = f"{oque}: **{md.ROTULO_STATUS.get(lote_ab['status'])}**" + (f" · {prog['texto']}" if prog else "")
        if lote_ab["status"] == md.SOLICITADA and not pronto and (parado or 0) >= 2:
            st.error(f"{texto} · há {parado} min e **nenhum robô do SAP pegou o pedido** (veja a situação do robô "
                     "acima). Cancele no histórico se não for mais preciso.", icon=":material/smart_toy:")
        elif lote_ab["status"] == md.EM_EXECUCAO and (parado or 0) >= 40:
            st.warning(f"{texto} · sem notícias do robô há {parado} min: ele pode ter parado. Confira o SAP no PC do "
                       "robô; se for o caso, cancele no histórico e rode de novo.", icon=":material/smart_toy:")
        else:
            st.info(texto + ("" if robo.disponivel() or lote_ab["status"] != md.SOLICITADA else
                             " · o robô do PC com o SAP (sincronizador) pega o pedido em até 1 minuto"),
                    icon=":material/smart_toy:")


_painel_robo()
c_t1, c_t2 = st.columns([1, 3], vertical_alignment="center")
with c_t1:
    _testar_robo()
ultimo_teste = max(((k, v) for k, v in lotes.items() if v.get("tipo") == md.DIAGNOSTICO and v.get("status")
                    in (md.CONCLUIDA, md.COM_ERROS)), key=lambda kv: kv[1].get("criado_em", ""), default=None)
if ultimo_teste:
    lid_t, lote_t = ultimo_teste
    quando = pd.to_datetime(lote_t.get("executado_em") or lote_t.get("criado_em"), utc=True, errors="coerce")
    quando_txt = "" if pd.isna(quando) else quando.tz_convert("America/Sao_Paulo").strftime("%d/%m %H:%M")
    ok_t = lote_t.get("status") == md.CONCLUIDA
    c_t2.markdown(f"{':green[:material/check_circle:]' if ok_t else ':red[:material/error:]'} Último teste "
                  f"({quando_txt}): {lote_t.get('resumo', '')}")
    with st.expander("Resultado do último teste do robô", icon=":material/fact_check:", expanded=not ok_t):
        _etapas(lote_t)

if abertos:
    _andamento()

with st.container(border=True):
    padrao = (max(hoje, mes), fim_mes) if fim_mes >= hoje else (mes, fim_mes)
    ini_x, fim_x = ui.filtro_datas(f"pm_exec_{mes:%Y%m}", "Dias a executar (de / até)", padrao,
                                   atalhos=["Esta semana", "Próxima semana", "Este mês", "Próximo mês"])
    if fim_x < ini_x:
        ini_x, fim_x = fim_x, ini_x
    atrasadas = st.toggle("Trazer também as ordens atrasadas de meses anteriores", key="pm_atrasadas",
                          help="Na primeira parada de cada máquina no mês, a IW38 busca desde sempre, e não só a "
                               "partir do dia 1º do mês.")
    cons = md.consultas(prog, ini_x, fim_x, atrasadas)
    if not cons:
        st.info(f"Nenhum dia com campo de ordenação entre {ui.descrever(ini_x, fim_x)}.")
    else:
        est = md.estimativa(ordens_iw38, cons, concluidas, nomes)
        por_dia = est.groupby(["Dia"]).size() if len(est) else pd.Series(dtype=int)
        quadro = pd.DataFrame([{
            "Dia": pd.Timestamp(c["dia"]), "Campos de ordenação": ", ".join(
                f"{x} · {nomes.get(x, '?')[:30]}" for x in c["campos"]),
            "Ordens buscadas na IW38 com data de": f"{pd.Timestamp(c['de']):%d/%m/%Y} a {pd.Timestamp(c['ate']):%d/%m/%Y}"
            if c["de"] != md.DESDE_SEMPRE.isoformat() else f"até {pd.Timestamp(c['ate']):%d/%m/%Y} (com atrasadas)",
            "Ordens previstas": int(por_dia.get(pd.Timestamp(c["dia"]), 0))} for c in cons])
        st.dataframe(quadro, hide_index=True, width="stretch",
                     column_config={"Dia": ui.col_data(), "Campos de ordenação": st.column_config.TextColumn(width="large")})
        st.caption(f"Previsão pelo IW38 exportado: **{inteiro(len(est))} ordem(ns)** em {len(cons)} consulta(s). "
                   "O robô consulta a IW38 na hora, então o número real pode ser outro.")
        if len(est):
            with st.expander(f"Ordens previstas ({inteiro(len(est))})", icon=":material/list:"):
                st.dataframe(est, hide_index=True, width="stretch", height=ui.altura_tabela(320),
                             column_config={"Dia": ui.col_data("Novo início e fim"), "Início atual": ui.col_data(),
                                            "Fim atual": ui.col_data(), "Texto": st.column_config.TextColumn(width="medium")})
        if len(est) > md.MAX_ORDENS_LOTE:
            st.warning(f"Mais de {md.MAX_ORDENS_LOTE} ordens previstas: o robô para nesse limite. Rode por partes "
                       "(menos dias por vez).", icon=":material/warning:")
        c1, c2 = st.columns([2, 3])
        simular = c1.toggle("Só simular", key="pm_simular",
                            help="O robô faz a IW38 e abre cada ordem para conferir se o SAP aceita a data, sem gravar.")
        confirma = c2.checkbox(f"Confirmo {'simular' if simular else 'alterar no SAP'} as datas de {len(cons)} "
                               "consulta(s) na IW38", key="pm_confirma")
        bloqueio = ("Só administrador ou editor pode iniciar." if not pode else
                    "Já há um lote em andamento." if abertos else
                    "Marque a confirmação." if not confirma else "")
        if st.button("Iniciar mudança de datas", type="primary", icon=":material/play_arrow:", disabled=bool(bloqueio),
                     help=bloqueio or None):
            try:
                lote_id, lote = md.novo_lote(cons, quem, simular=simular, atrasadas=atrasadas)
                if robo.disponivel():
                    lote["status"] = md.EM_EXECUCAO
                bases.gravar_cadastro_lote(md.ARQ_LOTES, {lote_id: lote}, quem)
                if robo.disponivel():
                    robo.iniciar_mudanca(md.job(lote_id, lote))
                ss.pop("pm_confirma", None)      # pede nova confirmação no próximo lote
                st.toast(f"Lote {lote_id} enviado ao robô do SAP.", icon=":material/smart_toy:")
                st.rerun()
            except (ValueError, FonteErro) as e:
                st.error(str(e))
        if not robo.disponivel():
            st.caption(":material/info: Este site não está no PC do SAP: o pedido fica guardado e o robô desse PC "
                       "(sincronizador ligado e robô configurado) executa em até 1 minuto.")

# ----------------------------------------------------------------------------
# Histórico
# ----------------------------------------------------------------------------
if lotes:
    with st.expander(f"Histórico de mudanças de datas ({len(lotes)})", icon=":material/history:"):
        tab_l = md.tabela_lotes(lotes)
        ev = st.dataframe(tab_l, hide_index=True, width="stretch", on_select="rerun", selection_mode="single-row",
                          key="pm_hist", column_config={
                              "Criado em": st.column_config.DatetimeColumn(format="DD/MM/YYYY HH:mm"),
                              "Resumo": st.column_config.TextColumn(width="large")})
        sel = ev.selection.rows if ev and ev.selection else []
        if sel and sel[0] < len(tab_l):
            lid = tab_l.iloc[sel[0]]["Lote"]
            lote = lotes[lid]
            if lote.get("tipo") == md.DIAGNOSTICO:
                _etapas(lote)
            for c in lote.get("consultas_resultado", []):
                if c.get("erro"):
                    st.error(f"IW38 de {pd.Timestamp(c['dia']):%d/%m} ({', '.join(c.get('campos', []))}): {c['erro']}")
            itens = pd.DataFrame(lote.get("itens", []))
            if len(itens):
                itens = itens.rename(columns={"ordem": "Ordem", "campo": "Campo de ordenação", "dia": "Dia",
                                              "de_inicio": "Início antes", "de_fim": "Fim antes",
                                              "para_inicio": "Novo início", "para_fim": "Novo fim",
                                              "resultado": "Resultado", "mensagem": "Mensagem do SAP"})
                st.dataframe(itens, hide_index=True, width="stretch", height=ui.altura_tabela(300))
                ui.baixar(itens, f"mudanca_datas_{lid}", "Baixar resultado (Excel)")
            b1, b2 = st.columns(2)
            if lote.get("status") in (md.CONCLUIDA, md.COM_ERROS) and not lote.get("simular") and \
                    b1.button("Desfazer este lote (volta as datas antigas)", icon=":material/undo:",
                              disabled=not pode or bool(abertos)):
                try:
                    novo_id, novo = md.lote_desfazer(lote, quem)
                    if robo.disponivel():
                        novo["status"] = md.EM_EXECUCAO
                    bases.gravar_cadastro_lote(md.ARQ_LOTES, {novo_id: novo}, quem)
                    if robo.disponivel():
                        robo.iniciar_mudanca(md.job(novo_id, novo))
                    st.rerun()
                except (ValueError, FonteErro) as e:
                    st.error(str(e))
            if lote.get("status") in md.ABERTOS and b2.button("Cancelar este pedido", icon=":material/cancel:",
                                                              disabled=not pode,
                                                              help="Use se o robô não pegou o pedido ou parou no meio."):
                try:
                    bases.gravar_cadastro_lote(md.ARQ_LOTES, {lid: {**lote, "status": md.CANCELADA,
                                                                   "resumo": f"cancelado por {quem}"}}, quem)
                    st.rerun()
                except FonteErro as e:
                    st.error(str(e))
