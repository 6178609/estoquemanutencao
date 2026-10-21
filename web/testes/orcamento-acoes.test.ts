import { beforeEach, describe, expect, it, vi } from "vitest";

/** Ação do valor disponível: formato do metas_wcm.json e permissão (dados fictícios). */
const gravados: { nome: string; itens: Record<string, unknown>; mesclar: boolean }[] = [];
let editor = true;
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/lib/auth/sessao", () => ({ autorizar: async () => (editor ? { login: "x", nome: "Fulano" } : null) }));
vi.mock("@/lib/dados/cadastros", () => ({
  gravarCadastroLote: async (nome: string, itens: Record<string, unknown>, _u: string, mesclar = false) => { gravados.push({ nome, itens, mesclar }); },
}));

const acoes = await import("@/app/(app)/custos/acoes");

describe("valor disponível (ação)", () => {
  beforeEach(() => { gravados.length = 0; editor = true; });

  it("editor grava os 12 meses do ano, sem mesclar", async () => {
    const r = await acoes.salvarOrcamento(2026, [1000, ...Array(11).fill(null)]);
    expect(r).toEqual({ erro: "", ok: "Valor disponível salvo." });
    expect(gravados).toHaveLength(1);
    expect(gravados[0].nome).toBe("metas_wcm.json");
    expect(gravados[0].mesclar).toBe(false);
    const itens = gravados[0].itens;
    expect(Object.keys(itens)).toHaveLength(12);
    expect(itens).toEqual({
      "orcamento:2026-01": { valor: 1000 },
      "orcamento:2026-02": null,
      "orcamento:2026-03": null,
      "orcamento:2026-04": null,
      "orcamento:2026-05": null,
      "orcamento:2026-06": null,
      "orcamento:2026-07": null,
      "orcamento:2026-08": null,
      "orcamento:2026-09": null,
      "orcamento:2026-10": null,
      "orcamento:2026-11": null,
      "orcamento:2026-12": null,
    });
  });

  it("arredonda para 2 casas e recusa valores inválidos sem gravar", async () => {
    await acoes.salvarOrcamento(2026, [1000.456, ...Array(11).fill(null)]);
    expect(gravados[0].itens["orcamento:2026-01"]).toEqual({ valor: 1000.46 });
    const r = await acoes.salvarOrcamento(1999, Array(12).fill(null));
    expect(r.erro).not.toBe("");
    expect((await acoes.salvarOrcamento(2026, Array(11).fill(null))).erro).not.toBe("");
    expect(gravados).toHaveLength(1);
  });

  it("leitor recebe erro de permissão e nada é gravado", async () => {
    editor = false;
    const r = await acoes.salvarOrcamento(2026, Array(12).fill(null));
    expect(r).toEqual({ erro: "Só editores e administradores lançam o valor disponível.", ok: "" });
    expect(gravados).toHaveLength(0);
  });
});
