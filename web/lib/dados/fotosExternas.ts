import "server-only";

import { NextResponse } from "next/server";

import type { FotoExterna } from "../fotoMaterial";
import type { TipoImagem } from "./fotos";
import { baixarPagina, buscarImagemSugestao, chaveSugestao, imagemDaPagina, SugestaoErro, urlSugestaoErro } from "./fotosSugestao";

/**
 * Fotos do fabricante (cadastro `fotos_referencia.json`), que não são do cadastro do material: cada item traz o endereço da
 * imagem, a página de origem e o título. O navegador pede pela chave (`k`); o servidor busca o endereço DO CADASTRO com
 * as mesmas regras de segurança da foto sugerida (https, host público, redirecionamentos conferidos, 8 s, 6 MB).
 */

/**
 * Um item de cadastro de foto, já conferido. `url` é o endereço da imagem (passa na checagem); pode faltar, e então
 * só `pagina` (a página de produto) vale: o servidor tira a imagem principal dela na hora de mostrar.
 */
export interface FotoCadastro {
  url: string | null; pagina: string | null; titulo: string; buscado_em: string;
  /** foto de um produto equivalente (mesma especificação), não do item exato: o item não tem fabricante/referência */
  equivalente?: boolean;
}

/** Texto de cadastro sem caracteres de controle, cortado no tamanho pedido. */
export const textoLimpo = (x: unknown, n: number): string =>
  typeof x === "string" ? x.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, n) : "";

/** Página de origem: link https, de até 2000 caracteres, que passa na checagem de endereço. */
function linkPagina(x: unknown): string | null {
  if (typeof x !== "string" || !x.startsWith("https://") || x.length > 2000) return null;
  try {
    const href = new URL(x).href;
    return urlSugestaoErro(href) ? null : href;
  } catch {
    return null;
  }
}

/** Um item de cadastro de foto (`{ url?, pagina?, titulo, buscado_em }`): precisa de um endereço válido (imagem ou página). */
export function fotoDoCadastro(item: unknown): FotoCadastro | null {
  if (!item || typeof item !== "object") return null;
  const r = item as Record<string, unknown>;
  // a conferência não conseguiu carregar a imagem: fica fora da tela até a próxima conferência dar certo
  if (typeof r.falhas === "number" && r.falhas > 0) return null;
  const url = typeof r.url === "string" && !urlSugestaoErro(r.url) ? r.url : null;
  const pagina = linkPagina(r.pagina);
  if (!url && !pagina) return null;
  const quando = typeof r.buscado_em === "string" && !Number.isNaN(Date.parse(r.buscado_em))
    ? new Date(r.buscado_em).toISOString() : new Date(0).toISOString();
  return { url, pagina, titulo: textoLimpo(r.titulo, 200), buscado_em: quando, ...(r.equivalente === true && { equivalente: true }) };
}

/** Chave da foto: o hash do endereço da imagem, ou da página quando só há a página. */
// "p2|": a imagem tirada da página mudou de regra (sem logo da loja): chave nova, o navegador não usa a imagem guardada
export const chaveFoto = (f: FotoCadastro): string => chaveSugestao(f.url ?? `p2|${f.pagina ?? ""}`);

/** O que a tela recebe de uma foto do cadastro: a chave, a página e o título (sem o endereço da imagem). */
export function fotoExternaDe(f: FotoCadastro): FotoExterna {
  return { k: chaveFoto(f), pagina: f.pagina, titulo: f.titulo, ...(f.equivalente && { eq: true }) };
}

type Cadastro = Record<string, Record<string, unknown>>;
const pegar = (c: Cadastro, chave: string) => (Object.hasOwn(c, chave) ? fotoDoCadastro(c[chave]) : null);

/**
 * A foto do fabricante de um item, pronta para a tela (pela referência do material). Foto genérica do tipo de material
 * não entra: a foto mostrada tem de ser a do próprio item.
 */
export function fotosExternasDoItem(material: string, cadRef: Cadastro): { fotoRef: FotoExterna | null } {
  const ref = pegar(cadRef, material);
  return { fotoRef: ref ? fotoExternaDe(ref) : null };
}

// cache em memória das imagens (por chave do endereço): até ~30 MB, sai a mais antiga. Guarda também as falhas por
// 15 min (um endereço quebrado não faz cada miniatura esperar até 8 s de novo) e junta pedidos iguais simultâneos.
const LIMITE_CACHE = 30_000_000;
const PRAZO_FALHA_MS = 15 * 60_000;
const MAX_FALHAS = 5_000;
const cache = new Map<string, { bytes: Uint8Array; tipo: TipoImagem }>();
const falhas = new Map<string, number>();
const emAndamento = new Map<string, Promise<{ bytes: Uint8Array; tipo: TipoImagem }>>();
let bytesCache = 0;

function guardar(chave: string, img: { bytes: Uint8Array; tipo: TipoImagem }) {
  cache.set(chave, img);
  bytesCache += img.bytes.length;
  for (const [k, v] of cache) {
    if (bytesCache <= LIMITE_CACHE) break;
    cache.delete(k);
    bytesCache -= v.bytes.length;
  }
}

