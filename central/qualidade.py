"""Qualidade dos dados: o que nas bases do SAP distorce os indicadores e como corrigir na origem.

Pandas puro (testado em tests/test_qualidade.py). Cada checagem mede uma proporção de registros com
problema (últimos 12 meses, salvo indicação), aponta os indicadores afetados e a correção no SAP.
Farol: até 2% verde, até 10% amarelo, acima disso vermelho. Índice de qualidade = 100 − média dos %.
"""

from __future__ import annotations

from dataclasses import dataclass, field

import pandas as pd

JANELA_DIAS = 365
VERDE, AMARELO, VERMELHO = "verde", "amarelo", "vermelho"


@dataclass
class Checagem:
    id: str
    nome: str
    base: str
    afeta: str
    corrigir: str
    problemas: pd.DataFrame = field(default_factory=pd.DataFrame)
    total: int = 0

    @property
    def n(self) -> int:
        return len(self.problemas)

    @property
    def pct(self) -> float | None:
        return self.n / self.total * 100 if self.total else None

    @property
    def farol(self) -> str:
        p = self.pct
        if p is None or p <= 2:
            return VERDE
        return AMARELO if p <= 10 else VERMELHO


def _recentes(df: pd.DataFrame, col: str, hoje: pd.Timestamp) -> pd.DataFrame:
    return df[(df[col] >= hoje - pd.Timedelta(days=JANELA_DIAS)) & (df[col] <= hoje)]


def _cols(df: pd.DataFrame, cols: list[str]) -> pd.DataFrame:
    return df[[c for c in cols if c in df]].reset_index(drop=True)


