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
