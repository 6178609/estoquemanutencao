import { semAcento } from "../dados/texto";
import type { Confirmacao, Operacao, Ordem, Pessoa } from "./preparo";
import { hoje as hojeLocal, partes, soma, type Dia } from "./util";

/**
 * Execução das atividades — operações do IW38OP × ordens do IW38 × apontamentos da
 * IW47 (quem fez o quê). Convenções:
 * - Atividade = operação do IW38OP; a data programada é a "1ª data de início" (`inicio`).
 * - Executada = operação confirmada (CONF/ENTE/ENCE no status do sistema); cancelada (ELIM/DLFL/MREL) não conta.
 *   O status vale pelo IW38OP ou pela IW47 (que costuma ser exportada depois e já traz CONF ENTE), e a ordem
 *   encerrada no IW38 encerra as suas operações.
 * - Status com CONF = confirmada no SAP; "Encerrada sem confirmação" só quando não há CONF nem apontamento na IW47.
 * - A operação se liga ao apontamento da IW47 por ordem + nº da operação (zeros à esquerda ignorados).
 * - Taxa de execução = executadas (confirmadas ou com apontamento) ÷ programadas com data até hoje (as futuras
 *   ainda não venceram); as encerradas sem confirmação não contam como executadas.
 */

export const EXECUTADA = "Executada", SEM_APONTAMENTO = "Encerrada sem confirmação", ATRASADA = "Atrasada",
  PROGRAMADA = "Programada", CANCELADA = "Cancelada";
export const SITUACOES = [EXECUTADA, SEM_APONTAMENTO, ATRASADA, PROGRAMADA, CANCELADA] as const;
export type SituacaoAtividade = (typeof SITUACOES)[number];
export const CONCLUIDA_ST = new Set(["CONF", "ENTE", "ENCE"]);
export const CANCELADA_ST = new Set(["ELIM", "DLFL", "MREL", "MEEL"]);
export const COR: Record<SituacaoAtividade, string> = {
  [EXECUTADA]: "#0E9F46", [SEM_APONTAMENTO]: "#9BC53D", [ATRASADA]: "#E3262B", [PROGRAMADA]: "#0A6EBD",
  [CANCELADA]: "#B0B6B3",
};

/** Nº da operação sem zeros à esquerda ("0010" = "10"). */
export const nOp = (v: unknown) => String(v ?? "").trim().replace(/^0+/, "");

/** [ini, fim] em dias inteiros (sem data = fora). */
export const entre = (d: Dia | null | undefined, ini: Dia, fim: Dia) => d != null && d >= ini && d <= fim;

/** Tokens únicos, na ordem em que aparecem ("CONF ENTE" + "CONF LIB" → "CONF ENTE LIB"). */
const unicos = (t: string) => [...new Set(t.split(/\s+/).filter(Boolean))].join(" ");
const juntarUnicos = (xs: string[]) => [...new Set(xs.filter(Boolean))].join(", ");
const media = (xs: number[]) => (xs.length ? soma(xs) / xs.length : null);
/** Menor e maior data (sem espalhar o array: a IW47 tem centenas de milhares de linhas). */
function extremos(xs: Iterable<Dia | null>): [Dia, Dia] | null {
  let lo = Infinity, hi = -Infinity;
  for (const x of xs) if (x != null) { if (x < lo) lo = x; if (x > hi) hi = x; }
  return lo === Infinity ? null : [lo, hi];
}

/** Segunda-feira da semana da data. */
export const segundaDe = (d: Dia): Dia => d - ((partes(d).semana + 6) % 7);

// ----------------------------------------------------------------------------
// Apontamentos (IW47) com o nome da pessoa
// ----------------------------------------------------------------------------
export interface Apontamento extends Confirmacao {
  pessoa: string; // nome da Gestão de HH; sem cadastro, o nome da IW47; sem ele, a matrícula
  op: string;     // nº da operação sem zeros à esquerda
}

