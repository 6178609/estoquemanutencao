import { describe, expect, it } from "vitest";

import { calcular, montarEntrada } from "@/lib/paradas/montar";
import type { Operacao, Ordem } from "@/lib/wcm/preparo";

import { D, eq } from "./paradas-fixtures";

const linha = (x: Record<string, unknown>) => ({
  "Plano de manutenção": "500", "Item de manutenção": "1", "Data planejada": "12/11/2026", "St.solicitação": "Programado,espera (Inspeção)",
  Trabalho: "60", "Unidade do trabalho": "MIN", "Centro trab.responsável": "MEC_COMP", Equipamento: "EQ-1", Ordem: "", ...x,
});

describe("montagem da programação", () => {
  it("bases fictícias → entrada do motor → conferências", () => {
    const eqs = [eq("EQ-1", "GAL1", "C-100", "INJETORA PVC TESTE 008"), eq("EQ-2", "GAL1", "C-200", "INJETORA 01 TESTE GOLDEN EAGLE"),
      eq("EQ-3", "GAL2", "C-300", "PAN STONE 01 TESTE")];
    const ip19 = [
      linha({}), linha({ "Item de manutenção": "2", "St.solicitação": "Concluído" }),
      linha({ "Item de manutenção": "3", "Centro trab.responsável": "ELMC_MTZ" }),
      linha({ "Plano de manutenção": "600", Equipamento: "EQ-2", Trabalho: "0", "Centro trab.responsável": "", Ordem: "9000001" }),
      linha({ "Plano de manutenção": "700", Equipamento: "EQ-3" }),
    ];
    const ops = [{ ordem: "9000001", operacao: "0010", centroTrabalho: "ELE_COMP", horas: 1.5, cancelada: false }] as Operacao[];
    const m = montarEntrada({ ip19, ordens: [] as Ordem[], ops, eqs, campoGeral: () => "", cad: null, hoje: D(2026, 11, 10) });
    expect(m.leitura.descartes).toMatchObject({ "concluída ou ignorada": 1, "centro eliminado": 1, "outra localização": 1 });
    expect(m.completadas["iw38op-ordem"]).toBe(1);
    expect(m.entrada.demandas.map((d) => [d.ativo, d.hh])).toEqual([["GOLDEN 01", { mec: 0, ele: 1.5 }], ["PVC 08", { mec: 1, ele: 0 }]]);
    expect(m.entrada.inicio).toBe(D(2026, 11, 10));
    expect(m.entrada.fim).toBe(D(2027, 1, 31));
    const c = calcular(m.entrada);
    const res = Object.fromEntries(c.conferencias.map((x) => [x.id, x.resultado]));
    for (const id of ["C1", "C2", "C3", "C4", "C5", "C6", "C7", "C9"]) expect(res[id]).toBe("OK");
    expect(c.r.linhas.map((l) => l.ativo).sort()).toEqual(["GOLDEN 01", "PVC 08"]);
  });

  it("ativo sem classe fica no quadro Fora das classes", () => {
    const eqs = [eq("EQ-1", "GAL1", "C-100", "INJETORA PVC TESTE 008"), eq("EQ-9", "GAL1", "C-900", "MAQUINA XYZ TESTE")];
    const ip19 = [linha({}), linha({ "Plano de manutenção": "900", Equipamento: "EQ-9" })];
    const m = montarEntrada({ ip19, ordens: null, ops: null, eqs, campoGeral: () => "", cad: null, hoje: D(2026, 11, 10) });
    expect(m.entrada.demandas.map((d) => d.ativo)).toEqual(["PVC 08"]);
    expect(m.foraDasClasses).toEqual([expect.objectContaining({ ativo: "MAQUINA XYZ TESTE", campos: ["C-900"], hh: { mec: 1, ele: 0 }, itens: 1 })]);
    const todos = montarEntrada({ ip19, ordens: null, ops: null, eqs, campoGeral: () => "", cad: { parametros: { soClasses: false } }, hoje: D(2026, 11, 10) });
    expect(todos.entrada.demandas.map((d) => d.ativo)).toEqual(["MAQUINA XYZ TESTE", "PVC 08"]);
    expect(todos.foraDasClasses).toEqual([]);
  });

  it("fixações e parâmetros do cadastro", () => {
    const cad = { parametros: { inicio: "2026-11-02", meses: 1 },
      "fixacao:2026-11|PVC 08|1": { mes: "2026-11", ativo: "PVC 08", parada: 1, data: "2026-11-20", turno: 2 },
      "fixacao:ruim": { mes: "2026-11", ativo: "X", parada: 3, data: "2026-11-20", turno: 2 } };
    const m = montarEntrada({ ip19: [linha({})], ordens: null, ops: null, eqs: [eq("EQ-1", "GAL1", "C-100", "INJETORA PVC TESTE 008")],
      campoGeral: () => "", cad, hoje: D(2026, 11, 10) });
    expect(m.entrada.inicio).toBe(D(2026, 11, 2));
    expect(m.entrada.fixacoes).toEqual([{ id: "2026-11|PVC 08|1", mes: "2026-11", ativo: "PVC 08", parada: 1, data: D(2026, 11, 20), turno: 2 }]);
    expect(calcular(m.entrada).r.linhas.map((l) => [l.data, l.turno])).toEqual([[D(2026, 11, 20), 2]]);
  });
});
