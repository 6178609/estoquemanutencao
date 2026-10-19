import { describe, expect, it } from "vitest";

import { aplicacaoDe, incluirPecas, palavras, porAtivo, sugerirAlocacoes } from "@/app/(app)/mro/alocacao";
import { MAX_PECAS } from "@/app/(app)/mro/logica";

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
  it("falsos positivos: referência do fabricante, CA, número curto, campo só número e modelo genérico não casam", () => {
    const ativos = [
      { codigo: "10000401", nome: "SERRA FITA 01", campo: "0101", modelo: "STANDARD", fabricante: "BETA" },
      { codigo: "10000402", nome: "MESA ROLETADA 02", modelo: "MESA" },
      { codigo: "12345", nome: "ESTEIRA 05" },
    ];
    const s = sugerirAlocacoes(ativos, [
      mat("20", "LUVA NITRILICA", "LUVA; CA: 10000401"),           // número do CA igual ao código do ativo
      mat("21", "ROLAMENTO 6205", "ROLAMENTO; REF: 10000402"),      // referência do fabricante
      mat("22", "PARAFUSO M8 X 0101", "PARAFUSO"),                  // campo só número
      mat("23", "ARRUELA 12345", "ARRUELA"),                       // código curto só número
      mat("24", "CHAPA STANDARD BETA", "CHAPA"),                   // modelo sem número
    ]);
    expect(s).toEqual([]);
  });
  it("aplicação com número que casa com muitos ativos vira média; muitos com o mesmo modelo: fabricante + modelo vira média", () => {
    const muitos = Array.from({ length: 6 }, (_, k) => ({ codigo: `2000000${k}`, nome: `BOMBA ${k + 1}`, fabricante: "ACME", modelo: "B50" }));
    const linhas = ["TORNO", "FRESA", "PLAINA", "RETIFICA"].map((n, k) => ({ codigo: `3000000${k}`, nome: `${n} CNC 01` }));
    const s = sugerirAlocacoes([...muitos, ...linhas], [
      mat("30", "SELO MECANICO ACME B50", "SELO"),
      mat("31", "CORREIA", "CORREIA; APLICACAO: CNC 01"),
    ]);
    expect(new Set(s.filter((x) => x.material === "30").map((x) => x.nivel))).toEqual(new Set(["media"]));
    expect(s.filter((x) => x.material === "31").map((x) => x.nivel)).toEqual(["media", "media", "media", "media"]);
  });
  it("código com zeros à esquerda: sugere sem zeros e não repete o já vinculado com zeros", () => {
    const s = sugerirAlocacoes(ATIVOS, [mat("000123", "KIT", "APLICACAO: PRENSA HIDRAULICA 01")], (a) => new Set(a === "10000102" ? ["000123"] : []));
    expect(s.map((x) => [x.ativo, x.material])).toEqual([["10000101", "123"]]);
    expect(sugerirAlocacoes(ATIVOS, [mat("000123", "KIT", "APLICACAO: PRENSA HIDRAULICA 01")], () => new Set(["0123"]))).toEqual([]);
  });
  it("incluirPecas: conta só o que entrou (sem o que já estava, com ou sem zeros) e respeita o limite", () => {
    const r = incluirPecas({ nome: "X", materiais: ["000123", "5"] }, ["123", "5", "9"]);
    expect(r.incluidos).toEqual(["9"]);
    expect(r.item?.materiais).toEqual(["000123", "5", "9"]);
    expect(incluirPecas({ materiais: ["1"] }, ["1"]).item).toBeUndefined();
    const cheio = { materiais: Array.from({ length: MAX_PECAS - 1 }, (_, k) => `M${k}`) };
    const r2 = incluirPecas(cheio, ["A1", "A2", "A3"]);
    expect(r2.incluidos).toEqual(["A1"]);
    expect(r2.foraDoLimite).toBe(2);
  });
});
