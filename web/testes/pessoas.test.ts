import { beforeEach, describe, expect, it, vi } from "vitest";

/** Filtro "Pessoas (requisições)" da aba Custos: validação e gravação do padrão (dados fictícios). */
const gravados: { nome: string; itens: Record<string, unknown>; mesclar: boolean }[] = [];
let editor = true;
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/lib/auth/sessao", () => ({ autorizar: async () => (editor ? { login: "x", nome: "Fulano" } : null) }));
vi.mock("@/lib/dados/cadastros", () => ({
  gravarCadastroLote: async (nome: string, itens: Record<string, unknown>, _u: string, mesclar = false) => { gravados.push({ nome, itens, mesclar }); },
}));

const acoes = await import("@/app/(app)/custos/acoes");
const val = await import("@/app/(app)/custos/validacao");

describe("validarSolicitantes (pessoas do padrão)", () => {
  it("aceita lista vazia e até 50 nomes", () => {
    expect(val.validarSolicitantes([])).toBe("");
    expect(val.validarSolicitantes(["Pessoa Teste A", "Fulano de Tal"])).toBe("");
    expect(val.validarSolicitantes(Array.from({ length: 50 }, (_, i) => `Pessoa ${i}`))).toBe("");
  });
  it("recusa 51 nomes, vazio, repetido pela chave, só símbolos, nome longo e tipo errado", () => {
    expect(val.validarSolicitantes(Array.from({ length: 51 }, (_, i) => `Pessoa ${i}`))).not.toBe("");
    expect(val.validarSolicitantes([""])).not.toBe("");
    expect(val.validarSolicitantes(["   "])).not.toBe("");
    expect(val.validarSolicitantes(["---"])).not.toBe("");
    expect(val.validarSolicitantes(["x".repeat(121)])).not.toBe("");
    expect(val.validarSolicitantes(["Pessoa Teste A", "pessoa  teste a"])).not.toBe("");
    expect(val.validarSolicitantes("Pessoa Teste A" as unknown as string[])).not.toBe("");
    expect(val.validarSolicitantes([42 as unknown as string])).not.toBe("");
  });
});

describe("salvarPessoasPadrao (ação)", () => {
  beforeEach(() => { gravados.length = 0; editor = true; });

  it("editor grava _solicitantes no metas_wcm.json, sem mesclar, com os nomes aparados", async () => {
    expect((await acoes.salvarPessoasPadrao(["  Pessoa Teste A ", "Fulano de Tal"])).erro).toBe("");
    expect((await acoes.salvarPessoasPadrao([])).erro).toBe("");
    expect(gravados).toEqual([
      { nome: "metas_wcm.json", itens: { _solicitantes: { nomes: ["Pessoa Teste A", "Fulano de Tal"] } }, mesclar: false },
      { nome: "metas_wcm.json", itens: { _solicitantes: { nomes: [] } }, mesclar: false },
    ]);
  });

  it("recusa lista inválida sem gravar", async () => {
    expect((await acoes.salvarPessoasPadrao(["Pessoa Teste A", "pessoa teste a"])).erro).not.toBe("");
    expect((await acoes.salvarPessoasPadrao(Array.from({ length: 51 }, (_, i) => `Pessoa ${i}`))).erro).not.toBe("");
    expect(gravados).toHaveLength(0);
  });

  it("leitor recebe a mensagem de permissão e nada é gravado", async () => {
    editor = false;
    expect(await acoes.salvarPessoasPadrao(["Pessoa Teste A"])).toEqual({ erro: "Só editores e administradores salvam o padrão.", ok: "" });
    expect(gravados).toHaveLength(0);
  });
});
