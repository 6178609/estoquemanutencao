import { describe, expect, it } from "vitest";

import { segunda } from "@/lib/paradas/calendario";
import { diasDaEntrada, novoCtx, programar } from "@/lib/paradas/motor";
import { MOTIVO } from "@/lib/paradas/motor/comum";
import { Estado } from "@/lib/paradas/motor/estado";
import { reavaliar } from "@/lib/paradas/motor/saldo";
import type { ItemPlano, ResultadoMotor } from "@/lib/paradas/tipos";

import { DENOM, entrada, item, itens, N } from "./paradas-fixtures";

const linhasDe = (r: ResultadoMotor, ativo: string) => r.linhas.filter((l) => l.ativo === ativo);

describe("motor — saldo ≤ 4 h, 2ª parada e Ativos sem HH", () => {
  it("saldo ≤ 4 h junta na parada, acima do limite", () => {
    const r = programar(entrada([[...itens("PRENSA COPE", N(5), "MEC", 42, 3), ...itens("PRENSA COPE", N(5), "ELE", 5)]]));
    const ls = linhasDe(r, "PRENSA COPE");
    expect(ls).toHaveLength(1);
    expect(ls[0]).toMatchObject({ data: N(4), hh: { mec: 42, ele: 5 }, acima: { mec: 3, ele: 0 }, paradasNoMes: 1 });
    expect(ls[0].marcas).toContain("estouro ≤4h");
  });

  it("saldo > 4 h: 2ª parada em semana posterior, sem repetir a prensa na semana seguinte", () => {
    const r = programar(entrada([itens("PRENSA COPE", N(5), "MEC", 50, 5)]));
    expect(linhasDe(r, "PRENSA COPE").map((l) => [l.data, l.parada, l.paradasNoMes])).toEqual([[N(4), 1, 2], [N(18), 2, 2]]);
  });

  it("MEC ≤ 4 mas ELE > 4 não é estouro", () => {
    const r = programar(entrada([[...itens("PRENSA COPE", N(5), "MEC", 42, 3), ...itens("PRENSA COPE", N(5), "ELE", 18)]]));
    expect(linhasDe(r, "PRENSA COPE").map((l) => l.parada)).toEqual([1, 2]);
    expect(linhasDe(r, "PRENSA COPE").every((l) => l.acima.mec === 0 && l.acima.ele === 0)).toBe(true);
  });

  it("prensa que não cabe em 2 paradas vai para Ativos sem HH", () => {
    const r = programar(entrada([itens("PRENSA COPE", N(5), "MEC", 100)]));
    expect(linhasDe(r, "PRENSA COPE").map((l) => l.hh.mec)).toEqual([39, 39]);
    expect(r.semHh).toEqual([expect.objectContaining({ ativo: "PRENSA COPE", hh: { mec: 22, ele: 0 }, motivo: MOTIVO.prensa })]);
  });

  it("moinho SF: só junto da prensa", () => {
    const r = programar(entrada([itens("PRENSA COPE", N(5), "ELE", 1), itens("MOINHO 02", N(5), "MEC", 45)]));
    expect(linhasDe(r, "MOINHO 02").map((l) => [l.data, l.hh.mec])).toEqual([[N(4), 39]]);
    expect(r.semHh).toEqual([expect.objectContaining({ ativo: "MOINHO 02", hh: { mec: 6, ele: 0 }, motivo: MOTIVO.moinho })]);
    const s = programar(entrada([itens("MOINHO 02", N(5), "MEC", 3)]));
    expect(s.linhas).toEqual([]);
    expect(s.semHh[0].motivo).toBe(MOTIVO.moinho);
    expect(s.avisos.join(" ")).toContain("sem prensa");
  });

  it("não crítico maior que T2+T1: 2ª parada em outra semana", () => {
    const r = programar(entrada([itens("GOLDEN 01", N(2), "MEC", 60, 3)]));
    const ls = linhasDe(r, "GOLDEN 01");
    const p1 = ls.filter((l) => l.parada === 1), p2 = ls.filter((l) => l.parada === 2);
    expect(p1.reduce((s, l) => s + l.hh.mec, 0)).toBe(54);
    expect(p2.reduce((s, l) => s + l.hh.mec, 0)).toBe(6);
    expect(segunda(p2[0].data)).toBeGreaterThan(segunda(p1[0].data));
    const st = programar(entrada([itens("STABIL 01", N(2), "MEC", 60, 3)]));
    const ds = linhasDe(st, "STABIL 01").map((l) => l.data);
    expect(ds).toHaveLength(2);
    expect(segunda(ds[1])).toBeGreaterThan(segunda(ds[0]));
  });

  it("passo 7: o saldo entra no outro turno do dia da parada", () => {
    const e = entrada([itens("GOLDEN 01", N(3), "MEC", 3)]);
    const est = new Estado(diasDaEntrada(e), e.ativos, e.parametros);
    const out: ResultadoMotor = { linhas: [], semHh: [], retirados: [], fixacoesOrfas: [], avisos: [] };
    const c = novoCtx(e, est, "2026-11", diasDaEntrada(e), out, { ultimo: -1 });
    est.colocar("GOLDEN 01", "2026-11", N(3), 1, [item("GOLDEN 01", "2026-11", N(3), "MEC", 1)], 1, []);
    est.colocar("GOLDEN 01", "2026-11", N(10), 1, [item("GOLDEN 01", "2026-11", N(10), "MEC", 1)], 2, []);
    reavaliar(c, ["GOLDEN 01"]);
    expect(c.pend.get("GOLDEN 01")).toBeUndefined();
    expect(est.linhas.get("2026-11|GOLDEN 01|1|2")?.hh.mec).toBe(3);
  });
});

describe("propriedade: nada some, nada repete", () => {
  it("20 entradas pseudoaleatórias", () => {
    let s = 12345;
    const rnd = () => ((s = (s * 1103515245 + 12345) % 2147483648) / 2147483648);
    const nomes = Object.keys(DENOM);
    for (let k = 0; k < 20; k++) {
      const dem: ItemPlano[][] = [];
      for (const n of nomes) {
        if (rnd() < 0.5) continue;
        const its: ItemPlano[] = [];
        const q = 1 + Math.floor(rnd() * 12);
        for (let i = 0; i < q; i++) its.push(item(n, "2026-11", N(2 + Math.floor(rnd() * 28)), rnd() < 0.7 ? "MEC" : "ELE", Math.round(rnd() * 80) / 10));
        dem.push(its);
      }
      if (!dem.length) continue;
      const e = entrada(dem);
      const r = programar(e);
      const tot = (xs: { hh: { mec: number; ele: number } }[]) => xs.reduce((a, x) => ({ mec: a.mec + x.hh.mec, ele: a.ele + x.hh.ele }), { mec: 0, ele: 0 });
      const esp = tot(e.demandas), got = [tot(r.linhas), tot(r.semHh), tot(r.retirados)].reduce((a, b) => ({ mec: a.mec + b.mec, ele: a.ele + b.ele }));
      expect(got.mec).toBeCloseTo(esp.mec, 6);
      expect(got.ele).toBeCloseTo(esp.ele, 6);
      const chaves = [...r.linhas.flatMap((l) => l.itens), ...r.semHh.flatMap((x) => x.itens)];
      expect(new Set(chaves).size).toBe(chaves.length);
      expect(programar(e)).toEqual(r);
    }
  });
});
