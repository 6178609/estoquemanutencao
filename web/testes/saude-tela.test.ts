import { describe, expect, it } from "vitest";

import { filtrarFila, histograma, lerFiltroFila } from "@/app/(app)/saude/fila";
import type { LinhaSaude } from "@/lib/wcm/saude";

/** Fila de ataque da tela Saúde dos ativos (dados fictícios). */
const l = (x: Partial<LinhaSaude>): LinhaSaude => ({
  codigo: "E1", equipamento: "BOMBA", criticidade: "Alta", abc: "", saude: 50, faixa: "Crítica", risco: 150, principalCausa: "Quebras",
  quebras: 0, reincidencias: 0, falhasAf: 0, horasParadasAf: 0, corretivas: 0, backlogAtrasado: 0, preventivasAtrasadas: 0, anomaliasAbertas: 0,
  custo12Meses: 0, ultimaFalha: null, area: "GAL1", centro: "MEC", setor: "", pts: { quebras: 0, falhas_af: 0, corretivas: 0, backlog: 0, preventivas: 0, preditiva: 0, custo: 0 },
  ...x,
});

describe("fila de ataque", () => {
  const t = [l({}), l({ codigo: "E2", saude: 70, faixa: "Atenção", criticidade: "" }), l({ codigo: "E3", saude: 95, faixa: "Boa", area: "UTIL" })];
  it("padrão: críticos e em atenção; '-' = todas as faixas", () => {
    expect(filtrarFila(t, lerFiltroFila({})).map((x) => x.codigo)).toEqual(["E1", "E2"]);
    expect(filtrarFila(t, lerFiltroFila({ sfaixa: "-" })).map((x) => x.codigo)).toEqual(["E1", "E2", "E3"]);
  });
  it("criticidade sem classe, causa e busca", () => {
    expect(filtrarFila(t, lerFiltroFila({ scrit: "Sem classe" })).map((x) => x.codigo)).toEqual(["E2"]);
    expect(filtrarFila(t, lerFiltroFila({ sfaixa: "-", sq: "util" })).map((x) => x.codigo)).toEqual(["E3"]);
    expect(filtrarFila(t, lerFiltroFila({ scausa: "Custo de manutenção" }))).toEqual([]);
  });
  it("histograma em faixas de 10 pontos", () => {
    const h = histograma(t);
    expect(h.porFaixa["Crítica"][5]).toBe(1);
    expect(h.porFaixa["Boa"][9]).toBe(1);
  });
});
