import "server-only";

import { createHash } from "node:crypto";
import { lookup } from "node:dns/promises";
import { request } from "node:https";
import type { LookupFunction } from "node:net";

import type { SugestaoPublica } from "../fotoMaterial";
import { gravarCadastroLote, lerCadastro } from "./cadastros";
import { materialValido, tipoImagem, type TipoImagem } from "./fotos";

/**
 * Fotos sugeridas (busca na web) de cada material: o cadastro `sugestoes_fotos.json`, formato
 * `{ "<material>": { "sugestoes": [ { "url", "pagina", "titulo" } ], "buscado_em": "…" } }`. O navegador nunca recebe
 * o endereço da imagem: pede pelo índice e pela chave (um pedaço do hash do endereço), e o servidor busca a imagem
 * do cadastro, com as regras de segurança abaixo.
 */
const ARQUIVO_SUGESTOES = "sugestoes_fotos.json";
const LIMITE_SUGESTAO = 6 * 1024 * 1024;
const PRAZO_BUSCA_MS = 8_000;
const MAX_REDIRECIONAMENTOS = 3;
const PRAZO_DNS_MS = 3_000;

interface Sugestao { url: string; pagina: string | null; titulo: string }

export class SugestaoErro extends Error {}

const https = (x: unknown): string | null => (typeof x === "string" && x.startsWith("https://") ? x : null);

/** As sugestões válidas de um item do cadastro (sem endereços que não são https); a ordem é a do cadastro. */
export function sugestoesDoItem(item: unknown): Sugestao[] {
  const lista = (item as { sugestoes?: unknown } | null | undefined)?.sugestoes;
  if (!Array.isArray(lista)) return [];
  const out: Sugestao[] = [];
  for (const s of lista) {
    if (!s || typeof s !== "object") continue;
    const r = s as Record<string, unknown>;
    const url = https(r.url);
    if (!url) continue;
    out.push({ url, pagina: https(r.pagina), titulo: typeof r.titulo === "string" ? r.titulo.slice(0, 200) : "" });
  }
  return out;
}

/** Chave pública de uma sugestão: parte do hash do endereço (o navegador não precisa do endereço). */
export const chaveSugestao = (url: string) => createHash("sha1").update(url).digest("hex").slice(0, 12);

export function publicas(lista: Sugestao[]): SugestaoPublica[] {
  return lista.map((s, i) => ({ i, k: chaveSugestao(s.url), titulo: s.titulo, pagina: s.pagina }));
}

/** As sugestões de cada material pedido (só os do MB52, que a tela mostra). Sem as que estiverem vazias. */
export async function sugestoesDosMateriais(materiais: Set<string>): Promise<Record<string, SugestaoPublica[]>> {
  const cad = await lerCadastro(ARQUIVO_SUGESTOES);
  const out: Record<string, SugestaoPublica[]> = {};
  for (const m of materiais) {
    const lista = publicas(sugestoesDoItem(cad[m]));
    if (lista.length) out[m] = lista;
  }
  return out;
}

export async function lerSugestoes(material: string): Promise<Sugestao[]> {
  const cad = await lerCadastro(ARQUIVO_SUGESTOES);
  return sugestoesDoItem(cad[material]);
}

/** Tira a sugestão (pela chave) do material; devolve as que sobraram. Atômico: relê o cadastro na hora. */
export async function removerSugestao(material: string, k: string, por: string): Promise<SugestaoPublica[]> {
  let restantes: Sugestao[] = [];
  await gravarCadastroLote(ARQUIVO_SUGESTOES, {
    [material]: (atual) => {
      const lista = sugestoesDoItem(atual);
      restantes = lista.filter((s) => chaveSugestao(s.url) !== k);
      if (restantes.length === lista.length) return undefined; // já não estava (outra pessoa tirou antes)
      if (!restantes.length) return null;
      return {
        ...(atual ?? {}),
        sugestoes: restantes.map((s) => ({ url: s.url, pagina: s.pagina, titulo: s.titulo })),
      };
    },
  }, por, false);
  return publicas(restantes);
}

// ---------------------------------------------------------------------------- importação

/** Até quantos materiais um arquivo de importação traz, e até quantas sugestões por material. */
const MAX_MATERIAIS_IMPORTACAO = 5_000;
const MAX_SUGESTOES_POR_MATERIAL = 3;

