import { chave } from "../dados/texto";
import * as ind from "./indicadores";
import { montarDeck, type LinhaSim, type TipoKpi } from "./indicadoresSim";

/**
 * Os indicadores do SAP na linguagem do SIM: tipo A (quanto maior, melhor) ou B (quanto menor, melhor), meta × real no
 * mês, mês anterior e acumulado do ano (YTD), e os KPIs do pilar MP do Deck (Indisponibilidade, MTTR, MTBF, quebras,
 * Plano de Manutenção) calculados pelo SAP ao lado da meta e do real da planilha. Testado em testes/indicadoresSim.test.ts.
 */
export const tipoDe = (k: ind.Kpi): TipoKpi => (k.sentido > 0 ? "A" : "B");

/** Os KPIs do Deck MP e como saem dos indicadores do site (null = o SAP não tem como calcular). */
export const KPIS_MP: { kpi: string; tipo: TipoKpi; unidade: "%" | "h" | "un"; de: ((r: ind.Resultado) => number | null) | null; fonte: string }[] = [
  { kpi: "Indisponibilidade", tipo: "B", unidade: "%", fonte: "100% − disponibilidade (MTBF ÷ (MTBF + MTTR))",
    de: (r) => (r.disponibilidade == null ? null : 100 - r.disponibilidade) },
  { kpi: "MTTR", tipo: "B", unidade: "h", fonte: "MTTR das quebras", de: (r) => r.mttr ?? null },
  { kpi: "MTBF", tipo: "A", unidade: "h", fonte: "MTBF em horas (dias × 24)", de: (r) => (r.mtbf == null ? null : r.mtbf * 24) },
  { kpi: "Número de quebras totais", tipo: "B", unidade: "un", fonte: "notas Y1 convertidas em YM11", de: (r) => r.quebras ?? null },
  { kpi: "Número de quebras MP", tipo: "B", unidade: "un", fonte: "não há no SAP: só a planilha", de: null },
  { kpi: "Plano de Manutenção", tipo: "A", unidade: "%", fonte: "aderência ao plano (IP19 × IW38)", de: (r) => r.aderencia ?? null },
];

const somaOuMedia = (kpi: string, xs: (number | null)[]) => {
  const v = xs.filter((x): x is number => x != null);
  if (!v.length) return null;
  const soma = v.reduce((a, b) => a + b, 0);
  return /QUEBRAS/i.test(kpi) ? soma : soma / v.length;
};

export interface LinhaMp {
  kpi: string; tipo: TipoKpi; unidade: "%" | "h" | "un"; fonte: string;
  sap: number | null; sapYtd: number | null; metaPlanilha: number | null; realPlanilha: number | null; ok: boolean | null;
}

/** KPIs do Deck MP: o real do SAP no mês contra a meta da planilha (soma das áreas nas quebras, média nos demais). */
export function kpisMp(mes: ind.Resultado, ytd: ind.Resultado, deck: LinhaSim[], mesSim: string): LinhaMp[] {
  const linhas = montarDeck(deck, mesSim).flatMap((a) => a.linhas);
  return KPIS_MP.map((x) => {
    // a área "Geral" já é o total da fábrica: com ela, só ela (somar com as outras contaria duas vezes)
    const doKpi = linhas.filter((l) => l.kpi === x.kpi);
    const geral = doKpi.filter((l) => chave(l.area) === "GERAL");
    const daPlanilha = geral.length ? geral : doKpi;
    const metaPlanilha = somaOuMedia(x.kpi, daPlanilha.map((l) => l.atual.meta));
    const sap = x.de ? x.de(mes) : null;
    const ok = sap == null || metaPlanilha == null ? null : x.tipo === "A" ? sap >= metaPlanilha : sap <= metaPlanilha;
    return { kpi: x.kpi, tipo: x.tipo, unidade: x.unidade, fonte: x.fonte, sap, sapYtd: x.de ? x.de(ytd) : null, metaPlanilha,
      realPlanilha: somaOuMedia(x.kpi, daPlanilha.map((l) => l.atual.real)), ok };
  });
}

/** Os grupos do site com nomes do SIM. */
export const GRUPOS_SIM: { titulo: string; grupos: string[] }[] = [
  { titulo: "Pilar MP — confiabilidade e preditiva", grupos: [ind.CONFIABILIDADE, ind.PREDITIVA] },
  { titulo: "Pilar MP — planejamento e controle", grupos: [ind.PLANEJAMENTO] },
  { titulo: "Análise de falhas (AF)", grupos: [ind.ANALISE_FALHA] },
  { titulo: "Pessoas — mão de obra da manutenção", grupos: [ind.MAO_DE_OBRA] },
  { titulo: "Custos da manutenção", grupos: [ind.CUSTOS] },
  { titulo: "MRO — peças e suprimentos", grupos: [ind.SUPRIMENTOS] },
];

export interface LinhaSap { kpi: ind.Kpi; tipo: TipoKpi; meta: number | null; anterior: number | null; real: number | null; ytd: number | null; farol: ind.Farol; farolYtd: ind.Farol }

/** Uma linha por indicador do site, no formato do Deck (meta, mês anterior, mês, acumulado e farol). */
export function linhasSap(mes: ind.Resultado, anterior: ind.Resultado, ytd: ind.Resultado, metas: Parameters<typeof ind.meta>[1]): LinhaSap[] {
  return ind.KPIS.map((k) => {
    const meta = ind.meta(k, metas);
    return { kpi: k, tipo: tipoDe(k), meta, anterior: anterior[k.id] ?? null, real: mes[k.id] ?? null, ytd: ytd[k.id] ?? null,
      farol: ind.farol(k, mes[k.id], meta), farolYtd: ind.farol(k, ytd[k.id], meta) };
  });
}
