"""Programação do mês (previsão manual) e mudança de datas no SAP pela IW38.

Pandas puro (testado em tests/test_mudanca_datas.py). Fluxo:

1. Programação do mês: calendário à parte do calendário principal (IW38), 100% manual. Em cada dia a
   pessoa digita os campos de ordenação (máquinas); o site mostra o nome do ativo (IH08/IW38).
   Fica no cadastro `programacao_maquinas.json` ({"AAAA-MM-DD": {"campos": [...]}}).
2. Pedido ao robô: uma consulta na IW38 por dia — campos de ordenação pela seleção múltipla (seta à
   direita) e o período das ordens que vão para aquele dia (do início do mês, ou desde sempre com as
   atrasadas, até o dia; a última parada da máquina no mês leva também o resto do mês).
3. O robô (automacao/robo_sap.py --mudar-datas) abre cada ordem da lista e põe início-base e fim-base
   na data do calendário. O resultado de cada ordem (com as datas antigas) volta para o lote em
   `mudancas_datas.json`, atualiza o calendário principal na hora e permite desfazer.
"""

from __future__ import annotations

import re
import uuid
from calendar import monthrange
from datetime import date, datetime, timedelta, timezone

import pandas as pd

ARQ_PROGRAMACAO = "programacao_maquinas.json"
ARQ_LOTES = "mudancas_datas.json"
ARQ_ROBO_PC = "robo_pc.json"    # sinal de vida do sincronizador de cada PC (versão, robô configurado…)
DIAGNOSTICO = "diagnostico"     # tipo do lote "Testar o robô"
RECURSOS_NECESSARIOS = ("mudar_datas_iw38", "diagnostico")
SINAL_MAX_MIN = 45              # sem sinal há mais que isso = PC desligado ou sincronizador parado
MAX_ORDENS_LOTE = 300           # trava contra uma mudança em massa por engano (o robô para aqui)
DESDE_SEMPRE = date(2000, 1, 1)

RASCUNHO, SOLICITADA, EM_EXECUCAO, CONCLUIDA, COM_ERROS, CANCELADA = (
    "rascunho", "solicitada", "em_execucao", "concluida", "com_erros", "cancelada")
ROTULO_STATUS = {SOLICITADA: "Aguardando o robô do SAP", EM_EXECUCAO: "Em execução no SAP",
                 CONCLUIDA: "Concluída", COM_ERROS: "Concluída com erros", CANCELADA: "Cancelada",
                 RASCUNHO: "Rascunho"}
ABERTOS = (SOLICITADA, EM_EXECUCAO)
MESES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro",
         "Novembro", "Dezembro"]


def _agora() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def _iso(d) -> str:
    return "" if d is None or pd.isna(d) else pd.Timestamp(d).date().isoformat()


def fim_do_mes(d: date) -> date:
    return date(d.year, d.month, monthrange(d.year, d.month)[1])


# ----------------------------------------------------------------------------
# Programação manual
# ----------------------------------------------------------------------------
def separar_campos(texto: str) -> list[str]:
    """ "41020389, 41019661;41020389" → ["41020389", "41019661"] (vírgula, ponto e vírgula, espaço ou linha)."""
    vistos: list[str] = []
    for c in re.split(r"[\s,;]+", str(texto or "").strip()):
        c = c.strip().upper()
        if c and c not in vistos:
            vistos.append(c)
    return vistos


def programacao_valida(prog: dict) -> dict[str, list[str]]:
    """Só datas ISO válidas com lista de campos não vazia (o cadastro guarda metadados junto)."""
    saida = {}
    for k, v in (prog or {}).items():
        try:
            date.fromisoformat(k)
        except (TypeError, ValueError):
            continue
        campos = v.get("campos") if isinstance(v, dict) else v
        campos = separar_campos(" ".join(str(c) for c in (campos or [])))
        if campos:
            saida[k] = campos
    return saida


def nomes_de_ativos(ordens: pd.DataFrame | None = None, equip: pd.DataFrame | None = None) -> dict[str, str]:
    """Código (campo de ordenação / equipamento) → nome do ativo: IH08 primeiro; senão o objeto técnico
    mais comum das ordens do IW38 com aquele campo de ordenação ou equipamento."""
    nomes: dict[str, str] = {}
    if ordens is not None and len(ordens) and "Objeto técnico" in ordens:
        obj = ordens["Objeto técnico"].astype(object).fillna("").astype(str)
        for col in ("Equipamento", "Campo de ordenação"):      # o campo de ordenação vence o equipamento
            if col not in ordens:
                continue
            chave = ordens[col].astype(object).fillna("").astype(str).str.strip().str.upper()
            t = pd.DataFrame({"c": chave, "o": obj})
            t = t[(t["c"] != "") & (t["o"] != "")]
            nomes.update(t.groupby("c")["o"].agg(lambda s: s.mode().iat[0]).to_dict())
    if equip is not None and len(equip) and {"Equipamento", "Denominação"} <= set(equip.columns):
        e = equip[equip["Denominação"].astype(str).str.strip() != ""]
        nomes.update(dict(zip(e["Equipamento"].astype(str).str.strip().str.upper(), e["Denominação"].astype(str))))
    return nomes


