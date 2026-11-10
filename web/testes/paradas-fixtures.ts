/** Dados FICTÍCIOS para os testes da programação de paradas (nada da empresa). */
import type { Disciplina, ItemPlano } from "@/lib/paradas/tipos";
import type { Equipamento } from "@/lib/wcm/preparo";
import { dia, type Dia } from "@/lib/wcm/util";

export const D = (a: number, m: number, d: number): Dia => dia(a, m, d)!;
export const N = (d: number): Dia => D(2026, 11, d);

export function eq(codigo: string, localizacao = "GAL1", campo = "", denominacao = "", superior = ""): Equipamento {
  return {
    equipamento: codigo, denominacao, localizacao, codigoAbc: "", local: "", desativado: false, campo, centroCusto: "",
    centroTrabalho: "", statusSistema: "", statusUsuario: "", inventario: "", superior, inativo: false,
  };
}

let seq = 0;
export function item(ativo: string, mes: string, data: Dia, disciplina: Disciplina, hh: number, extra: Partial<ItemPlano> = {}): ItemPlano {
  const n = seq++;
  return {
    chave: `P${n}|1|${data}|0`, plano: `P${n}`, item: "1", ordem: "", texto: "", equipamento: `EQ-${ativo}`, campo: `C-${ativo}`, ativo, mes,
    dataIp19: data, disciplina, centro: disciplina === "MEC" ? "MEC_COMP" : "ELE_COMP", hh, situacao: "", origemHh: "ip19", ...extra,
  };
}

/** Vários itens de `hh` cada, somando `total`. */
export function itens(ativo: string, data: Dia, disciplina: Disciplina, total: number, hh = 1, mes = "2026-11"): ItemPlano[] {
  const out: ItemPlano[] = [];
  for (let s = 0; s < total - 1e-9; s += hh) out.push(item(ativo, mes, data, disciplina, Math.min(hh, total - s)));
  return out;
}

