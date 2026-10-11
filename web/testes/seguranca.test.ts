import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { validarSenha } from "../lib/auth/senha";
import { bloqueadoPor, limpar, registrarFalha } from "../lib/seguranca/limite";
import { origemConfere } from "../lib/seguranca/origem";

describe("política de senha", () => {
  it("exige 10+ caracteres com letras e números", () => {
    expect(validarSenha("abc123")).toMatch(/10 caracteres/);
    expect(validarSenha("somenteletras")).toMatch(/letras e números/);
    expect(validarSenha("1234567890123")).toMatch(/letras e números/);
    expect(validarSenha("Manut3ncao-F26")).toBe("");
  });
  it("barra senha comum e o próprio NP", () => {
    expect(validarSenha("Alpargatas1")).toMatch(/comum/);
    expect(validarSenha("x6178609abcd", "6178609")).toMatch(/NP/);
  });
  it("limita o tamanho", () => {
    expect(validarSenha("a1".repeat(70))).toMatch(/128/);
  });
});

describe("limite de tentativas", () => {
  const regra = { max: 3, janelaMs: 60_000 };
  it("bloqueia depois de max falhas e libera ao limpar", async () => {
    const k = `teste:${Math.random()}`;
    expect(await bloqueadoPor(k, regra)).toBe(0);
    for (let i = 0; i < 3; i++) await registrarFalha(k, regra);
    expect(await bloqueadoPor(k, regra)).toBeGreaterThan(0);
    await limpar(k);
    expect(await bloqueadoPor(k, regra)).toBe(0);
  });
  it("chaves diferentes não se afetam", async () => {
    const a = `teste:${Math.random()}`, b = `teste:${Math.random()}`;
    for (let i = 0; i < 3; i++) await registrarFalha(a, regra);
    expect(await bloqueadoPor(a, regra)).toBeGreaterThan(0);
    expect(await bloqueadoPor(b, regra)).toBe(0);
  });
});

describe("origem", () => {
  const h = (o: Record<string, string>) => new Headers(o);
  it("aceita o próprio site e pedido sem Origin", () => {
    expect(origemConfere(h({ origin: "https://site.vercel.app" }), "site.vercel.app")).toBe(true);
    expect(origemConfere(h({}), "site.vercel.app")).toBe(true);
  });
  it("recusa outro site e origem inválida", () => {
    expect(origemConfere(h({ origin: "https://mal.com" }), "site.vercel.app")).toBe(false);
    expect(origemConfere(h({ origin: "isso nao e url" }), "site.vercel.app")).toBe(false);
    expect(origemConfere(h({ origin: "null" }), "site.vercel.app")).toBe(false);
  });
});
