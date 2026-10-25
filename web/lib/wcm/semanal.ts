import { semAcento } from "../dados/texto";
import { CANCELADA, segundaDe, type Atividade } from "./execucao";
import { dataBr, dia, hoje as hojeLocal, partes, soma, type Dia } from "./util";

/**
 * Programação semanal : carga × capacidade por centro de trabalho, o que entra na
 * semana, o que pode completar a folga e a aderência à programação das semanas anteriores (SMRP "schedule
 * compliance"). Convenções:
 * - Semana de segunda a domingo; a atividade é a operação do IW38OP pela data programada (1ª data de início).
 * - Carga = trabalho planejado (HH) das operações não canceladas programadas na semana.
 * - Capacidade do centro (HH/semana): a configurada em Metas e parâmetros; sem ela, técnicos da Gestão de HH
 *   daquele centro × jornada semanal; sem equipe cadastrada, a média apontada (IW47) nas 12 semanas anteriores.
 * - Aderência da semana = operações programadas nela e concluídas até o domingo dela ÷ programadas (também em HH).
 *   Reprogramar a data no SAP move a operação de semana — por isso o histórico vale como tendência.
 * - Pronta para executar = ordem Liberada no SAP (Aberta ainda não foi liberada).
 */

export const DIAS = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"] as const;
type DiaSemana = (typeof DIAS)[number];
const PESO_CRITICIDADE: Record<string, number> = { Alta: 0, "Média": 1, Baixa: 2 };
/** SMRP: 90% ou mais da programação cumprida na semana é classe mundial. */
export const META_ADERENCIA = 90;

/** Segunda-feira da semana da data. */
export const segunda = segundaDe;

/** Dia da semana com segunda = 0. */
const diaDaSemana = (d: Dia) => (partes(d).semana + 6) % 7;

export function semanasParaEscolher(hoje: Dia, antes = 8, depois = 6): Dia[] {
  const s = segunda(hoje);
  const out: Dia[] = [];
  for (let k = -antes; k <= depois; k++) out.push(s + 7 * k);
  return out;
}

/** De quinta-feira em diante a página já abre na próxima semana (a que está sendo programada). */
export const semanaPadrao = (hoje: Dia): Dia => segunda(hoje) + (diaDaSemana(hoje) >= 3 ? 7 : 0);

/** Semana ISO (01–53) da data. */
function semanaIso(d: Dia): number {
  const quinta = d - diaDaSemana(d) + 3;
  const jan1 = dia(partes(quinta).ano, 1, 1)!;
  return Math.floor((quinta - jan1) / 7) + 1;
}

/** "Semana 41 · 05/10 a 11/10/2026 · esta semana" */
export function rotuloSemana(seg: Dia, hoje: Dia): string {
  const sufixo = ({ 0: " · esta semana", 1: " · próxima semana", [-1]: " · semana passada" } as Record<number, string>)[
    Math.floor((seg - segunda(hoje)) / 7)] ?? "";
  return `Semana ${String(semanaIso(seg)).padStart(2, "0")} · ${dataBr(seg).slice(0, 5)} a ${dataBr(seg + 6)}${sufixo}`;
}

const naSemana = (d: Dia | null, seg: Dia) => d != null && d >= seg && d < seg + 7;
const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

// ----------------------------------------------------------------------------
// O que está programado na semana
// ----------------------------------------------------------------------------
interface Programada extends Atividade { dia: DiaSemana; pronta: boolean }

/** Operações (não canceladas) com a data programada na semana, com o dia e se a ordem está liberada. */
export function programadas(ops: Atividade[] | null | undefined, seg: Dia): Programada[] {
  const s = segunda(seg);
  return (ops ?? [])
    .filter((o) => o.situacao !== CANCELADA && naSemana(o.inicio, s))
    .map((o) => ({ ...o, dia: DIAS[diaDaSemana(o.inicio!)], pronta: o.situacaoOrdem === "Liberada" || o.concluida }))
    .sort((a, b) => a.inicio! - b.inicio! || cmp(a.centroTrabalho, b.centroTrabalho) || cmp(a.ordem, b.ordem)
      || cmp(a.operacao, b.operacao));
}

