import { beforeEach, describe, expect, it, vi } from "vitest";

/** Gravações da aba Metas: formato do metas_wcm.json (dados fictícios). */
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
  it("custo da produção parada: valida, arredonda a 2 casas e apaga com null", async () => {
    const val = await import("@/app/(app)/metas/validacao");
    expect(val.validarCustoParada(12.5, 150)).toBe("");
    expect(val.validarCustoParada(null, null)).toBe("");
    expect(val.validarCustoParada(-1, 10)).not.toBe("");
    expect(val.validarCustoParada(10, 1e6)).not.toBe("");
    expect(val.validarCustoParada(10001, null)).not.toBe("");

    expect((await acoes.salvarCustoParada(12.567, 150)).erro).toBe("");
    expect((await acoes.salvarCustoParada(null, null)).erro).toBe("");
    expect((await acoes.salvarCustoParada(0, 0)).erro).toBe("");
    expect(gravados.map((g) => [g.nome, g.itens, g.mesclar])).toEqual([
      ["metas_wcm.json", { _parametros: { custo_par: 12.57, pares_hora: 150 } }, true],
      ["metas_wcm.json", { _parametros: { custo_par: null, pares_hora: null } }, true],
      ["metas_wcm.json", { _parametros: { custo_par: null, pares_hora: null } }, true],
    ]);
    expect((await acoes.salvarCustoParada(-1, 10)).erro).not.toBe("");
    expect(gravados).toHaveLength(3);
  });
  it("leitor não grava", async () => {
    editor = false;
    expect((await acoes.salvarMetas({ mttr: 1 })).erro).toMatch(/editores/);
    expect(gravados).toHaveLength(0);
    expect((await acoes.salvarCustoParada(1, 1)).erro).toMatch(/editores/);
  });
});

describe("pessoas da manutenção (Metas e parâmetros)", () => {
  beforeEach(() => { gravados.length = 0; editor = true; });
  it("validação: até 50 nomes, 1 a 120 caracteres, sem repetidos pela chave", async () => {
    const val = await import("@/app/(app)/metas/validacao");
    expect(val.validarSolicitantes([])).toBe("");
    expect(val.validarSolicitantes(["Pessoa Teste A", "Fulano de Tal"])).toBe("");
    expect(val.validarSolicitantes(Array.from({ length: 50 }, (_, i) => `Pessoa ${i}`))).toBe("");
    expect(val.validarSolicitantes(Array.from({ length: 51 }, (_, i) => `Pessoa ${i}`))).not.toBe("");
    expect(val.validarSolicitantes([""])).not.toBe("");
    expect(val.validarSolicitantes(["   "])).not.toBe("");
    expect(val.validarSolicitantes(["x".repeat(121)])).not.toBe("");
    expect(val.validarSolicitantes(["Pessoa Teste A", "pessoa  teste a"])).not.toBe("");
    expect(val.validarSolicitantes("Pessoa Teste A" as unknown as string[])).not.toBe("");
    expect(val.validarSolicitantes([42 as unknown as string])).not.toBe("");
  });
  it("salvarSolicitantes grava a lista inteira (sem mesclar)", async () => {
    expect((await acoes.salvarSolicitantes(["  Pessoa Teste A ", "Fulano de Tal"])).erro).toBe("");
    expect((await acoes.salvarSolicitantes([])).erro).toBe("");
    expect(gravados).toEqual([
      { nome: "metas_wcm.json", itens: { _solicitantes: { nomes: ["Pessoa Teste A", "Fulano de Tal"] } }, mesclar: false },
      { nome: "metas_wcm.json", itens: { _solicitantes: { nomes: [] } }, mesclar: false },
    ]);
  });
  it("salvarSolicitantes recusa lista inválida e leitor não grava", async () => {
    expect((await acoes.salvarSolicitantes(["Pessoa Teste A", "pessoa teste a"])).erro).not.toBe("");
    expect(gravados).toHaveLength(0);
    editor = false;
    expect((await acoes.salvarSolicitantes(["Pessoa Teste A"])).erro).toMatch(/editores/);
    expect(gravados).toHaveLength(0);
  });
});
