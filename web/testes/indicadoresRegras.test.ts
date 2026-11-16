import { describe, expect, it } from "vitest";

import * as ind from "@/lib/wcm/indicadores";

/** Regras dos indicadores (só dados fictícios). */
describe("farol: sem dados × sem meta", () => {
  const mtbf = ind.POR_ID.mtbf;
  it("sem valor e com meta: 'Sem dados' (a meta continua valendo)", () => {
    const f = ind.farol(mtbf, null, 60);
    expect(f).toBe("neutro");
    expect(ind.nomeFarol(f, null)).toBe("Sem dados");
    expect(ind.meta(mtbf, {})).toBe(60);
  });
  it("com valor e sem meta: 'Sem meta'", () => {
    const f = ind.farol(mtbf, 30, null);
    expect(ind.nomeFarol(f, 30)).toBe("Sem meta");
  });
  it("sem valor e sem meta: 'Sem dados'", () => expect(ind.nomeFarol(ind.farol(mtbf, null, null), null)).toBe("Sem dados"));
  it("com valor e meta: o nome do farol", () => {
    expect(ind.nomeFarol(ind.farol(mtbf, 70, 60), 70)).toBe("Na meta");
    expect(ind.nomeFarol(ind.farol(mtbf, 10, 60), 10)).toBe("Fora da meta");
  });
});
