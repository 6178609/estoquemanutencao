import { describe, expect, it } from "vitest";

import { alertasInicio, type EntradaInicio } from "@/lib/wcm/inicio";

/** Alertas do Início (dados fictícios). */
describe("alertasInicio", () => {
  it("tudo zero não gera alerta", () => {
    const e: EntradaInicio = {
      ordens: { atrasadas: 0, altaPrioridade: 0 },
      estoque: { abaixo: 0, zerados: 0 },
      reciclagens: { vencendo: 0, vencidas: 0, titulos: [] },
    };
    expect(alertasInicio(e)).toEqual([]);
  });

  it("ordem por nível: crítico, sério, atenção — mesmo que a entrada venha fora de ordem", () => {
    const e: EntradaInicio = {
      reciclagens: { vencendo: 1, vencidas: 0, titulos: ["NR-10"] },
      estoque: { abaixo: 2, zerados: 1 },
      ordens: { atrasadas: 4, altaPrioridade: 1 },
    };
    expect(alertasInicio(e).map((a) => a.nivel)).toEqual(["critico", "serio", "atencao"]);
    expect(alertasInicio(e).map((a) => a.id)).toEqual(["ordens", "estoque", "reciclagens"]);
  });

  it("bloco null (sem acesso ou sem base) não gera alerta", () => {
    const e: EntradaInicio = { ordens: null, estoque: null, reciclagens: { vencendo: 0, vencidas: 2, titulos: [] } };
    const r = alertasInicio(e);
    expect(r.map((a) => a.id)).toEqual(["reciclagens"]);
    expect(alertasInicio({ ordens: { atrasadas: 3, altaPrioridade: 0 } }).map((a) => a.id)).toEqual(["ordens"]);
  });

  it("detalhe de ordens cita a quantidade de alta prioridade e aponta para as atrasadas", () => {
    const [a] = alertasInicio({ ordens: { atrasadas: 12, altaPrioridade: 3 } });
    expect(a.numero).toBe(12);
    expect(a.detalhe).toContain("3 de alta prioridade");
    expect(a.detalhe).toContain("alta prioridade");
    expect(a.href).toBe("/ordens?atr=1");
  });

  it("detalhe de reciclagens cita até 2 títulos", () => {
    const [a] = alertasInicio({ reciclagens: { vencendo: 2, vencidas: 2, titulos: ["NR-10", "NR-35", "Primeiros socorros"] } });
    expect(a.numero).toBe(4);
    expect(a.nivel).toBe("atencao");
    expect(a.href).toBe("/treinamentos_ferias");
    expect(a.detalhe).toContain("NR-10");
    expect(a.detalhe).toContain("NR-35");
    expect(a.detalhe).not.toContain("Primeiros socorros");
  });

  it("estoque soma abaixo do mínimo e zerados e leva a /estoque", () => {
    const [a] = alertasInicio({ estoque: { abaixo: 5, zerados: 2 } });
    expect(a).toMatchObject({ id: "estoque", nivel: "serio", numero: 7, href: "/estoque" });
  });
});
