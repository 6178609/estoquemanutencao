import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { _definirFonte } from "@/lib/dados/fonte";
import { _definirSupabase } from "@/lib/dados/supabase";
import { documentosDe, gravarDocumento, gravarLink, lerDocumento, limparTitulo, linkValido, removerDocumento, tipoDocumento } from "@/lib/dados/documentos";

// tudo fictício; sem repositório de dados = modo demonstração (memória)
const PDF = new TextEncoder().encode("%PDF-1.7\n%fake\n");
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0x10]);

describe("biblioteca do ativo", () => {
  beforeAll(() => { _definirFonte(null); _definirSupabase(null); });
  afterAll(() => { _definirFonte(undefined); _definirSupabase(undefined); });

  it("aceita PDF e imagem pelos bytes; recusa o resto", () => {
    expect(tipoDocumento(PDF)).toBe("application/pdf");
    expect(tipoDocumento(JPEG)).toBe("image/jpeg");
    expect(tipoDocumento(new TextEncoder().encode("<html><script>"))).toBeNull();
  });
  it("só links http(s)", () => {
    expect(linkValido("https://exemplo.test/manual.pdf")).toBe(true);
    expect(linkValido("javascript:alert(1)")).toBe(false);
    expect(linkValido("data:text/html,x")).toBe(false);
    expect(linkValido("https://exemplo.test/a b")).toBe(false);
    expect(limparTitulo("  Manual\r\nde operação  ")).toBe("Manual de operação");
  });
  it("grava, lista, lê e remove documentos de um equipamento (TAG com barra também)", async () => {
    const tag = "PRENSA/03";
    const pdf = await gravarDocumento(tag, { titulo: "", nome: "Manual de operação.pdf", bytes: PDF }, "Teste");
    expect(pdf).toMatchObject({ titulo: "Manual de operação", tipo: "application/pdf", tamanho: PDF.length });
    const link = await gravarLink(tag, { titulo: "Catálogo do fabricante", url: "https://exemplo.test/catalogo" }, "Teste");
    await expect(gravarLink(tag, { titulo: "x", url: "ftp://exemplo.test" }, "Teste")).rejects.toThrow(/Link inválido/);
    await expect(gravarDocumento(tag, { titulo: "x", nome: "x.exe", bytes: new Uint8Array([77, 90, 0, 0, 0, 0]) }, "Teste")).rejects.toThrow(/PDF/);
    expect((await documentosDe(tag)).map((d) => d.id).sort()).toEqual([pdf.id, link.id].sort());
    expect((await lerDocumento(tag, pdf.id))?.tipo).toBe("application/pdf");
    expect(await lerDocumento(tag, link.id)).toBeNull();
    expect(await lerDocumento("OUTRA", pdf.id)).toBeNull();
    await removerDocumento(tag, pdf.id, "Teste");
    expect((await documentosDe(tag)).map((d) => d.id)).toEqual([link.id]);
    expect(await lerDocumento(tag, pdf.id)).toBeNull();
    await removerDocumento(tag, link.id, "Teste");
    expect(await documentosDe(tag)).toEqual([]);
  });
});
