import { describe, expect, it } from "vitest";

import type { OrdemCusto } from "@/app/(app)/custos/calculo";
import {
  concentracao, custoParadaDe, dnaPorFamilia, iceberg, kpis360, mesDoTermometro, mesNoIntervalo, porCriticidade, porDia, porGrupo, porMesAno, travado,
} from "@/lib/wcm/custo360";
import type { Equipamento, Requisicao } from "@/lib/wcm/preparo";
import type { Quebra } from "@/lib/wcm/indicadores";
import { dia } from "@/lib/wcm/util";

/** Contas do Custo 360° da aba Custos (dados fictícios). */
const D = (a: number, m: number, d: number) => dia(a, m, d)!;

const ordem = (over: Record<string, unknown> = {}) => ({
  ordem: "1", classe: "Corretiva", tipoNome: "Corretiva", custoReal: 0, data: D(2026, 10, 5), comPlano: false,
  equipamento: "E1", equipChave: "E1", objeto: "PRENSA 01", situacao: "Liberada", ...over,
}) as unknown as OrdemCusto;

const quebra = (over: Record<string, unknown>) => over as unknown as Quebra;

const equip = (codigo: string, abc: string, desativado = false) => ({
  equipamento: codigo, denominacao: `Eq ${codigo}`, localizacao: "", codigoAbc: abc, local: "", desativado,
}) as Equipamento;

describe("kpis360", () => {
  const o = [ordem({ custoReal: 100 }), ordem({ custoReal: 300 }), ordem({ custoReal: 0 })];
  it("total, custo por ativo-mês, médio por ordem e ordens com custo", () => {
    expect(kpis360(o, 4, 2)).toEqual({ total: 400, porAtivoMes: 50, medioOrdem: 200, ordensComCusto: 2 });
  });
  it("sem ordens: total 0 e médio null", () => {
    expect(kpis360([], 4, 2)).toMatchObject({ total: 0, medioOrdem: null, ordensComCusto: 0 });
  });
  it("sem ativos: custo por ativo null", () => {
    expect(kpis360(o, 0, 2).porAtivoMes).toBeNull();
  });
});

describe("custoParadaDe", () => {
  it("lê custo do par e pares por hora de _parametros", () => {
    expect(custoParadaDe({ _parametros: { custo_par: 19.4, pares_hora: 120 } })).toEqual({ custoPar: 19.4, paresHora: 120 });
  });
  it("sem cadastro: nulls", () => {
    expect(custoParadaDe({})).toEqual({ custoPar: null, paresHora: null });
    expect(custoParadaDe(null)).toEqual({ custoPar: null, paresHora: null });
  });
  it("zero ou negativo vira null", () => {
    expect(custoParadaDe({ _parametros: { custo_par: 19.4, pares_hora: 0 } })).toEqual({ custoPar: 19.4, paresHora: null });
  });
});

describe("iceberg", () => {
  const o = [ordem({ custoReal: 100 }), ordem({ custoReal: 300 })];
  // a parada soma horasParado (IW28) das quebras com comParada; horasReparo não entra
  const quebras = [
    quebra({ comParada: true, horasParado: 4, horasReparo: 6 }),
    quebra({ comParada: true, horasParado: 6, horasReparo: 1 }),
  ];
  it("soma as horas paradas e converte em R$ pelo custo do par e pares por hora", () => {
    const r = iceberg(o, quebras, 12, 150, 8000, { custoPar: 19.4, paresHora: 100 });
    expect(r).toMatchObject({ visivel: 400, paradaHoras: 10, "paradaR$": 19400, horasServico: 12, requisicoes: 150, estoque: 8000 });
  });
  it("sem custo do par: R$ null, horas continuam", () => {
    const r = iceberg(o, quebras, 12, null, null, { custoPar: null, paresHora: null });
    expect(r["paradaR$"]).toBeNull();
    expect(r.paradaHoras).toBe(10);
  });
  it("quebra com horasParado 0 e reparo > 0 soma 0 h (nunca horasReparo)", () => {
    const r = iceberg(o, [quebra({ comParada: true, horasParado: 0, horasReparo: 5 })], 0, null, null, { custoPar: 19.4, paresHora: 100 });
    expect(r.paradaHoras).toBe(0);
    expect(r["paradaR$"]).toBe(0);
  });
  it("quebra sem parada não entra nas horas", () => {
    const r = iceberg(o, [quebra({ comParada: false, horasParado: 3, horasReparo: 3 })], 0, null, null, { custoPar: 1, paresHora: 1 });
    expect(r.paradaHoras).toBe(0);
  });
  it("sem notas de quebra no recorte: sem linha de parada", () => {
    const r = iceberg(o, [], 0, null, null, { custoPar: 19.4, paresHora: 100 });
    expect(r.paradaHoras).toBeNull();
    expect(r["paradaR$"]).toBeNull();
  });
});