export function nomes(equipe: Pessoa[] | null | undefined): Map<string, string> {
  const m = new Map<string, string>();
  for (const p of equipe ?? []) if (p.nome) m.set(p.np, p.nome);
  return m;
}

/** IW47 com o nome da pessoa (planilha de Gestão de HH; sem cadastro, a matrícula). */
export function apontamentos(conf: Confirmacao[] | null | undefined, equipe: Pessoa[] | null = null): Apontamento[] {
  if (!conf?.length) return [];
  const nm = nomes(equipe);
  return conf.map((c) => ({ ...c, pessoa: nm.get(c.np) || c.nome || c.np, op: nOp(c.operacao) }));
}

// ----------------------------------------------------------------------------
// Operações com situação, horas reais e quem apontou
// ----------------------------------------------------------------------------
export interface Atividade extends Operacao {
  op: string;
  hhReal: number | null;              // horas apontadas na IW47 (null = sem apontamento)
  executadoPor: string;               // "ANA, BRUNO"
  executantes: number;
  ultimoApontamento: Dia | null;
  statusIw47: string;
  comApontamento: boolean;
  comPlano: boolean;
  natureza: string | null;            // da ordem no IW38 (null = ordem fora do IW38)
  area: string | null;                // Localização da ordem
  textoOrdem: string | null;
  situacaoOrdem: string | null;
  statusSap: string;                  // IW38OP + IW47
  confirmada: boolean;
  situacao: SituacaoAtividade;
  executada: boolean;
  diasAposProgramacao: number | null; // fim real − data programada (só concluídas, ≥ 0)
}

/** Ordena pela data (sem data no fim), mantendo a ordem original nos empates. */
function porData<T>(xs: T[], d: (x: T) => Dia | null, desc = false): T[] {
  return xs.map((x, i) => [x, i] as const).sort(([a, i], [b, j]) => {
    const da = d(a), db = d(b);
    if (da == null || db == null) return da == null && db == null ? i - j : da == null ? 1 : -1;
    return (desc ? db - da : da - db) || i - j;
  }).map(([x]) => x);
}

/** Uma linha por operação, com a situação, as horas reais e quem apontou (ordenado por data programada). */
export function operacoes(oper: Operacao[] | null | undefined, ordens: Ordem[] | null | undefined,
  conf: Confirmacao[] | null | undefined, equipe: Pessoa[] | null = null, hoje: Dia = hojeLocal()): Atividade[] {
  if (!oper?.length) return [];
  const ap = apontamentos(conf, equipe);
  const grupos = new Map<string, { horas: number; pessoas: string[]; nps: Set<string>; ultimo: Dia | null; st: string[] }>();
  for (const a of ap) {
    const k = `${a.ordem}\u0000${a.op}`;
    let g = grupos.get(k);
    if (!g) grupos.set(k, (g = { horas: 0, pessoas: [], nps: new Set(), ultimo: null, st: [] }));
    g.horas += a.horas;
    g.pessoas.push(a.pessoa);
    if (a.np) g.nps.add(a.np);
    if (a.data != null && (g.ultimo == null || a.data > g.ultimo)) g.ultimo = a.data;
    g.st.push(a.statusSistema);
  }
  const ref = new Map<string, Ordem>();
  for (const o of ordens ?? []) if (!ref.has(o.ordem)) ref.set(o.ordem, o);
  const temOrdens = !!ordens?.length;

  const out = oper.map((o): Atividade => {
    const op = nOp(o.operacao);
    const g = grupos.get(`${o.ordem}\u0000${op}`);
    const executadoPor = g ? juntarUnicos(g.pessoas) : "";
    const statusIw47 = g ? unicos(g.st.join(" ")) : "";
    const r = temOrdens ? ref.get(o.ordem) : undefined;
    const situacaoOrdem = r ? r.situacao : null;
    // status do SAP: IW38OP + IW47 (mais recente) + ordem encerrada/cancelada no IW38
    const statusSap = unicos(`${o.statusSistema} ${statusIw47}`);
    const toks = new Set(statusSap.split(" ").filter(Boolean));
    const tem = (s: Set<string>) => [...toks].some((t) => s.has(t));
    const cancelada = o.cancelada || tem(CANCELADA_ST) || situacaoOrdem === "Cancelada";
    const concluida = o.concluida || tem(CONCLUIDA_ST) || situacaoOrdem === "Concluída"
      || situacaoOrdem === "Encerrada sem confirmação";
    const confirmada = toks.has("CONF") || situacaoOrdem === "Concluída";
    const comApontamento = executadoPor !== "";
    const ultimoApontamento = g?.ultimo ?? null;
    const fimReal = o.fimReal != null || !concluida ? o.fimReal : ultimoApontamento;
    const situacao: SituacaoAtividade = cancelada ? CANCELADA
      : concluida && (confirmada || comApontamento) ? EXECUTADA
      : concluida ? SEM_APONTAMENTO
      : o.inicio != null && o.inicio < hoje ? ATRASADA : PROGRAMADA;
    const atraso = fimReal != null && o.inicio != null ? fimReal - o.inicio : null;
    return {
      ...o, op, hhReal: g ? g.horas : null, executadoPor, executantes: g ? g.nps.size : 0, ultimoApontamento,
      statusIw47, comApontamento, comPlano: r ? r.comPlano : false,
      natureza: r ? r.natureza : null, area: r ? r.localizacao : null, textoOrdem: r ? r.texto : null, situacaoOrdem,
      statusSap, cancelada, concluida, confirmada, fimReal, situacao, executada: situacao === EXECUTADA,
      diasAposProgramacao: concluida && atraso != null && atraso >= 0 ? atraso : null,
    };
  });
  return porData(out, (x) => x.inicio);
}

