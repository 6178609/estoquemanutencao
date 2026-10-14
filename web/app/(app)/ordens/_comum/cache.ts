import "server-only";

import type { Bases } from "@/lib/wcm/dados";

/**
 * Cache em memória das telas Ordens / Notas / Requisições / Busca / Qualidade (compartilhado entre elas). A chave
 * leva a assinatura das bases (muda quando qualquer export muda) — o mesmo critério do cache de contexto.ts.
 */
const g = globalThis as unknown as { __cmTelasOrdens?: Map<string, unknown> };
const cache = (g.__cmTelasOrdens ??= new Map());

export function guardado<T>(chave: string, fn: () => T): T {
  if (cache.has(chave)) return cache.get(chave) as T;
  if (cache.size > 48) cache.clear();
  const v = fn();
  cache.set(chave, v);
  return v;
}

export const assinatura = (b: Bases) => [b.ordens, b.notas, b.operacoes, b.confirmacoes, b.equipamentos, b.equipe, b.requisicoes,
  b.cruas.ip19, b.cruas.af, b.cruas.acoesAf].map((x) => `${x.atualizado}:${x.dados?.length ?? -1}:${x.erro ?? ""}`).join("|") + `|${b.hoje}`;
