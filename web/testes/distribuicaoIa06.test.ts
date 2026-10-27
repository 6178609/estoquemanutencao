import { describe, expect, it } from "vitest";

import { distribuirPecas, opcaoLista, pontuar, type OpcaoLista } from "@/lib/wcm/distribuicaoIa06";

/** Ativo fictício: máquina M com os subconjuntos LUB (lubrificação) e ACI (acionamento). */
const L_LUB = opcaoLista({ grupo: "G1", numerador: "1", texto: "PREV LUBRIF", equipamentos: 1 }, "LUB", "M - LUBRIFICACAO", [
  { operacao: "0010", texto: "VERIFICAR NIVEL DE OLEO" }, { operacao: "0020", texto: "SUBSTITUIR FILTRO DE OLEO" },
]);
const L_ACI = opcaoLista({ grupo: "G2", numerador: "1", texto: "PREV ACION", equipamentos: 1 }, "ACI", "M - ACIONAMENTO", [
  { operacao: "0010", texto: "INSPECIONAR CORREIAS", textoLongo: "SE NECESSARIO, TROCAR AS CORREIAS" }, { operacao: "0020", texto: "VERIFICAR ROLAMENTOS DO MOTOR" },
]);
const L_SEM = opcaoLista({ grupo: "G9", numerador: "2", texto: "LISTA SEM TEXTO", equipamentos: 1 }, "ELE", "M - ELETRICO", undefined);
const listas: Record<string, OpcaoLista[]> = { LUB: [L_LUB], ACI: [L_ACI], ELE: [L_SEM] };
const superior: Record<string, string> = { LUB: "M", ACI: "M", ELE: "M" };
const cadeia = (o: string) => { const c = [o]; for (let s = superior[o]; s; s = superior[s]) c.push(s); return c; };
const dist = (pecas: { codigo: string; descricao: string; origem: string }[]) =>
  distribuirPecas(pecas.map((p) => ({ ...p, um: "UN" })), (e) => listas[e] ?? [], cadeia, [L_LUB, L_ACI, L_SEM]);

describe("distribuição automática das peças nas listas e operações (IA06)", () => {
  it("troca do mesmo tipo de peça na lista do próprio subconjunto: confiança alta", () => {
    const [a] = dist([{ codigo: "1", descricao: "ELEMENTO FILT OLEO X", origem: "LUB" }]);
    expect([a.lista, a.operacao, a.nivel]).toEqual(["G1|1", "0020", "alta"]);
    expect(a.motivo).toBe("a operação é de troca de filtro");
  });
  it("a troca no texto longo também vale (correia → operação 0010 do acionamento)", () => {
    const [a] = dist([{ codigo: "2", descricao: "CORREIA V A-40", origem: "ACI" }]);
    expect([a.lista, a.operacao, a.nivel]).toEqual(["G2|1", "0010", "alta"]);
    expect(a.motivo).toBe("a operação é de troca de correia");
  });
  it("mesmo assunto sem troca: confiança média (rolamento → verificar rolamentos)", () => {
    const [a] = dist([{ codigo: "3", descricao: "ROLAMENTO RIG ESF 6205", origem: "ACI" }]);
    expect([a.lista, a.operacao, a.nivel]).toEqual(["G2|1", "0020", "media"]);
  });
  it("peça vinculada na máquina vai para a lista do subconjunto que combina, avisando que é de outro subconjunto", () => {
    const [a] = dist([{ codigo: "4", descricao: "ELEMENTO FILT OLEO Y", origem: "M" }]);
    expect([a.lista, a.operacao]).toEqual(["G1|1", "0020"]);
    expect(a.motivo).toContain("outro subconjunto");
  });
  it("sem operação que combine: fica na lista do subconjunto, sem operação, para escolher", () => {
    const [a] = dist([{ codigo: "5", descricao: "SENSOR INDUTIVO M12", origem: "LUB" }]);
    expect([a.lista, a.operacao, a.nivel]).toEqual(["G1|1", "", "sem"]);
  });
  it("lista sem o texto da IA03: operação 0010 para conferir", () => {
    const [a] = dist([{ codigo: "6", descricao: "CONTATOR TRIPOLAR 9A", origem: "ELE" }]);
    expect([a.lista, a.operacao, a.nivel]).toEqual(["G9|2", "0010", "sem"]);
    expect(a.motivo).toContain("IA03");
  });
  it("pontuação", () => {
    expect(pontuar("SUBSTITUIR RETENTOR DO CILINDRO", { descricao: "RETENTOR VED NBR 40X52" }).pontos).toBe(3);
    expect(pontuar("LUBRIFICAR MANCAIS", { descricao: "GRAXA LITIO EP2" }).pontos).toBe(3);
    expect(pontuar("LIMPAR O PAINEL", { descricao: "ROLAMENTO 6205" }).pontos).toBe(0);
  });
});
