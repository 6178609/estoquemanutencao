import { describe, expect, it } from "vitest";

import { identificar } from "@/lib/leitura/tipos";
import * as planos from "@/lib/wcm/planos";
import { prepararIw38, type Crua } from "@/lib/wcm/preparo";
import { dataBr, dia, type Dia } from "@/lib/wcm/util";

/** Só dados fictícios. */
const HOJE = dia(2026, 10, 1)!; // quinta-feira da semana ISO 40
const D = (a: number, m: number, d: number) => dia(a, m, d)!;
const tabela = (cols: string[], linhas: string[][]): Crua[] => linhas.map((l) => Object.fromEntries(cols.map((c, i) => [c, l[i]])));

const IW38_COLS = ["Centro", "Denominação do loc.instalação", "Equipamento", "Denominação do objeto técnico", "Centro trab.respons.",
  "Ordem", "Plano de manutenção", "Texto breve", "Status do sistema", "Data-base do início", "Data-base do fim",
  "Data de entrada", "Criado por", "Prioridade", "Tipo de ordem", "Status usuário", "Custos tot.reais"];
const iw38Cru = () => tabela(IW38_COLS, [
  ["A026", "ACABAMENTO", "41001404", "PRENSA 01", "MECA", "1", "", "VAZAMENTO", "ABER CAPC", "01/09/2026", "02/09/2026",
    "01/09/2026", "JOAO", "1", "YM01", "PLA", "1.500,00"],
  ["A026", "ACABAMENTO", "41001404", "PRENSA 01", "MECA", "2", "20976", "PREVENTIVA", "LIB  CAPC", "01/12/2099", "02/12/2099",
    "01/09/2026", "JOAO", "2", "YM02", "PRO", "0"],
  ["A026", "UTILIDADES", "41001435", "COMPRESSOR", "ELET", "3", "", "TROCA MOTOR", "ENTE CONF", "01/08/2026", "05/08/2026",
    "01/08/2026", "ANA", "1", "YM01", "", "300"],
  ["A026", "FABRICA PILOTO", "41009999", "MAQUINA X", "FABPILOT", "4", "", "PILOTO", "ABER", "01/08/2026", "", "", "", "", "YM01", "", "10"],
  ["A026", "ACABAMENTO", "41001404", "PRENSA 01", "MECA", "5", "", "CANCELADA", "LIB", "01/08/2026", "", "", "", "", "YM01", "CAN", "0"],
]);
const iw38 = () => prepararIw38(iw38Cru(), HOJE).ordens;

const IP19_COLS = ["Plano manutenção", "Item manutenção", "Texto plano manutenção", "Equipamento", "Denominação do objeto técnico",
  "Centro de trabalho", "Ciclo", "Data planejada", "Data de chamada", "Data de conclusão", "Tipo de programação", "Ordem"];
const P = ["20976", "1", "PREV MENSAL PRENSA", "41001404", "PRENSA 01", "MECA", "Mensal"];
const ip19Cru = () => tabela(IP19_COLS, [
  // plano 20976 (o mesmo da ordem 2 do IW38 de teste)
  [...P, "07.09.2026", "31.08.2026", "10.09.2026", "Concluído", "9"],
  [...P, "14.09.2026", "07.09.2026", "", "Programado, chamado", "1"],
  [...P, "21.09.2026", "", "", "Programado, em espera", ""],
  [...P, "28.09.2026", "", "", "Saltado", ""],
  [...P, "05.10.2026", "28.09.2026", "", "Programado, chamado", "2"],
  [...P, "12.10.2026", "", "", "Programado, em espera", ""],
  [...P, "13.10.2026", "", "", "Programado, em espera", ""],
  ["30001", "", "LUBRIFICAÇÃO", "", "", "", "", "06.10.2025", "", "", "Programado, em espera", "3"],
]);

