import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { _definirFonte } from "@/lib/dados/fonte";
import { _definirSupabase } from "@/lib/dados/supabase";
import { caminhoFoto, gravarFotoMaterial, lerFotoMaterial, materialValido, tipoImagem } from "@/lib/dados/fotos";

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
    expect(materialValido("")).toBe(false);
    expect(caminhoFoto("100200")).toBe("app/fotos/materiais/100200");
  });
  it("em demonstração grava na memória e devolve a referência com versão", async () => {
    const ref = await gravarFotoMaterial("999001", JPEG, "Teste");
    expect(ref).toMatch(/^app\/fotos\/materiais\/999001\?v=/);
    expect(await lerFotoMaterial("999001")).toEqual({ bytes: JPEG, tipo: "image/jpeg" });
    await expect(gravarFotoMaterial("999002", new TextEncoder().encode("texto"), "Teste")).rejects.toThrow(/imagem/);
  });
});
