import { describe, expect, it } from "vitest";

import { programar } from "@/lib/paradas/motor";
import type { ResultadoMotor } from "@/lib/paradas/tipos";

import { entrada, itens, N, P0 } from "./paradas-fixtures";

const linhasDe = (r: ResultadoMotor, ativo: string) => r.linhas.filter((l) => l.ativo === ativo);
const lt = (r: ResultadoMotor, ativo: string) => linhasDe(r, ativo).map((l) => [l.data, l.turno]);

describe("motor — sábado e não críticos", () => {
  it("só sábado: no sábado da janela", () => {
    const r = programar(entrada([itens("CALANDRA", N(5), "MEC", 6), itens("STABIL 01", N(20), "MEC", 3)]));
    expect(lt(r, "CALANDRA")).toEqual([[N(7), 1]]);
    expect(lt(r, "STABIL 01")).toEqual([[N(21), 1]]);
  });

  it("GOLDEN no 2º turno do dia menos carregado, fora do dia do DRY BLEND", () => {
    expect(lt(programar(entrada([itens("GOLDEN 01", N(5), "MEC", 2)])), "GOLDEN 01")).toEqual([[N(2), 2]]);
    const r = programar(entrada([itens("DRY BLEND", N(5), "MEC", 8), itens("GOLDEN 01", N(5), "MEC", 2)]));
    expect(lt(r, "GOLDEN 01")).toEqual([[N(3), 2]]);
  });

  it("no dia do DRY BLEND, outro ativo só no 2º turno", () => {
    const r = programar(entrada([itens("DRY BLEND", N(2), "MEC", 8), itens("PVC 08", N(2), "MEC", 2)], { fim: N(2) }));
    expect(lt(r, "DRY BLEND")).toEqual([[N(2), 1]]);
    expect(lt(r, "PVC 08")).toEqual([[N(2), 2]]);
  });

  it("PANSTONE prefere o 1º turno de um dia de crítico (um por dia)", () => {
    const r = programar(entrada([itens("INJETORA 10", N(5), "MEC", 4), itens("PANSTONE 01", N(5), "MEC", 4),
      itens("PANSTONE 02", N(5), "MEC", 4)]));
    expect(lt(r, "INJETORA 10")).toEqual([[N(5), 1]]);
    expect(lt(r, "PANSTONE 01")).toEqual([[N(5), 1]]);
    expect(linhasDe(r, "PANSTONE 02")[0].data).not.toBe(N(5));
    expect(linhasDe(r, "PANSTONE 02")[0].turno).toBe(1);
  });

  it("maior que o 2º turno: começa no T2 e continua no T1 do mesmo dia", () => {
    const r = programar(entrada([itens("PVC 09", N(2), "ELE", 5)]));
    expect(linhasDe(r, "PVC 09").map((l) => [l.data, l.turno, l.hh.ele, l.parada, l.marcas])).toEqual([
      [N(2), 1, 2, 1, ["1º+2º turno"]], [N(2), 2, 3, 1, ["1º+2º turno"]]]);
  });

  it("janela cheia: antecipa com a marca", () => {
    const feriados = [23, 24, 25, 26, 27, 28, 30].map((d) => ({ data: `2026-11-${d}`, nome: "Teste" }));
    const r = programar(entrada([itens("TIEN KANG 06", N(25), "MEC", 2)], { p: { ...P0, feriados } }));
    const l = linhasDe(r, "TIEN KANG 06");
    expect(l).toHaveLength(1);
    expect(l[0].data).toBeLessThan(N(22));
    expect(l[0].marcas).toContain("antecipado");
  });

  it("mesmo tipo não fica no mesmo dia", () => {
    const r = programar(entrada([itens("PVC 08", N(2), "MEC", 2), itens("PVC 09", N(2), "MEC", 2)], { fim: N(3) }));
    expect(new Set([...linhasDe(r, "PVC 08"), ...linhasDe(r, "PVC 09")].map((l) => l.data)).size).toBe(2);
  });
});