# ----------------------------------------------------------------------------
# Pedido ao robô: uma consulta na IW38 por dia e janela de datas
# ----------------------------------------------------------------------------
def consultas(programacao: dict[str, list[str]], ini: date, fim: date, atrasadas: bool = False) -> list[dict]:
    """Consultas da IW38 para os dias de [ini, fim]: {"dia", "campos", "de", "ate"}.

    Para cada máquina, as paradas do mês dividem o mês: cada dia recebe as ordens com data desde o dia
    seguinte à parada anterior (ou o início do mês; com `atrasadas`, desde sempre) até ele; a última
    parada do mês leva também as ordens até o fim do mês."""
    por_campo: dict[str, list[date]] = {}
    for dia_txt, campos in programacao.items():
        for c in campos:
            por_campo.setdefault(c, []).append(date.fromisoformat(dia_txt))
    grupos: dict[tuple[date, date, date], list[str]] = {}
    for campo, dias_c in por_campo.items():
        for mes in {(d.year, d.month) for d in dias_c}:
            paradas = sorted(d for d in set(dias_c) if (d.year, d.month) == mes)
            for i, d in enumerate(paradas):
                if not ini <= d <= fim:
                    continue
                de = paradas[i - 1] + timedelta(days=1) if i else (DESDE_SEMPRE if atrasadas else d.replace(day=1))
                ate = d if i < len(paradas) - 1 else fim_do_mes(d)
                grupos.setdefault((d, de, ate), []).append(campo)
    return [{"dia": d.isoformat(), "campos": sorted(c), "de": de.isoformat(), "ate": ate.isoformat()}
            for (d, de, ate), c in sorted(grupos.items())]


def estimativa(ordens: pd.DataFrame | None, cons: list[dict], concluidas: set[str] | None = None,
               nomes: dict[str, str] | None = None) -> pd.DataFrame:
    """Prévia pelo IW38 exportado: ordens abertas/liberadas que cada consulta deve trazer (o robô consulta
    a IW38 na hora, então o resultado real pode ser outro)."""
    cols = ["Dia", "Ordem", "Campo de ordenação", "Ativo", "Texto", "Tipo", "Situação", "Início atual", "Fim atual"]
    if ordens is None or not len(ordens) or not cons or "Campo de ordenação" not in ordens:
        return pd.DataFrame(columns=cols)
    concluidas, nomes = concluidas or set(), nomes or {}
    o = ordens.copy()
    o["Campo de ordenação"] = o["Campo de ordenação"].astype(object).fillna("").astype(str).str.strip().str.upper()
    o = o[o["Situação"].isin(["Aberta", "Liberada"]) & ~o["Ordem"].isin(concluidas)]
    ini_o = pd.to_datetime(o["Início"]).dt.normalize()
    partes = []
    for c in cons:
        m = o["Campo de ordenação"].isin(c["campos"]) & (ini_o >= pd.Timestamp(c["de"])) & (ini_o <= pd.Timestamp(c["ate"]))
        sel = o[m]
        if len(sel):
            partes.append(pd.DataFrame({
                "Dia": pd.Timestamp(c["dia"]), "Ordem": sel["Ordem"].astype(str), "Campo de ordenação": sel["Campo de ordenação"],
                "Ativo": sel["Campo de ordenação"].map(nomes).fillna(""), "Texto": sel.get("Texto", ""),
                "Tipo": sel.get("Tipo", ""), "Situação": sel["Situação"], "Início atual": ini_o[m],
                "Fim atual": pd.to_datetime(sel["Fim"]).dt.normalize() if "Fim" in sel else pd.NaT}))
    if not partes:
        return pd.DataFrame(columns=cols)
    t = pd.concat(partes, ignore_index=True)
    for c in ["Texto", "Tipo", "Ativo"]:
        t[c] = t[c].astype(object).where(t[c].notna(), "").astype(str)
    return t.sort_values(["Dia", "Campo de ordenação", "Ordem"]).reset_index(drop=True)[cols]


