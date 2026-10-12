import "server-only";

import type { Bases } from "@/lib/wcm/dados";

/**
 * Cache dos cálculos pesados destas telas (operações × apontamentos, anomalias…), pela versão das bases e pelo dia —
 * o mesmo esquema do contexto.ts, numa chave própria.
 */
const g = globalThis as unknown as { __cmTelasD?: Map<string, unknown> };
const cache = (g.__cmTelasD ??= new Map());

export function memo<T>(chave: string, fn: () => T): T {
  if (cache.has(chave)) return cache.get(chave) as T;
  if (cache.size > 48) cache.clear();
  const v = fn();
  cache.set(chave, v);
  return v;
}

export const assinatura = (b: Bases) => [b.ordens, b.notas, b.operacoes, b.confirmacoes, b.equipamentos, b.equipe,
  b.cruas.af, b.cruas.acoesAf].map((x) => `${x.atualizado}:${x.dados?.length ?? -1}`).join("|") + `|${b.hoje}`;

/** Parâmetro do endereço como texto único. */
export const param = (p: Record<string, string | string[] | undefined>, k: string) => {
  const v = p[k];
  return (Array.isArray(v) ? v[0] : v) ?? "";
};
