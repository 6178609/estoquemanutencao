import { describe, expect, it } from "vitest";

import { disciplinaDoCentro, itensDaIp19 } from "@/lib/paradas/leitura";
import { PARAMETROS_PADRAO } from "@/lib/paradas/parametros";
import type { Equipamento } from "@/lib/wcm/preparo";
import { dia } from "@/lib/wcm/util";

import { eq } from "./paradas-fixtures";

const MESES = new Set(["2026-11", "2026-12"]);
const P = PARAMETROS_PADRAO;
const EQS = new Map<string, Equipamento>([["EQ-1", eq("EQ-1", "GAL1")], ["EQ-2", eq("EQ-2", "GAL2")]]);

function linha(x: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    "Plano de manutenção": "500", "Item de manutenção": "1", "Data planejada": "05/11/2026", "St.solicitação": "Programado,espera (Inspeção)",
    "Trabalho": "30", "Unidade do trabalho": "MIN", "Centro trab.responsável": "MEC_COMP", "Equipamento": "EQ-1",
    "Localização": "GAL1", "Grp.plnj.PM": "P01", "Ordem": "", ...x,
  };
}

describe("leitura da IP19", () => {
  it("disciplina pelo centro de trabalho", () => {
    expect(disciplinaDoCentro("ELE_COMP")).toBe("ELE");
    for (const c of ["MEC_COMP", "COMPONEN", "UTILIDAD"]) expect(disciplinaDoCentro(c)).toBe("MEC");
    // só os centros de Componentes do parâmetro
    for (const c of ["ELE_MONT", "ELE_GPA", "MEC_GPA"]) expect(disciplinaDoCentro(c)).toBeNull();
    expect(disciplinaDoCentro("ELE_GPA", ["ELE_GPA"])).toBe("ELE");
    expect(disciplinaDoCentro("MEC_GPA", ["MEC_GPA"])).toBe("MEC");
    expect(disciplinaDoCentro("")).toBe("vazio");
    expect(disciplinaDoCentro("PRED_CIV")).toBeNull();
  });

  it("HH pela unidade do trabalho (padrão MIN sem a coluna)", () => {
    const a = itensDaIp19([linha(), linha({ "Item de manutenção": "2", Trabalho: "2", "Unidade do trabalho": "H" })], P, EQS, MESES);
    expect(a.itens.map((i) => i.hh)).toEqual([0.5, 2]);
    const semUnidade = linha({ Trabalho: "45" });
    delete semUnidade["Unidade do trabalho"];
    expect(itensDaIp19([semUnidade], P, EQS, MESES).itens[0].hh).toBe(0.75);
  });

  it("situação: concluída e ignorada saem; as outras ficam", () => {
    const r = itensDaIp19([
      linha({ "St.solicitação": "Concluído" }), linha({ "St.solicitação": "Ignorado" }),
      linha({ "Item de manutenção": "3", "St.solicitação": "Programado,espera (Inspeção)" }),
      linha({ "Item de manutenção": "4", "St.solicitação": "Reinício" }), linha({ "Item de manutenção": "5", "St.solicitação": "InícCiclo" }),
      linha({ "Item de manutenção": "6", "St.solicitação": "Datas adicionais (simulação)" }),
    ], P, EQS, MESES);
    expect(r.descartes["concluída ou ignorada"]).toBe(2);
    expect(r.itens).toHaveLength(4);
    const conc = itensDaIp19([linha({ "Data de conclusão": "06/11/2026" })], P, EQS, MESES);
    expect(conc.itens).toHaveLength(0);
  });

  it("localização pela IH08 quando a IP19 não traz a coluna", () => {
    const a = linha(), b = linha({ Equipamento: "EQ-2", "Item de manutenção": "2" });
    delete a["Localização"]; delete b["Localização"];
    const r = itensDaIp19([a, b], P, EQS, MESES);
    expect(r.itens.map((i) => i.equipamento)).toEqual(["EQ-1"]);
    expect(r.descartes["outra localização"]).toBe(1);
  });

  it("centros, grupo de planejamento e horizonte", () => {
    const r = itensDaIp19([linha({ "Centro trab.responsável": "ELMC_MTZ" }), linha({ "Centro trab.responsável": "PRED_CIV" }),
      linha({ "Data planejada": "05/01/2027" }), linha({ "Plano de manutenção": "" })], P, EQS, MESES);
    expect(r.descartes).toMatchObject({ "centro eliminado": 1, "fora de Componentes": 1, "fora do horizonte": 1, "sem plano ou data": 1 });
    expect(r.itens).toHaveLength(0);
    const g = itensDaIp19([linha({ "Grp.plnj.PM": "P02" }), linha()], { ...P, gruposPlanejamento: ["P01"] }, EQS, MESES);
    expect(g.itens).toHaveLength(1);
    expect(g.descartes["outro grupo de planejamento"]).toBe(1);
  });

  it("centro vazio: MEC com centro assumido", () => {
    const r = itensDaIp19([linha({ "Centro trab.responsável": "", Trabalho: "0" })], P, EQS, MESES);
    expect(r.itens[0]).toMatchObject({ disciplina: "MEC", centroAssumido: true, centro: "", hh: 0 });
    expect(r.semCentro).toBe(1);
  });

  it("operações da mesma chamada: chaves em sequência, mesmo mês", () => {
    const r = itensDaIp19([linha(), linha({ "Centro trab.responsável": "ELE_COMP" })], P, EQS, MESES);
    const d = dia(2026, 11, 5)!;
    expect(r.itens.map((i) => i.chave)).toEqual([`500|1|${d}|0`, `500|1|${d}|1`]);
    expect(r.itens.map((i) => i.mes)).toEqual(["2026-11", "2026-11"]);
    expect(r.itens.map((i) => i.disciplina)).toEqual(["MEC", "ELE"]);
    expect(r.itens[0]).toMatchObject({ campo: "", ativo: "", origemHh: "ip19", dataIp19: d });
  });
});
