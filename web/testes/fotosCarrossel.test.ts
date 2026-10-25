import { describe, expect, it } from "vitest";

import { fotosDoCadastro, lerRefFoto, MAX_FOTOS, refFoto, refValida, urlFotoMaterial } from "@/lib/fotoMaterial";
import { ipReservado, sugestoesDoItem, chaveSugestao, publicas, urlSugestaoErro } from "@/lib/dados/fotosSugestao";

const ID = "ab12cd34";
const REF1 = "app/fotos/materiais/100200?v=0123456789abcdef&mini=1";
const REF2 = `app/fotos/materiais/100200~${ID}?v=fedcba9876543210`;

describe("lista de fotos do material", () => {
  it("material antigo: só `foto` vira lista de 1", () => {
    expect(fotosDoCadastro({ foto: REF1 })).toEqual([REF1]);
    expect(fotosDoCadastro({ foto: "fotos_materiais/100200.jpg" })).toEqual(["fotos_materiais/100200.jpg"]);
  });
  it("a principal (`foto`) é sempre a 1ª, mesmo que a lista diga outra coisa", () => {
    expect(fotosDoCadastro({ foto: REF1, fotos: [REF2, REF1] })).toEqual([REF1, REF2]);
    expect(fotosDoCadastro({ fotos: [REF2, REF1] })).toEqual([REF2, REF1]);
  });
  it("descarta referências inválidas, repetidas e com caminho suspeito", () => {
    const ruim = "app/fotos/materiais/../../usuarios?v=1";
    const barra = "app/fotos/materiais/100200/../x?v=1";
    const id6 = "app/fotos/materiais/100200~AB?v=1";
    expect(fotosDoCadastro({ fotos: [ruim, barra, id6, REF2, REF2, 5, null] })).toEqual([REF2]);
    expect(refValida(ruim)).toBe(false);
    expect(fotosDoCadastro(undefined)).toEqual([]);
    expect(fotosDoCadastro({ foto: null, fotos: null })).toEqual([]);
  });
  it("no máximo 8 fotos", () => {
    const muitas = Array.from({ length: 12 }, (_, i) => refFoto("100200", `id${String(i).padStart(6, "0")}`, "0000000000000001", false));
    expect(fotosDoCadastro({ fotos: muitas })).toHaveLength(MAX_FOTOS);
  });
  it("lê a referência (material, id, versão, miniatura) e recusa caminho inválido", () => {
    expect(lerRefFoto(REF2)).toEqual({ material: "100200", id: ID, versao: "fedcba9876543210", mini: false });
    expect(lerRefFoto(REF1)).toEqual({ material: "100200", id: null, versao: "0123456789abcdef", mini: true });
    expect(lerRefFoto("app/fotos/materiais/100200~ab12cd34/x?v=1")).toBeNull();
    expect(lerRefFoto("app/fotos/materiais/100200~AB12CD34?v=1")).toBeNull();
    expect(lerRefFoto("app/fotos/materiais/100200~ab12cd34~ab12cd34?v=1")).toBeNull();
    expect(lerRefFoto("https://exemplo.com/x.jpg")).toBeNull();
  });
  it("monta a referência com id e miniatura", () => {
    expect(refFoto("100200", ID, "fedcba9876543210", true)).toBe(REF2 + "&mini=1");
    expect(refFoto("100200", null, "0123456789abcdef", false)).toBe("app/fotos/materiais/100200?v=0123456789abcdef");
  });
});

describe("endereço da foto (URL)", () => {
  it("foto principal, sem id", () => {
    expect(urlFotoMaterial("100200", REF1, true)).toBe("/api/estoque/foto?m=100200&v=0123456789abcdef&mini=1");
    expect(urlFotoMaterial("100200", REF1)).toBe("/api/estoque/foto?m=100200&v=0123456789abcdef");
  });
  it("foto extra leva o id em `f`; miniatura só quando existe", () => {
    expect(urlFotoMaterial("100200", REF2, true)).toBe(`/api/estoque/foto?m=100200&v=fedcba9876543210&f=${ID}`);
    expect(urlFotoMaterial("100200", REF2 + "&mini=1", true)).toBe(`/api/estoque/foto?m=100200&v=fedcba9876543210&f=${ID}&mini=1`);
  });
  it("foto do site antigo e referência inválida", () => {
    expect(urlFotoMaterial("100200", "fotos_materiais/100200.jpg")).toBe("/api/estoque/foto?m=100200&v=legado");
    expect(urlFotoMaterial("100200", "app/fotos/materiais/../x?v=1")).toBeNull();
    expect(urlFotoMaterial("100200", null)).toBeNull();
  });
});

