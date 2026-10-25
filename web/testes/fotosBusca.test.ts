import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// rede simulada: o download das imagens e páginas passa por node:https; a resolução de nome, por node:dns/promises
const sim = vi.hoisted(() => ({ respostas: new Map<string, { status?: number; tipo?: string; corpo: Uint8Array | string; tamanho?: number }>() }));
vi.mock("node:dns/promises", () => ({ lookup: async () => [{ address: "93.184.216.34", family: 4 }] }));
vi.mock("node:https", () => ({
  request: (endereco: string, _opts: unknown, cb: (res: unknown) => void) => {
    const req = {
      on() { return req; },
      destroy() { /* sem conexão real */ },
      end() {
        const r = sim.respostas.get(endereco) ?? { status: 404, corpo: "" };
        const bytes = typeof r.corpo === "string" ? new TextEncoder().encode(r.corpo) : r.corpo;
        const res = {
          statusCode: r.status ?? 200,
          headers: { "content-type": r.tipo ?? "text/html; charset=utf-8", "content-length": String(r.tamanho ?? bytes.length) },
          destroy() { /* fim */ },
          async *[Symbol.asyncIterator]() { yield bytes; },
        };
        queueMicrotask(() => cb(res));
      },
    };
    return req;
  },
}));

import { NextResponse } from "next/server";
import { _limparCacheFotos, fotoDoCadastro, respostaFotoExterna, chaveFoto } from "@/lib/dados/fotosExternas";
import { chaveSugestao, imagemDaPagina } from "@/lib/dados/fotosSugestao";
import { deduzirPdm, pdmEfetivo, pdmsConhecidos } from "@/lib/dados/pdmDeducao";
import { bancoDeImagem, consultaFotoExata, escolherFotoExata, imagemAceitavel, refNormalizada } from "@/lib/fotos/escolha";
import { normalizarBrave, normalizarFirecrawl, normalizarSerpapi, normalizarSerper, buscarImagens, CotaErro, BuscaErro } from "@/lib/fotos/buscaImagem";
import { planejarBusca, rodadaFotos, limiteDiario, type DadosBusca } from "@/lib/fotos/rodadaFotos";
import { ARQUIVO_REFERENCIA } from "@/lib/dados/fotosReferencia";
import { lerCadastro } from "@/lib/dados/cadastros";
import { fabricantesERefs, fabricanteRef, type ItemCatalogo } from "@/lib/dados/materiais";

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 0, 0, 1]);
const CHAVE_FICTICIA = "chave-ficticia-para-teste";

function item(p: Partial<ItemCatalogo>): ItemCatalogo {
  return { material: "", sysmat: "", substituto: "", ncm: "", um: "", categoria: "", subcategoria: "", pdm: "",
    descricaoCurta: "", descrCompleta: "", fabricanteRef: "", status: "APROVADO", ...p };
}

describe("extração de fabricante e referência", () => {
  it("separa os pares FAB/REF e mantém fabricanteRef igual", () => {
    const info = "TIPO: ROLAMENTO; FAB: SKF - REF: 6205-2Z.; FAB: FAG - REF: 6205.";
    expect(fabricantesERefs(info)).toEqual([{ fab: "SKF", ref: "6205-2Z" }, { fab: "FAG", ref: "6205" }]);
    expect(fabricanteRef(info)).toBe("SKF 6205-2Z | FAG 6205");
    expect(fabricantesERefs("sem fabricante")).toEqual([]);
  });
  it("referência normalizada: maiúsculas, sem espaço, ponto, hífen", () => {
    expect(refNormalizada("6205-2z ")).toBe("62052Z");
    expect(refNormalizada("A.1 / b_2")).toBe("A1B2");
  });
});

