import "server-only";

import { ordensEnriquecidas, type Contexto, type OrdemEnriquecida } from "@/lib/wcm/contexto";
import { NAT_BACKLOG, NAT_PLANO, PENDENTES, SITUACOES, STATUS_USUARIO } from "@/lib/wcm/preparo";
import { casa, ligado, lista, ordenar, termos, um, type Params } from "./_comum/url";
import type { Coluna, Linha } from "./_comum/TabelaDados";

/**
 * Ordens (IW38) — porta de paginas/ordens.py: recorte global (área/centro/tipo + período pela data da ordem),
 * filtros da página e as colunas da tabela. Usado pela página e pela exportação (/api/ordens).
 */
export interface FiltroOrdens { q: string; sit: string[]; nat: string; st: string[]; cls: string[]; atr: boolean; cst: boolean }

export function lerFiltro(p: Params): FiltroOrdens {
  return { q: um(p.q), sit: lista(p.sit), nat: um(p.nat), st: lista(p.st), cls: lista(p.cls), atr: ligado(p.atr), cst: ligado(p.cst) };
}

/** IW38 enriquecido no recorte global, sem o período (o backlog é foto de hoje). */
export function doRecorte(c: Contexto): OrdemEnriquecida[] {
  const { areas, tipos } = c.f, centros = c.centros;
  return ordensEnriquecidas(c).filter((o) => (!areas.length || areas.includes(o.localizacao))
    && (!centros.length || centros.includes(o.centroTrabalho)) && (!tipos.length || tipos.includes(o.tipo)));
}

export const noPeriodo = (c: Contexto, xs: OrdemEnriquecida[]) => xs.filter((o) => o.data != null && o.data >= c.f.ini && o.data <= c.f.fim);

export function filtrar(xs: OrdemEnriquecida[], f: FiltroOrdens): OrdemEnriquecida[] {
  const ts = termos(f.q);
  const sit = new Set(f.sit), st = new Set(f.st), cls = new Set(f.cls);
  return xs.filter((o) => (!ts.length || casa(o.busca, ts))
    && (!sit.size || sit.has(o.situacao))
    && (f.nat !== "plano" || o.comPlano) && (f.nat !== "backlog" || !o.comPlano)
    && (!st.size || o.statusUsuario.split(" ").some((t) => st.has(t)))
    && (!cls.size || cls.has(o.classe))
    && (!f.atr || o.atrasada) && (!f.cst || o.custoReal !== 0));
}

export const NATUREZAS = [{ valor: "todas", rotulo: "Todas" }, { valor: "plano", rotulo: NAT_PLANO }, { valor: "backlog", rotulo: NAT_BACKLOG }];
export const rotuloStatus = (t: string) => (STATUS_USUARIO[t] ? `${t} · ${STATUS_USUARIO[t]}` : t);
export const pendente = (o: OrdemEnriquecida) => PENDENTES.has(o.situacao);

