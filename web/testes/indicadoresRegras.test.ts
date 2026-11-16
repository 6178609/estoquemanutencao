import { describe, expect, it } from "vitest";

import * as ind from "@/lib/wcm/indicadores";
import { cruzarBases, dataDosDados } from "@/lib/wcm/cruzamento";
import { lerFiltros, textoDadosAte } from "@/lib/wcm/filtros";
import {
  marcarQuebras, prepararIw38, quebrasDasOrdens, regraQuebra, TEXTO_REGRA_QUEBRA, tiposPorOrdem, type Confirmacao, type Nota, type Operacao,
} from "@/lib/wcm/preparo";
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

// ---------------------------------------------------------------------------------------------------------------
// quebras: Y1 → YM11, ou toda ordem YM11 quando a IW28 não traz Y1
// ---------------------------------------------------------------------------------------------------------------
const NOTA_BASE: Nota = {
  nota: "", ordem: "", tipoNota: "", descricao: "", equipamento: "", objeto: "", local: "", centroTrabalho: "", localizacao: "",
  notificador: "", criadoPor: "", codigoAbc: "", plano: "", inicioAvaria: null, fimAvaria: null, dataNota: null, comParada: false,
  horasParado: 0, comOrdem: false, data: null, dias: null, equipChave: "", setor: "", tipoOrdem: "", quebra: false,
};
const nota = (n: string, tipoNota: string, ordem: string, eq: string, data: number, abc = ""): Nota =>
  ({ ...NOTA_BASE, nota: n, tipoNota, ordem, equipamento: eq, equipChave: eq, data, dataNota: data, comOrdem: ordem !== "", codigoAbc: abc });

describe("regra de quebra", () => {
  const HOJE = dia(2026, 10, 20)!;
  const COLS = ["Ordem", "Status do sistema", "Data-base do início", "Tipo de ordem", "Equipamento", "Data de entrada", "Localização"];
  const ordens = prepararIw38([
    ["10", "LIB", "02/10/2026", "YM11", "E1", "02/10/2026", "A1"],
    ["11", "ENTE CONF", "12/10/2026", "YM11", "E1", "12/10/2026", "A1"],   // reincidente (10 dias)
    ["12", "ENTE CONF", "05/10/2026", "YM12", "E2", "05/10/2026", "A1"],   // corretiva programada: não é quebra
    ["13", "LIB", "06/10/2026", "YM11", "E3", "06/10/2026", "A2"],         // tem nota (Y2): a nota é a quebra
    ["14", "LIB", "07/10/2026", "YM11", "E4", "07/10/2026", "A1"],
  ].map((l) => Object.fromEntries(COLS.map((c, i) => [c, l[i]]))), HOJE).ordens;
  const cancelada = prepararIw38([Object.fromEntries(COLS.map((c, i) => [c, ["15", "LIB", "08/10/2026", "YM11", "E5", "08/10/2026", "A1"][i]]))]
    .map((l) => ({ ...l, "Status usuário": "CAN" })), HOJE).ordens;
  const tipos = tiposPorOrdem([...ordens, ...cancelada], [], []);

  it("com alguma Y1 na IW28 vale a regra da planta (Y1 → YM11)", () => {
    const notas = [nota("1", "Y1", "10", "E1", dia(2026, 10, 2)!), nota("2", "Y2", "13", "E3", dia(2026, 10, 6)!)];
    expect(regraQuebra(notas)).toBe("y1");
    expect(marcarQuebras(notas, tipos).map((n) => n.quebra)).toEqual([true, false]);
  });

  it("sem nenhuma Y1, toda ordem YM11 é quebra (a nota da ordem YM11 conta uma vez só)", () => {
    const notas = [nota("2", "Y2", "13", "E3", dia(2026, 10, 6)!), nota("3", "Y2", "", "E9", dia(2026, 10, 6)!)];
    expect(regraQuebra(notas)).toBe("ym11");
    expect(regraQuebra(null)).toBe("ym11");
    const x = cruzarBases({ ordens: [...ordens, ...cancelada], notas, oper: [], conf: [], equipamentos: null, calendario: HOJE });
    expect(x.regraQuebra).toBe("ym11");
    expect(x.notas!.map((n) => n.quebra)).toEqual([true, false]);
    expect(x.quebrasOrdem.map((q) => q.ordem).sort()).toEqual(["10", "11", "14"]); // sem a 12 (YM12), 13 (tem nota) e 15 (cancelada)
    const d = dadosBase({ ordens, notas: x.notas, quebrasOrdem: x.quebrasOrdem, regraQuebra: x.regraQuebra, hoje: HOJE });
    const q = ind.quebras(d);
    expect(q.map((y) => y.ordem)).toEqual(["10", "13", "14", "11"]);
    expect(q.find((y) => y.ordem === "11")!.reincidente).toBe(true);
    const r = ind.calcular(d, dia(2026, 10, 1)!, dia(2026, 10, 20)!);
    expect(r.quebras).toBe(4);
    expect(r.reincidencia).toBe(25);
    expect(r.mtbf).toBeCloseTo((20 * 3) / 4);
  });

  it("ordem YM11 só no IW38OP ou na IW47 também entra, com a data da operação ou da 1ª confirmação", () => {
    const oper = [{ ordem: "20", tipo: "YM11", equipamento: "E7", objeto: "", local: "", centroTrabalho: "MEC", textoOperacao: "Troca",
      inicio: dia(2026, 10, 9)!, cancelada: false }, { ordem: "20", tipo: "YM11", equipamento: "E7", objeto: "", local: "", centroTrabalho: "MEC",
      textoOperacao: "Teste", inicio: dia(2026, 10, 8)!, cancelada: true }] as unknown as Operacao[];
    const conf = [{ ordem: "21", tipo: "YM11", equipamento: "E8", centroTrabalho: "ELE", texto: "Reparo", data: dia(2026, 10, 11)!, np: "1", horas: 2 },
      { ordem: "21", tipo: "YM11", equipamento: "E8", centroTrabalho: "ELE", texto: "Reparo", data: dia(2026, 10, 10)!, np: "1", horas: 1 }] as unknown as Confirmacao[];
    const q = quebrasDasOrdens([], oper, conf, [], new Map([["E8", "A"]]), HOJE);
    expect(q.map((x) => [x.ordem, x.data, x.codigoAbc, x.quebra])).toEqual([["20", dia(2026, 10, 8), "", true], ["21", dia(2026, 10, 10), "A", true]]);
  });

  it("com filtro de tipo sem YM11 os indicadores de quebra não se aplicam; IW28 ausente não impede a regra YM11", () => {
    const x = cruzarBases({ ordens, notas: null, oper: [], conf: [], equipamentos: null, calendario: HOJE });
    const d = dadosBase({ ordens, quebrasOrdem: x.quebrasOrdem, regraQuebra: x.regraQuebra, hoje: HOJE });
    expect(ind.calcular(d, dia(2026, 10, 1)!, dia(2026, 10, 20)!).quebras).toBe(4);
    expect(ind.calcular({ ...d, tiposFiltro: ["YM12"], memo: new Map() }, dia(2026, 10, 1)!, dia(2026, 10, 20)!).quebras).toBeNull();
  });

  it("textos da regra para as telas", () => {
    expect(TEXTO_REGRA_QUEBRA.ym11).toBe("Quebras pelas ordens YM11 (a IW28 não traz notas Y1)");
  });
});

