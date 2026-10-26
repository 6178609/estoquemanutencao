import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { type FotoExterna, fotoDoItem } from "@/lib/fotoMaterial";
import { _definirFonte } from "@/lib/dados/fonte";
import { _definirSupabase } from "@/lib/dados/supabase";
import { chaveSugestao } from "@/lib/dados/fotosSugestao";
import { fotoDoCadastro, fotoExternaDe, fotosExternasDoItem, respostaFotoExterna } from "@/lib/dados/fotosExternas";
import { normalizarFotosImportadas } from "@/lib/dados/fotosImportar";
import { lerFotoReferencia } from "@/lib/dados/fotosReferencia";
import { SugestaoErro } from "@/lib/dados/fotosSugestao";

const URL_OK = "https://exemplo.com.br/rolamento.jpg";
const REF: FotoExterna = { k: chaveSugestao(URL_OK), pagina: "https://exemplo.com.br/produto", titulo: "Rolamento" };
const PROPRIA = "app/fotos/materiais/100200?v=0123456789abcdef";

describe("prioridade da foto do item", () => {
  it("própria → do fabricante → nenhuma (foto genérica do tipo não entra)", () => {
    const base = { material: "100200" };
    expect(fotoDoItem({ ...base, foto: PROPRIA, fotoRef: REF })?.origem).toBe("propria");
    expect(fotoDoItem({ ...base, foto: null, fotoRef: REF })?.origem).toBe("referencia");
    expect(fotoDoItem({ ...base, foto: null, fotoRef: null })).toBeNull();
  });
  it("foto de produto equivalente (item sem referência) tem origem e rótulo próprios", () => {
    const f = fotoDoCadastro({ url: URL_OK, pagina: null, titulo: "Abraçadeira 150x3,6", equivalente: true })!;
    expect(f.equivalente).toBe(true);
    const ext = fotoExternaDe(f);
    expect(ext.eq).toBe(true);
    expect(fotoDoItem({ material: "100200", foto: null, fotoRef: ext })?.origem).toBe("equivalente");
    expect(fotoDoItem({ material: "100200", foto: null, fotoRef: REF })?.origem).toBe("referencia");
    expect(fotoExternaDe(fotoDoCadastro({ url: URL_OK, equivalente: "sim" })!).eq).toBeUndefined();
  });
  it("a do fabricante leva a chave na URL e a página de origem", () => {
    const r = fotoDoItem({ material: "100200", fotoRef: REF, foto: null });
    expect(r?.url).toBe(`/api/estoque/foto/referencia?m=100200&k=${REF.k}`);
    expect(r?.pagina).toBe("https://exemplo.com.br/produto");
  });
});

describe("detecção do formato da importação", () => {
  it("materiais por código; o bloco de tipos (fotos genéricas) é ignorado", () => {
    const foto = { url: URL_OK, pagina: "https://exemplo.com.br/p", titulo: "X", buscado_em: "2026-01-02T03:04:05Z" };
    const mat = normalizarFotosImportadas({ materiais: { "100200": foto }, tipos: { ROLAMENTO: foto } });
    expect(Object.keys(mat)).toEqual(["materiais"]);
    expect(Object.keys(mat.materiais)).toEqual(["100200"]);
    expect(mat.materiais["100200"].buscado_em).toBe("2026-01-02T03:04:05.000Z");
  });
  it("recusa arquivo sem materiais, lista ou texto", () => {
    expect(() => normalizarFotosImportadas({ tipos: {} })).toThrow(SugestaoErro);
    expect(() => normalizarFotosImportadas([1])).toThrow(SugestaoErro);
    expect(() => normalizarFotosImportadas("x")).toThrow(SugestaoErro);
    expect(() => normalizarFotosImportadas({ materiais: [] })).toThrow(SugestaoErro);
  });
  it("descarta código de material inválido e endereço recusado", () => {
    const r = normalizarFotosImportadas({
      materiais: { "100200": { url: URL_OK }, "../fora": { url: URL_OK }, "100201": { url: "https://localhost/x.jpg" },
        "100202": { url: "http://exemplo.com.br/a.jpg" } },
    });
    expect(Object.keys(r.materiais)).toEqual(["100200"]);
  });
  it("a página de origem precisa ser https; senão fica vazia", () => {
    expect(fotoDoCadastro({ url: URL_OK, pagina: "javascript:alert(1)", titulo: "T" })?.pagina).toBeNull();
    expect(fotoDoCadastro({ url: URL_OK, pagina: "https://exemplo.com.br/p", titulo: "T\u0000x" })?.titulo).toBe("Tx");
    expect(fotoDoCadastro({ url: "https://exemplo.invalid/a.jpg" })).not.toBeNull(); // o DNS é conferido na busca, não aqui
  });
});

describe("chave e cadastro", () => {
  it("a chave é a do endereço (troca de endereço = nova chave)", () => {
    const f = fotoDoCadastro({ url: URL_OK })!;
    expect(fotoExternaDe(f).k).toBe(chaveSugestao(URL_OK));
    expect(chaveSugestao(URL_OK)).not.toBe(chaveSugestao(URL_OK + "?x"));
    expect(fotoExternaDe(f).k).toMatch(/^[0-9a-f]{12}$/);
  });
  it("o item do material pega a foto do fabricante pela referência", () => {
    const ref = { "100200": { url: URL_OK, pagina: null, titulo: "R" } };
    // só a foto já guardada no repositório aparece (a tela não busca imagem na internet)
    expect(fotosExternasDoItem("100200", ref).fotoRef).toBeNull();
    const guardada = { "100200": { url: URL_OK, pagina: null, titulo: "R", arquivo: "app/fotos/fabricante/100200.jpg" } };
    expect(fotosExternasDoItem("100200", guardada).fotoRef?.titulo).toBe("R");
    expect(fotosExternasDoItem("999", ref)).toEqual({ fotoRef: null });
    // chaves do próprio objeto, não as herdadas (ex.: "constructor")
    expect(fotosExternasDoItem("constructor", {})).toEqual({ fotoRef: null });
  });
});

describe("leitura em modo demonstração", () => {
  // sem repositório de dados nem Supabase: os cadastros de demonstração (com um item de fabricante fictício)
  beforeAll(() => { _definirFonte(null); _definirSupabase(null); });
  afterAll(() => { _definirFonte(undefined); _definirSupabase(undefined); });

  it("a referência 900000 existe na demonstração, com endereço fictício", async () => {
    expect((await lerFotoReferencia("900000"))?.url).toBe("https://exemplo.invalid/referencia.jpg");
  });

  it("imagem que não carrega vira 404 (a tela mostra o ícone padrão), sem erro", async () => {
    const r = await respostaFotoExterna(await lerFotoReferencia("900000"), chaveSugestao("https://exemplo.invalid/referencia.jpg"));
    expect(r.status).toBe(404);
    expect(await respostaFotoExterna(null, "000000000000")).toHaveProperty("status", 404);
  });
});

describe("foto do item com código diferente no Sysmat", () => {
  it("usa o codigoFoto nas URLs da foto própria e do fabricante", () => {
    const propria = fotoDoItem({ material: "000100200", codigoFoto: "100200", foto: "app/fotos/materiais/100200?v=0123456789abcdef" });
    expect(propria?.url).toContain("m=100200");
    const ref = fotoDoItem({ material: "000100200", codigoFoto: "100200", fotoRef: { k: "0123456789ab", pagina: null, titulo: "" } });
    expect(ref?.url).toContain("m=100200");
  });
});
