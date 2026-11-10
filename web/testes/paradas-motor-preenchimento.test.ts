import { describe, expect, it } from "vitest";

import { diasDaEntrada, novoCtx } from "@/lib/paradas/motor";
import { Estado } from "@/lib/paradas/motor/estado";
import { preencher } from "@/lib/paradas/motor/preenchimento";
import type { ResultadoMotor } from "@/lib/paradas/tipos";

import { entrada, item, itens, N } from "./paradas-fixtures";

const M = "2026-11";
const NOMES = ["GOLDEN 01", "PVC 08", "PVC 09", "TIEN KANG 06", "MICRONIZADOR 01"];

function cenario(inicio: number, fim: number) {
  const e = entrada(NOMES.map((n) => itens(n, N(5), "MEC", 1)), { inicio, fim });
  const dias = diasDaEntrada(e);
  const est = new Estado(dias, e.ativos, e.parametros);
  const out: ResultadoMotor = { linhas: [], semHh: [], retirados: [], fixacoesOrfas: [], avisos: [] };
  const c = novoCtx(e, est, M, dias, out, { ultimo: -1 });
  const por = (ativo: string, d: number, t: 1 | 2, hh: number) => est.colocar(ativo, M, d, t, [item(ativo, M, d, "MEC", hh)], 1, []);
  return { c, est, por };
}

describe("motor — nenhum turno vazio", () => {
  it("move um não crítico do dia mais cheio para o turno vazio", () => {
    const { c, est, por } = cenario(N(3), N(3));
    por("GOLDEN 01", N(5), 2, 2); por("PVC 08", N(5), 2, 1); por("TIEN KANG 06", N(5), 2, 3);
    preencher(c);
    expect(est.ativosNoTurno(N(3), 1)).toHaveLength(1);
    expect(est.ativosNoTurno(N(3), 2)).toHaveLength(1);
    expect(est.ativosNoTurno(N(5), 2)).toHaveLength(1);
    const movida = est.linhasDoDia(N(3)).find((l) => l.turno === 2)!;
    expect(movida.marcas).toContain("preenchimento");
  });

  it("nunca deixa o turno de origem vazio", () => {
    const { c, est, por } = cenario(N(3), N(3));
    por("GOLDEN 01", N(5), 2, 2);
    preencher(c);
    expect(est.linhasDoDia(N(3))).toEqual([]);
  });

  it("sábado só recebe os tipos do preenchimento", () => {
    const { c, est, por } = cenario(N(7), N(7));
    por("MICRONIZADOR 01", N(5), 2, 0.5); por("PVC 08", N(5), 2, 2); por("GOLDEN 01", N(5), 2, 1);
    preencher(c);
    expect(est.ativosNoTurno(N(7), 1)).toEqual(["GOLDEN 01"]);
  });

  it("não quebra a regra do mesmo tipo", () => {
    const { c, est, por } = cenario(N(3), N(3));
    por("PVC 09", N(3), 1, 1); por("PVC 08", N(5), 2, 0.5); por("GOLDEN 01", N(5), 2, 2);
    preencher(c);
    expect(est.ativosNoTurno(N(3), 2)).toEqual(["GOLDEN 01"]);
  });

  it("sem candidato o turno fica vazio", () => {
    const { c, est } = cenario(N(3), N(3));
    expect(() => preencher(c)).not.toThrow();
    expect(est.linhas.size).toBe(0);
  });
});
