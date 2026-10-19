import { chave } from "../dados/texto";

/**
 * Indicadores SIM do pilar MP (Manutenção Profissional), da base mensal do Dashboard F26 enviada em Fontes de dados.
 * A tela repete o Deck mensal da Comissão Executiva: por área e indicador, o mês anterior (meta × real), o mês
 * escolhido (meta × real e a seta contra o mês anterior), o acumulado do ano (YTD), o próximo mês (meta × previsão) e
 * o ano (meta × estimativa). Tipo A: quanto maior, melhor (real ≥ meta); tipo B: quanto menor, melhor (real ≤ meta).
 * Testado em testes/indicadoresSim.test.ts.
 */
export type TipoKpi = "A" | "B";

export interface LinhaSim {
  area: string; kpi: string; tipo: TipoKpi;
  /** "2026-03" */
  mes: string;
  metaMes: number | null; fcstMes: number | null; realMes: number | null;
  ytdMeta: number | null; ytdReal: number | null;
  fyMeta: number | null; fyEstimativa: number | null; fyAnterior: number | null;
  semanas: (number | null)[];
}

export const ORDEM_KPIS = ["Indisponibilidade", "MTTR", "MTBF", "Número de quebras totais", "Número de quebras MP", "Plano de Manutenção"];

const num = (v: unknown): number | null => {
  const s = String(v ?? "").trim();
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};

/** "01/03/2026" (ou "2026-03-01") → "2026-03". */
export function mesDe(v: unknown): string | null {
  const s = String(v ?? "").trim();
  let m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(s);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}`;
  m = /^(\d{4})-(\d{2})/.exec(s);
  return m ? `${m[1]}-${m[2]}` : null;
}

/** As linhas do parquet (colunas com o nome da planilha) no formato da tela. */
export function prepararIndicadoresSim(linhas: Record<string, unknown>[]): LinhaSim[] {
  if (!linhas.length) return [];
  const porChave = new Map(Object.keys(linhas[0]).map((c) => [chave(c), c]));
  const col = (rx: RegExp) => [...porChave].find(([k]) => rx.test(k))?.[1] ?? "";
  const c = {
    pilar: col(/^PILAR$/), area: col(/^AREA$/), tipo: col(/^TIPO$/), kpi: col(/^KPIS? INDUSTRIA/), mes: col(/^MES ANO$/),
    metaMes: col(/^META MES$/), fcst: col(/^FCST MES$/), real: col(/^REAL MES$/), ytdMeta: col(/^YTD META$/), ytdReal: col(/^YTD REAL$/),
    fyMeta: col(/^FY META$/), fyEst: col(/^FY ESTIMATIVA$/), fyAnt: col(/^FY \d{4}$/),
  };
  const semanas = [1, 2, 3, 4, 5].map((n) => col(new RegExp(`^SEMANA ${n}$`)));
  const saida: LinhaSim[] = [];
  for (const l of linhas) {
    if (c.pilar && chave(l[c.pilar]) !== "MP") continue;
    const mes = mesDe(l[c.mes]), kpi = String(l[c.kpi] ?? "").trim(), area = String(l[c.area] ?? "").trim();
    if (!mes || !kpi || !area) continue;
    saida.push({
      area, kpi: nomeKpi(kpi), tipo: String(l[c.tipo] ?? "").trim().toUpperCase() === "A" ? "A" : "B", mes,
      metaMes: num(l[c.metaMes]), fcstMes: num(l[c.fcst]), realMes: num(l[c.real]), ytdMeta: num(l[c.ytdMeta]), ytdReal: num(l[c.ytdReal]),
      fyMeta: num(l[c.fyMeta]), fyEstimativa: num(l[c.fyEst]), fyAnterior: num(l[c.fyAnt]), semanas: semanas.map((s) => (s ? num(l[s]) : null)),
    });
  }
  return saida;
}

/** O nome canônico (a mesma área escrita com outra caixa ou sem acento vira uma só). */
const canonico = (lista: string[]) => {
  const m = new Map(lista.map((x) => [chave(x), x]));
  return (x: string) => m.get(chave(x)) ?? x;
};
const nomeKpi = canonico(ORDEM_KPIS);

/** Bateu a meta? (sem meta ou sem real: não dá para dizer) */
export function atinge(tipo: TipoKpi, real: number | null, meta: number | null): boolean | null {
  if (real == null || meta == null) return null;
  return tipo === "A" ? real >= meta : real <= meta;
}

/** Meses com algum real lançado, do mais novo para o mais velho. */
export function mesesComReal(l: LinhaSim[]): string[] {
  return [...new Set(l.filter((x) => x.realMes != null).map((x) => x.mes))].sort().reverse();
}

export function mesAnterior(mes: string, d = -1): string {
  const [a, m] = mes.split("-").map(Number);
  const t = a * 12 + (m - 1) + d;
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, "0")}`;
}