/**
 * Lê o arquivo gerado pela busca de fotos (`{ "<material>": { "sugestoes": [...], "buscado_em" } }`) e devolve só o que
 * é aproveitável: material com código válido, sugestões https que passam na checagem de endereço (até 3), título e
 * página limpos. Lança SugestaoErro se o arquivo não tem esse formato.
 */
export function normalizarImportacao(json: unknown): Record<string, { sugestoes: Sugestao[]; buscado_em: string }> {
  if (!json || typeof json !== "object" || Array.isArray(json)) throw new SugestaoErro("O arquivo não está no formato das sugestões.");
  const entradas = Object.entries(json as Record<string, unknown>);
  if (entradas.length > MAX_MATERIAIS_IMPORTACAO) throw new SugestaoErro(`O arquivo passou de ${MAX_MATERIAIS_IMPORTACAO} materiais.`);
  const out: Record<string, { sugestoes: Sugestao[]; buscado_em: string }> = {};
  for (const [material, item] of entradas) {
    if (!materialValido(material)) continue;
    const sugestoes = sugestoesDoItem(item).filter((x) => !urlSugestaoErro(x.url)).slice(0, MAX_SUGESTOES_POR_MATERIAL);
    if (!sugestoes.length) continue;
    const quando = (item as { buscado_em?: unknown }).buscado_em;
    const data = typeof quando === "string" && !Number.isNaN(Date.parse(quando)) ? new Date(quando).toISOString() : new Date().toISOString();
    out[material] = { sugestoes, buscado_em: data };
  }
  return out;
}

/** Grava as sugestões importadas (a busca nova substitui a anterior do mesmo material). Devolve quantos materiais. */
export async function importarSugestoes(json: unknown, por: string): Promise<number> {
  const itens = normalizarImportacao(json);
  const n = Object.keys(itens).length;
  if (n) await gravarCadastroLote(ARQUIVO_SUGESTOES, itens as unknown as Record<string, Record<string, unknown>>, por, false);
  return n;
}

// ---------------------------------------------------------------------------- endereços

/** Endereço IP literal (v4 ou v6, entre colchetes na URL). */
const ipLiteral = (host: string) => host.startsWith("[") || /^[\d.]+$/.test(host);

function ipv4(texto: string): number[] | null {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(texto);
  if (!m) return null;
  const p = m.slice(1).map(Number);
  return p.every((x) => x <= 255) ? p : null;
}

/** IPv4 reservado, privado, de loopback, link-local, multicast ou de documentação. */
function ipv4Reservado([a, b, c]: number[]): boolean {
  if (a === 0 || a === 10 || a === 127 || a >= 224) return true;
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 0 && (c === 0 || c === 2)) return true;
  if (a === 192 && b === 168) return true;
  if (a === 192 && b === 88 && c === 99) return true;
  if (a === 198 && (b === 18 || b === 19)) return true;
  if (a === 198 && b === 51 && c === 100) return true;
  if (a === 203 && b === 0 && c === 113) return true;
  return false;
}

/** IPv6 em 8 grupos de 16 bits (aceita `::` e o final em formato decimal). null se não der para ler. */
function ipv6Grupos(texto: string): number[] | null {
  let s = texto.replace(/^\[|\]$/g, "").split("%")[0];
  const decimal = /(\d+\.\d+\.\d+\.\d+)$/.exec(s);
  if (decimal) {
    const v4 = ipv4(decimal[1]);
    if (!v4) return null;
    s = `${s.slice(0, decimal.index)}${((v4[0] << 8) | v4[1]).toString(16)}:${((v4[2] << 8) | v4[3]).toString(16)}`;
  }
  const partes = s.split("::");
  if (partes.length > 2) return null;
  const cabeca = partes[0] ? partes[0].split(":") : [];
  const cauda = partes.length === 2 && partes[1] ? partes[1].split(":") : [];
  const falta = 8 - cabeca.length - cauda.length;
  if (partes.length === 2 ? falta < 1 : cabeca.length !== 8) return null;
  const todos = [...cabeca, ...(partes.length === 2 ? Array(falta).fill("0") : []), ...cauda];
  if (todos.length !== 8 || !todos.every((g) => /^[0-9a-f]{1,4}$/i.test(g))) return null;
  return todos.map((g) => parseInt(g, 16));
}

