import { describe, expect, it } from "vitest";

import { diasDoMes } from "@/lib/paradas/calendario";
import { calendarioDoMes } from "@/lib/paradas/calendarioVisao";
import type { LinhaProgramacao, ResultadoMotor } from "@/lib/paradas/tipos";
import { resumoPorMes, saldoPorDia } from "@/lib/paradas/visoes";

import { ativos, N, P0 } from "./paradas-fixtures";

const M = "2026-11";
const AT = ativos(["DRY BLEND", "PVC 08", "GOLDEN 01"]);
const P = { ...P0, feriados: [{ data: "2026-11-20", nome: "Consciência Negra" }] };
const DIAS = diasDoMes(M, P, N(2));
function linha(ativo: string, data: number, turno: 1 | 2, x: Partial<LinhaProgramacao> = {}): LinhaProgramacao {
  const a = AT[ativo];
  return { id: `${M}|${ativo}|${x.parada ?? 1}|${turno}`, data, turno, ativo, mes: M, parada: 1, paradasNoMes: 1, hh: { mec: 2, ele: 1 },
    acima: { mec: 0, ele: 0 }, itens: [], marcas: [], tipo: a.tipo, grupo: a.grupo, campos: a.campos, ...x };
}
function cal(linhas: LinhaProgramacao[], alertas: { linhaId: string }[] = []) {
  const r: ResultadoMotor = { linhas, semHh: [], retirados: [], fixacoesOrfas: [], avisos: [] };
  const saldo = saldoPorDia(r, DIAS, AT, null, undefined, P);
  return calendarioDoMes({ mes: M, r, dias: DIAS, ativos: AT, saldo, resumo: resumoPorMes([], r, saldo), alertas, p: P });
}

describe("calendário do mês", () => {
  const c = cal([linha("DRY BLEND", N(2), 1), linha("PVC 08", N(3), 2, { parada: 1, paradasNoMes: 2 }),
    linha("PVC 08", N(10), 2, { parada: 2, paradasNoMes: 2, id: `${M}|PVC 08|2|2` }), linha("GOLDEN 01", N(4), 2)], [{ linhaId: `${M}|GOLDEN 01|1|2` }]);

  it("semanas de segunda a sábado, dias de outro mês marcados", () => {
    expect(c.semanas[0].dias.map((d) => d.data)).toEqual([N(2), N(3), N(4), N(5), N(6), N(7)]);
    const ult = c.semanas[c.semanas.length - 1];
    expect(ult.dias[0].data).toBe(N(30));
    expect(ult.dias[1].doMes).toBe(false);
    expect(c.semanas.every((s) => s.dias.length === 6)).toBe(true);
    expect(c.semanas[0].rotulo).toContain("Semana 45");
  });

  it("feriado com nome e sem turnos", () => {
    const f = c.semanas.flatMap((s) => s.dias).find((d) => d.data === N(20))!;
    expect(f).toMatchObject({ condicao: "feriado", feriado: "Consciência Negra", turnos: [] });
  });

  it("cartões por turno, com parada n/2 e alerta", () => {
    const d2 = c.semanas[0].dias[0];
    expect(d2.turnos.map((t) => t.t)).toEqual([1, 2]);
    expect(d2.turnos[0].cartoes[0]).toMatchObject({ ativo: "DRY BLEND", rotulo: "DRY BLEND", alerta: false, grupo: "DRY BLEND" });
    expect(d2.turnos[0].janela).toBe("05:30–14:00");
    expect(d2.hhDia).toEqual({ mec: [2, 54], ele: [1, 16] });
    const pvc = c.semanas[0].dias[1].turnos[1].cartoes[0];
    expect(pvc.rotulo).toBe("PVC 08 (parada 1/2)");
    expect(c.semanas[0].dias[2].turnos[1].cartoes[0].alerta).toBe(true);
    const sab = c.semanas[0].dias[5];
    expect(sab.turnos.map((t) => [t.t, t.janela])).toEqual([[1, "05:30–11:30"]]);
  });

  it("resumo do mês", () => {
    expect(c.resumo?.programado).toEqual({ mec: 8, ele: 4 });
  });
});