describe("validação do endereço das fotos sugeridas", () => {
  it("só https, sem usuário e na porta padrão", () => {
    expect(urlSugestaoErro("http://www.exemplo.com.br/foto.jpg")).toBe("só https");
    expect(urlSugestaoErro("https://usuario:senha@www.exemplo.com.br/foto.jpg")).toBe("endereço com usuário");
    expect(urlSugestaoErro("https://www.exemplo.com.br:8443/foto.jpg")).toBe("porta diferente da padrão");
    expect(urlSugestaoErro("não é um endereço")).toBe("endereço inválido");
  });
  it("recusa localhost, IPs privados e reservados, IPv6 local e nomes sem ponto", () => {
    expect(urlSugestaoErro("https://localhost/a.jpg")).not.toBeNull();
    expect(urlSugestaoErro("https://servidor.localhost/a.jpg")).not.toBeNull();
    expect(urlSugestaoErro("https://127.0.0.1/a.jpg")).not.toBeNull();
    expect(urlSugestaoErro("https://10.1.2.3/a.jpg")).not.toBeNull();
    expect(urlSugestaoErro("https://192.168.0.5/a.jpg")).not.toBeNull();
    expect(urlSugestaoErro("https://169.254.169.254/latest")).not.toBeNull();
    expect(urlSugestaoErro("https://172.20.0.1/a.jpg")).not.toBeNull();
    expect(urlSugestaoErro("https://[::1]/a.jpg")).not.toBeNull();
    expect(urlSugestaoErro("https://[::ffff:127.0.0.1]/a.jpg")).not.toBeNull();
    expect(urlSugestaoErro("https://[fd00::1]/a.jpg")).not.toBeNull();
    expect(urlSugestaoErro("https://[fe80::1]/a.jpg")).not.toBeNull();
    expect(urlSugestaoErro("https://intranet/a.jpg")).toBe("nome sem ponto");
    expect(urlSugestaoErro("https://maquina.local/a.jpg")).not.toBeNull();
  });
  it("aceita host público", () => {
    expect(urlSugestaoErro("https://www.exemplo.com.br/produtos/foto.jpg")).toBeNull();
    expect(urlSugestaoErro("https://8.8.8.8/foto.jpg")).toBeNull();
    expect(urlSugestaoErro("https://[2606:4700::1111]/foto.jpg")).toBeNull();
  });
  it("classifica endereços IP", () => {
    expect(ipReservado("172.32.0.1")).toBe(false);
    expect(ipReservado("100.63.0.1")).toBe(false);
    expect(ipReservado("100.64.0.1")).toBe(true);
    expect(ipReservado("::ffff:8.8.8.8")).toBe(false);
    expect(ipReservado("2001:4860:4860::8888")).toBe(false);
    expect(ipReservado("2001:db8::1")).toBe(true);
    expect(ipReservado("nao-e-ip")).toBe(true);
  });
});

describe("sugestões do cadastro", () => {
  const cadastro = {
    sugestoes: [
      { url: "https://www.exemplo.com.br/a.jpg", pagina: "https://www.exemplo.com.br/a", titulo: "A" },
      { url: "http://www.exemplo.com.br/b.jpg", pagina: null, titulo: "B (http, fora)" },
      { url: "https://www.exemplo.com.br/c.jpg", pagina: "javascript:alert(1)", titulo: "C" },
    ],
    buscado_em: "2026-01-01T00:00:00+00:00",
  };
  it("só guarda https; a página fora de https vira null", () => {
    const lista = sugestoesDoItem(cadastro);
    expect(lista.map((s) => s.titulo)).toEqual(["A", "C"]);
    expect(lista[1].pagina).toBeNull();
    expect(sugestoesDoItem(undefined)).toEqual([]);
  });
  it("a tela recebe índice e chave, nunca o endereço da imagem", () => {
    const pub = publicas(sugestoesDoItem(cadastro));
    expect(pub[0]).toEqual({ i: 0, k: chaveSugestao("https://www.exemplo.com.br/a.jpg"), titulo: "A", pagina: "https://www.exemplo.com.br/a" });
    expect(JSON.stringify(pub)).not.toContain("a.jpg");
    expect(chaveSugestao("https://x.exemplo.com.br/a.jpg")).toMatch(/^[0-9a-f]{12}$/);
  });
});
