import { beforeEach, describe, expect, it, vi } from "vitest";

/** Gravações da aba Metas: o mesmo formato do metas_wcm.json do app Streamlit (dados fictícios). */
const gravados: { nome: string; itens: Record<string, unknown>; mesclar: boolean }[] = [];
let editor = true;
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/lib/auth/sessao", () => ({ autorizar: async () => (editor ? { login: "x", nome: "Fulano" } : null) }));
vi.mock("@/lib/dados/cadastros", () => ({
  gravarCadastroLote: async (nome: string, itens: Record<string, unknown>, _u: string, mesclar = false) => { gravados.push({ nome, itens, mesclar }); },
  lerCadastro: async () => ({ mttr: { meta: 3 }, capacidade: { hh: 1 } }),
}));

const acoes = await import("@/app/(app)/metas/acoes");

describe("metas", () => {
  beforeEach(() => { gravados.length = 0; editor = true; });
  it("metas: {id: {meta}} mesclando; vazio grava ''", async () => {
    expect((await acoes.salvarMetas({ mttr: 3.5, quebras: null })).erro).toBe("");
    expect(gravados[0]).toEqual({ nome: "metas_wcm.json", itens: { mttr: { meta: 3.5 }, quebras: { meta: "" } }, mesclar: true });
    expect((await acoes.salvarMetas({ inventado: 1 })).erro).toMatch(/desconhecido/);
    expect((await acoes.salvarMetas({ mttr: -1 })).erro).toMatch(/inválida/);
  });
  it("restaurar remove só os indicadores personalizados", async () => {
    await acoes.restaurarMetas();
    expect(gravados[0]).toEqual({ nome: "metas_wcm.json", itens: { mttr: null }, mesclar: false });
  });
  it("jornada, capacidade e tipos", async () => {
    await acoes.salvarJornada(40);
    await acoes.salvarCapacidades({ MEC: 120, ELE: null });
    await acoes.salvarTipos({ YM11: { descricao: "Corretiva Emergencial", classe: "Emergencial" } });
    expect(gravados.map((g) => [g.itens, g.mesclar])).toEqual([
      [{ _parametros: { horas_semana: 40 } }, true],
      [{ "capacidade:MEC": { hh: 120 }, "capacidade:ELE": null }, false],
      [{ "tipo:YM11": { descricao: "Corretiva Emergencial", classe: "Emergencial" } }, true],
    ]);
    expect((await acoes.salvarJornada(0)).erro).not.toBe("");
    expect((await acoes.salvarTipos({ YM11: { descricao: "", classe: "Xyz" } })).erro).toMatch(/Classe/);
  });
  it("leitor não grava", async () => {
    editor = false;
    expect((await acoes.salvarMetas({ mttr: 1 })).erro).toMatch(/editores/);
    expect(gravados).toHaveLength(0);
  });
});
