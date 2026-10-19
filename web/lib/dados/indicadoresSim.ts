import "server-only";

import { DESTINO } from "../leitura/tipos";
import { ORDEM_KPIS, prepararIndicadoresSim, type LinhaSim } from "../wcm/indicadoresSim";
import { lerBase, type Base } from "./bases";
import { fonte } from "./fonte";

/** Base mensal do Dashboard de Indicadores SIM (só o pilar MP), enviada em Fontes de dados. */
export async function indicadoresSim(): Promise<Base<LinhaSim[]>> {
  if (!fonte()) return { dados: demoSim(), atualizado: new Date().toISOString(), origem: "demonstração" };
  return lerBase(DESTINO.indicadores_sim, prepararIndicadoresSim);
}

// ---------------------------------------------------------------------------- demonstração (dados fictícios)
let cacheDemo: LinhaSim[] | null = null;
function demoSim(): LinhaSim[] {
  if (cacheDemo) return cacheDemo;
  let s = 7;
  const r = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
  const ano = new Date().getFullYear(), ultimo = Math.max(1, new Date().getMonth()); // real até o mês passado
  const base: Record<string, [number, "A" | "B"]> = { Indisponibilidade: [4, "B"], MTTR: [1, "B"], MTBF: [120, "A"],
    "Número de quebras totais": [20, "B"], "Número de quebras MP": [3, "B"], "Plano de Manutenção": [95, "A"] };
  const saida: LinhaSim[] = [];
  for (const area of ["Linha A", "Linha B", "Linha C", "Linha D", "Linha E"]) for (const kpi of ORDEM_KPIS) {
    const [meta, tipo] = base[kpi];
    let ytdM = 0, ytdR = 0;
    for (let m = 1; m <= 12; m++) {
      const metaMes = +(meta * (0.9 + r() * 0.2)).toFixed(2);
      const realMes = m <= ultimo ? +(metaMes * (0.6 + r() * 0.8)).toFixed(2) : null;
      ytdM += metaMes;
      if (realMes != null) ytdR += realMes;
      const quebra = /QUEBRAS/i.test(kpi);
      saida.push({ area, kpi, tipo, mes: `${ano}-${String(m).padStart(2, "0")}`, metaMes, fcstMes: +(metaMes * (0.9 + r() * 0.2)).toFixed(2), realMes,
        ytdMeta: m <= ultimo + 1 ? +(quebra ? ytdM : ytdM / m).toFixed(2) : null,
        ytdReal: m <= ultimo ? +(quebra ? ytdR : ytdR / m).toFixed(2) : null,
        fyMeta: quebra ? +(meta * 12).toFixed(0) : meta, fyEstimativa: quebra ? +(meta * 12 * (0.8 + r() * 0.4)).toFixed(0) : +(meta * (0.8 + r() * 0.4)).toFixed(2),
        fyAnterior: null, semanas: [null, null, null, null, null] });
    }
  }
  return (cacheDemo = saida);
}