describe("dedução do PDM pelo texto breve", () => {
  const pdms = ["ROLAMENTO", "ROLAMENTO RIGIDO ESFERAS", "PARAFUSO SEXTAVADO"];
  it("prefixo mais longo, com palavra abreviada", () => {
    expect(deduzirPdm("ROLAMENTO RIGIDO ESFER RO-1418", pdms)).toBe("ROLAMENTO RIGIDO ESFERAS");
    expect(deduzirPdm("ROLAMENTO AXIAL", pdms)).toBe("ROLAMENTO");
  });
  it("sem palavra em comum, nada; o do cadastro vence", () => {
    expect(deduzirPdm("CHAVE INGLESA 10", pdms)).toBeNull();
    expect(pdmEfetivo("PARAFUSO SEXTAVADO", "ROLAMENTO RIGIDO", pdms)).toBe("PARAFUSO SEXTAVADO");
    expect(pdmEfetivo("", "ROLAMENTO RIGIDO ESFER RO-1418", pdms)).toBe("ROLAMENTO RIGIDO ESFERAS");
  });
  it("PDMs conhecidos", () => {
    expect(pdmsConhecidos([{ pdm: " A " }, { pdm: "" }, { pdm: "A" }])).toEqual(["A"]);
  });
});

describe("escolha da imagem", () => {
  const loja = "https://loja.exemplo.com.br";
  it("foto exata: título ou página com a referência; prefere a que traz o fabricante", () => {
    const r = escolherFotoExata([
      { imagem: `${loja}/a.jpg`, pagina: null, titulo: "Rolamento 6205-2Z" },
      { imagem: `${loja}/b.png`, pagina: `${loja}/p/6205-2Z`, titulo: "Rolamento SKF 6205-2Z" },
    ], "SKF", "6205-2Z");
    expect(r?.imagem).toBe(`${loja}/b.png`);
    const so = escolherFotoExata([{ imagem: `${loja}/c.jpg`, pagina: null, titulo: "Rolamento 6205-2Z" }], "SKF", "6205-2Z");
    expect(so?.imagem).toBe(`${loja}/c.jpg`);
  });
  it("foto exata recusa: sem a referência, referência curta, http, extensão de página, banco de imagem não entra na exata", () => {
    expect(escolherFotoExata([{ imagem: `${loja}/a.jpg`, pagina: null, titulo: "Rolamento 7000" }], "SKF", "6205-2Z")).toBeNull();
    expect(escolherFotoExata([{ imagem: `${loja}/a.jpg`, pagina: null, titulo: "12" }], "SKF", "12")).toBeNull();
    expect(escolherFotoExata([{ imagem: "http://loja.exemplo.com.br/a.jpg", pagina: null, titulo: "6205-2Z" }], "SKF", "6205-2Z")).toBeNull();
    expect(escolherFotoExata([{ imagem: `${loja}/a.html`, pagina: null, titulo: "6205-2Z" }], "SKF", "6205-2Z")).toBeNull();
    expect(escolherFotoExata([{ imagem: "https://192.168.0.5/a.jpg", pagina: null, titulo: "6205-2Z" }], "SKF", "6205-2Z")).toBeNull();
  });
  it("consultas", () => {
    expect(consultaFotoExata("SKF", "6205-2Z", "ROLAMENTO RIGIDO ESFERAS DE CONTATO")).toBe("SKF 6205-2Z ROLAMENTO RIGIDO ESFERAS");
  });
  it("foto exata: imagem de banco de imagens não serve, mesmo com a referência", () => {
    expect(escolherFotoExata([{ imagem: "https://www.shutterstock.com/6205-2Z.jpg", pagina: null, titulo: "SKF 6205-2Z" }], "SKF", "6205-2Z")).toBeNull();
    expect(escolherFotoExata([{ imagem: `${loja}/a.jpg`, pagina: "https://www.123rf.com/6205-2Z", titulo: "SKF 6205-2Z" }], "SKF", "6205-2Z")).toBeNull();
  });
  it("extensão e banco de imagem", () => {
    expect(imagemAceitavel(`${loja}/foto`)).toBe(true);
    expect(imagemAceitavel(`${loja}/`)).toBe(false);
    expect(bancoDeImagem("https://pt.depositphotos.com/a.jpg")).toBe(true);
    expect(bancoDeImagem(loja + "/a.jpg")).toBe(false);
  });
});

