import { describe, expect, it } from "vitest";

import { programar } from "@/lib/paradas/motor";
import type { ResultadoMotor } from "@/lib/paradas/tipos";

import { entrada, itens, N, P0 } from "./paradas-fixtures";

const linhasDe = (r: ResultadoMotor, ativo: string) => r.linhas.filter((l) => l.ativo === ativo);
const diaDe = (r: ResultadoMotor, ativo: string) => linhasDe(r, ativo).map((l) => l.data);

describe("motor — retirados e críticos", () => {
  it("injetora com HH irrelevante sai da programação", () => {
    const r = programar(entrada([itens("INJETORA 13", N(5), "MEC", 0.15, 0.15), itens("INJETORA 12", N(5), "MEC", 0.25, 0.25)]));
    expect(r.retirados).toHaveLength(1);
    expect(r.retirados[0].ativo).toBe("INJETORA 13");
    expect(r.retirados[0].motivo).toContain("0,2");
    expect(linhasDe(r, "INJETORA 13")).toEqual([]);
    expect(r.semHh.filter((s) => s.ativo === "INJETORA 13")).toEqual([]);
    expect(linhasDe(r, "INJETORA 12")).toHaveLength(1);
  });

  it("DRY BLEND na segunda; Banbury na segunda seguinte com o moinho junto", () => {
    const r = programar(entrada([itens("DRY BLEND", N(10), "MEC", 8), itens("BANBURY", N(3), "MEC", 10), itens("MOINHO 04", N(20), "MEC", 2)]));
    expect(linhasDe(r, "DRY BLEND").map((l) => [l.data, l.turno, l.parada])).toEqual([[N(2), 1, 1]]);
    expect(diaDe(r, "BANBURY")).toEqual([N(9)]);
    expect(linhasDe(r, "MOINHO 04").map((l) => [l.data, l.turno])).toEqual([[N(9), 1]]);
  });

  it("sem Banbury no mês, o MOINHO 04 é um ativo comum (só 1º turno)", () => {
    const r = programar(entrada([itens("MOINHO 04", N(20), "MEC", 2)]));
    expect(linhasDe(r, "MOINHO 04").map((l) => [l.data, l.turno])).toEqual([[N(17), 1]]);
    expect(r.semHh).toEqual([]);
  });

  it("prensas nas quartas, uma por semana, cada uma com o moinho SF da vez", () => {
    const r = programar(entrada([itens("PRENSA COPE", N(5), "MEC", 5), itens("PRENSA PANSTONE", N(5), "MEC", 5),
      itens("MOINHO 02", N(5), "MEC", 3), itens("MOINHO 05", N(5), "MEC", 3)]));
    expect(diaDe(r, "PRENSA COPE")).toEqual([N(4)]);
    expect(diaDe(r, "MOINHO 02")).toEqual([N(4)]);
    expect(diaDe(r, "PRENSA PANSTONE")).toEqual([N(11)]);
    expect(diaDe(r, "MOINHO 05")).toEqual([N(11)]);
    expect(linhasDe(r, "MOINHO 02")[0].marcas).toContain("semana da prensa");
  });

  it("a mesma prensa não repete a semana anterior ao início", () => {
    const r = programar(entrada([itens("PRENSA COPE", N(5), "MEC", 5), itens("PRENSA PANSTONE", N(5), "MEC", 5)],
      { ocupacaoAnterior: [{ semana: "2026-W44", ativo: "PRENSA COPE", grupo: "PRENSA/MOINHO SF" }] }));
    expect(diaDe(r, "PRENSA COPE")).toEqual([N(11)]);
    expect(diaDe(r, "PRENSA PANSTONE")).toEqual([N(4)]);
  });

  it("Pellets nas terças e injetoras EXP nas quintas e sextas", () => {
    const r = programar(entrada([itens("PELLET 01", N(5), "MEC", 4), itens("PELLET 02", N(5), "MEC", 4), itens("INJETORA 10", N(5), "MEC", 2),
      itens("INJETORA 11", N(5), "MEC", 2), itens("INJETORA 12", N(5), "MEC", 2)]));
    expect([...diaDe(r, "PELLET 01"), ...diaDe(r, "PELLET 02")]).toEqual([N(3), N(10)]);
    expect([...diaDe(r, "INJETORA 10"), ...diaDe(r, "INJETORA 11"), ...diaDe(r, "INJETORA 12")]).toEqual([N(5), N(6), N(12)]);
  });

  it("feriado na quarta: a prensa vai na quarta seguinte, sem marca", () => {
    const r = programar(entrada([itens("PRENSA COPE", N(5), "MEC", 5)], { p: { ...P0, feriados: [{ data: "2026-11-04", nome: "Teste" }] } }));
    expect(linhasDe(r, "PRENSA COPE").map((l) => [l.data, l.marcas])).toEqual([[N(11), []]]);
  });

  it("prensa maior que o turno: o que couber no 1º candidato; o resto fica pendente", () => {
    const r = programar(entrada([itens("PRENSA COPE", N(5), "MEC", 50, 5)]));
    expect(linhasDe(r, "PRENSA COPE").map((l) => [l.data, l.hh.mec])).toEqual([[N(4), 35]]);
    expect(r.semHh.find((s) => s.ativo === "PRENSA COPE")?.hh.mec).toBe(15);
  });

  it("determinístico", () => {
    const e = entrada([itens("PRENSA COPE", N(5), "MEC", 5), itens("DRY BLEND", N(10), "MEC", 8), itens("PELLET 01", N(5), "MEC", 4)]);
    expect(programar(e)).toEqual(programar(e));
  });
});
