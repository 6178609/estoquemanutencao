import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { lerRefFoto } from "@/lib/fotoMaterial";
import { gravarCadastroLote } from "@/lib/dados/cadastros";
import { _definirFonte } from "@/lib/dados/fonte";
import { chaveSugestao, removerSugestao } from "@/lib/dados/fotosSugestao";
import { _definirSupabase } from "@/lib/dados/supabase";
import {
  adicionarFotoMaterial, alterarFotoMaterial, caminhoFoto, lerFotoMaterial, materialValido, podeEnviar, tipoImagem, versaoFoto,
} from "@/lib/dados/fotos";

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46]);
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]);
const WEBP = new TextEncoder().encode("RIFF\0\0\0\0WEBPVP8 ");

describe("foto do material", () => {
  // sem repositório de dados: modo demonstração
  beforeAll(() => { _definirFonte(null); _definirSupabase(null); });
  afterAll(() => { _definirFonte(undefined); _definirSupabase(undefined); });

  it("reconhece a imagem pelos bytes, não pelo nome", () => {
    expect(tipoImagem(JPEG)).toBe("image/jpeg");
    expect(tipoImagem(PNG)).toBe("image/png");
    expect(tipoImagem(WEBP)).toBe("image/webp");
    expect(tipoImagem(new TextEncoder().encode("<svg onload=alert(1)>"))).toBeNull();
    expect(tipoImagem(new Uint8Array())).toBeNull();
  });
  it("só aceita código de material simples (sem caminho)", () => {
    expect(materialValido("100200")).toBe(true);
    expect(materialValido("../app/usuarios")).toBe(false);
    expect(materialValido("a/b")).toBe(false);
    expect(materialValido("..")).toBe(false);
    expect(materialValido(".x")).toBe(false);
    expect(materialValido("")).toBe(false);
    expect(materialValido("1~2")).toBe(false);
    expect(caminhoFoto("100200")).toBe("app/fotos/materiais/100200");
    expect(caminhoFoto("100200", true)).toBe("app/fotos/materiais/100200_mini");
    expect(caminhoFoto("100200", true, "ab12cd34")).toBe("app/fotos/materiais/100200~ab12cd34_mini");
    expect(() => caminhoFoto("100200", false, "../../x")).toThrow();
  });
  it("em demonstração inclui foto e miniatura; a versão vem do conteúdo", async () => {
    const lista = await adicionarFotoMaterial("999001", JPEG, PNG, "Teste");
    expect(lista).toHaveLength(1);
    const ref = lerRefFoto(lista[0])!;
    expect(ref.material).toBe("999001");
    expect(ref.id).toMatch(/^[a-z0-9]{6,12}$/);
    expect(ref.versao).toBe(versaoFoto(JPEG));
    expect(ref.mini).toBe(true);
    expect(await lerFotoMaterial("999001", { id: ref.id! })).toEqual({ bytes: JPEG, tipo: "image/jpeg", versao: versaoFoto(JPEG) });
    expect((await lerFotoMaterial("999001", { id: ref.id!, mini: true }))?.tipo).toBe("image/png");
    expect(await lerFotoMaterial("999001", { id: "zzzzzz9" })).toBeNull();
    await expect(adicionarFotoMaterial("999002", new TextEncoder().encode("texto"), null, "Teste")).rejects.toThrow(/imagem/);
  });
  it("inclui várias fotos, troca a principal, tira uma e para no limite de 8", async () => {
    const m = "999003";
    const refs: string[] = [];
    for (let i = 0; i < 8; i++) {
      const bytes = new Uint8Array([...JPEG, i]);
      const lista = await adicionarFotoMaterial(m, bytes, null, "Teste");
      refs.push(lista[lista.length - 1]);
    }
    expect(refs).toHaveLength(8);
    expect(new Set(refs).size).toBe(8);
    await expect(adicionarFotoMaterial(m, new Uint8Array([...JPEG, 9]), null, "Teste")).rejects.toThrow(/8 fotos/);

    const trocada = await alterarFotoMaterial(m, "principal", refs[3], "Teste");
    expect(trocada[0]).toBe(refs[3]);
    expect(trocada).toHaveLength(8);
    const sem = await alterarFotoMaterial(m, "remover", refs[3], "Teste");
    expect(sem).toHaveLength(7);
    expect(sem).not.toContain(refs[3]);
    expect(sem[0]).toBe(refs[0]);
    await expect(alterarFotoMaterial(m, "remover", refs[3], "Teste")).rejects.toThrow(/já não está/);
  });
  it("tira uma sugestão pela chave, sem mexer nas outras; sugestão que já saiu não dá erro", async () => {
    const a = "https://www.exemplo.com.br/a.jpg", b = "https://www.exemplo.com.br/b.jpg";
    await gravarCadastroLote("sugestoes_fotos.json", { "999010": { sugestoes: [
      { url: a, pagina: null, titulo: "A" }, { url: b, pagina: null, titulo: "B" }] } }, "Teste");
    const sobra = await removerSugestao("999010", chaveSugestao(a), "Teste");
    expect(sobra.map((s) => s.titulo)).toEqual(["B"]);
    expect(await removerSugestao("999010", chaveSugestao(a), "Teste")).toEqual(sobra);
    expect(await removerSugestao("999010", chaveSugestao(b), "Teste")).toEqual([]);
  });
  it("limita a 20 envios por pessoa a cada 10 minutos", () => {
    const t0 = 1_000_000;
    for (let i = 0; i < 20; i++) expect(podeEnviar("pessoa-teste", t0 + i)).toBe(true);
    expect(podeEnviar("pessoa-teste", t0 + 100)).toBe(false);
    expect(podeEnviar("outra-pessoa", t0 + 100)).toBe(true);
    expect(podeEnviar("pessoa-teste", t0 + 10 * 60_000 + 50)).toBe(true);
  });
});
