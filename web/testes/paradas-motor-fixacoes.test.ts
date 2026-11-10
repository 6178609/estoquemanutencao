import { describe, expect, it } from "vitest";

import { programar } from "@/lib/paradas/motor";
import type { Fixacao, ResultadoMotor } from "@/lib/paradas/tipos";

import { entrada, itens, N } from "./paradas-fixtures";

const M = "2026-11";
const linhasDe = (r: ResultadoMotor, ativo: string) => r.linhas.filter((l) => l.ativo === ativo);
const fix = (ativo: string, data: number, turno: Fixacao["turno"], x: Partial<Fixacao> = {}): Fixacao =>
  ({ id: `${M}|${ativo}|${x.parada ?? 1}`, mes: M, ativo, parada: 1, data, turno, ...x });

describe("motor — fixações", () => {
  const base = () => [itens("GOLDEN 01", N(5), "MEC", 6), itens("PVC 08", N(5), "MEC", 2)];

  it("a parada fixada vai inteira, com os mesmos itens; o resto se reprograma em volta", () => {
    const dem = base();
    const a = programar(entrada(dem));
    const antes = linhasDe(a, "GOLDEN 01");
    expect(antes.map((l) => [l.data, l.turno])).toEqual([[N(2), 2]]);
    expect(linhasDe(a, "PVC 08")[0].data).not.toBe(N(2));
    const b = programar(entrada(dem, { fixacoes: [fix("GOLDEN 01", N(17), 2)] }));
    const depois = linhasDe(b, "GOLDEN 01");
    expect(depois.map((l) => [l.data, l.turno])).toEqual([[N(17), 2]]);
    expect(depois[0].itens).toEqual(antes[0].itens);
    expect(depois[0].marcas).toContain("fixada");
    expect(linhasDe(b, "PVC 08")[0].data).toBe(N(2));
  });

  it("fixação num domingo não é barrada", () => {
    const r = programar(entrada(base(), { fixacoes: [fix("GOLDEN 01", N(15), 1)] }));
    expect(linhasDe(r, "GOLDEN 01").map((l) => [l.data, l.turno])).toEqual([[N(15), 1]]);
  });

  it("1+2: divide entre os turnos; sem capacidade, tudo no 1º turno", () => {
    const r = programar(entrada([itens("GOLDEN 01", N(5), "MEC", 20)], { fixacoes: [fix("GOLDEN 01", N(10), "1+2")] }));
    expect(linhasDe(r, "GOLDEN 01").map((l) => [l.turno, l.hh.mec])).toEqual([[1, 5], [2, 15]]);
    const s = programar(entrada([itens("GOLDEN 01", N(5), "MEC", 20)], { fixacoes: [fix("GOLDEN 01", N(15), "1+2")] }));
    expect(linhasDe(s, "GOLDEN 01").map((l) => [l.turno, l.hh.mec])).toEqual([[1, 20]]);
  });

  it("parada inexistente vira órfã", () => {
    const f = fix("GOLDEN 01", N(20), 2, { parada: 2, id: `${M}|GOLDEN 01|2` });
    const dem = base();
    const r = programar(entrada(dem, { fixacoes: [f] }));
    expect(r.fixacoesOrfas).toEqual([f]);
    expect(r.linhas).toEqual(programar(entrada(dem)).linhas);
  });

  it("parada extra de prensa na semana de outra prensa", () => {
    const dem = [itens("PRENSA COPE", N(5), "MEC", 5), itens("PRENSA PANSTONE", N(5), "MEC", 5)];
    const r = programar(entrada(dem, { fixacoes: [fix("PRENSA PANSTONE", N(6), 1, { extra: true })] }));
    expect(linhasDe(r, "PRENSA COPE").map((l) => l.data)).toEqual([N(4)]);
    const p = linhasDe(r, "PRENSA PANSTONE");
    expect(p.map((l) => l.data)).toEqual([N(6)]);
    expect(p[0].marcas).toEqual(expect.arrayContaining(["fixada", "parada extra"]));
    expect(p[0].paradasNoMes).toBe(1);
  });
});
