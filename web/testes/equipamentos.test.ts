import { describe, expect, it } from "vitest";

import * as L from "@/app/(app)/equipamentos/logica";
import { hrefCom } from "@/app/(app)/equipamentos/_ui/url";
import type { LinhaAtivo } from "@/lib/wcm/ativos";
import { dia } from "@/lib/wcm/util";

/** Regras da aba Equipamentos (dados fictícios). */
const ativo = (x: Partial<LinhaAtivo>): LinhaAtivo => ({
  codigo: "E1", equipamento: "BOMBA TESTE", situacao: "Em operação", criticidade: "Alta", abc: "", categoria: "", area: "GAL1",
  localInstalacao: "", centro: "", centroCusto: "", statusUsuario: "", inventario: "", superior: "", origem: "SAP", fabricante: "", modelo: "", serie: "", anoInstalacao: null, idade: null, vidaUtil: null,
  vidaRestante: null, garantiaAte: null, garantia: "Sem garantia cadastrada", valorReposicao: null, custo12Meses: 0, custoPorReposicaoPct: null,
  custoTotal: 0, ordensPendentes: 0, quebras12Meses: 0, mtbfDias: null, saude: null, faixa: "", planosPreventivos: 0, cobertoPorPlano: false,
  pecasVinculadas: 0, recomendacao: "Manter", ...x,
});

describe("validarCadastro", () => {
  it("exige TAG e nome e normaliza a TAG", () => {
    expect(L.validarCadastro({ tag: "", nome: "x" }, 2026)).toHaveProperty("erro");
    const r = L.validarCadastro({ tag: " mt-1 ", nome: "Motor", categoria: "Elétrico", criticidade: "Alta", materiais: ["123", "123", "a b"],
      ano_instalacao: "2015", vida_util: 20, valor_reposicao: "1000,5", garantia_ate: "2027-01-31" }, 2026);
    expect(r).toEqual({ tag: "MT-1", item: expect.objectContaining({ nome: "Motor", categoria: "Elétrico", criticidade: "Alta", materiais: ["123"],
      ano_instalacao: 2015, vida_util: 20, valor_reposicao: 1000.5, garantia_ate: "2027-01-31", situacao: "Em operação" }) });
  });
  it("recusa ano no futuro e vida útil fora da faixa", () => {
    expect(L.validarCadastro({ tag: "A", nome: "B", ano_instalacao: 2030 }, 2026)).toHaveProperty("erro");
    expect(L.validarCadastro({ tag: "A", nome: "B", vida_util: 0.5 }, 2026)).toHaveProperty("erro");
  });
  it("valores desconhecidos caem no padrão", () => {
    const r = L.validarCadastro({ tag: "A", nome: "B", categoria: "??", criticidade: "??", situacao: "??" }, 2026);
    expect(r).toMatchObject({ item: { categoria: "Mecânico", criticidade: "Média", situacao: "Em operação" } });
  });
});

describe("formInicial", () => {
  it("cadastra a partir do SAP com o nome e a criticidade do ABC", () => {
    const f = L.formInicial("E9", null, { nome: "PRENSA X", abc: "a", desativado: true });
    expect(f).toMatchObject({ nome: "PRENSA X", criticidade: "Alta", situacao: "Desativado" });
  });
});

describe("inventário", () => {
  const t = [ativo({ codigo: "E1" }), ativo({ codigo: "E2", situacao: "Desativado" }), ativo({ codigo: "E3", criticidade: "", cobertoPorPlano: true, origem: "Site", fabricante: "ACME" })];
  it("sem situação escolhida esconde os desativados", () => {
    expect(L.filtrarInventario(t, L.lerFiltroInventario({})).map((x) => x.codigo)).toEqual(["E1", "E3"]);
    expect(L.filtrarInventario(t, L.lerFiltroInventario({ isit: "Desativado" })).map((x) => x.codigo)).toEqual(["E2"]);
  });
  it("busca, criticidade sem classe, sem plano e só do site", () => {
    expect(L.filtrarInventario(t, L.lerFiltroInventario({ iq: "acme" })).map((x) => x.codigo)).toEqual(["E3"]);
    expect(L.filtrarInventario(t, L.lerFiltroInventario({ icrit: "Sem classe" })).map((x) => x.codigo)).toEqual(["E3"]);
    expect(L.filtrarInventario(t, L.lerFiltroInventario({ iplano: "1" })).map((x) => x.codigo)).toEqual(["E1"]);
    expect(L.filtrarInventario(t, L.lerFiltroInventario({ isite: "1" })).map((x) => x.codigo)).toEqual(["E3"]);
  });
  it("planilha com ; e fórmula neutralizada", () => {
    const s = L.csvInventario([ativo({ equipamento: "=CMD()" })]);
    expect(s.startsWith("﻿Código;Equipamento")).toBe(true);
    expect(s).toContain("'=CMD()");
  });
});