// ----------------------------------------------------------------------------
// Indicadores do período
// ----------------------------------------------------------------------------
export interface IndicadoresExecucao {
  encerradas_sem_conf: number; programadas: number; devidas: number; executadas: number; atrasadas: number;
  taxa_execucao: number | null;
  janela_iw47: [Dia, Dia] | null;     // período coberto pela IW47 (rastreadas/HH só valem dentro dele)
  rastreadas: number | null; hh_programadas: number; hh_executadas_plan: number; hh_reais: number;
  aderencia_hh: number | null; dias_apos_programacao: number | null;
  ordens_devidas: number; ordens_concluidas: number; taxa_ordens: number | null;
  pessoas: number | null; hh_apontadas: number | null;
}

const RX_CONF = /(?:^|\s)CONF(?:\s|$)/, RX_ENTE = /(?:^|\s)ENTE(?:\s|$)/;

/** Execução no período [ini, fim] pela data programada (operações) e pela data-base (ordens). */
export function indicadores(ops: Atividade[], ordens: Ordem[] | null | undefined, confAp: Apontamento[] | null | undefined,
  ini: Dia, fim: Dia, hoje: Dia = hojeLocal()): IndicadoresExecucao {
  const per = ops.filter((o) => o.situacao !== CANCELADA && entre(o.inicio, ini, fim));
  const devidas = per.filter((o) => o.inicio! <= hoje);
  // executada = confirmada (CONF) ou com apontamento; encerrada sem confirmação conta à parte
  const feitas = devidas.filter((o) => o.situacao === EXECUTADA);
  // quem fez e horas reais só existem onde a IW47 cobre: compara dentro dessa janela
  const cobertura = extremos((confAp ?? []).map((a) => a.data));
  const janela = cobertura && feitas.length ? cobertura : null;
  const naJanela = janela ? feitas.filter((o) => entre(o.fimReal ?? o.inicio, janela[0], janela[1])) : [];
  const hhPlan = soma(naJanela.map((o) => o.horas));
  const hhReais = soma(naJanela.map((o) => o.hhReal ?? 0));
  const dias = feitas.map((o) => o.diasAposProgramacao).filter((d): d is number => d != null);
  const r: IndicadoresExecucao = {
    encerradas_sem_conf: devidas.filter((o) => o.situacao === SEM_APONTAMENTO).length,
    programadas: per.length, devidas: devidas.length, executadas: feitas.length,
    atrasadas: devidas.filter((o) => o.situacao === ATRASADA).length,
    taxa_execucao: devidas.length ? (feitas.length / devidas.length) * 100 : null,
    janela_iw47: janela,
    rastreadas: naJanela.length ? (naJanela.filter((o) => o.comApontamento).length / naJanela.length) * 100 : null,
    hh_programadas: soma(devidas.map((o) => o.horas)), hh_executadas_plan: hhPlan, hh_reais: hhReais,
    aderencia_hh: hhPlan ? (hhReais / hhPlan) * 100 : null, dias_apos_programacao: media(dias),
    ordens_devidas: 0, ordens_concluidas: 0, taxa_ordens: null, pessoas: null, hh_apontadas: null,
  };
  if (ordens?.length) {
    const o = ordens.filter((x) => x.situacao !== "Cancelada" && entre(x.data, ini, fim) && x.data! <= hoje);
    // a IW47 costuma ser mais recente que o IW38: CONF + ENTE nela (mesmo em linhas diferentes) também encerra a ordem
    const conf = new Set<string>(), ente = new Set<string>();
    for (const a of confAp ?? []) {
      if (RX_CONF.test(a.statusSistema)) conf.add(a.ordem);
      if (RX_ENTE.test(a.statusSistema)) ente.add(a.ordem);
    }
    r.ordens_devidas = o.length;
    r.ordens_concluidas = o.filter((x) => x.situacao === "Concluída" || (conf.has(x.ordem) && ente.has(x.ordem))).length;
    r.taxa_ordens = o.length ? (r.ordens_concluidas / o.length) * 100 : null;
  }
  if (confAp?.length) {
    const a = confAp.filter((x) => entre(x.data, ini, fim));
    r.pessoas = new Set(a.map((x) => x.np)).size;
    r.hh_apontadas = soma(a.map((x) => x.horas));
  }
  return r;
}