export interface Par { meta: number | null; real: number | null; ok: boolean | null }
export interface LinhaDeck {
  area: string; kpi: string; tipo: TipoKpi;
  anterior: Par;
  atual: Par & { tendencia: "sobe" | "desce" | "igual" | null; melhorou: boolean | null };
  ytd: Par;
  proximo: { meta: number | null; previsao: number | null };
  ano: { meta: number | null; estimativa: number | null; ok: boolean | null };
  /** real de janeiro até o mês escolhido (para a minilinha) */
  serie: (number | null)[];
}

const ordem = (lista: string[], x: string) => {
  const i = lista.indexOf(x);
  return i < 0 ? lista.length : i;
};

/** O Deck do mês: uma linha por área × indicador — as áreas na ordem da planilha ("Geral" por último), os indicadores na do Deck. */
export function montarDeck(l: LinhaSim[], mes: string): { area: string; linhas: LinhaDeck[] }[] {
  const idx = new Map(l.map((x) => [`${x.area}\u0000${x.kpi}\u0000${x.mes}`, x]));
  const areas0 = [...new Set(l.map((x) => x.area))].sort((a, b) => Number(chave(a) === "GERAL") - Number(chave(b) === "GERAL"));
  const pares = [...new Map(l.map((x) => [`${x.area}\u0000${x.kpi}`, x])).values()]
    .sort((a, b) => areas0.indexOf(a.area) - areas0.indexOf(b.area) || ordem(ORDEM_KPIS, a.kpi) - ordem(ORDEM_KPIS, b.kpi) || a.kpi.localeCompare(b.kpi));
  const ant = mesAnterior(mes), prox = mesAnterior(mes, 1);
  const inicio = `${mes.slice(0, 4)}-01`;
  const areas = new Map<string, LinhaDeck[]>();
  for (const p of pares) {
    const pega = (m: string) => idx.get(`${p.area}\u0000${p.kpi}\u0000${m}`);
    const a = pega(mes), b = pega(ant), n = pega(prox);
    const tipo = (a ?? p).tipo;
    const real = a?.realMes ?? null, realAnt = b?.realMes ?? null;
    const tendencia = real == null || realAnt == null ? null : real > realAnt ? "sobe" : real < realAnt ? "desce" : "igual";
    const serie: (number | null)[] = [];
    for (let m = inicio; m <= mes; m = mesAnterior(m, 1)) serie.push(pega(m)?.realMes ?? null);
    const linha: LinhaDeck = {
      area: p.area, kpi: p.kpi, tipo,
      anterior: { meta: b?.metaMes ?? null, real: realAnt, ok: atinge(tipo, realAnt, b?.metaMes ?? null) },
      atual: { meta: a?.metaMes ?? null, real, ok: atinge(tipo, real, a?.metaMes ?? null), tendencia,
        melhorou: tendencia == null || tendencia === "igual" ? null : (tendencia === "sobe") === (tipo === "A") },
      ytd: { meta: a?.ytdMeta ?? null, real: a?.ytdReal ?? null, ok: atinge(tipo, a?.ytdReal ?? null, a?.ytdMeta ?? null) },
      proximo: { meta: n?.metaMes ?? null, previsao: n?.fcstMes ?? null },
      ano: { meta: a?.fyMeta ?? null, estimativa: a?.fyEstimativa ?? null, ok: atinge(tipo, a?.fyEstimativa ?? null, a?.fyMeta ?? null) },
      serie,
    };
    (areas.get(p.area) ?? areas.set(p.area, []).get(p.area)!).push(linha);
  }
  return [...areas].map(([area, linhas]) => ({ area, linhas }));
}

/** Unidade para mostrar o número. */
export function unidadeKpi(kpi: string): "%" | "h" | "" {
  const k = chave(kpi);
  if (/INDISPONIBILIDADE|PLANO DE MANUTENCAO|ADERENCIA/.test(k)) return "%";
  if (/^MTTR|^MTBF/.test(k)) return "h";
  return "";
}
