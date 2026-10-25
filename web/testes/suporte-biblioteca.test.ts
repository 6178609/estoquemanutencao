import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import { _definirFonte } from "@/lib/dados/fonte";
import { _definirSupabase } from "@/lib/dados/supabase";
import {
  LIMITE_DOCUMENTO,
  documentosDe,
  documentosTecnicos,
  gravarDocumento,
  gravarDocumentoTecnico,
  gravarLinkTecnico,
  lerDocumentoTecnico,
  removerDocumentoTecnico,
  todosDocumentosEquipamentos,
} from "@/lib/dados/documentos";
import type { Area } from "@/lib/suporte/guias";
import * as rota from "@/app/api/suporte/documento/route";

// tudo fictício; sem repositório de dados = modo demonstração (memória)
const PDF = new TextEncoder().encode("%PDF-1.7\n%fake\n");
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0x10]);
const HTML = new TextEncoder().encode("<html><script>alert(1)</script>");

// quem está "logado" nas rotas (mock da sessão): null = sem login
let quem: { login: string; nome: string; funcao?: string; perfil: string } | null = null;
// nome da aba pedida à sessão (a rota tem de pedir "suporte", não a aba do equipamento)
let abasPedidas: string[] = [];
vi.mock("@/lib/auth/sessao", () => ({
  autorizar: async (aba: string, editar = false) => {
    abasPedidas.push(aba);
    if (!quem) return null;
    if (editar && quem.perfil === "leitor") return null;
    return quem;
  },
}));

