import { describe, expect, it } from "vitest";

import { ACERVO, buscarAcervo } from "@/lib/suporte/acervo";
import { AREAS } from "@/lib/suporte/guias";

// só links públicos: a validade de cada item (https, único, área/tipo/idioma válidos, textos preenchidos)
const AREAS_VALIDAS = new Set<string>(AREAS.map((a) => a.id));
const TIPOS = new Set(["manual", "catalogo", "guia", "norma", "calculadora", "curso", "artigo"]);
const IDIOMAS = new Set(["pt", "en", "es"]);

describe("acervo de referência: validade dos itens", () => {
  it("há itens e todos os links são https e únicos", () => {
    expect(ACERVO.length).toBeGreaterThan(200);
    for (const it of ACERVO) expect(it.url.startsWith("https://"), `link sem https: ${it.url}`).toBe(true);
    expect(new Set(ACERVO.map((x) => x.url)).size).toBe(ACERVO.length);
  });

  it("área, tipo e idioma são valores válidos", () => {
    for (const it of ACERVO) {
      expect(AREAS_VALIDAS.has(it.area), `área inválida em ${it.url}`).toBe(true);
      expect(TIPOS.has(it.tipo), `tipo inválido em ${it.url}`).toBe(true);
      expect(IDIOMAS.has(it.idioma), `idioma inválido em ${it.url}`).toBe(true);
    }
  });

  it("título, fonte e descrição não estão vazios", () => {
    for (const it of ACERVO) {
      expect(it.titulo.trim(), `título vazio em ${it.url}`).not.toBe("");
      expect(it.fonte.trim(), `fonte vazia em ${it.url}`).not.toBe("");
      expect(it.descricao.trim(), `descrição vazia em ${it.url}`).not.toBe("");
    }
  });
});

describe("buscarAcervo", () => {
  it("sem termo e sem filtro devolve o acervo inteiro", () => {
    expect(buscarAcervo("")).toHaveLength(ACERVO.length);
  });

  it("acha pela fonte (SKF) e todo resultado traz o termo", () => {
    const achados = buscarAcervo("SKF");
    expect(achados.length).toBeGreaterThan(0);
    for (const it of achados) expect(`${it.fonte} ${it.titulo} ${it.descricao}`.toLowerCase()).toContain("skf");
  });

  it("ignora acento e caixa: \"MANUTENÇÃO\" acha o mesmo que \"manutencao\"", () => {
    const a = buscarAcervo("MANUTENÇÃO").map((x) => x.url);
    expect(a.length).toBeGreaterThan(0);
    expect(buscarAcervo("manutencao").map((x) => x.url)).toEqual(a);
  });

  it("termo que não existe não acha nada", () => {
    expect(buscarAcervo("zzzqqxx")).toEqual([]);
  });

  it("filtra por área, tipo e idioma (sozinhos e juntos)", () => {
    const eletrica = buscarAcervo("", { area: "eletrica" });
    expect(eletrica.length).toBeGreaterThan(0);
    expect(eletrica.every((x) => x.area === "eletrica")).toBe(true);

    const normas = buscarAcervo("", { tipo: "norma" });
    expect(normas.length).toBeGreaterThan(0);
    expect(normas.every((x) => x.tipo === "norma")).toBe(true);

    const pt = buscarAcervo("", { idioma: "pt" });
    expect(pt.length).toBeGreaterThan(0);
    expect(pt.every((x) => x.idioma === "pt")).toBe(true);

    const juntos = buscarAcervo("", { area: "seguranca", tipo: "norma", idioma: "pt" });
    expect(juntos.every((x) => x.area === "seguranca" && x.tipo === "norma" && x.idioma === "pt")).toBe(true);
  });

  it("combina busca e filtro", () => {
    const achados = buscarAcervo("SKF", { idioma: "en" });
    expect(achados.length).toBeGreaterThan(0);
    expect(achados.every((x) => x.idioma === "en")).toBe(true);
  });
});
