import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { datasheetsDe, gravarDatasheet, gravarLinkDatasheet, lerDatasheet, removerDatasheet } from "@/lib/dados/documentos";
import { _definirFonte } from "@/lib/dados/fonte";
import { _definirSupabase } from "@/lib/dados/supabase";

import { consultaDatasheet, escolherDatasheet } from "@/lib/datasheet/escolha";
import { normalizarWebBrave, normalizarWebFirecrawl, normalizarWebGoogle, normalizarWebSerpapi, normalizarWebSerper } from "@/lib/fotos/buscaImagem";

// dados fictícios
describe("datasheet do material: escolha pela referência", () => {
  const r = (titulo: string, url: string) => ({ titulo, url });
  it("só aceita resultado com a REF no título ou no endereço; prefere PDF, depois o site do fabricante", () => {
    const lista = [
      r("Rolamento qualquer", "https://loja.exemplo.com/rolamento"),
      r("ACME VX-1234 à venda", "https://www.mercadolivre.com.br/acme-vx-1234"),
      r("VX-1234 | Página do produto", "https://www.acme.com/produtos/vx-1234"),
      r("Ficha", "https://docs.distribuidor.com/arquivos/VX1234-datasheet.pdf"),
    ];
    expect(escolherDatasheet(lista, "ACME", "VX-1234")).toEqual({ url: "https://docs.distribuidor.com/arquivos/VX1234-datasheet.pdf", titulo: "Ficha", pdf: true });
    expect(escolherDatasheet(lista.slice(0, 3), "ACME", "VX-1234")).toMatchObject({ url: "https://www.acme.com/produtos/vx-1234", pdf: false });
  });
  it("loja, http sem TLS, REF curta ou ausente: nada", () => {
    expect(escolherDatasheet([r("ACME VX-1234", "https://www.amazon.com.br/dp/X")], "ACME", "VX-1234")).toBeNull();
    expect(escolherDatasheet([r("ACME VX-1234", "http://acme.com/vx-1234")], "ACME", "VX-1234")).toBeNull();
    expect(escolherDatasheet([r("ACME AB", "https://acme.com/ab")], "ACME", "AB")).toBeNull();
    // REF curta (menos de 6) exige o fabricante; REF só na busca de outro site (query string) não conta
    expect(escolherDatasheet([r("Item 6205", "https://loja.com/6205.pdf")], "SKF", "6205")).toBeNull();
    expect(escolherDatasheet([r("SKF 6205", "https://skf.com/6205.pdf")], "SKF", "6205")).toMatchObject({ pdf: true });
    expect(escolherDatasheet([r("Busca", "https://outro.com/busca?q=VX-1234")], "ACME", "VX-1234")).toBeNull();
    expect(escolherDatasheet([r("outra peça", "https://acme.com/zz-99")], "ACME", "VX-1234")).toBeNull();
  });
  it("consulta: fabricante, referência e 'datasheet'", () => {
    expect(consultaDatasheet("ACME", "VX-1234")).toBe("ACME VX-1234 datasheet");
  });
});

describe("busca web dos provedores (páginas)", () => {
  const um = { titulo: "T", url: "https://x.com/p" };
  it("lê a resposta de cada provedor", () => {
    expect(normalizarWebGoogle({ items: [{ title: "T", link: "https://x.com/p" }] })).toEqual([um]);
    expect(normalizarWebBrave({ web: { results: [{ title: "T", url: "https://x.com/p" }] } })).toEqual([um]);
    expect(normalizarWebSerper({ organic: [{ title: "T", link: "https://x.com/p" }, { title: "sem link" }] })).toEqual([um]);
    expect(normalizarWebSerpapi({ organic_results: [{ title: "T", link: "https://x.com/p" }] })).toEqual([um]);
    expect(normalizarWebFirecrawl({ data: { web: [{ title: "T", url: "https://x.com/p" }] } })).toEqual([um]);
    expect(normalizarWebSerper(null)).toEqual([]);
  });
});

describe("biblioteca de datasheets do material (demonstração, na memória)", () => {
  beforeAll(() => { _definirFonte(null); _definirSupabase(null); });
  afterAll(() => { _definirFonte(undefined); _definirSupabase(undefined); });
  it("grava link e PDF pelo código sem zeros, lista e remove", async () => {
    const link = await gravarLinkDatasheet("000123456", { titulo: "Datasheet", url: "https://acme.com/vx.pdf" }, "teste");
    const pdf = await gravarDatasheet("123456", { titulo: "Ficha", nome: "ficha.pdf", bytes: new TextEncoder().encode("%PDF-1.4 teste") }, "teste");
    const lista = await datasheetsDe("123456");
    expect(lista.map((d) => d.id).sort()).toEqual([link.id, pdf.id].sort());
    expect((await lerDatasheet("0123456", pdf.id))?.tipo).toBe("application/pdf");
    await removerDatasheet("123456", link.id, "teste");
    expect((await datasheetsDe("123456")).map((d) => d.id)).toEqual([pdf.id]);
    await expect(gravarLinkDatasheet("abc", { titulo: "x", url: "https://a.com" }, "t")).rejects.toThrow(/Material inválido/);
  });
});