describe("planos (IP19)", () => {
  it("identifica a IP19 sem confundir com o IW38", () => {
    expect(identificar(IP19_COLS)).toBe("ip19");
    expect(identificar(IW38_COLS)).toBe("iw38"); // IW38 também tem "Plano de manutenção"
  });

  it("situação das chamadas cruzando com o IW38", () => {
    const ch = planos.classificar(planos.prepararIp19(ip19Cru()), iw38(), HOJE);
    const porData = Object.fromEntries(ch.map((c) => [dataBr(c.dataPlanejada), c.situacao]));
    expect(porData["06/10/2025"]).toBe(planos.CONCLUIDA); // ordem 3 está encerrada (ENTE CONF) no IW38
    expect(porData["07/09/2026"]).toBe(planos.CONCLUIDA);
    expect(porData["14/09/2026"]).toBe(planos.ATRASADA);
    expect(porData["21/09/2026"]).toBe(planos.ATRASADA);
    expect(porData["28/09/2026"]).toBe(planos.SALTADA);
    expect(porData["05/10/2026"]).toBe(planos.ABERTA);
    expect(porData["12/10/2026"]).toBe(planos.PROGRAMADA);
    // centro de trabalho vazio na IP19 é completado pela ordem do IW38
    expect(ch.find((c) => c.plano === "30001")!.centroTrabalho).toBe("ELET");
    const c3 = ch.find((c) => c.ordem === "3")!;
    expect([c3.situacaoIw38, c3.custoReal, c3.chave, c3.ano, c3.semana]).toEqual(["Concluída", 300, "30001", 2025, 41]);
  });

  it("calendário entre datas", () => {
    const ch = planos.classificar(planos.prepararIp19(ip19Cru()), null, HOJE);
    const cal = planos.montarCalendario(ch, D(2026, 1, 1), D(2026, 12, 31));
    expect(cal.linhas.map((l) => l.plano)).toEqual(["20976 / 1"]);
    const l = cal.linhas[0];
    expect(cal.semanas[0]).toBe("S01");
    expect(cal.semanas.at(-1)).toBe("S53");
    expect(cal.semanas).toHaveLength(53); // 2026 tem 53 semanas ISO
    expect([l.situacao.S37, l.texto.S37]).toEqual([planos.CONCLUIDA, "✓"]);
    expect(l.situacao.S39).toBe(planos.ATRASADA);
    expect(l.texto.S42).toBe("○2"); // duas chamadas na mesma semana
    expect([l.texto.S01, l.situacao.S01]).toEqual(["", ""]);
    expect(l.ciclo).toBe("Mensal");
    expect([l.descricao, l.equipamento, l.centro, l.chamadas, l.atrasadas]).toEqual(["PREV MENSAL PRENSA", "PRENSA 01", "MECA", 7, 2]);
    expect(planos.colunaDaSemana(D(2026, 10, 1), D(2026, 1, 1), D(2026, 12, 31))).toBe("S40");
    const marcas = planos.marcasDosMeses(planos.semanasEntre(D(2026, 1, 1), D(2026, 12, 31)));
    expect(marcas.S01).toBe("Jan");
    expect(Object.values(marcas)).toContain("Out");
    const cel = planos.celulas(ch, D(2026, 1, 1), D(2026, 12, 31), ["20976 / 1"], { "20976 / 1": "PREV" });
    expect(new Set(cel.map((c) => c.semana))).toEqual(new Set(["S37", "S38", "S39", "S40", "S41", "S42"]));
    const s42 = cel.find((c) => c.semana === "S42")!;
    expect(s42).toMatchObject({ plano: "20976 / 1 · PREV", chamadas: 2, simbolo: "○2", periodo: "12/10 a 18/10/2026",
      datas: "12/10, 13/10", ordens: "—" });

    // só um pedaço do ano, e um intervalo que atravessa o ano (rótulos com /aa)
    const curto = planos.montarCalendario(ch, D(2026, 9, 14), D(2026, 9, 27));
    expect(curto.semanas).toEqual(["S38", "S39"]);
    expect(curto.linhas[0].chamadas).toBe(2);
    const virada = planos.montarCalendario(ch, D(2025, 10, 1), D(2026, 10, 1));
    expect(virada.semanas).toContain("S41/25");
    expect(virada.semanas).toContain("S40/26");
    expect(new Set(virada.linhas.map((x) => x.plano))).toEqual(new Set(["20976 / 1", "30001"]));
    expect(planos.marcasDosMeses(virada.segundas)["S40/25"]).toBe("Out/25");
  });

  it("sem IP19 usa as ordens com plano do IW38", () => {
    const o = iw38();
    const ch = planos.classificar(planos.deIw38(o), o, HOJE);
    expect(ch.map((c) => c.plano)).toEqual(["20976"]);
    expect(ch[0].situacao).toBe(planos.ABERTA);
    const cal = planos.montarCalendario(ch, D(2099, 1, 1), D(2099, 12, 31));
    expect(cal.linhas[0].ciclo).toBe(""); // uma chamada só: ciclo não estimável
  });

  it("junta as operações da chamada, tira a atividade e a matrizaria", () => {
    const cols = ["Plano de manutenção", "Item manutenção", "Texto plano manut.", "Centro trab.respons.", "Data planejada",
      "St.solicitação", "Unidade do trabalho", "Trabalho", "Data de conclusão"];
    const ch = planos.prepararIp19(tabela(cols, [
      ["500", "", "LUBRIFICAR", "MEC_MONT", "03.11.2099", "Programado,espera (Inspeção)", "MIN", "30", ""],
      ["500", "", "LUBRIFICAR", "MEC_MONT", "03.11.2099", "Programado,espera (Inspeção)", "H", "1,5", "04.11.2099"],
      ["500", "", "LUBRIFICAR", "MEC_MONT", "", "Programado,espera (Simulação)", "MIN", "60", ""], // sem data: sai
      ["501", "", "AJUSTE MATRIZARIA", "MEC_MONT", "03.11.2099", "", "H", "1", ""],
      ["502", "", "PREVENTIVA", "FABPILOT", "03.11.2099", "", "H", "1", ""],
      ["", "", "SEM PLANO", "MEC_MONT", "03.11.2099", "", "H", "1", ""],
      ["499", "", "CHECAR", "", "10.11.2099", "Programado (Simulação)", "XYZ", "2", ""],
    ]));
    expect(ch.map((c) => c.plano)).toEqual(["499", "500"]);
    const c = ch[1];
    expect([c.operacoes, c.horas, c.atividade, c.setor, c.dataConclusao]).toEqual([2, 2, "Inspeção", "Montagem", D(2099, 11, 4)]);
    expect([ch[0].atividade, ch[0].horas]).toEqual(["", 2]); // simulação não é atividade; unidade desconhecida = hora
    expect(planos.prepararIp19(tabela(cols, [["501", "", "AJUSTE MATRIZARIA", "X", "03.11.2099", "", "H", "1", ""]]), false))
      .toHaveLength(1);
  });

  it("IP19 sem coluna de ordem: liga a chamada à ordem do mesmo plano mais próxima", () => {
    const cols = ["Plano de manutenção", "Texto plano manut.", "Data planejada", "St.solicitação"];
    const ip = planos.prepararIp19(tabela(cols, [
      ["20976", "PREV", "25.11.2099", "Programado, chamado"],
      ["20976", "PREV", "28.11.2099", ""],
      ["20976", "PREV", "01.12.2099", "Programado, em espera"], // espera não rouba a ordem
      ["20976", "PREV", "20.12.2099", ""], // fora da janela de 10 dias
    ]));
    const ch = planos.classificar(ip, iw38(), HOJE);
    expect(ch.map((c) => c.ordem)).toEqual(["", "2", "", ""]);
    expect(ch.map((c) => c.situacao)).toEqual([planos.ABERTA, planos.ABERTA, planos.PROGRAMADA, planos.PROGRAMADA]);
    expect(ch[1]).toMatchObject({ situacaoIw38: "Liberada", centroTrabalho: "MECA", objeto: "PRENSA 01" });
    expect(planos.JANELA_DIAS).toBe(10);
  });

  it("ciclo estimado pelo intervalo e, sem ele, o pacote", () => {
    const cols = ["Plano de manutenção", "Data planejada", "Pacotes vencidos"];
    const ch = planos.classificar(planos.prepararIp19(tabela(cols, [
      ["1", "05.01.2099", "S1"], ["1", "12.01.2099", "S1"], ["1", "19.01.2099", "S1"],
      ["2", "05.01.2099", "T2"], ["3", "05.01.2099", "3A"], ["3", "05.01.2101", "3A"],
    ])), null, HOJE);
    const cal = planos.montarCalendario(ch, D(2099, 1, 1), D(2099, 1, 31));
    expect(Object.fromEntries(cal.linhas.map((l) => [l.plano, l.ciclo]))).toEqual({ 1: "Semanal*", 2: "pacote T2", 3: "2 anos*" });
    expect(planos.nomeDoCiclo(547.5)).toBe("2 anos*");
    expect(planos.nomeDoCiclo(912.5)).toBe("2 anos*"); // 2,5 → 2 (arredonda para o par)
  });

  it("carga semanal, filtros e indicadores da página", () => {
    const ch = planos.classificar(planos.prepararIp19(ip19Cru()), iw38(), HOJE);
    const ini = D(2026, 9, 1), fim = D(2026, 10, 31);
    const carga = planos.cargaSemanal(ch, ini, fim);
    expect(carga.find((c) => c.semana === "S42")).toMatchObject({ situacao: planos.PROGRAMADA, chamadas: 2 });
    expect(carga.reduce((s, c) => s + c.chamadas, 0)).toBe(7);

    const noPeriodo = planos.noIntervalo(ch, ini, fim);
    const r = planos.resumoPeriodo(noPeriodo, HOJE);
    // vencidas: 07/09 (concl.), 14/09 e 21/09 (atras.); a saltada não conta
    expect(r).toEqual({ planos: 1, chamadas: 7, programadas: 2, atrasadas: 2, custoReal: 1500,
      aderencia: { vencidas: 3, concluidas: 1, taxa: 1 / 3 } });

    expect(planos.filtrarChamadas(ch, { inicio: ini, fim, busca: "lubrificacao" }).map((c) => c.plano)).toEqual(["30001"]);
    // situação: o plano entra com todas as chamadas, de qualquer data
    expect(planos.filtrarChamadas(ch, { inicio: ini, fim, situacoes: [planos.SALTADA] })).toHaveLength(7);
    expect(planos.filtrarChamadas(ch, { inicio: ini, fim, centros: ["ELET"] }).map((c) => c.plano)).toEqual(["30001"]);

    const det = planos.detalhePlano(ch, "20976 / 1", HOJE);
    expect(det.chamadas.map((c) => dataBr(c.dataPlanejada))[0]).toBe("13/10/2026");
    expect(det.proxima).toBe(D(2026, 10, 5));
    const ordenadas = planos.atrasadosPrimeiro(planos.montarCalendario(ch, D(2025, 10, 1), D(2026, 10, 31)).linhas);
    expect(ordenadas.map((l) => l.plano)).toEqual(["20976 / 1", "30001"]);
  });

  it("semana ISO e segunda-feira", () => {
    const d: Dia = D(2027, 1, 1); // sexta: semana 53 de 2026
    expect(planos.semanaIso(d)).toEqual({ ano: 2026, semana: 53 });
    expect(planos.segunda(d)).toBe(D(2026, 12, 28));
    expect(planos.rotulosSemanas(planos.semanasEntre(D(2026, 12, 28), D(2027, 1, 4)))).toEqual(["S53/26", "S01/27"]);
  });
});
