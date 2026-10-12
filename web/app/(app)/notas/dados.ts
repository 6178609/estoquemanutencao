import "server-only";

import type { Contexto } from "@/lib/wcm/contexto";
import type { Nota } from "@/lib/wcm/preparo";
import type { Coluna, Linha } from "../ordens/_comum/TabelaDados";
import { casa, ligado, lista, ordenar, termos, um, type Params } from "../ordens/_comum/url";

/**
 * Notas (IW28) — porta de paginas/notas.py: recorte global (área e centro), período pela data da nota e os filtros
 * da página. Usado pela página e pela exportação (/api/notas).
 */
export interface FiltroNotas { q: string; tipo: string[]; abc: string[]; sem: boolean; par: boolean }

export const lerFiltro = (p: Params): FiltroNotas =>
  ({ q: um(p.q), tipo: lista(p.tipo_nota), abc: lista(p.abc), sem: ligado(p.sem), par: ligado(p.par) });

const g = globalThis as unknown as { __cmNotasBusca?: WeakMap<Nota, string> };
const palheiros = (g.__cmNotasBusca ??= new WeakMap());
const palheiro = (n: Nota) => {
  let s = palheiros.get(n);
  if (s === undefined) {
    s = termos([n.nota, n.ordem, n.descricao, n.objeto, n.equipamento, n.notificador, n.local].join(" ")).join(" ");
    palheiros.set(n, s);
  }
  return s;
};

/** Notas do recorte global no período. */
export function doRecorte(c: Contexto): Nota[] {
  const areas = c.f.areas, centros = c.centros;
  return (c.b.notas.dados ?? []).filter((n) => (!areas.length || areas.includes(n.localizacao))
    && (!centros.length || centros.includes(n.centroTrabalho)) && n.data != null && n.data >= c.f.ini && n.data <= c.f.fim);
}

export function filtrar(xs: Nota[], f: FiltroNotas): Nota[] {
  const ts = termos(f.q), tipo = new Set(f.tipo), abc = new Set(f.abc);
  return xs.filter((n) => (!ts.length || casa(palheiro(n), ts)) && (!tipo.size || tipo.has(n.tipoNota))
    && (!abc.size || abc.has(n.codigoAbc)) && (!f.sem || !n.comOrdem) && (!f.par || n.quebra));
}

export function notasDaPagina(c: Contexto, p: Params) {
  const base = doRecorte(c);
  return { base, filtradas: filtrar(base, lerFiltro(p)) };
}

export const COLUNAS: Coluna[] = [
  { chave: "nota", rotulo: "Nota", tipo: "codigo", celular: true },
  { chave: "data", rotulo: "Data", tipo: "data", celular: true },
  { chave: "tipoNota", rotulo: "Tipo de nota" },
  { chave: "descricao", rotulo: "Descrição", tipo: "longo", celular: true },
  { chave: "objeto", rotulo: "Objeto técnico" },
  { chave: "equipamento", rotulo: "Equipamento", tipo: "codigo" },
  { chave: "codigoAbc", rotulo: "ABC" },
  { chave: "quebra", rotulo: "Quebra", tipo: "bool", dica: "Nota Y1 convertida em ordem YM11" },
  { chave: "comParada", rotulo: "Parada", tipo: "bool" },
  { chave: "ordem", rotulo: "Ordem", tipo: "codigo" },
  { chave: "tipoOrdem", rotulo: "Tipo da ordem" },
  { chave: "dias", rotulo: "Dias desde a nota", tipo: "int", celular: true },
  { chave: "centroTrabalho", rotulo: "Centro de trabalho" },
  { chave: "local", rotulo: "Local de instalação" },
  { chave: "notificador", rotulo: "Notificador" },
];
const CHAVES = new Set(COLUNAS.map((c) => c.chave));

export function ordenarNotas(xs: Nota[], p: Params) {
  const ord = um(p.ord);
  if (ord && CHAVES.has(ord)) {
    const desc = um(p.dir) === "desc";
    return { lista: ordenar(xs, (n) => (n as unknown as Linha)[ord], desc), ord, desc };
  }
  return { lista: ordenar(xs, (n) => n.data, true), ord: undefined, desc: true };
}

export const linha = (n: Nota): Linha => n as unknown as Linha;

/** Idade da fila sem ordem. */
export const FAIXAS_IDADE = [["Até 7 dias", 0, 7], ["8 a 30 dias", 8, 30], ["31 a 90 dias", 31, 90], ["Mais de 90 dias", 91, Infinity]] as const;
