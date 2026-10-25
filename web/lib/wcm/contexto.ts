import "server-only";

import { cookies } from "next/headers";

import { estoque as lerEstoque } from "../dados/bases";
import { lerCadastro } from "../dados/cadastros";
import * as af from "./af";
import { bases as lerBases, type Bases } from "./dados";
import { COOKIE_FILTROS, descrever, filtrado, lerFiltros, paraIso, type Filtros } from "./filtros";
import * as hh from "./hh";
import * as ind from "./indicadores";
import * as planos from "./planos";
import type { Confirmacao, Ordem } from "./preparo";
import { hashTexto, SETORES, setorDoCentro, somarMeses, inicioDoMes, type Dia } from "./util";

/**
 * Liga as telas WCM aos dados: filtros globais em cascata, dados do recorte e os
 * resultados (período, anterior de mesma duração, série mensal e scorecard). Cache por versão das bases + dia.
 */
type Cadastro = Record<string, Record<string, unknown>>;

export interface Contexto {
  f: Filtros;
  b: Bases;
  cad: { metas: Cadastro; equipamentos: Cadastro; materiais: Cadastro; hh: Cadastro };
  tipos: Record<string, ind.TipoOrdem>;
  /** centros efetivos (o setor escolhido sem centro vira a lista dos centros dele) */
  centros: string[];
  chamadas: planos.ChamadaClassificada[] | null;
  afs: af.Af[] | null;
  acoesAf: af.AcaoAf[] | null;
  opcoes: import("@/components/BarraFiltros").OpcoesFiltro;
  recorte: string;
}

const g = globalThis as unknown as { __cmCtx?: Map<string, unknown> };
const cache = (g.__cmCtx ??= new Map());
function guardado<T>(chave: string, fn: () => T): T {
  if (cache.has(chave)) return cache.get(chave) as T;
  if (cache.size > 64) cache.clear();
  const v = fn();
  cache.set(chave, v);
  return v;
}

/** Assinatura das bases (muda quando qualquer export muda) — entra na chave dos caches. */
const assinatura = (b: Bases) => [b.ordens, b.notas, b.operacoes, b.confirmacoes, b.equipamentos, b.equipe, b.requisicoes,
  b.cruas.ip19, b.cruas.af, b.cruas.acoesAf].map((x) => `${x.atualizado}:${x.dados?.length ?? -1}:${x.erro ?? ""}`).join("|") + `|${b.hoje}`;

function todosCentros(b: Bases): string[] {
  const s = new Set<string>();
  for (const xs of [b.ordens.dados, b.operacoes.dados, b.confirmacoes.dados, b.notas.dados])
    for (const x of xs ?? []) if (x.centroTrabalho.trim()) s.add(x.centroTrabalho);
  return [...s].sort();
}

/** Contagem de ordens do período por valor, aplicando os outros filtros (filtro em cascata). */
function opcoesDe(b: Bases, f: Filtros, tipos: Record<string, ind.TipoOrdem>) {
  const per = (b.ordens.dados ?? []).filter((o) => o.data != null && o.data >= f.ini && o.data <= f.fim);
  const passa = (o: Ordem, exceto: string) =>
    (exceto === "area" || !f.areas.length || f.areas.includes(o.localizacao)) &&
    (exceto === "setor" || !f.setores.length || f.setores.includes(o.setor)) &&
    (exceto === "centro" || !f.centros.length || f.centros.includes(o.centroTrabalho)) &&
    (exceto === "tipo" || !f.tipos.length || f.tipos.includes(o.tipo));
  const contar = (campo: "localizacao" | "setor" | "centroTrabalho" | "tipo", exceto: string, sel: string[], ordem?: string[]) => {
    const m = new Map<string, number>();
    for (const o of per) if (passa(o, exceto) && o[campo]) m.set(o[campo], (m.get(o[campo]) ?? 0) + 1);
    let vivos = [...m.entries()].sort((a, c) => c[1] - a[1]).map(([v]) => v);
    if (ordem) vivos = ordem.filter((v) => m.has(v));
    return [...vivos, ...sel.filter((v) => !m.has(v))].map((v) => ({ valor: v, n: m.get(v) ?? 0,
      rotulo: campo === "tipo" ? ind.rotuloTipo(v, tipos) : undefined }));
  };
  return { areas: contar("localizacao", "area", f.areas), setores: contar("setor", "setor", f.setores, [...SETORES]),
    centros: contar("centroTrabalho", "centro", f.centros), tipos: contar("tipo", "tipo", f.tipos) };
}

