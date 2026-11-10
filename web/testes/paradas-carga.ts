/** Entrada grande FICTÍCIA para medir o motor (≈ 8 mil itens, 3 meses). Gerador determinístico (LCG). */
import { PARAMETROS_PADRAO } from "@/lib/paradas/parametros";
import type { Disciplina, EntradaMotor, ItemPlano } from "@/lib/paradas/tipos";

import { ativo, D, demanda } from "./paradas-fixtures";

export function entradaGrande(semente = 4242): EntradaMotor {
  let s = semente;
  const rnd = () => ((s = (s * 1103515245 + 12345) % 2147483648) / 2147483648);
  const p = { ...PARAMETROS_PADRAO, feriados: [] };
  const nomes: [string, string][] = [["DRY BLEND", "DRY BLEND 01 TESTE"], ["BANBURY", "BANBURY TESTE"], ["MOINHO 04", "MOINHO LAMINADOR SF 04 T"],
    ["CALANDRA", "CALANDRA DE BORRACHA 001"]];
  const nn = (n: number) => String(n).padStart(2, "0");
  for (const m of [2, 5, 7]) nomes.push([`MOINHO ${nn(m)}`, `MOINHO LAMINADOR SF ${nn(m)} T`]);
  for (const x of ["COPE", "PANSTONE", "A VÁCUO"]) nomes.push([`PRENSA ${x}`, `PRENSA ${x} TESTE`]);
  for (let i = 1; i <= 4; i++) nomes.push([`PELLET ${nn(i)}`, `LINHA PELLET ${nn(i)}`]);
  for (let i = 1; i <= 20; i++) nomes.push([`INJETORA ${nn(i)}`, `INJETORA EXP ${nn(i)} TESTE`]);
  for (let i = 1; i <= 25; i++) nomes.push([`PVC ${nn(i)}`, `INJETORA PVC TESTE 0${nn(i)}`]);
  for (let i = 1; i <= 20; i++) nomes.push([`GOLDEN ${nn(i)}`, `INJETORA ${nn(i)} TESTE GOLDEN EAGLE`]);
  for (let i = 1; i <= 10; i++) nomes.push([`TIEN KANG ${nn(i)}`, `INJETORA TIEN KANG ${nn(i)}`]);
  for (let i = 1; i <= 8; i++) nomes.push([`PANSTONE ${nn(i)}`, `PAN STONE ${nn(i)} TESTE`]);
  for (let i = 1; i <= 3; i++) nomes.push([`STABIL ${nn(i)}`, `STABIL ${nn(i)} TESTE`]);
  for (let i = 1; i <= 6; i++) nomes.push([`MICRONIZADOR ${nn(i)}`, `MICRONIZADOR ${nn(i)} TESTE`]);
  for (let i = 1; i <= 30; i++) nomes.push([`TIPO${String.fromCharCode(65 + (i % 26))}${i} 1`, `TIPO${String.fromCharCode(65 + (i % 26))}${i} 1`]);
  const ativos = Object.fromEntries(nomes.map(([n, d]) => [n, ativo(n, d, p)]));
  const demandas = [];
  let k = 0;
  for (const [mes, ini] of [["2026-11", D(2026, 11, 2)], ["2026-12", D(2026, 12, 1)], ["2027-01", D(2027, 1, 4)]] as const) {
    for (const [n] of nomes) {
      const its: ItemPlano[] = [];
      const q = 8 + Math.floor(rnd() * 24);
      for (let i = 0; i < q; i++) {
        const data = ini + Math.floor(rnd() * 25);
        const disc: Disciplina = rnd() < 0.7 ? "MEC" : "ELE";
        its.push({ chave: `G${k}|1|${data}|0`, plano: `G${k}`, item: "1", ordem: "", texto: "", equipamento: `EQ-${n}`, campo: `C-${n}`, ativo: n, mes,
          dataIp19: data, disciplina: disc, centro: disc === "MEC" ? "MEC_COMP" : "ELE_COMP", hh: Math.round(rnd() * 25) / 100 * (rnd() < 0.2 ? 20 : 1),
          situacao: "", origemHh: "ip19" });
        k++;
      }
      demandas.push(demanda(its.sort((a, b) => a.dataIp19 - b.dataIp19 || (a.chave < b.chave ? -1 : 1))));
    }
  }
  return { demandas, ativos, parametros: p, inicio: D(2026, 11, 2), fim: D(2027, 1, 31) };
}
