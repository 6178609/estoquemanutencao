import { describe, expect, it } from "vitest";

import { filtrar, lerFiltro } from "@/app/(app)/ordens/dados";
import { formatarCelula } from "@/app/(app)/ordens/_comum/TabelaDados";
import { eixoTempo, inicioDaSemana } from "@/app/(app)/ordens/_comum/tempo";
import { casa, faixaDe, href, ordenar, paginar, termos } from "@/app/(app)/ordens/_comum/url";
import type { OrdemEnriquecida } from "@/lib/wcm/contexto";
import { dia } from "@/lib/wcm/util";

// dados fictícios
const o = (x: Partial<OrdemEnriquecida>) => ({ ordem: "1", busca: "", situacao: "Aberta", comPlano: false, statusUsuario: "", classe: "",
  atrasada: false, custoReal: 0, ...x }) as OrdemEnriquecida;

describe("url", () => {
  it("termos sem acento e casa todas as palavras", () => {
    expect(termos("Válvula  de-ar")).toEqual(["VALVULA", "DE", "AR"]);
    expect(casa("TROCAR VALVULA DE AR", termos("ar válvula"))).toBe(true);
    expect(casa("TROCAR VALVULA", termos("bomba válvula"))).toBe(false);
  });
  it("href troca e remove parâmetros", () => {
    expect(href({ q: "x", pag: "2" }, { pag: null, ord: "data" })).toBe("?q=x&ord=data");
  });
  it("paginar limita a página", () => {
    const r = paginar(Array.from({ length: 120 }, (_, i) => i), "9", 50);
    expect(r.pagina).toBe(3); expect(r.paginas).toBe(3); expect(r.itens).toHaveLength(20);
  });
  it("ordenar deixa vazios no fim", () => {
    expect(ordenar([3, null, 1], (x) => x, false)).toEqual([1, 3, null]);
    expect(ordenar([3, null, 1], (x) => x, true)).toEqual([3, 1, null]);
  });
  it("faixaDe", () => {
    const F = [["a", 0, 7], ["b", 8, Infinity]] as const;
    expect(faixaDe(7, F)).toBe(0); expect(faixaDe(400, F)).toBe(1);
  });
});

describe("tempo", () => {
  it("semana começa na segunda", () => {
    expect(inicioDaSemana(dia(2026, 10, 15)!)).toBe(dia(2026, 10, 12)); // quinta → segunda
  });
  it("por semana até ~2 meses, por mês acima", () => {
    expect(eixoTempo(dia(2026, 10, 1)!, dia(2026, 10, 31)!).porSemana).toBe(true);
    const m = eixoTempo(dia(2026, 1, 1)!, dia(2026, 12, 31)!);
    expect(m.porSemana).toBe(false); expect(m.rotulos).toHaveLength(12); expect(m.indice(dia(2026, 3, 5)!)).toBe(2);
  });
});

describe("filtro de ordens", () => {
  const xs = [o({ ordem: "1", busca: "1 TROCAR ROLAMENTO", comPlano: true, statusUsuario: "PRO" }),
    o({ ordem: "2", busca: "2 AJUSTAR CORREIA", situacao: "Concluída", custoReal: 10, classe: "Corretiva" }),
    o({ ordem: "3", busca: "3 TROCAR CORREIA", atrasada: true })];
  const ids = (p: Record<string, string>) => filtrar(xs, lerFiltro(p)).map((x) => x.ordem);
  it("busca, natureza, status, classe, atrasadas, custo", () => {
    expect(ids({ q: "trocar" })).toEqual(["1", "3"]);
    expect(ids({ nat: "backlog" })).toEqual(["2", "3"]);
    expect(ids({ st: "PRO" })).toEqual(["1"]);
    expect(ids({ cls: "Corretiva" })).toEqual(["2"]);
    expect(ids({ atr: "1" })).toEqual(["3"]);
    expect(ids({ cst: "1", sit: "Concluída" })).toEqual(["2"]);
  });
  it("formata células", () => {
    expect(formatarCelula(dia(2026, 1, 2), "data")).toBe("02/01/2026");
    expect(formatarCelula(null, "int")).toBe("—");
    expect(formatarCelula(true, "bool")).toBe("Sim");
  });
});
