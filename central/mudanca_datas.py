"""Mudança de datas no SAP a partir do calendário (por campo de ordenação = máquina).

Pandas puro (testado em tests/test_mudanca_datas.py). Fluxo:

1. Programação: em cada dia do calendário a pessoa escolhe os campos de ordenação (máquinas)
   que param naquele dia — gravado no cadastro `programacao_maquinas.json` ({"AAAA-MM-DD": [campos]}).
2. Proposta: as ordens pendentes (abertas/liberadas, não encerradas pela IW47) de cada máquina
   vão para o dia escolhido; o fim-base anda junto, mantendo a duração da ordem.
3. Lote: a pessoa confere/desmarca e inicia. O lote fica no cadastro `mudancas_datas.json` e o robô
   do SAP (automacao/robo_sap.py --mudar-datas) altera ordem por ordem e devolve o resultado de cada uma
   (com as datas antigas, para dar para desfazer).
"""

from __future__ import annotations

import uuid
from datetime import date, datetime, timedelta, timezone

import pandas as pd

ARQ_PROGRAMACAO = "programacao_maquinas.json"
ARQ_LOTES = "mudancas_datas.json"
MAX_ORDENS_LOTE = 300           # trava contra uma mudança em massa por engano

RASCUNHO, SOLICITADA, EM_EXECUCAO, CONCLUIDA, COM_ERROS, CANCELADA = (
    "rascunho", "solicitada", "em_execucao", "concluida", "com_erros", "cancelada")
ROTULO_STATUS = {SOLICITADA: "Aguardando o robô do SAP", EM_EXECUCAO: "Em execução no SAP",
                 CONCLUIDA: "Concluída", COM_ERROS: "Concluída com erros", CANCELADA: "Cancelada",
                 RASCUNHO: "Rascunho"}
ABERTOS = (SOLICITADA, EM_EXECUCAO)

ESCOPO_ATE_DIA = "Atrasadas e até o dia escolhido"
ESCOPO_PERIODO = "Só as do período do calendário"
ESCOPO_TODAS = "Todas as pendentes da máquina"
ESCOPOS = [ESCOPO_ATE_DIA, ESCOPO_PERIODO, ESCOPO_TODAS]

COLS_PROPOSTA = ["Mudar", "Ordem", "Campo de ordenação", "Máquina", "Texto", "Tipo", "Natureza", "Situação",
                 "Início atual", "Fim atual", "Novo início", "Novo fim"]


def _agora() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def _iso(d) -> str:
    return "" if d is None or pd.isna(d) else pd.Timestamp(d).date().isoformat()


# ----------------------------------------------------------------------------
# Máquinas (campos de ordenação)
# ----------------------------------------------------------------------------
def maquinas(ordens: pd.DataFrame | None, equip: pd.DataFrame | None = None) -> pd.DataFrame:
    """Campos de ordenação com nome (IH08 ou o objeto técnico mais comum) e nº de ordens pendentes."""
    cols = ["Campo de ordenação", "Máquina", "Pendentes", "Rótulo"]
    if ordens is None or not len(ordens) or "Campo de ordenação" not in ordens:
        return pd.DataFrame(columns=cols)
    o = ordens.assign(Campo=ordens["Campo de ordenação"].astype(object).fillna("").astype(str).str.strip())
    o = o[o["Campo"] != ""]
    pend = o["Situação"].isin(["Aberta", "Liberada"]) if "Situação" in o else pd.Series(False, index=o.index)
    nome = {}
    if equip is not None and len(equip) and "Equipamento" in equip and "Denominação" in equip:
        nome = dict(zip(equip["Equipamento"].astype(str), equip["Denominação"].astype(str)))
    objeto = (o.assign(Obj=o["Objeto técnico"].astype(object).fillna("").astype(str))
              .groupby("Campo")["Obj"].agg(lambda s: s[s != ""].mode().iat[0] if (s != "").any() else ""))
    t = pd.DataFrame({"Campo de ordenação": sorted(o["Campo"].unique())})
    t["Máquina"] = t["Campo de ordenação"].map(lambda c: nome.get(c) or objeto.get(c, ""))
    t["Pendentes"] = t["Campo de ordenação"].map(o[pend].groupby("Campo").size()).fillna(0).astype(int)
    t["Rótulo"] = t["Campo de ordenação"] + t["Máquina"].map(lambda n: f" · {n[:40]}" if n else "")
    return t.sort_values(["Pendentes", "Campo de ordenação"], ascending=[False, True]).reset_index(drop=True)[cols]


