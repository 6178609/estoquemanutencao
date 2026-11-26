import { describe, expect, it } from "vitest";

import { podeVerValores } from "@/lib/auth/acesso";
import { mesmaUm, precoDe, precosDosCodigos, prepararCusto, somarValores, valorDe } from "@/lib/dados/custoMaterial";
import { custoDemo, dadosDemo } from "@/lib/dados/demo";
import { avisosDeColunas } from "@/lib/leitura/colunasImportantes";
import { recortarCusto } from "@/lib/leitura/custoMaterial";
import { processar } from "@/lib/leitura/processar";
import { lerParquet } from "@/lib/dados/parquet";
import { DESTINO, identificar, NOMES_BASE } from "@/lib/leitura/tipos";
import { valorPeca } from "@/lib/machineLedger/regras";
import { valorDaReposicao, valorDasRetiradas, valorDoKit, type Armario, type Movimento } from "@/lib/ubm/regras";

// tudo fictício: códigos 99xxx, descrições inventadas
const CAB_EN = ["Plant", "Material", "Material.1", "Material type", "Profit Center", "Base Unit of Measure", "Valuation Class", "SM", "MRP Type",
  "Storage location", "Issue Storage Location", "Exp", "Utiliz.livre", "MRP controller", "Moving Average Price/Periodic Unit Price", "Prç.standard",
  "SM.1", "Nome", "Procurement Type"];
const linhaEn = (mat: string, desc: string, um: string, livre: string, medio: string, std: string) =>
  ["A000", mat, desc, "ZMRO", "PC01", um, "9999", "", "VB", "MA01", "", "", livre, "X01", medio, std, "", "PESSOA FICTICIA", "F"];

describe("custo dos materiais: reconhecimento pelos cabeçalhos", () => {
  it("export do SAP em inglês e em português", () => {
    expect(identificar(CAB_EN)).toBe("custo_material");
    expect(identificar(["Centro", "Material", "Texto breve material", "UMB", "Classe de avaliação", "Preço médio", "Preço standard"])).toBe("custo_material");
    expect(identificar(["Material", "Denominação", "Prç.médio", "Utilização livre"])).toBe("custo_material");
    expect(identificar(["Material", "Texto", "Prç.standard"])).toBe("custo_material");
  });
  it("a MB52 (com ou sem o valor do estoque) continua MB52", () => {
    expect(identificar(["Material", "Texto breve material", "Depósito", "Utilização livre", "Valor utiliz.livre"])).toBe("mb52");
    expect(identificar(["Material", "Texto breve material", "Utilização livre"])).toBe("mb52");
    expect(identificar(["Material", "Texto breve material", "Utilização livre", "Valor utiliz.livre", "Preço médio"])).toBe("mb52");
  });
  it("nome, destino e aviso das colunas", () => {
    expect(NOMES_BASE.custo_material).toBe("Custo dos materiais (preço médio)");
    expect(DESTINO.custo_material).toBe("bases/CUSTO_MATERIAL.parquet");
    expect(avisosDeColunas("custo_material", { colunas: ["Material", "UM", "Preço standard"], linhas: [] })[0]).toMatch(/Preço médio/);
    expect(avisosDeColunas("custo_material", { colunas: ["Material", "UM", "Preço médio"], linhas: [] })).toEqual([]);
  });
});

describe("recorte da lista de custo", () => {
  it("só as colunas do site, com nomes fixos, código sem zeros e números normalizados", () => {
    const t = recortarCusto({ colunas: CAB_EN, linhas: [linhaEn("0000099001", "ROLAMENTO FICTICIO", "PC", "4", "12.5", "11"),
      linhaEn("", "SEM CODIGO", "PC", "1", "1", "1"), linhaEn("99002", "CORREIA FICTICIA", "UN", "0", "0", "8,75")] });
    expect(t.colunas).toEqual(["Material", "Descrição", "UM", "Preço médio", "Preço standard", "Classe de avaliação", "Tipo de material",
      "Depósito", "Utilização livre", "Tipo de MRP", "Tipo de suprimento"]);
    expect(t.colunas).not.toContain("Nome"); // o nome do planejador nunca sai do computador
    expect(t.linhas).toEqual([
      ["99001", "ROLAMENTO FICTICIO", "PC", "12.5", "11", "9999", "ZMRO", "MA01", "4", "VB", "F"],
      ["99002", "CORREIA FICTICIA", "UN", "0", "8.75", "9999", "ZMRO", "MA01", "0", "VB", "F"],
    ]);
  });
  it("processar: CSV do SAP vira a base custo_material em parquet, legível pelo preparo do site", async () => {
    const csv = [CAB_EN.map((c) => (c === "Material.1" ? "Material" : c)), linhaEn("099003", "VALVULA FICTICIA", "PC", "2", "100,5", "90")]
      .map((l) => l.join(";")).join("\n");
    const r = processar("CUSTO_MATERIAL.csv", new TextEncoder().encode(csv));
    expect(r.erro).toBeUndefined();
    expect(r.bases.map((b) => b.tipo)).toEqual(["custo_material"]);
    const linhas = (await Promise.all(r.bases[0].partes.map((p) => lerParquet(p)))).flat();
    const precos = prepararCusto(linhas);
    expect(precos.get("99003")).toEqual({ preco: 100.5, precoMedio: 100.5, precoStandard: 90, um: "PC" });
  });
});