// ----------------------------------------------------------------------------
// Capacidade e carga
// ----------------------------------------------------------------------------
interface Capacidade { centroTrabalho: string; capacidade: number | null; origem: string }
/** Horas realizadas com data (IW47 ou operações concluídas do IW38OP) */
interface HorasExecutadas { centroTrabalho: string; horas: number; fimReal: Dia | null }

/** Arredondamento sem casas (empate exato vai para o par). */
function inteiroPy(x: number): string {
  const r = Math.round(x);
  return String(Math.abs(x % 1) === 0.5 && r % 2 !== 0 ? r - 1 : r);
}

/**
 * Capacidade semanal (HH) de cada centro e de onde ela veio. `disponivel` = {centro: [horas, técnicos]} do
 * Gerenciador de HH para a semana (jornada, % disponível e ausências de cada um): vale no lugar de técnicos × jornada.
 */
export function capacidade(centros: string[], equipe: { centroTrabalho: string }[] | null | undefined, horasSemana: number,
  configurada: Record<string, number | string | null | undefined> | null = null,
  executadas: HorasExecutadas[] | null = null, hoje: Dia = hojeLocal(),
  disponivel: Record<string, [number, number]> | Map<string, [number, number]> | null = null): Capacidade[] {
  const conf = new Map<string, number>();
  for (const [k, v] of Object.entries(configurada ?? {}))
    if (k && v != null && v !== "" && Number(v) > 0) conf.set(k, Number(v));
  const tec = new Map<string, number>();
  for (const p of equipe ?? []) tec.set(p.centroTrabalho, (tec.get(p.centroTrabalho) ?? 0) + 1);
  const media = new Map<string, number>();
  const s = segunda(hoje);
  for (const e of executadas ?? [])
    if (e.fimReal != null && e.fimReal >= s - 84 && e.fimReal < s)
      media.set(e.centroTrabalho, (media.get(e.centroTrabalho) ?? 0) + e.horas / 12);
  const disp = disponivel instanceof Map ? disponivel : new Map(Object.entries(disponivel ?? {}));
  return centros.map((c): Capacidade => {
    if (conf.has(c)) return { centroTrabalho: c, capacidade: conf.get(c)!, origem: "configurada" };
    const d = disp.get(c);
    if (d && d[1]) return { centroTrabalho: c, capacidade: d[0],
      origem: `${d[1]} técnico(s) · Gerenciador de HH (jornada, % e ausências)` };
    const n = tec.get(c) ?? 0;
    if (n) return { centroTrabalho: c, capacidade: n * horasSemana, origem: `${n} técnico(s) × ${inteiroPy(horasSemana)} h` };
    const m = media.get(c) ?? 0;
    if (m > 0) return { centroTrabalho: c, capacidade: m, origem: "média apontada (12 semanas)" };
    return { centroTrabalho: c, capacidade: null, origem: "sem capacidade cadastrada" };
  });
}

interface CargaCentro {
  centroTrabalho: string; hhProgramadas: number; operacoes: number; ordens: number; prontasPct: number;
  capacidade: number | null; origem: string | null; cargaPct: number | null; folga: number | null;
}

/** HH programadas × capacidade por centro (carga % > 100 = semana sobrecarregada). */
export function cargaPorCentro(prog: Programada[], cap: Capacidade[]): CargaCentro[] {
  const capDe = new Map(cap.map((c) => [c.centroTrabalho, c]));
  const g = new Map<string, Programada[]>();
  for (const p of prog) (g.get(p.centroTrabalho) ?? g.set(p.centroTrabalho, []).get(p.centroTrabalho)!).push(p);
  return [...g.entries()].sort(([a], [b]) => cmp(a, b)).map(([c, xs]): CargaCentro => {
    const hh = soma(xs.map((x) => x.horas));
    const k = capDe.get(c);
    const capac = k?.capacidade ?? null;
    const tem = capac != null && capac > 0;
    return { centroTrabalho: c, hhProgramadas: hh, operacoes: xs.length, ordens: new Set(xs.map((x) => x.ordem)).size,
      prontasPct: (xs.filter((x) => x.pronta).length / xs.length) * 100, capacidade: capac, origem: k?.origem ?? null,
      cargaPct: tem ? (hh / capac) * 100 : null, folga: tem ? capac - hh : null };
  }).sort((a, b) => b.hhProgramadas - a.hhProgramadas);
}

