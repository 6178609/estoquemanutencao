import { chave } from "../dados/texto";
import { diasDaAusencia, type Ausencia, type PessoaHh } from "./hh";
import { partes, type Dia } from "./util";

/**
 * Treinamentos e férias — as ausências do cadastro da Gestão de HH (hh_disponibilidade.json) dos tipos Férias e
 * Treinamento, vistas para planejar a equipe. Testado em testes/treinamentos.test.ts.
 *
 * - Férias no ano civil: dias corridos de férias de cada pessoa dentro do ano (gozados até hoje + programados depois),
 *   comparados com DIAS_FERIAS (30) — é um acompanhamento, não o saldo legal do período aquisitivo.
 * - Reciclagem: o treinamento mais recente de cada pessoa com o mesmo nome define a validade (vencido, vence em até
 *   JANELA_VENCIMENTO dias, em dia ou sem validade).
 * - Cobertura: por centro e semana, o pico de técnicos ausentes no mesmo dia ÷ técnicos do centro (EAD / fora do
 *   horário não conta).
 */
export const FERIAS = "Férias";
export const TREINAMENTO = "Treinamento";
export const DIAS_FERIAS = 30;
export const JANELA_VENCIMENTO = 60;
export const LIMITE_COBERTURA = 30; // % de ausentes no mesmo dia que acende o alerta

const DIA_MS = 86_400_000;
const inicioAno = (ano: number): Dia => Math.round(Date.UTC(ano, 0, 1) / DIA_MS);
const sobrepoe = (a: Pick<Ausencia, "de" | "ate">, ini: Dia, fim: Dia) => Math.max(0, Math.min(a.ate, fim) - Math.max(a.de, ini) + 1);

/** Horas de jornada perdidas por uma ausência dentro de [ini, fim]: carga horária proporcional ou dias × jornada ÷ 7. */
export function horasPerdidas(a: Ausencia, jornada: number, ini: Dia, fim: Dia): number {
  const dentro = sobrepoe(a, ini, fim);
  if (!dentro || a.semHh) return 0;
  return a.horas != null ? (a.horas * dentro) / diasDaAusencia(a) : (jornada * dentro) / 7;
}

/** Horas perdidas no período por tipo de ausência (só de quem está em `pes`). */
export function horasPorTipo(aus: Ausencia[], pes: Pick<PessoaHh, "np" | "jornada">[], ini: Dia, fim: Dia): Record<string, number> {
  const jornada = new Map(pes.map((p) => [p.np, p.jornada]));
  const out: Record<string, number> = {};
  for (const a of aus) {
    const j = jornada.get(a.np);
    if (j == null) continue;
    const h = horasPerdidas(a, j, ini, fim);
    if (h) out[a.tipo] = (out[a.tipo] ?? 0) + h;
  }
  return out;
}

export interface FeriasAno { np: string; gozados: number; programados: number; total: number; restante: number; proxima: Dia | null }

/** Dias de férias no ano civil de `hoje`, por pessoa (inclusive quem não tem nenhum: 0 de 30). */
export function feriasNoAno(aus: Ausencia[], nps: string[], hoje: Dia): FeriasAno[] {
  const ini = inicioAno(partes(hoje).ano), fim = inicioAno(partes(hoje).ano + 1) - 1;
  const dias = new Map<string, { goz: Set<Dia>; prog: Set<Dia>; proxima: Dia | null }>();
  for (const np of nps) dias.set(np, { goz: new Set(), prog: new Set(), proxima: null });
  for (const a of aus) {
    const d = dias.get(a.np);
    if (!d || a.tipo !== FERIAS) continue;
    for (let x = Math.max(a.de, ini); x <= Math.min(a.ate, fim); x++) (x <= hoje ? d.goz : d.prog).add(x);
    if (a.de > hoje && (d.proxima == null || a.de < d.proxima)) d.proxima = a.de;
  }
  return nps.map((np) => {
    const d = dias.get(np)!;
    const gozados = d.goz.size, programados = [...d.prog].filter((x) => !d.goz.has(x)).length;
    return { np, gozados, programados, total: gozados + programados, restante: Math.max(DIAS_FERIAS - gozados - programados, 0), proxima: d.proxima };
  });
}

export type SituacaoReciclagem = "Vencido" | "Vence em breve" | "Em dia" | "Sem validade";
export interface Reciclagem {
  np: string; titulo: string; chaveTitulo: string; realizado: Dia; validade: Dia | null; situacao: SituacaoReciclagem; dias: number | null;
}

