import type { ItemEstoque } from "../dados/materiais";
import * as af from "./af";
import * as hh from "./hh";
import * as planos from "./planos";
import * as preditiva from "./preditiva";
import { PENDENTES, type Confirmacao, type Nota, type Operacao, type Ordem, type Pessoa, type Requisicao } from "./preparo";
import { inicioDoMes, partes, somarMeses, type Dia } from "./util";

/**
 * Indicadores WCM do pilar Manutenção Profissional — porta fiel de central/indicadores.py. Cada indicador tem
 * fórmula, sentido (maior ou menor é melhor), meta padrão (editável em Metas) e farol.
 *
 * - Quebra = nota Y1 da IW28 convertida em ordem YM11.
 * - Horas de reparo de uma ordem = HH reais (IW47) ÷ pessoas que apontaram; sem IW47, Σ(trabalho ÷ pessoas) no IW38OP;
 *   quando a nota traz a duração da parada, ela vale no lugar.
 * - Data de conclusão de uma ordem = maior fim real das operações concluídas.
 * - Backlog = ordens pendentes com data-base de início até hoje.
 */
export const CONFIABILIDADE = "Confiabilidade", PLANEJAMENTO = "Planejamento e controle", ANALISE_FALHA = "Análise de falhas (AF)",
  MAO_DE_OBRA = "Mão de obra", CUSTOS = "Custos", SUPRIMENTOS = "Suprimentos", PREDITIVA = "Preditiva (SEMEQ)";
export const GRUPOS = [CONFIABILIDADE, PREDITIVA, PLANEJAMENTO, ANALISE_FALHA, MAO_DE_OBRA, CUSTOS, SUPRIMENTOS];

export type Unidade = "%" | "h" | "dias" | "R$" | "un" | "sem";
export interface Kpi {
  id: string; nome: string; unidade: Unidade; sentido: 1 | -1; meta: number | null; grupo: string; pagina: string;
  formula: string; mensal?: boolean; foto?: boolean;
}

const k = (id: string, nome: string, unidade: Unidade, sentido: 1 | -1, meta: number | null, grupo: string, pagina: string,
  formula: string, op: { mensal?: boolean; foto?: boolean } = {}): Kpi => ({ id, nome, unidade, sentido, meta, grupo, pagina, formula, ...op });