describe("provedores de busca (fetch simulado)", () => {
  let salvo: NodeJS.ProcessEnv = process.env;
  beforeEach(() => { salvo = process.env; process.env = { ...salvo }; });
  afterEach(() => { vi.unstubAllGlobals(); process.env = salvo; });

  it("normaliza o formato de cada provedor", () => {
    expect(normalizarBrave({ results: [{ title: "T", url: "https://p.com/x", properties: { url: "https://p.com/i.jpg" } }, { title: "sem imagem" }] }))
      .toEqual([{ imagem: "https://p.com/i.jpg", pagina: "https://p.com/x", titulo: "T" }]);
    expect(normalizarSerper({ images: [{ title: "S", imageUrl: "https://p.com/s.png", link: "https://p.com/s" }] }))
      .toEqual([{ imagem: "https://p.com/s.png", pagina: "https://p.com/s", titulo: "S" }]);
    expect(normalizarSerpapi({ images_results: [{ title: "A", original: "https://p.com/a.jpg", link: "https://p.com/a" }] }))
      .toEqual([{ imagem: "https://p.com/a.jpg", pagina: "https://p.com/a", titulo: "A" }]);
    expect(normalizarFirecrawl({ data: { images: [{ title: "F", imageUrl: "https://p.com/f.jpg", url: "https://p.com/f" }, { title: "G", url: "https://p.com/g.jpg" }] } }))
      .toEqual([{ imagem: "https://p.com/f.jpg", pagina: "https://p.com/f", titulo: "F" }, { imagem: "https://p.com/g.jpg", pagina: null, titulo: "G" }]);
  });

  it("cada provedor chama o endereço e o cabeçalho certos e devolve a lista", async () => {
    const chamadas: { url: string; init: RequestInit }[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit) => {
      chamadas.push({ url, init });
      return new Response(JSON.stringify({ results: [{ title: "T", url: "https://p.com/x", properties: { url: "https://p.com/i.jpg" } }],
        images: [{ title: "T", imageUrl: "https://p.com/i.jpg", link: "https://p.com/x" }],
        images_results: [{ title: "T", original: "https://p.com/i.jpg", link: "https://p.com/x" }],
        data: { images: [{ title: "T", imageUrl: "https://p.com/i.jpg", url: "https://p.com/x" }] } }), { status: 200 });
    }));
    for (const provedor of ["brave", "serper", "serpapi", "firecrawl"]) {
      process.env.BUSCA_IMAGENS_PROVEDOR = provedor;
      process.env.BUSCA_IMAGENS_CHAVE = CHAVE_FICTICIA;
      const r = await buscarImagens("SKF 6205");
      expect(r[0].imagem).toBe("https://p.com/i.jpg");
    }
    expect(chamadas[0].url).toContain("api.search.brave.com/res/v1/images/search");
    expect((chamadas[0].init.headers as Record<string, string>)["X-Subscription-Token"]).toBe(CHAVE_FICTICIA);
    expect(chamadas[1].url).toBe("https://google.serper.dev/images");
    expect(JSON.parse(String(chamadas[1].init.body))).toMatchObject({ gl: "br", hl: "pt-br", num: 10 });
    expect(chamadas[2].url).toContain("engine=google_images");
    expect(chamadas[3].url).toBe("https://api.firecrawl.dev/v2/search");
    expect((chamadas[3].init.headers as Record<string, string>).Authorization).toBe(`Bearer ${CHAVE_FICTICIA}`);
  });

  it("429 e 402 viram cota; erro comum não mostra a chave", async () => {
    process.env.BUSCA_IMAGENS_PROVEDOR = "serper";
    process.env.BUSCA_IMAGENS_CHAVE = CHAVE_FICTICIA;
    vi.stubGlobal("fetch", vi.fn(async () => new Response("", { status: 429 })));
    await expect(buscarImagens("x")).rejects.toBeInstanceOf(CotaErro);
    vi.stubGlobal("fetch", vi.fn(async () => new Response("", { status: 402 })));
    await expect(buscarImagens("x")).rejects.toBeInstanceOf(CotaErro);
    vi.stubGlobal("fetch", vi.fn(async () => new Response("erro", { status: 500 })));
    const erro = await buscarImagens("x").catch((e) => e);
    expect(erro).toBeInstanceOf(BuscaErro);
    expect(String(erro.message)).not.toContain(CHAVE_FICTICIA);
  });

  it("sem provedor configurado a busca não roda", async () => {
    delete process.env.BUSCA_IMAGENS_PROVEDOR;
    await expect(buscarImagens("x")).rejects.toThrow("desligada");
  });
});

