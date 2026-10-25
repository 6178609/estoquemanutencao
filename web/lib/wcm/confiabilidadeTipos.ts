import type { Ordem } from "./preparo";
import { partes, type Dia } from "./util";

/**
 * MTBF e MTTR por tipo de ordem — a mesma conta da Confiabilidade (que vale só para a quebra: nota Y1 → ordem YM11),
 * aplicada às ordens do IW38 de outros tipos (corretiva, preventiva, lubrificação…).
 *
 * - Evento = ordem do tipo escolhido, não cancelada, com equipamento, pela data da ordem (início-base; sem ela, entrada).
 * - MTBF (dias) = dias do período × equipamentos com ordem ÷ ordens.
 * - MTTR (h) = média das horas de reparo das ordens que têm horas: IW47 (HH ÷ pessoas que apontaram); sem IW47, Σ(trabalho ÷
 *   pessoas) das operações no IW38OP.
 * - Disponibilidade (%) = MTBF·24 ÷ (MTBF·24 + MTTR).
 */
export const TIPO_QUEBRA = "YM11";

interface Evento { ordem: string; tipo: string; equip: string; objeto: string; data: Dia; horas: number | null; custo: number }
interface Resumo {
  ordens: number; equipamentos: number; mtbf: number | null; mttr: number | null; disponibilidade: number | null;
  horas: number; cobertura: number | null; custo: number;
}

/** Ordens que viram evento (todas as datas): tipo na lista, não cancelada, com equipamento e data. */
export function eventos(ordens: Ordem[], tipos: Set<string>, horas: Map<string, number>): Evento[] {
  const vistos = new Set<string>();
  const out: Evento[] = [];
  for (const o of ordens) {
    if (!tipos.has(o.tipo) || o.situacao === "Cancelada" || !o.equipChave || vistos.has(o.ordem)) continue;
    const data = o.inicio ?? o.entrada ?? o.data;
    if (data == null) continue;
    vistos.add(o.ordem);
    const h = horas.get(o.ordem);
    out.push({ ordem: o.ordem, tipo: o.tipo, equip: o.equipChave, objeto: o.objeto, data, horas: h != null && h > 0 ? h : null, custo: o.custoReal });
  }
  return out.sort((a, b) => a.data - b.data);
}

export const noPeriodo = (ev: Evento[], ini: Dia, fim: Dia) => ev.filter((e) => e.data >= ini && e.data <= fim);

export function resumir(ev: Evento[], dias: number): Resumo {
  const comHoras = ev.filter((e) => e.horas != null);
  const horas = comHoras.reduce((s, e) => s + e.horas!, 0);
  const eq = new Set(ev.map((e) => e.equip)).size;
  const mtbf = ev.length && dias > 0 ? (dias * eq) / ev.length : null;
  const mttr = comHoras.length ? horas / comHoras.length : null;
  return {
    ordens: ev.length, equipamentos: eq, mtbf, mttr, horas, custo: ev.reduce((s, e) => s + (e.custo || 0), 0),
    disponibilidade: mtbf != null && mttr != null ? ((mtbf * 24) / (mtbf * 24 + mttr)) * 100 : null,
    cobertura: ev.length ? (comHoras.length / ev.length) * 100 : null,
  };
}

/** Uma linha por tipo (os eventos já recortados no período), do mais frequente ao menos. */
export function porTipo(ev: Evento[], dias: number): (Resumo & { tipo: string })[] {
  const g = agrupar(ev, (e) => e.tipo);
  return [...g].map(([tipo, xs]) => ({ tipo, ...resumir(xs, dias) })).sort((a, b) => b.ordens - a.ordens || a.tipo.localeCompare(b.tipo));
}

interface LinhaEquipTipo extends Resumo { equip: string; nome: string; tipos: string; ultima: Dia }

/** Uma linha por equipamento: ordens, MTBF (dias ÷ ordens do equipamento), MTTR, horas, custo e os tipos. */
export function porEquipamento(ev: Evento[], dias: number): LinhaEquipTipo[] {
  return [...agrupar(ev, (e) => e.equip)].map(([equip, xs]) => ({
    equip, nome: xs.find((x) => x.objeto)?.objeto ?? "", tipos: [...new Set(xs.map((x) => x.tipo))].sort().join(", "),
    ultima: Math.max(...xs.map((x) => x.data)), ...resumir(xs, dias),
  })).sort((a, b) => b.ordens - a.ordens || b.horas - a.horas || a.equip.localeCompare(b.equip));
}

/** Por mês (12 meses que terminam no mês de `fim`): ordens, MTBF e MTTR; o mês corrente vai só até hoje. */
export function mensal(ev: Evento[], fim: Dia, hoje: Dia, meses = 12): { mes: Dia; resumo: Resumo }[] {
  const p = partes(fim);
  const out: { mes: Dia; resumo: Resumo }[] = [];
  for (let i = meses - 1; i >= 0; i--) {
    const ini = diaDe(p.ano, p.mes - i, 1), prox = diaDe(p.ano, p.mes - i + 1, 1);
    const ate = Math.min(prox - 1, hoje);
    if (ate < ini) continue;
    out.push({ mes: ini, resumo: resumir(noPeriodo(ev, ini, ate), ate - ini + 1) });
  }
  return out;
}

/** Tipos presentes no IW38 (com quantas ordens não canceladas), do mais frequente ao menos. */
export function tiposDisponiveis(ordens: Ordem[]): { tipo: string; n: number }[] {
  const n = new Map<string, number>();
  for (const o of ordens) if (o.tipo && o.situacao !== "Cancelada") n.set(o.tipo, (n.get(o.tipo) ?? 0) + 1);
  return [...n].map(([tipo, x]) => ({ tipo, n: x })).sort((a, b) => b.n - a.n || a.tipo.localeCompare(b.tipo));
}

/** Tipos escolhidos na tela; sem escolha, todos menos a quebra (YM11, que já está na aba Confiabilidade). */
export function tiposEscolhidos(pedidos: string[], disponiveis: string[]): string[] {
  const ok = pedidos.filter((t) => disponiveis.includes(t));
  return ok.length ? ok : disponiveis.filter((t) => t !== TIPO_QUEBRA);
}

function agrupar<T>(xs: T[], chave: (x: T) => string): Map<string, T[]> {
  const g = new Map<string, T[]>();
  for (const x of xs) { const k = chave(x); (g.get(k) ?? g.set(k, []).get(k)!).push(x); }
  return g;
}

// dia do calendário (o mês pode passar de 12 ou ficar ≤ 0: o Date.UTC ajusta o ano)
const diaDe = (ano: number, mes: number, dia: number): Dia => Math.round(Date.UTC(ano, mes - 1, dia) / 86_400_000);