# ----------------------------------------------------------------------------
# Lotes
# ----------------------------------------------------------------------------
def _novo_id() -> str:
    return datetime.now().strftime("%Y%m%d-%H%M%S-") + uuid.uuid4().hex[:4]


def novo_lote(cons: list[dict], usuario: str, simular: bool = False, atrasadas: bool = False) -> tuple[str, dict]:
    """Lote da programação do mês: as consultas da IW38 (as ordens só se sabem quando o robô consultar)."""
    if not cons:
        raise ValueError("Nenhum dia com campo de ordenação no período escolhido.")
    return _novo_id(), {"criado_em": _agora(), "criado_por": usuario, "status": SOLICITADA, "simular": bool(simular),
                        "origem": "programação do mês", "atrasadas": bool(atrasadas), "consultas": cons,
                        "itens": [], "resumo": ""}


def lote_desfazer(lote: dict, usuario: str) -> tuple[str, dict]:
    """Lote que devolve as datas antigas das ordens alteradas com sucesso (ordem a ordem, sem IW38)."""
    itens = [it for it in lote.get("itens", []) if it.get("resultado") == "ok" and it.get("de_inicio")]
    if not itens:
        raise ValueError("Nada para desfazer neste lote (nenhuma ordem alterada com sucesso).")
    novos = [{"ordem": i["ordem"], "campo": i.get("campo", ""), "dia": i.get("de_inicio", ""),
              "de_inicio": i.get("para_inicio", ""), "de_fim": i.get("para_fim", ""),
              "para_inicio": i["de_inicio"], "para_fim": i.get("de_fim") or i["de_inicio"],
              "resultado": "", "mensagem": ""} for i in itens]
    return _novo_id(), {"criado_em": _agora(), "criado_por": usuario, "status": SOLICITADA, "simular": False,
                        "origem": "desfazer", "consultas": [], "itens": novos, "resumo": ""}


def novo_diagnostico(usuario: str, campo: str = "", ordem: str = "", de: date | None = None,
                     ate: date | None = None) -> tuple[str, dict]:
    """Lote "Testar o robô": o robô confere cada passo (SAP, IW38, seta à direita, caixas, período) sem alterar
    nada; com campo de ordenação faz uma busca de verdade na IW38 e com ordem lê as datas dela na IW33."""
    teste = {k: v for k, v in {"campo": separar_campos(campo)[0] if separar_campos(campo) else "",
                               "ordem": re.sub(r"\D", "", str(ordem or "")),
                               "de": de.isoformat() if de else "", "ate": ate.isoformat() if ate else ""}.items() if v}
    return _novo_id(), {"criado_em": _agora(), "criado_por": usuario, "status": SOLICITADA, "simular": True,
                        "tipo": DIAGNOSTICO, "origem": "teste do robô", "teste": teste, "consultas": [],
                        "itens": [], "resumo": ""}


def job(lote_id: str, lote: dict) -> dict:
    """O que o robô recebe: consultas da IW38 e/ou ordens com as datas novas (nada de dados pessoais)."""
    if lote.get("tipo") == DIAGNOSTICO:
        return {"lote": lote_id, "tipo": DIAGNOSTICO, "teste": lote.get("teste", {})}
    return {"lote": lote_id, "simular": bool(lote.get("simular")), "consultas": lote.get("consultas", []),
            "itens": [{"ordem": i["ordem"], "inicio": i["para_inicio"], "fim": i["para_fim"]}
                      for i in lote.get("itens", []) if not i.get("resultado")]}


def progresso(parcial: dict) -> dict:
    """Andamento do robô para o site (o sincronizador grava no lote enquanto o robô roda)."""
    if parcial.get("tipo") == DIAGNOSTICO:
        return {"texto": f"testando: {len(parcial.get('etapas', []))} etapa(s) feitas", "feitas": 0, "total": 0}
    feitas, total = len(parcial.get("itens", [])), int(parcial.get("total") or 0)
    if parcial.get("aguardando"):
        texto = parcial["aguardando"]
    else:
        texto = f"{feitas} de {total} ordem(ns) · {len(parcial.get('consultas', []))} consulta(s) na IW38"
    return {"texto": texto, "feitas": feitas, "total": total, "em": _agora()}


