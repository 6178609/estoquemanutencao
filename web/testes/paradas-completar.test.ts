import { describe, expect, it } from "vitest";

import { completarHh } from "@/lib/paradas/completar";
import { PARAMETROS_PADRAO } from "@/lib/paradas/parametros";
import type { ItemPlano } from "@/lib/paradas/tipos";

import { D } from "./paradas-fixtures";

const P = PARAMETROS_PADRAO;

function ch(x: Partial<ItemPlano> = {}): ItemPlano {
  const dataIp19 = x.dataIp19 ?? D(2026, 10, 25);
  const plano = x.plano ?? "500";
  return {
    chave: `${plano}|1|${dataIp19}|0`, plano, item: "1", ordem: "", texto: "", equipamento: "EQ-1", campo: "", ativo: "", mes: "2026-10",
    dataIp19, disciplina: "MEC", centro: "", hh: 0, situacao: "", origemHh: "ip19", centroAssumido: true, ...x,
  };
}
const op = (ordem: string, operacao: string, centroTrabalho: string, horas: number, cancelada = false) =>
  ({ ordem, operacao, centroTrabalho, horas, cancelada });
const ord = (ordem: string, plano: string, equipamento: string, inicio: number) => ({ ordem, plano, equipamento, inicio });

describe("completar o HH da IP19", () => {
  it("C1: pelas operações da própria ordem", () => {
    const r = completarHh([ch({ ordem: "9000001" })], [], [op("9000001", "0010", "MEC_COMP", 1.5), op("9000001", "0020", "ELE_COMP", 0.5),
      op("9000001", "0030", "MEC_COMP", 3, true), op("9000001", "0040", "ELMC_MTZ", 2)], P);
    expect(r.itens.map((i) => [i.disciplina, i.hh, i.origemHh, i.centro])).toEqual([
      ["MEC", 1.5, "iw38op-ordem", "MEC_COMP"], ["ELE", 0.5, "iw38op-ordem", "ELE_COMP"]]);
    expect(r.itens.map((i) => i.chave)).toEqual([`500|1|${D(2026, 10, 25)}|0`, `500|1|${D(2026, 10, 25)}|1`]);
    expect(r.itens[0].centroAssumido).toBeUndefined();
    expect(r.completadas["iw38op-ordem"]).toBe(1);
  });

  it("C2: ordem do mesmo plano e equipamento de início mais próximo (empate: a mais recente)", () => {
    const ops = [op("9000010", "0010", "MEC_COMP", 1), op("9000011", "0010", "MEC_COMP", 2), op("9000012", "0010", "ELE_COMP", 4)];
    const a = completarHh([ch()], [ord("9000010", "500", "EQ-1", D(2026, 10, 1)), ord("9000011", "500", "EQ-1", D(2026, 10, 20))], ops, P);
    expect(a.itens.map((i) => [i.hh, i.origemHh])).toEqual([[2, "iw38op-plano"]]);
    const b = completarHh([ch()], [ord("9000011", "500", "EQ-1", D(2026, 10, 20)), ord("9000012", "500", "EQ-1", D(2026, 10, 30))], ops, P);
    expect(b.itens.map((i) => [i.disciplina, i.hh])).toEqual([["ELE", 4]]);
  });

  it("C3: outra chamada do mesmo plano e equipamento", () => {
    const outra = ch({ dataIp19: D(2026, 10, 18), chave: "x", centro: "MEC_COMP", hh: 2, centroAssumido: undefined });
    const longe = ch({ dataIp19: D(2026, 9, 1), chave: "y", centro: "ELE_COMP", disciplina: "ELE", hh: 5, centroAssumido: undefined });
    const r = completarHh([ch(), outra, longe], [], [], P);
    const c = r.itens.filter((i) => i.dataIp19 === D(2026, 10, 25));
    expect(c.map((i) => [i.disciplina, i.hh, i.origemHh])).toEqual([["MEC", 2, "ip19-mesmo-plano"]]);
    expect(r.itens).toContain(outra);
  });

  it("C4: sem nada continua com HH 0", () => {
    const r = completarHh([ch()], [], [], P);
    expect(r.itens).toHaveLength(1);
    expect(r.itens[0]).toMatchObject({ hh: 0, origemHh: "sem-hh" });
    expect(r.completadas["sem-hh"]).toBe(1);
  });

  it("chamada com HH não muda", () => {
    const x = ch({ ordem: "9000001", hh: 3, centro: "MEC_COMP", centroAssumido: undefined });
    const r = completarHh([x], [], [op("9000001", "0010", "ELE_COMP", 1)], P);
    expect(r.itens[0]).toBe(x);
  });
});
