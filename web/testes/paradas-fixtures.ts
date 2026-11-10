/** Dados FICTÍCIOS para os testes da programação de paradas (nada da empresa). */
import { classificar } from "@/lib/paradas/ativos";
import { PARAMETROS_PADRAO } from "@/lib/paradas/parametros";
import type { Ativo, Demanda, Disciplina, EntradaMotor, ItemPlano, Parametros } from "@/lib/paradas/tipos";
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

export function ativo(nome: string, denominacao: string, p: Parametros = PARAMETROS_PADRAO): Ativo {
  const c = classificar(denominacao, p);
  const j = p.juntos.find((x) => x.ativo === c.id);
  return { ...c, id: nome, campos: [`C-${nome}`], equipamentos: [`EQ-${nome}`], denominacao, ...(j ? { juntoCom: j.com } : {}) };
}

export function demanda(its: ItemPlano[]): Demanda {
  const datas = [...new Set(its.map((i) => i.dataIp19))].sort((a, b) => a - b);
  return {
    mes: its[0].mes, ativo: its[0].ativo, itens: its, primeiraData: datas[0], datas,
    hh: { mec: its.filter((i) => i.disciplina === "MEC").reduce((s, i) => s + i.hh, 0), ele: its.filter((i) => i.disciplina === "ELE").reduce((s, i) => s + i.hh, 0) },
  };
}

/** Denominações fictícias no formato das classes. */
export const DENOM: Record<string, string> = {
  "DRY BLEND": "DRY BLEND 01 TESTE", BANBURY: "BANBURY TESTE", "MOINHO 04": "MOINHO LAMINADOR SF 04 TESTE",
  "MOINHO 02": "MOINHO LAMINADOR SF 02 TESTE", "MOINHO 05": "MOINHO LAMINADOR SF 05 TESTE", "MOINHO 07": "MOINHO LAMINADOR SF 07 TESTE",
  "PRENSA COPE": "PRENSA COPE TESTE", "PRENSA PANSTONE": "PRENSA PANSTONE TESTE", "PRENSA A VÁCUO": "PRENSA A VÁCUO 001",
  "PELLET 01": "LINHA PELLET 01", "PELLET 02": "LINHA PELLET 02",
  "INJETORA 10": "INJETORA EXP 10 TESTE", "INJETORA 11": "INJETORA EXP 11 TESTE", "INJETORA 12": "INJETORA EXP 12 TESTE",
  "INJETORA 13": "INJETORA EXP 13 TESTE", "INJETORA 21": "INJETORA EXP 21 TESTE",
  "PVC 08": "INJETORA PVC TESTE 008", "PVC 09": "INJETORA PVC TESTE 009", "GOLDEN 01": "INJETORA 01 TESTE GOLDEN EAGLE",
  "GOLDEN 02": "INJETORA 02 TESTE GOLDEN EAGLE", "TIEN KANG 06": "INJETORA TIEN KANG 06",
  "PANSTONE 01": "PAN STONE 01 TESTE", "PANSTONE 02": "PAN STONE 02 TESTE", CALANDRA: "CALANDRA DE BORRACHA 001",
  "STABIL 01": "STABIL 01 TESTE", "MICRONIZADOR 01": "MICRONIZADOR 01 TESTE",
};

export function ativos(nomes: string[], p: Parametros = PARAMETROS_PADRAO): Record<string, Ativo> {
  return Object.fromEntries(nomes.map((n) => [n, ativo(n, DENOM[n] ?? n, p)]));
}

/** Parâmetros sem feriados (o padrão do teste). */
export const P0: Parametros = { ...PARAMETROS_PADRAO, feriados: [] };

/** Entrada do motor: novembro/2026 a partir de 02/11 (segunda), sem feriados. */
export function entrada(dem: ItemPlano[][], x: Partial<EntradaMotor> & { p?: Parametros } = {}): EntradaMotor {
  const p = x.p ?? P0;
  const nomes = [...new Set(dem.map((d) => d[0].ativo))];
  const ds = dem.map(demanda).sort((a, b) => (a.mes + a.ativo < b.mes + b.ativo ? -1 : 1));
  return { demandas: ds, ativos: { ...ativos(nomes, p), ...(x.ativos ?? {}) }, parametros: p, inicio: x.inicio ?? N(2), fim: x.fim ?? N(30),
    fixacoes: x.fixacoes, ocupacaoAnterior: x.ocupacaoAnterior };
}
