import { describe, expect, it } from "vitest";

import { FRASES, proximaFrase } from "@/lib/frasesAstronauta";

/** Gerador repetível para os testes. */
function gerador(semente: number) {
  let s = semente;
  return () => ((s = (s * 16807) % 2147483647) / 2147483647);
}

describe("frases do astronauta (aleatórias a cada balão, sem repetir)", () => {
  it("cada volta mostra todas as frases uma vez", () => {
    const rnd = gerador(7);
    let estado: unknown = null;
    const vistas = new Set<number>();
    for (let i = 0; i < FRASES.length; i++) {
      const r = proximaFrase(estado, rnd);
      vistas.add(r.indice);
      estado = r.estado;
    }
    expect(vistas.size).toBe(FRASES.length);
  });

  it("nunca repete duas seguidas, nem na virada de volta (20 voltas)", () => {
    const rnd = gerador(3);
    let estado: unknown = null;
    let antes = -1;
    for (let i = 0; i < FRASES.length * 20; i++) {
      const r = proximaFrase(estado, rnd);
      expect(r.indice).not.toBe(antes);
      antes = r.indice;
      estado = r.estado;
    }
  });

  it("estado guardado inválido ou de outra lista recomeça o sorteio", () => {
    for (const ruim of [null, "x", { ordem: [1, 1], pos: 0 }, { ordem: [0, 1], pos: 0 }, { ordem: [], pos: -1 }]) {
      const r = proximaFrase(ruim, gerador(1));
      expect(r.indice).toBeGreaterThanOrEqual(0);
      expect(r.indice).toBeLessThan(FRASES.length);
      expect(r.estado.ordem).toHaveLength(FRASES.length);
    }
  });

  it("continua de onde parou (recarregar a página não repete)", () => {
    const a = proximaFrase(null, gerador(9));
    const b = proximaFrase(JSON.parse(JSON.stringify(a.estado)), gerador(9));
    expect(b.indice).toBe(a.estado.ordem[1]);
  });
});
