import { bancoDeImagem, paginaDeBusca, refNormalizada } from "../fotos/escolha";

/**
 * Escolha do datasheet do material entre os resultados de uma busca web, pela mesma regra das fotos: a referência (REF)
 * do Sysmat tem de estar no título ou no endereço. Loja, marketplace, banco de imagens e página de resultado de busca não servem. Preferência: PDF
 * com a REF, depois o site do fabricante (o nome dele no endereço), depois o primeiro que passou. Função pura.
 */
export interface ResultadoWeb { titulo: string; url: string }
export interface DatasheetAchado { url: string; titulo: string; pdf: boolean }

const MIN_REF = 4;
/** Lojas e marketplaces: a página vende, não documenta (e muda ou some). */
const LOJAS = /(^|\.)(mercadolivre|mercadolibre|amazon|aliexpress|alibaba|shopee|magazineluiza|magalu|americanas|submarino|casasbahia|ebay|olx|walmart|temu|shein)\./i;

export const consultaDatasheet = (fab: string, ref: string): string => [fab, ref, "datasheet"].filter(Boolean).join(" ");

export function escolherDatasheet(resultados: ResultadoWeb[], fab: string, ref: string): DatasheetAchado | null {
  const r = refNormalizada(ref);
  if (r.length < MIN_REF) return null;
  const f = refNormalizada(fab);
  const ok = resultados.flatMap((x) => {
    let u: URL;
    try { u = new URL(x.url); } catch { return []; }
    if (u.protocol !== "https:" || LOJAS.test(u.hostname) || bancoDeImagem(x.url) || paginaDeBusca(x.url)) return [];
    const texto = refNormalizada(`${x.titulo} ${u.hostname}${u.pathname}`);
    if (!texto.includes(r)) return [];
    // referência curta (menos de 6 caracteres) pega peça errada fácil: exige também o fabricante
    if (r.length < 6 && (!f || !texto.includes(f))) return [];
    return [{ url: u.href, titulo: (x.titulo || u.hostname).trim().slice(0, 200), pdf: /\.pdf$/i.test(u.pathname), host: refNormalizada(u.hostname) }];
  });
  const escolhido = ok.find((x) => x.pdf) ?? ok.find((x) => !!f && x.host.includes(f.slice(0, 12))) ?? ok[0];
  return escolhido ? { url: escolhido.url, titulo: escolhido.titulo, pdf: escolhido.pdf } : null;
}
