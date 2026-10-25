import "server-only";

import { NextResponse } from "next/server";

import type { FotoExterna } from "../fotoMaterial";
import type { TipoImagem } from "./fotos";
import { buscarImagemSugestao, chaveSugestao, SugestaoErro, urlSugestaoErro } from "./fotosSugestao";

/**
 * Fotos que não são do material (cadastros `fotos_tipos.json` e `fotos_referencia.json`): cada item traz o endereço da
 * imagem, a página de origem e o título. O navegador pede pela chave (`k`); o servidor busca o endereço DO CADASTRO com
 * as mesmas regras de segurança da foto sugerida (https, host público, redirecionamentos conferidos, 8 s, 6 MB).
 */

/** Um item de cadastro de foto, já conferido (o endereço da imagem passa na checagem). */
export interface FotoCadastro { url: string; pagina: string | null; titulo: string; buscado_em: string }

/** Texto de cadastro sem caracteres de controle, cortado no tamanho pedido. */
export const textoLimpo = (x: unknown, n: number): string =>
  typeof x === "string" ? x.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, n) : "";

/** Página de origem: link https, de até 2000 caracteres (o usuário abre; o servidor não busca). */
function linkPagina(x: unknown): string | null {
  if (typeof x !== "string" || !x.startsWith("https://") || x.length > 2000) return null;
  try {
    return new URL(x).href;
  } catch {
    return null;
  }
}

/** Um item de cadastro de foto (`{ url, pagina, titulo, buscado_em }`), ou null se o endereço da imagem não serve. */
export function fotoDoCadastro(item: unknown): FotoCadastro | null {
  if (!item || typeof item !== "object") return null;
  const r = item as Record<string, unknown>;
  if (typeof r.url !== "string" || urlSugestaoErro(r.url)) return null;
  const quando = typeof r.buscado_em === "string" && !Number.isNaN(Date.parse(r.buscado_em))
    ? new Date(r.buscado_em).toISOString() : new Date(0).toISOString();
  return { url: r.url, pagina: linkPagina(r.pagina), titulo: textoLimpo(r.titulo, 200), buscado_em: quando };
}

/** O que a tela recebe de uma foto do cadastro: a chave, a página e o título (sem o endereço da imagem). */
export function fotoExternaDe(f: FotoCadastro): FotoExterna {
  return { k: chaveSugestao(f.url), pagina: f.pagina, titulo: f.titulo };
}

type Cadastro = Record<string, Record<string, unknown>>;
const pegar = (c: Cadastro, chave: string) => (Object.hasOwn(c, chave) ? fotoDoCadastro(c[chave]) : null);

/** As fotos de fabricante (pela referência do material) e de tipo (pelo PDM) de um item, prontas para a tela. */
export function fotosExternasDoItem(material: string, pdm: string, cadRef: Cadastro, cadTipo: Cadastro):
  { fotoRef: FotoExterna | null; fotoTipo: FotoExterna | null } {
  const ref = pegar(cadRef, material);
  const tipo = pdm ? pegar(cadTipo, pdm) : null;
  return { fotoRef: ref ? fotoExternaDe(ref) : null, fotoTipo: tipo ? fotoExternaDe(tipo) : null };
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

async function imagem(url: string): Promise<{ bytes: Uint8Array; tipo: TipoImagem }> {
  const chave = chaveSugestao(url);
  const pronta = cache.get(chave);
  if (pronta) return pronta;
  const falhou = falhas.get(chave);
  if (falhou && Date.now() - falhou < PRAZO_FALHA_MS) throw new SugestaoErro("falhou há pouco");
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

/**
 * Resposta com a imagem do cadastro (ou 404 se não há foto ou a busca falhou). Com a chave pedida igual à do endereço
 * atual, o navegador guarda por uma semana; se o cadastro mudou no meio, guarda nada.
 */
export async function respostaFotoExterna(f: FotoCadastro | null, kPedida: string): Promise<NextResponse> {
  if (!f) return new NextResponse("Sem foto.", { status: 404 });
  try {
    const img = await imagem(f.url);
    return new NextResponse(Buffer.from(img.bytes), {
      headers: {
        "Content-Type": img.tipo,
        "Cache-Control": chaveSugestao(f.url) === kPedida ? "private, max-age=604800" : "private, no-cache",
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
  bytesCache = 0;
}
