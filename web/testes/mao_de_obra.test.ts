import { describe, expect, it } from "vitest";

import { cargaFutura, idadeBacklog, porCentroNatureza, porPessoa, porSemana, type Exec } from "@/app/(app)/mao_de_obra/calculo";
import { FORA_DO_IW38 } from "@/lib/wcm/indicadores";
import type { Operacao } from "@/lib/wcm/preparo";
import { dia } from "@/lib/wcm/util";

/** Contas da aba Mão de obra (dados fictícios). */
const D = (a: number, m: number, d: number) => dia(a, m, d)!;
const e = (np: string, ordem: string, horas: number, fimReal: number, noIw38 = true, comPlano = false, classe = "Corretiva", centro = "C1"): Exec =>
  ({ np, ordem, horas, fimReal, noIw38, comPlano, classe: noIw38 ? classe : FORA_DO_IW38, centroTrabalho: centro, atividade: "" });

describe("mão de obra", () => {
  const ex = [e("1", "A", 4, D(2026, 10, 5), true, true, "Preventiva"), e("1", "B", 4, D(2026, 10, 6), true, false, "Emergencial"),
    e("1", "C", 2, D(2026, 10, 6), false), e("2", "A", 8, D(2026, 10, 13), true, true, "Preventiva", "C2")];
  it("por pessoa: % sobre as horas no IW38, utilização pela disponibilidade", () => {
    const p = porPessoa(ex, true, (np) => (np === "1" ? 20 : null));
    expect(p[0]).toMatchObject({ np: "1", horas: 10, dias: 2, ordens: 3, pctPlano: 50, pctEmerg: 50, pctFora: 20, centro: "C1", hhDia: 5, utilizacao: 50 });
    expect(p[1]).toMatchObject({ np: "2", utilizacao: null });
    expect(porPessoa(ex, false, () => null)[0].pctEmerg).toBeNull();
  });
  it("por semana e por centro × natureza", () => {
    const s = porSemana(ex);
    expect(s.semanas).toEqual([D(2026, 10, 5), D(2026, 10, 12)]);
    expect(s.series.find((x) => x.nome === "Planejada")!.valores).toEqual([4, 8]);
    expect(s.series.find((x) => x.nome === "Outras")!.valores).toEqual([2, 0]);
    expect(porCentroNatureza(ex)).toEqual([{ centro: "C1", total: 10, partes: [4, 4, 2] }, { centro: "C2", total: 8, partes: [8, 0, 0] }]);
  });
  it("idade do backlog e carga futura", () => {
    expect(idadeBacklog([{ idade: 3, comPlano: true }, { idade: 200, comPlano: false }, { idade: 30, comPlano: false }]))
      .toEqual([[1, 0], [0, 1], [0, 0], [0, 0], [0, 1]]);
    const op = (inicio: number | null, horas: number, concluida = false) => ({ inicio, horas, concluida, cancelada: false }) as unknown as Operacao;
    const c = cargaFutura([op(D(2026, 10, 12), 5), op(D(2026, 10, 20), 3), op(D(2026, 10, 1), 9), op(D(2026, 10, 14), 7, true), op(null, 1)], D(2026, 10, 14));
    expect(c).toHaveLength(12);
    expect(c[0]).toEqual({ semana: D(2026, 10, 12), horas: 5 });
    expect(c[1].horas).toBe(3);
  });
});
