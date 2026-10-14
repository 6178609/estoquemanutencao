import { describe, expect, it } from "vitest";

import * as M from "@/app/(app)/mro/logica";
import type { ItemCatalogo, ItemEstoque } from "@/lib/dados/materiais";

/** Gestão de MRO (dados fictícios). */
const e = (material: string, descricao: string, estoque: number): ItemEstoque => ({ material, descricao, um: "PC", estoque, valor: estoque * 10, depositos: "D1" });
const k = (material: string, sysmat: string, x: Partial<ItemCatalogo> = {}): ItemCatalogo => ({
  material, sysmat, substituto: "", ncm: "", um: "PC", categoria: "ROLAMENTOS", subcategoria: "", pdm: "", descricaoCurta: `ITEM ${material}`,
  descrCompleta: "TIPO: TESTE; FAB: MARCA X - REF: AB-1.", fabricanteRef: "MARCA X AB-1", status: "APROVADO", ...x,
});
const bm = M.indexarMateriais([e("100", "ROLAMENTO TESTE", 5), e("200", "CORREIA TESTE", 0), e("300", "SELO TESTE", 2)],
  [k("0100", "S-1"), k("500", "S-5"), k("600", "S-6", { status: "BLOQUEADO" })]);
const cadMat = { "300": { minimo: 4 } };
const sit = (m: string) => M.pecaMro(m, bm, cadMat);
const inv = [
  { codigo: "EQ-C", equipamento: "ESTEIRA", criticidade: "Baixa", area: "A1", localInstalacao: "L1", situacao: "Em operação" },
  { codigo: "EQ-A", equipamento: "PRENSA", criticidade: "Alta", area: "A1", localInstalacao: "L2", situacao: "Em operação" },
  { codigo: "EQ-B", equipamento: "BOMBA", criticidade: "Alta", area: "A2", localInstalacao: "L3", situacao: "Em operação" },
  { codigo: "EQ-D", equipamento: "VELHA", criticidade: "Alta", area: "A2", localInstalacao: "", situacao: "Desativado" },
];
const vinc: Record<string, string[]> = { "EQ-A": ["100", "200", "200"], "EQ-B": ["100"], "EQ-C": ["300", "999"], "EQ-D": ["200"] };
const t = M.linhasPorAtivo(inv, (k) => vinc[k] ?? [], sit, (k) => (k === "EQ-A" ? "PR-01" : ""));

describe("linhasPorAtivo", () => {
  it("situação das peças, sem repetir, Alta e em falta primeiro", () => {
    expect(t.map((x) => x.codigo)).toEqual(["EQ-A", "EQ-D", "EQ-B", "EQ-C"]);
    const a = t.find((x) => x.codigo === "EQ-A")!;
    expect(a.pecas.map((p) => p.codigo)).toEqual(["100", "200"]);
    expect([a.emFalta, a.zeradas, a.mro]).toEqual([1, 1, M.COM_FALTA]);
    expect(t.find((x) => x.codigo === "EQ-B")!.mro).toBe(M.EM_DIA);
    const c = t.find((x) => x.codigo === "EQ-C")!;
    expect(c.pecas.map((p) => p.status)).toEqual(["baixo", "ausente"]);
    expect(t.find((x) => x.codigo === "EQ-D")!.desativado).toBe(true);
  });
  it("ativo sem peça", () => {
    const s = M.linhasPorAtivo([inv[0]], () => [], sit);
    expect(s[0].mro).toBe(M.SEM_PECAS);
  });
});

describe("peça com MB52 + Sysmat", () => {
  it("completa com o catálogo pelo código sem zeros à esquerda", () => {
    const p = sit("100");
    expect(p).toMatchObject({ status: "ok", um: "PC", valor: 50, depositos: "D1", sysmat: "S-1", fabricanteRef: "MARCA X AB-1", cadastro: "Ativo", noMb52: true });
    expect(sit("200")).toMatchObject({ status: "zerado", cadastro: "Não encontrado no Sysmat" });
  });
  it("só no Sysmat = zerado; fora das duas = não encontrado", () => {
    expect(sit("500")).toMatchObject({ status: "zerado", estoque: 0, descricao: "ITEM 500", noMb52: false, noSysmat: true });
    expect(sit("999")).toMatchObject({ status: "ausente", noSysmat: false });
    expect(M.pecaMro("500", M.indexarMateriais(null, [k("500", "S-5")]), {})).toMatchObject({ status: "ausente", texto: "cadastrado no Sysmat · sem a base MB52" });
  });
  it("busca na MB52 e no catálogo (sem os bloqueados), por Sysmat e fabricante", () => {
    expect(M.procurar(bm, {}, "").itens.map((x) => x.codigo)).toEqual(["100", "200", "300", "500"]);
    // código do Sysmat com zeros à esquerda vincula sem os zeros; o MB52 com zeros é achado pelo código sem eles
    expect(M.procurar(M.indexarMateriais([], [k("000700", "S-7")]), {}, "s-7").itens.map((x) => x.codigo)).toEqual(["700"]);
    expect(M.pecaMro("42", M.indexarMateriais([e("00042", "PINO", 3)], null), {})).toMatchObject({ status: "ok", estoque: 3 });
    expect(M.procurar(bm, {}, "s-5").itens.map((x) => x.codigo)).toEqual(["500"]);
    expect(M.procurar(bm, {}, "marca x").total).toBe(2);
  });
});