export async function contexto(params: Record<string, string | string[] | undefined>): Promise<Contexto> {
  const [b, jar] = await Promise.all([lerBases(), cookies()]);
  let minimo: Dia | null = null, maximo: Dia | null = null;
  for (const o of b.ordens.dados ?? []) if (o.data != null) {
    if (minimo == null || o.data < minimo) minimo = o.data;
    if (maximo == null || o.data > maximo) maximo = o.data;
  }
  const f = lerFiltros(params, jar.get(COOKIE_FILTROS)?.value, b.hoje, { minimo, maximo });
  const [metas, equipamentos, materiais, cadHh, tiposOrdemGestao] = await Promise.all([
    lerCadastro(ind.ARQ_METAS), lerCadastro("cadastro_equipamentos.json"), lerCadastro("cadastro_materiais.json"), lerCadastro(hh.ARQ),
    lerCadastro("tipos_ordem.json"),
  ]);
  // nomes dos tipos de ordem: os da Gestão de HH (Fontes de dados) completados/sobrescritos pelos cadastrados em Metas
  const daGestao = Object.fromEntries(Object.entries(tiposOrdemGestao)
    .map(([cod, v]) => [cod, String((v as { descricao?: unknown })?.descricao ?? "")]).filter(([, d]) => d));
  const tipos = ind.tiposDe(metas as Cadastro, daGestao);
  const sig = assinatura(b);
  const chamadas = guardado(`ch|${sig}`, () => {
    const origem = b.cruas.ip19.dados?.length ? planos.prepararIp19(b.cruas.ip19.dados) : b.ordens.dados ? planos.deIw38(b.ordens.dados) : null;
    return origem?.length ? planos.classificar(origem, b.ordens.dados, b.hoje) : null;
  });
  const afs = guardado(`af|${sig}`, () => (b.cruas.af.dados ? af.prepararAfs(b.cruas.af.dados, b.hoje) : null));
  const acoesAf = guardado(`ac|${sig}`, () => (b.cruas.acoesAf.dados ? af.prepararAcoes(b.cruas.acoesAf.dados, b.hoje, afs) : null));
  // marcar todas as opções = não filtrar
  const opcoes = opcoesDe(b, f, tipos);
  const tudo = (sel: string[], ops: { valor: string }[]) => (ops.length > 1 && ops.every((o) => sel.includes(o.valor)) ? [] : sel);
  f.areas = tudo(f.areas, opcoes.areas); f.setores = tudo(f.setores, opcoes.setores);
  f.centros = tudo(f.centros, opcoes.centros); f.tipos = tudo(f.tipos, opcoes.tipos);
  const centros = f.centros.length ? f.centros
    : f.setores.length ? (todosCentros(b).filter((c) => f.setores.includes(setorDoCentro(c))).length
      ? todosCentros(b).filter((c) => f.setores.includes(setorDoCentro(c))) : ["—"]) : [];
  const nRec = (b.ordens.dados ?? []).filter((o) => o.data != null && o.data >= f.ini && o.data <= f.fim
    && (!f.areas.length || f.areas.includes(o.localizacao)) && (!centros.length || centros.includes(o.centroTrabalho))
    && (!f.tipos.length || f.tipos.includes(o.tipo))).length;
  const recorte = `${descrever(f.ini, f.fim)} · ${new Intl.NumberFormat("pt-BR").format(nRec)} ordens${filtrado(f) ? "" : " · fábrica inteira"}`;
  return { f, b, cad: { metas: metas as Cadastro, equipamentos: equipamentos as Cadastro, materiais: materiais as Cadastro, hh: cadHh as Cadastro },
    tipos, centros, chamadas, afs, acoesAf, opcoes, recorte };
}

