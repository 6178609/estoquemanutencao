import { describe, expect, it } from "vitest";

import * as ex from "@/lib/wcm/execucao";
import * as sem from "@/lib/wcm/semanal";
import { paraData, type Dia } from "@/lib/wcm/util";

// dados fictícios
const T = (s: string): Dia => paraData(s)!;
const HOJE = T("2026-10-08");   // quinta-feira
const SEG = T("2026-10-05");

const atividade = (p: Partial<ex.Atividade>): ex.Atividade => ({
  ordem: "", operacao: "0010", tipo: "", centroTrabalho: "MEC_COMP", equipamento: "", objeto: "", local: "",
  textoOperacao: "", unidade: "H", statusSistema: "", horas: 1, pessoas: 1, inicio: null, fimReal: null, concluida: false,
  cancelada: false, setor: "", op: "10", hhReal: null, executadoPor: "", executantes: 0, ultimoApontamento: null,
  statusIw47: "", comApontamento: false, comPlano: false, natureza: null, area: null, textoOrdem: null,
  situacaoOrdem: "Liberada", statusSap: "", confirmada: false, situacao: ex.PROGRAMADA, executada: false,
  diasAposProgramacao: null, ...p,
});
const ops = (xs: Partial<ex.Atividade>[]) => xs.map(atividade);