export const KPIS: Kpi[] = [
  k("quebras", "Quebras", "un", -1, null, CONFIABILIDADE, "/confiabilidade", "Notas Y1 da IW28 convertidas em ordem YM11 no período (regra de quebra da planta).", { mensal: true }),
  k("mtbf", "MTBF", "dias", 1, 60, CONFIABILIDADE, "/confiabilidade", "Tempo médio entre falhas: dias do período × equipamentos que quebraram ÷ quebras."),
  k("mttr", "MTTR", "h", -1, 4, CONFIABILIDADE, "/confiabilidade", "Tempo médio de reparo por quebra: duração da parada na nota; sem ela, horas reais da ordem da quebra na IW47 ÷ pessoas que apontaram; sem IW47, Σ(trabalho ÷ pessoas) das operações no IW38OP.", { mensal: true }),
  k("disponibilidade", "Disponibilidade", "%", 1, 98, CONFIABILIDADE, "/confiabilidade", "Disponibilidade inerente dos equipamentos que quebraram: MTBF ÷ (MTBF + MTTR), com o MTBF em horas (dias × 24) e o MTTR das quebras do período."),
  k("reincidencia", "Reincidência", "%", -1, 10, CONFIABILIDADE, "/confiabilidade", "Quebras em equipamento que já tinha quebrado nos 30 dias anteriores ÷ quebras."),
  k("quebras_a", "Quebras em classe A", "un", -1, null, CONFIABILIDADE, "/confiabilidade", "Quebras em equipamentos de código ABC = A (IH08/IW28) ou criticidade Alta no cadastro."),
  k("pct_plano", "Manutenção planejada", "%", 1, 80, PLANEJAMENTO, "/ordens", "Ordens com número de plano de manutenção ÷ ordens do período (canceladas não contam).", { mensal: true }),
  k("pct_emergencial", "Ordens corretivas emergenciais", "%", -1, 10, PLANEJAMENTO, "/ordens", "Ordens de tipo classificado como Emergencial ÷ ordens do período. Fica sem valor se o IW38 carregado não tem nenhum tipo emergencial (exporte o IW38 com todos os tipos).", { mensal: true }),
  k("aderencia", "Aderência ao plano", "%", 1, 95, PLANEJAMENTO, "/planos", "Chamadas da IP19 com data até hoje que foram concluídas ÷ chamadas vencidas (saltadas não contam).", { mensal: true }),
  k("no_prazo", "Ordens concluídas no prazo", "%", 1, 90, PLANEJAMENTO, "/ordens", "Ordens concluídas cujo fim real (IW38OP) foi até a data-base do fim ÷ ordens concluídas com as duas datas.", { mensal: true }),
  k("backlog_sem", "Backlog", "sem", -1, 3, PLANEJAMENTO, "/mao_de_obra", "HH pendentes das ordens em aberto ÷ capacidade semanal (configurada ou média das últimas 12 semanas).", { foto: true }),
  k("idade_backlog", "Idade média do backlog", "dias", -1, 30, PLANEJAMENTO, "/ordens", "Média de dias desde a data-base de início das ordens em aberto (até hoje).", { foto: true }),
  k("notas_7d", "Notas sem ordem > 7 dias", "%", -1, 10, PLANEJAMENTO, "/notas", "Notas do período com mais de 7 dias que ainda não viraram ordem ÷ notas do período com mais de 7 dias."),
  k("taxa_quebra_a", "Taxa de análise de quebra crítica (A)", "%", 1, 100, ANALISE_FALHA, "/af_planos", "AFs de criticidade A com data da falha no período já analisadas ÷ AFs de criticidade A com data da falha no período.", { mensal: true }),
  k("af_execucao", "Execução de AFs", "%", 1, 100, ANALISE_FALHA, "/af_planos", "AFs com data limite no período (até hoje) analisadas ÷ AFs com data limite no período (até hoje).", { mensal: true }),
  k("af_no_prazo", "AFs analisadas no prazo", "%", 1, 90, ANALISE_FALHA, "/af_planos", "AFs com data limite no período (até hoje) analisadas até a data limite ÷ AFs com data limite no período (até hoje).", { mensal: true }),
  k("af_atrasadas", "AFs atrasadas", "un", -1, 0, ANALISE_FALHA, "/af_planos", "AFs ainda não analisadas com a data limite vencida (hoje).", { foto: true }),
  k("acoes_execucao", "Ações de AFs", "%", 1, 90, ANALISE_FALHA, "/af_acoes", "Ações de AF com data limite no período (até hoje) realizadas ÷ ações com data limite no período (até hoje).", { mensal: true }),
  k("acoes_no_prazo", "Ações no prazo", "%", 1, 90, ANALISE_FALHA, "/af_acoes", "Ações de AF com data limite no período (até hoje) realizadas até a data limite ÷ ações com data limite no período (até hoje).", { mensal: true }),
  k("acoes_atrasadas", "Ações atrasadas", "un", -1, 0, ANALISE_FALHA, "/af_acoes", "Ações de AF não realizadas com a data limite vencida (hoje).", { foto: true }),
  k("semeq_detectadas", "Anomalias preditivas", "un", -1, null, PREDITIVA, "/preditiva", "Anomalias SEMEQ detectadas no período (notas IW28 e ordens IW38 com SEMEQ-<técnica>-<nº> no texto, pela data de detecção).", { mensal: true }),
  k("semeq_com_ordem", "Anomalias com ordem", "%", 1, 100, PREDITIVA, "/preditiva", "Anomalias SEMEQ do período que já têm ordem de manutenção ÷ anomalias do período (canceladas fora).", { mensal: true }),
  k("semeq_tratadas", "Anomalias tratadas", "%", 1, 90, PREDITIVA, "/preditiva", "Anomalias SEMEQ do período com a ordem concluída (CONF + ENTE) ÷ anomalias do período.", { mensal: true }),
  k("semeq_dias", "Dias para tratar", "dias", -1, 15, PREDITIVA, "/preditiva", "Média de dias da detecção até o fim real da ordem (IW38OP) nas anomalias tratadas do período.", { mensal: true }),
  k("semeq_atrasadas", "Anomalias atrasadas", "un", -1, 0, PREDITIVA, "/preditiva", "Anomalias SEMEQ com a ordem em aberto e a data-base do fim já vencida (hoje).", { foto: true }),
  k("hh", "HH apontadas", "h", 1, null, MAO_DE_OBRA, "/mao_de_obra", "Horas reais apontadas na IW47 no período (data de lançamento; estornos descontados). Sem IW47: trabalho das operações concluídas no IW38OP.", { mensal: true }),
  k("utilizacao", "Utilização da mão de obra", "%", 1, 80, MAO_DE_OBRA, "/mao_de_obra", "HH apontadas pelos técnicos da equipe ÷ HH disponíveis (técnicos da Gestão de HH × horas por semana × semanas do período cobertas pela IW47).", { mensal: true }),
  k("pct_hh_plano", "HH em manutenção planejada", "%", 1, 70, MAO_DE_OBRA, "/mao_de_obra", "HH apontadas em ordens com número de plano ÷ HH apontadas em ordens que estão no IW38.", { mensal: true }),
  k("hh_emergencial", "HH em corretiva emergencial", "%", -1, 10, MAO_DE_OBRA, "/mao_de_obra", "HH apontadas em ordens de tipo classificado como Emergencial (ex.: YM11) ÷ HH apontadas em ordens que estão no IW38. Fica sem valor se o IW38 carregado não tem nenhum tipo emergencial.", { mensal: true }),
  k("custo", "Custo médio mensal", "R$", -1, null, CUSTOS, "/custos", "Custo real das ordens do período (IW38) ÷ meses do período. A meta é o orçamento mensal.", { mensal: true }),
  k("pct_custo_corr", "Custo do backlog", "%", -1, 20, CUSTOS, "/custos", "Custo real das ordens sem plano ÷ custo real total.", { mensal: true }),
  k("custo_medio", "Custo médio por ordem", "R$", -1, null, CUSTOS, "/custos", "Custo real ÷ ordens com custo no período."),
  k("itens_zerados", "Itens zerados no estoque", "un", -1, null, SUPRIMENTOS, "/estoque", "Materiais do MB52 com saldo zero ou negativo.", { foto: true }),
  k("pecas_criticas", "Peças críticas em falta", "un", -1, 0, SUPRIMENTOS, "/estoque", "Peças vinculadas a equipamentos de criticidade Alta zeradas ou abaixo do mínimo.", { foto: true }),
  k("req_dias", "Dias médios aguardando aprovação", "dias", -1, 7, SUPRIMENTOS, "/requisicoes", "Média de dias das requisições pendentes de aprovação.", { foto: true }),
];
export const POR_ID: Record<string, Kpi> = Object.fromEntries(KPIS.map((x) => [x.id, x]));

