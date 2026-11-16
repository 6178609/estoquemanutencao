import { describe, expect, it } from "vitest";

import * as ind from "@/lib/wcm/indicadores";
import { prepararIw38 } from "@/lib/wcm/preparo";
import { dia } from "@/lib/wcm/util";

/** Regras dos indicadores (só dados fictícios). */
function dadosBase(p: Partial<ind.Dados> & { hoje: number }): ind.Dados {
  return {
    ordens: [], notas: null, oper: null, chamadas: null, estoque: null, requisicoes: null, cadEq: {}, cadMat: {}, capacidade: {},
    conf: null, confTodos: null, equipe: null, tipos: {}, horasSemana: 44, disponibilidade: {}, afs: null, acoesAf: null, centros: [],
    tiposFiltro: [], filtroAreaTipo: false, memo: new Map(), ...p,
  };
}

describe("farol: sem dados × sem meta", () => {
  const mtbf = ind.POR_ID.mtbf;
  it("sem valor e com meta: 'Sem dados' (a meta continua valendo)", () => {
    const f = ind.farol(mtbf, null, 60);
    expect(f).toBe("neutro");
    expect(ind.nomeFarol(f, null)).toBe("Sem dados");
    expect(ind.meta(mtbf, {})).toBe(60);
  });
  it("com valor e sem meta: 'Sem meta'", () => {
    const f = ind.farol(mtbf, 30, null);
    expect(ind.nomeFarol(f, 30)).toBe("Sem meta");
  });
  it("sem valor e sem meta: 'Sem dados'", () => expect(ind.nomeFarol(ind.farol(mtbf, null, null), null)).toBe("Sem dados"));
  it("com valor e meta: o nome do farol", () => {
    expect(ind.nomeFarol(ind.farol(mtbf, 70, 60), 70)).toBe("Na meta");
    expect(ind.nomeFarol(ind.farol(mtbf, 10, 60), 10)).toBe("Fora da meta");
  });
});

describe("backlog sem as encerradas sem confirmação", () => {
  const HOJE = dia(2026, 10, 20)!;
  const COLS = ["Ordem", "Status do sistema", "Data-base do início", "Data-base do fim", "Tipo de ordem"];
  const ordens = prepararIw38([
    ["1", "LIB", "01/10/2026", "05/10/2026", "YM12"],       // liberada e vencida: backlog e atrasada
    ["2", "ABER", "10/10/2026", "30/10/2026", "YM12"],      // aberta no prazo: backlog
    ["3", "ENTE", "02/10/2026", "03/10/2026", "YM12"],      // encerrada sem confirmação: fora do backlog
    ["4", "ENTE CONF", "02/10/2026", "03/10/2026", "YM12"], // concluída
    ["5", "LIB", "25/10/2026", "28/10/2026", "YM12"],       // futura: fora
  ].map((l) => Object.fromEntries(COLS.map((c, i) => [c, l[i]]))), HOJE).ordens;
  const d = dadosBase({ ordens, hoje: HOJE });
  it("backlog só com abertas e liberadas até hoje", () => expect(ind.backlog(d).map((x) => x.ordem)).toEqual(["1", "2"]));
  it("encerrada sem confirmação não fica atrasada nem com dias em aberto", () => {
    const o3 = ordens.find((x) => x.ordem === "3")!;
    expect([o3.atrasada, o3.diasEmAberto]).toEqual([false, null]);
    expect(ordens.find((x) => x.ordem === "1")!.atrasada).toBe(true);
  });
  it("lista à parte para cobrar o apontamento", () => {
    const esc = ind.encerradasSemConfirmacao(d);
    expect(esc.map((x) => [x.ordem, x.idade])).toEqual([["3", 18]]);
  });
  it("idade média do backlog sem as encerradas", () =>
    expect(ind.calcular(d, dia(2026, 10, 1)!, dia(2026, 10, 31)!).idade_backlog).toBe((19 + 10) / 2));
});
