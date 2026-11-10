import { describe, expect, it } from "vitest";

import { programar } from "@/lib/paradas/motor";
import { alertas } from "@/lib/paradas/regras";
import type { ItemPlano, LinhaProgramacao } from "@/lib/paradas/tipos";

import { ativos, DENOM, entrada, item, itens, N } from "./paradas-fixtures";

const M = "2026-11";
const AT = ativos(Object.keys(DENOM));
function linha(ativo: string, data: number, turno: 1 | 2, hh = 1, x: Partial<LinhaProgramacao> = {}): LinhaProgramacao {
  const a = AT[ativo];
  return { id: `${M}|${ativo}|${x.parada ?? 1}|${turno}`, data, turno, ativo, mes: M, parada: 1, paradasNoMes: 1, hh: { mec: hh, ele: 0 },
    acima: { mec: 0, ele: 0 }, itens: [], marcas: [], tipo: a.tipo, grupo: a.grupo, campos: a.campos, ...x };
}
const e0 = (dem: string[] = []) => ({ ...entrada([[item("PVC 08", M, N(5), "MEC", 1)]]), ativos: AT,
  demandas: dem.map((a) => ({ mes: M, ativo: a, itens: [], hh: { mec: 1, ele: 0 }, primeiraData: N(5), datas: [N(5)] })) });
const cods = (ls: LinhaProgramacao[], dem: string[] = []) => alertas(ls, e0(dem)).map((a) => `${a.linhaId.split("|")[1]}:${a.codigo}`);

describe("alertas de regra", () => {
  it("o resultado do motor não tem alerta", () => {
    let s = 777;
    const rnd = () => ((s = (s * 1103515245 + 12345) % 2147483648) / 2147483648);
    const nomes = Object.keys(DENOM);
    for (let k = 0; k < 25; k++) {
      const dem: ItemPlano[][] = [];
      for (const n of nomes) {
        if (rnd() < 0.4) continue;
        const its: ItemPlano[] = [];
        for (let i = 0, q = 1 + Math.floor(rnd() * 10); i < q; i++)
          its.push(item(n, M, N(2 + Math.floor(rnd() * 28)), rnd() < 0.7 ? "MEC" : "ELE", Math.round(rnd() * 90) / 10));
        dem.push(its);
      }
      if (!dem.length) continue;
      const e = entrada(dem);
      expect(alertas(programar(e).linhas, e)).toEqual([]);
    }
    const e = entrada([itens("PRENSA COPE", N(5), "MEC", 42, 3), itens("DRY BLEND", N(2), "MEC", 8), itens("GOLDEN 01", N(2), "MEC", 60, 3)]);
    expect(alertas(programar(e).linhas, e)).toEqual([]);
  });

  it("uma regra por vez", () => {
    expect(cods([linha("PVC 08", N(15), 1, 0)])).toEqual(["PVC 08:CALENDARIO"]);
    expect(cods([linha("INJETORA 10", N(5), 2)])).toEqual(["INJETORA 10:SO_T1"]);
    expect(cods([linha("PRENSA COPE", N(4), 1), linha("PRENSA PANSTONE", N(6), 1)])).toEqual(["PRENSA COPE:PRENSA_SEMANA", "PRENSA PANSTONE:PRENSA_SEMANA"]);
    expect(cods([linha("PELLET 01", N(3), 1), linha("PELLET 01", N(10), 1, 1, { parada: 2 })])).toEqual(["PELLET 01:PELLET_SEGUIDA", "PELLET 01:PELLET_SEGUIDA"]);
    expect(cods([linha("BANBURY", N(9), 1), linha("MOINHO 04", N(10), 1)], ["BANBURY"])).toEqual(["MOINHO 04:JUNTO_FORA"]);
    expect(cods([linha("DRY BLEND", N(2), 1), linha("PVC 08", N(2), 1)])).toContain("PVC 08:DRY_BLEND_SOZINHA");
    expect(cods([linha("PRENSA COPE", N(4), 1), linha("PRENSA PANSTONE", N(6), 1, 1, { marcas: ["parada extra"] })])).toEqual([]);
  });

  it("máximo de ativos no dia: alerta em todas as linhas do dia", () => {
    const nomes = ["PVC 08", "GOLDEN 01", "TIEN KANG 06", "PANSTONE 01", "MICRONIZADOR 01", "CALANDRA", "STABIL 01", "INJETORA 21"];
    const ls = nomes.map((n, i) => linha(n, N(12), i % 2 ? 1 : 2, 0.5));
    const a = alertas(ls, e0()).filter((x) => x.codigo === "MAX_DIA");
    expect(a).toHaveLength(8);
  });

  it("capacidade além do estouro registrado", () => {
    expect(cods([linha("PVC 08", N(3), 2, 18, { acima: { mec: 3, ele: 0 } })])).toEqual([]);
    expect(cods([linha("PVC 08", N(3), 2, 18)])).toEqual(["PVC 08:CAPACIDADE"]);
  });
});