describe("imagem da página", () => {
  const pagina = "https://loja.exemplo.com.br/produto/1";
  it("og:image, depois twitter:image, depois link image_src, depois a primeira img de produto", () => {
    expect(imagemDaPagina('<meta property="og:image" content="https://cdn.exemplo.com.br/o.jpg">', pagina)).toBe("https://cdn.exemplo.com.br/o.jpg");
    expect(imagemDaPagina('<meta name="twitter:image" content="https://cdn.exemplo.com.br/t.jpg">', pagina)).toBe("https://cdn.exemplo.com.br/t.jpg");
    expect(imagemDaPagina('<link rel="image_src" href="/img/l.jpg">', pagina)).toBe("https://loja.exemplo.com.br/img/l.jpg");
  });
  it("img relativa resolvida; logo, sprite, svg e data: ignorados", () => {
    const html = '<img src="/img/logo.png"><img src="data:image/gif;base64,AAA"><img src="/sprite.svg"><img src="img/prod%20a.jpg?x=1&amp;y=2">';
    expect(imagemDaPagina(html, pagina)).toBe("https://loja.exemplo.com.br/produto/img/prod%20a.jpg?x=1&y=2");
  });
  it("logo da loja não vira foto: o Product do JSON-LD vem antes do og:image", () => {
    const html = '<meta property="og:image" content="https://cdn.exemplo.com.br/logo-loja.png">'
      + '<script type="application/ld+json">{"@context":"https://schema.org","@graph":[{"@type":"Organization","logo":"https://cdn.exemplo.com.br/l.png"},'
      + '{"@type":"Product","name":"Rolamento 6205","image":["https://cdn.exemplo.com.br/6205.jpg"]}]}</script>';
    expect(imagemDaPagina(html, pagina)).toBe("https://cdn.exemplo.com.br/6205.jpg");
    // JSON-LD com image como objeto, e quebrado (ignorado)
    expect(imagemDaPagina('<script type="application/ld+json">{oops</script><script type="application/ld+json">'
      + '{"@type":"Product","image":{"@type":"ImageObject","url":"/p.webp"}}</script>', pagina)).toBe("https://loja.exemplo.com.br/p.webp");
  });
  it("og:image de logo, de compartilhamento padrão ou igual ao ícone é pulado; a img do produto serve", () => {
    const html = '<link rel="apple-touch-icon" href="https://cdn.exemplo.com.br/marca.png">'
      + '<meta property="og:image" content="https://cdn.exemplo.com.br/marca.png">'
      + '<img src="/static/logo_header.png" alt="Loja"><img src="/selo-seguranca.png">'
      + '<img class="foto" src="/img/outra.jpg"><img class="product-image" data-src="/img/6205-2Z.jpg">';
    expect(imagemDaPagina(html, pagina)).toBe("https://loja.exemplo.com.br/img/6205-2Z.jpg");
    expect(imagemDaPagina('<meta property="og:image" content="https://cdn.exemplo.com.br/og-default.jpg"><img src="/a/b.jpg">', pagina))
      .toBe("https://loja.exemplo.com.br/a/b.jpg");
    expect(imagemDaPagina('<meta property="og:image" content="https://cdn.exemplo.com.br/assets/Logo%20Loja.jpg">', pagina)).toBeNull();
    // peças com "selo"/"seal", pasta "default" de CDN e reserva do Cloudinary continuam valendo
    for (const ok of ["https://cdn.exemplo.com.br/img/selo-mecanico-21.jpg", "https://cdn.exemplo.com.br/industrial-seals/cr-seal.jpg",
      "https://www.exemplo.com.br/on/demandware.static/-/Sites-master/default/dw12/images/6205.jpg",
      "https://res.cloudinary.com/x/image/upload/d_default.png/v1/p/6205.jpg"])
      expect(imagemDaPagina(`<meta property="og:image" content="${ok}">`, pagina)).toBe(ok);
    expect(imagemDaPagina('<img class="product-image" alt="Selo mecanico 21" src="/s21.jpg">', pagina)).toBe("https://loja.exemplo.com.br/s21.jpg");
    expect(imagemDaPagina('<meta property="og:image" content="https://cdn.exemplo.com.br/og-image.png">', pagina)).toBeNull();
    // ProductGroup (variantes) e @type com prefixo
    expect(imagemDaPagina('<script type="application/ld+json">{"@type":"ProductGroup","hasVariant":[{"@type":"http://schema.org/Product",'
      + '"image":"https://cdn.exemplo.com.br/v1.jpg"}]}</script>', pagina)).toBe("https://cdn.exemplo.com.br/v1.jpg");
    // "silicone" não é "icon"
    expect(imagemDaPagina('<meta property="og:image" content="https://cdn.exemplo.com.br/mangueira-silicone.jpg">', pagina))
      .toBe("https://cdn.exemplo.com.br/mangueira-silicone.jpg");
  });
  it("sem imagem, ou só endereço http/privado, nada", () => {
    expect(imagemDaPagina("<p>nada</p>", pagina)).toBeNull();
    expect(imagemDaPagina('<meta property="og:image" content="http://cdn.exemplo.com.br/x.jpg"><img src="http://10.0.0.1/a.jpg">', pagina)).toBeNull();
  });
});