/** Parâmetros da barra de filtros para a página. */
export const barra = (c: Contexto) => ({ ini: paraIso(c.f.ini), fim: paraIso(c.f.fim), opcoes: c.opcoes, recorte: c.recorte });

// ----------------------------------------------------------------------------
// Dados filtrados
// ----------------------------------------------------------------------------
/** Apontamentos (IW47) no recorte: centro pelo apontamento; área pela ordem ou pelo equipamento (IH08); tipo idem. */
export function filtrarConf(c: Contexto, conf: Confirmacao[] | null, areas: string[], centros: string[], tiposF: string[]): Confirmacao[] | null {
  if (!conf || !(areas.length || centros.length || tiposF.length)) return conf;
  const ref = new Map<string, Ordem>();
  for (const o of c.b.ordens.dados ?? []) if (!ref.has(o.ordem)) ref.set(o.ordem, o);
  const areaEq = new Map((c.b.equipamentos.dados ?? []).map((e) => [e.equipamento, e.localizacao]));
  return conf.filter((x) => (!centros.length || centros.includes(x.centroTrabalho))
    && (!areas.length || areas.includes(ref.get(x.ordem)?.localizacao ?? areaEq.get(x.equipamento) ?? ""))
    && (!tiposF.length || tiposF.includes(x.tipo || ref.get(x.ordem)?.tipo || "")));
}

export async function dados(c: Contexto, recorte?: { areas?: string[]; centros?: string[]; tipos?: string[] }): Promise<ind.Dados> {
  const areas = recorte?.areas ?? c.f.areas, centros = recorte?.centros ?? c.centros, tiposF = recorte?.tipos ?? c.f.tipos;
  const est = await lerEstoque();
  return guardado(`d|${assinatura(c.b)}|${areas}|${centros}|${tiposF}|${hashTexto(JSON.stringify(c.cad.metas))}|${hashTexto(JSON.stringify(c.cad.hh))}`, () => {
    const o = c.b.ordens.dados ?? [];
    const ordens = o.filter((x) => (!areas.length || areas.includes(x.localizacao)) && (!centros.length || centros.includes(x.centroTrabalho))
      && (!tiposF.length || tiposF.includes(x.tipo)));
    const conj = new Set(ordens.map((x) => x.ordem));
    const notas = c.b.notas.dados?.filter((n) => (!areas.length || areas.includes(n.localizacao)) && (!centros.length || centros.includes(n.centroTrabalho))) ?? null;
    const confTodos = filtrarConf(c, c.b.confirmacoes.dados, areas, centros, tiposF);
    const equipe = c.b.equipe.dados;
    const daEquipe = equipe?.length ? new Set(equipe.map((p) => p.np)) : null;
    const conf = confTodos && daEquipe ? confTodos.filter((x) => daEquipe.has(x.np)) : confTodos;
    let ch = c.chamadas;
    if (ch) {
      if (centros.length) ch = ch.filter((x) => centros.includes(x.centroTrabalho));
      if (tiposF.length) ch = ch.filter((x) => tiposF.includes(x.tipoOrdem) || x.tipoOrdem === "");
      if (areas.length) {
        const areaEq = new Map((c.b.equipamentos.dados ?? []).map((e) => [e.equipamento, e.localizacao]));
        const areaOrd = new Map(o.map((x) => [x.ordem, x.localizacao]));
        ch = ch.filter((x) => areas.includes(areaEq.get(x.equipamento) ?? areaOrd.get(x.ordem) ?? ""));
      }
    }
    return {
      ordens, notas, oper: c.b.operacoes.dados?.filter((x) => conj.has(x.ordem)) ?? null, chamadas: ch, estoque: est.dados,
      requisicoes: c.b.requisicoes.dados, cadEq: c.cad.equipamentos, cadMat: c.cad.materiais, capacidade: ind.capacidadeDe(c.cad.metas),
      conf, confTodos, equipe: equipe && centros.length ? equipe.filter((p) => centros.includes(p.centroTrabalho)) : equipe,
      tipos: c.tipos, horasSemana: ind.horasSemanaDe(c.cad.metas), disponibilidade: c.cad.hh,
      afs: c.afs, acoesAf: c.acoesAf, hoje: c.b.hoje, centros, tiposFiltro: tiposF, filtroAreaTipo: !!(areas.length || tiposF.length),
      memo: new Map(),
    } satisfies ind.Dados;
  });
}