/** Período anterior de mesma duração (para a variação dos cartões). */
export function periodoAnterior(ini: Dia, fim: Dia): [Dia, Dia] {
  return [ini - (fim - ini) - 1, ini - 1];
}

// ----------------------------------------------------------------------------
// Por semana, por grupo e por pessoa
// ----------------------------------------------------------------------------
export interface SemanaExecucao { semana: Dia; programadas: number; executadas: number; taxa: number | null }

/** Por semana (segunda a domingo) da data programada: programadas, executadas e taxa (só o que já venceu). */
export function semanal(ops: Atividade[], ini: Dia, fim: Dia, hoje: Dia = hojeLocal()): SemanaExecucao[] {
  const m = new Map<Dia, { p: number; e: number; dev: number; devE: number }>();
  for (const o of ops) {
    if (o.situacao === CANCELADA || !entre(o.inicio, ini, fim)) continue;
    const s = segundaDe(o.inicio!);
    let g = m.get(s);
    if (!g) m.set(s, (g = { p: 0, e: 0, dev: 0, devE: 0 }));
    g.p++;
    if (o.executada) g.e++;
    if (o.inicio! <= hoje) { g.dev++; if (o.executada) g.devE++; }
  }
  return [...m.entries()].sort(([a], [b]) => a - b).map(([semana, g]) => ({
    semana, programadas: g.p, executadas: g.e, taxa: g.dev ? (g.devE / g.dev) * 100 : null,
  }));
}

export type CampoGrupo = "setor" | "centroTrabalho" | "natureza" | "area";
export interface GrupoExecucao {
  grupo: string; programadas: number; executadas: number; atrasadas: number; hhProgramadas: number; taxa: number;
}