describe("foto só com a página (fetch simulado)", () => {
  beforeEach(() => _limparCacheFotos());
  const base = (pagina: string) => fotoDoCadastro({ pagina, titulo: "Produto", buscado_em: "2026-01-01T00:00:00Z" })!;

  it("aceita item só com pagina e usa a página como chave", () => {
    const f = base("https://loja.um.com.br/p1");
    expect(f.url).toBeNull();
    expect(chaveFoto(f)).toMatch(/^[0-9a-f]{12}$/);
    // chave nova para a imagem tirada da página (a regra sem logo trocou a imagem): o navegador não usa a antiga
    expect(chaveFoto(f)).not.toBe(chaveSugestao("https://loja.um.com.br/p1"));
    expect(fotoDoCadastro({ pagina: "http://loja.um.com.br/p" })).toBeNull();
    expect(fotoDoCadastro({ url: "https://192.168.0.1/a.jpg" })).toBeNull();
  });

  it("og:image da página vira a foto (200, jpeg)", async () => {
    sim.respostas.set("https://loja.dois.com.br/p2", { corpo: '<meta property="og:image" content="https://cdn.dois.com.br/p2.jpg">' });
    sim.respostas.set("https://cdn.dois.com.br/p2.jpg", { tipo: "image/jpeg", corpo: JPEG });
    const f = base("https://loja.dois.com.br/p2");
    const r: NextResponse = await respostaFotoExterna(f, chaveFoto(f));
    expect(r.status).toBe(200);
    expect(r.headers.get("content-type")).toBe("image/jpeg");
  });

  it("twitter:image funciona como alternativa", async () => {
    sim.respostas.set("https://loja.tres.com.br/p3", { corpo: '<meta name="twitter:image" content="https://cdn.tres.com.br/t3.png">' });
    sim.respostas.set("https://cdn.tres.com.br/t3.png", { tipo: "image/png", corpo: new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4, 5, 6, 7, 8, 9]) });
    const f = base("https://loja.tres.com.br/p3");
    expect((await respostaFotoExterna(f, chaveFoto(f))).status).toBe(200);
  });

  it("img relativa da página vira a foto", async () => {
    sim.respostas.set("https://loja.quatro.com.br/p4", { corpo: '<img src="/fotos/p4.jpg">' });
    sim.respostas.set("https://loja.quatro.com.br/fotos/p4.jpg", { tipo: "image/jpeg", corpo: JPEG });
    const f = base("https://loja.quatro.com.br/p4");
    expect((await respostaFotoExterna(f, chaveFoto(f))).status).toBe(200);
  });

  it("página sem imagem devolve 404", async () => {
    sim.respostas.set("https://loja.cinco.com.br/p5", { corpo: "<p>sem foto</p>" });
    const f = base("https://loja.cinco.com.br/p5");
    expect((await respostaFotoExterna(f, chaveFoto(f))).status).toBe(404);
  });

  it("HTML grande demais é recusado (404)", async () => {
    sim.respostas.set("https://loja.seis.com.br/p6", { corpo: "x".repeat(10), tamanho: 3 * 1024 * 1024 });
    const f = base("https://loja.seis.com.br/p6");
    expect((await respostaFotoExterna(f, chaveFoto(f))).status).toBe(404);
  });

  it("content-type que não é HTML é recusado (404)", async () => {
    sim.respostas.set("https://loja.sete.com.br/p7", { tipo: "application/pdf", corpo: '<meta property="og:image" content="https://cdn.sete.com.br/a.jpg">' });
    const f = base("https://loja.sete.com.br/p7");
    expect((await respostaFotoExterna(f, chaveFoto(f))).status).toBe(404);
  });
});

