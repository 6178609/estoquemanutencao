import { describe, expect, it } from "vitest";

import * as ativos from "@/lib/wcm/ativos";
import type { EquipAtivo, LinhaAtivo, OrdemAtivo } from "@/lib/wcm/ativos";
import type { CadastroEquip } from "@/lib/wcm/saude";
import { dia, type Dia } from "@/lib/wcm/util";

/** Gestão de ativos: inventário, recomendação, resumo, Pareto e lacunas (dados fictícios). */
const HOJE = dia(2026, 10, 9)!;
const d = (s: string): Dia => { const [a, m, x] = s.split("-").map(Number); return dia(a, m, x)!; };

function equip(): EquipAtivo[] {
  return [
    { equipamento: "EQ1", denominacao: "Prensa 1", localizacao: "MONTAGEM", codigoAbc: "A", local: "Linha 1", desativado: false },
    { equipamento: "EQ2", denominacao: "Bomba 2", localizacao: "UTILIDADES", codigoAbc: "B", local: "Casa de bombas", desativado: false },
    { equipamento: "EQ3", denominacao: "Esteira 3", localizacao: "MONTAGEM", codigoAbc: "", local: "Linha 2", desativado: false },
    { equipamento: "EQ9", denominacao: "Velha 9", localizacao: "MONTAGEM", codigoAbc: "C", local: "Linha 1", desativado: true },
  ];
}

function ordens(): OrdemAtivo[] {
  const l = (equipChave: string, objeto: string, situacao: OrdemAtivo["situacao"], data: string, custoReal: number,
    comPlano: boolean, plano: string, localizacao: string, local: string, centroTrabalho: string): OrdemAtivo =>
    ({ equipChave, objeto, situacao, data: d(data), custoReal, comPlano, plano, localizacao, local, centroTrabalho });
  return [
    l("EQ1", "Prensa 1", "Concluída", "2026-03-01", 60000, false, "", "MONTAGEM", "Linha 1", "MEC"),
    l("EQ1", "Prensa 1", "Aberta", "2026-09-01", 1000, false, "", "MONTAGEM", "Linha 1", "MEC"),
    l("EQ2", "Bomba 2", "Concluída", "2026-05-01", 500, true, "PL2", "UTILIDADES", "Casa de bombas", "ELE"),
    l("EQ4", "Compressor 4", "Concluída", "2024-01-01", 900, false, "", "FORJA", "Ar comprimido", "MEC"),
    l("EQ3", "Esteira 3", "Cancelada", "2026-06-01", 99999, false, "", "MONTAGEM", "Linha 2", "MEC"),
  ];
}

function cad(): CadastroEquip {
  return {
    EQ1: { nome: "Prensa hidráulica 1", criticidade: "Alta", fabricante: "ACME", modelo: "PH-200", ano_instalacao: 2010,
      vida_util: 15, valor_reposicao: 100000, garantia_ate: "2026-11-30", materiais: ["M1", "M1", "M2"] },
    EQ5: { nome: "Exaustor novo", criticidade: "Baixa", situacao: "Reserva" },
  };
}

function inv(kw: Partial<ativos.EntradasAtivos> = {}): Map<string, LinhaAtivo> {
  const t = ativos.inventario(HOJE, { equip: equip(), ordens: ordens(), cadEq: cad(), ...kw });
  return new Map(t.map((l) => [l.codigo, l]));
}

