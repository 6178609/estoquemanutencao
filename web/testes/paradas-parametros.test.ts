import { describe, expect, it } from "vitest";

import { capTurno, feriadosPadrao, PARAMETROS_PADRAO, parametrosDe } from "@/lib/paradas/parametros";

describe("parâmetros da programação de paradas", () => {
  it("capacidade do turno = pessoas × horas por pessoa", () => {
    expect(capTurno(PARAMETROS_PADRAO.turnos.t1)).toEqual({ mec: 39, ele: 13 });
    expect(capTurno(PARAMETROS_PADRAO.turnos.t2)).toEqual({ mec: 15, ele: 3 });
    expect(capTurno(PARAMETROS_PADRAO.turnos.sabado)).toEqual({ mec: 39, ele: 13 });
  });

  it("sem cadastro: o padrão, sem avisos", () => {
    const r = parametrosDe(null);
    expect(r.p).toEqual(PARAMETROS_PADRAO);
    expect(r.avisos).toEqual([]);
  });

  it("mescla por chave e por turno", () => {
    const { p, avisos } = parametrosDe({ parametros: { maxAtivosDia: 5, turnos: { t2: { pessoasMec: 4 } } } });
    expect(avisos).toEqual([]);
    expect(p.maxAtivosDia).toBe(5);
    expect(p.turnos.t2.pessoasMec).toBe(4);
    expect(p.turnos.t2.horasPorPessoa).toBe(3);
    expect(p.turnos.t1).toEqual(PARAMETROS_PADRAO.turnos.t1);
  });

  it("valor inválido fica no padrão, com aviso", () => {
    const a = parametrosDe({ parametros: { maxAtivosDia: -1 } });
    expect(a.p.maxAtivosDia).toBe(7);
    expect(a.avisos).toHaveLength(1);
    expect(a.avisos[0]).toContain("maxAtivosDia");
    const b = parametrosDe({ parametros: { classes: [{ padrao: "(", nome: "X", tipo: "X" }] } });
    expect(b.p.classes).toEqual(PARAMETROS_PADRAO.classes);
    expect(b.avisos).toHaveLength(1);
    const c = parametrosDe({ parametros: { feriados: [{ data: "2026-02-31", nome: "x" }] } });
    expect(c.p.feriados).toEqual(PARAMETROS_PADRAO.feriados);
    expect(c.avisos).toHaveLength(1);
    const d = parametrosDe({ parametros: { turnos: { t1: { pessoasMec: 2.5 } }, inicio: "ontem" } });
    expect(d.p.turnos.t1).toEqual(PARAMETROS_PADRAO.turnos.t1);
    expect(d.p.inicio).toBeNull();
    expect(d.avisos).toHaveLength(2);
  });

  it("feriados nacionais do ano e do seguinte", () => {
    const f = feriadosPadrao(2030);
    expect(f).toHaveLength(18);
    expect(f[0]).toEqual({ data: "2030-01-01", nome: "Confraternização Universal" });
    expect(f.some((x) => x.data === "2031-11-20")).toBe(true);
  });

  it("sinônimos de tipo", () => {
    expect(PARAMETROS_PADRAO.sinonimosTipo.INJ).toBe("INJETORA");
    expect(parametrosDe({ parametros: { sinonimosTipo: { PRS: "PRENSA" } } }).p.sinonimosTipo).toEqual({ PRS: "PRENSA" });
    const r = parametrosDe({ parametros: { sinonimosTipo: { PRS: 3 } } });
    expect(r.p.sinonimosTipo).toEqual(PARAMETROS_PADRAO.sinonimosTipo);
    expect(r.avisos).toHaveLength(1);
  });

  it("padrão semanal dos críticos", () => {
    expect(PARAMETROS_PADRAO.padraoSemanal[3]).toEqual(["PRENSA/MOINHO SF"]);
    expect(PARAMETROS_PADRAO.padraoSemanal[1]).toEqual(["DRY BLEND", "BANBURY"]);
    expect(PARAMETROS_PADRAO.feriados.some((f) => f.data === "2026-11-20")).toBe(true);
    expect(PARAMETROS_PADRAO.feriados.some((f) => f.data === "2027-12-25")).toBe(true);
  });
});
