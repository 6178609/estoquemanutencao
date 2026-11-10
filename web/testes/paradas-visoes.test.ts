import { describe, expect, it } from "vitest";

import { diasDoMes } from "@/lib/paradas/calendario";
import type { LinhaProgramacao, ResultadoMotor } from "@/lib/paradas/tipos";
import { ativosSemHh, camposPorDia, listaDeCampos, resumoPorMes, saldoPorDia } from "@/lib/paradas/visoes";

import { ativos, D, demanda, item, N, P0 } from "./paradas-fixtures";

const M = "2026-11";
const AT = ativos(["DRY BLEND", "PVC 08", "GOLDEN 01", "PELLET 02"]);
AT["PELLET 02"].campos = ["C-201", "C-202"];
function linha(ativo: string, data: number, turno: 1 | 2, mec: number, ele: number): LinhaProgramacao {
  const a = AT[ativo];
  return { id: `${M}|${ativo}|1|${turno}`, data, turno, ativo, mes: M, parada: 1, paradasNoMes: 1, hh: { mec, ele }, acima: { mec: 0, ele: 0 },
    itens: [], marcas: [], tipo: a.tipo, grupo: a.grupo, campos: a.campos };
}
const res = (linhas: LinhaProgramacao[], x: Partial<ResultadoMotor> = {}): ResultadoMotor =>
  ({ linhas, semHh: [], retirados: [], fixacoesOrfas: [], avisos: [], ...x });
const P = { ...P0, feriados: [{ data: "2026-11-02", nome: "Finados" }] };
const DIAS = diasDoMes(M, P, N(1));

describe("visões", () => {
  it("saldo do dia e saldo para o backlog", () => {
    const s = saldoPorDia(res([linha("PVC 08", N(3), 1, 30, 10), linha("GOLDEN 01", N(3), 2, 10, 2)]), DIAS, AT, null, undefined, P);
    const d3 = s.find((x) => x.data === N(3))!;
    expect(d3.t1.saldo).toEqual({ mec: 9, ele: 3 });
    expect(d3.t2.saldo).toEqual({ mec: 5, ele: 1 });
    expect(d3.backlog).toEqual({ mec: 14, ele: 4 });
    expect(d3.total).toBe(18);
    expect(d3.situacao).toBe("Dia útil");
    const db = saldoPorDia(res([linha("DRY BLEND", N(3), 1, 30, 10), linha("GOLDEN 01", N(3), 2, 10, 2)]), DIAS, AT, null, undefined, P);
    expect(db.find((x) => x.data === N(3))!.backlog).toEqual({ mec: 5, ele: 1 });
    const dom = s.find((x) => x.data === N(1))!;
    expect(dom).toMatchObject({ situacao: "Sem atuação", total: 0, backlog: { mec: 0, ele: 0 } });
    expect(s.find((x) => x.data === N(2))!.situacao).toBe("Feriado – Finados");
  });

  it("resumo por mês", () => {
    const dem = [demanda([item("PVC 08", M, N(5), "MEC", 30), item("PVC 08", M, N(5), "ELE", 10)]),
      demanda([item("INJETORA 13", M, N(5), "MEC", 0.1)])];
    const r = res([linha("PVC 08", N(3), 1, 30, 10)], { retirados: [{ mes: M, ativo: "INJETORA 13", hh: { mec: 0.1, ele: 0 }, motivo: "" }] });
    const [x] = resumoPorMes(dem, r, saldoPorDia(r, DIAS, AT, null, undefined, P));
    expect(x.carga).toEqual({ mec: 30, ele: 10 });
    expect(x.programado).toEqual({ mec: 30, ele: 10 });
    expect(x.uso.mec).toBeCloseTo(30 / x.capacidade.mec, 9);
  });

  it("campos por dia", () => {
    const c = camposPorDia(res([linha("PELLET 02", N(3), 1, 4, 0), linha("PVC 08", N(3), 2, 2, 0), linha("GOLDEN 01", N(10), 2, 1, 0)]), DIAS, AT, P);
    expect(c.map((x) => x.data)).toEqual([N(3), N(10)]);
    expect(c[0]).toMatchObject({ dia: "TER", maquinas: 2, t1: ["PELLET 02 · C-201, C-202"], t2: ["PVC 08 · C-PVC 08"], lista: "C-201; C-202; C-PVC 08" });
  });

  it("lista de campos do mês para colar no SAP (sem repetir)", () => {
    const c = camposPorDia(res([linha("PELLET 02", N(3), 1, 4, 0), linha("PVC 08", N(3), 2, 2, 0), linha("PVC 08", N(10), 2, 1, 0)]), DIAS, AT, P);
    expect(listaDeCampos(c)).toBe("C-201; C-202; C-PVC 08");
    expect(listaDeCampos([])).toBe("");
  });

  it("ativos sem HH por mês e ativo", () => {
    const r = res([], { semHh: [
      { mes: "2026-12", ativo: "A", hh: { mec: 1, ele: 0 }, itens: ["x"], primeiraData: D(2026, 12, 1), motivo: "m" },
      { mes: M, ativo: "B", hh: { mec: 1, ele: 2 }, itens: ["y", "z"], primeiraData: N(5), motivo: "m" }] });
    const l = ativosSemHh(r, AT);
    expect(l.map((x) => [x.mes, x.ativo, x.total, x.itens])).toEqual([[M, "B", 3, 2], ["2026-12", "A", 1, 1]]);
  });
});
