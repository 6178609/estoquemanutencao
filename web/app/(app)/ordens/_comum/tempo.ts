import { MESES, inicioDoMes, mesBr, partes, somarMeses, type Dia } from "@/lib/wcm/util";

/** Segunda-feira da semana da data (Dia 0 = quinta, 01/01/1970). */
export const inicioDaSemana = (d: Dia) => d - ((d + 3) % 7);

/**
 * Eixo de tempo do período: por semana até ~2 meses, por mês acima disso. `indice(d)` → posição (ou -1 fora).
 * Mês: "Jan/26"; semana: "05/Jan" (a segunda-feira).
 */
export function eixoTempo(ini: Dia, fim: Dia, maxMeses = 24): { rotulos: string[]; indice: (d: Dia | null) => number; porSemana: boolean } {
  if (fim - ini <= 62) {
    const s0 = inicioDaSemana(ini);
    const n = Math.floor((inicioDaSemana(fim) - s0) / 7) + 1;
    const rotulos = Array.from({ length: n }, (_, i) => {
      const p = partes(s0 + i * 7);
      return `${String(p.dia).padStart(2, "0")}/${MESES[p.mes - 1]}`;
    });
    return { rotulos, porSemana: true, indice: (d) => (d == null || d < ini || d > fim ? -1 : Math.floor((inicioDaSemana(d) - s0) / 7)) };
  }
  let m0 = inicioDoMes(ini);
  const mf = inicioDoMes(fim);
  const meses: Dia[] = [];
  for (let m = m0; m <= mf; m = somarMeses(m, 1)) meses.push(m);
  if (meses.length > maxMeses) { meses.splice(0, meses.length - maxMeses); m0 = meses[0]; }
  const pos = new Map(meses.map((m, i) => [m, i]));
  return { rotulos: meses.map(mesBr), porSemana: false,
    indice: (d) => (d == null || d < m0 || d < ini || d > fim ? -1 : pos.get(inicioDoMes(d)) ?? -1) };
}
