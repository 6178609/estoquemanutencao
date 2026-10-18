import * as ind from "@/lib/wcm/indicadores";
import type { Ordem } from "@/lib/wcm/preparo";
import { inicioDoMes, type Dia } from "@/lib/wcm/util";

import { GRUPOS_CLASSE, grupoDaClasse, maiores, mesesEntre, pareto, somarPor } from "../confiabilidade/_comum/agregar";

/**
 * Contas da aba Custos, puras para testar (testes/custos.test.ts).
 * Base: ordens do IW38 do período, sem as canceladas; custo = custo real total da ordem.
 */
export interface OrdemCusto extends Ordem { classe: string; tipoNome: string }

export function ordensDoPeriodo(ordens: Ordem[], ini: Dia, fim: Dia, tipos: Record<string, ind.TipoOrdem>): OrdemCusto[] {
  const cl = new Map<string, string>();
  const classe = (t: string) => { if (!cl.has(t)) cl.set(t, ind.classeTipo(t, tipos) || "Sem classe"); return cl.get(t)!; };
  return ordens.filter((o) => o.data != null && o.data >= ini && o.data <= fim && o.situacao !== "Cancelada")
    .map((o) => ({ ...o, classe: classe(o.tipo), tipoNome: ind.rotuloTipo(o.tipo, tipos) }));
}

export interface Resumo { total: number; comPlano: number; backlog: number; emergencial: number; comCusto: number; ordens: number; meses: number }

export function resumo(o: OrdemCusto[], ini: Dia, fim: Dia): Resumo {
  let total = 0, comPlano = 0, emergencial = 0, comCusto = 0;
  for (const x of o) {
    total += x.custoReal;
    if (x.comPlano) comPlano += x.custoReal;
    if (x.classe === "Emergencial") emergencial += x.custoReal;
    if (x.custoReal !== 0) comCusto++;
  }
  return { total, comPlano, backlog: total - comPlano, emergencial, comCusto, ordens: o.length, meses: Math.max(1, (fim - ini + 1) / 30.44) };
}

/** Custo por mês: séries por grupo de classe (até 4 cores) e a tabela com as classes originais. */
export function porMes(o: OrdemCusto[], ini: Dia, fim: Dia) {
  const meses = mesesEntre(ini, fim);
  const idx = new Map(meses.map((m, i) => [m, i]));
  const series = GRUPOS_CLASSE.map((g) => ({ nome: g.nome, cor: g.cor, valores: meses.map(() => 0) as (number | null)[] }));
  const classes = new Map<string, number[]>();
  for (const x of o) {
    const i = idx.get(inicioDoMes(x.data!));
    if (i == null) continue;
    const s = series.find((g) => g.nome === grupoDaClasse(x.classe))!;
    s.valores[i] = (s.valores[i] ?? 0) + x.custoReal;
    (classes.get(x.classe) ?? classes.set(x.classe, meses.map(() => 0)).get(x.classe)!)[i] += x.custoReal;
  }
  const ordemClasses = [...ind.CLASSES_TIPO, "Sem classe"].filter((c) => classes.has(c));
  for (const c of classes.keys()) if (!ordemClasses.includes(c)) ordemClasses.push(c);
  return { meses, series: series.filter((s) => s.valores.some((v) => v)), classes: ordemClasses.map((c) => ({ classe: c, valores: classes.get(c)! })) };
}

export const custoPor = (o: OrdemCusto[], chave: (x: OrdemCusto) => string, n: number, vazio?: string) =>
  maiores(somarPor(o, chave, (x) => x.custoReal, vazio), n);

export interface LinhaEquipCusto { codigo: string; nome: string; custo: number; ordens: number; backlog: number; medio: number; acumulado: number; vital: boolean }

/** Pareto de custo por equipamento (só os com custo > 0). */
export function porEquipamento(o: OrdemCusto[]): { linhas: LinhaEquipCusto[]; n80: number } {
  const g = new Map<string, { nome: string; custo: number; ordens: number; backlog: number }>();
  for (const x of o) {
    if (!x.equipChave) continue;
    const e = g.get(x.equipChave) ?? { nome: x.objeto, custo: 0, ordens: 0, backlog: 0 };
    e.custo += x.custoReal; e.ordens++; if (!x.comPlano) e.backlog++;
    g.set(x.equipChave, e);
  }
  const p = pareto(new Map([...g].map(([k, v]) => [k, v.custo])));
  return { n80: p.n80, linhas: p.itens.map((i) => {
    const e = g.get(i.item)!;
    return { codigo: i.item, nome: e.nome, custo: e.custo, ordens: e.ordens, backlog: e.backlog, medio: e.custo / e.ordens, acumulado: i.acumulado, vital: i.vital };
  }) };
}
