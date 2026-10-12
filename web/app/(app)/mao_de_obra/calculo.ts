import * as ind from "@/lib/wcm/indicadores";
import type { Operacao } from "@/lib/wcm/preparo";
import type { Dia } from "@/lib/wcm/util";

import { faixa, GRUPOS_CLASSE, grupoDaClasse, moda, segunda } from "../confiabilidade/_comum/agregar";

/**
 * Contas da aba Mão de obra (porta de paginas/mao_de_obra.py), puras para testar (testes/mao_de_obra.test.ts).
 */
export interface Exec extends ind.HhExecutada { atividade: string }

export interface LinhaPessoa {
  np: string; horas: number; dias: number; ordens: number; pctPlano: number | null; pctEmerg: number | null; pctFora: number | null;
  centro: string; hhDia: number; utilizacao: number | null;
}

/** Horas por pessoa: % sobre as horas de ordens que estão no IW38 (as demais não têm tipo nem plano conhecidos). */
export function porPessoa(ex: Exec[], emerg: boolean, disponivel: (np: string) => number | null): LinhaPessoa[] {
  const g = new Map<string, Exec[]>();
  for (const e of ex) if (e.np) (g.get(e.np) ?? g.set(e.np, []).get(e.np)!).push(e);
  return [...g].map(([np, xs]) => {
    let h = 0, conh = 0, plano = 0, em = 0, fora = 0;
    for (const x of xs) {
      h += x.horas;
      if (x.noIw38) { conh += x.horas; if (x.comPlano) plano += x.horas; } else fora += x.horas;
      if (x.classe === "Emergencial") em += x.horas;
    }
    const dias = new Set(xs.map((x) => x.fimReal)).size;
    const disp = disponivel(np);
    return { np, horas: h, dias, ordens: new Set(xs.map((x) => x.ordem)).size,
      pctPlano: conh > 0 ? (plano / conh) * 100 : null, pctEmerg: emerg && conh > 0 ? (em / conh) * 100 : null,
      pctFora: h ? (fora / h) * 100 : null, centro: moda(xs.map((x) => x.centroTrabalho)), hhDia: h / Math.max(dias, 1),
      utilizacao: disp && disp > 0 ? (h / disp) * 100 : null };
  }).sort((a, b) => b.horas - a.horas);
}

/** HH por semana (segunda-feira) em até 4 grupos de classe; `classes` guarda as classes originais. */
export function porSemana(ex: Exec[]) {
  const sem = [...new Set(ex.filter((e) => e.fimReal != null).map((e) => segunda(e.fimReal!)))].sort((a, b) => a - b);
  const idx = new Map(sem.map((s, i) => [s, i]));
  const series = GRUPOS_CLASSE.map((g) => ({ nome: g.nome, cor: g.cor, valores: sem.map(() => 0) as (number | null)[] }));
  const classes = new Map<string, number[]>();
  for (const e of ex) {
    if (e.fimReal == null) continue;
    const i = idx.get(segunda(e.fimReal))!;
    const s = series.find((x) => x.nome === grupoDaClasse(e.classe))!;
    s.valores[i] = (s.valores[i] ?? 0) + e.horas;
    const c = e.classe || "Sem classe";
    (classes.get(c) ?? classes.set(c, sem.map(() => 0)).get(c)!)[i] += e.horas;
  }
  return { semanas: sem, series: series.filter((s) => s.valores.some((v) => v)), classes: [...classes].map(([classe, valores]) => ({ classe, valores })) };
}

export const NATUREZAS_HH = ["Plano de manutenção", "Backlog", ind.FORA_DO_IW38];
export const naturezaHh = (e: Pick<ind.HhExecutada, "noIw38" | "comPlano">) => (!e.noIw38 ? ind.FORA_DO_IW38 : e.comPlano ? "Plano de manutenção" : "Backlog");

/** HH por centro (os `n` maiores) quebradas por natureza. */
export function porCentroNatureza(ex: Exec[], n = 14): { centro: string; total: number; partes: number[] }[] {
  const m = new Map<string, number[]>();
  for (const e of ex) {
    const k = e.centroTrabalho || "—";
    const p = m.get(k) ?? m.set(k, [0, 0, 0]).get(k)!;
    p[NATUREZAS_HH.indexOf(naturezaHh(e))] += e.horas;
  }
  return [...m].map(([centro, partes]) => ({ centro, partes, total: partes.reduce((s, v) => s + v, 0) }))
    .sort((a, b) => b.total - a.total || a.centro.localeCompare(b.centro)).slice(0, n);
}

export const FAIXAS_IDADE = ["até 7 d", "8–30 d", "31–90 d", "91–180 d", "mais de 180 d"];
/** Ordens em aberto por faixa de idade: [com plano, backlog] em cada faixa. */
export function idadeBacklog(bk: Pick<ind.ItemBacklog, "idade" | "comPlano">[]): [number, number][] {
  const out = FAIXAS_IDADE.map(() => [0, 0] as [number, number]);
  for (const b of bk) out[faixa([7, 30, 90, 180], b.idade)][b.comPlano ? 0 : 1]++;
  return out;
}

/** Trabalho das operações abertas por semana de início (12 semanas a partir da segunda desta semana). */
export function cargaFutura(oper: Operacao[], hoje: Dia, semanas = 12): { semana: Dia; horas: number }[] {
  const s0 = segunda(hoje);
  const out = Array.from({ length: semanas }, (_, i) => ({ semana: s0 + 7 * i, horas: 0 }));
  for (const o of oper) {
    if (o.concluida || o.cancelada || o.inicio == null || o.inicio < s0 || o.inicio >= hoje + 7 * semanas) continue;
    const i = Math.floor((o.inicio - s0) / 7);
    if (i < semanas) out[i].horas += o.horas;
  }
  return out;
}
