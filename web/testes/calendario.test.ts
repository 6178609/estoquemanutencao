import { describe, expect, it } from "vitest";

import * as cal from "@/lib/wcm/calendario";
import { dia } from "@/lib/wcm/util";

/** Calendário de ordens (IW38 por dia e turno) com dados fictícios. */
const D = (a: number, m: number, d: number) => dia(a, m, d)!;
const HOJE = D(2026, 10, 7);

const ordens = (): cal.OrdemAgenda[] => [
  { ordem: "1", data: D(2026, 10, 5), objeto: "CHILLER 04", local: "", texto: "LIMPEZA", tipo: "YM13",
    natureza: "Plano de manutenção", situacao: "Liberada", centroTrabalho: "MEC" },
  { ordem: "2", data: D(2026, 10, 5), objeto: "", local: "CENTRAL DE FRESAS", texto: "INSPEÇÃO", tipo: "YM15",
    natureza: "Backlog", situacao: "Concluída", centroTrabalho: "ELE" },
  { ordem: "3", data: D(2026, 10, 8), objeto: "", local: "", texto: "TROCA DE ROLAMENTO", tipo: "YM13",
    natureza: "Plano de manutenção", situacao: "Aberta", centroTrabalho: "MEC" },
  { ordem: "4", data: D(2026, 10, 6), objeto: "BOMBA", local: "", texto: "X", tipo: "YM13",
    natureza: "Plano de manutenção", situacao: "Cancelada", centroTrabalho: "MEC" },
];
const oper = (): cal.OperacaoAgenda[] => [
  { ordem: "1", horas: 2, pessoas: 1, cancelada: false }, { ordem: "1", horas: 1, pessoas: 2, cancelada: false },
  { ordem: "2", horas: 0.5, pessoas: 1, cancelada: false }, { ordem: "3", horas: 1.25, pessoas: 1, cancelada: false },
];
const conf = (): cal.ConfirmacaoAgenda[] => [
  { ordem: "1", np: "10", nome: "", statusSistema: "CONF ENTE" }, { ordem: "1", np: "20", nome: "", statusSistema: "CONF ENTE" },
  { ordem: "2", np: "10", nome: "", statusSistema: "CONF ENTE" },
];
const EQUIPE: cal.PessoaAgenda[] = [
  { np: "10", nome: "JOSIVAN GILDO DA SILVA", turma: "1ª", area: "AMARELA", cargo: "ELETRICISTA LIDER" },
  { np: "20", nome: "ANA SOUZA", turma: "2ª", area: "MONTAGEM", cargo: "MECANICO" },
];