export const FAIXAS_CARGA = ["Folga", "Cheia", "Sobrecarga", "Sem capacidade"] as const;
/** Cor da barra do gráfico: até 85% folga, até 100% cheia, acima sobrecarga; sem capacidade à parte. */
export function faixaCarga(cargaPct: number | null): (typeof FAIXAS_CARGA)[number] {
  if (cargaPct == null || Number.isNaN(cargaPct)) return "Sem capacidade";
  return cargaPct <= 85 ? "Folga" : cargaPct <= 100 ? "Cheia" : "Sobrecarga";
}

type LinhaPorDia = { centroTrabalho: string } & Record<DiaSemana, number>;

/** HH programadas por dia da semana e centro (para o quadro da semana). */
export function porDia(prog: Programada[]): LinhaPorDia[] {
  const m = new Map<string, LinhaPorDia>();
  for (const p of prog) {
    let l = m.get(p.centroTrabalho);
    if (!l) {
      l = { centroTrabalho: p.centroTrabalho, ...Object.fromEntries(DIAS.map((d) => [d, 0])) } as LinhaPorDia;
      m.set(p.centroTrabalho, l);
    }
    l[p.dia] += p.horas;
  }
  return [...m.values()].sort((a, b) => cmp(a.centroTrabalho, b.centroTrabalho));
}

interface ResumoSemana {
  hhProgramadas: number; operacoes: number; ordens: number; capacidade: number; centrosComCapacidade: number;
  centros: number; cargaPct: number | null; liberadasPct: number | null; hhAtrasadas: number; atrasadas: number;
}

/** Os cartões da página: HH programadas, capacidade, carga, liberadas e atrasadas antes da semana. */
export function resumoSemana(prog: Programada[], carga: CargaCentro[], cand: Candidata[]): ResumoSemana {
  const comCap = carga.filter((c) => c.capacidade != null);
  const cap = soma(comCap.map((c) => c.capacidade!));
  return {
    hhProgramadas: soma(prog.map((p) => p.horas)), operacoes: prog.length, ordens: new Set(prog.map((p) => p.ordem)).size,
    capacidade: cap, centrosComCapacidade: comCap.length, centros: carga.length,
    cargaPct: cap ? (soma(comCap.map((c) => c.hhProgramadas)) / cap) * 100 : null,
    liberadasPct: prog.length ? (prog.filter((p) => p.pronta).length / prog.length) * 100 : null,
    hhAtrasadas: soma(cand.map((c) => c.horas)), atrasadas: cand.length,
  };
}

interface FiltroProgramacao { busca?: string; centros?: string[]; soNaoProntas?: boolean }

/** A lista da programação com busca (ordem, textos, equipamento, objeto), centro e "só não liberadas". */
export function filtrarProgramacao(prog: Programada[], f: FiltroProgramacao = {}): Programada[] {
  const termos = semAcento(f.busca ?? "").toUpperCase().split(/\s+/).filter(Boolean);
  const cs = f.centros?.length ? new Set(f.centros) : null;
  return prog.filter((p) => {
    if (cs && !cs.has(p.centroTrabalho)) return false;
    if (f.soNaoProntas && p.pronta) return false;
    if (termos.length) {
      const hay = semAcento(`${p.ordem} ${p.textoOperacao} ${p.textoOrdem ?? ""} ${p.equipamento} ${p.objeto}`).toUpperCase();
      if (!termos.every((t) => hay.includes(t))) return false;
    }
    return true;
  });
}

// ----------------------------------------------------------------------------
// Para completar a folga
// ----------------------------------------------------------------------------
interface Candidata extends Atividade {
  criticidade: string; riscoEquipamento: number; pronta: boolean; diasAtraso: number;
}

/**
 * Operações atrasadas (programadas antes da semana e ainda abertas) para puxar para a folga da semana: ordem
 * liberada primeiro, depois equipamento de maior risco/criticidade e a mais antiga.
 */
export function candidatos(ops: Atividade[] | null | undefined, seg: Dia, criticidade: Record<string, string> = {},
  risco: Record<string, number> = {}): Candidata[] {
  const s = segunda(seg);
  const crit = (c: string) => PESO_CRITICIDADE[c] ?? 3;
  return (ops ?? [])
    .filter((o) => o.situacao !== CANCELADA && !o.concluida && o.inicio != null && o.inicio < s)
    .map((o) => ({ ...o, criticidade: criticidade[o.equipamento] ?? "", riscoEquipamento: risco[o.equipamento] ?? 0,
      pronta: o.situacaoOrdem === "Liberada", diasAtraso: s - o.inicio! }))
    .sort((a, b) => Number(b.pronta) - Number(a.pronta) || b.riscoEquipamento - a.riscoEquipamento
      || crit(a.criticidade) - crit(b.criticidade) || b.diasAtraso - a.diasAtraso);
}

