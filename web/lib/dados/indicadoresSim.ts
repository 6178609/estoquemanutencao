import "server-only";

import { DESTINO } from "../leitura/tipos";
import { ORDEM_KPIS, prepararIndicadoresSim, type LinhaSim } from "../wcm/indicadoresSim";
import { prepararRoadmap, type MaquinaRoadmap } from "../wcm/roadmapSim";
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

/** Roadmap SIM (passos por máquina), enviado em Fontes de dados. */
export async function roadmapSim(): Promise<Base<MaquinaRoadmap[]>> {
  if (!fonte()) return { dados: demoRoadmap(), atualizado: new Date().toISOString(), origem: "demonstração" };
  return lerBase(DESTINO.roadmap_sim, prepararRoadmap);
}

function demoRoadmap(): MaquinaRoadmap[] {
  let s = 11;
  const r = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
  const ultimo = Math.max(0, new Date().getMonth() - 1);
  const saida: MaquinaRoadmap[] = [];
  for (const fam of ["MÁQUINA A", "MÁQUINA B", "LINHA C"]) for (let n = 1; n <= 6; n++) {
    const inicio = Math.floor(r() * 4), alvo = 3 + (r() > 0.8 ? 1 : 0);
    const previsto = Array.from({ length: 12 }, (_, i) => Math.min(alvo, Math.max(0, Math.floor((i - inicio + 2) / 2))));
    const realizado = previsto.map((p, i) => (i > ultimo ? null : r() < 0.15 ? Math.max(0, p - 1) : p));
    const atrasada = realizado[ultimo] != null && realizado[ultimo]! < previsto[ultimo];
    saida.push({ fabrica: "F00", maquina: `${fam} ${String(n).padStart(2, "0")}`, previsto, realizado,
      comentario: atrasada ? "EXEMPLO: EXECUÇÃO DE ETIQUETAS ABAIXO DA META" : "" });
  }
  return saida;
}