describe("programação semanal", () => {
  it("semana e rótulos", () => {
    expect(sem.segunda(HOJE)).toBe(SEG);
    expect(sem.segunda(SEG)).toBe(SEG);
    expect(sem.rotuloSemana(SEG, HOJE)).toBe("Semana 41 · 05/10 a 11/10/2026 · esta semana");
    expect(sem.rotuloSemana(SEG + 7, HOJE)).toContain("próxima semana");
    expect(sem.rotuloSemana(SEG - 7, HOJE)).toContain("semana passada");
    expect(sem.rotuloSemana(T("2026-12-28"), HOJE)).toMatch(/^Semana 53 · 28\/12 a 03\/01\/2027$/);
    expect(sem.semanasParaEscolher(HOJE, 2, 3)).toHaveLength(6);
    expect(sem.semanaPadrao(HOJE)).toBe(SEG + 7);                   // de quinta em diante: a próxima
    expect(sem.semanaPadrao(T("2026-10-07"))).toBe(SEG);
  });

  it("carga, capacidade e folga", () => {
    const o = ops([{ ordem: "1", inicio: SEG, horas: 30 },
      { ordem: "2", inicio: SEG + 6, horas: 20, situacaoOrdem: "Aberta" },
      { ordem: "3", inicio: SEG + 7, horas: 99 },                    // semana seguinte
      { ordem: "4", inicio: SEG, horas: 99, situacao: ex.CANCELADA },
      { ordem: "5", inicio: SEG + 2, horas: 10, centroTrabalho: "TERC" },
      { ordem: "6", inicio: SEG + 1, horas: 5, centroTrabalho: "ELE" }]);
    const prog = sem.programadas(o, HOJE);
    expect(prog.map((p) => p.ordem).sort()).toEqual(["1", "2", "5", "6"]);
    expect(prog[0].dia).toBe("Seg");
    const p2 = prog.find((p) => p.ordem === "2")!;
    expect(p2.dia).toBe("Dom");
    expect(p2.pronta).toBe(false);
    const cap = new Map(sem.capacidade(["MEC_COMP", "TERC", "ELE"], [{ centroTrabalho: "MEC_COMP" }], 44, { TERC: 8 },
      [{ centroTrabalho: "ELE", horas: 12, fimReal: SEG - 3 }, { centroTrabalho: "ELE", horas: 12, fimReal: SEG - 3 }], HOJE)
      .map((c) => [c.centroTrabalho, c]));
    expect(cap.get("MEC_COMP")!.capacidade).toBe(44);
    expect(cap.get("MEC_COMP")!.origem).toBe("1 técnico(s) × 44 h");
    expect(cap.get("TERC")!.origem).toBe("configurada");
    expect(cap.get("ELE")!.capacidade).toBe(2);                       // 24 h ÷ 12 semanas
    expect(cap.get("ELE")!.origem).toContain("média");
    const t = new Map(sem.cargaPorCentro(prog, [...cap.values()]).map((c) => [c.centroTrabalho, c]));
    expect(t.get("MEC_COMP")!.hhProgramadas).toBe(50);
    expect(Math.round(t.get("MEC_COMP")!.cargaPct!)).toBe(114);
    expect(t.get("TERC")!.folga).toBe(-2);
    expect(t.get("MEC_COMP")!.prontasPct).toBe(50);
    const dia = new Map(sem.porDia(prog).map((d) => [d.centroTrabalho, d]));
    expect(dia.get("MEC_COMP")!.Seg).toBe(30);
    expect(dia.get("MEC_COMP")!.Dom).toBe(20);
    expect(Object.keys(dia.get("MEC_COMP")!).slice(1)).toEqual([...sem.DIAS]);
  });

  it("capacidade pelo Gerenciador de HH e sem cadastro", () => {
    const cap = sem.capacidade(["A", "B"], [], 44, null, null, HOJE, { A: [70.5, 2] });
    expect(cap).toEqual([
      { centroTrabalho: "A", capacidade: 70.5, origem: "2 técnico(s) · Gerenciador de HH (jornada, % e ausências)" },
      { centroTrabalho: "B", capacidade: null, origem: "sem capacidade cadastrada" }]);
    expect([sem.faixaCarga(null), sem.faixaCarga(85), sem.faixaCarga(100), sem.faixaCarga(101)])
      .toEqual(["Sem capacidade", "Folga", "Cheia", "Sobrecarga"]);
  });

  it("candidatos priorizam liberada e risco e encaixam na folga", () => {
    const o = ops([{ ordem: "10", inicio: SEG - 30, horas: 4, situacaoOrdem: "Aberta", situacao: ex.ATRASADA },
      { ordem: "11", inicio: SEG - 3, horas: 3, equipamento: "E1", situacao: ex.ATRASADA },
      { ordem: "12", inicio: SEG - 60, horas: 3, situacao: ex.ATRASADA },
      { ordem: "13", inicio: SEG - 9, horas: 1, concluida: true },
      { ordem: "14", inicio: SEG + 1, horas: 1 }]);
    const c = sem.candidatos(o, SEG, { E1: "Alta" }, { E1: 150 });
    expect(c.map((x) => x.ordem)).toEqual(["11", "12", "10"]);       // liberada e de maior risco, liberada antiga, não liberada
    expect(c.find((x) => x.ordem === "12")!.diasAtraso).toBe(60);
    expect(c[0].criticidade).toBe("Alta");
    expect(sem.encaixar(c, { MEC_COMP: 6.5 })).toEqual([true, true, false]);
    const folga = sem.folgaPorCentro([], [{ centroTrabalho: "MEC_COMP", capacidade: 4, origem: "" }]);
    expect(sem.encaixar(c, folga)).toEqual([true, false, false]);
    const r = sem.resumoSemana([], [], c);
    expect([r.atrasadas, r.hhAtrasadas, r.cargaPct, r.liberadasPct]).toEqual([3, 10, null, null]);
  });

  it("aderência conta só o concluído dentro da semana", () => {
    const s1 = SEG - 7;
    const o = ops([{ ordem: "1", inicio: s1, concluida: true, fimReal: s1 + 2, horas: 3 },
      { ordem: "2", inicio: s1, concluida: true, fimReal: s1 + 9, horas: 1 },
      { ordem: "3", inicio: s1 + 6, horas: 4 },
      { ordem: "4", inicio: s1, situacao: ex.CANCELADA, horas: 50 },
      { ordem: "5", inicio: SEG, concluida: true, fimReal: SEG, horas: 1 }]);   // semana atual fora
    const a = sem.aderencia(o, HOJE, 4, null, HOJE);
    expect(a).toHaveLength(1);
    const r = a[0];
    expect([r.programadas, r.naSemana, r.depois, r.pendentes]).toEqual([3, 1, 1, 1]);
    expect(Math.round(r.aderenciaPct * 10) / 10).toBe(33.3);
    expect(r.hhProgramadas).toBe(8);
    expect(r.aderenciaHhPct).toBe(37.5);
  });

  it("aderência ignora semana que o export ainda não cobre", () => {
    const s2 = SEG - 14, s1 = SEG - 7;
    const o = ops([{ ordem: "1", inicio: s2, concluida: true, fimReal: s2 }, { ordem: "2", inicio: s1 }]);
    // export de sábado (03/10, 18h em São Paulo): a semana de 28/09 a 04/10 ainda não acabou no arquivo
    const a = sem.aderencia(o, SEG + 7, 4, new Date("2026-10-03T21:00:00Z"), HOJE);
    expect(a.map((x) => x.semana)).toEqual([s2]);
    // export de domingo: a semana entra
    expect(sem.aderencia(o, SEG + 7, 4, T("2026-10-04"), HOJE)).toHaveLength(2);
  });

  it("lista da programação com busca e filtros", () => {
    const prog = sem.programadas(ops([{ ordem: "1", inicio: SEG, textoOperacao: "Lubrificação do redutor" },
      { ordem: "2", inicio: SEG + 1, situacaoOrdem: "Aberta", centroTrabalho: "ELE" }]), SEG);
    expect(sem.filtrarProgramacao(prog, { busca: "lubrificacao" }).map((p) => p.ordem)).toEqual(["1"]);
    expect(sem.filtrarProgramacao(prog, { soNaoProntas: true }).map((p) => p.ordem)).toEqual(["2"]);
    expect(sem.filtrarProgramacao(prog, { centros: ["MEC_COMP"] }).map((p) => p.ordem)).toEqual(["1"]);
  });
});