/** Endereço que NÃO pode ser acessado a partir do servidor (privado, local, reservado, de rede interna). */
export function ipReservado(ip: string): boolean {
  if (!ip.includes(":")) {
    const v4 = ipv4(ip);
    return !v4 || ipv4Reservado(v4);
  }
  const g = ipv6Grupos(ip);
  if (!g) return true;
  const embutido = [g[6] >> 8, g[6] & 0xff, g[7] >> 8, g[7] & 0xff];
  if (g.slice(0, 5).every((x) => x === 0) && g[5] === 0xffff) return ipv4Reservado(embutido); // ::ffff:a.b.c.d
  if (g.slice(0, 6).every((x) => x === 0)) return true; // ::, ::1 e formato antigo com v4
  if (g[0] === 0x64 && g[1] === 0xff9b) return true; // NAT64: recusa por segurança
  if ((g[0] & 0xfe00) === 0xfc00) return true; // local único (fc00::/7)
  if ((g[0] & 0xffc0) === 0xfe80) return true; // link-local (fe80::/10)
  if ((g[0] & 0xff00) === 0xff00) return true; // multicast
  if ((g[0] === 0x2001 && g[1] === 0x0db8) || g[0] === 0x2002) return true; // documentação e 6to4
  if (g[0] === 0x0100 && g[1] === 0 && g[2] === 0 && g[3] === 0) return true; // descarte (100::/64)
  return false;
}

const LOCAIS = /(^|\.)(localhost|local|internal|localdomain)$/;

/**
 * Checagem sem rede: só https, sem usuário/senha, porta padrão, host com ponto (nada de `intranet`), sem nomes locais
 * e sem IP reservado. Devolve o motivo, ou null se passa.
 */
export function urlSugestaoErro(texto: string): string | null {
  let u: URL;
  try {
    u = new URL(texto);
  } catch {
    return "endereço inválido";
  }
  if (u.protocol !== "https:") return "só https";
  if (u.username || u.password) return "endereço com usuário";
  if (u.port) return "porta diferente da padrão";
  const host = u.hostname;
  if (!host) return "sem host";
  if (ipLiteral(host)) return ipReservado(host) ? "endereço reservado ou privado" : null;
  if (!host.includes(".")) return "nome sem ponto";
  if (host === "localhost" || LOCAIS.test(host)) return "nome local";
  const rotulos = host.split(".");
  if (!rotulos.every((r) => /^[a-z0-9-]{1,63}$/.test(r) && !r.startsWith("-") && !r.endsWith("-"))) return "nome inválido";
  if (!/^(?:[a-z]{2,}|xn--[a-z0-9-]+)$/.test(rotulos[rotulos.length - 1])) return "domínio inválido";
  return null;
}

/** Confere o endereço (sintaxe e, para nome, o DNS: todo endereço que ele resolve tem de ser público). */
async function urlSugestaoPublica(texto: string): Promise<string> {
  const erro = urlSugestaoErro(texto);
  if (erro) throw new SugestaoErro(erro);
  const u = new URL(texto);
  if (!ipLiteral(u.hostname)) {
    const enderecos = await comPrazo(lookup(u.hostname, { all: true, verbatim: true }), PRAZO_DNS_MS).catch(() => []);
    if (!enderecos.length) throw new SugestaoErro("nome não resolvido");
    if (enderecos.some((e) => ipReservado(e.address))) throw new SugestaoErro("nome aponta para endereço interno");
  }
  return u.href;
}

function comPrazo<T>(p: Promise<T>, ms: number): Promise<T> {
  let t: ReturnType<typeof setTimeout> | undefined;
  const prazo = new Promise<never>((_, rejeita) => { t = setTimeout(() => rejeita(new SugestaoErro("prazo")), ms); });
  return Promise.race([p, prazo]).finally(() => clearTimeout(t));
}

async function lerLimitado(corpo: AsyncIterable<Uint8Array>, limite: number): Promise<Uint8Array> {
  const partes: Uint8Array[] = [];
  let total = 0;
  for await (const value of corpo) {
    total += value.length;
    if (total > limite) throw new SugestaoErro("arquivo grande demais");
    partes.push(value);
  }
  const out = new Uint8Array(total);
  let p = 0;
  for (const x of partes) {
    out.set(x, p);
    p += x.length;
  }
  return out;
}