describe("preço do material", () => {
  const precos = prepararCusto([
    { Material: "99001", UM: "PC", "Preço médio": "12.5", "Preço standard": "11" },
    { Material: "99002", UM: "M", "Preço médio": "0", "Preço standard": "8.75" },
    { Material: "99003", UM: "UN", "Preço médio": "", "Preço standard": "0" },
    { Material: "99004", UM: "PC", "Preço médio": "0", "Preço standard": "0" },
    { Material: "99004", UM: "PC", "Preço médio": "3", "Preço standard": "0" }, // outro depósito: vale o 1º preço que existir
  ]);
  it("médio; zerado, o standard; sem os dois, sem preço", () => {
    expect(precoDe(precos, "99001")).toBe(12.5);
    expect(precoDe(precos, "0099002")).toBe(8.75);
    expect(precoDe(precos, "99003")).toBeNull();
    expect(precoDe(precos, "99004")).toBe(3);
    expect(precoDe(precos, "99999")).toBeNull();
    expect(precoDe(null, "99001")).toBeNull();
    expect(precosDosCodigos(precos, ["99001", "99003"])).toEqual({ "99001": 12.5 });
  });
  it("valor = quantidade × preço, só com a mesma UM (PC = UN)", () => {
    expect(valorDe(precos, "99001", 4)).toBe(50);
    expect(valorDe(precos, "99001", 4, "UN")).toBe(50);
    expect(valorDe(precos, "99002", 2, "PC")).toBeNull();
    expect(valorDe(precos, "99003", 2)).toBeNull();
    expect(mesmaUm("PC", "UN") && mesmaUm("", "M") && !mesmaUm("M", "KG")).toBe(true);
    expect(somarValores([10, null, 2.5])).toEqual({ total: 12.5, semPreco: 1 });
  });
  it("UBM: valor do kit, da reposição e das retiradas", () => {
    const a: Armario = { id: "UBM-99", nome: "Fictício", local: "", ativo: true, criadoEm: "", itens: [
      { codigo: "99001", descricao: "", um: "PC", minimo: 2, maximo: 4 }, { codigo: "99002", descricao: "", um: "PC", minimo: 1, maximo: 1 }] };
    expect(valorDoKit(a.itens, precos)).toEqual({ total: 50, semPreco: 1 }); // 99002 é por M no SAP
    expect(valorDaReposicao([{ codigo: "99001", um: "PC", separar: 2 }], precos)).toEqual({ total: 25, semPreco: 0 });
    const m = (id: string, tipo: Movimento["tipo"], qtd: number): Movimento => ({ id, tipo, armario: "UBM-99", em: "2026-11-20T15:00:00.000Z", por: "x",
      porNome: "x", codigo: "99001", quantidade: qtd, ordem: "", turno: "", uso: "", observacao: "", tipoSolicitacao: "", foto: null, fechadaEm: "",
      fechadaPor: "", origem: "validacao" });
    expect(valorDasRetiradas([a], [m("1", "retirada", 2), m("2", "reposicao", 9), m("3", "retirada", 1)], { de: "2026-11-01", ate: "2026-11-30" }, precos))
      .toEqual({ total: 37.5, semPreco: 0 });
  });
  it("Machine Ledger: preço e valor do estoque de segurança", () => {
    expect(valorPeca("99001", 3, precos)).toEqual({ preco: 12.5, valorSeg: 37.5 });
    expect(valorPeca("99001", null, precos)).toEqual({ preco: 12.5, valorSeg: null });
    expect(valorPeca("99003", 3, precos)).toEqual({ preco: null, valorSeg: null });
    expect(valorPeca("", 3, precos)).toEqual({ preco: null, valorSeg: null });
  });
});

describe("quem vê valores", () => {
  it("é a aba Custos pela regra de abas", () => {
    expect(podeVerValores({ login: "l", funcao: "lider" })).toBe(true);
    expect(podeVerValores({ login: "a", funcao: "analista" })).toBe(true);
    expect(podeVerValores({ login: "m", funcao: "manutentor" })).toBe(false);
    expect(podeVerValores({ login: "t", funcao: "terceiro", abas: ["estoque", "ubm"] })).toBe(false);
    expect(podeVerValores({ login: "m", funcao: "manutentor", abas: ["estoque", "custos"] })).toBe(true);
    expect(podeVerValores({ login: "l", funcao: "lider", abas: ["estoque"] })).toBe(false);
    expect(podeVerValores(null)).toBe(false);
  });
});

describe("demonstração", () => {
  it("preços fictícios para os materiais fictícios do catálogo, com alguns sem preço", () => {
    const precos = prepararCusto(custoDemo());
    const mats = dadosDemo().estoque.map((e) => e.material).filter((c) => precos.has(c));
    expect(mats.length).toBeGreaterThan(100);
    const comPreco = mats.filter((c) => precoDe(precos, c) != null).length;
    expect(comPreco).toBeGreaterThan(mats.length * 0.8);
    expect(comPreco).toBeLessThan(mats.length);
  });
});