/** Taxa por setor / centro / tipo de trabalho / área das operações devidas no período (sem grupo = "—"). */
export function execucaoPor(ops: Atividade[], campo: CampoGrupo, ini: Dia, fim: Dia, hoje: Dia = hojeLocal()): GrupoExecucao[] {
  const m = new Map<string, GrupoExecucao>();
  for (const o of ops) {
    if (o.situacao === CANCELADA || !entre(o.inicio, ini, fim) || o.inicio! > hoje) continue;
    const v = o[campo];
    const k = campo === "natureza" || campo === "area" ? v || "—" : (v ?? "");
    let g = m.get(k);
    if (!g) m.set(k, (g = { grupo: k, programadas: 0, executadas: 0, atrasadas: 0, hhProgramadas: 0, taxa: 0 }));
    g.programadas++;
    if (o.executada) g.executadas++;
    if (o.situacao === ATRASADA) g.atrasadas++;
    g.hhProgramadas += o.horas;
  }
  const t = [...m.values()].sort((a, b) => (a.grupo < b.grupo ? -1 : a.grupo > b.grupo ? 1 : 0));
  for (const g of t) g.taxa = (g.executadas / g.programadas) * 100;
  return t.sort((a, b) => b.programadas - a.programadas);
}

export interface PessoaExecucao {
  np: string; pessoa: string; hhApontadas: number; ordens: number; operacoes: number; diasComApontamento: number;
  ultimoApontamento: Dia | null; pctHhEmPlano: number | null; centroMaisApontado: string;
  cargo: string; area: string; turma: string;
}

/** Valor mais frequente (empate: o menor). */
function moda(xs: string[]): string {
  const n = new Map<string, number>();
  for (const x of xs) n.set(x, (n.get(x) ?? 0) + 1);
  let best = "", max = 0;
  for (const [k, c] of n) if (c > max || (c === max && k < best)) { best = k; max = c; }
  return best;
}

/** Quem fez o quê no período (pela data do apontamento): HH, ordens, operações e % em plano. */
export function porPessoa(confAp: Apontamento[] | null | undefined, ops: Atividade[], equipe: Pessoa[] | null | undefined,
  ini: Dia, fim: Dia): PessoaExecucao[] {
  const a = (confAp ?? []).filter((x) => entre(x.data, ini, fim));
  if (!a.length) return [];
  const plano = new Map<string, boolean>();
  for (const o of ops) if (!plano.has(o.ordem)) plano.set(o.ordem, o.comPlano);
  const cad = new Map((equipe ?? []).map((p) => [p.np, p]));
  const g = new Map<string, Apontamento[]>();
  for (const x of a) (g.get(x.np) ?? g.set(x.np, []).get(x.np)!).push(x);
  const t = [...g.entries()].sort(([x], [y]) => (x < y ? -1 : x > y ? 1 : 0)).map(([np, xs]): PessoaExecucao => {
    let hPlano = 0, hConh = 0;  // ordem fora do IW38OP não entra no % em plano
    for (const x of xs) {
      const p = plano.get(x.ordem);
      if (p === true) hPlano += x.horas;
      if (p !== undefined) hConh += x.horas;
    }
    const datas = xs.map((x) => x.data).filter((d): d is Dia => d != null);
    const p = cad.get(np);
    return {
      np, pessoa: xs[0].pessoa, hhApontadas: soma(xs.map((x) => x.horas)), ordens: new Set(xs.map((x) => x.ordem)).size,
      operacoes: new Set(xs.map((x) => `${x.ordem}/${x.op}`)).size, diasComApontamento: new Set(datas).size,
      ultimoApontamento: extremos(datas)?.[1] ?? null, pctHhEmPlano: hConh > 0 ? (hPlano / hConh) * 100 : null,
      centroMaisApontado: moda(xs.map((x) => x.centroTrabalho)), cargo: p?.cargo ?? "", area: p?.area ?? "", turma: p?.turma ?? "",
    };
  });
  return t.sort((x, y) => y.hhApontadas - x.hhApontadas);
}

export interface ApontamentoDaPessoa extends Apontamento {
  textoOperacao: string | null; equipamento: string; objeto: string | null; situacao: SituacaoAtividade | null;
  natureza: string | null;
}

