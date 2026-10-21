import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import { _definirFonte, type Fonte } from "@/lib/dados/fonte";
import { _definirSupabase } from "@/lib/dados/supabase";
import {
  documentosDe,
  gravarDocumento,
  gravarDocumentoEmVarios,
  gravarLinkEmVarios,
  LIMITE_DOCUMENTO,
  lerDocumento,
  removerDocumento,
  todosDocumentosEquipamentos,
} from "@/lib/dados/documentos";
import * as rota from "@/app/api/manuais/route";

// tudo fictício; os bytes são de um PDF e de um HTML de mentira
const PDF = new TextEncoder().encode("%PDF-1.7\n%fake\n");
const HTML = new TextEncoder().encode("<html><script>alert(1)</script>");
const PASTA_ARQUIVOS = "app/documentos/equipamentos/";

// fonte falsa em memória: conta as gravações de arquivo de manual (os bytes)
let versaoGlobal = 0;
function fonteFalsa() {
  const arquivos = new Map<string, { bytes: Uint8Array; versao: string }>();
  const gravados: string[] = [];
  const f = {
    modo: "pasta",
    descricao: "teste",
    async versoes() { return new Map([...arquivos].map(([k, v]) => [k, v.versao])); },
    async ler(c: string) { const a = arquivos.get(c); return a ? { bytes: a.bytes, versao: a.versao } : null; },
    async gravarCondicional(c: string, bytes: Uint8Array, versao: string | null) {
      gravados.push(c);
      if ((arquivos.get(c)?.versao ?? null) !== versao) return false;
      arquivos.set(c, { bytes, versao: `v${++versaoGlobal}` });
      return true;
    },
    async apagar(c: string, versao: string) {
      const a = arquivos.get(c);
      if (!a || a.versao !== versao) return false;
      arquivos.delete(c);
      return true;
    },
  };
  return {
    fonte: f as unknown as Fonte,
    arquivos,
    gravacoesDeArquivo: () => gravados.filter((c) => c.startsWith(PASTA_ARQUIVOS)).length,
  };
}

