import { describe, expect, it } from "vitest";

import { conferir } from "@/lib/paradas/conferencias";
import { diasDaEntrada, programar } from "@/lib/paradas/motor";
import { alertas } from "@/lib/paradas/regras";
import type { EntradaMotor, HH, ResultadoMotor } from "@/lib/paradas/tipos";
import { resumoPorMes, saldoPorDia } from "@/lib/paradas/visoes";

import { D, entrada, itens, N } from "./paradas-fixtures";

// uma semana fictícia cheia: um crítico por dia no 1º turno, não críticos no 2º, CALANDRA no sábado
const NOMES: [string, number][] = [["DRY BLEND", 8], ["PELLET 01", 4], ["PRENSA COPE", 5], ["MOINHO 02", 3], ["INJETORA 10", 3],
  ["INJETORA 11", 3], ["PVC 08", 2], ["GOLDEN 01", 3], ["TIEN KANG 06", 4], ["MICRONIZADOR 01", 2], ["TIPOA 1", 2], ["CALANDRA", 6]];

function tudo(e: EntradaMotor, r: ResultadoMotor = programar(e), dias = diasDaEntrada(e)) {
  const saldo = saldoPorDia(r, dias, e.ativos, null, undefined, e.parametros);
  return conferir({ e, r, dias, saldo, resumo: resumoPorMes(e.demandas, r, saldo), alertas: alertas(r.linhas, e) });
}
const res = (cs: ReturnType<typeof conferir>) => Object.fromEntries(cs.map((c) => [c.id, c.resultado]));

describe("as 11 conferências", () => {
  const e = entrada(NOMES.map(([n, h]) => itens(n, N(5), "MEC", h)), { fim: N(7) });

  it("resultado do motor: C1–C9 OK, C10 e C11 sem backlog", () => {
    const cs = tudo(e);
    expect(cs.map((c) => c.id)).toEqual(["C1", "C2", "C3", "C4", "C5", "C6", "C7", "C8", "C9", "C10", "C11"]);
    expect(cs.filter((c) => c.resultado === "VERIFICAR").map((c) => `${c.id}: ${c.detalhe}`)).toEqual([]);
    expect(res(cs)).toMatchObject({ C10: "—", C11: "—" });
  });

  it("capacidade divergente dos parâmetros → C1", () => {
    const dias = diasDaEntrada(e).map((d) => (d.condicao === "util" ? { ...d, cap: { ...d.cap, t2: { mec: 10, ele: 3 } } } : d));
    expect(res(tudo(e, programar(e), dias)).C1).toBe("VERIFICAR");
  });

  it("linha movida para domingo → C3 e C9", () => {
    const r = programar(e);
    const l = r.linhas.find((x) => x.ativo === "MICRONIZADOR 01")!;
    const movida = { ...r, linhas: r.linhas.map((x) => (x === l ? { ...x, data: N(8) } : x)) };
    const cs = tudo(e, movida);
    expect(res(cs)).toMatchObject({ C3: "VERIFICAR", C9: "VERIFICAR" });
    expect(cs.find((c) => c.id === "C9")!.detalhe).toContain("CALENDARIO");
  });

  it("item tirado de uma linha → C5; sem HH apagado → C6", () => {
    const r = programar(e);
    const tirado = { ...r, linhas: r.linhas.map((x, i) => (i === 0 ? { ...x, itens: x.itens.slice(1) } : x)) };
    expect(res(tudo(e, tirado)).C5).toBe("VERIFICAR");
    const grande = entrada([itens("PRENSA COPE", N(5), "MEC", 100)]);
    const g = programar(grande);
    expect(g.semHh).toHaveLength(1);
    expect(res(tudo(grande, { ...g, semHh: [] })).C6).toBe("VERIFICAR");
  });

  it("dia útil sem 2º turno → C8 com a data", () => {
    const pouco = entrada([itens("PVC 08", N(3), "MEC", 2)], { fim: N(3) });
    const c8 = tudo(pouco).find((c) => c.id === "C8")!;
    expect(c8.resultado).toBe("VERIFICAR");
    expect(c8.detalhe).toContain("02/11");
  });

  it("C8 só nos meses com carga", () => {
    const doisMeses = entrada([itens("PVC 08", N(3), "MEC", 2)], { fim: D(2026, 12, 31) });
    const c8 = tudo(doisMeses).find((c) => c.id === "C8")!;
    expect(c8.detalhe).toContain("02/11");
    expect(c8.detalhe).not.toContain("01/12");
    expect(c8.detalhe).toContain("dez/26");
  });

  it("backlog: C10 e C11", () => {
    const r = programar(e), dias = diasDaEntrada(e);
    const saldo = saldoPorDia(r, dias, e.ativos, null, undefined, e.parametros);
    const dia = saldo.find((l) => l.condicao === "util" && l.backlog.mec > 0)!;
    const h = (mec: number): HH => ({ mec, ele: 0 });
    const base = { e, r, dias, saldo, resumo: resumoPorMes(e.demandas, r, saldo), alertas: [] };
    const aloc = { porDia: { [String(dia.data)]: { t1: h(dia.backlog.mec + 2), t2: h(0) } } };
    const ok = { pendente: h(100), noCalendario: h(30), alocado: h(60), semSaldo: h(10) };
    const cs = conferir({ ...base, backlog: { aloc, resumo: ok } });
    expect(res(cs)).toMatchObject({ C10: "VERIFICAR", C11: "OK" });
    expect(res(conferir({ ...base, backlog: { aloc: { porDia: {} }, resumo: { ...ok, semSaldo: h(5) } } }))).toMatchObject({ C10: "OK", C11: "VERIFICAR" });
  });
});
