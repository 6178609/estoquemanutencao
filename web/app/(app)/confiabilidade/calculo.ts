import type { Quebra } from "@/lib/wcm/indicadores";
import type { Ordem } from "@/lib/wcm/preparo";
import { partes, type Dia } from "@/lib/wcm/util";

import { faixa, somarPor } from "./_comum/agregar";

/**
 * Contas da aba Confiabilidade, puras para testar (testes/confiabilidade.test.ts).
 */
export const ABC_PARA_CRITICIDADE: Record<string, string> = { A: "Alta", B: "Média", C: "Baixa" };

/** Dimensões do Pareto: rótulo → campo da quebra. */
export const DIMENSOES: Record<string, "equipChave" | "local" | "centroTrabalho" | "localizacao" | "tipoNota"> = {
  "Equipamento": "equipChave", "Local de instalação": "local", "Centro de trabalho": "centroTrabalho", "Área": "localizacao",
  "Tipo de nota": "tipoNota",
};

export interface LinhaEquip {
  codigo: string; nome: string; criticidade: string; abc: string; area: string; local: string; quebras: number; reincidencias: number;
  mtbf: number; mttr: number | null; reparo: number; ordens: number; custo: number; ultima: Dia | null;
}

/** Confiabilidade por equipamento no período: quebras, reincidências, MTBF (dias ÷ quebras), MTTR, custo e ordens. */
export function porEquipamento(q: Quebra[], ordensPer: Ordem[], dias: number, cadEq: Record<string, Record<string, unknown>>,
  abc: Map<string, string>): LinhaEquip[] {
  const custo = somarPor(ordensPer, (o) => o.equipChave, (o) => o.custoReal);
  const nOrd = somarPor(ordensPer, (o) => o.equipChave);
  const g = new Map<string, Quebra[]>();
  for (const x of q) if (x.equipChave) (g.get(x.equipChave) ?? g.set(x.equipChave, []).get(x.equipChave)!).push(x);
  const out: LinhaEquip[] = [];
  for (const [codigo, xs] of g) {
    const rep = xs.map((x) => x.horasReparo).filter((h): h is number => h != null && !Number.isNaN(h));
    const a = abc.get(codigo) ?? "";
    const crit = String((cadEq[codigo] as { criticidade?: unknown } | undefined)?.criticidade || "") || ABC_PARA_CRITICIDADE[a] || "";
    out.push({
      codigo, nome: xs[0].objeto, local: xs[0].local, area: xs[0].localizacao, quebras: xs.length,
      reincidencias: xs.filter((x) => x.reincidente).length, reparo: rep.reduce((s, h) => s + h, 0),
      mttr: rep.length ? rep.reduce((s, h) => s + h, 0) / rep.length : null, mtbf: dias / xs.length,
      custo: custo.get(codigo) ?? 0, ordens: nOrd.get(codigo) ?? 0, ultima: Math.max(...xs.map((x) => x.data!)), abc: a, criticidade: crit,
    });
  }
  return out.sort((a, b) => b.quebras - a.quebras || b.reparo - a.reparo || a.codigo.localeCompare(b.codigo));
}

export const CRITICIDADES = ["Alta", "Média", "Baixa", "Sem classe"];
export const FAIXAS_QUEBRAS = ["1", "2–3", "4–6", "7 ou mais"];

/** Matriz criticidade × faixa de quebras (nº de equipamentos em cada célula). */
export function matrizCriticidade(tab: Pick<LinhaEquip, "criticidade" | "quebras">[]): number[][] {
  const m = CRITICIDADES.map(() => FAIXAS_QUEBRAS.map(() => 0));
  for (const t of tab) {
    const i = CRITICIDADES.indexOf(t.criticidade || "Sem classe");
    m[i < 0 ? 3 : i][faixa([1, 3, 6], t.quebras)]++;
  }
  return m;
}

export const DIAS_SEMANA = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];
/** Quebras por dia da semana (segunda primeiro). */
export function porDiaDaSemana(q: Pick<Quebra, "data">[]): number[] {
  const out = DIAS_SEMANA.map(() => 0);
  for (const x of q) if (x.data != null) out[(partes(x.data).semana + 6) % 7]++;
  return out;
}

/**
 * MTBF (dias) e disponibilidade (%) de cada mês, com a mesma conta do indicador: dias do mês (até hoje) ×
 * equipamentos que quebraram ÷ quebras com equipamento; disponibilidade = MTBF·24 ÷ (MTBF·24 + MTTR do mês).
 */
export function mtbfMensal(q: Pick<Quebra, "data" | "equipChave">[], meses: Dia[], hoje: Dia, mttr: (number | null)[]):
  { mtbf: (number | null)[]; disponibilidade: (number | null)[] } {
  const mtbf = meses.map((m, i) => {
    const fim = Math.min(i + 1 < meses.length ? meses[i + 1] - 1 : proxMes(m) - 1, hoje);
    const xs = q.filter((x) => x.data != null && x.data >= m && x.data <= fim && x.equipChave);
    return xs.length ? ((fim - m + 1) * new Set(xs.map((x) => x.equipChave)).size) / xs.length : null;
  });
  return { mtbf, disponibilidade: mtbf.map((b, i) => (b != null && mttr[i] != null ? ((b * 24) / (b * 24 + mttr[i]!)) * 100 : null)) };
}

function proxMes(m: Dia): Dia {
  const p = partes(m);
  return Math.round(Date.UTC(p.ano, p.mes, 1) / 86_400_000);
}
