import { describe, expect, it } from "vitest";

import { faixa, grupoDaClasse, mesesEntre, moda, pareto, segunda, somarPor } from "@/app/(app)/confiabilidade/_comum/agregar";
import { matrizCriticidade, mtbfMensal, porDiaDaSemana, porEquipamento } from "@/app/(app)/confiabilidade/calculo";
import type { Quebra } from "@/lib/wcm/indicadores";
import type { Ordem } from "@/lib/wcm/preparo";
import { dia, partes } from "@/lib/wcm/util";

/** Contas da aba Confiabilidade (dados fictícios). */
const D = (a: number, m: number, d: number) => dia(a, m, d)!;
const q = (eq: string, data: number, horas: number | null, reinc = false) =>
  ({ equipChave: eq, objeto: `Máquina ${eq}`, local: "L1", localizacao: "A1", data, horasReparo: horas, reincidente: reinc }) as unknown as Quebra;

describe("agregar", () => {
  it("pareto: itens que somam 80% (o que cruza conta)", () => {
    const p = pareto(new Map([["a", 50], ["b", 30], ["c", 15], ["d", 5]]));
    expect(p.total).toBe(100);
    expect(p.n80).toBe(2);
    expect(p.itens.map((x) => x.vital)).toEqual([true, true, false, false]);
    expect(pareto(new Map([["a", 90], ["b", 10]])).n80).toBe(1);
  });
  it("somarPor ignora chave vazia ou usa o rótulo de vazio", () => {
    expect([...somarPor(["a", "", "a"], (x) => x)]).toEqual([["a", 2]]);
    expect(somarPor(["a", ""], (x) => x, () => 1, "—").get("—")).toBe(1);
  });
  it("faixa, segunda, meses, moda e grupo da classe", () => {
    expect([faixa([7, 30], 7), faixa([7, 30], 8), faixa([7, 30], 99)]).toEqual([0, 1, 2]);
    expect(partes(segunda(D(2026, 10, 11))).semana).toBe(1); // domingo → segunda anterior
    expect(segunda(D(2026, 10, 11))).toBe(D(2026, 10, 5));
    expect(mesesEntre(D(2026, 1, 15), D(2026, 3, 2))).toEqual([D(2026, 1, 1), D(2026, 2, 1), D(2026, 3, 1)]);
    expect(moda(["b", "a", "b", "", "a"])).toBe("a");
    expect([grupoDaClasse("Lubrificação"), grupoDaClasse("Emergencial"), grupoDaClasse("Melhoria")]).toEqual(["Planejada", "Emergencial", "Outras"]);
  });
});

describe("confiabilidade", () => {
  const qs = [q("E1", D(2026, 1, 5), 2), q("E1", D(2026, 1, 20), 4, true), q("E2", D(2026, 1, 10), null)];
  const ordens = [{ equipChave: "E1", custoReal: 100 }, { equipChave: "E1", custoReal: 50 }, { equipChave: "E3", custoReal: 9 }] as unknown as Ordem[];
  it("por equipamento: MTBF, MTTR, custo, criticidade (cadastro > ABC)", () => {
    const t = porEquipamento(qs, ordens, 30, { E2: { criticidade: "Alta" } }, new Map([["E1", "B"], ["E2", "C"]]));
    expect(t[0]).toMatchObject({ codigo: "E1", quebras: 2, reincidencias: 1, mtbf: 15, mttr: 3, reparo: 6, custo: 150, ordens: 2, criticidade: "Média", ultima: D(2026, 1, 20) });
    expect(t[1]).toMatchObject({ codigo: "E2", mttr: null, criticidade: "Alta", custo: 0 });
  });
  it("matriz criticidade × faixa e dia da semana (segunda primeiro)", () => {
    const m = matrizCriticidade([{ criticidade: "Alta", quebras: 1 }, { criticidade: "", quebras: 8 }, { criticidade: "Alta", quebras: 3 }]);
    expect(m[0]).toEqual([1, 1, 0, 0]);
    expect(m[3]).toEqual([0, 0, 0, 1]);
    expect(porDiaDaSemana([{ data: D(2026, 10, 12) }, { data: D(2026, 10, 11) }])).toEqual([1, 0, 0, 0, 0, 0, 1]); // seg, dom
  });
  it("MTBF mensal com a conta do indicador", () => {
    const r = mtbfMensal(qs, [D(2026, 1, 1)], D(2026, 12, 31), [3]);
    expect(r.mtbf[0]).toBeCloseTo((31 * 2) / 3);
    expect(r.disponibilidade[0]).toBeCloseTo(((62 / 3) * 24 / ((62 / 3) * 24 + 3)) * 100);
  });
});
