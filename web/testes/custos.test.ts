import { describe, expect, it } from "vitest";

import { custoPor, ordensDoPeriodo, porEquipamento, porMes, resumo } from "@/app/(app)/custos/calculo";
import type { Ordem } from "@/lib/wcm/preparo";
import { dia } from "@/lib/wcm/util";

/** Contas da aba Custos (dados fictícios). */
const D = (a: number, m: number, d: number) => dia(a, m, d)!;
const o = (ordem: string, tipo: string, data: number, custo: number, comPlano: boolean, eq = "", situacao = "Liberada") =>
  ({ ordem, tipo, data, custoReal: custo, comPlano, equipChave: eq, objeto: `Eq ${eq}`, localizacao: "", centroTrabalho: "C1", situacao }) as unknown as Ordem;
const TIPOS = { YM01: { descricao: "Preventiva", classe: "" }, YM11: { descricao: "Corretiva Emergencial", classe: "" } };

describe("custos", () => {
  const ords = [o("1", "YM01", D(2026, 1, 5), 100, true, "E1"), o("2", "YM11", D(2026, 2, 5), 300, false, "E2"),
    o("3", "YM11", D(2026, 2, 6), 50, false, "E1", "Cancelada"), o("4", "ZZ", D(2026, 2, 7), 0, false), o("5", "YM01", D(2025, 12, 1), 999, true)];
  const per = ordensDoPeriodo(ords, D(2026, 1, 1), D(2026, 2, 28), TIPOS);
  it("período sem canceladas, com classe", () => {
    expect(per.map((x) => x.ordem)).toEqual(["1", "2", "4"]);
    expect(per.map((x) => x.classe)).toEqual(["Preventiva", "Emergencial", "Sem classe"]);
  });
  it("resumo", () => {
    expect(resumo(per, D(2026, 1, 1), D(2026, 2, 28))).toMatchObject({ total: 400, comPlano: 100, backlog: 300, emergencial: 300, comCusto: 2, ordens: 3 });
  });
  it("por mês em grupos e classes", () => {
    const m = porMes(per, D(2026, 1, 1), D(2026, 2, 28));
    expect(m.meses).toEqual([D(2026, 1, 1), D(2026, 2, 1)]);
    expect(m.series.find((s) => s.nome === "Planejada")!.valores).toEqual([100, 0]);
    expect(m.series.find((s) => s.nome === "Emergencial")!.valores).toEqual([0, 300]);
    expect(m.classes.map((c) => c.classe)).toEqual(["Preventiva", "Emergencial", "Sem classe"]);
  });
  it("custo por dimensão e pareto por equipamento", () => {
    expect(custoPor(per, (x) => x.localizacao, 5, "—")).toEqual([["—", 400]]);
    const eq = porEquipamento(per);
    expect(eq.linhas.map((x) => [x.codigo, x.custo, x.backlog])).toEqual([["E2", 300, 1], ["E1", 100, 0]]);
    expect(eq.n80).toBe(2);
  });
});
