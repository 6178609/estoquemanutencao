import { describe, expect, it } from "vitest";

import { acharColuna, casaBusca, chave, normalizarBusca, paraNumero, texto } from "@/lib/dados/texto";

describe("texto", () => {
  it("normaliza cabeçalhos", () => {
    expect(chave("Denominação do loc.instalação")).toBe("DENOMINACAO DO LOC INSTALACAO");
    expect(chave("CodigoAlpargatas")).toBe("CODIGOALPARGATAS");
    expect(chave(null)).toBe("");
  });
  it("acha colunas na ordem dos padrões, respeitando o excluir", () => {
    const cols = ["Texto breve material", "Material", "Utilização livre", "Valor utiliz.livre"];
    expect(acharColuna(cols, ["^MATERIAL$", "CODIGO", "MATERIAL"], "TEXTO|DESCR|TIPO|GRUPO")).toBe("Material");
    expect(acharColuna(cols, ["UTILIZACAO LIVRE", "ESTOQUE"], "VALOR|MOEDA")).toBe("Utilização livre");
    expect(acharColuna(cols, ["NADA"])).toBeNull();
  });
  it("converte números do SAP", () => {
    expect(paraNumero("1.234,56")).toBe(1234.56);
    expect(paraNumero("1234.56")).toBe(1234.56);
    expect(paraNumero("12,00-")).toBe(-12);
    expect(paraNumero("1.234.567")).toBe(1234567);
    expect(Number.isNaN(paraNumero(""))).toBe(true);
    expect(paraNumero(7)).toBe(7);
  });
  it("texto limpo e busca sem acento", () => {
    expect(texto(1234)).toBe("1234");
    expect(texto("  a ")).toBe("a");
    expect(texto(null)).toBe("");
    const alvo = normalizarBusca("Rolamento rígido de esferas 6205");
    expect(casaBusca(alvo, "rigido 6205")).toBe(true);
    expect(casaBusca(alvo, "rigido 6206")).toBe(false);
  });
});
