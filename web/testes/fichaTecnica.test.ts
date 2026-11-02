import { describe, expect, it } from "vitest";

import { atividadesDoMaterial, atividadesPorPeriodicidade, codigoSap, materiaisPorCodigo, modeloDoEquipamento, type FichaTecnica } from "@/lib/wcm/fichaTecnica";

/** Só dados fictícios. */
const ficha = (): FichaTecnica => ({
  ativo: { id_ativo: "X1", nome: "Máquina de teste" }, dados_tecnicos: [], alertas_qualidade: [],
  materiais: [
    { id: "M1", descricao: "Peça com código", codigo_sap: "0001234", situacao_almox: "ALMOXARIFADO", origem: "t" },
    { id: "M2", descricao: "Peça sem código", codigo_sap: null, situacao_almox: "FORA_DO_ALMOXARIFADO", origem: "t" },
  ],
  atividades: [
    { id: "A1", tipo: "PREVENTIVA", sistema: "S", periodicidade: "Anual", periodicidade_dias: 365, descricao: "d", referencia: "r", origem: "MANUAL", material_ids: ["M1"] },
    { id: "A2", tipo: "PREVENTIVA", sistema: "S", periodicidade: "Diária", periodicidade_dias: 1, descricao: "d", referencia: "r", origem: "MANUAL", material_ids: [] },
    { id: "A3", tipo: "CONDICIONAL", sistema: "S", periodicidade: "Quando necessário", periodicidade_dias: null, descricao: "d", referencia: "r", origem: "MANUAL", material_ids: ["M1"] },
  ],
});

describe("ficha técnica do modelo", () => {
  it("vale nas injetoras Golden Eagle UGB1 ativas; PVC e inativas ficam de fora", () => {
    expect(modeloDoEquipamento("INJETORA 02 UGB1 GOLDEN EAGLE")).toBe("GEL180S");
    expect(modeloDoEquipamento("INJETORA 02 UGB1 GOLDEN EAGLE", true)).toBeNull();
    expect(modeloDoEquipamento("INJETORA PVC (GOLDEN EAGLE) 006")).toBeNull();
    expect(modeloDoEquipamento("INJ PVC 02 GOLDEN - SISTEMA HIDRAULICO")).toBeNull();
  });
  it("atividades preventivas por periodicidade, da mais curta para a mais longa", () => {
    expect(atividadesPorPeriodicidade(ficha()).map((g) => g.periodicidade)).toEqual(["Diária", "Anual"]);
  });
  it("materiais com e sem código SAP (zeros à esquerda saem)", () => {
    const { comCodigo, semCodigo } = materiaisPorCodigo(ficha());
    expect(comCodigo.map((m) => codigoSap(m))).toEqual(["1234"]);
    expect(semCodigo.map((m) => m.id)).toEqual(["M2"]);
  });
  it("índice inverso material → atividades", () => {
    expect(atividadesDoMaterial(ficha()).get("M1")?.map((a) => a.id)).toEqual(["A1", "A3"]);
  });
});
