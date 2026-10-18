import "server-only";

import { dados, type Contexto } from "@/lib/wcm/contexto";
import * as ind from "@/lib/wcm/indicadores";
import * as saude from "@/lib/wcm/saude";
import { hashTexto } from "../equipamentos/logica";

/**
 * Saúde dos ativos no servidor: uma conta por recorte de área/centro/tipo, com
 * cache pela versão das bases, pelo dia e pelo cadastro de equipamentos (a criticidade vem dele).
 * Também usada pela aba Equipamentos (fábrica inteira).
 */
const g = globalThis as unknown as { __cmTelaSaude?: Map<string, unknown> };
const cache = (g.__cmTelaSaude ??= new Map());

export function guardar<T>(chave: string, fn: () => T): T {
  if (cache.has(chave)) return cache.get(chave) as T;
  if (cache.size > 48) cache.clear();
  const v = fn();
  cache.set(chave, v);
  return v;
}

/** Assinatura das bases + cadastro de equipamentos (muda quando um export ou o cadastro muda). */
export function assinatura(c: Contexto): string {
  const b = c.b;
  return [b.ordens, b.notas, b.operacoes, b.confirmacoes, b.equipamentos, b.equipe, b.cruas.ip19, b.cruas.af]
    .map((x) => `${x.atualizado}:${x.dados?.length ?? -1}:${x.erro ?? ""}`).join("|") + `|${b.hoje}|${hashTexto(JSON.stringify(c.cad.equipamentos))}`;
}

/** Recorte da fábrica inteira (sem área, centro nem tipo). */
export const FABRICA = { areas: [] as string[], centros: [] as string[], tipos: [] as string[] };

export async function saudeAtivos(c: Contexto, fabricaInteira = false): Promise<saude.LinhaSaude[]> {
  const rec = fabricaInteira ? FABRICA : { areas: c.f.areas, centros: c.centros, tipos: c.f.tipos };
  const d = await dados(c, rec);
  return guardar(`s|${assinatura(c)}|${rec.areas}|${rec.centros}|${rec.tipos}`, () => {
    let anomalias: saude.AnomaliaSaude[] = [];
    try { anomalias = ind.anomaliasSemeq(d); } catch { anomalias = []; } // preditiva com problema não derruba a saúde
    return saude.calcular(d.ordens, d.hoje, { quebras: ind.quebras(d), afs: d.afs, chamadas: d.chamadas, anomalias,
      equip: c.b.equipamentos.dados, cadEq: c.cad.equipamentos });
  });
}
