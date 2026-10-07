"""Indicadores WCM do pilar Manutenção Profissional.

Tudo aqui é pandas puro (sem Streamlit), a partir das bases já preparadas:
IW38 (ordens), IW38OP (operações/HH), IW28 (notas/quebras), IP19 (chamadas dos
planos), MB52 (estoque), requisições e o Gerenciador de AF (análises de falha e ações). Cada indicador tem fórmula descrita,
sentido (maior ou menor é melhor), meta padrão (editável no site) e farol.

Convenções:
- Quebra = nota da IW28 marcada com parada de máquina.
- Horas de reparo de uma ordem = Σ (trabalho da operação ÷ nº de pessoas) no IW38OP;
  quando a nota traz a duração da parada, ela vale no lugar.
- Data de conclusão de uma ordem = maior "data do fim real" das operações concluídas.
- Backlog = ordens pendentes (abertas, liberadas ou encerradas sem confirmação)
  com data-base de início até hoje.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date

import numpy as np
import pandas as pd

from . import af, preditiva

PENDENTES = ("Aberta", "Liberada", "Encerrada sem confirmação")

CONFIABILIDADE, PLANEJAMENTO, ANALISE_FALHA, MAO_DE_OBRA, CUSTOS, SUPRIMENTOS = (
    "Confiabilidade", "Planejamento e controle", "Análise de falhas (AF)", "Mão de obra", "Custos", "Suprimentos")
PREDITIVA = "Preditiva (SEMEQ)"
GRUPOS = [CONFIABILIDADE, PREDITIVA, PLANEJAMENTO, ANALISE_FALHA, MAO_DE_OBRA, CUSTOS, SUPRIMENTOS]

P_PAINEL, P_CONF, P_ORDENS, P_PLANOS, P_NOTAS, P_HH, P_CUSTOS, P_ESTOQUE, P_REQ = (
    "paginas/painel.py", "paginas/confiabilidade.py", "paginas/ordens.py", "paginas/planos.py", "paginas/notas.py",
    "paginas/mao_de_obra.py", "paginas/custos.py", "paginas/estoque.py", "paginas/requisicoes.py")
P_AF_PLANOS, P_AF_ACOES = "paginas/af_planos.py", "paginas/af_acoes.py"
P_PREDITIVA = "paginas/preditiva.py"


@dataclass(frozen=True)
class Kpi:
    id: str
    nome: str
    unidade: str           # "%", "h", "dias", "R$", "un", "sem"
    sentido: int           # +1 maior é melhor · -1 menor é melhor
    meta: float | None     # referência padrão (editável em Metas e parâmetros)
    grupo: str
    pagina: str
    formula: str
    mensal: bool = False   # tem série mês a mês
    foto: bool = False     # retrato de hoje (não depende do período)


KPIS: list[Kpi] = [
    # Confiabilidade
    Kpi("quebras", "Quebras", "un", -1, None, CONFIABILIDADE, P_CONF,
        "Notas da IW28 com parada de máquina no período.", mensal=True),
    Kpi("mtbf", "MTBF", "dias", +1, 60, CONFIABILIDADE, P_CONF,
        "Tempo médio entre falhas: dias do período × equipamentos que quebraram ÷ quebras."),
    Kpi("mttr", "MTTR", "h", -1, 4, CONFIABILIDADE, P_CONF,
        "Tempo médio de reparo por quebra: duração da parada na nota; sem ela, horas reais da ordem da quebra "
        "na IW47 ÷ pessoas que apontaram; sem IW47, Σ(trabalho ÷ pessoas) das operações no IW38OP.", mensal=True),
    Kpi("reincidencia", "Reincidência", "%", -1, 10, CONFIABILIDADE, P_CONF,
        "Quebras em equipamento que já tinha quebrado nos 30 dias anteriores ÷ quebras."),
    Kpi("quebras_a", "Quebras em classe A", "un", -1, None, CONFIABILIDADE, P_CONF,
        "Quebras em equipamentos de código ABC = A (IH08/IW28) ou criticidade Alta no cadastro."),
    # Planejamento e controle
    Kpi("pct_plano", "Manutenção planejada", "%", +1, 80, PLANEJAMENTO, P_ORDENS,
        "Ordens com número de plano de manutenção ÷ ordens do período (canceladas não contam).", mensal=True),
    Kpi("pct_emergencial", "Ordens corretivas emergenciais", "%", -1, 10, PLANEJAMENTO, P_ORDENS,
        "Ordens de tipo classificado como Emergencial ÷ ordens do período. Fica sem valor se o IW38 carregado não "
        "tem nenhum tipo emergencial (exporte o IW38 com todos os tipos).", mensal=True),
    Kpi("aderencia", "Aderência ao plano", "%", +1, 95, PLANEJAMENTO, P_PLANOS,
        "Chamadas da IP19 com data até hoje que foram concluídas ÷ chamadas vencidas (saltadas não contam).",
        mensal=True),
    Kpi("no_prazo", "Ordens concluídas no prazo", "%", +1, 90, PLANEJAMENTO, P_ORDENS,
        "Ordens concluídas cujo fim real (IW38OP) foi até a data-base do fim ÷ ordens concluídas com as duas datas.",
        mensal=True),
    Kpi("backlog_sem", "Backlog", "sem", -1, 3, PLANEJAMENTO, P_HH,
        "HH pendentes das ordens em aberto ÷ capacidade semanal (configurada ou média das últimas 12 semanas).",
        foto=True),
    Kpi("idade_backlog", "Idade média do backlog", "dias", -1, 30, PLANEJAMENTO, P_ORDENS,
        "Média de dias desde a data-base de início das ordens em aberto (até hoje).", foto=True),
    Kpi("notas_7d", "Notas sem ordem > 7 dias", "%", -1, 10, PLANEJAMENTO, P_NOTAS,
        "Notas do período com mais de 7 dias que ainda não viraram ordem ÷ notas do período com mais de 7 dias."),
    # Análise de falhas (Gerenciador de AF · definições da aba RESUMO CORPORATIVO; canceladas não contam)
    Kpi("taxa_quebra_a", "Taxa de análise de quebra crítica (A)", "%", +1, 100, ANALISE_FALHA, P_AF_PLANOS,
        "AFs de criticidade A com data da falha no período já analisadas ÷ AFs de criticidade A com data da falha "
        "no período.", mensal=True),
    Kpi("af_execucao", "Execução de AFs", "%", +1, 100, ANALISE_FALHA, P_AF_PLANOS,
        "AFs com data limite no período (até hoje) analisadas ÷ AFs com data limite no período (até hoje).",
        mensal=True),
    Kpi("af_no_prazo", "AFs analisadas no prazo", "%", +1, 90, ANALISE_FALHA, P_AF_PLANOS,
        "AFs com data limite no período (até hoje) analisadas até a data limite ÷ AFs com data limite no período "
        "(até hoje).", mensal=True),
    Kpi("af_atrasadas", "AFs atrasadas", "un", -1, 0, ANALISE_FALHA, P_AF_PLANOS,
        "AFs ainda não analisadas com a data limite vencida (hoje).", foto=True),
    Kpi("acoes_execucao", "Ações de AFs", "%", +1, 90, ANALISE_FALHA, P_AF_ACOES,
        "Ações de AF com data limite no período (até hoje) realizadas ÷ ações com data limite no período (até hoje).",
        mensal=True),
    Kpi("acoes_no_prazo", "Ações no prazo", "%", +1, 90, ANALISE_FALHA, P_AF_ACOES,
        "Ações de AF com data limite no período (até hoje) realizadas até a data limite ÷ ações com data limite no "
        "período (até hoje).", mensal=True),
    Kpi("acoes_atrasadas", "Ações atrasadas", "un", -1, 0, ANALISE_FALHA, P_AF_ACOES,
        "Ações de AF não realizadas com a data limite vencida (hoje).", foto=True),
    # Preditiva (SEMEQ)
    Kpi("semeq_detectadas", "Anomalias preditivas", "un", -1, None, PREDITIVA, P_PREDITIVA,
        "Anomalias SEMEQ detectadas no período (notas IW28 e ordens IW38 com SEMEQ-<técnica>-<nº> no texto, "
        "pela data de detecção).", mensal=True),
    Kpi("semeq_com_ordem", "Anomalias com ordem", "%", +1, 100, PREDITIVA, P_PREDITIVA,
        "Anomalias SEMEQ do período que já têm ordem de manutenção ÷ anomalias do período (canceladas fora).",
        mensal=True),
    Kpi("semeq_tratadas", "Anomalias tratadas", "%", +1, 90, PREDITIVA, P_PREDITIVA,
        "Anomalias SEMEQ do período com a ordem concluída (CONF + ENTE) ÷ anomalias do período.", mensal=True),
    Kpi("semeq_dias", "Dias para tratar", "dias", -1, 15, PREDITIVA, P_PREDITIVA,
        "Média de dias da detecção até o fim real da ordem (IW38OP) nas anomalias tratadas do período.", mensal=True),
    Kpi("semeq_atrasadas", "Anomalias atrasadas", "un", -1, 0, PREDITIVA, P_PREDITIVA,
        "Anomalias SEMEQ com a ordem em aberto e a data-base do fim já vencida (hoje).", foto=True),
    # Mão de obra
    Kpi("hh", "HH apontadas", "h", +1, None, MAO_DE_OBRA, P_HH,
        "Horas reais apontadas na IW47 no período (data de lançamento; estornos descontados). "
        "Sem IW47: trabalho das operações concluídas no IW38OP.", mensal=True),
    Kpi("utilizacao", "Utilização da mão de obra", "%", +1, 80, MAO_DE_OBRA, P_HH,
        "HH apontadas pelos técnicos da equipe ÷ HH disponíveis (técnicos da Gestão de HH × horas por semana "
        "× semanas do período cobertas pela IW47).", mensal=True),
    Kpi("pct_hh_plano", "HH em manutenção planejada", "%", +1, 70, MAO_DE_OBRA, P_HH,
        "HH apontadas em ordens com número de plano ÷ HH apontadas em ordens que estão no IW38.", mensal=True),
    Kpi("hh_emergencial", "HH em corretiva emergencial", "%", -1, 10, MAO_DE_OBRA, P_HH,
        "HH apontadas em ordens de tipo classificado como Emergencial (ex.: YM11) ÷ HH apontadas em ordens que estão "
        "no IW38. Fica sem valor se o IW38 carregado não tem nenhum tipo emergencial.", mensal=True),
    # Custos
    Kpi("custo", "Custo médio mensal", "R$", -1, None, CUSTOS, P_CUSTOS,
        "Custo real das ordens do período (IW38) ÷ meses do período. A meta é o orçamento mensal.", mensal=True),
    Kpi("pct_custo_corr", "Custo do backlog", "%", -1, 20, CUSTOS, P_CUSTOS,
        "Custo real das ordens sem plano ÷ custo real total.", mensal=True),
    Kpi("custo_medio", "Custo médio por ordem", "R$", -1, None, CUSTOS, P_CUSTOS,
        "Custo real ÷ ordens com custo no período."),
    # Suprimentos
    Kpi("itens_zerados", "Itens zerados no estoque", "un", -1, None, SUPRIMENTOS, P_ESTOQUE,
        "Materiais do MB52 com saldo zero ou negativo.", foto=True),
    Kpi("pecas_criticas", "Peças críticas em falta", "un", -1, 0, SUPRIMENTOS, P_ESTOQUE,
        "Peças vinculadas a equipamentos de criticidade Alta zeradas ou abaixo do mínimo.", foto=True),
    Kpi("req_dias", "Dias médios aguardando aprovação", "dias", -1, 7, SUPRIMENTOS, P_REQ,
        "Média de dias das requisições pendentes de aprovação.", foto=True),
]
POR_ID = {k.id: k for k in KPIS}


# ----------------------------------------------------------------------------
# Dados de entrada
# ----------------------------------------------------------------------------
@dataclass
class Dados:
    ordens: pd.DataFrame                      # IW38 já filtrado por área/centro/tipo (todas as datas)
    notas: pd.DataFrame | None = None         # IW28 filtrado por área/centro (todas as datas)
    oper: pd.DataFrame | None = None          # IW38OP das ordens filtradas
    chamadas: pd.DataFrame | None = None      # IP19 classificada (planos.classificar)
    estoque: pd.DataFrame | None = None       # MB52
    requisicoes: pd.DataFrame | None = None
    cad_eq: dict = field(default_factory=dict)
    cad_mat: dict = field(default_factory=dict)
    capacidade: dict = field(default_factory=dict)  # centro de trabalho → HH/semana ("" = total)
    conf: pd.DataFrame | None = None          # IW47 (apontamentos) das ordens/centros filtrados
    equipe: pd.DataFrame | None = None        # pessoas (Gestão de HH)
    tipos: dict = field(default_factory=dict)  # tipo de ordem → {"descricao", "classe"}
    horas_semana: float = 44.0                # jornada semanal de cada técnico
    afs: pd.DataFrame | None = None           # Gerenciador de AF · análises (af.preparar_afs), sem filtro de área
    acoes_af: pd.DataFrame | None = None      # Gerenciador de AF · ações (af.preparar_acoes)
    hoje: pd.Timestamp = field(default_factory=lambda: pd.Timestamp.now().normalize())
    _memo: dict = field(default_factory=dict, repr=False)

    def memo(self, nome: str, fn):
        """Tabelas derivadas calculadas uma vez por conjunto de dados (a série mensal reaproveita)."""
        if nome not in self._memo:
            self._memo[nome] = fn(self)
        return self._memo[nome]


def _entre(serie: pd.Series, ini, fim) -> pd.Series:
    return (serie >= pd.Timestamp(ini)) & (serie < pd.Timestamp(fim) + pd.Timedelta(days=1))


def _validas(ordens: pd.DataFrame) -> pd.DataFrame:
    return ordens[ordens["Situação"] != "Cancelada"]


# ----------------------------------------------------------------------------
# Tabelas derivadas (também usadas pelas páginas)
# ----------------------------------------------------------------------------
def horas_reparo_por_ordem(oper: pd.DataFrame | None, conf: pd.DataFrame | None = None) -> pd.Series:
    """Ordem → horas de relógio do reparo. Com IW47: HH reais ÷ pessoas que apontaram; senão
    Σ(trabalho planejado ÷ pessoas) das operações não canceladas do IW38OP."""
    plan = pd.Series(dtype=float)
    if oper is not None and len(oper):
        o = oper[~oper["Cancelada"]]
        plan = (o["Horas"] / o["Pessoas"].clip(lower=1)).groupby(o["Ordem"]).sum()
    if conf is not None and len(conf):
        g = conf.groupby("Ordem")
        real = (g["Horas"].sum() / g["Nº pessoal"].nunique().clip(lower=1))
        real = real[real > 0]
        return real.combine_first(plan)
    return plan


def fim_real_por_ordem(oper: pd.DataFrame | None) -> pd.Series:
    """Ordem → data de conclusão (maior fim real das operações concluídas)."""
    if oper is None or not len(oper):
        return pd.Series(dtype="datetime64[ns]")
    o = oper[oper["Concluída"] & oper["Fim real"].notna()]
    return o.groupby("Ordem")["Fim real"].max()


def quebras(d: Dados) -> pd.DataFrame:
    """Uma linha por quebra (nota com parada), com equipamento, classe A, horas de reparo e reincidência."""
    if d.notas is None or not len(d.notas):
        return pd.DataFrame(columns=["Nota", "Data", "Equip. (chave)", "Classe A", "Horas de reparo", "Reincidente"])
    q = d.notas[d.notas["Com parada"] & d.notas["Data"].notna()].copy()
    rep = horas_reparo_por_ordem(d.oper, d.conf)
    pela_ordem = q["Ordem"].map(rep).where(q["Ordem"] != "")
    q["Horas de reparo"] = q["Horas parado"].where(q["Horas parado"] > 0, pela_ordem)
    criticos = {k for k, v in d.cad_eq.items() if (v or {}).get("criticidade") == "Alta"}
    q["Classe A"] = (q["Código ABC"] == "A") | q["Equip. (chave)"].isin(criticos)
    q = q.sort_values("Data")
    anterior = q.groupby("Equip. (chave)")["Data"].shift()
    q["Dias desde a anterior"] = (q["Data"] - anterior).dt.days
    q["Reincidente"] = (q["Equip. (chave)"] != "") & (q["Dias desde a anterior"] <= 30)
    return q


def backlog(d: Dados) -> pd.DataFrame:
    """Ordens em aberto hoje (data-base de início até hoje), com idade e HH pendentes."""
    o = d.ordens[d.ordens["Situação"].isin(PENDENTES) & (d.ordens["Data"] <= d.hoje)].copy()
    o["Idade (dias)"] = (d.hoje - o["Data"]).dt.days
    if d.oper is not None and len(d.oper):
        pend = d.oper[~d.oper["Concluída"] & ~d.oper["Cancelada"]]
        o["HH pendentes"] = o["Ordem"].map(pend.groupby("Ordem")["Horas"].sum()).fillna(0.0)
    else:
        o["HH pendentes"] = np.nan
    return o


FORA_DO_IW38 = "Ordem fora do IW38"


def tem_emergencial(d: Dados) -> bool:
    """O IW38 carregado tem algum tipo de ordem da classe Emergencial? (sem isso o indicador não tem base)."""
    return "Tipo" in d.ordens and any(classe_tipo(t, d.tipos) == "Emergencial" for t in d.ordens["Tipo"].unique())


def classe_tipo(codigo: str, tipos: dict) -> str:
    """Classe WCM do tipo de ordem: a configurada no site ou deduzida da descrição."""
    t = tipos.get(codigo) or {}
    if t.get("classe"):
        return t["classe"]
    desc = str(t.get("descricao", "")).upper()
    for rx, classe in [("EMERG", "Emergencial"), ("CORRET", "Corretiva"), ("PREDIT|INSPE|CALIBR", "Preditiva / inspeção"),
                       ("PREVENT", "Preventiva"), ("LUBRIF", "Lubrificação"), ("MELHOR", "Melhoria"),
                       ("AUTONOM", "Autônoma")]:
        if pd.Series([desc]).str.contains(rx).iat[0]:
            return classe
    return "Outros" if desc else ""


def hh_executadas(d: Dados) -> pd.DataFrame:
    """Horas realizadas com data: IW47 (apontamentos reais) ou, sem ela, operações concluídas do IW38OP.
    Colunas: Ordem, Horas, Fim real (data), Com plano, Classe, Centro de trabalho, Nº pessoal."""
    cols = ["Ordem", "Horas", "Fim real", "Com plano", "Classe", "No IW38", "Centro de trabalho", "Nº pessoal"]
    ref = d.ordens.drop_duplicates("Ordem").set_index("Ordem")
    if d.conf is not None and len(d.conf):
        o = d.conf.rename(columns={"Data": "Fim real"}).copy()
    elif d.oper is not None and len(d.oper):
        o = d.oper[d.oper["Concluída"] & d.oper["Fim real"].notna()].copy()
        o["Nº pessoal"] = ""
    else:
        return pd.DataFrame(columns=cols)
    o["No IW38"] = o["Ordem"].isin(ref.index)
    o["Com plano"] = o["Ordem"].map(ref["Com plano"]).fillna(False).astype(bool)
    tipo = o["Ordem"].map(ref["Tipo"]) if "Tipo" in ref else pd.Series(pd.NA, index=o.index)
    tipo = tipo.fillna(o["Tipo"] if "Tipo" in o else "")
    classes = {t: classe_tipo(t, d.tipos) for t in tipo.unique()}
    o["Classe"] = tipo.map(classes)
    o.loc[~o["No IW38"] & (o["Classe"] == ""), "Classe"] = FORA_DO_IW38
    return o[[c for c in cols if c in o] + [c for c in o.columns if c not in cols]]


def tecnicos(d: Dados) -> pd.DataFrame:
    """Pessoas da equipe que executam manutenção (sem apoio/gestão e planejamento)."""
    if d.equipe is None or not len(d.equipe):
        return pd.DataFrame(columns=["Nº pessoal"])
    return d.equipe[~d.equipe["Especialidade"].isin(["Apoio / gestão", "Planejamento (GPM)"])]


def janela_apontamentos(d: Dados, ini, fim) -> tuple[pd.Timestamp, pd.Timestamp] | None:
    """Parte do período coberta pela IW47 (horas disponíveis só contam onde há apontamento)."""
    ini, fim = pd.Timestamp(ini), pd.Timestamp(fim)
    if d.conf is not None and len(d.conf) and d.conf["Data"].notna().any():
        ini, fim = max(ini, d.conf["Data"].min()), min(fim, d.conf["Data"].max())
    return (ini, fim) if fim >= ini else None


def hh_disponiveis(d: Dados, ini, fim) -> float | None:
    t = tecnicos(d)
    jan = janela_apontamentos(d, ini, fim)
    if not len(t) or jan is None:
        return None
    dias = (jan[1] - jan[0]).days + 1
    return len(t) * d.horas_semana * dias / 7


def capacidade_semanal(d: Dados, centros: list[str] | None = None) -> tuple[float | None, str]:
    """(HH por semana, de onde veio). Configurada por centro de trabalho; sem configuração,
    média semanal de HH realizadas (IW47 ou IW38OP) nas 12 semanas anteriores a hoje."""
    cap = {k: float(v) for k, v in (d.capacidade or {}).items() if v not in (None, "") and float(v) > 0}
    if cap:
        if centros:
            soma = sum(cap.get(c, 0.0) for c in centros)
            if soma:
                return soma, "configurada"
        elif "" in cap:
            return cap[""], "configurada"
        else:
            return sum(cap.values()), "configurada"
    ex = hh_executadas(d)
    if centros:
        ex = ex[ex["Centro de trabalho"].isin(centros)]
    recentes = ex[_entre(ex["Fim real"], (d.hoje - pd.Timedelta(weeks=12)).date(), (d.hoje - pd.Timedelta(days=1)).date())]
    if not len(recentes):
        return None, "sem dados"
    return float(recentes["Horas"].sum()) / 12, "média das últimas 12 semanas"


# ----------------------------------------------------------------------------
# Cálculo
# ----------------------------------------------------------------------------
def _div(a, b, fator=1.0):
    return (a / b * fator) if b else None


def calcular(d: Dados, ini: date, fim: date) -> dict[str, float | None]:
    """Valor de cada indicador no período [ini, fim] (os de "foto" valem para hoje)."""
    r: dict[str, float | None] = {}
    ordens = _validas(d.ordens)
    per = ordens[_entre(ordens["Data"], ini, fim)]
    dias = (pd.Timestamp(fim) - pd.Timestamp(ini)).days + 1

    # confiabilidade
    q_all = d.memo("quebras", quebras)
    q = q_all[_entre(q_all["Data"], ini, fim)] if len(q_all) else q_all
    tem_notas = d.notas is not None
    r["quebras"] = float(len(q)) if tem_notas else None
    com_eq = q[q["Equip. (chave)"] != ""] if len(q) else q
    r["mtbf"] = _div(dias * com_eq["Equip. (chave)"].nunique(), len(com_eq)) if len(com_eq) else None
    rep = q["Horas de reparo"].dropna() if len(q) else pd.Series(dtype=float)
    rep = rep[rep > 0]
    r["mttr"] = float(rep.mean()) if len(rep) else None
    r["reincidencia"] = _div(int(q["Reincidente"].sum()), len(q), 100) if len(q) else None
    r["quebras_a"] = float(q["Classe A"].sum()) if tem_notas else None

    # planejamento
    r["pct_plano"] = _div(int(per["Com plano"].sum()), len(per), 100)
    if d.tipos and "Tipo" in per and d.memo("tem_emerg", tem_emergencial):
        classes = {t: classe_tipo(t, d.tipos) for t in per["Tipo"].unique()}
        r["pct_emergencial"] = _div(int((per["Tipo"].map(classes) == "Emergencial").sum()), len(per), 100)
    else:
        r["pct_emergencial"] = None
    if d.chamadas is not None and len(d.chamadas):
        ch = d.chamadas[_entre(d.chamadas["Data"], ini, fim)]
        venc = ch[(ch["Data"] <= d.hoje) & (ch["Situação"] != "Saltada")]
        r["aderencia"] = _div(int((venc["Situação"] == "Concluída").sum()), len(venc), 100)
    else:
        r["aderencia"] = None
    fr = d.memo("fim_real", lambda x: fim_real_por_ordem(x.oper))
    if len(fr):
        concl = per[(per["Situação"] == "Concluída")].copy()
        concl["Fim real"] = concl["Ordem"].map(fr)
        concl = concl.dropna(subset=["Fim real", "Fim"])
        r["no_prazo"] = _div(int((concl["Fim real"] <= concl["Fim"]).sum()), len(concl), 100)
    else:
        r["no_prazo"] = None
    bk = d.memo("backlog", backlog)
    cap, _ = d.memo("capacidade", capacidade_semanal)
    r["backlog_sem"] = _div(float(bk["HH pendentes"].sum()), cap) if d.oper is not None and cap else None
    r["idade_backlog"] = float(bk["Idade (dias)"].mean()) if len(bk) else None
    if tem_notas:
        nt = d.notas[_entre(d.notas["Data"], ini, fim) & (d.notas["Dias"] > 7)]
        r["notas_7d"] = _div(int((~nt["Com ordem"]).sum()), len(nt), 100)
    else:
        r["notas_7d"] = None

    # análise de falhas (o gerenciador tem áreas próprias: só o período vale)
    r.update(indicadores_af(d, ini, fim))
    r.update(indicadores_semeq(d, ini, fim))

    # mão de obra
    ex = d.memo("hh_exec", hh_executadas)
    ex = ex[_entre(ex["Fim real"], ini, fim)] if len(ex) else ex
    tem_hh = d.conf is not None or d.oper is not None
    total_hh = float(ex["Horas"].sum()) if len(ex) else 0.0
    r["hh"] = total_hh if tem_hh else None
    conhecidas = ex[ex["No IW38"]] if len(ex) else ex   # % só sobre horas de ordens que estão no IW38
    hh_conh = float(conhecidas["Horas"].sum()) if len(conhecidas) else 0.0
    r["pct_hh_plano"] = _div(float(conhecidas.loc[conhecidas["Com plano"], "Horas"].sum()), hh_conh, 100) \
        if len(conhecidas) else None
    r["hh_emergencial"] = (_div(float(conhecidas.loc[conhecidas["Classe"] == "Emergencial", "Horas"].sum()), hh_conh, 100)
                           if len(conhecidas) and d.tipos and d.memo("tem_emerg", tem_emergencial) else None)
    r["cobertura_hh"] = _div(hh_conh, total_hh, 100) if total_hh else None
    disp = hh_disponiveis(d, ini, fim)
    if disp and d.conf is not None and len(ex):
        dos_tecnicos = ex[ex["Nº pessoal"].isin(set(tecnicos(d)["Nº pessoal"]))]
        r["utilizacao"] = _div(float(dos_tecnicos["Horas"].sum()), disp, 100)
    else:
        r["utilizacao"] = None

    # custos
    custo = float(per["Custo real"].sum())
    r["custo"] = custo / max(dias / 30.44, 1.0)
    r["pct_custo_corr"] = _div(float(per.loc[~per["Com plano"], "Custo real"].sum()), custo, 100)
    r["custo_medio"] = _div(custo, int((per["Custo real"] != 0).sum()))

    # suprimentos
    if d.estoque is not None:
        r["itens_zerados"] = float((d.estoque["Estoque"] <= 0).sum())
        r["pecas_criticas"] = float(len(d.memo("pecas_criticas", pecas_criticas_em_falta)))
    else:
        r["itens_zerados"] = r["pecas_criticas"] = None
    if d.requisicoes is not None and len(d.requisicoes):
        p = d.requisicoes[d.requisicoes["Pendente"]]
        r["req_dias"] = float(p["Dias aguardando"].mean()) if len(p) else 0.0
    else:
        r["req_dias"] = None
    return r


IDS_SEMEQ = ("semeq_detectadas", "semeq_com_ordem", "semeq_tratadas", "semeq_dias", "semeq_atrasadas")


def anomalias_semeq(d: Dados) -> pd.DataFrame:
    return preditiva.anomalias(d.notas, d.ordens, d.oper, d.conf, d.equipe, d.hoje)


def indicadores_semeq(d: Dados, ini: date, fim: date) -> dict[str, float | None]:
    """Indicadores da preditiva SEMEQ (sem nenhuma anomalia nas bases, ficam sem valor)."""
    an = d.memo("semeq", anomalias_semeq)
    if not len(an):
        return dict.fromkeys(IDS_SEMEQ)
    v = preditiva.indicadores(an, ini, fim)
    return {k: v.get(k) for k in IDS_SEMEQ}


IDS_AF = ("taxa_quebra_a", "af_execucao", "af_no_prazo", "af_atrasadas")
IDS_ACOES_AF = ("acoes_execucao", "acoes_no_prazo", "acoes_atrasadas")


def indicadores_af(d: Dados, ini: date, fim: date) -> dict[str, float | None]:
    """Indicadores do Gerenciador de AF (af.indicadores); sem a aba correspondente, ficam sem valor."""
    r: dict[str, float | None] = dict.fromkeys(IDS_AF + IDS_ACOES_AF)
    if d.afs is None and d.acoes_af is None:
        return r
    afs = d.afs if d.afs is not None else pd.DataFrame(columns=_COLUNAS_AF_MIN)
    acoes = d.acoes_af if d.acoes_af is not None else pd.DataFrame(columns=_COLUNAS_ACAO_MIN)
    v = af.indicadores(afs, acoes, ini, fim, d.hoje)
    for ids, presente in ((IDS_AF, d.afs is not None), (IDS_ACOES_AF, d.acoes_af is not None)):
        if presente:
            r.update({k: v.get(k) for k in ids})
    return r


_COLUNAS_AF_MIN = ["Situação", "Data da falha", "Data limite", "Criticidade", "Dias para análise"]
_COLUNAS_ACAO_MIN = ["Situação", "Data de início", "Data limite", "Data realizada"]


def pecas_criticas_em_falta(d: Dados) -> pd.DataFrame:
    """Materiais vinculados a equipamentos de criticidade Alta sem saldo suficiente."""
    if d.estoque is None:
        return pd.DataFrame(columns=["Material", "Descrição", "Estoque", "Mínimo", "Equipamentos"])
    usados: dict[str, list[str]] = {}
    for eq, v in d.cad_eq.items():
        if (v or {}).get("criticidade") == "Alta":
            for m in v.get("materiais", []):
                usados.setdefault(m, []).append(eq)
    if not usados:
        return pd.DataFrame(columns=["Material", "Descrição", "Estoque", "Mínimo", "Equipamentos"])
    e = d.estoque.set_index("Material")
    linhas = []
    for m, eqs in usados.items():
        q = float(e["Estoque"].get(m, 0.0)) if m in e.index else 0.0
        minimo = (d.cad_mat.get(m) or {}).get("minimo")
        if q <= 0 or (minimo and q < minimo):
            linhas.append({"Material": m, "Descrição": e["Descrição"].get(m, "fora do MB52") if m in e.index else "fora do MB52",
                           "Estoque": q, "Mínimo": minimo, "Equipamentos": ", ".join(eqs)})
    return pd.DataFrame(linhas, columns=["Material", "Descrição", "Estoque", "Mínimo", "Equipamentos"])


def periodo_anterior(ini: date, fim: date) -> tuple[date, date]:
    dias = (pd.Timestamp(fim) - pd.Timestamp(ini)).days + 1
    fim_ant = pd.Timestamp(ini) - pd.Timedelta(days=1)
    return (fim_ant - pd.Timedelta(days=dias - 1)).date(), fim_ant.date()


def mensal(d: Dados, ini: date, fim: date) -> pd.DataFrame:
    """Série mês a mês dos indicadores mensais (linhas = 1º dia do mês)."""
    meses = pd.date_range(pd.Timestamp(ini).to_period("M").start_time, pd.Timestamp(fim), freq="MS")
    linhas = []
    for m in meses:
        a = max(m, pd.Timestamp(ini)).date()
        b = min(m + pd.offsets.MonthEnd(0), pd.Timestamp(fim)).date()
        v = calcular(d, a, b)
        linhas.append({"Mês": m, **{k.id: v.get(k.id) for k in KPIS if k.mensal}})
    return pd.DataFrame(linhas)


# ----------------------------------------------------------------------------
# Metas e farol
# ----------------------------------------------------------------------------
VERDE, AMARELO, VERMELHO, NEUTRO = "verde", "amarelo", "vermelho", "neutro"


def meta(kpi: Kpi, metas: dict | None) -> float | None:
    """Meta configurada no site (cadastro metas_wcm) ou a padrão."""
    m = (metas or {}).get(kpi.id)
    if isinstance(m, dict) and "meta" in m:
        return None if m["meta"] in (None, "") else float(m["meta"])
    return kpi.meta


def farol(kpi: Kpi, valor: float | None, alvo: float | None, tolerancia: float = 0.10) -> str:
    """Verde = atinge a meta; amarelo = até 10% pior que a meta; vermelho = pior que isso."""
    if valor is None or alvo is None or (isinstance(valor, float) and np.isnan(valor)):
        return NEUTRO
    folga = abs(alvo) * tolerancia if alvo else tolerancia
    if kpi.sentido > 0:
        return VERDE if valor >= alvo else (AMARELO if valor >= alvo - folga else VERMELHO)
    return VERDE if valor <= alvo else (AMARELO if valor <= alvo + folga else VERMELHO)


def variacao(kpi: Kpi, atual: float | None, anterior: float | None) -> tuple[float | None, bool | None]:
    """(variação, melhorou?) — em pontos para %, absoluta para contagens, relativa (%) para o resto;
    indicadores de "foto" (retrato de hoje) não têm variação."""
    if atual is None or anterior is None:
        return None, None
    if kpi.foto:
        return None, None
    if kpi.unidade in ("%", "un"):
        delta = atual - anterior
    elif anterior:
        delta = (atual - anterior) / abs(anterior) * 100
    else:
        return None, None
    if abs(delta) < 1e-9:
        return 0.0, None
    return delta, (delta > 0) == (kpi.sentido > 0)


def formatar(kpi: Kpi, valor: float | None) -> str:
    if valor is None or (isinstance(valor, float) and np.isnan(valor)):
        return "—"
    if kpi.unidade == "%":
        return f"{valor:.1f}%".replace(".", ",")
    if kpi.unidade == "R$":
        if abs(valor) >= 1e6:
            return f"R$ {valor / 1e6:.2f} mi".replace(".", ",")
        if abs(valor) >= 1e4:
            return f"R$ {valor / 1e3:.1f} mil".replace(".", ",")
        return f"R$ {valor:,.0f}".replace(",", ".")
    if kpi.unidade in ("h", "dias", "sem"):
        casas = 1 if valor < 100 else 0
        txt = f"{valor:,.{casas}f}".replace(",", "X").replace(".", ",").replace("X", ".")
        return f"{txt} {kpi.unidade}"
    return f"{valor:,.0f}".replace(",", ".")


# ----------------------------------------------------------------------------
# Parâmetros gravados no site (cadastro metas_wcm.json)
# ----------------------------------------------------------------------------
# chaves: "<id do indicador>" → {"meta": x} · "capacidade:<centro>" → {"hh": x}
#         "tipo:<código>" → {"descricao": "...", "classe": "..."} · "_parametros" → {"horas_semana": 44}
CLASSES_TIPO = ["Preventiva", "Preditiva / inspeção", "Lubrificação", "Autônoma", "Corretiva", "Emergencial",
                "Melhoria", "Outros"]
PLANEJADAS = ("Preventiva", "Preditiva / inspeção", "Lubrificação", "Autônoma")


def horas_semana_de(cad: dict) -> float:
    try:
        return float(((cad or {}).get("_parametros") or {}).get("horas_semana") or 44.0)
    except (TypeError, ValueError):
        return 44.0


def capacidade_de(cad: dict) -> dict[str, float]:
    return {k.split(":", 1)[1]: float(v["hh"]) for k, v in (cad or {}).items()
            if k.startswith("capacidade:") and isinstance(v, dict) and v.get("hh") not in (None, "")}


def tipos_de(cad: dict, padrao: dict[str, str] | None = None) -> dict[str, dict]:
    """Tipos de ordem: o cadastrado no site vale; `padrao` (código → descrição, ex.: da planilha
    de Gestão de HH) completa os que não foram cadastrados."""
    out = {c: {"descricao": d, "classe": ""} for c, d in (padrao or {}).items()}
    for k, v in (cad or {}).items():
        if k.startswith("tipo:") and isinstance(v, dict):
            c = k.split(":", 1)[1]
            out[c] = {"descricao": v.get("descricao") or out.get(c, {}).get("descricao", ""), "classe": v.get("classe", "")}
    return out


def rotulo_tipo(codigo: str, tipos: dict[str, dict]) -> str:
    t = tipos.get(codigo) or {}
    return f"{codigo} · {t['descricao']}" if t.get("descricao") else codigo
