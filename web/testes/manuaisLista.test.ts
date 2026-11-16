import { describe, expect, it } from "vitest";

import { buscarEquipamentos, equipamentosSemManual, filtrarManuais, paginar, resumoManuais } from "@/lib/manuais/lista";

// tudo fictício
const ativos = [
  { codigo: "PRE-02", nome: "Prensa hidráulica 2", campo: "PRENSA 2", area: "Forjaria" },
  { codigo: "PRE-01", nome: "Prensa hidráulica 1", campo: "PRENSA 1", area: "Forjaria" },
  { codigo: "CAL-01", nome: "Caldeira auxiliar", campo: "CALDEIRA", area: "Utilidades" },
];
const vinculos = [
  { tag: "PRE-01", doc: { id: "a1", titulo: "Manual de operação", tipo: "application/pdf" } },
  { tag: "PRE-01", doc: { id: "a2", titulo: "Catálogo do fabricante", tipo: "link" } },
  { tag: "CAL-01", doc: { id: "b1", titulo: "Manual da caldeira", tipo: "image/png" } },
];

describe("lista de manuais: números", () => {
  it("cobertura é a parte dos equipamentos (não desativados) que têm algum manual", () => {
    expect(resumoManuais(ativos, vinculos)).toEqual({ vinculos: 3, comManual: 2, semManual: 1, cobertura: 67 });
    expect(resumoManuais([], vinculos)).toEqual({ vinculos: 3, comManual: 0, semManual: 0, cobertura: 0 });
  });
});

describe("lista de manuais: equipamentos sem manual", () => {
  it("lista os que não têm nenhum manual, por código, com filtro de área", () => {
    expect(equipamentosSemManual(ativos, vinculos).map((x) => x.codigo)).toEqual(["PRE-02"]);
    expect(equipamentosSemManual(ativos, vinculos, "Utilidades")).toEqual([]);
    expect(equipamentosSemManual(ativos, vinculos, "Forjaria").map((x) => x.codigo)).toEqual(["PRE-02"]);
  });
});

describe("lista de manuais: busca e filtros", () => {
  const ids = (l: { doc: { id: string } }[]) => l.map((x) => x.doc.id);
  it("busca pelo equipamento (código, campo ou nome) e pelo título, sem acento e sem maiúscula", () => {
    expect(ids(filtrarManuais(vinculos, { q: "caldeira" }, ativos))).toEqual(["b1"]);
    expect(ids(filtrarManuais(vinculos, { q: "PRENSA 1" }, ativos))).toEqual(["a1", "a2"]);
    expect(ids(filtrarManuais(vinculos, { q: "catalogo" }, ativos))).toEqual(["a2"]);
    expect(ids(filtrarManuais(vinculos, { q: "nada disso" }, ativos))).toEqual([]);
    expect(ids(filtrarManuais(vinculos, {}, ativos))).toEqual(["a1", "a2", "b1"]);
  });
  it("filtra pelo tipo (pdf, imagem, link) e pela área do equipamento", () => {
    expect(ids(filtrarManuais(vinculos, { tipo: "pdf" }, ativos))).toEqual(["a1"]);
    expect(ids(filtrarManuais(vinculos, { tipo: "imagem" }, ativos))).toEqual(["b1"]);
    expect(ids(filtrarManuais(vinculos, { tipo: "link" }, ativos))).toEqual(["a2"]);
    expect(ids(filtrarManuais(vinculos, { area: "Forjaria" }, ativos))).toEqual(["a1", "a2"]);
    expect(ids(filtrarManuais(vinculos, { tipo: "link", area: "Utilidades" }, ativos))).toEqual([]);
  });
});

describe("lista de manuais: paginação de 50", () => {
  const itens = Array.from({ length: 120 }, (_, i) => i + 1);
  it("pagina de 50 e corrige a página pedida fora da faixa", () => {
    expect(paginar(itens, 1)).toMatchObject({ pag: 1, paginas: 3, total: 120, inicio: 0 });
    expect(paginar(itens, 1).itens).toHaveLength(50);
    expect(paginar(itens, 3)).toMatchObject({ pag: 3, inicio: 100 });
    expect(paginar(itens, 3).itens).toEqual(itens.slice(100));
    expect(paginar(itens, 9).pag).toBe(3);
    expect(paginar(itens, 0).pag).toBe(1);
    expect(paginar([], 2)).toMatchObject({ pag: 1, paginas: 1, total: 0, itens: [] });
  });
});

describe("buscarEquipamentos (escolha sob demanda do Vincular manual)", () => {
  const eqs = Array.from({ length: 80 }, (_, i) => ({ codigo: `9000${String(i).padStart(2, "0")}`, nome: i % 2 ? "BOMBA FICTICIA" : "PRENSA FICTICIA", campo: `CAMPO-${i}`, area: "AREA X" }));

  it("sem termo não devolve nada (a lista fica vazia até a busca)", () => {
    expect(buscarEquipamentos(eqs, "")).toEqual({ itens: [], total: 0 });
    expect(buscarEquipamentos(eqs, "   ")).toEqual({ itens: [], total: 0 });
  });

  it("filtra por código, nome, campo ou área e limita os itens, com o total", () => {
    const r = buscarEquipamentos(eqs, "bomba", 10);
    expect(r.total).toBe(40);
    expect(r.itens).toHaveLength(10);
    expect(r.itens.every((e) => e.nome === "BOMBA FICTICIA")).toBe(true);
    expect(buscarEquipamentos(eqs, "900007").itens.map((e) => e.codigo)).toEqual(["900007"]);
    expect(buscarEquipamentos(eqs, "zzz-sem-nada").total).toBe(0);
  });
});