def aplicar_diagnostico(lote: dict, resultado: dict) -> dict:
    etapas = list(resultado.get("etapas", []))
    novo = {**lote, "etapas": etapas, "campos_tela": list(resultado.get("campos_tela", []))[:200],
            "ordens_encontradas": list(resultado.get("ordens_encontradas", []))[:100],
            "versao_robo": resultado.get("versao", ""), "executado_em": resultado.get("fim") or _agora()}
    novo.pop("progresso", None)
    falhas = [e for e in etapas if not e.get("ok")]
    if resultado.get("erro") and not etapas:
        novo["status"], novo["resumo"] = COM_ERROS, f"O robô não terminou: {resultado['erro']}"
    elif falhas or resultado.get("erro"):
        primeira = falhas[0] if falhas else {"etapa": "robô", "detalhe": resultado.get("erro", "")}
        novo["status"] = COM_ERROS
        novo["resumo"] = (f"Teste do robô: {len(etapas) - len(falhas)} de {len(etapas)} etapa(s) ok · falhou "
                          f"\"{primeira['etapa']}\": {str(primeira['detalhe'])[:200]}")
    else:
        novo["status"], novo["resumo"] = CONCLUIDA, f"Teste do robô: tudo certo ({len(etapas)} etapas)"
    return novo


def aplicar_resultado(lote: dict, resultado: dict) -> dict:
    """Junta o resultado do robô ({"itens": [{"ordem", "dia", "campo", "ok", "mensagem", "inicio_sap", "fim_sap"}],
    "consultas": [{"dia", "encontradas", "erro"}], "erro"}). Ordens trazidas pela IW38 entram no lote aqui."""
    if lote.get("tipo") == DIAGNOSTICO:
        return aplicar_diagnostico(lote, resultado)
    novo = {**lote, "itens": [dict(i) for i in lote.get("itens", [])]}
    novo.pop("progresso", None)
    por_ordem = {i["ordem"]: i for i in novo["itens"]}
    for r in resultado.get("itens", []):
        ordem = str(r["ordem"])
        it = por_ordem.get(ordem)
        if it is None:
            dia = r.get("dia", "")
            it = {"ordem": ordem, "campo": r.get("campo", ""), "dia": dia, "de_inicio": "", "de_fim": "",
                  "para_inicio": dia, "para_fim": r.get("fim") or dia, "resultado": "", "mensagem": ""}
            novo["itens"].append(it)
            por_ordem[ordem] = it
        it["resultado"] = "ok" if r.get("ok") else "erro"
        it["mensagem"] = str(r.get("mensagem", ""))
        if r.get("inicio_sap"):          # data que estava no SAP antes da mudança (mais confiável que o IW38)
            it["de_inicio"] = r["inicio_sap"]
        if r.get("fim_sap"):
            it["de_fim"] = r["fim_sap"]
    if resultado.get("consultas"):
        novo["consultas_resultado"] = resultado["consultas"]
    ok = sum(1 for i in novo["itens"] if i["resultado"] == "ok")
    erro = sum(1 for i in novo["itens"] if i["resultado"] == "erro")
    falta = sum(1 for i in novo["itens"] if not i["resultado"])
    erros_consulta = [c for c in resultado.get("consultas", []) if c.get("erro")]
    acao = "simuladas" if lote.get("simular") else "alteradas"
    partes = [f"{ok} ordem(ns) {acao}"] + ([f"{erro} com erro"] if erro else []) + \
        ([f"{falta} não processada(s)"] if falta else []) + \
        ([f"{len(erros_consulta)} consulta(s) da IW38 com erro"] if erros_consulta else [])
    if resultado.get("erro") and not ok and not erro:
        novo["status"], novo["resumo"] = COM_ERROS, f"O robô não terminou: {resultado['erro']}"
    else:
        novo["status"] = COM_ERROS if (erro or falta or erros_consulta or resultado.get("erro")) else CONCLUIDA
        novo["resumo"] = ", ".join(partes) + (f" · {resultado['erro']}" if resultado.get("erro") else "")
    novo["executado_em"] = resultado.get("fim") or _agora()
    return novo


def datas_alteradas(lotes: dict, depois_de: datetime | None = None) -> dict[str, tuple[str, str]]:
    """Ordem → (início, fim) gravados pelo robô depois do último export do IW38 (o calendário principal
    usa estas datas até o próximo export trazer a mudança)."""
    saida: dict[str, tuple[str, str]] = {}
    executados = []
    for lote in lotes.values():
        if not isinstance(lote, dict) or lote.get("simular") or not lote.get("executado_em"):
            continue
        quando = pd.to_datetime(lote["executado_em"], utc=True, errors="coerce")
        if pd.isna(quando) or (depois_de is not None and quando <= pd.Timestamp(depois_de).tz_convert("UTC")):
            continue
        executados.append((quando, lote))
    for _, lote in sorted(executados, key=lambda x: x[0]):
        for it in lote.get("itens", []):
            if it.get("resultado") == "ok" and it.get("para_inicio"):
                saida[it["ordem"]] = (it["para_inicio"], it.get("para_fim") or it["para_inicio"])
    return saida