// ----------------------------------------------------------------------------
// Dados de entrada
// ----------------------------------------------------------------------------
type Cadastro = Record<string, Record<string, unknown>>;
export interface TipoOrdem { descricao: string; classe: string }

export interface Dados {
  ordens: Ordem[];                       // IW38 já filtrado por área/centro/tipo (todas as datas)
  notas: Nota[] | null;                  // IW28 filtrado por área/centro
  oper: Operacao[] | null;               // IW38OP das ordens filtradas
  chamadas: planos.ChamadaClassificada[] | null;
  estoque: ItemEstoque[] | null;
  requisicoes: Requisicao[] | null;
  cadEq: Cadastro;
  cadMat: Cadastro;
  capacidade: Record<string, number>;    // centro → HH/semana ("" = total)
  conf: Confirmacao[] | null;            // IW47 do recorte, só pessoas da Gestão de HH
  confTodos: Confirmacao[] | null;       // IW47 de todo mundo (reparo, execução)
  equipe: Pessoa[] | null;
  tipos: Record<string, TipoOrdem>;
  horasSemana: number;
  disponibilidade: hh.CadastroHh;
  afs: af.Af[] | null;
  acoesAf: af.AcaoAf[] | null;
  hoje: Dia;
  centros: string[];
  tiposFiltro: string[];
  filtroAreaTipo: boolean;
  memo: Map<string, unknown>;
}

function memo<T>(d: Dados, nome: string, fn: (d: Dados) => T): T {
  if (!d.memo.has(nome)) d.memo.set(nome, fn(d));
  return d.memo.get(nome) as T;
}

const entre = (x: Dia | null | undefined, ini: Dia, fim: Dia) => x != null && x >= ini && x <= fim;
const validas = (o: Ordem[]) => o.filter((x) => x.situacao !== "Cancelada");
const div = (a: number, b: number, fator = 1): number | null => (b ? (a / b) * fator : null);
const somaDe = <T,>(xs: T[], f: (x: T) => number) => xs.reduce((s, x) => s + (Number.isNaN(f(x)) ? 0 : f(x)), 0);
const media = (xs: number[]) => { const v = xs.filter((x) => !Number.isNaN(x)); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };

// ----------------------------------------------------------------------------
// Tabelas derivadas (também usadas pelas páginas)
// ----------------------------------------------------------------------------
/** Ordem → horas de relógio do reparo (IW47: HH ÷ pessoas; senão Σ(trabalho ÷ pessoas) no IW38OP). */
export function horasReparoPorOrdem(oper: Operacao[] | null, conf: Confirmacao[] | null = null): Map<string, number> {
  const plano = new Map<string, number>();
  for (const o of oper ?? []) if (!o.cancelada) plano.set(o.ordem, (plano.get(o.ordem) ?? 0) + o.horas / Math.max(o.pessoas, 1));
  if (!conf?.length) return plano;
  const horas = new Map<string, number>(), pessoas = new Map<string, Set<string>>();
  for (const c of conf) {
    horas.set(c.ordem, (horas.get(c.ordem) ?? 0) + c.horas);
    (pessoas.get(c.ordem) ?? pessoas.set(c.ordem, new Set()).get(c.ordem)!).add(c.np);
  }
  const out = new Map(plano);
  for (const [o, h] of horas) {
    const real = h / Math.max(pessoas.get(o)!.size, 1);
    if (real > 0) out.set(o, real);
  }
  return out;
}

/** Ordem → data de conclusão (maior fim real das operações concluídas). */
export function fimRealPorOrdem(oper: Operacao[] | null): Map<string, Dia> {
  const m = new Map<string, Dia>();
  for (const o of oper ?? []) if (o.concluida && o.fimReal != null && o.fimReal > (m.get(o.ordem) ?? -Infinity)) m.set(o.ordem, o.fimReal);
  return m;
}

export interface Quebra extends Nota { horasReparo: number | null; classeA: boolean; diasDesdeAnterior: number | null; reincidente: boolean }