// ----------------------------------------------------------------------------
// Colunas
// ----------------------------------------------------------------------------
export const COLUNAS: Coluna[] = [
  { chave: "ordem", rotulo: "Ordem", tipo: "codigo", celular: true },
  { chave: "tipoNome", rotulo: "Tipo" },
  { chave: "classe", rotulo: "Classe", dica: "Classe WCM do tipo de ordem (Metas e parâmetros › Tipos de ordem)" },
  { chave: "texto", rotulo: "Texto", tipo: "longo", celular: true },
  { chave: "equipamento", rotulo: "Equipamento", tipo: "codigo" },
  { chave: "objeto", rotulo: "Objeto técnico" },
  { chave: "situacao", rotulo: "Situação", celular: true },
  { chave: "statusUsuario", rotulo: "Status usuário" },
  { chave: "natureza", rotulo: "Natureza", dica: "Plano de manutenção = número na coluna Plano; Backlog = sem número" },
  { chave: "plano", rotulo: "Plano", tipo: "codigo" },
  { chave: "inicio", rotulo: "Início", tipo: "data", celular: true },
  { chave: "fim", rotulo: "Fim", tipo: "data" },
  { chave: "fimReal", rotulo: "Fim real", tipo: "data", dica: "Maior fim real das operações concluídas (IW38OP)" },
  { chave: "prazo", rotulo: "Prazo", celular: true },
  { chave: "leadTime", rotulo: "Lead time (dias)", tipo: "int", dica: "Fim real − data-base de início" },
  { chave: "hhApontadas", rotulo: "HH apontadas", tipo: "num1", dica: "Horas reais da IW47" },
  { chave: "setor", rotulo: "Setor" },
  { chave: "centroTrabalho", rotulo: "Centro de trabalho" },
  { chave: "custoReal", rotulo: "Custo real", tipo: "R$" },
  // as demais (escolha em "Colunas")
  { chave: "tipo", rotulo: "Tipo (código)", tipo: "codigo" },
  { chave: "prioridade", rotulo: "Prioridade" },
  { chave: "local", rotulo: "Local de instalação" },
  { chave: "localizacao", rotulo: "Localização" },
  { chave: "centroCusto", rotulo: "Centro de custo" },
  { chave: "centro", rotulo: "Centro" },
  { chave: "statusSistema", rotulo: "Status sistema" },
  { chave: "entrada", rotulo: "Entrada", tipo: "data" },
  { chave: "criadoPor", rotulo: "Criado por" },
  { chave: "custoPlanejado", rotulo: "Custo planejado", tipo: "R$" },
  { chave: "comPlano", rotulo: "Com plano", tipo: "bool" },
  { chave: "atrasada", rotulo: "Atrasada", tipo: "bool" },
  { chave: "diasEmAberto", rotulo: "Dias em aberto", tipo: "int" },
  { chave: "duracao", rotulo: "Duração (dias)", tipo: "int" },
  { chave: "pessoasApontaram", rotulo: "Pessoas que apontaram", tipo: "int" },
];
export const ESSENCIAIS = COLUNAS.slice(0, 19).map((c) => c.chave);
export const POR_CHAVE = Object.fromEntries(COLUNAS.map((c) => [c.chave, c]));

export function colunasEscolhidas(p: Params): { colunas: Coluna[]; escolhidas: boolean } {
  const sel = lista(p.cols).filter((k) => k in POR_CHAVE);
  return sel.length ? { colunas: COLUNAS.filter((c) => sel.includes(c.chave)).map((c) => ({ ...c, celular: true })), escolhidas: true }
    : { colunas: COLUNAS.filter((c) => ESSENCIAIS.includes(c.chave)), escolhidas: false };
}

export const linha = (o: OrdemEnriquecida): Linha => o as unknown as Linha;

/** Ordens do recorte global no período (a base da página) e as que passam nos filtros da página. */
export function ordensDaPagina(c: Contexto, p: Params): { base: OrdemEnriquecida[]; filtradas: OrdemEnriquecida[]; filtro: FiltroOrdens } {
  const base = noPeriodo(c, doRecorte(c));
  const filtro = lerFiltro(p);
  return { base, filtradas: filtrar(base, filtro), filtro };
}

/** Opções dos filtros da página, com a contagem no recorte. */
export function opcoesFiltro(base: OrdemEnriquecida[]) {
  const conta = (f: (o: OrdemEnriquecida) => string[]) => {
    const m = new Map<string, number>();
    for (const o of base) for (const v of f(o)) if (v) m.set(v, (m.get(v) ?? 0) + 1);
    return m;
  };
  const sit = conta((o) => [o.situacao]), st = conta((o) => o.statusUsuario.split(" ")), cls = conta((o) => [o.classe]);
  return {
    sit: SITUACOES.map((v) => ({ valor: v, n: sit.get(v) ?? 0 })).filter((x) => x.n),
    st: [...st.keys()].sort().map((v) => ({ valor: v, rotulo: rotuloStatus(v), n: st.get(v) })),
    cls: [...cls.keys()].sort().map((v) => ({ valor: v, n: cls.get(v) })),
  };
}

/** Ordenação da tabela: padrão = mais recentes primeiro (data da ordem). */
export function ordenarOrdens(xs: OrdemEnriquecida[], p: Params): { lista: OrdemEnriquecida[]; ord?: string; desc: boolean } {
  const ord = um(p.ord);
  if (ord && ord in POR_CHAVE) {
    const desc = um(p.dir) === "desc";
    return { lista: ordenar(xs, (o) => (o as unknown as Linha)[ord], desc), ord, desc };
  }
  return { lista: ordenar(xs, (o) => o.data, true), desc: true };
}
