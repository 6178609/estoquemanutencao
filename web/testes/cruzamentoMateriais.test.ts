import { describe, expect, it } from "vitest";

import { origemManual, OUTRO_TIPO, situacaoLista, tipoTecnico } from "@/lib/wcm/cruzamentoMateriais";
import type { Atribuicao } from "@/lib/wcm/distribuicaoIa06";

/** Só descrições fictícias. */
describe("tipo técnico do material", () => {
  it("pela descrição curta", () => {
    expect(tipoTecnico("ROLAMENTO RIG ESF 6205-2Z")).toBe("Rolamentos e mancais");
    expect(tipoTecnico("ELEMENTO FILT OLEO X10")).toBe("Filtros");
    expect(tipoTecnico("REPARO CIL HIDR TESTE")).toBe("Vedações");
    expect(tipoTecnico("BICO INJETOR TESTE 01")).toBe("Injeção e plastificação");
    expect(tipoTecnico("CILINDRO PNEUM D32 100MM")).toBe("Pneumática");
    expect(tipoTecnico("VALVULA DIR HIDR 4V 3P")).toBe("Hidráulica");
    expect(tipoTecnico("MANGUEIRA LUBRIF 4MM")).toBe("Lubrificantes e lubrificação");
    expect(tipoTecnico("RESISTENCIA CART 220V 500W")).toBe("Aquecimento");
    expect(tipoTecnico("SENSOR PROX INDUT M12")).toBe("Sensores e instrumentação");
    expect(tipoTecnico("CONTATOR TRIPOLAR 9A")).toBe("Elétrica e acionamento");
    expect(tipoTecnico("PROTECAO PORTA CABOS X")).toBe("Estrutura, guias e proteções");
  });
  it("pela categoria do Sysmat quando a descrição não diz, e o resto em outros", () => {
    expect(tipoTecnico("ITEM XPTO 123", "ROLAMENTOS E MANCAIS")).toBe("Rolamentos e mancais");
    expect(tipoTecnico("ITEM XPTO 123")).toBe(OUTRO_TIPO);
  });
});

describe("origem do vínculo e situação na lista", () => {
  it("manual, modelo do Sysmat ou sem confirmação", () => {
    expect(origemManual(true, "")).toBe("manual");
    expect(origemManual(false, "ANEL; MODELO: XYZ-80; FAB: TESTE")).toBe("modelo");
    expect(origemManual(false, "ANEL; MODELO: *****; FAB: TESTE")).toBe("sem");
    expect(origemManual(false, "ANEL; FAB: TESTE")).toBe("sem");
  });
  const a = (x: Partial<Atribuicao>): Atribuicao => ({ codigo: "1", descricao: "", um: "UN", origem: "E", conferida: false, listas: [], lista: "G|1",
    operacao: "0010", nivel: "alta", motivo: "", ...x });
  it("na lista do SAP, sugerida, sem operações (falta IA03), escolher e sem lista", () => {
    expect(situacaoLista(a({}), () => true, "G|1")).toBe("na-lista");
    expect(situacaoLista(a({}), () => true, null)).toBe("sugerida");
    expect(situacaoLista(a({ nivel: "sem" }), () => false, null)).toBe("sem-operacao");
    expect(situacaoLista(a({ nivel: "sem" }), () => true, null)).toBe("escolher");
    expect(situacaoLista(a({ lista: null, nivel: "sem" }), () => false, null)).toBe("sem-lista");
  });
});
