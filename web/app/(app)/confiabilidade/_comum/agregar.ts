import type { Cor } from "@/components/graficos";
import { PLANEJADAS } from "@/lib/wcm/indicadores";
import { inicioDoMes, type Dia } from "@/lib/wcm/util";

/**
 * Agregações puras usadas pelas abas Confiabilidade, Custos e Mão de obra (testadas em testes/confiabilidade.test.ts,
 * custos.test.ts e mao_de_obra.test.ts). Tudo agregado no servidor: o navegador só recebe o resumo.
 */

/** Soma `valor` por `chave` (chave vazia = "—" quando `vazio` for dado; senão fica fora). */
export function somarPor<T>(xs: Iterable<T>, chave: (x: T) => string, valor: (x: T) => number = () => 1, vazio?: string): Map<string, number> {
  const m = new Map<string, number>();
  for (const x of xs) {
    let k = chave(x);
    if (!k) { if (vazio == null) continue; k = vazio; }
    m.set(k, (m.get(k) ?? 0) + valor(x));
  }
  return m;
}

/** Os `n` maiores (desc; empate em ordem alfabética para a tela não pular). */
export function maiores(m: Map<string, number>, n = Infinity): [string, number][] {
  return [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "pt-BR")).slice(0, n);
}

export interface ItemPareto { item: string; valor: number; pct: number; acumulado: number; vital: boolean }

/**
 * Pareto (80/20): itens do maior para o menor com % e % acumulado; `vital` = está entre os poucos que somam 80%
 * (o item que cruza os 80% conta, como no app Streamlit: nº de itens com acumulado < 80 + 1).
 */
export function pareto(m: Map<string, number>): { itens: ItemPareto[]; n80: number; total: number } {
  const ord = maiores(new Map([...m].filter(([, v]) => v > 0)));
  const total = ord.reduce((s, [, v]) => s + v, 0);
  let acc = 0;
  const itens = ord.map(([item, valor]) => {
    acc += valor;
    return { item, valor, pct: total ? (valor / total) * 100 : 0, acumulado: total ? (acc / total) * 100 : 0, vital: false };
  });
  const n80 = itens.length ? Math.min(itens.length, itens.filter((x) => x.acumulado < 80 - 1e-9).length + 1) : 0;
  itens.forEach((x, i) => { x.vital = i < n80; });
  return { itens, n80, total };
}

/**
 * Classes WCM do tipo de ordem agrupadas em até 4 séries (regra de cor: no máximo 4 identidades, o resto em
 * "Outras"). A tabela de cada gráfico mantém a classe original.
 */
export const GRUPOS_CLASSE: { nome: string; cor: Cor }[] = [
  { nome: "Planejada", cor: "serie-1" }, { nome: "Corretiva", cor: "serie-2" }, { nome: "Emergencial", cor: "serie-3" }, { nome: "Outras", cor: "serie-4" },
];
export function grupoDaClasse(classe: string): string {
  if (PLANEJADAS.includes(classe)) return "Planejada";
  if (classe === "Corretiva" || classe === "Emergencial") return classe;
  return "Outras";
}

/** Meses (1º dia) cobertos por [ini, fim]. */
export function mesesEntre(ini: Dia, fim: Dia): Dia[] {
  const out: Dia[] = [];
  for (let m = inicioDoMes(ini); m <= fim; ) {
    out.push(m);
    const d = new Date(m * 86_400_000);
    m = Math.round(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1) / 86_400_000);
  }
  return out;
}

/** Segunda-feira da semana do dia (semana de segunda a domingo, como o W-SUN do pandas). */
export function segunda(d: Dia): Dia {
  const dow = new Date(d * 86_400_000).getUTCDay(); // 0 = domingo
  return d - ((dow + 6) % 7);
}

/** Faixa de um valor pelos limites superiores inclusivos: faixa([7, 30], 10) = 1. */
export function faixa(limites: number[], v: number): number {
  const i = limites.findIndex((l) => v <= l);
  return i < 0 ? limites.length : i;
}

/** Moda (valor mais frequente; empate → o menor, como o mode().iat[0] do pandas). Vazios não contam. */
export function moda(xs: string[]): string {
  const m = new Map<string, number>();
  for (const x of xs) if (x) m.set(x, (m.get(x) ?? 0) + 1);
  let melhor = "", n = 0;
  for (const [x, c] of m) if (c > n || (c === n && x < melhor)) { n = c; melhor = x; }
  return melhor;
}
