import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { type FotoExterna, fotoDoItem } from "@/lib/fotoMaterial";
import { _definirFonte } from "@/lib/dados/fonte";
import { _definirSupabase } from "@/lib/dados/supabase";
import { chaveSugestao } from "@/lib/dados/fotosSugestao";
import { fotoDoCadastro, fotoExternaDe, fotosExternasDoItem, respostaFotoExterna } from "@/lib/dados/fotosExternas";
import { normalizarFotosImportadas } from "@/lib/dados/fotosImportar";
import { lerFotoTipo, pdmValido } from "@/lib/dados/fotosTipo";
import { lerFotoReferencia } from "@/lib/dados/fotosReferencia";
import { SugestaoErro } from "@/lib/dados/fotosSugestao";

const URL_OK = "https://exemplo.com.br/rolamento.jpg";
const REF: FotoExterna = { k: chaveSugestao(URL_OK), pagina: "https://exemplo.com.br/produto", titulo: "Rolamento" };
const TIPO: FotoExterna = { k: chaveSugestao("https://exemplo.com.br/tipo.jpg"), pagina: null, titulo: "Tipo" };
const PROPRIA = "app/fotos/materiais/100200?v=0123456789abcdef";

describe("prioridade da foto do item", () => {
  it("própria → do fabricante → ilustrativa → nenhuma", () => {
    const base = { material: "100200", pdm: "ROLAMENTO" };
    expect(fotoDoItem({ ...base, foto: PROPRIA, fotoRef: REF, fotoTipo: TIPO })?.origem).toBe("propria");
    expect(fotoDoItem({ ...base, foto: null, fotoRef: REF, fotoTipo: TIPO })?.origem).toBe("referencia");
    expect(fotoDoItem({ ...base, foto: null, fotoRef: null, fotoTipo: TIPO })?.origem).toBe("tipo");
    expect(fotoDoItem({ ...base, foto: null, fotoRef: null, fotoTipo: null })).toBeNull();
  });
  it("a do fabricante leva a página de origem; a do tipo, a chave e o PDM na URL", () => {
    const r = fotoDoItem({ material: "100200", pdm: "ROLAMENTO", fotoRef: REF, foto: null, fotoTipo: null });
    expect(r?.url).toBe(`/api/estoque/foto/referencia?m=100200&k=${REF.k}`);
    expect(r?.pagina).toBe("https://exemplo.com.br/produto");
    const t = fotoDoItem({ material: "100200", pdm: "ROLAMENTO", foto: null, fotoRef: null, fotoTipo: TIPO });
    expect(t?.url).toBe(`/api/estoque/foto/tipo?p=ROLAMENTO&k=${TIPO.k}`);
    expect(t?.pagina).toBeNull();
  });
  it("sem PDM não há foto do tipo", () => {
    expect(fotoDoItem({ material: "100200", pdm: "", foto: null, fotoRef: null, fotoTipo: TIPO })).toBeNull();
  });
});