describe("calendário de ordens", () => {
  it("agenda por dia e turno", () => {
    const a = cal.agenda(ordens(), oper(), conf(), EQUIPE, HOJE);
    const o1 = new Map(a.filter((x) => x.ordem === "1").map((x) => [x.turno, x]));
    expect(new Set(o1.keys())).toEqual(new Set(["1º turno", "2º turno"])); // aparece no turno de cada turma
    expect(o1.get("1º turno")!.quem).toBe("Josivan Gildo da Silva (AMA · Eletricista)");
    expect(o1.get("1º turno")!.titulo).toBe("CHILLER 04");
    expect(o1.get("1º turno")!.duracaoH).toBe(3);
    expect(o1.get("1º turno")!.situacao).toBe(cal.CONCLUIDA); // CONF + ENTE na IW47 (IW38 ainda LIB)
    const o2 = a.find((x) => x.ordem === "2")!;
    expect([o2.titulo, o2.situacao]).toEqual(["CENTRAL DE FRESAS", cal.CONCLUIDA]);
    const o3 = a.find((x) => x.ordem === "3")!;
    expect([o3.turno, o3.quem]).toEqual([cal.SEM_EXECUTANTE, "MEC · 1 pessoa(s) prevista(s)"]);
    expect([o3.situacao, o3.titulo, o3.executantes]).toEqual([cal.PROGRAMADA, "TROCA DE ROLAMENTO", 0]);
    expect(a.find((x) => x.ordem === "4")!.situacao).toBe(cal.CANCELADA);
    // ordem: dia, turno, natureza, título
    expect(a.map((x) => `${x.ordem}:${x.turno}`)).toEqual(
      ["2:1º turno", "1:1º turno", "1:2º turno", "4:Sem executante (IW47)", "3:Sem executante (IW47)"]);
  });

  it("atrasada e formatos", () => {
    const o = ordens();
    o[2].data = D(2026, 10, 1);
    const a = cal.agenda(o, oper(), null, null, HOJE);
    expect(a.find((x) => x.ordem === "3")!.situacao).toBe(cal.ATRASADA);
    expect(cal.duracao(3)).toBe("3h");
    expect(cal.duracao(50 / 60)).toBe("50 min");
    expect(cal.duracao(1 + 17 / 60)).toBe("1h 17min");
    expect(cal.duracao(0)).toBe("");
    expect(cal.duracao(null)).toBe("");
    expect(cal.inicioSemana(D(2026, 10, 7))).toBe(D(2026, 10, 4));
    expect(cal.nomeProprio("JOSIVAN GILDO DA SILVA")).toBe("Josivan Gildo da Silva");
    expect(cal.nomeProprio("DA SILVA")).toBe("Da Silva");
  });

  it("grade da semana (o que o HTML desenhava)", () => {
    const a = cal.agenda(ordens(), oper(), conf(), EQUIPE, HOJE);
    const dias = cal.diasDoCalendario(a, D(2026, 10, 4), D(2026, 10, 10), D(2026, 10, 7));
    expect(dias).toHaveLength(7);
    expect(dias.map((d) => d.numero)).toEqual([4, 5, 6, 7, 8, 9, 10]);
    expect(dias.filter((d) => d.hoje).map((d) => d.numero)).toEqual([7]);
    const dia5 = dias[1];
    expect([dia5.ordens, dia5.total, dia5.mes]).toEqual([2, "2 ordem(ns) · 3h 30min", "OUT."]);
    expect(dia5.turnos.map((t) => t.turno)).toEqual(["1º turno", "2º turno"]);
    const c = dia5.turnos[0].visiveis[0];
    expect([c.titulo, c.fundo, c.borda]).toEqual(["CENTRAL DE FRESAS", "backlog", "concluida"]);
    expect(dia5.turnos[0].visiveis[1].titulo).toBe("CHILLER 04");
    expect(dias[0].total).toBe(""); // sem programação
    expect(dias[0].turnos).toEqual([]);

    const curto = cal.diasDoCalendario(a, D(2026, 10, 4), D(2026, 10, 10), D(2026, 10, 7), null, 1);
    const d5 = curto[1]; // dia 5: 3 cartões, 1 visível
    expect(d5.escondidos).toBe(2);
    expect(d5.turnos.map((t) => [t.turno, t.visiveis.length, t.escondidos.length, t.oculto])).toEqual(
      [["1º turno", 1, 1, false], ["2º turno", 0, 1, true]]);
  });

  it("dias fora do período: em branco, ou esmaecidos com mês de referência", () => {
    const a = cal.agenda(ordens(), oper(), conf(), EQUIPE, HOJE);
    const semMes = cal.diasDoCalendario(a, D(2026, 10, 6), D(2026, 10, 7), HOJE);
    expect(semMes).toHaveLength(7);
    expect(semMes.map((d) => d.vazio)).toEqual([true, true, false, false, true, true, true]);
    const comMes = cal.diasDoCalendario(a, D(2026, 10, 6), D(2026, 10, 7), HOJE, 10);
    expect(comMes[1]).toMatchObject({ vazio: false, fora: true, ordens: 2 });
    const virada = cal.diasDoCalendario([], D(2026, 9, 27), D(2026, 10, 3), HOJE, 10);
    expect(virada.map((d) => d.fora)).toEqual([true, true, true, true, false, false, false]);
  });

  it("localização vem do IW38", () => {
    const loc = ["GAL1", "GAL2", "UTIL", undefined];
    const o = ordens().map((x, i) => ({ ...x, localizacao: loc[i] }));
    const a = cal.agenda(o, oper(), conf(), EQUIPE, HOJE);
    const por = Object.fromEntries(a.map((x) => [x.ordem, x.localizacao]));
    expect(por).toEqual({ 1: "GAL1", 2: "GAL2", 3: "UTIL", 4: "" });
  });

  it("datas alteradas pelo robô, filtros e indicadores", () => {
    const o = cal.comDatasAlteradas(ordens(), { 3: ["2026-10-09", "2026-10-10"] })!;
    expect(o.map((x) => x.ajustada)).toEqual([false, false, true, false]);
    expect([o[2].data, o[2].inicio, o[2].fim]).toEqual([D(2026, 10, 9), D(2026, 10, 9), D(2026, 10, 10)]);
    expect(cal.comDatasAlteradas(null, {})).toBeNull();
    const a = cal.agenda(o, oper(), conf(), EQUIPE, HOJE);
    const c3 = cal.cartao(a.find((x) => x.ordem === "3")!);
    expect(c3.titulo).toBe("↻ TROCA DE ROLAMENTO");
    expect(c3.quem).toBe("MEC · 1 pessoa(s) prevista(s) • 1h 15min");
    expect(c3.dica.startsWith("↻ Data alterada pelo robô")).toBe(true);

    expect(cal.filtrarAgenda(a, { busca: "josivan" }).map((x) => x.ordem)).toEqual(["2", "1"]);
    expect(cal.filtrarAgenda(a, { situacoes: [cal.CANCELADA] }).map((x) => x.ordem)).toEqual(["4"]);
    expect(cal.filtrarAgenda(a, { turnos: [cal.SEM_EXECUTANTE], naturezas: ["Plano de manutenção"] }).map((x) => x.ordem))
      .toEqual(["4", "3"]);
    expect(cal.resumoAgenda(a)).toEqual({ ordens: 4, concluidas: 2, atrasadas: 0, horas: 4.75, semIw47: 2 });
  });
});
