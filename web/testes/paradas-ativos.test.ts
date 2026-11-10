import { describe, expect, it } from "vitest";

import { classificar, demandas, montarAtivos } from "@/lib/paradas/ativos";
import { PARAMETROS_PADRAO } from "@/lib/paradas/parametros";
import type { ItemPlano } from "@/lib/paradas/tipos";
import type { Equipamento } from "@/lib/wcm/preparo";

import { eq, item, N } from "./paradas-fixtures";

const P = PARAMETROS_PADRAO;
const sem = (codigo: string): ItemPlano => item("", "2026-11", N(5), "MEC", 1, { equipamento: codigo, campo: "", ativo: "" });

describe("classes de ativo", () => {
  it("nome, tipo e grupo pela denominação", () => {
    expect(classificar("INJETORA EXP 21 (10 EST) TESTE", P)).toMatchObject({ id: "INJETORA 21", tipo: "INJETORA", grupo: "INJ EXP", so1Turno: true });
    expect(classificar("INJETORA PVC (GOLDEN EAGLE) 008", P)).toMatchObject({ id: "PVC 08", tipo: "PVC", grupo: null });
    expect(classificar("INJETORA 04 UGB1 GOLDEN EAGLE", P).id).toBe("GOLDEN 04");
    expect(classificar("PAN STONE 3 - TESTE", P)).toMatchObject({ id: "PANSTONE 03", preferenciaT1: true });
    expect(classificar("PRENSA A VÁCUO 001", P)).toMatchObject({ id: "PRENSA A VÁCUO", papel: "prensa", grupo: "PRENSA/MOINHO SF" });
    expect(classificar("MOINHO LAMINADOR SF 05 TESTE", P)).toMatchObject({ id: "MOINHO 05", grupo: "PRENSA/MOINHO SF", papel: "moinho" });
    expect(classificar("MOINHO LAMINADOR SF 04 TESTE", P)).toMatchObject({ id: "MOINHO 04", grupo: null, papel: "moinho" });
    expect(classificar("CALANDRA DE BORRACHA 001", P).soSabado).toBe(true);
    expect(classificar("DRY BLEND 01 TESTE", P)).toMatchObject({ exclusivoT1: true, grupo: "DRY BLEND" });
    const x = classificar("MAQUINA XYZ DE TESTE MUITO LONGA COM NOME GRANDE", P);
    expect(x.id).toHaveLength(30);
    expect(x).toMatchObject({ tipo: "MAQUINA", grupo: null, so1Turno: false });
  });
});

describe("montar ativos", () => {
  it("equipamentos com o mesmo campo = um ativo (máquina-mãe)", () => {
    const eqs = new Map<string, Equipamento>([["EQ-1", eq("EQ-1", "GAL1", "C-100", "DRY BLEND 01 TESTE")],
      ["EQ-2", eq("EQ-2", "GAL1", "C-100", "EXTRUSORA DBL 001")]]);
    const r = montarAtivos([sem("EQ-2"), sem("EQ-1")], eqs, () => "", P);
    expect(Object.keys(r.ativos)).toEqual(["DRY BLEND"]);
    expect(r.ativos["DRY BLEND"]).toMatchObject({ equipamentos: ["EQ-1", "EQ-2"], campos: ["C-100"], exclusivoT1: true });
    expect(r.itens.map((i) => [i.campo, i.ativo])).toEqual([["C-100", "DRY BLEND"], ["C-100", "DRY BLEND"]]);
  });

  it("agrupamento por parâmetro (linhas de Pellet) sobrepõe o campo", () => {
    const eqs = new Map<string, Equipamento>([["EQ-1", eq("EQ-1", "GAL1", "C-201", "EXTRUSORA DE GRAOS 002 (PELLET 02)")],
      ["EQ-2", eq("EQ-2", "GAL1", "C-202", "KNEADER 75 L (PELLET 02)")]]);
    const r = montarAtivos([sem("EQ-1"), sem("EQ-2")], eqs, () => "", P);
    expect(Object.keys(r.ativos)).toEqual(["PELLET 02"]);
    expect(r.ativos["PELLET 02"]).toMatchObject({ campos: ["C-201", "C-202"], grupo: "PELLET" });
  });

  it("campo: do equipamento, do superior, o geral ou o próprio código", () => {
    const eqs = new Map<string, Equipamento>([["EQ-1", eq("EQ-1", "GAL1", "", "COMPONENTE A", "EQ-9")],
      ["EQ-9", eq("EQ-9", "GAL1", "C-900", "MICRONIZADOR 01 TESTE")], ["EQ-2", eq("EQ-2", "GAL1", "", "COMPONENTE B")]]);
    const r = montarAtivos([sem("EQ-1"), sem("EQ-2"), sem("EQ-3")], eqs, (e) => (e === "EQ-2" ? "C-500" : ""), P);
    expect(r.itens.map((i) => i.campo)).toEqual(["C-900", "C-500", "EQ-3"]);
  });

  it("junto com o Banbury e nome repetido", () => {
    const eqs = new Map<string, Equipamento>([["EQ-1", eq("EQ-1", "GAL1", "C-1", "MOINHO LAMINADOR SF 04 TESTE")],
      ["EQ-2", eq("EQ-2", "GAL1", "C-2", "MICRONIZADOR 03 A")], ["EQ-3", eq("EQ-3", "GAL1", "C-3", "MICRONIZADOR 03 B")]]);
    const r = montarAtivos([sem("EQ-1"), sem("EQ-2"), sem("EQ-3")], eqs, () => "", P);
    expect(r.ativos["MOINHO 04"].juntoCom).toBe("BANBURY");
    expect(Object.keys(r.ativos).sort()).toEqual(["MICRONIZADOR 03", "MICRONIZADOR 03 (2)", "MOINHO 04"]);
    expect(r.avisos).toHaveLength(1);
  });
});

describe("demanda do mês", () => {
  it("soma por ativo e mês", () => {
    const its = [item("X", "2026-11", N(12), "MEC", 2), item("X", "2026-11", N(5), "MEC", 1), item("X", "2026-11", N(5), "ELE", 0.5),
      item("Y", "2026-12", N(30) + 5, "MEC", 1)];
    const d = demandas(its);
    expect(d.map((x) => [x.mes, x.ativo])).toEqual([["2026-11", "X"], ["2026-12", "Y"]]);
    expect(d[0]).toMatchObject({ hh: { mec: 3, ele: 0.5 }, primeiraData: N(5), datas: [N(5), N(12)] });
    expect(d[0].itens[2].dataIp19).toBe(N(12));
  });
});