/** Uma linha por quebra, com classe A, horas de reparo e reincidência (≤ 30 dias da anterior no mesmo equipamento). */
export function quebras(d: Dados): Quebra[] {
  if (!d.notas?.length) return [];
  const rep = horasReparoPorOrdem(d.oper, d.confTodos ?? d.conf);
  const criticos = new Set(Object.entries(d.cadEq).filter(([, v]) => v?.criticidade === "Alta").map(([c]) => c));
  const q = d.notas.filter((n) => n.quebra && n.data != null).map((n) => {
    const pelaOrdem = n.ordem !== "" ? rep.get(n.ordem) ?? null : null;
    return { ...n, horasReparo: n.horasParado > 0 ? n.horasParado : pelaOrdem, classeA: n.codigoAbc === "A" || criticos.has(n.equipChave),
      diasDesdeAnterior: null as number | null, reincidente: false };
  }).sort((a, b) => a.data! - b.data!);
  const ultima = new Map<string, Dia>();
  for (const x of q) {
    const ant = ultima.get(x.equipChave);
    x.diasDesdeAnterior = ant != null ? x.data! - ant : null;
    x.reincidente = x.equipChave !== "" && x.diasDesdeAnterior != null && x.diasDesdeAnterior <= 30;
    ultima.set(x.equipChave, x.data!);
  }
  return q;
}

export interface ItemBacklog extends Ordem { idade: number; hhPendentes: number | null }

/** Ordens em aberto hoje (data-base de início até hoje), com idade e HH pendentes. */
export function backlog(d: Dados): ItemBacklog[] {
  let pend: Map<string, number> | null = null;
  if (d.oper?.length) {
    pend = new Map();
    for (const o of d.oper) if (!o.concluida && !o.cancelada) pend.set(o.ordem, (pend.get(o.ordem) ?? 0) + o.horas);
  }
  return d.ordens.filter((o) => PENDENTES.has(o.situacao) && o.data != null && o.data <= d.hoje)
    .map((o) => ({ ...o, idade: d.hoje - o.data!, hhPendentes: pend ? pend.get(o.ordem) ?? 0 : null }));
}

export const FORA_DO_IW38 = "Ordem fora do IW38";

/** Classe WCM do tipo de ordem: a configurada no site ou deduzida da descrição. */
export function classeTipo(codigo: string, tipos: Record<string, TipoOrdem>): string {
  const t = tipos[codigo];
  if (t?.classe) return t.classe;
  const desc = String(t?.descricao ?? "").toUpperCase();
  for (const [rx, classe] of [[/EMERG/, "Emergencial"], [/CORRET/, "Corretiva"], [/PREDIT|INSPE|CALIBR/, "Preditiva / inspeção"],
    [/PREVENT/, "Preventiva"], [/LUBRIF/, "Lubrificação"], [/MELHOR/, "Melhoria"], [/AUTONOM/, "Autônoma"]] as [RegExp, string][])
    if (rx.test(desc)) return classe;
  return desc ? "Outros" : "";
}

export function temEmergencial(d: Dados): boolean {
  return [...new Set(d.ordens.map((o) => o.tipo))].some((t) => classeTipo(t, d.tipos) === "Emergencial");
}

export interface HhExecutada { ordem: string; horas: number; fimReal: Dia | null; comPlano: boolean; classe: string; noIw38: boolean; centroTrabalho: string; np: string }

/** Horas realizadas com data: IW47 (apontamentos) ou, sem ela, operações concluídas do IW38OP. */
export function hhExecutadas(d: Dados): HhExecutada[] {
  const ref = new Map<string, Ordem>();
  for (const o of d.ordens) if (!ref.has(o.ordem)) ref.set(o.ordem, o);
  const classes = new Map<string, string>();
  const classe = (t: string) => { if (!classes.has(t)) classes.set(t, classeTipo(t, d.tipos)); return classes.get(t)!; };
  const linha = (ordem: string, horas: number, fimReal: Dia | null, tipoProprio: string, centro: string, np: string): HhExecutada => {
    const o = ref.get(ordem);
    const tipo = o ? o.tipo : tipoProprio;
    let c = classe(tipo);
    if (!o && c === "") c = FORA_DO_IW38;
    return { ordem, horas, fimReal, comPlano: o?.comPlano ?? false, classe: c, noIw38: !!o, centroTrabalho: centro, np };
  };
  if (d.conf?.length) return d.conf.map((c) => linha(c.ordem, c.horas, c.data, c.tipo, c.centroTrabalho, c.np));
  if (d.oper?.length) return d.oper.filter((o) => o.concluida && o.fimReal != null).map((o) => linha(o.ordem, o.horas, o.fimReal, o.tipo, o.centroTrabalho, ""));
  return [];
}

export const pessoasHh = (d: Dados) => memo(d, "pessoas_hh", (x) => hh.pessoas(x.equipe, x.disponibilidade, x.horasSemana));

/** Quem conta na capacidade (sem apoio/gestão e planejamento, ou como o Gerenciador de HH definir). */
export function tecnicos(d: Dados): Pessoa[] {
  if (!d.equipe?.length) return [];
  const contam = new Set(pessoasHh(d).filter((p) => p.contaNaCapacidade).map((p) => p.np));
  return d.equipe.filter((p) => contam.has(p.np));
}

