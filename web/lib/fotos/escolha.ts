import { normalizarBusca } from "../dados/texto";
import { urlSugestaoErro } from "../dados/fotosSugestao";

/**
 * Escolha automática da foto a partir dos resultados da busca (sem IA). Funções puras, testadas em
 * testes/fotosBusca.test.ts.
 */

export interface ResultadoBusca { imagem: string; pagina: string | null; titulo: string }

const EXTENSAO = /\.(jpe?g|png|webp)$/i;
const BANCOS = ["shutterstock", "istockphoto", "alamy", "dreamstime", "depositphotos", "gettyimages", "123rf"];
const MIN_REF = 4;

/** Imagem https (checagem de endereço) com extensão jpg/jpeg/png/webp ou sem extensão. */
export function imagemAceitavel(url: string): boolean {
  if (urlSugestaoErro(url)) return false;
  const ultimo = new URL(url).pathname.split("/").pop() ?? "";
  return !!ultimo && (EXTENSAO.test(ultimo) || !ultimo.includes("."));
}

/** Domínio de banco de imagens com marca d'água. */
export function bancoDeImagem(url: string): boolean {
  const host = new URL(url).hostname.toLowerCase();
  return BANCOS.some((b) => host.includes(b));
}

/** A página só se for um endereço válido (senão vai vazia, sem recusar a imagem). */
const paginaSegura = (p: string | null): string | null => (p && !urlSugestaoErro(p) ? p : null);

/** Referência comparável: maiúsculas, sem acento, espaços, pontos, hífens, barras e sublinhados. */
export const refNormalizada = (s: string): string => normalizarBusca(s).replace(/[\s.\-/_]/g, "");

/** Consulta da foto exata: "<FAB> <REF> <primeiras palavras do PDM>". */
export function consultaFotoExata(fab: string, ref: string, pdm: string): string {
  return [fab, ref, ...pdm.split(/\s+/).filter(Boolean).slice(0, 3)].filter(Boolean).join(" ");
}

/**
 * Foto exata: a 1ª imagem (imagem e página fora de banco de imagens) cujo título OU página contém a referência (normalizada, com ao
 * menos 4 caracteres); entre elas, prefere a que também traz o fabricante. null se nenhuma serve.
 */
export function escolherFotoExata(resultados: ResultadoBusca[], fab: string, ref: string): ResultadoBusca | null {
  const r = refNormalizada(ref);
  if (r.length < MIN_REF) return null;
  const f = refNormalizada(fab);
  const texto = (x: ResultadoBusca) => refNormalizada(`${x.titulo} ${x.pagina ?? ""}`);
  const candidatos = resultados
    .filter((x) => imagemAceitavel(x.imagem) && !bancoDeImagem(x.imagem))
    .map((x) => ({ imagem: x.imagem, pagina: paginaSegura(x.pagina), titulo: x.titulo }))
    .filter((x) => !x.pagina || !bancoDeImagem(x.pagina));
  const comRef = candidatos.filter((x) => texto(x).includes(r));
  const escolhido = comRef.find((x) => !!f && texto(x).includes(f)) ?? comRef[0];
  return escolhido ?? null;
}