async function imagem(url: string, ignorarFalhaRecente = false): Promise<{ bytes: Uint8Array; tipo: TipoImagem }> {
  const chave = chaveSugestao(url);
  const pronta = cache.get(chave);
  if (pronta) return pronta;
  const falhou = falhas.get(chave);
  if (!ignorarFalhaRecente && falhou && Date.now() - falhou < PRAZO_FALHA_MS) throw new SugestaoErro("falhou há pouco");
  const andando = emAndamento.get(chave);
  if (andando) return andando;
  const p = buscarImagemSugestao(url)
    .then((img) => { falhas.delete(chave); guardar(chave, img); return img; })
    .catch((e) => {
      falhas.delete(chave);
      falhas.set(chave, Date.now());
      if (falhas.size > MAX_FALHAS) falhas.delete(falhas.keys().next().value!);
      throw e;
    })
    .finally(() => emAndamento.delete(chave));
  emAndamento.set(chave, p);
  return p;
}

// imagem principal de cada página de produto (chave = hash da página): o resultado fica; a falha, por 15 min
const LIMITE_PAGINAS = 5_000;
const paginasOk = new Map<string, string>();
const paginasFalha = new Map<string, number>();
const paginasAndando = new Map<string, Promise<string>>();

/** Endereço da imagem principal da página (baixa o HTML com as regras de segurança; em cache). */
async function imagemDaPaginaCache(pagina: string, ignorarFalhaRecente = false): Promise<string> {
  const chave = chaveSugestao(pagina);
  const pronta = paginasOk.get(chave);
  if (pronta) return pronta;
  const falhou = paginasFalha.get(chave);
  if (!ignorarFalhaRecente && falhou && Date.now() - falhou < PRAZO_FALHA_MS) throw new SugestaoErro("página falhou há pouco");
  const andando = paginasAndando.get(chave);
  if (andando) return andando;
  const p = baixarPagina(pagina)
    .then((html) => {
      const img = imagemDaPagina(html, pagina);
      if (!img) throw new SugestaoErro("a página não tem imagem de produto");
      paginasFalha.delete(chave);
      if (paginasOk.size >= LIMITE_PAGINAS) paginasOk.delete(paginasOk.keys().next().value!);
      paginasOk.set(chave, img);
      return img;
    })
    .catch((e) => {
      paginasFalha.delete(chave);
      paginasFalha.set(chave, Date.now());
      if (paginasFalha.size > MAX_FALHAS) paginasFalha.delete(paginasFalha.keys().next().value!);
      throw e;
    })
    .finally(() => paginasAndando.delete(chave));
  paginasAndando.set(chave, p);
  return p;
}

/**
 * Confere uma foto do cadastro como o site a mostraria (a imagem direta, ou a principal da página) e devolve o endereço
 * da imagem que carregou. Lança se não carrega (loja bloqueou, página sem foto, imagem quebrada).
 */
export async function conferirFotoExterna(f: FotoCadastro): Promise<string> {
  // a conferência tenta de verdade: uma falha guardada há pouco (de quem abriu a tela) não conta
  const alvo = f.url ?? await imagemDaPaginaCache(f.pagina!, true);
  await imagem(alvo, true);
  return alvo;
}

/** Falha passageira (tempo, rede, loja fora do ar ou limitando acesso): não conta contra a foto. */
export function falhaPassageira(e: unknown): boolean {
  const m = e instanceof Error ? e.message : String(e);
  return /^(prazo|tempo esgotado|sem resposta|nome não resolvido|leitura interrompida|falhou há pouco|página falhou há pouco)$/.test(m)
    || /^resposta (408|425|429|5\d\d)$/.test(m);
}

/**
 * Resposta com a imagem do cadastro (ou 404 se não há foto ou a busca falhou). Sem endereço de imagem, a imagem sai da
 * página de origem. Com a chave pedida igual à do endereço atual, o navegador guarda por uma semana; se o cadastro
 * mudou no meio, guarda nada.
 */
export async function respostaFotoExterna(f: FotoCadastro | null, kPedida: string): Promise<NextResponse> {
  if (!f) return new NextResponse("Sem foto.", { status: 404 });
  try {
    const alvo = f.url ?? await imagemDaPaginaCache(f.pagina!);
    const img = await imagem(alvo);
    return new NextResponse(Buffer.from(img.bytes), {
      headers: {
        "Content-Type": img.tipo,
        "Cache-Control": chaveFoto(f) === kPedida ? "private, max-age=604800" : "private, no-cache",
        "Content-Disposition": "inline",
        "Content-Security-Policy": "default-src 'none'; sandbox",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (e) {
    console.warn("foto externa não carregou:", e instanceof SugestaoErro ? e.message : e);
    // a falha fica guardada no servidor por 15 min; o navegador também não pede de novo nesse tempo
    return new NextResponse("Sem foto.", { status: 404, headers: { "Cache-Control": "private, max-age=900" } });
  }
}

/** Só para os testes: quantas imagens estão em cache e quantos bytes. */
export const _estadoCache = () => ({ itens: cache.size, bytes: bytesCache });
/** Só para os testes: esvazia o cache, as falhas guardadas e os pedidos em andamento. */
export function _limparCacheFotos() {
  cache.clear();
  falhas.clear();
  emAndamento.clear();
  paginasOk.clear();
  paginasFalha.clear();
  paginasAndando.clear();
  bytesCache = 0;
}