/** Parte do período coberta pela IW47 (horas disponíveis só contam onde há apontamento). */
export function janelaApontamentos(d: Dados, ini: Dia, fim: Dia): [Dia, Dia] | null {
  const datas = (d.conf ?? []).map((c) => c.data).filter((x): x is Dia => x != null);
  if (datas.length) { ini = Math.max(ini, Math.min(...datas)); fim = Math.min(fim, Math.max(...datas)); }
  return fim >= ini ? [ini, fim] : null;
}

export function hhDisponiveis(d: Dados, ini: Dia, fim: Dia): number | null {
  const t = tecnicos(d);
  const jan = memo(d, `jan_ap_${ini}_${fim}`, (x) => janelaApontamentos(x, ini, fim));
  if (!t.length || !jan) return null;
  return hh.horasDisponiveis(pessoasHh(d), d.disponibilidade, jan[0], jan[1]);
}

/** (HH por semana, de onde veio): configurada por centro; sem configuração, média das 12 semanas anteriores. */
export function capacidadeSemanal(d: Dados, centros: string[] | null = null): [number | null, string] {
  const cap = Object.fromEntries(Object.entries(d.capacidade ?? {}).filter(([, v]) => Number(v) > 0).map(([c, v]) => [c, Number(v)]));
  if (Object.keys(cap).length) {
    if (centros?.length) {
      const s = centros.reduce((a, c) => a + (cap[c] ?? 0), 0);
      if (s) return [s, "configurada"];
    } else if ("" in cap) return [cap[""], "configurada"];
    else return [Object.values(cap).reduce((a, b) => a + b, 0), "configurada"];
  }
  let ex = memo(d, "hh_exec", hhExecutadas);
  if (centros?.length) { const cs = new Set(centros); ex = ex.filter((e) => cs.has(e.centroTrabalho)); }
  const recentes = ex.filter((e) => entre(e.fimReal, d.hoje - 84, d.hoje - 1));
  if (!recentes.length) return [null, "sem dados"];
  return [somaDe(recentes, (e) => e.horas) / 12, "média das últimas 12 semanas"];
}

// ----------------------------------------------------------------------------
// Cálculo
// ----------------------------------------------------------------------------
export const TIPO_QUEBRA = "YM11";
const FONTE: Record<string, "iw38" | "notas" | "hh"> = {
  ...Object.fromEntries(["pct_plano", "pct_emergencial", "no_prazo", "custo", "pct_custo_corr", "custo_medio"].map((x) => [x, "iw38" as const])),
  ...Object.fromEntries(["quebras", "mtbf", "mttr", "disponibilidade", "reincidencia", "quebras_a", "notas_7d", "semeq_detectadas",
    "semeq_com_ordem", "semeq_tratadas", "semeq_dias"].map((x) => [x, "notas" as const])),
  ...Object.fromEntries(["hh", "utilizacao", "pct_hh_plano", "hh_emergencial"].map((x) => [x, "hh" as const])),
};

/** Período que uma base cobre: do 1º percentil das datas (ignora registros antigos soltos) ao último. */
function janela(datas: (Dia | null)[]): [Dia, Dia] | null {
  const s = datas.filter((x): x is Dia => x != null).sort((a, b) => a - b);
  if (!s.length) return null;
  const pos = 0.01 * (s.length - 1), lo = Math.floor(pos);
  const q = s[lo] + (s[Math.ceil(pos)] - s[lo]) * (pos - lo);
  return [Math.floor(q), s[s.length - 1]];
}

/** Fração do período [ini, fim] coberta por cada base. */
export function cobertura(d: Dados, ini: Dia, fim: Dia): Record<"iw38" | "notas" | "hh", number> {
  const dias = Math.max(fim - ini + 1, 1);
  const jan = {
    iw38: memo(d, "jan_iw38", (x) => janela(validas(x.ordens).map((o) => o.data))),
    notas: memo(d, "jan_notas", (x) => (x.notas ? janela(x.notas.map((n) => n.data)) : null)),
    hh: memo(d, "jan_hh", (x) => janela(memo(x, "hh_exec", hhExecutadas).map((e) => e.fimReal))),
  };
  const out = { iw38: 0, notas: 0, hh: 0 };
  for (const kk of ["iw38", "notas", "hh"] as const) {
    const j = jan[kk];
    if (!j) continue;
    const a = Math.max(ini, j[0]), b = Math.min(fim, j[1]);
    out[kk] = b >= a ? Math.max(0, (b - a + 1) / dias) : 0;
  }
  return out;
}

export type Resultado = Record<string, number | null>;