describe("campo de ordenação no lugar do equipamento", () => {
  it("o campo mais usado nas ordens do equipamento", () => {
    const campos = new Map([["1", "pr-01"], ["2", "PR-01"], ["3", "PR-02"], ["4", "B"], ["5", "A"]]);
    const m = M.camposPorEquipamento([{ ordem: "1", equipChave: "EQ-A" }, { ordem: "2", equipChave: "EQ-A" }, { ordem: "3", equipChave: "EQ-A" },
      { ordem: "4", equipChave: "EQ-B" }, { ordem: "5", equipChave: "EQ-B" }, { ordem: "9", equipChave: "EQ-C" }], campos);
    expect([...m]).toEqual([["EQ-A", "PR-01"], ["EQ-B", "A"]]);
  });
  it("aparece na linha, na busca, no onde é usado e na planilha", () => {
    const a = t.find((x) => x.codigo === "EQ-A")!;
    expect([a.campo, M.rotuloAtivo(a), M.rotuloAtivo(t.find((x) => x.codigo === "EQ-B")!)]).toEqual(["PR-01", "PR-01", "EQ-B"]);
    expect(M.filtrarAtivos(t, M.lerFiltroAtivos({ q: "pr-01" })).map((x) => x.codigo)).toEqual(["EQ-A"]);
    expect(M.linhasPorMaterial(t).find((x) => x.codigo === "100")!.ativos.map(M.rotuloAtivo)).toEqual(["PR-01", "EQ-B"]);
    expect(M.csvAtivos([a]).split("\r\n")[1].startsWith("PR-01;EQ-A;")).toBe(true);
  });
});

describe("filtros", () => {
  it("esconde desativados, filtra por criticidade, situação MRO e busca no material", () => {
    expect(M.filtrarAtivos(t, M.lerFiltroAtivos({})).map((x) => x.codigo)).toEqual(["EQ-A", "EQ-B", "EQ-C"]);
    expect(M.filtrarAtivos(t, M.lerFiltroAtivos({ desat: "1", crit: "Alta" })).length).toBe(3);
    expect(M.filtrarAtivos(t, M.lerFiltroAtivos({ smro: M.COM_FALTA })).map((x) => x.codigo)).toEqual(["EQ-A", "EQ-C"]);
    expect(M.filtrarAtivos(t, M.lerFiltroAtivos({ q: "correia" })).map((x) => x.codigo)).toEqual(["EQ-A"]);
  });
});

describe("linhasPorMaterial e resumo", () => {
  it("onde é usado (sem os desativados), em falta e Alta primeiro", () => {
    const m = M.linhasPorMaterial(t);
    expect(m.map((x) => x.codigo)).toEqual(["200", "999", "300", "100"]);
    expect(m.find((x) => x.codigo === "100")!.ativos.map((a) => a.codigo)).toEqual(["EQ-A", "EQ-B"]);
    expect(m.find((x) => x.codigo === "200")!.nAlta).toBe(1);
    expect(M.filtrarMateriais(m, M.lerFiltroMateriais({ mfalta: "1", malta: "1" })).map((x) => x.codigo)).toEqual(["200"]);
  });
  it("cobertura e peças críticas", () => {
    const r = M.resumo(t);
    expect(r).toMatchObject({ ativos: 3, comPecas: 3, alta: 2, altaComPecas: 2, materiais: 4, materiaisEmFalta: 3, criticosEmFalta: 1, ativosComFalta: 2 });
    expect(r.coberturaAlta).toBe(100);
  });
});

describe("gravação do vínculo", () => {
  it("lista final: soma, tira, sem repetir e só códigos válidos", () => {
    expect(M.novaLista(["1", "2"], ["3", "2"], ["1"])).toEqual(["2", "3"]);
    expect(M.limparCodigos(["10", " 10 ", "a b", "", null, "X-1.2"])).toEqual(["10", "X-1.2"]);
  });
  it("fora do cadastro: cria o item só com as peças (nome e criticidade seguem do SAP)", () => {
    expect(M.aplicarPecas(undefined, ["1"], [])).toEqual({ materiais: ["1"], [M.MARCA_MRO]: true });
    expect(M.aplicarPecas(undefined, [], ["1"])).toBeUndefined();
  });
  it("cadastro existente: muda só as peças; o criado pelo MRO sai quando fica vazio", () => {
    expect(M.aplicarPecas({ nome: "X", criticidade: "Alta", materiais: ["1"] }, ["2"], [])).toEqual({ nome: "X", criticidade: "Alta", materiais: ["1", "2"] });
    expect(M.aplicarPecas({ nome: "X", criticidade: "Alta", materiais: ["1"] }, [], ["1"])).toEqual({ nome: "X", criticidade: "Alta" });
    expect(M.aplicarPecas({ materiais: ["1"], [M.MARCA_MRO]: true, atualizado_em: "x" }, [], ["1"])).toBeNull();
    // alguém completou o cadastro pela aba Equipamentos: não apaga
    expect(M.aplicarPecas({ materiais: ["1"], [M.MARCA_MRO]: true, criticidade: "Alta" }, [], ["1"])).toEqual({ [M.MARCA_MRO]: true, criticidade: "Alta" });
  });
  it("planilha ativo × peça", () => {
    const s = M.csvAtivos(t.slice(0, 1));
    expect(s.split("\r\n")).toHaveLength(3);
    expect(s).toContain("Zerado");
  });
});
