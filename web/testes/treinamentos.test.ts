import { describe, expect, it } from "vitest";

import * as hh from "@/lib/wcm/hh";
import * as tr from "@/lib/wcm/treinamentos";
import { dia } from "@/lib/wcm/util";

/** Equipe por cadastro, HH com carga horária e a aba Treinamentos e férias — só dados fictícios. */
const D = (a: number, m: number, d: number) => dia(a, m, d)!;

const CAD = {
  "10": { nome: "ANA", cargo: "MECANICO", centro: "MEC", turma: "1ª", ausencias: [
    { id: "a", tipo: "Férias", de: "2026-01-05", ate: "2026-01-14" },
    { id: "b", tipo: "Férias", de: "2026-11-02", ate: "2026-11-11" },
    { id: "c", tipo: "Treinamento", de: "2025-10-01", ate: "2025-10-02", titulo: "NR-10 reciclagem", horas: 16, validade: "2026-11-10" },
    { id: "d", tipo: "Treinamento", de: "2026-10-05", ate: "2026-10-05", titulo: "nr-10 Reciclagem", horas: 8, validade: "2028-10-05" },
  ] },
  "20": { nome: "BRUNO", cargo: "ELETRICISTA", centro: "ELE", ativo: true, ausencias: [
    { id: "e", tipo: "Treinamento", de: "2026-10-06", ate: "2026-10-06", titulo: "NR-35", horas: 0, validade: "2026-10-20" },
  ] },
  "30": { nome: "CAIO", cargo: "ANALISTA PLANEJ", centro: "PCM", ativo: false },
  "40": { jornada: 40 }, // só disponibilidade, sem nome: não é da equipe
};

describe("equipe por cadastro", () => {
  it("só quem tem nome e não foi desligado; especialidade pelo cargo; migração mantém a chave", () => {
    expect(hh.temEquipeCadastrada(CAD)).toBe(true);
    expect(hh.temEquipeCadastrada({ "40": { jornada: 40 } })).toBe(false);
    expect(hh.equipeDoCadastro(CAD).map((p) => [p.np, p.especialidade])).toEqual([["10", "Mecânica"], ["20", "Elétrica"]]);
    expect(hh.equipeDoCadastro(CAD, { comDesligados: true }).map((p) => p.ativo)).toEqual([true, true, false]);
    expect(hh.itensDaEquipe([{ np: "0123", nome: "DIA", cargo: "MECANICO", centroTrabalho: "MEC", area: "", turma: "", supervisor: "",
      especialidade: "", setor: "" }])).toEqual({ "0123": { nome: "DIA", cargo: "MECANICO", centro: "MEC", area: "", turma: "", supervisor: "", ativo: true } });
  });
});

describe("HH com carga horária", () => {
  it("treinamento com horas tira só as horas; 0 não tira; dia inteiro continua igual", () => {
    const pes = hh.pessoas(hh.equipeDoCadastro(CAD), CAD, 42);
    const d = hh.disponibilidade(pes, CAD, D(2026, 10, 1), D(2026, 10, 7));
    expect(d.find((p) => p.np === "10")!.horasAusente).toBe(8);
    expect(d.find((p) => p.np === "10")!.diasAusente).toBe(0);
    expect(d.find((p) => p.np === "20")!.horasAusente).toBe(0);
    // 16 h em 2 dias: 8 h por dia dentro do período
    expect(hh.horasParciais(CAD, D(2025, 10, 2), D(2025, 10, 31))).toEqual({ "10": 8 });
    const jan = hh.disponibilidade(pes, CAD, D(2026, 1, 1), D(2026, 1, 31));
    expect(jan.find((p) => p.np === "10")!.horasAusente).toBe(60); // 10 dias × 42 ÷ 7
  });
});

describe("treinamentos e férias", () => {
  const aus = hh.ausencias(CAD), hoje = D(2026, 10, 16);
  it("férias no ano civil: gozados, programados e restante de 30", () => {
    const f = tr.feriasNoAno(aus, ["10", "20"], hoje);
    expect(f[0]).toEqual({ np: "10", gozados: 10, programados: 10, total: 20, restante: 10, proxima: D(2026, 11, 2) });
    expect(f[1]).toMatchObject({ gozados: 0, programados: 0, restante: 30, proxima: null });
  });
  it("reciclagem pelo último realizado de cada nome (sem acento/maiúsculas); vencida, em breve e em dia", () => {
    const r = tr.reciclagens(aus, hoje);
    expect(r.map((x) => [x.np, x.titulo, x.situacao])).toEqual([["20", "NR-35", "Vence em breve"], ["10", "nr-10 Reciclagem", "Em dia"]]);
    // turma agendada não esconde a vencida; só agendada = "Agendado"
    const comAgenda = hh.ausencias({ "10": { nome: "ANA", ausencias: [
      { id: "x", tipo: "Treinamento", de: "2024-01-10", ate: "2024-01-10", titulo: "NR-33", validade: "2026-01-10" },
      { id: "y", tipo: "Treinamento", de: "2026-11-20", ate: "2026-11-20", titulo: "NR-33", validade: "2028-11-20" },
      { id: "z", tipo: "Treinamento", de: "2026-12-01", ate: "2026-12-01", titulo: "NR-12" },
    ] } });
    const ra = tr.reciclagens(comAgenda, hoje);
    expect(ra.find((x) => x.titulo === "NR-33")).toMatchObject({ situacao: "Vencido", agendado: D(2026, 11, 20) });
    expect(ra.find((x) => x.titulo === "NR-12")).toMatchObject({ situacao: "Agendado", realizado: null });
    expect(tr.reciclagens(aus, D(2026, 10, 25)).find((x) => x.np === "20")!.situacao).toBe("Vencido");
    const m = tr.matrizTreinamentos(r);
    expect(m.titulos.map((t) => t.titulo).sort()).toEqual(["NR-35", "nr-10 Reciclagem"]);
    expect(m.celula.get(`10|${r[1].chaveTitulo}`)!.situacao).toBe("Em dia");
  });
  it("horas perdidas por tipo e cobertura por centro", () => {
    const pes = hh.pessoas(hh.equipeDoCadastro(CAD), CAD, 42);
    expect(tr.horasPorTipo(aus, pes, D(2026, 1, 1), D(2026, 12, 31))).toEqual({ "Férias": 120, Treinamento: 8 });
    const cob = tr.cobertura(aus, pes, D(2026, 11, 2), D(2026, 11, 8));
    expect(cob).toEqual([{ centro: "MEC", semana: D(2026, 11, 2), tecnicos: 1, pico: 1, pct: 100, alerta: true }]);
    expect(tr.foraEm(aus, D(2026, 10, 6)).length).toBe(0); // EAD não tira do dia
  });
});