describe("manuais em vários equipamentos: armazenamento", () => {
  beforeEach(() => { _definirSupabase(null); });
  afterAll(() => { _definirFonte(undefined); _definirSupabase(undefined); });

  it("vincular a 3 equipamentos grava o arquivo 1 vez e cria 2 referências", async () => {
    const f = fonteFalsa();
    _definirFonte(f.fonte);
    const r = await gravarDocumentoEmVarios(["PRE-01", "PRE-02", "PRE-03"], { titulo: "Manual da prensa", nome: "prensa.pdf", bytes: PDF }, "Teste");

    expect(r.map((x) => x.tag)).toEqual(["PRE-01", "PRE-02", "PRE-03"]);
    expect(f.gravacoesDeArquivo()).toBe(1);
    expect([...f.arquivos.keys()].filter((k) => k.startsWith(PASTA_ARQUIVOS))).toHaveLength(1);
    const origem = r[0].doc;
    expect(origem).toMatchObject({ titulo: "Manual da prensa", tipo: "application/pdf", tamanho: PDF.length });
    expect(origem.origem).toBeUndefined();
    for (const ref of r.slice(1)) {
      expect(ref.doc.origem).toEqual({ tag: "PRE-01", id: origem.id });
      expect(ref.doc).toMatchObject({ titulo: "Manual da prensa", tipo: "application/pdf", tamanho: PDF.length });
    }
    expect((await documentosDe("PRE-02")).map((d) => d.origem?.tag)).toEqual(["PRE-01"]);
  });

  it("lerDocumento de uma referência devolve os bytes da origem", async () => {
    _definirFonte(fonteFalsa().fonte);
    const r = await gravarDocumentoEmVarios(["PRE-01", "PRE-02"], { titulo: "Manual", nome: "m.pdf", bytes: PDF }, "Teste");
    const lido = await lerDocumento("PRE-02", r[1].doc.id);
    expect(lido?.tipo).toBe("application/pdf");
    expect(Array.from(lido!.bytes)).toEqual(Array.from(PDF));
  });

  it("remover a origem com referências é recusado (até tirar as referências)", async () => {
    const f = fonteFalsa();
    _definirFonte(f.fonte);
    const r = await gravarDocumentoEmVarios(["PRE-01", "PRE-02", "PRE-03"], { titulo: "Manual", nome: "m.pdf", bytes: PDF }, "Teste");
    const origem = r[0].doc;
    await expect(removerDocumento("PRE-01", origem.id, "Teste")).rejects.toThrow(/vinculado a 2 outro/);
    await removerDocumento("PRE-02", r[1].doc.id, "Teste");
    await expect(removerDocumento("PRE-01", origem.id, "Teste")).rejects.toThrow(/vinculado a 1 outro/);
    // as referências ainda leem o arquivo
    expect(await lerDocumento("PRE-03", r[2].doc.id)).not.toBeNull();
    await removerDocumento("PRE-03", r[2].doc.id, "Teste");

    await removerDocumento("PRE-01", origem.id, "Teste");
    expect([...f.arquivos.keys()].filter((k) => k.startsWith(PASTA_ARQUIVOS))).toHaveLength(0);
    expect(await documentosDe("PRE-01")).toEqual([]);
    expect(await todosDocumentosEquipamentos()).toEqual([]);
  });

  it("vincular links grava uma entrada de link por equipamento", async () => {
    _definirFonte(fonteFalsa().fonte);
    const r = await gravarLinkEmVarios(["CAL-01", "CAL-02"], { titulo: "Catálogo do fabricante", url: "https://exemplo.test/catalogo" }, "Teste");
    expect(r.map((x) => x.doc.tipo)).toEqual(["link", "link"]);
    expect(new Set(r.map((x) => x.doc.id)).size).toBe(2);
    expect(r.every((x) => x.doc.origem === undefined)).toBe(true);
    expect((await documentosDe("CAL-02"))[0].url).toBe("https://exemplo.test/catalogo");
  });

  it("validação: recusa antes de gravar qualquer coisa", async () => {
    const f = fonteFalsa();
    _definirFonte(f.fonte);
    const muitos = Array.from({ length: 51 }, (_, i) => `EQ-${i}`);
    const ok = { titulo: "Manual", nome: "m.pdf", bytes: PDF };
    await expect(gravarDocumentoEmVarios([], ok, "Teste")).rejects.toThrow(/Escolha pelo menos um equipamento/);
    await expect(gravarDocumentoEmVarios(muitos, ok, "Teste")).rejects.toThrow(/no máximo 50/);
    await expect(gravarDocumentoEmVarios(["PRE-01", "__proto__"], ok, "Teste")).rejects.toThrow(/Equipamento inválido/);
    await expect(gravarDocumentoEmVarios(["PRE-01"], { ...ok, titulo: "   " }, "Teste")).rejects.toThrow(/Informe o título/);
    await expect(gravarDocumentoEmVarios(["PRE-01"], { ...ok, bytes: HTML }, "Teste")).rejects.toThrow(/PDF ou uma imagem/);
    const grande = new Uint8Array(LIMITE_DOCUMENTO + 1);
    grande.set(PDF.slice(0, 5));
    await expect(gravarDocumentoEmVarios(["PRE-01"], { ...ok, bytes: grande }, "Teste")).rejects.toThrow(/4 MB/);
    await expect(gravarLinkEmVarios(["PRE-01"], { titulo: "x", url: "javascript:alert(1)" }, "Teste")).rejects.toThrow(/Link inválido/);
    await expect(gravarLinkEmVarios([], { titulo: "x", url: "https://exemplo.test" }, "Teste")).rejects.toThrow(/Escolha pelo menos/);
    await expect(gravarLinkEmVarios(["PRE-01"], { titulo: " ", url: "https://exemplo.test" }, "Teste")).rejects.toThrow(/Informe o título/);
    expect(f.gravacoesDeArquivo()).toBe(0);
    expect(await todosDocumentosEquipamentos()).toEqual([]);
  });

  it("a biblioteca do ativo continua gravando um equipamento por vez (vincular um só = o de antes)", async () => {
    _definirFonte(null);
    const d = await gravarDocumento("PRE-09", { titulo: "Manual", nome: "m.pdf", bytes: PDF }, "Teste");
    expect(d.origem).toBeUndefined();
    await removerDocumento("PRE-09", d.id, "Teste");
  });
});

// ---------------------------------------------------------------------------- rota /api/manuais

// quem está "logado" (mock da sessão); a rota pede a aba Equipamentos com edição
let quem: { login: string; nome: string; funcao: string; perfil: string } | null = null;
vi.mock("@/lib/auth/sessao", () => ({
  autorizar: async (_aba: string, editar = false) => {
    if (!quem) return null;
    if (editar && quem.perfil === "leitor") return null;
    return quem;
  },
}));