/** O treinamento mais recente de cada pessoa por nome (sem acento/maiúsculas), com a situação da validade. */
export function reciclagens(aus: Ausencia[], hoje: Dia, janela = JANELA_VENCIMENTO): Reciclagem[] {
  const ultimo = new Map<string, Ausencia>();
  for (const a of aus) {
    if (a.tipo !== TREINAMENTO || !a.titulo.trim()) continue;
    const k = `${a.np}|${chave(a.titulo)}`;
    const atual = ultimo.get(k);
    if (!atual || a.ate > atual.ate || (a.ate === atual.ate && (a.validade ?? -1) > (atual.validade ?? -1))) ultimo.set(k, a);
  }
  return [...ultimo.values()].map((a) => {
    const dias = a.validade != null ? a.validade - hoje : null;
    const situacao: SituacaoReciclagem = dias == null ? "Sem validade" : dias < 0 ? "Vencido" : dias <= janela ? "Vence em breve" : "Em dia";
    return { np: a.np, titulo: a.titulo.trim(), chaveTitulo: chave(a.titulo), realizado: a.ate, validade: a.validade, situacao, dias };
  }).sort((x, y) => (x.dias ?? Infinity) - (y.dias ?? Infinity) || x.titulo.localeCompare(y.titulo));
}

/** Matriz pessoa × treinamento: a situação de cada célula (sem célula = nunca fez). Títulos pelo nome mais usado. */
export function matrizTreinamentos(rec: Reciclagem[]): { titulos: { chave: string; titulo: string; n: number }[]; celula: Map<string, Reciclagem> } {
  const nomes = new Map<string, Map<string, number>>();
  for (const r of rec) {
    const m = nomes.get(r.chaveTitulo) ?? nomes.set(r.chaveTitulo, new Map()).get(r.chaveTitulo)!;
    m.set(r.titulo, (m.get(r.titulo) ?? 0) + 1);
  }
  const titulos = [...nomes].map(([k, m]) => ({ chave: k, titulo: [...m].sort((a, b) => b[1] - a[1])[0][0], n: [...m.values()].reduce((s, v) => s + v, 0) }))
    .sort((a, b) => b.n - a.n || a.titulo.localeCompare(b.titulo));
  return { titulos, celula: new Map(rec.map((r) => [`${r.np}|${r.chaveTitulo}`, r])) };
}

export interface CoberturaSemana { centro: string; semana: Dia; tecnicos: number; pico: number; pct: number; alerta: boolean }

/** Por centro e semana (segunda a domingo) de [ini, fim]: o pico de técnicos ausentes no mesmo dia (dias inteiros). */
export function cobertura(aus: Ausencia[], pes: Pick<PessoaHh, "np" | "centroTrabalho" | "contaNaCapacidade">[], ini: Dia, fim: Dia,
  limite = LIMITE_COBERTURA): CoberturaSemana[] {
  const tec = pes.filter((p) => p.contaNaCapacidade);
  const centroDe = new Map(tec.map((p) => [p.np, p.centroTrabalho]));
  const nTec = new Map<string, number>();
  for (const p of tec) nTec.set(p.centroTrabalho, (nTec.get(p.centroTrabalho) ?? 0) + 1);
  // dia → centro → pessoas ausentes
  const porDia = new Map<Dia, Map<string, Set<string>>>();
  for (const a of aus) {
    const c = centroDe.get(a.np);
    if (c == null || a.semHh) continue; // EAD / fora do horário não tira a pessoa do dia
    for (let d = Math.max(a.de, ini); d <= Math.min(a.ate, fim); d++) {
      const m = porDia.get(d) ?? porDia.set(d, new Map()).get(d)!;
      (m.get(c) ?? m.set(c, new Set()).get(c)!).add(a.np);
    }
  }
  const out: CoberturaSemana[] = [];
  const seg = ini - ((partes(ini).semana + 6) % 7);
  for (let s = seg; s <= fim; s += 7) {
    for (const [centro, n] of nTec) {
      let pico = 0;
      for (let d = Math.max(s, ini); d <= Math.min(s + 6, fim); d++) pico = Math.max(pico, porDia.get(d)?.get(centro)?.size ?? 0);
      if (!pico) continue;
      const pct = (pico / n) * 100;
      out.push({ centro, semana: s, tecnicos: n, pico, pct, alerta: pct > limite });
    }
  }
  return out.sort((a, b) => a.semana - b.semana || b.pct - a.pct);
}

/** Quem está fora em `dia`, por tipo (sem contar EAD / fora do horário). */
export function foraEm(aus: Ausencia[], dia: Dia, tipo?: string): Ausencia[] {
  return aus.filter((a) => a.de <= dia && a.ate >= dia && (!tipo || a.tipo === tipo) && !a.semHh);
}
