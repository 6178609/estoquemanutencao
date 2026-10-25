import { mesAnterior, montarDeck, ORDEM_KPIS, type LinhaDeck, type LinhaSim, type TipoKpi } from "./indicadoresSim";
import { situacao, type MaquinaRoadmap } from "./roadmapSim";

/**
 * Visão geral (gerencial) do SIM: junta o Deck do pilar MP (indicadores de manutenção × meta) e o Roadmap (passo
 * previsto × realizado por máquina) num retrato do mês — quanto está na meta, como evoluiu no ano, por indicador, por
 * área, e os pontos de atenção. Testado em testes/indicadoresSim.test.ts.
 */
export interface Conta { na: number; de: number }
export const pct = (c: Conta): number | null => (c.de ? (c.na / c.de) * 100 : null);
const contar = (xs: (boolean | null)[]): Conta => {
  const c = xs.filter((x): x is boolean => x != null);
  return { na: c.filter(Boolean).length, de: c.length };
};
const somar = (a: Conta, b: Conta): Conta => ({ na: a.na + b.na, de: a.de + b.de });

/** Índice do mês ("2026-09" → 8) para cruzar com o roadmap (que não traz o ano: é o do Deck). */
export const indiceMes = (mes: string) => Number(mes.slice(5, 7)) - 1;
/** O roadmap só vale para o ano dele (`ano`, "2026"); outro ano da base mensal fica sem roadmap. */
const doAno = (ms: MaquinaRoadmap[], mes: string, ano?: string) => (!ano || mes.startsWith(ano) ? ms : []);

function contaRoadmap(ms: MaquinaRoadmap[], i: number): Conta {
  return contar(ms.map((m) => {
    const s = situacao(m.previsto[i], m.realizado[i]);
    return s === "sem" ? null : s === "ok";
  }));
}

interface PontoMes { mes: string; deck: Conta; roadmap: Conta }

/** Evolução de janeiro até o mês: % dos indicadores na meta e % das máquinas no previsto. */
export function evolucao(l: LinhaSim[], ms: MaquinaRoadmap[], mes: string, ano?: string): PontoMes[] {
  const saida: PontoMes[] = [];
  for (let m = `${mes.slice(0, 4)}-01`; m <= mes; m = mesAnterior(m, 1)) {
    const deck = contar(montarDeck(l, m).flatMap((a) => a.linhas.map((x) => x.atual.ok)));
    saida.push({ mes: m, deck, roadmap: contaRoadmap(doAno(ms, m, ano), indiceMes(m)) });
  }
  return saida;
}

interface LinhaIndicador { kpi: string; tipo: TipoKpi; mes: Conta; ytd: Conta; foraDaMeta: string[]; serie: (number | null)[] }

/** Cada indicador de manutenção somado nas áreas: quantas áreas na meta no mês e no acumulado, e a série do % no ano. */
export function porIndicador(l: LinhaSim[], mes: string): LinhaIndicador[] {
  const deck = montarDeck(l, mes).flatMap((a) => a.linhas);
  const kpis = [...new Set(deck.map((x) => x.kpi))].sort((a, b) => ordem(a) - ordem(b) || a.localeCompare(b));
  const meses: string[] = [];
  for (let m = `${mes.slice(0, 4)}-01`; m <= mes; m = mesAnterior(m, 1)) meses.push(m);
  const decks = meses.map((m) => montarDeck(l, m).flatMap((a) => a.linhas));
  return kpis.map((kpi) => {
    const xs = deck.filter((x) => x.kpi === kpi);
    return {
      kpi, tipo: xs[0].tipo, mes: contar(xs.map((x) => x.atual.ok)), ytd: contar(xs.map((x) => x.ytd.ok)),
      foraDaMeta: xs.filter((x) => x.atual.ok === false).map((x) => x.area),
      serie: decks.map((d) => pct(contar(d.filter((x) => x.kpi === kpi).map((x) => x.atual.ok)))),
    };
  });
}
const ordem = (k: string) => {
  const i = ORDEM_KPIS.indexOf(k);
  return i < 0 ? ORDEM_KPIS.length : i;
};

interface LinhaArea { area: string; mes: Conta; ytd: Conta; foraDaMeta: string[] }

export function porArea(l: LinhaSim[], mes: string): LinhaArea[] {
  return montarDeck(l, mes).map((a) => ({
    area: a.area, mes: contar(a.linhas.map((x) => x.atual.ok)), ytd: contar(a.linhas.map((x) => x.ytd.ok)),
    foraDaMeta: a.linhas.filter((x) => x.atual.ok === false).map((x) => x.kpi),
  })).sort((a, b) => (pct(a.mes) ?? 101) - (pct(b.mes) ?? 101) || a.area.localeCompare(b.area));
}

interface Resumo { deck: Conta; ytd: Conta; roadmap: Conta; geral: Conta; melhoraram: number; pioraram: number }

/** O retrato do mês. "Geral" = itens na meta (indicadores + máquinas no previsto) sobre todos os itens com dado. */
export function resumoSim(l: LinhaSim[], ms: MaquinaRoadmap[], mes: string, ano?: string): Resumo {
  const deck = montarDeck(l, mes).flatMap((a) => a.linhas);
  const d = contar(deck.map((x) => x.atual.ok)), r = contaRoadmap(doAno(ms, mes, ano), indiceMes(mes));
  return { deck: d, ytd: contar(deck.map((x) => x.ytd.ok)), roadmap: r, geral: somar(d, r),
    melhoraram: deck.filter((x) => x.atual.melhorou === true).length, pioraram: deck.filter((x) => x.atual.melhorou === false).length };
}

/** Pontos de atenção: indicadores fora da meta no mês (os que pioraram primeiro) e máquinas abaixo do passo previsto. */
export function pontosAtencao(l: LinhaSim[], ms: MaquinaRoadmap[], mes: string, ano?: string): { indicadores: LinhaDeck[]; maquinas: MaquinaRoadmap[] } {
  const i = indiceMes(mes);
  return {
    indicadores: montarDeck(l, mes).flatMap((a) => a.linhas).filter((x) => x.atual.ok === false)
      .sort((a, b) => Number(b.atual.melhorou === false) - Number(a.atual.melhorou === false)),
    maquinas: doAno(ms, mes, ano).filter((m) => situacao(m.previsto[i], m.realizado[i]) === "atrasada")
      .sort((a, b) => ((b.previsto[i] ?? 0) - (b.realizado[i] ?? 0)) - ((a.previsto[i] ?? 0) - (a.realizado[i] ?? 0)) || a.maquina.localeCompare(b.maquina)),
  };
}
