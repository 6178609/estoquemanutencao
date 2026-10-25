import { normalizarBusca } from "../dados/texto";
import { urlSugestaoErro } from "../dados/fotosSugestao";

/**
 * Escolha automática da foto a partir dos resultados da busca (sem IA). Funções puras, testadas em
 * testes/fotosBusca.test.ts.
 */

export interface ResultadoBusca { imagem: string; pagina: string | null; titulo: string }

const EXTENSAO = /\.(jpe?g|png|webp)$/i;
const BANCOS = ["shutterstock", "istockphoto", "alamy", "dreamstime", "depositphotos", "gettyimages", "123rf"];
const PALAVRAS_VAZIAS = new Set(["PARA", "COM", "SEM", "TIPO", "OUTRO", "OUTROS"]);
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
 * Foto exata: a 1ª imagem cujo título OU página contém a referência (normalizada, com ao menos 4 caracteres); entre
 * elas, prefere a que também traz o fabricante. null se nenhuma serve.
 */
export function escolherFotoExata(resultados: ResultadoBusca[], fab: string, ref: string): ResultadoBusca | null {
  const r = refNormalizada(ref);
  if (r.length < MIN_REF) return null;
  const f = refNormalizada(fab);
  const texto = (x: ResultadoBusca) => refNormalizada(`${x.titulo} ${x.pagina ?? ""}`);
  const candidatos = resultados
    .filter((x) => imagemAceitavel(x.imagem))
    .map((x) => ({ imagem: x.imagem, pagina: paginaSegura(x.pagina), titulo: x.titulo }));
  const comRef = candidatos.filter((x) => texto(x).includes(r));
  const escolhido = comRef.find((x) => !!f && texto(x).includes(f)) ?? comRef[0];
  return escolhido ?? null;
}

/** Consulta da foto ilustrativa: "<nome> <subcategoria> produto" (a subcategoria só se for outra palavra). */
export function consultaTipo(nome: string, subcategoria = ""): string {
  return [nome, subcategoria && subcategoria !== nome ? subcategoria : "", "produto"].filter(Boolean).join(" ");
}

/**
 * Foto ilustrativa (PDM, subcategoria ou categoria): a 1ª imagem https válida, fora de banco de imagens, cujo título
 * contém ao menos uma palavra significativa do nome (4 letras ou mais, sem as palavras vazias).
 */
export function escolherFotoTipo(resultados: ResultadoBusca[], nome: string): ResultadoBusca | null {
  const palavras = normalizarBusca(nome).split(/[^A-Z0-9]+/).filter((p) => p.length >= 4 && !PALAVRAS_VAZIAS.has(p));
  if (!palavras.length) return null;
  for (const x of resultados) {
    if (!imagemAceitavel(x.imagem) || bancoDeImagem(x.imagem)) continue;
    const pagina = paginaSegura(x.pagina);
    if (pagina && bancoDeImagem(pagina)) continue;
    const titulo = normalizarBusca(x.titulo);
    if (palavras.some((p) => titulo.includes(p))) return { imagem: x.imagem, pagina, titulo: x.titulo };
  }
  return null;
}
