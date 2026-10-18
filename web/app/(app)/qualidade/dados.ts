import "server-only";

import { dados, type Contexto } from "@/lib/wcm/contexto";
import * as ind from "@/lib/wcm/indicadores";
import * as q from "@/lib/wcm/qualidade";
import { assinatura, guardado } from "../ordens/_comum/cache";
import type { Coluna, TipoColuna } from "../ordens/_comum/TabelaDados";

/**
 * Qualidade dos dados : as checagens de web/lib/wcm/qualidade.ts no recorte global
 * (área, setor, centro e tipo; sem período — cada checagem olha os últimos 12 meses até hoje).
 */
export async function checagens(c: Contexto): Promise<q.Checagem[]> {
  const d = await dados(c);
  return guardado(`qual|${assinatura(c.b)}|${c.f.areas}|${c.centros}|${c.f.tipos}`, () => q.verificar(d.hoje, {
    ordens: d.ordens, oper: d.oper, notas: d.notas, conf: d.confTodos, equipe: d.equipe, equip: c.b.equipamentos.dados,
    cadEq: d.cadEq, quebras: ind.quebras(d), fimReal: ind.fimRealPorOrdem(d.oper),
  }));
}

const TIPOS: Record<string, TipoColuna> = { HH: "num1", Dias: "int", Apontamentos: "int" };

/** Colunas da lista de problemas (rótulo = chave), com o tipo para formatar. */
export const colunasDe = (ch: q.Checagem): Coluna[] =>
  ch.colunas.map((k) => ({ chave: k, rotulo: k, tipo: q.COLUNAS_DATA.has(k) ? "data" : TIPOS[k] ?? "texto" }));
