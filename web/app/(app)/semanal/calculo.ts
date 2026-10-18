import "server-only";

import { dados, type Contexto } from "@/lib/wcm/contexto";
import * as ex from "@/lib/wcm/execucao";
import * as ind from "@/lib/wcm/indicadores";
import * as saude from "@/lib/wcm/saude";

/**
 * Contas da Programação semanal no servidor, com cache pela versão das bases, dia e recorte:
 * - operações do recorte (ordens da área/centro/tipo, operações
 *   delas, situação com todos os apontamentos);
 * - saúde dos ativos do recorte (criticidade e risco para priorizar o que completa a folga).
 */
const g = globalThis as unknown as { __cmTelaSemanal?: Map<string, unknown> };
const cache = (g.__cmTelaSemanal ??= new Map());
function guardar<T>(chave: string, fn: () => T): T {
  if (cache.has(chave)) return cache.get(chave) as T;
  if (cache.size > 24) cache.clear();
  const v = fn();
  cache.set(chave, v);
  return v;
}

const assinatura = (c: Contexto) => [c.b.ordens, c.b.operacoes, c.b.confirmacoes, c.b.equipe, c.b.equipamentos, c.b.cruas.ip19, c.b.cruas.af]
  .map((x) => `${x.atualizado}:${x.dados?.length ?? -1}:${x.erro ?? ""}`).join("|") + `|${c.b.hoje}|${c.f.areas}|${c.centros}|${c.f.tipos}`;

export function operacoesDoRecorte(c: Contexto): ex.Atividade[] {
  return guardar(`ops|${assinatura(c)}`, () => {
    const oper = c.b.operacoes.dados;
    if (!oper?.length) return [];
    const { areas, tipos } = c.f, centros = c.centros;
    const o = c.b.ordens.dados;
    const ordens = o ? o.filter((x) => (!areas.length || areas.includes(x.localizacao)) && (!centros.length || centros.includes(x.centroTrabalho))
      && (!tipos.length || tipos.includes(x.tipo))) : null;
    let op = oper;
    if (ordens) { const s = new Set(ordens.map((x) => x.ordem)); op = op.filter((x) => s.has(x.ordem)); }
    return ex.operacoes(op, ordens, c.b.confirmacoes.dados, c.b.equipe.dados, c.b.hoje);
  });
}

/** Criticidade e risco de cada equipamento (Saúde dos ativos) no recorte. */
export async function criticidadeRisco(c: Contexto): Promise<{ crit: Record<string, string>; risco: Record<string, number> }> {
  const d = await dados(c);
  return guardar(`saude|${assinatura(c)}|${JSON.stringify(c.cad.equipamentos).length}`, () => {
    let anomalias: saude.AnomaliaSaude[] = [];
    try { anomalias = ind.anomaliasSemeq(d); } catch { anomalias = []; }
    const t = saude.calcular(d.ordens, d.hoje, { quebras: ind.quebras(d), afs: d.afs, chamadas: d.chamadas, anomalias,
      equip: c.b.equipamentos.dados, cadEq: c.cad.equipamentos });
    return { crit: Object.fromEntries(t.map((l) => [l.codigo, l.criticidade])), risco: Object.fromEntries(t.map((l) => [l.codigo, l.risco])) };
  });
}
