import { describe, expect, it } from "vitest";

import { fabricanteRef, linhasTecnicas, montarAlmox, prepararCatalogo, prepararMb52, usoDosMateriais } from "@/lib/dados/materiais";

// os mesmos dados fictícios de tests/test_materiais.py
const CRU = [
  ["10000001", "111", "", "", "84821010", "UN", "COMPONENTES", "ROLAMENTOS", "ROLAMENTO", "ROLAMENTO 6205",
    "ROLAMENTO RIGIDO DE ESFERAS; DIAMETRO INTERNO: 25 MM; APLICACAO: *****; FAB: SKF - REF: 6205-2Z.", "APROVADO"],
  ["10000002", "222", "", "", "", "PC", "(SEM CATEGORIA)", "(SEM SUBCATEGORIA)", "PARAFUSO", "PARAFUSO M8", "PARAFUSO; ROSCA: M8", "CANCELADO"],
  ["10000003", "222", "", "", "", "PC", "FIXACAO", "PARAFUSOS", "PARAFUSO", "PARAFUSO M8", "PARAFUSO SEXTAVADO; ROSCA: M8; COMPRIMENTO: 30 MM; FAB: CISER - REF: 123.", "APROVADO"],
  ["10000004", "", "", "", "", "UN", "ELETRICA", "CABOS", "CABO", "CABO", "CABO", "BLOQUEADO"],
  ["10000005", "444", "", "", "", "M", "ELETRICA", "CABOS", "CABO", "CABO 2,5", "CABO FLEXIVEL; SECAO: 2,5 MM2; FAB: ACME - REF: *****; FAB: BETA - REF: X1.", "BLOQUEADO"],
  ["10000006", "555", "10000001", "111", "", "UN", "COMPONENTES", "ROLAMENTOS", "ROLAMENTO", "ROLAMENTO 6205 DUP", "ROLAMENTO", "DUPLICADO"],
].map((l) => Object.fromEntries(["Codigo Sysmat", "CodigoAlpargatas", "Codigo SysmatPara", "CodigoAlpargatasPara", "NCM",
  "UN Basica", "Categoria", "SubCategoria", "PDM", "Descr Curta", "Descr Completa", "Status"].map((c, i) => [c, l[i]])));

describe("catálogo do Sysmat", () => {
  const cat = prepararCatalogo(CRU);
  const por = Object.fromEntries(cat.map((c) => [c.sysmat, c]));
  it("um por código, a linha aprovada vence", () => {
    expect(cat).toHaveLength(5);
    expect(por["10000003"].material).toBe("222");
    expect(por["10000002"]).toBeUndefined();
    expect(por["10000004"].categoria).toBe("ELETRICA");
    expect(por["10000006"].substituto).toBe("111");
  });
  it("fabricante e referência", () => {
    expect(por["10000001"].fabricanteRef).toBe("SKF 6205-2Z");
    expect(fabricanteRef(CRU[4]["Descr Completa"] as string)).toBe("ACME | BETA X1");
  });
  it("Descr Completa um atributo por linha", () => {
    expect(linhasTecnicas(CRU[0]["Descr Completa"] as string)).toEqual(
      ["ROLAMENTO RIGIDO DE ESFERAS", "DIAMETRO INTERNO: 25 MM", "FAB: SKF - REF: 6205-2Z"]);
  });
});

describe("almoxarifado", () => {
  const mb52 = prepararMb52([
    { Material: "111", "Texto breve material": "ROL", Depósito: "MA01", "Unidade medida básica": "UN", "Utilização livre": "2" },
    { Material: "111", "Texto breve material": "ROL", Depósito: "MA02", "Unidade medida básica": "UN", "Utilização livre": "1,5" },
    { Material: "0222", "Texto breve material": "PAR", Depósito: "MA01", "Unidade medida básica": "PC", "Utilização livre": "0" },
    { Material: "444", "Texto breve material": "CABO", Depósito: "MA01", "Unidade medida básica": "M", "Utilização livre": "5" },
    { Material: "999", "Texto breve material": "X", Depósito: "", "Unidade medida básica": "UN", "Utilização livre": "1" },
    { Material: "", "Texto breve material": "linha vazia", Depósito: "", "Unidade medida básica": "", "Utilização livre": "" },
  ]);
  it("soma por material e junta os depósitos", () => {
    expect(mb52.resumo).toHaveLength(4);
    const r = mb52.resumo.find((x) => x.material === "111")!;
    expect(r.estoque).toBe(3.5);
    expect(r.depositos).toBe("MA01, MA02");
  });
  it("cruza com o catálogo (zeros à esquerda), mínimo e uso em equipamento", () => {
    const uso = usoDosMateriais({ "PRENSA-1": { criticidade: "Alta", materiais: ["111", "111"] } });
    const a = Object.fromEntries(montarAlmox(mb52.resumo, prepararCatalogo(CRU), { "444": { minimo: 10 } }, uso)
      .map((x) => [x.material, x]));
    expect(a["111"].cadastro).toBe("Ativo");
    expect(a["111"].descrCompleta.startsWith("ROLAMENTO RIGIDO")).toBe(true);
    expect(a["111"].usadoEm).toBe("PRENSA-1 (Alta)");
    expect(a["0222"].cadastro).toBe("Ativo");
    expect(a["0222"].situacao).toBe("Zerado");
    expect(a["444"].cadastro).toBe("Bloqueado");
    expect(a["444"].situacao).toBe("Abaixo do mínimo");
    expect(a["999"].cadastro).toBe("Não encontrado no Sysmat");
    expect(montarAlmox(mb52.resumo, null, {}).every((x) => x.cadastro === "Sem catálogo")).toBe(true);
  });
});
