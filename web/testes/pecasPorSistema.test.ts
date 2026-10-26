import { describe, expect, it } from "vitest";

import { GERAL, gruposPorSistema, rotuloSistema } from "@/lib/wcm/pecasPorSistema";

/** Só dados fictícios. */
describe("peças por sistema", () => {
  it("nome curto do sistema", () => {
    expect(rotuloSistema("INJ PVC 06 GOLDEN - SISTEMA DE AQUECIMEN")).toBe("Aquecimento");
    expect(rotuloSistema("INJ PVC 07 GOLDEN - SISTEMA COMAN_FORCA")).toBe("Comando e força");
    expect(rotuloSistema("INJ PVC 06 GOLDEN - UNIDADE HIDRÁULICA")).toBe("Unidade hidráulica");
    expect(rotuloSistema("MOI. LAMIN. SF05 UGB1 - REDUTOR")).toBe("Redutor");
    expect(rotuloSistema("PAINEL X")).toBe("Painel x");
  });

  const equips = [
    { equipamento: "M", denominacao: "MAQUINA" },
    { equipamento: "H", denominacao: "M - SISTEMA HIDRAULICO", superior: "M" },
    { equipamento: "U", denominacao: "M - UNIDADE HIDRÁULICA", superior: "H" },
    { equipamento: "A", denominacao: "M - SISTEMA DE AQUECIMEN", superior: "M" },
    { equipamento: "V", denominacao: "M - SISTEMA VAZIO", superior: "M" },
    { equipamento: "X", denominacao: "M - SISTEMA INATIVO", superior: "M", inativo: true },
  ];
  const mats: Record<string, string[]> = { M: ["1", "2", "3", "9"], H: ["1"], U: ["2", "1"], A: ["3"], X: ["9"] };

  it("um grupo por subconjunto (com os de baixo) e Geral com o resto", () => {
    const g = gruposPorSistema("M", equips, (t) => mats[t] ?? []);
    expect(g.map((x) => [x.chave, x.rotulo, x.codigos])).toEqual([
      ["H", "Hidráulico", ["1", "2"]], ["A", "Aquecimento", ["3"]], [GERAL, "Geral (só no equipamento)", ["9"]]]);
  });

  it("sem subconjuntos: grupo único", () => {
    expect(gruposPorSistema("Z", equips, () => ["7", "7"])).toEqual([{ chave: GERAL, rotulo: "Peças do equipamento", codigos: ["7"], origem: { 7: "Z" } }]);
  });

  it("origem: onde cada peça está vinculada (a do nível de cima vale)", () => {
    const g = gruposPorSistema("M", equips, (t) => mats[t] ?? []);
    expect(g[0].origem).toEqual({ 1: "H", 2: "U" });
  });

  it("ciclo na hierarquia não trava nem tira as peças do Geral", () => {
    const ciclo = [{ equipamento: "M", denominacao: "M", superior: "S" }, { equipamento: "S", denominacao: "M - SISTEMA X", superior: "M" }];
    const g = gruposPorSistema("M", ciclo, (t) => (t === "M" ? ["1"] : ["2"]));
    expect(g.map((x) => [x.chave, x.codigos])).toEqual([["S", ["2"]], [GERAL, ["1"]]]);
  });

  it("sem peças: nenhum grupo", () => expect(gruposPorSistema("Z", equips, () => [])).toEqual([]));
});