/**
 * Resolução de nome usada na própria conexão: só devolve endereços públicos. Assim o IP conferido é o mesmo que a
 * conexão usa (um DNS que muda de resposta entre a checagem e o acesso — "rebinding" — não leva a um endereço interno).
 */
const lookupPublico: LookupFunction = (host, opcoes, pronto) => {
  comPrazo(lookup(host, { all: true, verbatim: true }), PRAZO_DNS_MS)
    .then((enderecos) => {
      if (!enderecos.length) throw new SugestaoErro("nome não resolvido");
      if (enderecos.some((e) => ipReservado(e.address))) throw new SugestaoErro("nome aponta para endereço interno");
      if ((opcoes as { all?: boolean }).all) (pronto as unknown as (e: null, l: typeof enderecos) => void)(null, enderecos);
      else pronto(null, enderecos[0].address, enderecos[0].family);
    })
    .catch((e: Error) => pronto(e as NodeJS.ErrnoException, "", 4));
};

interface Resposta { status: number; local: string | null; tamanho: number; tipo: string; corpo: AsyncIterable<Uint8Array> & { destroy(): void } }

/** Um pedido GET sem seguir redirecionamento, com a resolução de nome conferida e tempo limite. */
function pedir(endereco: string, prazoMs: number, aceitar: string): Promise<Resposta> {
  return new Promise((ok, falha) => {
    const req = request(endereco, {
      method: "GET",
      lookup: lookupPublico,
      timeout: prazoMs,
      headers: { Accept: aceitar, "User-Agent": "Central-de-Manutencao/1.0 (foto sugerida)" },
    }, (res) => {
      ok({ status: res.statusCode ?? 0, local: res.headers.location ?? null, tamanho: Number(res.headers["content-length"] ?? 0),
        tipo: String(res.headers["content-type"] ?? ""), corpo: res });
    });
    req.on("timeout", () => req.destroy(new SugestaoErro("tempo esgotado")));
    req.on("error", (e) => falha(e instanceof SugestaoErro ? e : new SugestaoErro("sem resposta")));
    req.end();
  });
}

/**
 * Baixa um endereço conferido salto a salto (máx. 3 redirecionamentos, cada um checado; tempo limite no total; tamanho
 * máximo; tipo recusado antes de ler o corpo, se `tipoOk` disser não). Erros não dizem o endereço.
 */
export async function baixarConferido(urlInicial: string, opcoes: { limite: number; prazoMs: number; aceitar: string;
  tipoOk?: (tipo: string) => boolean }): Promise<{ bytes: Uint8Array; tipo: string }> {
  const prazo = Date.now() + opcoes.prazoMs;
  let atual = urlInicial;
  for (let salto = 0; ; salto++) {
    const endereco = await urlSugestaoPublica(atual);
    const restante = prazo - Date.now();
    if (restante <= 0) throw new SugestaoErro("tempo esgotado");
    const r = await pedir(endereco, restante, opcoes.aceitar);
    if ([301, 302, 303, 307, 308].includes(r.status)) {
      r.corpo.destroy();
      if (!r.local || salto >= MAX_REDIRECIONAMENTOS) throw new SugestaoErro("redirecionamentos demais");
      atual = new URL(r.local, endereco).href;
      continue;
    }
    if (r.status < 200 || r.status > 299) {
      r.corpo.destroy();
      throw new SugestaoErro(`resposta ${r.status}`);
    }
    if (opcoes.tipoOk && !opcoes.tipoOk(r.tipo)) {
      r.corpo.destroy();
      throw new SugestaoErro("tipo de conteúdo recusado");
    }
    if (r.tamanho > opcoes.limite) {
      r.corpo.destroy();
      throw new SugestaoErro("arquivo grande demais");
    }
    const corpo = r.corpo;
    const tempo = setTimeout(() => corpo.destroy(), Math.max(0, prazo - Date.now()));
    try {
      const bytes = await lerLimitado(corpo, opcoes.limite).catch((e) => { throw e instanceof SugestaoErro ? e : new SugestaoErro("leitura interrompida"); });
      return { bytes, tipo: r.tipo };
    } finally {
      clearTimeout(tempo);
      corpo.destroy();
    }
  }
}