beforeAll(() => {
  process.env.BUSCA_IMAGENS_PROVEDOR = "brave";
  process.env.BUSCA_IMAGENS_CHAVE = CHAVE_FICTICIA;
});

describe("planejamento da busca", () => {
  const agora = Date.parse("2026-10-25T12:00:00Z");
  const catalogo = [
    item({ material: "000100", pdm: "ROLAMENTO RIGIDO ESFERAS", subcategoria: "ROLAMENTO", categoria: "MECANICA",
      descrCompleta: "FAB: SKF - REF: 6205-2Z.", descricaoCurta: "ROLAMENTO 6205" }),
    item({ material: "200", pdm: "", subcategoria: "PARAFUSO", categoria: "FIXACAO", descricaoCurta: "PARAFUSO 8" }),
    item({ material: "300", pdm: "ROLAMENTO RIGIDO ESFERAS", subcategoria: "ROLAMENTO", categoria: "MECANICA", descricaoCurta: "ROLAMENTO 6206" }),
    item({ material: "400", pdm: "CORREIA", subcategoria: "CORREIA", categoria: "MECANICA",
      descrCompleta: "FAB: GATES - REF: A-42.", descricaoCurta: "CORREIA A42" }),
  ];
  const base = (over: Partial<DadosBusca> = {}): DadosBusca => ({
    estoque: [{ material: "100", descricao: "ROLAMENTO RIGIDO ESFER RO-1418" }, { material: "200", descricao: "PARAFUSO SEXTAVADO" },
      { material: "400", descricao: "CORREIA A42" }],
    catalogo, refs: {}, estado: {}, agora, ...over,
  });

  it("só busca foto exata dos materiais do almoxarifado com referência; nada por tipo nem do catálogo sem estoque", () => {
    const alvos = planejarBusca(base());
    const chaves = alvos.map((a) => a.chave);
    // o 000100 do catálogo é o 100 do estoque; o 300 (sem referência) e os do catálogo fora do estoque não entram
    expect(chaves).toEqual(["m:100", "m:400"]);
    expect(planejarBusca(base({ estoque: [] }))).toEqual([]);
    expect(alvos[0].consulta).toBe("SKF 6205-2Z ROLAMENTO RIGIDO ESFERAS");
    expect(chaves.some((c) => c.startsWith("t:"))).toBe(false);
  });

  it("não repete o que já tem foto nem o que foi tentado nos últimos 60 dias", () => {
    const estado = { "m:100": { data: "2026-10-01T00:00:00Z", resultado: "sem" }, "m:400": { data: "2025-01-01T00:00:00Z", resultado: "sem" } };
    // m:100 foi tentado há menos de 60 dias; m:400, há mais: tenta de novo
    expect(planejarBusca(base({ estado })).map((a) => a.chave)).toEqual(["m:400"]);
    expect(planejarBusca(base({ refs: { "100": {} } })).map((a) => a.chave)).toEqual(["m:400"]);
    expect(planejarBusca(base({ refs: { "000100": {} } })).map((a) => a.chave)).toEqual(["m:100", "m:400"]);
  });

  it("orçamento: a rodada para no teto e o restante do dia conta", async () => {
    const buscar = vi.fn(async () => []);
    const mais = [...catalogo, item({ material: "500", pdm: "CORREIA", descrCompleta: "FAB: GATES - REF: B-50.", descricaoCurta: "CORREIA B50" })];
    const r = await rodadaFotos({ limiteDia: 2, porRodada: 10, buscar, dados: async () => base({ catalogo: mais,
      estoque: [...base().estoque, { material: "500", descricao: "CORREIA B50" }] }) });
    expect(r.buscados).toBe(2);
    expect(buscar).toHaveBeenCalledTimes(2);
    expect(r.motivo).toBe("orçamento da rodada");
    const hoje = await rodadaFotos({ limiteDia: 2, porRodada: 10, dados: async () => base({ catalogo, estado: {
      _orcamento_dia: { dia: "2026-10-25", usadas: 2 } } }), buscar });
    expect(hoje.buscados).toBe(0);
    expect(hoje.motivo).toBe("orçamento do dia esgotado");
  });

  it("cota do provedor para a rodada sem erro fatal", async () => {
    const buscar = vi.fn(async () => { throw new CotaErro("cota"); });
    const r = await rodadaFotos({ limiteDia: 9, porRodada: 9, dados: async () => base({ catalogo }), buscar });
    expect(r.motivo).toBe("cota do provedor de busca");
    expect(buscar).toHaveBeenCalledTimes(1);
  });

  it("limite diário: padrão 30, máximo 200", () => {
    expect(limiteDiario({})).toBe(30);
    expect(limiteDiario({ BUSCA_IMAGENS_POR_DIA: "500" })).toBe(200);
    expect(limiteDiario({ BUSCA_IMAGENS_POR_DIA: "abc" })).toBe(30);
    expect(limiteDiario({ BUSCA_IMAGENS_POR_DIA: "-4" })).toBe(0);
  });
});