/** Valor de cada indicador no período [ini, fim] (os de "foto" valem para hoje). */
export function calcular(d: Dados, ini: Dia, fim: Dia): Resultado {
  const r: Resultado = {};
  const ordens = memo(d, "validas", (x) => validas(x.ordens));
  // o que ainda não aconteceu não conta: o período vale até hoje
  let fimEf = Math.min(fim, d.hoje);
  if (fimEf < ini) fimEf = ini - 1;
  const per = ordens.filter((o) => entre(o.data, ini, fimEf));
  const dias = fimEf - ini + 1;

  // confiabilidade (quebra é ordem YM11: com filtro de tipo sem YM11 os indicadores de quebra não se aplicam)
  const temNotas = d.notas != null && (!d.tiposFiltro.length || d.tiposFiltro.includes(TIPO_QUEBRA));
  const q = temNotas ? memo(d, "quebras", quebras).filter((x) => entre(x.data, ini, fimEf)) : [];
  r.quebras = temNotas ? q.length : null;
  const comEq = q.filter((x) => x.equipChave !== "");
  r.mtbf = comEq.length ? div(dias * new Set(comEq.map((x) => x.equipChave)).size, comEq.length) : null;
  const rep = q.map((x) => x.horasReparo).filter((x): x is number => x != null && x > 0);
  r.mttr = rep.length ? rep.reduce((a, b) => a + b, 0) / rep.length : null;
  r.disponibilidade = r.mtbf != null && r.mttr != null ? ((r.mtbf * 24) / (r.mtbf * 24 + r.mttr)) * 100 : null;
  r.reincidencia = q.length ? div(q.filter((x) => x.reincidente).length, q.length, 100) : null;
  r.quebras_a = temNotas ? q.filter((x) => x.classeA).length : null;

  // planejamento
  r.pct_plano = div(per.filter((o) => o.comPlano).length, per.length, 100);
  r.pct_emergencial = Object.keys(d.tipos).length && memo(d, "tem_emerg", temEmergencial)
    ? div(per.filter((o) => classeTipo(o.tipo, d.tipos) === "Emergencial").length, per.length, 100) : null;
  if (d.chamadas?.length) {
    const venc = d.chamadas.filter((c) => entre(c.data, ini, fimEf) && c.data! <= d.hoje && c.situacao !== planos.SALTADA);
    r.aderencia = div(venc.filter((c) => c.situacao === planos.CONCLUIDA).length, venc.length, 100);
  } else r.aderencia = null;
  const fr = memo(d, "fim_real", (x) => fimRealPorOrdem(x.oper));
  if (fr.size) {
    const concl = per.filter((o) => o.situacao === "Concluída" && fr.has(o.ordem) && o.fim != null);
    r.no_prazo = div(concl.filter((o) => fr.get(o.ordem)! <= o.fim!).length, concl.length, 100);
  } else r.no_prazo = null;
  const bk = memo(d, "backlog", backlog);
  const [cap] = memo(d, "capacidade", (x) => capacidadeSemanal(x, x.centros.length ? x.centros : null));
  r.backlog_sem = d.oper != null && cap ? div(somaDe(bk, (b) => b.hhPendentes ?? 0), cap) : null;
  r.idade_backlog = bk.length ? bk.reduce((s, b) => s + b.idade, 0) / bk.length : null;
  if (d.notas != null && !d.tiposFiltro.length) {
    const nt = d.notas.filter((n) => entre(n.data, ini, fimEf) && n.dias != null && n.dias > 7);
    r.notas_7d = div(nt.filter((n) => !n.comOrdem).length, nt.length, 100);
  } else r.notas_7d = null;

  Object.assign(r, indicadoresAf(d, ini, fim), indicadoresSemeq(d, ini, fim));

  // mão de obra
  const ex = memo(d, "hh_exec", hhExecutadas).filter((e) => entre(e.fimReal, ini, fimEf));
  const total = somaDe(ex, (e) => e.horas);
  r.hh = d.conf != null || d.oper != null ? total : null;
  const conhecidas = ex.filter((e) => e.noIw38);
  const hhConh = somaDe(conhecidas, (e) => e.horas);
  r.pct_hh_plano = conhecidas.length ? div(somaDe(conhecidas.filter((e) => e.comPlano), (e) => e.horas), hhConh, 100) : null;
  r.hh_emergencial = conhecidas.length && Object.keys(d.tipos).length && memo(d, "tem_emerg", temEmergencial)
    ? div(somaDe(conhecidas.filter((e) => e.classe === "Emergencial"), (e) => e.horas), hhConh, 100) : null;
  r.cobertura_hh = total ? div(hhConh, total, 100) : null;
  const disp = hhDisponiveis(d, ini, fimEf);
  if (disp && d.conf != null && ex.length && !d.filtroAreaTipo) {
    const tec = new Set(tecnicos(d).map((p) => p.np));
    r.utilizacao = div(somaDe(ex.filter((e) => tec.has(e.np)), (e) => e.horas), disp, 100);
  } else r.utilizacao = null;

  // custos
  const custo = somaDe(per, (o) => o.custoReal);
  r.custo = dias > 0 ? custo / Math.max(dias / 30.44, 1) : null;
  r.pct_custo_corr = div(somaDe(per.filter((o) => !o.comPlano), (o) => o.custoReal), custo, 100);
  r.custo_medio = div(custo, per.filter((o) => o.custoReal !== 0).length);

  // suprimentos
  if (d.estoque) {
    r.itens_zerados = d.estoque.filter((e) => e.estoque <= 0).length;
    r.pecas_criticas = memo(d, "pecas_criticas", pecasCriticasEmFalta).length;
  } else r.itens_zerados = r.pecas_criticas = null;
  if (d.requisicoes?.length) {
    const p = d.requisicoes.filter((x) => x.pendente);
    r.req_dias = p.length ? media(p.map((x) => x.diasAguardando ?? NaN)) : 0;
  } else r.req_dias = null;

  // base que não cobre o período: valor vazio (não zero)
  const cob = dias > 0 ? cobertura(d, ini, fimEf) : { iw38: 0, notas: 0, hh: 0 };
  for (const [kk, fonte] of Object.entries(FONTE)) if (!cob[fonte]) r[kk] = null;
  for (const [kk, v] of Object.entries(cob)) r[`_cob_${kk}`] = v;
  return r;
}