/** Busca a imagem da sugestão no servidor (JPEG, PNG ou WebP pela assinatura dos bytes, até 6 MB, 8 s). */
export async function buscarImagemSugestao(urlInicial: string): Promise<{ bytes: Uint8Array; tipo: TipoImagem }> {
  const { bytes } = await baixarConferido(urlInicial, { limite: LIMITE_SUGESTAO, prazoMs: PRAZO_BUSCA_MS,
    aceitar: "image/jpeg,image/png,image/webp;q=0.9" });
  const tipo = tipoImagem(bytes);
  if (!tipo) throw new SugestaoErro("o arquivo não é JPEG, PNG ou WebP");
  return { bytes, tipo };
}

const LIMITE_PAGINA = 2 * 1024 * 1024;
const PRAZO_PAGINA_MS = 8_000;

/** Baixa a página de origem (HTML, até 2 MB, 8 s) com as mesmas regras de endereço. Recusa o que não é text/html. */
export async function baixarPagina(pagina: string): Promise<string> {
  const { bytes } = await baixarConferido(pagina, { limite: LIMITE_PAGINA, prazoMs: PRAZO_PAGINA_MS,
    aceitar: "text/html;q=0.9", tipoOk: (tipo) => /^\s*text\/html\b/i.test(tipo) });
  return new TextDecoder("utf-8").decode(bytes);
}

// ---------------------------------------------------------------------------- imagem da página

// atributos limitados a 4 mil caracteres: uma tag sem ">" não faz a busca crescer ao quadrado (HTML de terceiros)
const TAG = /<(meta|link|img)\b([^<>]{0,4000})>/gi;
/** Só o começo da página é analisado (o <head> e o início do corpo, onde ficam og:image e a foto principal). */
const LIMITE_ANALISE = 300_000;
const ATRIBUTO = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/g;
const IMAGEM_IGNORADA = /logo|sprite|icon|avatar|pixel|spacer|placeholder|blank/i;

const decodificar = (s: string) => s.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;|&#x27;/g, "'").trim();

interface TagHtml { nome: string; attrs: Record<string, string> }

function tagsDo(html: string): TagHtml[] {
  return [...html.slice(0, LIMITE_ANALISE).matchAll(TAG)].map((m) => {
    const attrs: Record<string, string> = {};
    for (const a of m[2].matchAll(ATRIBUTO)) attrs[a[1].toLowerCase()] = decodificar(a[2] ?? a[3] ?? a[4] ?? "");
    return { nome: m[1].toLowerCase(), attrs };
  });
}

/** Conteúdo de `<meta {campo}="{nome}" content="…">` (a primeira). */
function metaConteudo(tags: TagHtml[], campo: "property" | "name", nome: string): string | undefined {
  return tags.find((t) => t.nome === "meta" && (t.attrs[campo] ?? "").toLowerCase() === nome)?.attrs.content;
}

/** Endereço da imagem resolvido contra a página; só se passa na checagem (https, público). */
function resolverImagem(src: string | undefined, base: string): string | null {
  if (!src || /^data:/i.test(src)) return null;
  let href: string;
  try {
    href = new URL(src, base).href;
  } catch {
    return null;
  }
  return urlSugestaoErro(href) ? null : href;
}

/**
 * A imagem principal de uma página de produto, na ordem: og:image → twitter:image → link rel="image_src" → primeira
 * <img> com src de produto (sem logo, sprite, ícone, svg ou data:). Relativa resolvida contra a página. null se nada serve.
 */
export function imagemDaPagina(html: string, pagina: string): string | null {
  const tags = tagsDo(html);
  const imgProduto = tags.find((t) => t.nome === "img" && !!t.attrs.src && !/^data:/i.test(t.attrs.src)
    && !IMAGEM_IGNORADA.test(t.attrs.src) && !/\.svg(\?|#|$)/i.test(t.attrs.src))?.attrs.src;
  const candidatos = [
    metaConteudo(tags, "property", "og:image"),
    metaConteudo(tags, "name", "twitter:image") ?? metaConteudo(tags, "property", "twitter:image"),
    tags.find((t) => t.nome === "link" && /(^|\s)image_src(\s|$)/i.test(t.attrs.rel ?? ""))?.attrs.href,
    imgProduto,
  ];
  for (const c of candidatos) {
    const img = resolverImagem(c, pagina);
    if (img) return img;
  }
  return null;
}
