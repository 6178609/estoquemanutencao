import { chave } from "@/lib/dados/texto";

import type { Requisicao } from "./preparo";

/**
 * Pessoas da manutenção: quem solicita pela manutenção (nomes como aparecem em "Solicitado por"). Marcadas em
 * Metas e parâmetros, no metas_wcm.json, item "_solicitantes" → { nomes: string[] }. Lista vazia = sem filtro.
 * Comparação pela chave (sem acento, maiúsculas, espaços normalizados). Puro: sem leitura de arquivos.
 */
type Cadastro = Record<string, Record<string, unknown>>;

/** Nomes marcados no cadastro (ignora o que não é texto não vazio). */
export function solicitantesDe(cad: Cadastro | null | undefined): string[] {
  const bruto = cad?._solicitantes?.nomes;
  if (!Array.isArray(bruto)) return [];
  return bruto.filter((n): n is string => typeof n === "string" && n.trim() !== "").map((n) => n.trim());
}

/** Só as requisições de quem está marcado. Sem marcados, devolve a mesma lista; nunca altera a lista recebida. */
export function soManutencao(reqs: Requisicao[] | null, nomes: string[]): Requisicao[] | null {
  if (!reqs) return null;
  if (!nomes.length) return reqs;
  const marcados = new Set(nomes.map(chave));
  return reqs.filter((r) => marcados.has(chave(r.solicitante)));
}

/** Nomes distintos (pela chave) com a quantidade de requisições; o texto mostrado é o mais frequente de cada chave. */
export function contarSolicitantes(reqs: Requisicao[] | null): { nome: string; qtd: number }[] {
  if (!reqs) return [];
  const grupos = new Map<string, { qtd: number; textos: Map<string, number> }>();
  for (const r of reqs) {
    const texto = (r.solicitante ?? "").trim();
    const k = chave(texto);
    if (!k) continue;
    const g = grupos.get(k) ?? { qtd: 0, textos: new Map<string, number>() };
    g.qtd++;
    g.textos.set(texto, (g.textos.get(texto) ?? 0) + 1);
    grupos.set(k, g);
  }
  return [...grupos.values()]
    .map((g) => ({ nome: [...g.textos.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "pt-BR"))[0][0], qtd: g.qtd }))
    .sort((a, b) => b.qtd - a.qtd || a.nome.localeCompare(b.nome, "pt-BR"));
}

/** Texto do escopo das requisições nas telas de custo: "pessoas da manutenção (N)" com lista ativa; senão "fábrica inteira". */
export const escopoRequisicoes = (pessoas?: number) => (pessoas ? `pessoas da manutenção (${pessoas})` : "fábrica inteira");