# ----------------------------------------------------------------------------
# Proposta
# ----------------------------------------------------------------------------
def propor(ordens: pd.DataFrame, programacao: dict[str, list[str]], escopo: str = ESCOPO_ATE_DIA,
           ini: date | None = None, fim: date | None = None, concluidas: set[str] | None = None,
           nomes: dict[str, str] | None = None) -> tuple[pd.DataFrame, list[str]]:
    """Ordens pendentes de cada máquina programada → novo início = dia escolhido (fim anda junto).

    Devolve (proposta, avisos). `concluidas` = ordens já encerradas pela IW47 (o IW38 pode estar
    desatualizado). Uma máquina em dois dias fica no primeiro (com aviso)."""
    avisos: list[str] = []
    concluidas = concluidas or set()
    nomes = nomes or {}
    dia_da_maquina: dict[str, date] = {}
    for dia_txt in sorted(programacao):
        dia = date.fromisoformat(dia_txt)
        for campo in programacao[dia_txt] or []:
            campo = str(campo).strip()
            if not campo:
                continue
            if campo in dia_da_maquina and dia_da_maquina[campo] != dia:
                avisos.append(f"{campo} está em {dia_da_maquina[campo]:%d/%m} e em {dia:%d/%m}: vale o primeiro dia.")
                continue
            dia_da_maquina[campo] = dia
    if not dia_da_maquina or ordens is None or not len(ordens):
        return pd.DataFrame(columns=COLS_PROPOSTA), avisos

    o = ordens.copy()
    o["Campo de ordenação"] = o["Campo de ordenação"].astype(object).fillna("").astype(str).str.strip()
    o = o[o["Campo de ordenação"].isin(dia_da_maquina)]
    o = o[o["Situação"].isin(["Aberta", "Liberada"]) & ~o["Ordem"].isin(concluidas)]
    o["Dia escolhido"] = o["Campo de ordenação"].map(dia_da_maquina)
    inicio = pd.to_datetime(o["Início"]).dt.normalize()
    alvo = pd.to_datetime(o["Dia escolhido"])
    if escopo == ESCOPO_ATE_DIA:
        o = o[inicio.isna() | (inicio <= alvo)]
    elif escopo == ESCOPO_PERIODO and ini and fim:
        o = o[inicio.notna() & (inicio >= pd.Timestamp(ini)) & (inicio <= pd.Timestamp(fim))]
    if not len(o):
        return pd.DataFrame(columns=COLS_PROPOSTA), avisos

    ini_atual = pd.to_datetime(o["Início"]).dt.normalize()
    fim_atual = pd.to_datetime(o["Fim"]).dt.normalize() if "Fim" in o else pd.Series(pd.NaT, index=o.index)
    duracao = (fim_atual - ini_atual).where(fim_atual.notna() & ini_atual.notna() & (fim_atual >= ini_atual),
                                            pd.Timedelta(0))
    novo_ini = pd.to_datetime(o["Dia escolhido"])
    p = pd.DataFrame({
        "Mudar": True, "Ordem": o["Ordem"].astype(str), "Campo de ordenação": o["Campo de ordenação"],
        "Máquina": o["Campo de ordenação"].map(nomes).fillna(o.get("Objeto técnico", "")),
        "Texto": o.get("Texto", ""), "Tipo": o.get("Tipo", ""), "Natureza": o.get("Natureza", ""),
        "Situação": o["Situação"], "Início atual": ini_atual, "Fim atual": fim_atual,
        "Novo início": novo_ini, "Novo fim": novo_ini + duracao,
    })
    p = p[p["Início atual"].isna() | (p["Início atual"] != p["Novo início"])]   # já está no dia: nada a fazer
    for c in ["Texto", "Tipo", "Natureza", "Máquina"]:
        p[c] = p[c].astype(object).where(p[c].notna(), "").astype(str)
    return p.sort_values(["Novo início", "Campo de ordenação", "Ordem"]).reset_index(drop=True)[COLS_PROPOSTA], avisos


# ----------------------------------------------------------------------------
# Lotes
# ----------------------------------------------------------------------------
def novo_lote(proposta: pd.DataFrame, usuario: str, simular: bool = False, origem: str = "") -> tuple[str, dict]:
    """Lote a partir das linhas marcadas em "Mudar" da proposta."""
    marcadas = proposta[proposta["Mudar"].fillna(False).astype(bool)]
    if not len(marcadas):
        raise ValueError("Nenhuma ordem marcada para mudar.")
    if len(marcadas) > MAX_ORDENS_LOTE:
        raise ValueError(f"São {len(marcadas)} ordens; o limite por lote é {MAX_ORDENS_LOTE}. Divida a programação.")
    itens = [{"ordem": str(r["Ordem"]), "campo": str(r["Campo de ordenação"]), "maquina": str(r.get("Máquina", "")),
              "de_inicio": _iso(r["Início atual"]), "de_fim": _iso(r["Fim atual"]),
              "para_inicio": _iso(r["Novo início"]), "para_fim": _iso(r["Novo fim"]) or _iso(r["Novo início"]),
              "resultado": "", "mensagem": ""} for _, r in marcadas.iterrows()]
    lote_id = datetime.now().strftime("%Y%m%d-%H%M%S-") + uuid.uuid4().hex[:4]
    return lote_id, {"criado_em": _agora(), "criado_por": usuario, "status": SOLICITADA, "simular": bool(simular),
                     "origem": origem, "itens": itens, "resumo": ""}