describe("ativos.inventario", () => {
  it("universo e identificação", () => {
    const t = inv();
    expect([...t.keys()].sort()).toEqual(["EQ1", "EQ2", "EQ3", "EQ4", "EQ5", "EQ9"]);
    expect(t.get("EQ1")!.equipamento).toBe("Prensa hidráulica 1"); // o nome do site vale
    expect(t.get("EQ4")!.equipamento).toBe("Compressor 4"); // só nas ordens
    expect(t.get("EQ1")!.origem).toBe("SAP + site");
    expect(t.get("EQ5")!.origem).toBe("Site");
    expect(t.get("EQ4")!.origem).toBe("SAP");
    expect(t.get("EQ4")!.area).toBe("FORJA");
    expect(t.get("EQ4")!.localInstalacao).toBe("Ar comprimido");
    expect(t.get("EQ9")!.situacao).toBe(ativos.DESATIVADO);
    expect(t.get("EQ5")!.situacao).toBe("Reserva");
    expect(t.get("EQ2")!.criticidade).toBe("Média");
    expect(t.get("EQ3")!.criticidade).toBe("");
    // criticidade Alta, Média, Baixa, sem; dentro dela o maior custo primeiro
    expect(ativos.inventario(HOJE, { equip: equip(), ordens: ordens(), cadEq: cad() }).map((l) => l.codigo))
      .toEqual(["EQ1", "EQ2", "EQ5", "EQ9", "EQ3", "EQ4"]);
  });

  it("custo, ciclo de vida e recomendação", () => {
    const t = inv();
    const eq1 = t.get("EQ1")!;
    expect(eq1.custo12Meses).toBe(61000);
    expect(eq1.custoTotal).toBe(61000);
    expect(eq1.ordensPendentes).toBe(1);
    expect(eq1.idade).toBe(16);
    expect(eq1.vidaRestante).toBe(-1);
    expect(eq1.custoPorReposicaoPct).toBe(61);
    expect(eq1.pecasVinculadas).toBe(2);
    expect(eq1.garantia).toBe(`Vence em ${ativos.AVISO_GARANTIA_DIAS} dias`);
    expect(eq1.garantiaAte).toBe(d("2026-11-30"));
    expect(eq1.recomendacao).toBe(ativos.SUBSTITUIR);
    expect(t.get("EQ3")!.custo12Meses).toBe(0); // ordem cancelada não conta
    expect(t.get("EQ2")!.cobertoPorPlano).toBe(true);
    expect(t.get("EQ2")!.recomendacao).toBe(ativos.MANTER);
    expect(t.get("EQ3")!.recomendacao).toBe(ativos.CLASSIFICAR);
    expect(t.get("EQ9")!.recomendacao).toBe("—");
    expect(t.get("EQ4")!.custoTotal).toBe(900); // fora da janela de 12 meses, mas no custo total
    expect(t.get("EQ4")!.custo12Meses).toBe(0);
  });

  it("plano pela IP19 e quebras", () => {
    const chamadas = [{ equipamento: "EQ1", plano: "P1", situacao: "Programada" },
      { equipamento: "EQ1", plano: "P1", situacao: "Atrasada" }, { equipamento: "EQ3", plano: "P3", situacao: "Saltada/cancelada" }];
    const quebras = [{ equipChave: "EQ2", data: d("2026-02-01") }, { equipChave: "EQ2", data: d("2026-08-01") }];
    const t = inv({ chamadas, quebras });
    expect(t.get("EQ1")!.planosPreventivos).toBe(1);
    expect(t.get("EQ3")!.cobertoPorPlano).toBe(false);
    expect(t.get("EQ2")!.quebras12Meses).toBe(2);
    expect(t.get("EQ2")!.mtbfDias).toBe(182); // 365 ÷ 2 = 182,5 → 182 (metade para o par, como o pandas)
  });

  it("críticos sem plano pedem plano", () => {
    const t = ativos.inventario(HOJE, { equip: equip(), ordens: ordens(), cadEq: { EQ1: { criticidade: "Alta" } } });
    expect(t.find((l) => l.codigo === "EQ1")!.recomendacao).toBe(ativos.CRIAR_PLANO);
  });

  it("saúde crítica: atacar a causa; vida vencida com saúde crítica: substituir", () => {
    const saude = [{ codigo: "EQ2", saude: 40, faixa: "Crítica" as const }, { codigo: "EQ1", saude: 50, faixa: "Crítica" as const }];
    const t = inv({ saude, cadEq: { EQ1: { criticidade: "Baixa", ano_instalacao: "2000", vida_util: "20" } } });
    expect(t.get("EQ2")!.recomendacao).toBe(ativos.ATACAR);
    expect(t.get("EQ2")!.saude).toBe(40);
    expect(t.get("EQ1")!.vidaRestante).toBe(-6);
    expect(t.get("EQ1")!.recomendacao).toBe(ativos.SUBSTITUIR);
    expect(t.get("EQ3")!.saude).toBeNull();
  });

  it("resumo, Pareto e lacunas", () => {
    const t = ativos.inventario(HOJE, { equip: equip(), ordens: ordens(), cadEq: cad() });
    const r = ativos.resumo(t);
    expect([r.ativos, r.desativados, r.alta]).toEqual([5, 1, 1]);
    expect(r.coberturaCriticos).toBe(50);
    expect(r.substituir).toBe(1);
    expect(r.garantiaVencendo).toBe(1);
    expect(r.custo12m).toBe(61500);
    const p = ativos.paretoCusto(t);
    expect(p.slice(0, 2).map((x) => x.codigo)).toEqual(["EQ1", "EQ2"]);
    expect(Math.round(p[p.length - 1].pctAcumulado)).toBe(100);
    const c = new Map(ativos.completude(t).map((x) => [x.informacao, x]));
    expect(c.get("Valor de reposição")!.faltando).toBe(4);
    expect(c.get("Criticidade")!.faltando).toBe(2);
    expect(c.get("Plano preventivo (Alta/Média)")!.preenchidoPct).toBe(50);
    const rec = new Map(ativos.contarRecomendacoes(t).map((x) => [x.recomendacao, x.ativos]));
    expect(rec.get(ativos.SUBSTITUIR)).toBe(1);
    expect([...rec.values()].reduce((a, b) => a + b, 0)).toBe(5);
    const a = ativos.porArea(t);
    expect(a.areas[0]).toBe("MONTAGEM");
    expect(a.linhas.find((l) => l.area === "MONTAGEM" && l.criticidade === "Sem classe")!.ativos).toBe(1);
    const v = ativos.cicloDeVida(t);
    expect([v.comAno, v.vidaVencida, v.garantiaVencendo, v.alerta.length]).toEqual([1, 1, 1, 1]);
  });

  it("sem bases", () => {
    expect(ativos.inventario(HOJE)).toEqual([]);
    const t = ativos.inventario(HOJE, { cadEq: { X1: { nome: "Só no site" }, lixo: "não é dict" } });
    expect(t.map((l) => l.codigo)).toEqual(["X1"]);
    expect(t[0].recomendacao).toBe(ativos.CLASSIFICAR);
    expect(ativos.paretoCusto(t)).toEqual([]);
    expect(ativos.completude([])).toEqual([]);
  });
});
