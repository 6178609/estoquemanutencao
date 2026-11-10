import { describe, expect, it } from "vitest";

import { diasDoMes, segundaDaChave } from "@/lib/paradas/calendario";
import { encaixar, encaixarT2T1, Estado } from "@/lib/paradas/motor/estado";
import type { Ativo, ItemPlano } from "@/lib/paradas/tipos";

import { ativo, ativos, item, N, P0 } from "./paradas-fixtures";

const NOMES = ["DRY BLEND", "BANBURY", "PVC 08", "PVC 09", "MOINHO 05", "MOINHO 04", "PRENSA COPE", "PRENSA PANSTONE", "PRENSA A VÁCUO",
  "PELLET 01", "PELLET 02", "INJETORA 21", "GOLDEN 01", "PANSTONE 01", "CALANDRA", "INJETORA 10"];
const MAQS: Record<string, Ativo> = Object.fromEntries("ABCDEFGH".split("").map((l) => [`MAQ${l}`, ativo(`MAQ${l}`, `TIPO${l} 1`)]));
const AT = { ...ativos(NOMES), ...MAQS };
const DIAS = [...diasDoMes("2026-10", P0, N(2)), ...diasDoMes("2026-11", P0, N(2)), ...diasDoMes("2026-12", P0, N(2))];
const novo = (anterior?: ConstructorParameters<typeof Estado>[3], demanda: string[] = []) => new Estado(DIAS, AT, P0, anterior, demanda);
const it1 = (a: string, hh = 1): ItemPlano[] => [item(a, "2026-11", N(2), "MEC", hh)];
const M = "2026-11";

describe("encaixe por itens", () => {
  it("first-fit por disciplina", () => {
    const xs = [item("X", M, N(2), "MEC", 30), item("X", M, N(2), "MEC", 10), item("X", M, N(2), "ELE", 5), item("X", M, N(2), "MEC", 2)];
    const r = encaixar(xs, { mec: 39, ele: 13 });
    expect(r.dentro.map((i) => i.hh)).toEqual([30, 5, 2]);
    expect(r.fora.map((i) => i.hh)).toEqual([10]);
    expect(encaixar([item("X", M, N(2), "MEC", 0)], { mec: 0, ele: 0 }).dentro).toHaveLength(1);
  });
  it("T2 primeiro, o resto no T1", () => {
    const xs = [item("X", M, N(2), "MEC", 10), item("X", M, N(2), "MEC", 20), item("X", M, N(2), "ELE", 4)];
    const r = encaixarT2T1(xs, { mec: 15, ele: 3 }, { mec: 39, ele: 13 });
    expect(r.t2.map((i) => i.hh)).toEqual([10]);
    expect(r.t1.map((i) => i.hh)).toEqual([20, 4]);
    expect(r.fora).toEqual([]);
  });
});