/** (período, anterior de mesma duração — só onde a base cobre ao menos metade dele). */
export async function resultados(c: Contexto): Promise<[ind.Resultado, ind.Resultado]> {
  const d = await dados(c);
  const [a, b] = ind.periodoAnterior(c.f.ini, c.f.fim);
  return [ind.calcular(d, c.f.ini, c.f.fim), ind.comparavel(ind.calcular(d, a, b))];
}

/** Série mensal dos últimos `meses` meses até o fim do período. */
export async function serieMensal(c: Contexto, meses = 12) {
  const d = await dados(c);
  // sempre os últimos `meses` meses até o fim do período (com "Mês atual" a tendência continua tendo história)
  const ini = inicioDoMes(somarMeses(inicioDoMes(Math.min(c.f.fim, c.b.hoje)), -(meses - 1)));
  return ind.mensal(d, ini, Math.min(c.f.fim, c.b.hoje));
}

/** Indicadores do período para cada área / setor / centro (scorecard). */
export async function porDimensao(c: Contexto, campo: "areas" | "setores" | "centros", valores: string[]): Promise<Record<string, ind.Resultado>> {
  const resultados = await Promise.all(valores.map(async (v) => {
    let rec: { areas?: string[]; centros?: string[] };
    if (campo === "setores") {
      const base = c.centros.length ? c.centros : todosCentros(c.b);
      rec = { centros: base.filter((x) => setorDoCentro(x) === v).length ? base.filter((x) => setorDoCentro(x) === v) : ["—"] };
    } else rec = campo === "areas" ? { areas: [v] } : { centros: [v] };
    return [v, ind.calcular(await dados(c, rec), c.f.ini, c.f.fim)] as const;
  }));
  return Object.fromEntries(resultados);
}

export interface OrdemEnriquecida extends Ordem {
  fimReal: Dia | null; leadTime: number | null; prazo: "" | "No prazo" | "Concluída com atraso" | "Atrasada (em aberto)";
  hhApontadas: number | null; pessoasApontaram: number; classe: string; tipoNome: string;
}

/** IW38 + fim real (IW38OP), lead time, prazo, HH apontadas (IW47) e classe WCM do tipo. */
export function ordensEnriquecidas(c: Contexto): OrdemEnriquecida[] {
  return guardado(`oe|${assinatura(c.b)}|${Object.keys(c.tipos).length}`, () => {
    const fr = ind.fimRealPorOrdem(c.b.operacoes.dados);
    const hhO = new Map<string, number>(), pes = new Map<string, Set<string>>();
    for (const x of c.b.confirmacoes.dados ?? []) {
      hhO.set(x.ordem, (hhO.get(x.ordem) ?? 0) + x.horas);
      (pes.get(x.ordem) ?? pes.set(x.ordem, new Set()).get(x.ordem)!).add(x.np);
    }
    const temConf = c.b.confirmacoes.dados != null;
    return (c.b.ordens.dados ?? []).map((o) => {
      const fimReal = fr.get(o.ordem) ?? null;
      const lt = fimReal != null && o.inicio != null ? fimReal - o.inicio : null;
      const concl = o.situacao === "Concluída" && fimReal != null && o.fim != null;
      return { ...o, fimReal, leadTime: lt != null && lt >= 0 ? lt : null,
        prazo: concl && fimReal! <= o.fim! ? "No prazo" : concl ? "Concluída com atraso" : o.atrasada ? "Atrasada (em aberto)" : "",
        hhApontadas: temConf ? hhO.get(o.ordem) ?? null : null, pessoasApontaram: pes.get(o.ordem)?.size ?? 0,
        classe: ind.classeTipo(o.tipo, c.tipos), tipoNome: ind.rotuloTipo(o.tipo, c.tipos) };
    });
  });
}
