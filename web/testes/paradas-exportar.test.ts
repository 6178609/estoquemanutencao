import { describe, expect, it } from "vitest";

import { abasDaProgramacao } from "@/lib/paradas/exportar";
import { calcular, montarEntrada } from "@/lib/paradas/montar";

import { D, eq } from "./paradas-fixtures";

const linha = (x: Record<string, unknown>) => ({
  "Plano de manutenção": "500", "Item de manutenção": "1", "Data planejada": "12/11/2026", "St.solicitação": "Programado",
  Trabalho: "60", "Unidade do trabalho": "MIN", "Centro trab.responsável": "MEC_COMP", Equipamento: "EQ-1", Ordem: "", ...x,
});

describe("Baixar Excel da programação", () => {
  it("as abas equivalentes às visões, com cabeçalhos e linhas", () => {
    const m = montarEntrada({ ip19: [linha({}), linha({ "Plano de manutenção": "900", Equipamento: "EQ-9" })], ordens: null, ops: null,
      eqs: [eq("EQ-1", "GAL1", "C-100", "INJETORA PVC TESTE 008"), eq("EQ-9", "GAL1", "C-900", "MAQUINA XYZ TESTE")], campoGeral: () => "",
      cad: { parametros: { meses: 1 } }, hoje: D(2026, 11, 10) });
    const abas = abasDaProgramacao(m, calcular(m.entrada));
    expect(abas.map((a) => a.nome)).toEqual(["Programação", "Saldo HH", "Campos por dia", "Ativos sem HH", "Retirados", "Fora das classes", "Verificação"]);
    const prog = abas[0];
    expect(prog.colunas.map((c) => c.titulo).slice(0, 5)).toEqual(["Data", "Dia", "Semana", "Turno", "Ativo"]);
    expect(prog.linhas).toHaveLength(1);
    expect(prog.linhas[0][4]).toBe("PVC 08");
    expect(abas[1].linhas).toHaveLength(30);
    expect(abas[2].linhas[0].at(-1)).toBe("C-100");
    expect(abas[5].linhas).toEqual([["MAQUINA XYZ TESTE", "MAQUINA XYZ TESTE", "C-900", "EQ-9", 1, 0, 1]]);
    expect(abas[6].linhas).toHaveLength(11);
    for (const a of abas) for (const l of a.linhas) expect(l).toHaveLength(a.colunas.length);
  });
});