describe("biblioteca técnica: armazenamento", () => {
  beforeAll(() => { _definirFonte(null); _definirSupabase(null); });
  afterAll(() => { _definirFonte(undefined); _definirSupabase(undefined); });

  it("recusa área inexistente (gravar, ler, listar, remover)", async () => {
    const x = "inexistente" as Area;
    await expect(gravarDocumentoTecnico(x, { titulo: "x", nome: "x.pdf", bytes: PDF }, "Teste")).rejects.toThrow(/Área inválida/);
    await expect(gravarLinkTecnico(x, { titulo: "x", url: "https://exemplo.test" }, "Teste")).rejects.toThrow(/Área inválida/);
    await expect(removerDocumentoTecnico(x, "abcdef12", "Teste")).rejects.toThrow(/Área/);
    expect(await lerDocumentoTecnico(x, "abcdef12")).toBeNull();
    expect(await documentosTecnicos(x)).toEqual([]);
  });

  it("grava, lista, lê e remove documentos de uma área; a listagem geral junta as áreas", async () => {
    const pdf = await gravarDocumentoTecnico("mecanica", { titulo: "Guia de alinhamento", nome: "alinhamento.pdf", bytes: PDF }, "Teste");
    expect(pdf).toMatchObject({ titulo: "Guia de alinhamento", tipo: "application/pdf", tamanho: PDF.length, nome: "alinhamento.pdf" });
    const link = await gravarLinkTecnico("eletrica", { titulo: "Norma do fabricante", url: "https://exemplo.test/norma" }, "Teste");

    expect((await documentosTecnicos("mecanica")).map((d) => d.id)).toEqual([pdf.id]);
    expect((await documentosTecnicos("eletrica")).map((d) => d.id)).toEqual([link.id]);
    expect((await documentosTecnicos()).map((d) => d.id).sort()).toEqual([pdf.id, link.id].sort());
    expect((await documentosTecnicos("mecanica"))[0].area).toBe("mecanica");

    expect((await lerDocumentoTecnico("mecanica", pdf.id))?.tipo).toBe("application/pdf");
    expect(await lerDocumentoTecnico("eletrica", pdf.id)).toBeNull(); // o id é da outra área
    expect(await lerDocumentoTecnico("mecanica", link.id)).toBeNull(); // link não tem arquivo

    await removerDocumentoTecnico("mecanica", pdf.id, "Teste");
    expect(await documentosTecnicos("mecanica")).toEqual([]);
    expect(await lerDocumentoTecnico("mecanica", pdf.id)).toBeNull();
    await removerDocumentoTecnico("eletrica", link.id, "Teste");
    expect(await documentosTecnicos()).toEqual([]);
  });

  it("valida título vazio (cai no nome do arquivo ou em \"Documento\"), tipo pela assinatura, tamanho e link", async () => {
    const sem = await gravarDocumentoTecnico("metodos", { titulo: "  ", nome: "PDCA-modelo.pdf", bytes: PDF }, "Teste");
    expect(sem.titulo).toBe("PDCA-modelo");
    const sem2 = await gravarDocumentoTecnico("metodos", { titulo: "", nome: ".pdf", bytes: JPEG }, "Teste");
    expect(sem2.titulo).toBe("Documento");
    expect(sem2.tipo).toBe("image/jpeg");

    // HTML renomeado para .pdf: recusado pela assinatura dos bytes
    await expect(gravarDocumentoTecnico("metodos", { titulo: "x", nome: "fake.pdf", bytes: HTML }, "Teste")).rejects.toThrow(/PDF ou uma imagem/);
    // acima do limite
    const grande = new Uint8Array(LIMITE_DOCUMENTO + 1);
    grande.set(PDF.slice(0, 5));
    await expect(gravarDocumentoTecnico("metodos", { titulo: "x", nome: "grande.pdf", bytes: grande }, "Teste")).rejects.toThrow(/4 MB/);
    // link que não é http(s)
    await expect(gravarLinkTecnico("metodos", { titulo: "x", url: "javascript:alert(1)" }, "Teste")).rejects.toThrow(/Link inválido/);
    await expect(gravarLinkTecnico("metodos", { titulo: "", url: "data:text/html,x" }, "Teste")).rejects.toThrow(/Link inválido/);

    for (const d of await documentosTecnicos("metodos")) await removerDocumentoTecnico("metodos", d.id, "Teste");
  });

  it("não mistura com a biblioteca do ativo", async () => {
    const eq = await gravarDocumento("PRENSA/07", { titulo: "Manual", nome: "manual.pdf", bytes: PDF }, "Teste");
    const tec = await gravarDocumentoTecnico("lubrificacao", { titulo: "Tabela de graxas", nome: "graxas.pdf", bytes: PDF }, "Teste");

    expect((await documentosDe("PRENSA/07")).map((d) => d.id)).toEqual([eq.id]);
    expect((await documentosTecnicos()).map((d) => d.id)).toEqual([tec.id]);
    expect(await lerDocumentoTecnico("lubrificacao", eq.id)).toBeNull();

    const todos = await todosDocumentosEquipamentos();
    expect(todos).toEqual([{ tag: "PRENSA/07", doc: expect.objectContaining({ id: eq.id, titulo: "Manual" }) }]);
  });
});