describe("mesDoTermometro", () => {
  const ini = D(2026, 1, 1), fim = D(2026, 10, 20);
  it("mês válido do parâmetro", () => {
    expect(mesDoTermometro("2026-03", ini, fim)).toEqual({ ano: 2026, mes: 3 });
  });
  it("mês inválido cai no mês do fim", () => {
    expect(mesDoTermometro("2026-13", ini, fim)).toEqual({ ano: 2026, mes: 10 });
  });
  it("mês fora do intervalo cai no mês do fim", () => {
    expect(mesDoTermometro("2020-01", ini, fim)).toEqual({ ano: 2026, mes: 10 });
  });
});

describe("mesNoIntervalo", () => {
  const ini = D(2024, 6, 15), fim = D(2026, 10, 20);
  it("mês dentro do intervalo fica como está", () => {
    expect(mesNoIntervalo(2025, 3, ini, fim)).toEqual({ ano: 2025, mes: 3 });
  });
  it("ano anterior antes do início do IW38 vai para o primeiro mês (Jun/2024)", () => {
    expect(mesNoIntervalo(2023, 3, ini, fim)).toEqual({ ano: 2024, mes: 6 });
  });
  it("mês depois do fim do IW38 vai para o último mês (Out/2026)", () => {
    expect(mesNoIntervalo(2027, 1, ini, fim)).toEqual({ ano: 2026, mes: 10 });
  });
});

describe("porDia e porMesAno", () => {
  const o = [ordem({ custoReal: 100, data: D(2026, 10, 5) }), ordem({ custoReal: 200, data: D(2026, 10, 5) }),
    ordem({ custoReal: -50, data: D(2026, 10, 6) }), ordem({ custoReal: 70, data: D(2026, 2, 3) })];
  it("porDia traz todos os dias do mês; soma o mesmo dia; estorno fica negativo (o componente aplica o máximo com zero)", () => {
    const d = porDia(o, 2026, 10);
    expect(d).toHaveLength(31);
    expect(d[4]).toEqual({ dia: 5, valor: 300 });
    expect(d[5]).toEqual({ dia: 6, valor: -50 });
    expect(d[6]).toEqual({ dia: 7, valor: 0 });
  });
  it("porMesAno traz 12 meses do ano", () => {
    const m = porMesAno(o, 2026);
    expect(m).toHaveLength(12);
    expect(m[1]).toBe(70);
    expect(m[9]).toBe(250);
  });
});

describe("porGrupo", () => {
  const o = [
    ordem({ classe: "Preventiva", custoReal: 100 }), ordem({ classe: "Corretiva", custoReal: 200 }),
    ordem({ classe: "Emergencial", custoReal: 100 }), ordem({ classe: "Melhoria", custoReal: 100 }),
  ];
  it("quatro grupos com % que somam 100", () => {
    const g = porGrupo(o);
    expect(g.map((x) => x.grupo)).toEqual(["Planejada", "Corretiva", "Emergencial", "Outras"]);
    expect(g.reduce((s, x) => s + x.pct, 0)).toBeCloseTo(100);
    expect(g[0]).toMatchObject({ valor: 100, pct: 20, ordens: 1, porOrdem: 100 });
    expect(g[3]).toMatchObject({ grupo: "Outras", valor: 100 });
  });
  it("grupo sem ordem some", () => {
    expect(porGrupo([ordem({ classe: "Corretiva", custoReal: 10 })]).map((x) => x.grupo)).toEqual(["Corretiva"]);
  });
});

describe("dnaPorFamilia", () => {
  const nomes = new Map([["E1", "PRENSA 01"], ["E2", "PRENSA 02"], ["E3", "INJETORA 3"]]);
  const o = [ordem({ equipamento: "E1", custoReal: 100 }), ordem({ equipamento: "E2", custoReal: 200 }),
    ordem({ equipamento: "E3", custoReal: 50 })];
  it("soma as máquinas da mesma família", () => {
    const f = dnaPorFamilia(o, nomes);
    expect(f.map((x) => [x.familia, x.valor])).toEqual([["PRENSA", 300], ["INJETORA", 50]]);
    expect(f[0].pct).toBeCloseTo((300 / 350) * 100);
  });
  it("sobra além de n vai para Demais", () => {
    const f = dnaPorFamilia(o, nomes, 1);
    expect(f.map((x) => [x.familia, x.valor])).toEqual([["PRENSA", 300], ["Demais", 50]]);
  });
});

