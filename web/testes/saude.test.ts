import { describe, expect, it } from "vitest";

import * as saude from "@/lib/wcm/saude";
import type { OrdemSaude } from "@/lib/wcm/saude";
import { dia } from "@/lib/wcm/util";

/** Saúde dos ativos: penalidades, faixas, risco pela criticidade e universo de equipamentos (dados fictícios). */
const HOJE = dia(2026, 10, 7)!;

function ordens(linhas: Partial<OrdemSaude>[]): OrdemSaude[] {
  const base: OrdemSaude = { situacao: "Concluída", comPlano: true, custoReal: 0, atrasada: false, localizacao: "GAL1",
    centroTrabalho: "MEC_COMP", setor: "Componentes", objeto: "", equipChave: "", data: null };
  return linhas.map((x) => ({ ...base, ...x }));
}

describe("saude.calcular", () => {
  it("equipamento problemático fica crítico e no topo da fila", () => {
    const o = ordens([
      ...Array.from({ length: 12 }, (_, i) => ({ equipChave: "E1", data: HOJE - (10 + i), comPlano: false, custoReal: 500,
        objeto: "INJETORA 01" })), // 12 corretivas
      ...Array.from({ length: 5 }, () => ({ equipChave: "E1", data: HOJE - 40, situacao: "Aberta" as const, atrasada: true,
        comPlano: false })), // 5 atrasadas
      { equipChave: "E2", data: HOJE - 20, objeto: "PRENSA" },
      { equipChave: "E3", data: HOJE - 500, custoReal: 99999 },
      { equipChave: "E4", data: HOJE - 5, situacao: "Cancelada" },
    ]);
    const quebras = [
      { equipChave: "E1", reincidente: false, data: HOJE - 60 },
      { equipChave: "E1", reincidente: true, data: HOJE - 40 },
      { equipChave: "E2", reincidente: false, data: HOJE - 400 }, // a do E2 é velha
    ];
    const afs = [
      ...Array.from({ length: 10 }, () => ({ codigoSap: "E1", situacao: "Analisada no prazo", dataFalha: HOJE - 30, duracaoParada: 2 })),
      { codigoSap: "E2", situacao: "Cancelada", dataFalha: HOJE - 30, duracaoParada: 2 },
    ];
    const chamadas = [{ equipamento: "E1", situacao: "Atrasada" }, { equipamento: "E1", situacao: "Atrasada" },
      { equipamento: "E5", situacao: "Programada" }];
    const anomalias = [{ equipamento: "E1", situacao: "Atrasada" }, { equipamento: "E1", situacao: "Atrasada" }];
    const equip = [
      { equipamento: "E1", denominacao: "INJETORA 01 UGB", codigoAbc: "A", desativado: false },
      { equipamento: "E2", denominacao: "", codigoAbc: "C", desativado: false },
      { equipamento: "E3", denominacao: "", codigoAbc: "B", desativado: false },
      { equipamento: "E5", denominacao: "", codigoAbc: "", desativado: true },
    ];
    const t = saude.calcular(o, HOJE, { quebras, afs, chamadas, anomalias, equip, cadEq: { E2: { criticidade: "Alta" } } });
    const por = new Map(t.map((l) => [l.codigo, l]));
    expect([...por.keys()].sort()).toEqual(["E1", "E2", "E3"]); // E4 só tem ordem cancelada; E5 está desativado no IH08
    const e1 = por.get("E1")!;
    // quebras 2+1 reincidência ≥ 3, 10 falhas AF, 17 corretivas, 5 atrasadas, 2 preventivas, 2 anomalias atrasadas:
    // todos os contribuintes cheios, menos o custo (6.000 ÷ p95) → saúde só com o custo
    expect([e1.quebras, e1.reincidencias, e1.falhasAf]).toEqual([2, 1, 10]);
    expect(e1.corretivas).toBe(17); // as 5 atrasadas também são sem plano
    expect(e1.backlogAtrasado).toBe(5);
    expect(e1.preventivasAtrasadas).toBe(2);
    expect(e1.horasParadasAf).toBe(20);
    expect(e1.anomaliasAbertas).toBe(2);
    expect(e1.saude).toBeLessThanOrEqual(10);
    expect(e1.faixa).toBe(saude.CRITICA);
    expect(e1.equipamento).toBe("INJETORA 01 UGB");
    expect(e1.criticidade).toBe("Alta");
    expect(e1.risco).toBe((100 - e1.saude) * 3);
    expect(e1.ultimaFalha).toBe(HOJE - 30);
    const e2 = por.get("E2")!; // nada nos últimos 12 meses (a falha AF foi cancelada)
    expect(e2.saude).toBe(100);
    expect(e2.faixa).toBe(saude.BOA);
    expect(e2.principalCausa).toBe("—");
    expect(e2.criticidade).toBe("Alta"); // o cadastro do site vence o ABC do IH08
    expect(e2.equipamento).toBe("PRENSA"); // sem nome no IH08: o objeto técnico das ordens
    expect(por.get("E3")!.custo12Meses).toBe(0); // ordem de 500 dias atrás fica fora da janela
    expect(t[0].codigo).toBe("E1"); // maior risco primeiro
  });

  it("faixas, resumo, matriz e pesos", () => {
    expect(saude.faixa(80)).toBe(saude.BOA);
    expect(saude.faixa(79)).toBe(saude.ATENCAO);
    expect(saude.faixa(59)).toBe(saude.CRITICA);
    expect(saude.CONTRIBUINTES.reduce((s, c) => s + c.peso, 0)).toBe(100);
    const o = ordens([{ equipChave: "E1", data: HOJE, atrasada: true, situacao: "Aberta" }, { equipChave: "E2", data: HOJE }]);
    const t = saude.calcular(o, HOJE);
    expect(t.find((l) => l.codigo === "E1")!.saude).toBe(100 - 15 / 5); // 1 de 5 atrasadas × peso 15
    const pesos = Object.fromEntries(saude.CONTRIBUINTES.map((c) => [c.id, c.id === "backlog" ? 100 : 0]));
    expect(saude.calcular(o, HOJE, { pesos }).find((l) => l.codigo === "E1")!.saude).toBe(80);
    const r = saude.resumo(t);
    expect([r.ativos, r.criticos, r.boaPct]).toEqual([2, 0, 100]);
    const m = saude.matriz(t);
    expect(m.length).toBe(saude.CRITICIDADES.length * saude.FAIXAS.length);
    expect(m.reduce((s, c) => s + c.equipamentos, 0)).toBe(2);
    expect(m.find((c) => c.criticidade === saude.SEM_CLASSE && c.faixa === saude.BOA)!.equipamentos).toBe(2);
    expect(saude.contribuicao(t[0]).reduce((s, c) => s + c.pontosPerdidos, 0)).toBe(100 - t[0].saude);
    expect(saude.calcular([], HOJE)).toEqual([]);
    expect(saude.resumo([]).media).toBeNull();
  });

  it("custo relativo ao p95 da planta, arredondamento do pandas e o que mais derruba a saúde", () => {
    // 20 equipamentos com custo 1.000…20.000: p95 = 19.050; o de 20.000 perde o peso cheio (10)
    const o = ordens(Array.from({ length: 20 }, (_, i) => ({ equipChave: `E${String(i + 1).padStart(2, "0")}`, data: HOJE - 1,
      custoReal: 1000 * (i + 1) })));
    const t = saude.calcular(o, HOJE);
    const e20 = t.find((l) => l.codigo === "E20")!;
    expect(e20.saude).toBe(90);
    expect(e20.principalCausa).toBe("Custo de manutenção");
    expect(e20.pts.custo).toBe(10);
    // pesos somando 100: 2,5 pontos perdidos → 97,5 → 98; 1,5 → 98,5 → 98 (metade para o par, como o numpy)
    const o2 = ordens([{ equipChave: "X", data: HOJE, atrasada: true, situacao: "Aberta" }]);
    expect(saude.calcular(o2, HOJE, { pesos: { backlog: 12.5, quebras: 22.5 } })[0].saude).toBe(98);
    expect(saude.calcular(o2, HOJE, { pesos: { backlog: 7.5, quebras: 27.5 } })[0].saude).toBe(98);
    expect(saude.pontosForaDaFaixaBoa(t)).toEqual([]);
  });

  it("chamada de plano e quebra também trazem o equipamento para o universo", () => {
    const t = saude.calcular([], HOJE, { chamadas: [{ equipamento: "P1", situacao: "Programada" }],
      quebras: [{ equipChave: "Q1", data: HOJE - 3, reincidente: false }, { equipChave: "Q2", data: null, reincidente: false }] });
    expect(t.map((l) => l.codigo).sort()).toEqual(["P1", "Q1"]);
    expect(t.find((l) => l.codigo === "Q1")!.ultimaFalha).toBe(HOJE - 3);
  });
});
