import { describe, expect, it } from "vitest";

import { aplicacaoDe, palavras, porAtivo, sugerirAlocacoes } from "@/app/(app)/mro/alocacao";

// dados fictícios
const ATIVOS = [
  { codigo: "10000101", nome: "PRENSA HIDRAULICA 01", fabricante: "ACME", modelo: "PH300" },
  { codigo: "10000102", nome: "PRENSA HIDRAULICA 02", fabricante: "ACME", modelo: "PH300" },
  { codigo: "10000201", nome: "COMPRESSOR DE AR 01", campo: "UTIL-COMP-01" },
  { codigo: "10000301", nome: "INJETORA ROTATIVA 03", modelo: "IR-900" },
  { codigo: "10000999", nome: "PRENSA HIDRAULICA 09", desativado: true },
];
const mat = (codigo: string, descricao: string, descrCompleta = "") => ({ codigo, descricao, descrCompleta });

describe("alocação automática de materiais aos ativos", () => {
  it("lê a APLICAÇÃO e ignora a vazia", () => {
    expect(aplicacaoDe("VEDACAO; APLICACAO: Prensa Hidráulica 01; FAB: X")).toBe("PRENSA HIDRAULICA 01");
    expect(aplicacaoDe("ROLAMENTO; APLICACAO: *****; FAB: SKF")).toBe("");
    expect(aplicacaoDe("ROLAMENTO; APLICACAO: VARIAS")).toBe("");
    expect(palavras("Prensa hidráulica nº 01")).toEqual(["PRENSA", "HIDRAULICA", "1"]);
  });
  it("níveis: aplicação com número = alta; sem número = média para todos do tipo; código/campo = alta", () => {
    const s = sugerirAlocacoes(ATIVOS, [
      mat("1", "KIT VEDACAO CILINDRO", "KIT VEDACAO; APLICACAO: PRENSA HIDRAULICA 01"),
      mat("2", "OLEO HIDRAULICO 68", "OLEO; APLICACAO: PRENSA HIDRAULICA"),
      mat("3", "FILTRO AR UTIL-COMP-01", "FILTRO"),
      mat("4", "PARAFUSO SEXTAVADO M8", "PARAFUSO; ROSCA M8; APLICACAO: *****"),
    ]);
    const ver = (m: string) => s.filter((x) => x.material === m).map((x) => [x.ativo, x.nivel]).sort();
    expect(ver("1")).toEqual([["10000101", "alta"]]);
    expect(ver("2")).toEqual([["10000101", "media"], ["10000102", "media"]]); // o desativado fica de fora
    expect(ver("3")).toEqual([["10000201", "alta"]]);
    expect(ver("4")).toEqual([]);
  });
  it("modelo do ativo: com o fabricante = alta, só o modelo = média; tipo na descrição = baixa", () => {
    const s = sugerirAlocacoes(ATIVOS, [
      mat("5", "RESISTENCIA ACME PH300", "RESISTENCIA; FAB: ACME - REF: PH300"),
      mat("6", "SENSOR IR-900", "SENSOR"),
      mat("7", "CORREIA P/ COMPRESSOR", "CORREIA EM V"),
    ]);
    const ver = (m: string) => s.filter((x) => x.material === m).map((x) => [x.ativo, x.nivel]).sort();
    expect(ver("5")).toEqual([["10000101", "alta"], ["10000102", "alta"]]);
    expect(ver("6")).toEqual([["10000301", "media"]]);
    expect(ver("7")).toEqual([["10000201", "baixa"]]);
  });
  it("não repete o que já está vinculado e agrupa por ativo para gravar", () => {
    const s = sugerirAlocacoes(ATIVOS, [mat("1", "KIT", "APLICACAO: PRENSA HIDRAULICA 01"), mat("8", "BUCHA", "APLICACAO: PRENSA HIDRAULICA 01")],
      (a) => new Set(a === "10000101" ? ["1"] : []));
    expect(s.map((x) => x.material)).toEqual(["8"]);
    expect([...porAtivo(s)]).toEqual([["10000101", ["8"]]]);
  });
});
