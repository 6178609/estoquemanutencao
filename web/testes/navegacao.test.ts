import { describe, expect, it } from "vitest";

import { GRUPOS } from "@/lib/navegacao";

describe("menu lateral", () => {
  it("Qualidade dos dados aparece no grupo Configuração (explica os “—” das telas)", () => {
    const config = GRUPOS.find((g) => g.titulo === "Configuração");
    const qualidade = config?.abas.find((a) => a.id === "qualidade");
    expect(qualidade).toBeDefined();
    expect(qualidade?.oculta).toBeFalsy();
    expect(qualidade?.rota).toBe("/qualidade");
  });
});
