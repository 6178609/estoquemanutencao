import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import * as R from "@/lib/cartao/regras";

/** Só dados fictícios. */
const HOJE = "2026-10-20";
const g = (x: Partial<R.Gasto> = {}): R.Gasto => ({
  id: "aaaaaa1", data: "2026-10-05", valor: 100, estabelecimento: "Loja Teste", descricao: "Rolamento", categoria: "Peças / material",
  documento: "123", ordem: "", centroCusto: "", status: R.LANCADO, em: "2026-10-05T10:00:00Z", por: "Fulano Teste", ...x,
});
const bloco = (x: Partial<R.Bloco> = {}): R.Bloco => ({ id: "bloco01", nome: "Portador Teste", login: "1234", ativo: true, criadoEm: "", gastos: [], ...x });
const PORTADOR: R.Papel = { login: "1234", confere: false };
const CONFERE: R.Papel = { login: "9999", confere: true };

describe("cartão: validação do lançamento", () => {
  const base = { data: "2026-10-05", valor: "1.234,56", estabelecimento: "Loja", descricao: "Correia", categoria: "Peças / material" };

  it("aceita valor brasileiro e normaliza", () => {
    const r = R.validarGasto({ ...base, ordem: " 32220059 ", centroCusto: "a0265011" }, HOJE);
    expect(r).toEqual({ campos: { data: "2026-10-05", valor: 1234.56, estabelecimento: "Loja", descricao: "Correia",
      categoria: "Peças / material", documento: "", ordem: "32220059", centroCusto: "A0265011" } });
    expect(R.valorDe("R$ 89,90")).toBe(89.9);
    expect(R.valorDe("12.5")).toBe(12.5);
    expect(R.valorDe("abc")).toBeNaN();
  });

  it("recusa o que falta ou não faz sentido", () => {
    expect(R.validarGasto({ ...base, data: "2026-10-21" }, HOJE)).toEqual({ erro: "A data da compra não pode ser no futuro." });
    expect(R.validarGasto({ ...base, data: "2026-02-30" }, HOJE)).toHaveProperty("erro");
    expect(R.validarGasto({ ...base, valor: "0" }, HOJE)).toHaveProperty("erro");
    expect(R.validarGasto({ ...base, estabelecimento: " " }, HOJE)).toHaveProperty("erro");
    expect(R.validarGasto({ ...base, categoria: "Viagem" }, HOJE)).toHaveProperty("erro");
    expect(R.validarGasto({ ...base, ordem: "OM-1" }, HOJE)).toHaveProperty("erro");
  });
});

describe("cartão: quem pode o quê", () => {
  const fechados = new Set(["2026-09"]);

  it("só o portador lança e altera, e só o que está lançado e em mês aberto", () => {
    const b = bloco();
    expect(R.bloqueioDeEdicao(PORTADOR, b, null, fechados, "2026-10")).toBe("");
    expect(R.bloqueioDeEdicao({ login: "1234".toUpperCase(), confere: false }, b, null, fechados)).toBe("");
    expect(R.bloqueioDeEdicao(CONFERE, b, null, fechados)).toMatch(/Só o portador/);
    expect(R.bloqueioDeEdicao(PORTADOR, b, g({ status: R.CONFERIDO }), fechados)).toMatch(/conferido/);
    expect(R.bloqueioDeEdicao(PORTADOR, b, g({ data: "2026-09-30" }), fechados)).toMatch(/fechado/);
    expect(R.bloqueioDeEdicao(PORTADOR, b, null, fechados, "2026-09")).toMatch(/fechado/);
    expect(R.bloqueioDeEdicao(PORTADOR, bloco({ ativo: false }), null, fechados)).toMatch(/desativado/);
  });

  it("só quem confere confere, fora de mês fechado", () => {
    expect(R.bloqueioDeConferencia(CONFERE, g(), new Set())).toBe("");
    expect(R.bloqueioDeConferencia(PORTADOR, g(), new Set())).toMatch(/Só Líder/);
    expect(R.bloqueioDeConferencia(CONFERE, g({ data: "2026-09-01" }), new Set(["2026-09"]))).toMatch(/fechado/);
    expect(R.bloqueioDeConferencia(CONFERE, g(), new Set(), bloco({ login: "9999" }))).toMatch(/outra pessoa/);
    expect(R.bloqueioDeConferencia(CONFERE, g(), new Set(), bloco())).toBe("");
  });

  it("o portador vê só o próprio bloco; quem confere vê todos", () => {
    const bs = [bloco(), bloco({ id: "bloco02", login: "5555", nome: "Outro" })];
    expect(R.blocosVisiveis(PORTADOR, bs).map((b) => b.id)).toEqual(["bloco01"]);
    expect(R.blocosVisiveis(CONFERE, bs)).toHaveLength(2);
  });
});