describe("rodada grava os achados nos cadastros", () => {

  it("acha a foto exata e grava no cadastro de fotos do fabricante, com o estado", async () => {
    const cat = [item({ material: "900111", pdm: "ROLAMENTO RIGIDO ESFERAS", subcategoria: "ROLAMENTO", categoria: "MECANICA",
      descrCompleta: "FAB: SKF - REF: 6205-2Z.", descricaoCurta: "ROLAMENTO" })];
    const buscar = async (consulta: string) => consulta.includes("6205")
      ? [{ imagem: "https://loja.achado.com.br/6205.jpg", pagina: "https://loja.achado.com.br/p/6205-2Z", titulo: "Rolamento SKF 6205-2Z" }]
      : [];
    const r = await rodadaFotos({ limiteDia: 30, porRodada: 30, buscar, dados: async () => ({
      estoque: [{ material: "900111", descricao: "ROLAMENTO RIGIDO ESFERAS" }], catalogo: cat, refs: {}, estado: {}, agora: Date.now() }) });
    expect(r.achados).toBeGreaterThanOrEqual(1);
    const refs = await lerCadastro(ARQUIVO_REFERENCIA);
    expect(refs["900111"]).toMatchObject({ url: "https://loja.achado.com.br/6205.jpg", pagina: "https://loja.achado.com.br/p/6205-2Z" });
  });

  it("sem o provedor configurado, nada roda", async () => {
    const env = { ...process.env };
    delete process.env.BUSCA_IMAGENS_CHAVE;
    try {
      const r = await rodadaFotos({ limiteDia: 30, porRodada: 30 });
      expect(r.ligada).toBe(false);
    } finally {
      process.env = env;
    }
  });
});

describe("rota de busca automática", () => {
  it("sem o segredo do agendamento, 401", async () => {
    process.env.CRON_SECRET = "segredo-ficticio";
    const { GET } = await import("@/app/api/fotos/buscar/route");
    const { NextRequest } = await import("next/server");
    const sem = await GET(new NextRequest("https://exemplo.test/api/fotos/buscar"));
    expect(sem.status).toBe(401);
    const errado = await GET(new NextRequest("https://exemplo.test/api/fotos/buscar", { headers: { authorization: "Bearer outro" } }));
    expect(errado.status).toBe(401);
    delete process.env.CRON_SECRET;
  });
});

describe("desempenho (catálogo e páginas grandes)", () => {
  it("deduz o tipo de 1.200 materiais contra 9.500 PDMs em menos de 1 s", () => {
    const itens = Array.from({ length: 9_500 }, (_, i) => ({ pdm: `TIPO${i % 700} PECA${i} PARTE` }));
    itens.push({ pdm: "ROLAMENTO RIGIDO ESFERAS" }, { pdm: "ROLAMENTO" });
    const pdms = pdmsConhecidos(itens);
    const t = performance.now();
    for (let i = 0; i < 1_200; i++) deduzirPdm(`ROLAMENTO RIGIDO ESFER RO-${i}`, pdms);
    expect(performance.now() - t).toBeLessThan(1_000);
    expect(deduzirPdm("ROLAMENTO RIGIDO ESFER RO-1418", pdms)).toBe("ROLAMENTO RIGIDO ESFERAS");
  });

  it("página de 2 MB com tag sem fechamento não trava a extração da imagem", () => {
    const t = performance.now();
    expect(imagemDaPagina("<img ".repeat(400_000), "https://exemplo.com.br/p")).toBeNull();
    expect(performance.now() - t).toBeLessThan(1_000);
  });
});