def tabela_lotes(lotes: dict) -> pd.DataFrame:
    linhas = []
    for lid, lote in lotes.items():
        if not isinstance(lote, dict):
            continue
        itens = lote.get("itens", [])
        dias = sorted({c["dia"] for c in lote.get("consultas", [])})
        linhas.append({"Lote": lid, "Criado em": pd.to_datetime(lote.get("criado_em"), utc=True, errors="coerce"),
                       "Por": lote.get("criado_por", ""),
                       "Situação": ROTULO_STATUS.get(lote.get("status"), lote.get("status")),
                       "Simulação": bool(lote.get("simular")) and lote.get("tipo") != DIAGNOSTICO,
                       "Origem": lote.get("origem") or "",
                       "Dias": ", ".join(pd.Timestamp(d).strftime("%d/%m") for d in dias),
                       "Ordens": len(itens), "OK": sum(1 for i in itens if i.get("resultado") == "ok"),
                       "Erros": sum(1 for i in itens if i.get("resultado") == "erro"),
                       "Resumo": lote.get("resumo", "")})
    t = pd.DataFrame(linhas, columns=["Lote", "Criado em", "Por", "Situação", "Simulação", "Origem", "Dias", "Ordens",
                                      "OK", "Erros", "Resumo"])
    if len(t):
        t["Criado em"] = t["Criado em"].dt.tz_convert("America/Sao_Paulo").dt.tz_localize(None)
    return t.sort_values("Criado em", ascending=False).reset_index(drop=True)


# ----------------------------------------------------------------------------
# Situação do robô (sinal de vida que o sincronizador de cada PC grava em robo_pc.json)
# ----------------------------------------------------------------------------
def situacao_robo(sinais: dict, agora: datetime | None = None) -> list[dict]:
    """Um item por PC, do mais recente para o mais antigo: {"pc", "estado", "texto", "visto_min", ...}.

    estado: "ok" (pronto), "desatualizado", "nao_configurado" (sincronizador sem o robô do SAP) ou "offline"."""
    agora = agora or datetime.now(timezone.utc)
    saida = []
    for pc, s in (sinais or {}).items():
        if not isinstance(s, dict):
            continue
        try:
            visto = datetime.fromisoformat(s.get("visto_em", ""))
            minutos = max(0, int((agora - visto).total_seconds() // 60))
        except (TypeError, ValueError):
            minutos = 10 ** 6
        faltam = [r for r in RECURSOS_NECESSARIOS if r not in (s.get("recursos") or [])]
        versao = s.get("versao_codigo") or "?"
        if minutos > SINAL_MAX_MIN:
            estado = "offline"
            texto = f"sem sinal há {tempo(minutos)} (PC desligado, Windows sem ninguém logado ou sincronizador parado)"
        elif faltam:
            estado, texto = "desatualizado", "código antigo neste PC — rode o atualizar.bat (pasta do sistema)"
        elif not s.get("robo_configurado"):
            estado = "nao_configurado"
            texto = "sincronizador ligado, mas o robô do SAP não está configurado (rode automacao\\configurar_robo.bat)"
        else:
            estado, texto = "ok", f"pronto · visto há {tempo(minutos)}"
        saida.append({"pc": pc, "estado": estado, "texto": texto, "visto_min": minutos, "versao": versao,
                      "versao_robo": s.get("versao_robo", "?"), "atualizacao_auto": bool(s.get("atualizacao_auto")),
                      "ocupado": s.get("ocupado", "")})
    return sorted(saida, key=lambda x: x["visto_min"])


def tempo(minutos: int) -> str:
    if minutos < 1:
        return "menos de 1 min"
    if minutos < 120:
        return f"{minutos} min"
    if minutos < 48 * 60:
        return f"{minutos // 60} h"
    return f"{minutos // 1440} dia(s)" if minutos < 10 ** 6 else "muito tempo"


def parado_ha(lote: dict, agora: datetime | None = None) -> int | None:
    """Minutos desde a última notícia de um lote aberto (criado, pego pelo robô ou andamento)."""
    agora = agora or datetime.now(timezone.utc)
    marcas = [lote.get("atualizado_em"), lote.get("iniciado_em"), lote.get("criado_em"),
              (lote.get("progresso") or {}).get("em")]
    datas = []
    for m in marcas:
        try:
            datas.append(datetime.fromisoformat(m))
        except (TypeError, ValueError):
            continue
    return int((agora - max(datas)).total_seconds() // 60) if datas else None