describe("cartão: leitura do cadastro e resumos", () => {
  it("lê só blocos e gastos de forma válida; meses fechados à parte", () => {
    const cad = {
      bloco01: { nome: "Portador Teste", login: "1234", gastos: [g(), { id: "x", data: "ontem", valor: "a" }, g({ id: "aaaaaa2", status: "?" as never })] },
      "../ruim": { nome: "Ruim", login: "1" },
      bloco03: { nome: "", login: "2" },
      [R.CHAVE_MESES]: { fechados: ["2026-09", "lixo"] },
    };
    const bs = R.blocosDe(cad);
    expect(bs.map((b) => b.id)).toEqual(["bloco01"]);
    expect(bs[0].gastos.map((x) => x.id)).toEqual(["aaaaaa1", "aaaaaa2"]);
    expect(bs[0].gastos[1].status).toBe(R.LANCADO);
    expect([...R.mesesFechados(cad)]).toEqual(["2026-09"]);
  });

  it("resumo do mês sem os recusados; sem cupom e por categoria", () => {
    const gs = [g(), g({ id: "aaaaaa2", valor: 50, status: R.CONFERIDO, cupom: { nome: "c.pdf", tipo: "application/pdf", tamanho: 10 } }),
      g({ id: "aaaaaa3", valor: 30, status: R.RECUSADO, categoria: "Alimentação" }), g({ id: "aaaaaa4", data: "2026-09-01" })];
    const mes = R.doMes(gs, "2026-10");
    expect(mes).toHaveLength(3);
    expect(R.resumo(mes)).toEqual({ total: 180, gastos: 3, lancados: 1, conferidos: 1, recusados: 1, semCupom: 1, valido: 150 });
    expect(R.porCategoria(mes)).toEqual([["Peças / material", 150]]);
    expect(R.mesesComGasto([bloco({ gastos: gs })], "2026-11")).toEqual(["2026-11", "2026-10", "2026-09"]);
    expect(R.rotuloMes("2026-10")).toBe("out/2026");
  });

  it("planilha do mês: separador ;, BOM e texto que viraria fórmula neutralizado", () => {
    const csv = R.csvMes([bloco({ gastos: [g({ descricao: "=HYPERLINK(1)", valor: 89.9 })] })], "2026-10");
    expect(csv.startsWith("﻿")).toBe(true);
    expect(csv).toContain('"Portador Teste";"05/10/2026";"89,90";"Loja Teste";"\'=HYPERLINK(1)"');
  });
});