describe("regras R1–R15", () => {
  it("calendário, turno e sábado", () => {
    const e = novo();
    expect(e.falhas("PVC 08", M, N(1), "T1")).toContain("CALENDARIO");
    expect(e.falhas("PVC 08", M, N(7), "T2")).toContain("CALENDARIO");
    expect(e.falhas("PVC 08", M, N(7), "T1")).toEqual([]);
    expect(e.falhas("DRY BLEND", M, N(3), "T2")).toContain("SO_T1");
    expect(e.falhas("INJETORA 21", M, N(7), "T1")).toContain("SABADO");
    expect(e.falhas("CALANDRA", M, N(3), "T1")).toContain("SABADO");
    expect(e.falhas("CALANDRA", M, N(7), "T1")).toEqual([]);
  });

  it("DRY BLEND: um crítico por dia e T1 exclusivo", () => {
    const e = novo();
    e.colocar("DRY BLEND", M, N(2), 1, it1("DRY BLEND"), 1, []);
    expect(e.falhas("BANBURY", M, N(2), "T1")).toContain("DOIS_CRITICOS");
    expect(e.falhas("PVC 08", M, N(2), "T1")).toContain("DRY_BLEND_SOZINHA");
    expect(e.falhas("PVC 08", M, N(2), "T2")).toEqual([]);
  });

  it("moinho SF só no dia da prensa", () => {
    const e = novo();
    expect(e.falhas("MOINHO 05", M, N(4), "T1")).toContain("MOINHO_SEM_PRENSA");
    e.colocar("PRENSA COPE", M, N(4), 1, it1("PRENSA COPE"), 1, []);
    expect(e.falhas("MOINHO 05", M, N(4), "T1")).toEqual([]);
  });

  it("mesmo tipo no dia e mesmo ativo na semana", () => {
    const e = novo();
    e.colocar("PVC 08", M, N(3), 1, it1("PVC 08"), 1, []);
    expect(e.falhas("PVC 09", M, N(3), "T2")).toContain("MESMO_TIPO");
    expect(e.falhas("PVC 08", M, N(3), "T2")).toEqual([]);
    expect(e.falhas("PVC 08", M, N(5), "T1")).toContain("SEMANA_REPETIDA");
    expect(e.falhas("PVC 08", M, N(10), "T1")).toEqual([]);
  });

  it("uma prensa por semana, nunca a mesma da semana anterior", () => {
    const e = novo();
    e.colocar("PRENSA COPE", M, N(4), 1, it1("PRENSA COPE"), 1, []);
    expect(e.falhas("PRENSA PANSTONE", M, N(6), "T1")).toContain("PRENSA_SEMANA");
    expect(e.falhas("PRENSA COPE", M, N(11), "T1")).toContain("PRENSA_SEGUIDA");
    expect(e.falhas("PRENSA A VÁCUO", M, N(11), "T1")).toEqual([]);
    expect(e.falhas("PRENSA PANSTONE", M, N(6), "T1", { extra: true })).not.toContain("PRENSA_SEMANA");
  });

  it("Pellet da semana anterior ao início (virada do mês)", () => {
    expect(segundaDaChave("2026-W44")).toBe(N(2) - 7);
    const e = novo([{ semana: "2026-W44", ativo: "PELLET 01", grupo: "PELLET" }]);
    expect(e.falhas("PELLET 01", M, N(3), "T1")).toContain("PELLET_SEGUIDA");
    expect(e.falhas("PELLET 02", M, N(3), "T1")).toEqual([]);
  });

  it("máximo por dia e T1 cheio em dia de crítico", () => {
    const e = novo();
    "ABCDEFG".split("").forEach((l, i) => e.colocar(`MAQ${l}`, M, N(12), i % 2 ? 1 : 2, it1(`MAQ${l}`), 1, []));
    expect(e.falhas("MAQH", M, N(12), "T2")).toContain("MAX_DIA");
    const f = novo();
    f.colocar("INJETORA 21", M, N(5), 1, it1("INJETORA 21"), 1, []);
    f.colocar("GOLDEN 01", M, N(5), 1, it1("GOLDEN 01"), 1, []);
    expect(f.falhas("PANSTONE 01", M, N(5), "T1")).toContain("T1_CHEIO");
    expect(f.falhas("PANSTONE 01", M, N(5), "T2")).toEqual([]);
  });

  it("junto com o Banbury quando ele tem demanda no mês", () => {
    expect(novo(undefined, [`${M}|BANBURY`]).falhas("MOINHO 04", M, N(9), "T1")).toContain("JUNTO_FORA");
    expect(novo().falhas("MOINHO 04", M, N(9), "T1")).toEqual([]);
  });

  it("capacidade, paradas no mês e mês da IP19", () => {
    const e = novo();
    expect(e.falhas("PVC 08", M, N(3), "T2", { hh: { mec: 16, ele: 0 } })).toContain("CAPACIDADE");
    expect(e.falhas("PVC 08", M, N(3), "T2+T1", { hh: { mec: 16, ele: 0 } })).toEqual([]);
    expect(e.falhas("PVC 08", M, N(3), "T2", { hh: { mec: 16, ele: 0 }, ignorarCapacidade: true })).toEqual([]);
    e.colocar("PVC 08", M, N(3), 1, it1("PVC 08"), 1, []);
    e.colocar("PVC 08", M, N(10), 1, it1("PVC 08"), 2, []);
    expect(e.falhas("PVC 08", M, N(17), "T1")).toContain("PARADAS_MES");
    const f = novo();
    f.colocar("PVC 08", M, N(3), 1, it1("PVC 08"), 1, []);
    expect(f.falhas("PVC 08", M, N(5), "T1")).toEqual(expect.arrayContaining(["SEMANA_REPETIDA", "SEGUNDA_MESMA_SEMANA"]));
    expect(novo().falhas("PVC 08", M, N(30) + 1, "T1")).toContain("FORA_DO_MES");
  });

  it("colocar e remover atualizam o livre do turno", () => {
    const e = novo();
    const l = e.colocar("PVC 08", M, N(3), 2, [item("PVC 08", M, N(3), "MEC", 10), item("PVC 08", M, N(3), "ELE", 1)], 1, []);
    expect(l.id).toBe(`${M}|PVC 08|1|2`);
    expect(e.livre(N(3), 2)).toEqual({ mec: 5, ele: 2 });
    expect(e.ativosNoDia(N(3))).toEqual(["PVC 08"]);
    e.remover(l.id);
    expect(e.livre(N(3), 2)).toEqual({ mec: 15, ele: 3 });
  });
});
