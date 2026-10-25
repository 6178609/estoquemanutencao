import { normalizarBusca } from "./texto";

/**
 * Tipo (PDM) de um material: o do cadastro do Sysmat; sem ele, deduzido do texto breve pelo prefixo das palavras
 * (normalizadas, sem acento). Funções puras, testadas em testes/fotosBusca.test.ts.
 */

/** Palavras de um texto, normalizadas e separadas por tudo que não é letra ou número. */
export const palavrasDe = (s: string): string[] => normalizarBusca(s).split(/[^A-Z0-9]+/).filter(Boolean);

/** Uma palavra do texto casa com a do PDM: igual, ou abreviada (pelo menos 4 letras, prefixo da palavra do PDM). */
const casa = (t: string, p: string) => t === p || (t.length >= 4 && p.startsWith(t));

/** Os PDMs conhecidos (do catálogo), sem repetir e sem vazios. */
export function pdmsConhecidos(itens: { pdm: string }[]): string[] {
  return [...new Set(itens.map((i) => i.pdm.trim()).filter(Boolean))];
}

/**
 * O PDM cujas primeiras palavras mais casam com o texto breve (o prefixo mais longo). Empate: o PDM mais curto,
 * depois o alfabético. null se nenhum PDM casa a primeira palavra.
 */
export function deduzirPdm(descricao: string, pdms: string[]): string | null {
  const t = palavrasDe(descricao);
  if (!t.length) return null;
  let melhor: { pdm: string; n: number; palavras: number } | null = null;
  for (const pdm of pdms) {
    const p = palavrasDe(pdm);
    let n = 0;
    while (n < t.length && n < p.length && casa(t[n], p[n])) n++;
    if (!n) continue;
    const ganha = !melhor || n > melhor.n
      || (n === melhor.n && (p.length < melhor.palavras || (p.length === melhor.palavras && pdm < melhor.pdm)));
    if (ganha) melhor = { pdm, n, palavras: p.length };
  }
  return melhor?.pdm ?? null;
}

/** O PDM a usar para o item: o do cadastro; sem ele, o deduzido do texto breve; "" se nada casa. */
export function pdmEfetivo(pdm: string | null | undefined, descricao: string, pdms: string[]): string {
  const p = (pdm ?? "").trim();
  return p || deduzirPdm(descricao, pdms) || "";
}

/** Chaves de grupo no cadastro de fotos por tipo: `sub:<SubCategoria>` e `cat:<Categoria>`. */
export const chaveSubcategoria = (sub: string) => (sub.trim() ? `sub:${sub.trim()}` : "");
export const chaveCategoria = (cat: string) => (cat.trim() ? `cat:${cat.trim()}` : "");