describe("porCriticidade", () => {
  const eqs = [equip("A1", "A"), equip("A2", "A"), equip("B1", "B"), equip("X9", "A", true)];
  const o = [
    ordem({ equipamento: "A1", equipChave: "A1", custoReal: 300 }),
    ordem({ equipamento: "A2", equipChave: "A2", custoReal: 300 }),
    ordem({ equipamento: "B1", equipChave: "B1", custoReal: 100 }),
    ordem({ equipamento: "ZZ", equipChave: "ZZ", custoReal: 50 }), // sem cadastro
  ];
  it("médio por ativo da classe, com a média geral e o que está acima", () => {
    const r = porCriticidade(o, eqs);
    const a = r.linhas.find((x) => x.classe === "A")!;
    expect(a).toMatchObject({ medio: 300, ativos: 2, acimaDaMedia: true });
    expect(r.linhas.find((x) => x.classe === "B")).toMatchObject({ medio: 100, ativos: 1, acimaDaMedia: false });
    expect(r.linhas.find((x) => x.classe === "Sem classe")).toMatchObject({ medio: 50, ativos: 1 });
    expect(r.linhas.find((x) => x.classe === "C")).toBeUndefined();
    expect(r.mediaGeral).toBeCloseTo(750 / 4);
  });
  it("ordem sem código não entra na média: vai para semCodigo", () => {
    const misto = [...o, ordem({ equipamento: "", equipChave: "Objeto solto", custoReal: 500 })];
    const r = porCriticidade(misto, eqs);
    expect(r.semCodigo).toBe(500);
    expect(r.linhas.find((x) => x.classe === "Sem classe")).toMatchObject({ medio: 50, ativos: 1 });
    expect(r.mediaGeral).toBeCloseTo(750 / 4);
  });
  it("só ordens sem código: sem linha Sem classe e média geral null", () => {
    const r = porCriticidade([ordem({ equipamento: "", equipChave: "Objeto solto", custoReal: 500 })], []);
    expect(r.linhas.find((x) => x.classe === "Sem classe")).toBeUndefined();
    expect(r.semCodigo).toBe(500);
    expect(r.mediaGeral).toBeNull();
  });
  it("equipamento desativado não conta como ativo", () => {
    const r = porCriticidade([], [equip("X9", "A", true)]);
    expect(r.linhas.find((x) => x.classe === "A")).toBeUndefined();
    expect(r.mediaGeral).toBeNull();
  });
});

describe("concentracao", () => {
  it("10% dos equipamentos com custo (mínimo 1): o de maior custo pesa 80%", () => {
    const o = [ordem({ equipamento: "E0", equipChave: "E0", custoReal: 720 })];
    for (let i = 1; i <= 9; i++) o.push(ordem({ equipamento: `E${i}`, equipChave: `E${i}`, custoReal: 20 }));
    const c = concentracao(o)!;
    expect(c.pctCusto10).toBeCloseTo(80);
    expect(c.nAtivos).toBe(10);
    expect(c.top[0]).toMatchObject({ equip: "E0", custo: 720, porOrdem: 720 });
  });
  it("ordem sem código de equipamento fica fora da conta", () => {
    const o = [ordem({ equipamento: "", equipChave: "Objeto solto", custoReal: 500 }),
      ordem({ equipamento: "E0", equipChave: "E0", custoReal: 100 }), ordem({ equipamento: "E1", equipChave: "E1", custoReal: 100 })];
    const c = concentracao(o)!;
    expect(c.nAtivos).toBe(2);
    expect(c.pctCusto10).toBeCloseTo(50);
  });
  it("com menos de 1 equipamento com custo: null", () => {
    expect(concentracao([ordem({ equipamento: "", custoReal: 500 })])).toBeNull();
    expect(concentracao([ordem({ equipamento: "E0", custoReal: 0 })])).toBeNull();
  });
});

describe("travado", () => {
  const req = [
    { pendente: true, total: 100 }, { pendente: false, total: 999 }, { pendente: true, total: 50 },
  ] as unknown as Requisicao[];
  const o = [
    ordem({ situacao: "Liberada", custoReal: 200 }),
    ordem({ situacao: "Aberta", custoReal: 0 }),
    ordem({ situacao: "Encerrada sem confirmação", custoReal: 300 }),
    ordem({ situacao: "Encerrada sem confirmação", custoReal: 0 }),
    ordem({ situacao: "Concluída", custoReal: 0 }),
    ordem({ situacao: "Concluída", custoReal: 500 }),
  ];
  it("cobre as quatro etapas", () => {
    const t = travado(o, req);
    expect(t).toEqual([
      { etapa: 1, rotulo: expect.any(String), qtd: 2, valor: 150 },
      { etapa: 2, rotulo: expect.any(String), qtd: 1, valor: 200 },
      { etapa: 3, rotulo: expect.any(String), qtd: 1, valor: 300 },
      { etapa: 4, rotulo: expect.any(String), qtd: 1, valor: null },
    ]);
  });
  it("sem requisições: sem etapa 1", () => {
    expect(travado(o, null).map((x) => x.etapa)).toEqual([2, 3, 4]);
  });
});