/** Os apontamentos de uma pessoa no período com a atividade (texto, equipamento, situação), mais recentes primeiro. */
export function atividadesDaPessoa(confAp: Apontamento[], ops: Atividade[], np: string, ini: Dia, fim: Dia): ApontamentoDaPessoa[] {
  const info = new Map<string, Atividade>();
  for (const o of ops) { const k = `${o.ordem}/${o.op}`; if (!info.has(k)) info.set(k, o); }
  const xs = confAp.filter((x) => x.np === np && entre(x.data, ini, fim)).map((x) => {
    const o = info.get(`${x.ordem}/${x.op}`);
    return { ...x, textoOperacao: o?.textoOperacao ?? null, equipamento: o ? o.equipamento : x.equipamento,
      objeto: o?.objeto ?? null, situacao: o?.situacao ?? null, natureza: o?.natureza ?? null };
  });
  return porData(xs, (x) => x.data, true);
}

// ----------------------------------------------------------------------------
// Recortes e lista de atividades (filtros da tela)
// ----------------------------------------------------------------------------
/** Centros de trabalho com operação (para o filtro). */
export const centrosDasAtividades = (ops: Atividade[]) => [...new Set(ops.map((o) => o.centroTrabalho).filter(Boolean))].sort();

/** Filtra a execução pelos centros: operações e apontamentos do centro e ordens com operação nele (ou do centro). */
export function recortarPorCentros(ops: Atividade[], ap: Apontamento[], ordens: Ordem[] | null, centros: string[]):
  { ops: Atividade[]; ap: Apontamento[]; ordens: Ordem[] | null } {
  if (!centros.length) return { ops, ap, ordens };
  const cs = new Set(centros);
  const o = ops.filter((x) => cs.has(x.centroTrabalho));
  const comOp = new Set(o.map((x) => x.ordem));
  return { ops: o, ap: ap.filter((x) => cs.has(x.centroTrabalho)),
    ordens: ordens ? ordens.filter((x) => comOp.has(x.ordem) || cs.has(x.centroTrabalho)) : null };
}

/** Pessoas que aparecem em "Executado por" (para o filtro). */
export function pessoasDasAtividades(ops: Atividade[]): string[] {
  const s = new Set<string>();
  for (const o of ops) for (const n of o.executadoPor.split(",")) if (n.trim()) s.add(n.trim());
  return [...s].sort();
}

export interface FiltroAtividades { busca?: string; situacoes?: string[]; pessoas?: string[] }

/** Atividades programadas no período, com busca (ordem, atividade, equipamento, objeto, pessoa), situação e pessoa. */
export function filtrarAtividades(ops: Atividade[], ini: Dia, fim: Dia, f: FiltroAtividades = {}): Atividade[] {
  const termos = semAcento(f.busca ?? "").toUpperCase().split(/\s+/).filter(Boolean);
  const sits = f.situacoes?.length ? new Set(f.situacoes) : null;
  const pes = f.pessoas?.length ? f.pessoas : null;
  return ops.filter((o) => {
    if (!entre(o.inicio, ini, fim)) return false;
    if (sits && !sits.has(o.situacao)) return false;
    if (pes) { const quem = o.executadoPor.split(", "); if (!pes.some((p) => quem.includes(p))) return false; }
    if (termos.length) {
      const hay = semAcento(`${o.ordem} ${o.textoOperacao} ${o.equipamento} ${o.objeto} ${o.executadoPor}`).toUpperCase();
      if (!termos.every((t) => hay.includes(t))) return false;
    }
    return true;
  });
}

/** Quantas atividades em cada situação (na ordem de SITUACOES; só as que aparecem). */
export function contarSituacoes(ops: Atividade[]): { situacao: SituacaoAtividade; n: number }[] {
  return SITUACOES.map((s) => ({ situacao: s, n: ops.filter((o) => o.situacao === s).length })).filter((x) => x.n);
}