def verificar(hoje, *, ordens: pd.DataFrame | None = None, oper: pd.DataFrame | None = None,
              notas: pd.DataFrame | None = None, conf: pd.DataFrame | None = None,
              equipe: pd.DataFrame | None = None, equip: pd.DataFrame | None = None, cad_eq: dict | None = None,
              quebras: pd.DataFrame | None = None, fim_real: pd.Series | None = None) -> list[Checagem]:
    """Lista de checagens (só as que têm base carregada)."""
    hoje = pd.Timestamp(hoje).normalize()
    cad_eq = cad_eq or {}
    out: list[Checagem] = []
    cols_o = ["Ordem", "Tipo", "Texto", "Situação", "Data", "Fim", "Equip. (chave)", "Objeto técnico",
              "Centro de trabalho", "Localização"]

    if quebras is not None and len(quebras):
        q = _recentes(quebras, "Data", hoje)
        out.append(Checagem(
            "quebras_sem_reparo", "Quebras sem horas de reparo", "IW28 / IW47 / IW38OP", "MTTR, disponibilidade",
            "Preencher a duração da parada na nota Y1 (IW22) ou apontar as horas na ordem YM11 (IW41).",
            _cols(q[q["Horas de reparo"].isna()], ["Nota", "Data", "Ordem", "Equip. (chave)", "Objeto técnico",
                                                    "Descrição", "Centro de trabalho"]), len(q)))
    if notas is not None and len(notas):
        n = _recentes(notas, "Data", hoje)
        y1 = n[(n["Tipo de nota"] == "Y1") & (n["Dias"] > 2)]
        out.append(Checagem(
            "y1_sem_ordem", "Notas de quebra (Y1) sem ordem há mais de 2 dias", "IW28", "Quebras, MTBF, MTTR",
            "Converter a nota Y1 em ordem YM11 (IW22) — sem a ordem a quebra não entra nos indicadores.",
            _cols(y1[~y1["Com ordem"]], ["Nota", "Data", "Dias", "Equip. (chave)", "Objeto técnico", "Descrição",
                                         "Centro de trabalho"]), len(y1)))
        velhas = n[n["Tipo de nota"] != "Y1"]
        velhas = velhas[velhas["Dias"] > 30]
        out.append(Checagem(
            "notas_sem_ordem", "Notas sem ordem há mais de 30 dias", "IW28", "Notas sem ordem, backlog real",
            "Avaliar cada nota: gerar a ordem ou encerrar a nota (IW22).",
            _cols(velhas[~velhas["Com ordem"]], ["Nota", "Tipo de nota", "Data", "Dias", "Equip. (chave)",
                                                 "Descrição", "Centro de trabalho"]), len(velhas)))
    if ordens is not None and len(ordens):
        o = _recentes(ordens[ordens["Situação"] != "Cancelada"], "Data", hoje)
        out.append(Checagem(
            "ordens_sem_equip", "Ordens sem equipamento", "IW38", "Pareto de quebras, saúde dos ativos, custo por "
            "equipamento", "Informar o equipamento (ou o local de instalação) na ordem (IW32).",
            _cols(o[o["Equip. (chave)"] == ""], cols_o), len(o)))
        datas = o.dropna(subset=["Início", "Fim"]) if "Início" in o else o.iloc[0:0]
        out.append(Checagem(
            "prazo_antes_inicio", "Ordens com fim-base antes do início", "IW38", "Ordens no prazo, calendário",
            "Corrigir as datas-base da ordem (IW32).",
            _cols(datas[datas["Fim"] < datas["Início"]], cols_o + ["Início"]), len(datas)))
        ente = o[o["Situação"] == "Encerrada sem confirmação"]
        concl = o[o["Situação"].isin(["Concluída", "Encerrada sem confirmação"])]
        out.append(Checagem(
            "ente_sem_conf", "Ordens encerradas sem confirmação", "IW38", "HH reais, execução das atividades, MTTR",
            "Confirmar as operações (IW41) antes do encerramento técnico da ordem.",
            _cols(ente, cols_o), len(concl)))
        if fim_real is not None:
            c = o[o["Situação"] == "Concluída"]
            sem_fim = c[~c["Ordem"].isin(fim_real.dropna().index)]
            out.append(Checagem(
                "concluidas_sem_fim", "Ordens concluídas sem data de fim real", "IW38 / IW38OP",
                "Ordens no prazo, lead time, dias para tratar (preditiva)",
                "Confirmar as operações com a data real (IW41) e exportar o IW38OP com a coluna Data do fim real.",
                _cols(sem_fim, cols_o), len(c)))
        pend = ordens[ordens["Situação"].isin(["Aberta", "Liberada", "Encerrada sem confirmação"])
                      & (ordens["Data"] <= hoje)]
        out.append(Checagem(
            "backlog_velho", "Ordens em aberto há mais de 180 dias", "IW38", "Backlog, idade do backlog, saúde",
            "Revisar com o planejamento: executar, reprogramar ou encerrar/cancelar a ordem (IW32).",
            _cols(pend[(hoje - pend["Data"]).dt.days > 180], cols_o), len(pend)))
        eqs = o.loc[o["Equip. (chave)"] != "", "Equip. (chave)"].drop_duplicates()
        abc = dict(zip(equip["Equipamento"], equip["Código ABC"])) if equip is not None and len(equip) else {}
        sem_crit = eqs[[not abc.get(k) and not (cad_eq.get(k) or {}).get("criticidade") for k in eqs]]
        nomes = o.drop_duplicates("Equip. (chave)").set_index("Equip. (chave)")["Objeto técnico"]
        out.append(Checagem(
            "equip_sem_criticidade", "Equipamentos com ordens e sem criticidade", "IH08 / cadastro do site",
            "Saúde dos ativos (risco), quebras em classe A, peças críticas",
            "Definir o código ABC no equipamento (IE02) ou a criticidade no cadastro de equipamentos do site.",
            pd.DataFrame({"Equipamento": sem_crit.values, "Objeto técnico": sem_crit.map(nomes).fillna("").values}),
            len(eqs)))
    if oper is not None and len(oper):
        op = oper[~oper["Cancelada"] & oper["Início"].notna()]
        op = _recentes(op, "Início", hoje)
        out.append(Checagem(
            "ops_sem_trabalho", "Operações sem trabalho planejado (0 h)", "IW38OP",
            "Backlog em semanas, carga × capacidade da programação semanal",
            "Planejar o trabalho (horas) e o nº de pessoas das operações da ordem (IW32, aba Operações).",
            _cols(op[op["Horas"] <= 0], ["Ordem", "Operação", "Texto da operação", "Início", "Centro de trabalho",
                                          "Objeto técnico"]), len(op)))
    if conf is not None and len(conf) and equipe is not None and len(equipe):
        c = _recentes(conf, "Data", hoje)
        fora = c[~c["Nº pessoal"].isin(set(equipe["Nº pessoal"]))]
        resumo = fora.groupby(["Nº pessoal", "Centro de trabalho"]).agg(
            Apontamentos=("Horas", "size"), HH=("Horas", "sum"), Último=("Data", "max")).reset_index()
        out.append(Checagem(
            "apont_fora_equipe", "Apontamentos de pessoas fora da Gestão de HH", "IW47 / Gestão de HH",
            "Utilização da mão de obra, quem fez o quê",
            "Incluir a pessoa (matrícula) na planilha de Gestão de HH ou corrigir a matrícula no apontamento.",
            resumo.sort_values("HH", ascending=False), int(len(c.groupby(["Nº pessoal", "Centro de trabalho"])))))
    return out


def indice(checagens: list[Checagem]) -> float | None:
    """100 − média dos % de problemas das checagens com base."""
    ps = [c.pct for c in checagens if c.pct is not None]
    return max(0.0, 100 - sum(ps) / len(ps)) if ps else None