describe("rota /api/suporte/documento", () => {
  beforeAll(() => { _definirFonte(null); _definirSupabase(null); });
  afterAll(() => { _definirFonte(undefined); _definirSupabase(undefined); quem = null; });
  beforeEach(() => { quem = { login: "lider.teste", nome: "Pessoa Fictícia", funcao: "lider", perfil: "editor" }; abasPedidas = []; });

  const URL_ROTA = "http://localhost/api/suporte/documento";
  const enviar = (form: FormData, origem?: string) => new NextRequest(URL_ROTA, {
    method: "POST",
    body: form,
    headers: origem ? { origin: origem } : undefined,
  });
  const pdfForm = (extra: Record<string, string> = {}) => {
    const f = new FormData();
    f.set("area", "mecanica");
    f.set("titulo", "Manual fictício");
    f.set("arquivo", new File([PDF], "manual.pdf", { type: "application/pdf" }));
    for (const [k, v] of Object.entries(extra)) f.set(k, v);
    return f;
  };

  it("sem login, GET e POST são recusados", async () => {
    quem = null;
    const r = await rota.GET(new NextRequest(`${URL_ROTA}?area=mecanica&id=abcdef12`));
    expect(r.status).toBe(403);
    expect((await rota.POST(enviar(pdfForm()))).status).toBe(403);
  });

  it("leitor vê o documento, mas não envia nem remove", async () => {
    quem = { login: "leitor.teste", nome: "Leitor Fictício", perfil: "leitor" };
    expect((await rota.POST(enviar(pdfForm()))).status).toBe(403);
    expect((await rota.DELETE(new NextRequest(`${URL_ROTA}?area=mecanica&id=abcdef12`, { method: "DELETE" }))).status).toBe(403);
    const r = await rota.GET(new NextRequest(`${URL_ROTA}?area=mecanica&id=abcdef12`));
    expect(r.status).toBe(404); // pode ler a rota; o documento não existe
  });

  it("recusa pedido de outro site (origem diferente)", async () => {
    const r = await rota.POST(enviar(pdfForm(), "https://outro-site.test"));
    expect(r.status).toBe(403);
  });

  it("aceita pedido com a origem do próprio site", async () => {
    const r = await rota.POST(enviar(pdfForm(), "http://localhost"));
    expect(r.status).toBe(200);
    const { doc } = await r.json();
    await rota.DELETE(new NextRequest(`${URL_ROTA}?area=mecanica&id=${doc.id}`, { method: "DELETE", headers: { origin: "http://localhost" } }));
  });

  it("recusa área inválida e link inválido", async () => {
    const semArea = pdfForm({ area: "xyz" });
    expect((await rota.POST(enviar(semArea))).status).toBe(400);
    const link = new FormData();
    link.set("area", "mecanica");
    link.set("titulo", "x");
    link.set("url", "javascript:alert(1)");
    expect((await rota.POST(enviar(link))).status).toBe(400);
  });

  it("recusa arquivo que não é PDF/imagem e arquivo acima do limite", async () => {
    const falso = new FormData();
    falso.set("area", "mecanica");
    falso.set("titulo", "Falso");
    falso.set("arquivo", new File([HTML], "manual.pdf", { type: "application/pdf" }));
    expect((await rota.POST(enviar(falso))).status).toBe(400);

    const grande = new FormData();
    grande.set("area", "mecanica");
    grande.set("titulo", "Grande");
    grande.set("arquivo", new File([new Uint8Array(LIMITE_DOCUMENTO + 1)], "grande.pdf", { type: "application/pdf" }));
    expect((await rota.POST(enviar(grande))).status).toBe(413);
  });

  it("editor envia, lê e remove; depois da remoção o documento some", async () => {
    const env = await rota.POST(enviar(pdfForm()));
    expect(env.status).toBe(200);
    expect(abasPedidas).toContain("suporte");
    expect(abasPedidas.every((a) => a === "suporte")).toBe(true);
    const { doc } = await env.json();
    expect(doc).toMatchObject({ titulo: "Manual fictício", tipo: "application/pdf" });

    const abre = await rota.GET(new NextRequest(`${URL_ROTA}?area=mecanica&id=${doc.id}`));
    expect(abre.status).toBe(200);
    expect(abre.headers.get("Content-Type")).toBe("application/pdf");

    const sem = await rota.DELETE(new NextRequest(`${URL_ROTA}?area=mecanica&id=${doc.id}`, { method: "DELETE" }));
    expect(sem.status).toBe(200);
    const depois = await rota.GET(new NextRequest(`${URL_ROTA}?area=mecanica&id=${doc.id}`));
    expect(depois.status).toBe(404);
  });

  it("aceita link válido com título vazio (usa o endereço)", async () => {
    const link = new FormData();
    link.set("area", "fluidos");
    link.set("titulo", "");
    link.set("url", "https://exemplo.test/catalogo-ficticio");
    const r = await rota.POST(enviar(link));
    expect(r.status).toBe(200);
    const { doc } = await r.json();
    expect(doc).toMatchObject({ tipo: "link", titulo: "exemplo.test", url: "https://exemplo.test/catalogo-ficticio" });
  });
});
