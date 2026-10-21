import { describe, expect, it } from "vitest";

import { lerBr, mostrarBr } from "@/lib/numeroBr";

/** Leitura e escrita de números em pt-BR (dados fictícios). */
describe("números pt-BR", () => {
  it("ida e volta preserva o valor (milhar com ponto não vira decimal)", () => {
    for (const x of [1000, 50000, 1234.56, 0.5, 19.4, 1200]) {
      expect(lerBr(mostrarBr(x)), String(x)).toBe(x);
    }
  });
  it("lê milhar, decimal com vírgula e decimal com ponto", () => {
    expect(lerBr("1.234")).toBe(1234);
    expect(lerBr("1.234,56")).toBe(1234.56);
    expect(lerBr("4,5")).toBe(4.5);
    expect(lerBr("4.5")).toBe(4.5);
    expect(lerBr(" 1 234 ")).toBe(1234);
    expect(lerBr("0.125")).toBe(0.125);
    expect(lerBr("1.250")).toBe(1250);
    expect(lerBr("1.250,50")).toBe(1250.5);
  });
  it("vazio é null; texto e negativo são NaN", () => {
    expect(lerBr("")).toBeNull();
    expect(lerBr("   ")).toBeNull();
    expect(lerBr("abc")).toBeNaN();
    expect(lerBr("-3")).toBeNaN();
  });
  it("mostra vazio para null", () => {
    expect(mostrarBr(null)).toBe("");
    expect(mostrarBr(undefined)).toBe("");
  });
});
