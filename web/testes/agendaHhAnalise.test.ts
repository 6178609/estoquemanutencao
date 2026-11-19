import { describe, expect, it } from "vitest";

import {
  aderencia, alertasDoCalendario, alertasPorTecnico, filtrarCalendario, hhPorTipo, nivelOcupacao, porStatus,
  programacoesDoPeriodo, resumoAlertasCalendario, rotuloStatus, sobrecargas,
} from "@/lib/agendaHh/analise";
import { comparativo, type Programacao, type Status, type Tecnico } from "@/lib/agendaHh/regras";

/** Só dados fictícios. 2026-03-02 é segunda-feira. */
const tec = (id: string, nome: string, extra: Partial<Tecnico> = {}): Tecnico => ({
  id, nome, np: id.toUpperCase(), centro: "Centro X", area: "Área A", turno: "1º turno", jornada: 8,
  feriasInicio: null, feriasFim: null, folga: null, foto: "", ...extra,
});
let n = 0;
const prog = (tecnicoId: string, data: string, minutos: number, extra: Partial<Programacao> = {}): Programacao => ({
  id: `p${++n}`, equipamento: "Equip 1", tipoOrdem: "Preventiva", ordem: String(n), descricao: "Serviço fictício", area: "Área A",
  data, turno: "1º turno", status: "programada", minutos, tecnicoId, tecnicoNome: tecnicoId, np: "", criadoEm: "", historico: [], ...extra,
});

const T = [tec("a", "Ana Teste"), tec("b", "Beto Teste", { feriasInicio: "2026-03-05", feriasFim: "2026-03-06", area: "Área B" }),
  tec("c", "Caio Teste", { folga: "2026-03-03" })];
const P = { ini: "2026-03-02", fim: "2026-03-08" };

describe("agenda HH · análise", () => {
  it("rótulo de status conhecido e genérico", () => {
    expect(rotuloStatus("concluida")).toBe("Concluída");
    expect(rotuloStatus("cancelada")).toBe("Cancelada");
    expect(rotuloStatus("")).toBe("Sem status");
  });

  it("aderência: concluídas ÷ programações do período", () => {
    const lista = [prog("a", "2026-03-02", 60, { status: "concluida" }), prog("a", "2026-03-03", 120),
      prog("b", "2026-03-04", 30, { status: "reprogramada" }), prog("c", "2026-03-04", 90, { status: "concluida" })];
    const r = aderencia(lista);
    expect(r).toMatchObject({ total: 4, concluidas: 2, pendentes: 2, pct: 50 });
    expect(r.horasConcluidas).toBeCloseTo(2.5);
    expect(r.horasTotal).toBeCloseTo(5);
    expect(aderencia([]).pct).toBeNull();
  });

  it("por status: ordem conhecida primeiro, depois os outros", () => {
    const lista = [prog("a", "2026-03-02", 60, { status: "outro" as Status }), prog("a", "2026-03-02", 60, { status: "concluida" }),
      prog("a", "2026-03-02", 30), prog("a", "2026-03-02", 30)];
    expect(porStatus(lista).map((l) => [l.status, l.quantidade, l.horas])).toEqual([["programada", 2, 1], ["concluida", 1, 1], ["outro", 1, 1]]);
  });

  it("HH por tipo de ordem, maior primeiro", () => {
    const lista = [prog("a", "2026-03-02", 60, { tipoOrdem: "Corretiva" }), prog("a", "2026-03-02", 180),
      prog("a", "2026-03-02", 30, { tipoOrdem: "" })];
    expect(hhPorTipo(lista)).toEqual([{ rotulo: "Preventiva", valor: 3, quantidade: 1 }, { rotulo: "Corretiva", valor: 1, quantidade: 1 },
      { rotulo: "Sem tipo", valor: 0.5, quantidade: 1 }]);
  });

  it("programações do período e dos técnicos", () => {
    const lista = [prog("a", "2026-03-01", 60), prog("a", "2026-03-02", 60), prog("b", "2026-03-08", 60), prog("c", "2026-03-09", 60)];
    expect(programacoesDoPeriodo(lista, P).length).toBe(2);
    expect(programacoesDoPeriodo(lista, P, new Set(["b"])).map((x) => x.tecnicoId)).toEqual(["b"]);
  });

  it("sobrecarga no período: programado acima do disponível", () => {
    // Ana: 5 dias × 8 h = 40 h; programado 45 h. Beto: 3 dias (férias 2) = 24 h; programado 10 h.
    const lista = [prog("a", "2026-03-02", 45 * 60), prog("b", "2026-03-02", 600)];
    const c = comparativo(T, lista, P);
    const s = sobrecargas(c.linhas);
    expect(s.map((x) => x.nome)).toEqual(["Ana Teste"]);
    expect(s[0].excesso).toBeCloseTo(5);
    expect(nivelOcupacao(112.5, 45, 40)).toBe("sobrecarga");
    expect(nivelOcupacao(90, 9, 10)).toBe("alta");
    expect(nivelOcupacao(10, 1, 10)).toBe("normal");
    expect(nivelOcupacao(0, 0, 10)).toBe("livre");
  });

  it("alertas do calendário: sobrecarga no dia, fim de semana, férias e folga", () => {
    const lista = [
      prog("a", "2026-03-02", 10 * 60), // 10 h num dia de 8 h → sobrecarga
      prog("a", "2026-03-07", 60), // sábado
      prog("b", "2026-03-05", 60), // férias
      prog("c", "2026-03-03", 60), // folga
      prog("c", "2026-03-04", 60, { status: "concluida" }), // concluída não alerta
      prog("c", "2026-03-04", 4 * 60), // dentro da jornada
    ];
    const porDia = alertasDoCalendario(T, lista, P);
    expect([...porDia.keys()].sort()).toEqual(["2026-03-02", "2026-03-03", "2026-03-05", "2026-03-07"]);
    expect(porDia.get("2026-03-02")![0]).toMatchObject({ motivo: "sobrecarga", programado: 10, disponivel: 8 });
    expect(porDia.get("2026-03-07")![0].motivo).toBe("fim de semana");
    expect(porDia.get("2026-03-05")![0].motivo).toBe("férias");
    expect(porDia.get("2026-03-03")![0].motivo).toBe("folga");
    expect(resumoAlertasCalendario(porDia)).toEqual({ dias: 4, sobrecarga: 1, foraDoDia: 3 });
    const porTec = alertasPorTecnico([...porDia.values()].flat());
    expect(porTec.get("a")).toEqual({ sobrecarga: 1, foraDoDia: 1 });
    expect(porTec.get("c")).toEqual({ sobrecarga: 0, foraDoDia: 1 });
  });

  it("filtros do calendário (área e turno) valem também para os alertas", () => {
    const lista = [prog("a", "2026-03-07", 60, { area: "Área B" }), prog("a", "2026-03-07", 60, { turno: "" })];
    expect(filtrarCalendario(lista, P, { area: "Área B" }).length).toBe(1);
    expect(filtrarCalendario(lista, P, { turno: "sem turno" }).length).toBe(1);
    expect(filtrarCalendario(lista, P, { turno: "2º turno" }).length).toBe(0);
    expect(alertasDoCalendario(T, lista, P, { turno: "2º turno" }).size).toBe(0);
    expect(alertasDoCalendario(T, lista, P, { area: "Área B" }).get("2026-03-07")!.length).toBe(1);
  });
});