describe("cartão: fluxo gravado (demonstração, na memória)", async () => {
  const { afterAll, beforeAll } = await import("vitest");
  const { _definirFonte } = await import("@/lib/dados/fonte");
  const { _definirSupabase } = await import("@/lib/dados/supabase");
  const { gravarCadastroLote } = await import("@/lib/dados/cadastros");
  const C = await import("@/lib/cartao/dados");
  beforeAll(() => { _definirFonte(null); _definirSupabase(null); });
  afterAll(() => { _definirFonte(undefined); _definirSupabase(undefined); });
  const PDF = new TextEncoder().encode("%PDF-1.4\n% teste\n");
  const hoje = C.hojeBr();
  const entrada = { data: hoje, valor: "45,50", estabelecimento: "Loja Teste", descricao: "Graxa", categoria: "Peças / material" };

  it("lança com cupom, confere, fecha o mês e bloqueia alterações", async () => {
    await gravarCadastroLote(R.ARQ_CARTAO, { blocoaa1: { nome: "Portador Teste", login: "1234", ativo: true, criadoEm: "", gastos: [] } }, "teste");
    await C.lancarGasto(PORTADOR, "blocoaa1", entrada, { nome: "cupom.pdf", bytes: PDF }, "Portador Teste");
    await expect(C.lancarGasto(CONFERE, "blocoaa1", entrada, null, "Outro")).rejects.toThrow(/Só o portador/);
    const b = (await C.lerCartao(true)).blocos.find((x) => x.id === "blocoaa1")!;
    expect(b.gastos).toHaveLength(1);
    const id = b.gastos[0].id;
    expect(b.gastos[0]).toMatchObject({ valor: 45.5, status: R.LANCADO, cupom: { tipo: "application/pdf" } });
    expect((await C.lerCupom(PORTADOR, "blocoaa1", id))?.tipo).toBe("application/pdf");
    expect(await C.lerCupom({ login: "5555", confere: false }, "blocoaa1", id)).toBeNull();

    await expect(C.conferirGasto(PORTADOR, "blocoaa1", id, R.CONFERIDO, "", "x")).rejects.toThrow(/Só Líder/);
    await expect(C.conferirGasto(CONFERE, "blocoaa1", id, R.RECUSADO, "", "x")).rejects.toThrow(/motivo/);
    await C.conferirGasto(CONFERE, "blocoaa1", id, R.CONFERIDO, "", "Conferente");
    await expect(C.excluirGasto(PORTADOR, "blocoaa1", id, "x")).rejects.toThrow(/conferido/);

    await C.fecharMes({ ...CONFERE, admin: false }, R.mesDe(hoje), true, "Conferente");
    await expect(C.lancarGasto(PORTADOR, "blocoaa1", entrada, null, "x")).rejects.toThrow(/fechado/);
    await expect(C.fecharMes({ ...CONFERE, admin: false }, R.mesDe(hoje), false, "x")).rejects.toThrow(/administrador/);
    await C.fecharMes({ ...CONFERE, admin: true }, R.mesDe(hoje), false, "Admin");
    expect((await C.lerCartao(true)).fechados.has(R.mesDe(hoje))).toBe(false);
  });

  it("trocar o cupom grava num arquivo novo; quem confere é pela função (mesmo com lista de abas)", async () => {
    await C.lancarGasto(PORTADOR, "blocoaa1", { ...entrada, valor: "7" }, { nome: "a.pdf", bytes: PDF }, "Portador Teste");
    let g7 = (await C.lerCartao(true)).blocos[0].gastos.find((x) => x.valor === 7)!;
    const PDF2 = new TextEncoder().encode("%PDF-1.4\n% segundo\n");
    await C.editarGasto(PORTADOR, "blocoaa1", g7.id, { ...entrada, valor: "7" }, { nome: "b.pdf", bytes: PDF2 }, "Portador Teste");
    g7 = (await C.lerCartao(true)).blocos[0].gastos.find((x) => x.valor === 7)!;
    expect(g7.cupom?.arquivo).not.toBe(g7.id);
    expect(new TextDecoder().decode((await C.lerCupom(PORTADOR, "blocoaa1", g7.id))!.bytes)).toContain("segundo");
    expect(C.papelDe({ login: "1", funcao: "lider", abas: ["cartao"] }).confere).toBe(true);
    expect(C.papelDe({ login: "1", funcao: "", perfil: "editor", abas: ["painel", "cartao"] }).confere).toBe(false);
    expect(C.papelDe({ login: "1", funcao: "manutentor", perfil: "admin" }).confere).toBe(false);
    await expect(C.fecharMes({ ...CONFERE, admin: false }, "2999-01", true, "x")).rejects.toThrow(/mês atual/);
  });

  it("sem cupom não confere; recusa com motivo; arquivo que não é PDF/imagem é recusado", async () => {
    await C.lancarGasto(PORTADOR, "blocoaa1", { ...entrada, valor: "10" }, null, "Portador Teste");
    const b = (await C.lerCartao(true)).blocos.find((x) => x.id === "blocoaa1")!;
    const sem = b.gastos.find((x) => x.valor === 10)!;
    await expect(C.conferirGasto(CONFERE, "blocoaa1", sem.id, R.CONFERIDO, "", "x")).rejects.toThrow(/cupom/);
    await C.conferirGasto(CONFERE, "blocoaa1", sem.id, R.RECUSADO, "Sem nota", "Conferente");
    await expect(C.lancarGasto(PORTADOR, "blocoaa1", entrada, { nome: "x.exe", bytes: new Uint8Array([77, 90, 0, 0]) }, "x")).rejects.toThrow(/PDF ou foto/);
  });
});