describe("detecção do formato da importação", () => {
  it("só tipos, só materiais e os dois juntos", () => {
    const foto = { url: URL_OK, pagina: "https://exemplo.com.br/p", titulo: "X", buscado_em: "2026-01-02T03:04:05Z" };
    const so = normalizarFotosImportadas({ tipos: { ROLAMENTO: foto } });
    expect(Object.keys(so.tipos)).toEqual(["ROLAMENTO"]);
    expect(Object.keys(so.materiais)).toEqual([]);
    const mat = normalizarFotosImportadas({ materiais: { "100200": foto } });
    expect(Object.keys(mat.materiais)).toEqual(["100200"]);
    expect(Object.keys(mat.tipos)).toEqual([]);
    const os2 = normalizarFotosImportadas({ tipos: { ROLAMENTO: foto }, materiais: { "100200": foto } });
    expect(Object.keys(os2.tipos)).toEqual(["ROLAMENTO"]);
    expect(Object.keys(os2.materiais)).toEqual(["100200"]);
    expect(os2.materiais["100200"].buscado_em).toBe("2026-01-02T03:04:05.000Z");
  });
  it("recusa arquivo sem tipos nem materiais, lista ou texto", () => {
    expect(() => normalizarFotosImportadas({ outra: {} })).toThrow(SugestaoErro);
    expect(() => normalizarFotosImportadas([1])).toThrow(SugestaoErro);
    expect(() => normalizarFotosImportadas("x")).toThrow(SugestaoErro);
    expect(() => normalizarFotosImportadas({ tipos: [] })).toThrow(SugestaoErro);
  });
  it("descarta código de material inválido, PDM com controle e endereço recusado", () => {
    const r = normalizarFotosImportadas({
      tipos: {
        ROLAMENTO: { url: URL_OK },
        "BOM\u0007": { url: URL_OK },
        "": { url: URL_OK },
        CORREIA: { url: "http://exemplo.com.br/a.jpg" },
        FUSIVEL: { url: "https://127.0.0.1/a.jpg" },
      },
      materiais: { "100200": { url: URL_OK }, "../fora": { url: URL_OK }, "100201": { url: "https://localhost/x.jpg" } },
    });
    expect(Object.keys(r.tipos)).toEqual(["ROLAMENTO"]);
    expect(Object.keys(r.materiais)).toEqual(["100200"]);
  });
  it("PDM: 1 a 120 caracteres, sem controle", () => {
    expect(pdmValido("ROLAMENTO")).toBe(true);
    expect(pdmValido("")).toBe(false);
    expect(pdmValido("A".repeat(121))).toBe(false);
    expect(pdmValido("A\nB")).toBe(false);
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
  it("o item do material pega a referência; o PDM pega o tipo", () => {
    const ref = { "100200": { url: URL_OK, pagina: null, titulo: "R" } };
    const tipos = { ROLAMENTO: { url: "https://exemplo.com.br/t.jpg", pagina: null, titulo: "T" } };
    const r = fotosExternasDoItem("100200", "ROLAMENTO", ref, tipos);
    expect(r.fotoRef?.titulo).toBe("R");
    expect(r.fotoTipo?.titulo).toBe("T");
    const semNada = fotosExternasDoItem("999", "", ref, tipos);
    expect(semNada).toEqual({ fotoRef: null, fotoTipo: null });
    // chaves do próprio objeto, não as herdadas (ex.: "constructor")
    expect(fotosExternasDoItem("constructor", "constructor", {}, {})).toEqual({ fotoRef: null, fotoTipo: null });
  });
});

describe("leitura em modo demonstração", () => {
  // sem repositório de dados nem Supabase: os cadastros de demonstração (com um tipo e um item de fabricante fictícios)
  beforeAll(() => { _definirFonte(null); _definirSupabase(null); });
  afterAll(() => { _definirFonte(undefined); _definirSupabase(undefined); });

  it("o tipo ROLAMENTO e a referência 900000 existem na demonstração, com endereço fictício", async () => {
    const t = await lerFotoTipo("ROLAMENTO");
    expect(t?.url).toBe("https://exemplo.invalid/tipo.jpg");
    expect(await lerFotoTipo("NAO-EXISTE")).toBeNull();
    expect(await lerFotoTipo("A\nB")).toBeNull();
    expect((await lerFotoReferencia("900000"))?.url).toBe("https://exemplo.invalid/referencia.jpg");
  });

  it("imagem que não carrega vira 404 (a tela mostra o ícone padrão), sem erro", async () => {
    const r = await respostaFotoExterna(await lerFotoTipo("ROLAMENTO"), chaveSugestao("https://exemplo.invalid/tipo.jpg"));
    expect(r.status).toBe(404);
    expect(await respostaFotoExterna(null, "000000000000")).toHaveProperty("status", 404);
  });
});