def lote_desfazer(lote: dict, usuario: str) -> tuple[str, dict]:
    """Lote que devolve as datas antigas das ordens alteradas com sucesso."""
    itens = [it for it in lote.get("itens", []) if it.get("resultado") == "ok" and it.get("de_inicio")]
    if not itens:
        raise ValueError("Nada para desfazer neste lote (nenhuma ordem alterada com sucesso).")
    p = pd.DataFrame({
        "Mudar": True, "Ordem": [i["ordem"] for i in itens], "Campo de ordenação": [i["campo"] for i in itens],
        "Máquina": [i.get("maquina", "") for i in itens],
        "Início atual": pd.to_datetime([i["para_inicio"] for i in itens]),
        "Fim atual": pd.to_datetime([i.get("para_fim") or i["para_inicio"] for i in itens]),
        "Novo início": pd.to_datetime([i["de_inicio"] for i in itens]),
        "Novo fim": pd.to_datetime([i.get("de_fim") or i["de_inicio"] for i in itens]),
    })
    return novo_lote(p, usuario, simular=False, origem="desfazer")


def job(lote_id: str, lote: dict) -> dict:
    """O que o robô recebe: só ordem e datas (nada de dados pessoais)."""
    return {"lote": lote_id, "simular": bool(lote.get("simular")),
            "itens": [{"ordem": i["ordem"], "inicio": i["para_inicio"], "fim": i["para_fim"]}
                      for i in lote.get("itens", []) if not i.get("resultado")]}


def aplicar_resultado(lote: dict, resultado: dict) -> dict:
    """Junta o resultado do robô ({"lote", "itens": [{"ordem", "ok", "mensagem", "inicio_sap"...}], "erro"})."""
    novo = {**lote, "itens": [dict(i) for i in lote.get("itens", [])]}
    por_ordem = {str(r["ordem"]): r for r in resultado.get("itens", [])}
    for it in novo["itens"]:
        r = por_ordem.get(it["ordem"])
        if r is None:
            continue
        it["resultado"] = "ok" if r.get("ok") else "erro"
        it["mensagem"] = str(r.get("mensagem", ""))
        if r.get("inicio_sap"):          # data que estava no SAP antes da mudança (mais confiável que o IW38)
            it["de_inicio"] = r["inicio_sap"]
        if r.get("fim_sap"):
            it["de_fim"] = r["fim_sap"]
    ok = sum(1 for i in novo["itens"] if i["resultado"] == "ok")
    erro = sum(1 for i in novo["itens"] if i["resultado"] == "erro")
    falta = sum(1 for i in novo["itens"] if not i["resultado"])
    if resultado.get("erro") and not ok and not erro:
        novo["status"] = COM_ERROS
        novo["resumo"] = f"O robô não conseguiu começar: {resultado['erro']}"
    else:
        novo["status"] = CONCLUIDA if not erro and not falta and not resultado.get("erro") else COM_ERROS
        acao = "simuladas" if lote.get("simular") else "alteradas"
        novo["resumo"] = (f"{ok} ordem(ns) {acao}" + (f", {erro} com erro" if erro else "")
                          + (f", {falta} não processada(s)" if falta else "")
                          + (f" · {resultado['erro']}" if resultado.get("erro") else ""))
    novo["executado_em"] = resultado.get("fim") or _agora()
    return novo


def tabela_lotes(lotes: dict) -> pd.DataFrame:
    linhas = []
    for lid, lote in lotes.items():
        if not isinstance(lote, dict):
            continue
        itens = lote.get("itens", [])
        linhas.append({"Lote": lid, "Criado em": pd.to_datetime(lote.get("criado_em"), utc=True, errors="coerce"),
                       "Por": lote.get("criado_por", ""), "Situação": ROTULO_STATUS.get(lote.get("status"), lote.get("status")),
                       "Simulação": bool(lote.get("simular")), "Origem": lote.get("origem") or "calendário",
                       "Ordens": len(itens), "OK": sum(1 for i in itens if i.get("resultado") == "ok"),
                       "Erros": sum(1 for i in itens if i.get("resultado") == "erro"), "Resumo": lote.get("resumo", "")})
    t = pd.DataFrame(linhas, columns=["Lote", "Criado em", "Por", "Situação", "Simulação", "Origem", "Ordens", "OK",
                                      "Erros", "Resumo"])
    if len(t):
        t["Criado em"] = t["Criado em"].dt.tz_convert("America/Sao_Paulo").dt.tz_localize(None)
    return t.sort_values("Criado em", ascending=False).reset_index(drop=True)


def programacao_valida(prog: dict) -> dict[str, list[str]]:
    """Só datas ISO válidas com lista de campos não vazia (o cadastro guarda metadados junto)."""
    saida = {}
    for k, v in (prog or {}).items():
        try:
            date.fromisoformat(k)
        except (TypeError, ValueError):
            continue
        campos = v.get("campos") if isinstance(v, dict) else v
        campos = [str(c).strip() for c in (campos or []) if str(c).strip()]
        if campos:
            saida[k] = campos
    return saida


def dias(ini: date, fim: date, maximo: int = 14) -> list[date]:
    n = min((fim - ini).days + 1, maximo)
    return [ini + timedelta(days=i) for i in range(max(n, 0))]