// ---------------------------------------------------------------------------------------------------------------
// data dos dados: o "hoje" dos indicadores
// ---------------------------------------------------------------------------------------------------------------
describe("data dos dados", () => {
  const CAL = dia(2026, 11, 16)!;
  const COLS = ["Ordem", "Status do sistema", "Data-base do início", "Data-base do fim", "Tipo de ordem", "Data de entrada"];
  const ordens = prepararIw38([
    ["1", "LIB", "10/11/2026", "13/11/2026", "YM15", "10/11/2026"], // vence depois da data dos dados: não está atrasada
    ["2", "LIB", "01/11/2026", "05/11/2026", "YM15", "11/11/2026"], // vencida antes: atrasada
    ["3", "ABER", "20/12/2026", "21/12/2026", "YM15", "12/11/2026"], // planejada no futuro (data-base não conta)
  ].map((l) => Object.fromEntries(COLS.map((c, i) => [c, l[i]]))), CAL).ordens;

  it("última data de entrada / apontamento / fim real, nunca depois do calendário", () => {
    expect(dataDosDados(ordens, [], [], CAL)).toBe(dia(2026, 11, 12));
    const conf = [{ data: dia(2026, 11, 13)! }] as unknown as Confirmacao[];
    expect(dataDosDados(ordens, [], conf, CAL)).toBe(dia(2026, 11, 13));
    const oper = [{ fimReal: dia(2026, 11, 14)! }] as unknown as Operacao[];
    expect(dataDosDados(ordens, oper, conf, CAL)).toBe(dia(2026, 11, 14));
    expect(dataDosDados(ordens, [], [{ data: dia(2026, 11, 30)! }] as unknown as Confirmacao[], CAL)).toBe(CAL);
    expect(dataDosDados(null, null, null, CAL)).toBe(CAL);
  });

  it("atraso e dias contam até a data dos dados", () => {
    expect(ordens.find((o) => o.ordem === "1")!.atrasada).toBe(true); // pelo calendário (16/11)
    const x = cruzarBases({ ordens, notas: [nota("9", "Y2", "", "E1", dia(2026, 11, 2)!)], oper: [], conf: [], equipamentos: null, calendario: CAL });
    expect(x.hoje).toBe(dia(2026, 11, 12));
    expect(x.ordens!.map((o) => [o.ordem, o.atrasada, o.diasEmAberto])).toEqual([["1", false, 2], ["2", true, 1], ["3", false, 0]]);
    expect(x.notas![0].dias).toBe(10);
  });

  it("período padrão termina na data dos dados e a barra avisa", () => {
    const hojeDados = dia(2026, 11, 12)!;
    const f = lerFiltros({}, null, hojeDados);
    expect([f.ini, f.fim]).toEqual([dia(2026, 11, 1), hojeDados]);
    expect(lerFiltros({}, encodeURIComponent(JSON.stringify({ atalho: "Últimos 3 meses" })), hojeDados).fim).toBe(hojeDados);
    expect(textoDadosAte(hojeDados, CAL)).toBe("Dados até 12/11/2026");
    expect(textoDadosAte(CAL, CAL)).toBeUndefined();
  });
});
