import { describe, expect, it } from "vitest";

import { baseExecucao, ordensDoRecorte, semanasGrafico, topPessoas } from "@/app/(app)/execucao/calculos";
import { farolPct } from "@/app/(app)/execucao/_ui/cores";
import { int, num, pct } from "@/app/(app)/execucao/_ui/fmt";
import type { Confirmacao, Operacao, Ordem, Pessoa } from "@/lib/wcm/preparo";
import { paraData, type Dia } from "@/lib/wcm/util";

// dados fictícios
const T = (s: string): Dia => paraData(s)!;
const HOJE = T("2026-06-30");
const ordem = (p: Partial<Ordem>) => ({ ordem: "", tipo: "", localizacao: "", centroTrabalho: "", situacao: "Aberta", ...p }) as Ordem;
const operacao = (p: Partial<Operacao>): Operacao => ({
  ordem: "", operacao: "0010", tipo: "", centroTrabalho: "", equipamento: "", objeto: "", local: "", textoOperacao: "", unidade: "H",
  statusSistema: "", horas: 1, pessoas: 1, inicio: null, fimReal: null, concluida: false, cancelada: false, setor: "", ...p,
});
const conf = (p: Partial<Confirmacao>): Confirmacao => ({
  np: "", nome: "", ordem: "", operacao: "0010", statusSistema: "", unidade: "H", centroTrabalho: "", atividade: "", tipo: "",
  equipamento: "", texto: "", causaDesvio: "", horas: 1, data: null, setor: "", ...p,
});

describe("tela de execução", () => {
  it("recorta as ordens por área e tipo (sem IW38 = null)", () => {
    const os = [ordem({ ordem: "1", localizacao: "GAL1", tipo: "YM01" }), ordem({ ordem: "2", localizacao: "GAL2", tipo: "YM02" })];
    expect(ordensDoRecorte(null, [], [])).toBeNull();
    expect(ordensDoRecorte(os, ["GAL1"], [])!.map((o) => o.ordem)).toEqual(["1"]);
    expect(ordensDoRecorte(os, [], ["YM02"])!.map((o) => o.ordem)).toEqual(["2"]);
  });

  it("só as operações das ordens do recorte e só os apontamentos da equipe", () => {
    const os = [ordem({ ordem: "1" })];
    const ops = [operacao({ ordem: "1", inicio: T("2026-06-10") }), operacao({ ordem: "9", inicio: T("2026-06-10") })];
    const cs = [conf({ ordem: "1", np: "100", data: T("2026-06-11") }), conf({ ordem: "1", np: "999", data: T("2026-06-11") })];
    const equipe = [{ np: "100", nome: "ANA EXEMPLO" } as Pessoa];
    const r = baseExecucao(ops, os, cs, cs, equipe, HOJE);
    expect(r.ops.map((o) => o.ordem)).toEqual(["1"]);
    expect(r.ap.map((a) => a.np)).toEqual(["100"]);
    expect(r.ops[0].executadoPor).toContain("ANA EXEMPLO");
  });

  it("semanas do gráfico: executadas + não executadas = programadas", () => {
    const g = semanasGrafico([{ semana: T("2026-06-01"), programadas: 10, executadas: 7, taxa: 70.04 }, { semana: T("2026-06-08"), programadas: 3, executadas: 0, taxa: null }]);
    expect(g.rotulos).toEqual(["01/06", "08/06"]);
    expect(g.pendentes).toEqual([3, 3]);
    expect(g.taxa).toEqual([70, null]);
  });

  it("quem mais apontou: horas em plano e fora", () => {
    const t = topPessoas([{ np: "1", pessoa: "A", hhApontadas: 10, pctHhEmPlano: 40 } as never, { np: "2", pessoa: "B", hhApontadas: 5, pctHhEmPlano: null } as never]);
    expect(t[0]).toMatchObject({ plano: 4, fora: 6 });
    expect(t[1]).toMatchObject({ plano: 0, fora: 5 });
  });

  it("farol e formatos", () => {
    expect([farolPct(95), farolPct(75), farolPct(10), farolPct(null)]).toEqual(["verde", "amarelo", "vermelho", "neutro"]);
    expect(pct(12.345)).toBe("12,3%");
    expect(num(NaN)).toBe("—");
    expect(int(1234.6)).toBe("1.235");
  });
});