/** Valores do período anterior só onde a base cobre ao menos metade dele. */
export function comparavel(anterior: Resultado, minimo = 0.5): Resultado {
  const out = { ...anterior };
  for (const [kk, fonte] of Object.entries(FONTE)) if ((anterior[`_cob_${fonte}`] ?? 0) < minimo) out[kk] = null;
  return out;
}

export const IDS_SEMEQ = ["semeq_detectadas", "semeq_com_ordem", "semeq_tratadas", "semeq_dias", "semeq_atrasadas"] as const;
export const anomaliasSemeq = (d: Dados) => memo(d, "semeq", (x) =>
  preditiva.anomalias(x.notas, x.ordens, x.oper, x.confTodos ?? x.conf, x.equipe, x.hoje));

export function indicadoresSemeq(d: Dados, ini: Dia, fim: Dia): Resultado {
  const vazio = Object.fromEntries(IDS_SEMEQ.map((x) => [x, null]));
  try {
    const an = anomaliasSemeq(d);
    if (!an.length) return vazio;
    const v = preditiva.indicadores(an, ini, fim) as unknown as Record<string, number | null>;
    return Object.fromEntries(IDS_SEMEQ.map((x) => [x, v[x] ?? null]));
  } catch {
    return vazio; // falha da preditiva deixa só os 5 indicadores dela sem valor
  }
}

export const IDS_AF = ["taxa_quebra_a", "af_execucao", "af_no_prazo", "af_atrasadas"] as const;
export const IDS_ACOES_AF = ["acoes_execucao", "acoes_no_prazo", "acoes_atrasadas"] as const;

export function indicadoresAf(d: Dados, ini: Dia, fim: Dia): Resultado {
  const r: Resultado = Object.fromEntries([...IDS_AF, ...IDS_ACOES_AF].map((x) => [x, null]));
  if (d.afs == null && d.acoesAf == null) return r;
  const v = af.indicadores(d.afs ?? [], d.acoesAf ?? [], ini, fim, d.hoje) as unknown as Record<string, number | null>;
  if (d.afs != null) for (const x of IDS_AF) r[x] = v[x] ?? null;
  if (d.acoesAf != null) for (const x of IDS_ACOES_AF) r[x] = v[x] ?? null;
  return r;
}

export interface PecaCritica { material: string; descricao: string; estoque: number; minimo: number | null; equipamentos: string }

/** Materiais vinculados a equipamentos de criticidade Alta sem saldo suficiente. */
export function pecasCriticasEmFalta(d: Dados): PecaCritica[] {
  if (!d.estoque) return [];
  const usados = new Map<string, string[]>();
  for (const [eq, v] of Object.entries(d.cadEq)) {
    if (v?.criticidade !== "Alta") continue;
    for (const m of (v.materiais as string[] | undefined) ?? []) (usados.get(m) ?? usados.set(m, []).get(m)!).push(eq);
  }
  if (!usados.size) return [];
  const est = new Map(d.estoque.map((e) => [e.material, e]));
  const out: PecaCritica[] = [];
  for (const [m, eqs] of usados) {
    const e = est.get(m);
    const q = e ? e.estoque : 0;
    const minimo = Number((d.cadMat[m] as { minimo?: unknown } | undefined)?.minimo) || null;
    if (q <= 0 || (minimo && q < minimo)) out.push({ material: m, descricao: e ? e.descricao : "fora do MB52", estoque: q, minimo, equipamentos: eqs.join(", ") });
  }
  return out;
}

export function periodoAnterior(ini: Dia, fim: Dia): [Dia, Dia] {
  const dias = fim - ini + 1;
  return [ini - dias, ini - 1];
}

/** Série mês a mês dos indicadores mensais (mês = 1º dia). */
export function mensal(d: Dados, ini: Dia, fim: Dia): { mes: Dia; valores: Resultado }[] {
  const out: { mes: Dia; valores: Resultado }[] = [];
  for (let m = inicioDoMes(ini); m <= fim; m = somarMeses(m, 1)) {
    const fimMes = somarMeses(m, 1) - 1;
    const v = calcular(d, Math.max(m, ini), Math.min(fimMes, fim));
    out.push({ mes: m, valores: Object.fromEntries(KPIS.filter((x) => x.mensal).map((x) => [x.id, v[x.id] ?? null])) });
  }
  return out;
}