describe("análise pelas ordens", () => {
  const H = dia(2026, 6, 30)!;
  const o = (x: Partial<Parameters<typeof L.agregarAnalise>[0][number]>) => ({ equipChave: "E1", objeto: "BOMBA", local: "L1", centroTrabalho: "MEC",
    situacao: "Concluída" as const, data: H, comPlano: true, custoReal: 100, ...x });
  it("conta ordens/backlog/custo no período e pendentes em todas as datas", () => {
    const t = L.agregarAnalise([o({}), o({ comPlano: false }), o({ data: H - 400, situacao: "Aberta" })], H - 30, H,
      { cadEq: { E5: { nome: "Só no site", criticidade: "Baixa" } }, equip: null, notas: null });
    const e1 = t.find((x) => x.codigo === "E1")!;
    expect(e1).toMatchObject({ ordens: 2, backlog: 1, custo: 200, pendentes: 1, ultima: H });
    expect(t.find((x) => x.codigo === "E5")).toMatchObject({ nome: "Só no site", criticidade: "Baixa", ordens: 0 });
    expect(L.filtrarAnalise(t, L.lerFiltroAnalise({})).map((x) => x.codigo)).toEqual(["E1"]);
    expect(L.filtrarAnalise(t, L.lerFiltroAnalise({ aper: "0", acrit: "Baixa" })).map((x) => x.codigo)).toEqual(["E5"]);
  });
  it("intervalo médio entre ordens de backlog", () => {
    expect(L.intervaloMedio([10, 40, 20])).toBe(15);
    expect(L.intervaloMedio([5])).toBeNull();
  });
});

describe("peças e cadastro", () => {
  const est = new Map([["1", { descricao: "ROLAMENTO", estoque: 0 }], ["2", { descricao: "CORREIA", estoque: 3 }], ["3", { descricao: "SELO", estoque: 9 }]]);
  it("situação no estoque", () => {
    expect(L.situacaoPeca("1", est, {}).status).toBe("zerado");
    expect(L.situacaoPeca("2", est, { 2: { minimo: 5 } }).status).toBe("baixo");
    expect(L.situacaoPeca("3", est, {}).status).toBe("ok");
    expect(L.situacaoPeca("9", est, {}).status).toBe("ausente");
  });
  it("lista do cadastro busca também a descrição das peças", () => {
    const cad = { B: { nome: "Prensa", criticidade: "Alta", materiais: ["2"] }, A: { nome: "Motor", criticidade: "Baixa" } };
    expect(L.filtrarCadastro(cad, { q: "", crits: [] }).map(([k]) => k)).toEqual(["A", "B"]);
    expect(L.filtrarCadastro(cad, { q: "correia", crits: [] }, (m) => est.get(m)?.descricao ?? "").map(([k]) => k)).toEqual(["B"]);
    expect(L.filtrarCadastro(cad, { q: "", crits: ["Baixa"] }).map(([k]) => k)).toEqual(["A"]);
  });
  it("paginação e endereço", () => {
    expect(L.paginar([1, 2, 3], 9, 2)).toMatchObject({ itens: [3], pag: 2, paginas: 2 });
    expect(hrefCom({ area: "GAL1", pag: "2", eq: "X" }, { eq: null, at: "Y" }, "abas")).toBe("?area=GAL1&pag=2&at=Y#abas");
  });
});
