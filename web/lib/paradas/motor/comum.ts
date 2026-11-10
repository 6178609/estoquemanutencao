import type { Dia } from "@/lib/wcm/util";

import { segunda, type DiaTrabalho } from "../calendario";
import type { Ativo, Demanda, ItemPlano, LinhaProgramacao, Marca, Parametros, SemHh } from "../tipos";
import { encaixarT2T1, hhDe, type Estado, type ModoTurno } from "./estado";

/** Contexto de um mês do motor (o `Estado` e o rodízio dos moinhos atravessam os meses). */
export interface Ctx {
  est: Estado; p: Parametros; ativos: Record<string, Ativo>; inicio: Dia;
  mes: string; diasMes: DiaTrabalho[];
  demandas: Map<string, Demanda>;
  /** itens ainda sem lugar, por ativo */
  pend: Map<string, ItemPlano[]>;
  /** ordem em que os ativos ficaram com saldo pendente (passo 5) */
  ordemPend: string[];
  semHh: SemHh[]; avisos: string[];
  rodizio: { ultimo: number };
}

export const MOTIVO = {
  prensa: "Não coube nas semanas de prensa do mês (1 prensa por semana, sem repetir a da semana anterior, 1 dia por parada, só 1º turno, máx. 2 paradas)",
  moinho: "Não coube junto com a prensa da semana (só 1º turno)",
  extra: "Saldo da parada extra que não coube no 1º turno",
  demais: "Não coube em 2 paradas no mês com a capacidade dos Parâmetros",
} as const;

export const util = (d: DiaTrabalho) => d.condicao === "util";
export const sabado = (d: DiaTrabalho) => d.condicao === "sabado";

export function pendentes(c: Ctx, ativo: string): ItemPlano[] {
  return c.pend.get(ativo) ?? [];
}

/** Guarda o que sobrou do ativo (vazio = nada pendente). */
export function deixar(c: Ctx, ativo: string, itens: ItemPlano[]): void {
  if (!itens.length) { c.pend.delete(ativo); return; }
  c.pend.set(ativo, itens);
}

/** Marca o ativo como "com saldo" (entra no passo 5 nessa ordem). */
export function anotarSaldo(c: Ctx, ativo: string): void {
  if (pendentes(c, ativo).length && !c.ordemPend.includes(ativo)) c.ordemPend.push(ativo);
}

export function proximaParada(c: Ctx, ativo: string): 1 | 2 {
  return c.est.numerosDeParada(c.mes, ativo).includes(1) ? 2 : 1;
}

/** Segunda-feira da 1ª parada do ativo no mês (a 2ª parada vai em semana posterior). */
export function semanaDaPrimeira(c: Ctx, ativo: string): Dia | null {
  const ds = c.est.paradasDoAtivo(c.mes, ativo);
  return ds.length ? segunda(ds[0]) : null;
}

/** Dias do mês a partir do início (e, se `depoisDe`, só em semanas posteriores). */
export function diasValidos(c: Ctx, filtro: (d: DiaTrabalho) => boolean, depoisDe: Dia | null = null): DiaTrabalho[] {
  return c.diasMes.filter((d) => d.data >= c.inicio && filtro(d) && (depoisDe == null || segunda(d.data) > depoisDe));
}

export function livreModo(c: Ctx, d: Dia, modo: ModoTurno) {
  const a = modo === "T1" ? c.est.livre(d, 1) : c.est.livre(d, 2);
  if (modo !== "T2+T1") return a;
  const b = c.est.livre(d, 1);
  return { mec: a.mec + b.mec, ele: a.ele + b.ele };
}

/**
 * Coloca os itens no dia pelo modo de turno. No T2+T1 enche o T2 primeiro e o resto vai no T1 (marca "1º+2º turno"
 * quando os dois turnos recebem). Devolve o que não coube.
 */
export function colocarModo(c: Ctx, ativo: string, d: Dia, modo: ModoTurno, itens: ItemPlano[], parada: 1 | 2, marcas: Marca[],
  forcarT1 = false): { linhas: LinhaProgramacao[]; fora: ItemPlano[] } {
  if (modo !== "T2+T1") return { linhas: [c.est.colocar(ativo, c.mes, d, modo === "T1" ? 1 : 2, itens, parada, marcas)], fora: [] };
  const r = encaixarT2T1(itens, c.est.livre(d, 2), c.est.livre(d, 1));
  const t1 = forcarT1 ? [...r.t1, ...r.fora] : r.t1;
  const fora = forcarT1 ? [] : r.fora;
  if (!r.t2.length && !t1.length) return { linhas: [], fora: itens };
  const dois = r.t2.length > 0 && t1.length > 0;
  const m: Marca[] = dois ? [...marcas, "1º+2º turno"] : marcas;
  const linhas: LinhaProgramacao[] = [];
  if (r.t2.length) linhas.push(c.est.colocar(ativo, c.mes, d, 2, r.t2, parada, m));
  if (t1.length) linhas.push(c.est.colocar(ativo, c.mes, d, 1, t1, parada, m));
  return { linhas, fora };
}

export const hhTotal = (xs: ItemPlano[]) => { const h = hhDe(xs); return h.mec + h.ele; };

/** Ativos com demanda no mês, por (1ª data IP19, nome). */
export function porPrimeiraData(c: Ctx, ativos: string[]): string[] {
  return ativos.slice().sort((a, b) => (c.demandas.get(a)?.primeiraData ?? 0) - (c.demandas.get(b)?.primeiraData ?? 0) || (a < b ? -1 : a > b ? 1 : 0));
}