// ----------------------------------------------------------------------------
// Metas e farol
// ----------------------------------------------------------------------------
export type Farol = "verde" | "amarelo" | "vermelho" | "neutro";
export const NOME_FAROL: Record<Farol, string> = { verde: "Na meta", amarelo: "Atenção", vermelho: "Fora da meta", neutro: "Sem meta" };

export function meta(kpi: Kpi, metas: Cadastro | null | undefined): number | null {
  const m = metas?.[kpi.id];
  if (m && typeof m === "object" && "meta" in m) return m.meta == null || m.meta === "" ? null : Number(m.meta);
  return kpi.meta;
}

/** Verde = atinge a meta; amarelo = até 10% pior; vermelho = pior que isso. */
export function farol(kpi: Kpi, valor: number | null | undefined, alvo: number | null, tolerancia = 0.1): Farol {
  if (valor == null || alvo == null || Number.isNaN(valor)) return "neutro";
  const folga = alvo ? Math.abs(alvo) * tolerancia : tolerancia;
  if (kpi.sentido > 0) return valor >= alvo ? "verde" : valor >= alvo - folga ? "amarelo" : "vermelho";
  return valor <= alvo ? "verde" : valor <= alvo + folga ? "amarelo" : "vermelho";
}

/** (variação, melhorou?) — pontos para %, absoluta para contagens, relativa (%) para o resto; "foto" não tem. */
export function variacao(kpi: Kpi, atual: number | null | undefined, anterior: number | null | undefined): [number | null, boolean | null] {
  if (atual == null || anterior == null || kpi.foto) return [null, null];
  let delta: number;
  if (kpi.unidade === "%" || kpi.unidade === "un") delta = atual - anterior;
  else if (anterior) delta = ((atual - anterior) / Math.abs(anterior)) * 100;
  else return [null, null];
  if (Math.abs(delta) < 1e-9) return [0, null];
  return [delta, delta > 0 === kpi.sentido > 0];
}

const nf = (casas: number) => new Intl.NumberFormat("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas });
export function formatar(kpi: Pick<Kpi, "unidade">, valor: number | null | undefined): string {
  if (valor == null || Number.isNaN(valor)) return "—";
  switch (kpi.unidade) {
    case "%": return `${nf(1).format(valor)}%`;
    case "R$":
      if (Math.abs(valor) >= 1e6) return `R$ ${nf(2).format(valor / 1e6)} mi`;
      if (Math.abs(valor) >= 1e4) return `R$ ${nf(1).format(valor / 1e3)} mil`;
      return `R$ ${nf(0).format(valor)}`;
    case "h": case "dias": case "sem": return `${nf(valor < 100 ? 1 : 0).format(valor)} ${kpi.unidade}`;
    default: return nf(0).format(valor);
  }
}

// ----------------------------------------------------------------------------
// Parâmetros gravados no site (cadastro metas_wcm.json)
// ----------------------------------------------------------------------------
export const CLASSES_TIPO = ["Preventiva", "Preditiva / inspeção", "Lubrificação", "Autônoma", "Corretiva", "Emergencial", "Melhoria", "Outros"];
export const PLANEJADAS = ["Preventiva", "Preditiva / inspeção", "Lubrificação", "Autônoma"];
export const ARQ_METAS = "metas_wcm.json";

export function horasSemanaDe(cad: Cadastro | null | undefined): number {
  const v = Number((cad?._parametros as { horas_semana?: unknown } | undefined)?.horas_semana);
  return Number.isFinite(v) && v > 0 ? v : 44;
}

export function capacidadeDe(cad: Cadastro | null | undefined): Record<string, number> {
  return Object.fromEntries(Object.entries(cad ?? {}).filter(([kk, v]) => kk.startsWith("capacidade:") && v && v.hh != null && v.hh !== "")
    .map(([kk, v]) => [kk.split(":").slice(1).join(":"), Number(v.hh)]));
}

/** Tipos de ordem: o cadastrado no site vale; `padrao` (código → descrição) completa os que faltam. */
export function tiposDe(cad: Cadastro | null | undefined, padrao: Record<string, string> = {}): Record<string, TipoOrdem> {
  const out: Record<string, TipoOrdem> = Object.fromEntries(Object.entries(padrao).map(([c, dsc]) => [c, { descricao: dsc, classe: "" }]));
  for (const [kk, v] of Object.entries(cad ?? {})) {
    if (!kk.startsWith("tipo:") || !v || typeof v !== "object") continue;
    const c = kk.split(":").slice(1).join(":");
    out[c] = { descricao: String(v.descricao || out[c]?.descricao || ""), classe: String(v.classe || "") };
  }
  return out;
}

export function rotuloTipo(codigo: string, tipos: Record<string, TipoOrdem>): string {
  const t = tipos[codigo];
  return t?.descricao ? `${codigo} · ${t.descricao}` : codigo;
}

/** "Jan/26" */
export function mesTxt(m: Dia): string {
  const p = partes(m);
  return `${["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"][p.mes - 1]}/${String(p.ano).slice(2)}`;
}
