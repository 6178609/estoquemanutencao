import { normalizarBusca } from "./texto";

/**
 * Tipo (PDM) de um material: o do cadastro do Sysmat; sem ele, deduzido do texto breve pelo prefixo das palavras
 * (normalizadas, sem acento). Funções puras, testadas em testes/fotosBusca.test.ts.
 */

/** Palavras de um texto, normalizadas e separadas por tudo que não é letra ou número. */
export const palavrasDe = (s: string): string[] => normalizarBusca(s).split(/[^A-Z0-9]+/).filter(Boolean);

/** Uma palavra do texto casa com a do PDM: igual, ou abreviada (pelo menos 4 letras, prefixo da palavra do PDM). */
const casa = (t: string, p: string) => t === p || (t.length >= 4 && p.startsWith(t));

/** Os PDMs conhecidos (do catálogo), sem repetir e sem vazios. Guardado por lista de itens (o catálogo é reaproveitado). */
const pdmsPorItens = new WeakMap<object, string[]>();
export function pdmsConhecidos(itens: { pdm: string }[]): string[] {
  const guardado = pdmsPorItens.get(itens);
  if (guardado) return guardado;
  const r = [...new Set(itens.map((i) => i.pdm.trim()).filter(Boolean))];
  pdmsPorItens.set(itens, r);
  return r;
}

interface EntradaPdm { pdm: string; palavras: string[] }
interface IndicePdm { porPrefixo: Map<string, EntradaPdm[]>; memo: Map<string, string | null> }

/**
 * Índice dos PDMs pela 1ª palavra e pelos prefixos dela (4+ letras), montado uma vez por lista de PDMs: a dedução olha
 * só os PDMs que podem casar a 1ª palavra do texto (antes, todos os ~9,5 mil a cada material).
 */
const indices = new WeakMap<string[], IndicePdm>();
function indiceDe(pdms: string[]): IndicePdm {
  let ind = indices.get(pdms);
  if (ind) return ind;
  const porPrefixo = new Map<string, EntradaPdm[]>();
  for (const pdm of pdms) {
    const palavras = palavrasDe(pdm);
    const w = palavras[0];
    if (!w) continue;
    const chaves = new Set([w]);
    for (let i = 4; i < w.length; i++) chaves.add(w.slice(0, i));
    for (const k of chaves) {
      const lista = porPrefixo.get(k);
      if (lista) lista.push({ pdm, palavras });
      else porPrefixo.set(k, [{ pdm, palavras }]);
    }
  }
  ind = { porPrefixo, memo: new Map() };
  indices.set(pdms, ind);
  return ind;
}

/**
 * O PDM cujas primeiras palavras mais casam com o texto breve (o prefixo mais longo). Empate: o PDM mais curto,
 * depois o alfabético. null se nenhum PDM casa a primeira palavra.
 */
export function deduzirPdm(descricao: string, pdms: string[]): string | null {
  const t = palavrasDe(descricao);
  if (!t.length) return null;
  const ind = indiceDe(pdms);
  const chave = t.join(" ");
  if (ind.memo.has(chave)) return ind.memo.get(chave)!;
  let melhor: { pdm: string; n: number; palavras: number } | null = null;
  for (const { pdm, palavras: p } of ind.porPrefixo.get(t[0]) ?? []) {
    let n = 0;
    while (n < t.length && n < p.length && casa(t[n], p[n])) n++;
    if (!n) continue;
    const ganha = !melhor || n > melhor.n
      || (n === melhor.n && (p.length < melhor.palavras || (p.length === melhor.palavras && pdm < melhor.pdm)));
    if (ganha) melhor = { pdm, n, palavras: p.length };
  }
  const r = melhor?.pdm ?? null;
  if (ind.memo.size > 50_000) ind.memo.clear();
  ind.memo.set(chave, r);
  return r;
}

/** O PDM a usar para o item: o do cadastro; sem ele, o deduzido do texto breve; "" se nada casa. */
export function pdmEfetivo(pdm: string | null | undefined, descricao: string, pdms: string[]): string {
  const p = (pdm ?? "").trim();
  return p || deduzirPdm(descricao, pdms) || "";
}

/** Chaves de grupo no cadastro de fotos por tipo: `sub:<SubCategoria>` e `cat:<Categoria>`. */
export const chaveSubcategoria = (sub: string) => (sub.trim() ? `sub:${sub.trim()}` : "");
export const chaveCategoria = (cat: string) => (cat.trim() ? `cat:${cat.trim()}` : "");