/** Marca, na ordem de prioridade, as operações que cabem na folga do seu centro na semana. */
export function encaixar(cand: { centroTrabalho: string; horas: number }[],
  folga: Record<string, number | null> | Map<string, number | null>): boolean[] {
  const resto = new Map<string, number>();
  for (const [k, v] of folga instanceof Map ? folga : Object.entries(folga)) if (v && v > 0) resto.set(k, v);
  return cand.map(({ centroTrabalho, horas }) => {
    const h = horas || 0;
    const r = resto.get(centroTrabalho) ?? 0;
    if (h > 0 && r >= h) { resto.set(centroTrabalho, r - h); return true; }
    return false;
  });
}

/** Folga de cada centro: a da carga e, nos centros sem nada programado na semana, a capacidade inteira. */
export function folgaPorCentro(carga: CargaCentro[], livres: Capacidade[]): Map<string, number | null> {
  const m = new Map<string, number | null>(carga.map((c) => [c.centroTrabalho, c.folga]));
  for (const l of livres) m.set(l.centroTrabalho, l.capacidade);
  return m;
}

// ----------------------------------------------------------------------------
// Aderência à programação
// ----------------------------------------------------------------------------
interface AderenciaSemana {
  semana: Dia; programadas: number; naSemana: number; depois: number; pendentes: number; aderenciaPct: number;
  hhProgramadas: number; hhNaSemana: number; aderenciaHhPct: number | null;
}

/** Data (no horário da fábrica) de um instante — o export do IW38OP vem com hora e fuso. */
function diaLocal(v: Dia | Date): Dia {
  if (typeof v === "number") return v;
  const [a, m, d] = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(v).split("-").map(Number);
  return dia(a, m, d)!;
}

/**
 * Aderência à programação das `semanas` anteriores à semana de `ate` (exclusive). Só entram semanas que já
 * terminaram até `dadosAte` (data do export do IW38OP — um Dia ou o instante, levado ao horário da fábrica): semana
 * pela metade pareceria descumprida.
 * `agora` = hoje (nunca entra a semana corrente).
 */
export function aderencia(ops: Atividade[] | null | undefined, ate: Dia, semanas = 12,
  dadosAte: Dia | Date | null = null, agora: Dia = hojeLocal()): AderenciaSemana[] {
  let fim = segunda(ate);
  if (dadosAte != null && !(dadosAte instanceof Date && Number.isNaN(dadosAte.getTime()))) {
    const limite = diaLocal(dadosAte) + 1;                     // o dia do export conta inteiro
    fim = Math.min(fim, limite - diaDaSemana(limite));         // segunda após o último domingo completo
  }
  fim = Math.min(fim, segunda(agora));
  if (!ops?.length) return [];
  const ini = fim - 7 * semanas;
  const m = new Map<Dia, AderenciaSemana>();
  for (const o of ops) {
    if (o.situacao === CANCELADA || o.inicio == null || o.inicio < ini || o.inicio >= fim) continue;
    const s = segunda(o.inicio);
    let g = m.get(s);
    if (!g) m.set(s, (g = { semana: s, programadas: 0, naSemana: 0, depois: 0, pendentes: 0, aderenciaPct: 0,
      hhProgramadas: 0, hhNaSemana: 0, aderenciaHhPct: null }));
    const na = o.concluida && o.fimReal != null && o.fimReal < s + 7;
    g.programadas++;
    g.hhProgramadas += o.horas;
    if (na) { g.naSemana++; g.hhNaSemana += o.horas; } else if (o.concluida) g.depois++;
  }
  return [...m.values()].sort((a, b) => a.semana - b.semana).map((g) => ({
    ...g, pendentes: g.programadas - g.naSemana - g.depois, aderenciaPct: (g.naSemana / g.programadas) * 100,
    aderenciaHhPct: g.hhProgramadas > 0 ? (g.hhNaSemana / g.hhProgramadas) * 100 : null,
  }));
}
