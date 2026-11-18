import { describe, expect, it } from "vitest";

import { FRASES, fraseDoDia, hojeBrasil } from "@/lib/frasesDoDia";

const somar = (data: string, dias: number) => new Date(Date.parse(`${data}T12:00:00Z`) + dias * 86_400_000).toISOString().slice(0, 10);

describe("frase do dia do astronauta", () => {
  it("é sempre a mesma no mesmo dia", () => {
    expect(fraseDoDia("2026-11-18")).toBe(fraseDoDia("2026-11-18"));
    expect(FRASES).toContain(fraseDoDia("2026-11-18"));
  });

  it("nunca repete em dias seguidos (5 anos)", () => {
    let antes = fraseDoDia("2026-01-01");
    for (let i = 1; i < 365 * 5; i++) {
      const agora = fraseDoDia(somar("2026-01-01", i));
      expect(agora).not.toBe(antes);
      antes = agora;
    }
  });

  it("dentro de cada volta, todas as frases saem uma vez", () => {
    const n = FRASES.length;
    const inicio = new Date(Math.ceil(Date.parse("2026-11-18T12:00:00Z") / 86_400_000 / n) * n * 86_400_000).toISOString().slice(0, 10);
    const vistas = new Set(Array.from({ length: n }, (_, i) => fraseDoDia(somar(inicio, i))));
    expect(vistas.size).toBe(n);
  });

  it("usa a data de Brasília", () => {
    // 02:30 UTC de 19/11 ainda é 18/11 em Brasília
    expect(hojeBrasil(new Date("2026-11-19T02:30:00Z"))).toBe("2026-11-18");
  });
});
