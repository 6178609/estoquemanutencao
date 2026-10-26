import { describe, expect, it } from "vitest";

import { comPecasDaRegra, vinculosDasRegras } from "@/lib/dados/regrasVinculo";

/** Só dados fictícios. */
const eq = (equipamento: string, denominacao: string, inativo = false) => ({ equipamento, denominacao, inativo, desativado: inativo });
const mat = (material: string, descr: string, status = "APROVADO") => ({ material, descricaoCurta: descr, descrCompleta: "", status });

describe("regra: injetoras KCLKA da EXP 12 em diante recebem os materiais EK3", () => {
  const equips = [eq("1", "INJETORA EXP 11 (10 EST) UGB2 KING STEEL"), eq("2", "INJETORA EXP 12 (6 EST) UGB2 KCLKA"),
    eq("3", "INJETORA EXP 30 (10 EST) UGB2 KCLKA"), eq("4", "INJETORA EXP 21 (10 EST) UGB2 KCLKA", true),
    eq("5", "INJ EXP 15 UGB2 KCLKA - SIST EST 01"), eq("6", "INJETORA EXP 09 (10 EST) UGB2 KCLKA")];
  const cat = [mat("100", "AGULHA EK3-6E2 KCLKA"), mat("101", "BICO; MODELO: EK3-10E2"), mat("102", "BICO EK3", "BLOQUEADO"),
    mat("103", "BICO EK30 OUTRO"), mat(" ", "SEM CODIGO EK3")];
  const v = vinculosDasRegras(equips, cat);

  it("só as injetoras principais KCLKA ativas com número 12 ou mais", () => {
    expect([...v.keys()]).toEqual(["2", "3"]);
  });
  it("só os materiais EK3 aprovados e com código", () => {
    expect(v.get("2")).toEqual({ nome: "INJETORA EXP 12 (6 EST) UGB2 KCLKA", materiais: ["100", "101"] });
  });
  it("só acrescenta o que falta e cria o cadastro mínimo", () => {
    expect(comPecasDaRegra({ nome: "X", materiais: ["100", "999"] }, "X", ["100", "101"])).toEqual({ nome: "X", materiais: ["100", "101", "999"] });
    expect(comPecasDaRegra({ nome: "X", materiais: ["100", "101"] }, "X", ["100", "101"])).toBeNull();
    expect(comPecasDaRegra(undefined, "INJ", ["100"])).toMatchObject({ nome: "INJ", materiais: ["100"], situacao: "Em operação" });
  });
});

describe("regra: injetoras Golden Eagle 01 a 12 recebem os materiais do modelo 180S", () => {
  const m = (material: string, modelo: string, status = "APROVADO") => ({ material, descricaoCurta: "PECA", descrCompleta: `PECA; MODELO: ${modelo}; FAB: GOLDEN EAGLE - REF: 1`, status });
  const equips = [eq("1", "INJETORA 01 UGB1 GOLDEN EAGLE"), eq("2", "INJETORA 12 UGB1 GOLDEN EAGLE"), eq("3", "INJETORA 13 UGB1 GOLDEN EAGLE"),
    eq("4", "INJETORA 08 UGB1 GOLDEN EAGLE", true), eq("5", "INJETORA PVC (GOLDEN EAGLE) 006"), eq("6", "INJ PVC 02 GOLDEN - SISTEMA DE INJECAO")];
  const cat = [m("10", "GEL 180/S"), m("11", "GEL180S"), m("12", "GEK 180/S"), m("13", "GEL/GEK/180/S"), m("14", "GEL 180"), m("15", "GEL/180L"),
    m("16", "GEK 180/700/S"), m("17", "GEL 180/S", "BLOQUEADO"), m("18", "GOLDEN EAGLE 180S")];
  const v = vinculosDasRegras(equips, cat);
  it("só as injetoras 01 a 12 UGB1 ativas", () => expect([...v.keys()]).toEqual(["1", "2"]));
  it("só a família 180S aprovada", () => expect(v.get("1")!.materiais).toEqual(["10", "11", "12", "13", "18"]));
});

describe("regra: injetoras PVC (Golden Eagle) recebem os materiais GEK 220 / GEKK", () => {
  const m = (material: string, modelo: string, status = "APROVADO", curta = "PECA") => ({ material, descricaoCurta: curta, descrCompleta: `PECA; MODELO: ${modelo}; FAB: GOLDEN EAGLE`, status });
  const equips = [eq("1", "INJETORA PVC (GOLDEN EAGLE) 006"), eq("2", "INJETORA PVC (GOLDEN EAGLE) 021"), eq("3", "INJETORA PVC (GOLDEN EAGLE) 05 - INATIVO", true),
    eq("4", "INJ PVC 02 GOLDEN - SISTEMA DE INJECAO"), eq("5", "INJETORA 01 UGB1 GOLDEN EAGLE")];
  const cat = [m("20", "GEK 220W/S"), m("21", "GEK220"), m("22", "GEK 220/S"), m("23", "GEK 2200"), m("24", "GEK 180/S"), m("25", "X", "APROVADO", "BICO GEKK"),
    m("26", "GEK 220W/S", "BLOQUEADO")];
  const v = vinculosDasRegras(equips, cat);
  it("só as injetoras PVC ativas", () => expect([...v.keys()].sort()).toEqual(["1", "2", "5"]));
  it("só GEK 220 / GEKK aprovados", () => expect(v.get("1")!.materiais).toEqual(["20", "21", "22", "25"]));
  it("a Golden 01 UGB1 continua só com o 180S", () => expect(v.get("5")!.materiais).toEqual(["24"]));
});
