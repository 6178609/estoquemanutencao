import { describe, expect, it } from "vitest";

import { atividadesDoMaterial, atividadesPorPeriodicidade, codigoSap, materiaisPorCodigo, modeloDoEquipamento, normalizarFicha } from "@/lib/wcm/fichaTecnica";

/** Só dados fictícios. */
const ficha = () => normalizarFicha({
  ativo: { id_ativo: "X1", nome: "Máquina de teste" },
  materiais: [
    { id: "M1", descricao: "Peça com código", codigo_sap: "0001234", qtd_na_maquina: 2, situacao_vinculo: "Vinculado" },
    { id: "M2", descricao: "Peça sem código", codigo_sap: null, qtd_planilha: 4, retirar_do_plano: true, motivo_retirada: "não existe na máquina" },
  ],
  atividades: [
    { id: "A1", tipo: "Mandatória", sistema: "S", periodicidade: "1 Ano", periodicidade_dias: 365, descricao: "d", lista_tarefas: "100", contador: "2", operacao: "0010", material_ids: ["M1"] },
    { id: "A2", tipo: "PREVENTIVA", sistema: "S", periodicidade: "Diária", periodicidade_dias: 1, descricao: "d", material_ids: [] },
    { id: "A3", tipo: "Mandatória", sistema: "S", periodicidade: "5000 Horas", periodicidade_horas: 5000, descricao: "d", material_ids: [] },
    { id: "A4", tipo: "Condicional", sistema: "S", periodicidade: "Quando necessário", descricao: "d", material_ids: ["M1"] },
  ],
  alertas_qualidade: ["texto solto"],
  pontos_a_validar: [{ item: "Peça", ponto: "Sem código", prioridade: "Alta", acao_sugerida: "Cadastrar" }],
});

describe("ficha técnica do modelo", () => {
  it("vale nas máquinas de cada modelo; PVC, inativas e robô ficam de fora", () => {
    expect(modeloDoEquipamento("INJETORA 02 UGB1 GOLDEN EAGLE")).toBe("GEL180S");
    expect(modeloDoEquipamento("BANBURY SF 01 UGB1 BONFANTI")).toBe("BMI-80T");
    expect(modeloDoEquipamento("INJETORA EXP 09 (10 EST) UGB2 KING STEEL")).toBe("EXP09");
    expect(modeloDoEquipamento("PRENSA COPE 01 - PHB 450")).toBe("PHB-450");
    expect(modeloDoEquipamento("PAN STONE 05 - JOB-AN34/2")).toBe("S-950-A-PCD");
    expect(modeloDoEquipamento("INJETORA 02 UGB1 GOLDEN EAGLE", true)).toBeNull();
    expect(modeloDoEquipamento("INJETORA PVC (GOLDEN EAGLE) 006")).toBeNull();
    expect(modeloDoEquipamento("PRENSA PANSTONE 01 - JOB-AD82")).toBeNull();
  });
  it("normaliza os dois formatos: quantidade, pontos a validar e retirada do plano", () => {
    const f = ficha();
    expect(f.materiais.map((m) => m.qtd)).toEqual([2, 4]);
    expect(f.materiais[1]).toMatchObject({ retirar_do_plano: true, motivo_retirada: "não existe na máquina" });
    expect(f.pontos.map((p) => p.ponto)).toEqual(["texto solto", "Sem código"]);
    expect(f.pontos[1]).toMatchObject({ prioridade: "Alta", acao: "Cadastrar" });
  });
  it("atividades previstas por periodicidade, da mais curta (dias ou horas) para a mais longa; condicionais ficam de fora", () => {
    expect(atividadesPorPeriodicidade(ficha()).map((g) => g.periodicidade)).toEqual(["Diária", "5000 Horas", "1 Ano"]);
  });
  it("materiais com e sem código SAP (zeros à esquerda saem)", () => {
    const { comCodigo, semCodigo } = materiaisPorCodigo(ficha());
    expect(comCodigo.map((m) => codigoSap(m))).toEqual(["1234"]);
    expect(semCodigo.map((m) => m.id)).toEqual(["M2"]);
  });
  it("índice inverso material → atividades", () => {
    expect(atividadesDoMaterial(ficha()).get("M1")?.map((a) => a.id)).toEqual(["A1", "A4"]);
  });
});
