import { describe, expect, it } from "vitest";

import { capacidadeDoMes, chaveMes, chaveSemana, diaDeIso, diasDoMes, mesesDoHorizonte } from "@/lib/paradas/calendario";
import { PARAMETROS_PADRAO } from "@/lib/paradas/parametros";
import { dia } from "@/lib/wcm/util";

const D = (a: number, m: number, d: number) => dia(a, m, d)!;

describe("calendário de trabalho", () => {
  it("semana ISO e mês", () => {
    expect(chaveSemana(D(2026, 11, 2))).toBe("2026-W45");
    expect(chaveSemana(D(2026, 11, 9))).toBe("2026-W46");
    expect(chaveSemana(D(2027, 1, 1))).toBe("2026-W53");
    expect(chaveMes(D(2026, 3, 9))).toBe("2026-03");
    expect(diaDeIso("2026-11-20")).toBe(D(2026, 11, 20));
    expect(diaDeIso("2026-02-31")).toBeNull();
  });

  it("condição e capacidade de cada dia", () => {
    const ds = diasDoMes("2026-11", PARAMETROS_PADRAO, D(2026, 11, 3));
    expect(ds).toHaveLength(30);
    const de = (d: number) => ds.find((x) => x.data === D(2026, 11, d))!;
    expect(de(1).condicao).toBe("domingo");
    expect(de(2).condicao).toBe("antes");
    expect(de(15).condicao).toBe("domingo");
    expect(de(20).condicao).toBe("feriado");
    expect(de(20).feriado).toBe("Consciência Negra");
    expect(de(7).condicao).toBe("sabado");
    expect(de(7).cap).toEqual({ t1: { mec: 39, ele: 13 }, t2: { mec: 0, ele: 0 } });
    expect(de(3).condicao).toBe("util");
    expect(de(3).cap).toEqual({ t1: { mec: 39, ele: 13 }, t2: { mec: 15, ele: 3 } });
    expect(de(3).semana).toBe("2026-W45");
    expect(de(3).diaSemana).toBe(2);
    expect(capacidadeDoMes(ds)).toEqual({ mec: 1182, ele: 356 });
  });

  it("feriado no sábado não tem capacidade", () => {
    const p = { ...PARAMETROS_PADRAO, feriados: [{ data: "2026-11-07", nome: "Teste" }] };
    const s = diasDoMes("2026-11", p, D(2026, 11, 1)).find((x) => x.data === D(2026, 11, 7))!;
    expect(s.condicao).toBe("feriado");
    expect(s.cap).toEqual({ t1: { mec: 0, ele: 0 }, t2: { mec: 0, ele: 0 } });
  });

  it("meses do horizonte", () => {
    expect(mesesDoHorizonte(D(2026, 11, 10), 3)).toEqual(["2026-11", "2026-12", "2027-01"]);
  });
});
