import { describe, expect, it } from "vitest";

import { programar } from "@/lib/paradas/motor";
import { alertas } from "@/lib/paradas/regras";
import { hashTexto } from "@/lib/wcm/util";

import { entradaGrande } from "./paradas-carga";

// assinaturas da saída do motor ANTES da otimização (mesma entrada fictícia): a otimização não pode mudar nada
const ANTES: Record<number, string> = { 4242: "gh8vd8:255549", 7: "lng8fj:254650" };

describe("motor — desempenho (~8 mil itens fictícios)", () => {
  it("mesma saída de antes da otimização, sem alertas", () => {
    for (const [semente, hash] of Object.entries(ANTES)) {
      const e = entradaGrande(Number(semente));
      expect(e.demandas.reduce((s, d) => s + d.itens.length, 0)).toBeGreaterThan(8000);
      const r = programar(e);
      expect(hashTexto(JSON.stringify(r))).toBe(hash);
      expect(alertas(r.linhas, e)).toEqual([]);
    }
  }, 60_000);

  it("roda bem abaixo de 1,5 s (meta do servidor: < 500 ms)", () => {
    const e = entradaGrande(4242);
    programar(e); // aquece
    const t = performance.now();
    programar(e);
    expect(performance.now() - t).toBeLessThan(1500);
  }, 60_000);
});
