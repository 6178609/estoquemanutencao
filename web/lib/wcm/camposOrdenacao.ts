import "server-only";

import { fonte } from "@/lib/dados/fonte";
import type { Ordem } from "@/lib/wcm/preparo";

/**
 * Campo de ordenação de cada ordem (coluna "Campo de ordenação" do IW38), tirado das ordens já preparadas — sem baixar
 * o export de novo. Guardado pela lista de ordens (a mesma enquanto o IW38 não muda).
 * Na demonstração (sem repositório) não há essa coluna: o campo fictício é o próprio código do equipamento.
 */
const memo = new WeakMap<Ordem[], Map<string, string>>();

export async function camposDeOrdenacao(ordens: Ordem[] | null): Promise<Map<string, string>> {
  if (!ordens) return new Map();
  const pronto = memo.get(ordens);
  if (pronto) return pronto;
  const demo = !fonte();
  const mapa = new Map<string, string>();
  for (const o of ordens) {
    const c = demo ? (o.equipamento || "").trim().toUpperCase() : o.campo;
    if (o.ordem && c) mapa.set(o.ordem, c);
  }
  memo.set(ordens, mapa);
  return mapa;
}