describe("rota /api/manuais", () => {
  beforeAll(() => { _definirFonte(null); _definirSupabase(null); });
  afterAll(() => { _definirFonte(undefined); _definirSupabase(undefined); quem = null; });
  beforeEach(() => { quem = { login: "lider.teste", nome: "Pessoa Fictícia", funcao: "lider", perfil: "editor" }; });

  const URL_ROTA = "http://localhost/api/manuais";
  const enviar = (form: FormData, origem?: string) => new NextRequest(URL_ROTA, {
    method: "POST",
    body: form,
    headers: origem ? { origin: origem } : undefined,
  });
  const pdfForm = (extra: Record<string, string | string[]> = {}) => {
    const f = new FormData();
    for (const eq of ["MAN-01", "MAN-02"]) f.append("eqs", eq);
    f.set("titulo", "Manual fictício");
    f.set("arquivo", new File([PDF], "manual.pdf", { type: "application/pdf" }));
    for (const [k, v] of Object.entries(extra)) {
      f.delete(k);
      for (const x of Array.isArray(v) ? v : [v]) f.append(k, x);
    }
    return f;
  };

  it("sem login ou com leitor: recusado", async () => {
    quem = null;
    expect((await rota.POST(enviar(pdfForm()))).status).toBe(403);
    quem = { login: "leitor.teste", nome: "Leitor Fictício", funcao: "lider", perfil: "leitor" };
    expect((await rota.POST(enviar(pdfForm()))).status).toBe(403);
  });

  it("terceiro e manutentor não editam a biblioteca de equipamentos, mesmo como editor", async () => {
    quem = { login: "terceiro.teste", nome: "Terceiro Fictício", funcao: "terceiro", perfil: "editor" };
    expect((await rota.POST(enviar(pdfForm()))).status).toBe(403);
  });

  it("recusa pedido de outro site (origem diferente)", async () => {
    expect((await rota.POST(enviar(pdfForm(), "https://outro-site.test"))).status).toBe(403);
  });

  it("vincula um arquivo a vários equipamentos e responde quantos ficaram", async () => {
    const r = await rota.POST(enviar(pdfForm(), "http://localhost"));
    expect(r.status).toBe(200);
    const corpo = await r.json();
    expect(corpo).toMatchObject({ ok: true, vinculados: 2 });
    expect((await documentosDe("MAN-02")).map((d) => d.origem?.tag)).toEqual(["MAN-01"]);
  });

  it("vincula um link", async () => {
    const f = new FormData();
    f.append("eqs", "MAN-03");
    f.set("titulo", "Catálogo");
    f.set("url", "https://exemplo.test/catalogo");
    const r = await rota.POST(enviar(f));
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ ok: true, vinculados: 1 });
  });

  it("validação com erro em português (400), sem gravar", async () => {
    const semEq = pdfForm();
    semEq.delete("eqs");
    const r1 = await rota.POST(enviar(semEq));
    expect(r1.status).toBe(400);
    expect((await r1.json()).erro).toMatch(/Escolha pelo menos um equipamento/);

    const muitos = pdfForm({ eqs: Array.from({ length: 51 }, (_, i) => `M-${i}`) });
    expect((await rota.POST(enviar(muitos))).status).toBe(400);
    expect((await rota.POST(enviar(pdfForm({ eqs: ["Inválido\u0000"] })))).status).toBe(400);
    expect((await rota.POST(enviar(pdfForm({ titulo: "  " })))).status).toBe(400);
    expect((await rota.POST(enviar(pdfForm({ titulo: "" })))).status).toBe(400);

    const falso = pdfForm();
    falso.set("arquivo", new File([HTML], "manual.pdf", { type: "application/pdf" }));
    expect((await rota.POST(enviar(falso))).status).toBe(400);

    const link = new FormData();
    link.append("eqs", "MAN-01");
    link.set("titulo", "x");
    link.set("url", "javascript:alert(1)");
    expect((await rota.POST(enviar(link))).status).toBe(400);

    const grande = pdfForm();
    grande.set("arquivo", new File([new Uint8Array(LIMITE_DOCUMENTO + 1)], "grande.pdf", { type: "application/pdf" }));
    expect((await rota.POST(enviar(grande))).status).toBe(413);

    const semNada = new FormData();
    semNada.append("eqs", "MAN-01");
    semNada.set("titulo", "x");
    expect((await rota.POST(enviar(semNada))).status).toBe(400);
  });
});
