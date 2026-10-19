import "server-only";

import { createHash, randomBytes } from "node:crypto";

import { gravarCadastroLote, lerCadastro } from "./cadastros";
import { fonte, FonteErro } from "./fonte";
import { tipoImagem } from "./fotos";

/**
 * Biblioteca do ativo: manuais e documentos de cada equipamento. O arquivo vai para o repositório de dados (privado),
 * em `app/documentos/equipamentos/<pasta do equipamento>/<id>`; a lista fica no cadastro `documentos_equipamentos.json`
 * ({ TAG: { documentos: [...] } }), separada do cadastro de equipamentos (pôr um manual não "cadastra" o ativo no site).
 * Também aceita só um link (manual no site do fabricante, pasta da rede…). Em demonstração, fica só na memória.
 */
export const ARQ_DOCUMENTOS = "documentos_equipamentos.json";
export const LIMITE_DOCUMENTO = 4_000_000; // a Vercel recebe até ~4,5 MB por pedido
const PASTA = "app/documentos/equipamentos";
const MAX_POR_EQUIPAMENTO = 50;
const demo = new Map<string, Uint8Array>();
function guardarDemo(k: string, b: Uint8Array) {
  demo.set(k, b);
  while (demo.size > 50) demo.delete(demo.keys().next().value!);
}

export type TipoDocumento = "application/pdf" | "image/jpeg" | "image/png" | "image/webp";

export interface Documento {
  id: string; titulo: string; tipo: TipoDocumento | "link"; tamanho: number; em: string; por: string;
  /** só nos links */
  url?: string;
  /** nome do arquivo enviado (para o download) */
  nome?: string;
}

/** PDF ou imagem, pela assinatura dos bytes. */
export function tipoDocumento(b: Uint8Array): TipoDocumento | null {
  if (b.length > 5 && String.fromCharCode(...b.slice(0, 5)) === "%PDF-") return "application/pdf";
  return tipoImagem(b);
}

/** Link aceito: http(s) com endereço, sem espaços (javascript:, data: e afins não entram). */
export function linkValido(url: unknown): boolean {
  if (typeof url !== "string") return false;
  try {
    const u = new URL(url.trim());
    return (u.protocol === "https:" || u.protocol === "http:") && !!u.hostname && !/\s/.test(url.trim()) && url.length <= 500;
  } catch {
    return false;
  }
}

const RESERVADAS = new Set(["__proto__", "constructor", "prototype"]);
export const tagValida = (tag: string) => !!tag && tag.length <= 60 && !/[\u0000-\u001f]/.test(tag) && !RESERVADAS.has(tag);
const idValido = (id: string) => /^[a-z0-9]{6,32}$/.test(id);
/** Pasta do equipamento no repositório: pelo hash da TAG (a TAG pode ter barra, espaço, acento…). */
const pastaDe = (tag: string) => `${PASTA}/${createHash("sha1").update(tag).digest("hex").slice(0, 16)}`;
const caminhoDe = (tag: string, id: string) => `${pastaDe(tag)}/${id}`;
const novoId = () => Date.now().toString(36) + randomBytes(4).toString("hex");
/** Título limpo: sem quebras de linha, até 120 caracteres. */
export const limparTitulo = (t: string) =>
  t.replace(/[\u0000-\u001f\u007f\u200b-\u200f\u202a-\u202e\u2066-\u2069]/g, " ").replace(/\s+/g, " ").trim().slice(0, 120);

function lista(item: unknown): Documento[] {
  const d = (item as { documentos?: unknown } | undefined)?.documentos;
  // só o que tem a forma certa (o link ainda é conferido de novo: ele vira href na tela)
  return Array.isArray(d) ? (d.filter((x) => {
    const y = x as Documento;
    return !!y && typeof y === "object" && typeof y.id === "string" && typeof y.titulo === "string" && typeof y.tipo === "string"
      && typeof y.em === "string" && (y.tipo !== "link" || linkValido(y.url));
  }) as Documento[]) : [];
}

export async function documentosDe(tag: string): Promise<Documento[]> {
  if (!tagValida(tag)) return [];
  return lista((await lerCadastro(ARQ_DOCUMENTOS))[tag]).sort((a, b) => b.em.localeCompare(a.em));
}

async function registrar(tag: string, doc: Documento, por: string) {
  await gravarCadastroLote(ARQ_DOCUMENTOS, { [tag]: (atual) => {
    if (lista(atual).length >= MAX_POR_EQUIPAMENTO) throw new FonteErro(`Este equipamento já tem ${MAX_POR_EQUIPAMENTO} documentos; remova algum antes.`);
    return { ...(atual ?? {}), documentos: [...lista(atual), doc] };
  } }, por);
}

/** Guarda o arquivo (PDF ou imagem) e põe na lista do equipamento. */
export async function gravarDocumento(tag: string, d: { titulo: string; nome: string; bytes: Uint8Array }, por: string): Promise<Documento> {
  if (!tagValida(tag)) throw new FonteErro("Equipamento inválido.");
  if ((await documentosDe(tag)).length >= MAX_POR_EQUIPAMENTO) throw new FonteErro(`Este equipamento já tem ${MAX_POR_EQUIPAMENTO} documentos; remova algum antes.`);
  const tipo = tipoDocumento(d.bytes);
  if (!tipo) throw new FonteErro("Envie um PDF ou uma imagem (JPEG, PNG ou WebP).");
  if (d.bytes.length > LIMITE_DOCUMENTO) throw new FonteErro("O arquivo passou de 4 MB. Para manuais maiores, use “Adicionar link”.");
  const titulo = limparTitulo(d.titulo) || limparTitulo(d.nome.replace(/\.[a-z0-9]+$/i, "")) || "Documento";
  const id = novoId();
  const f = fonte();
  const caminho = caminhoDe(tag, id);
  if (!f) guardarDemo(caminho, d.bytes);
  else if (!(await f.gravarCondicional(caminho, d.bytes, null, `Documento do equipamento ${tag}`)))
    throw new FonteErro("Não consegui gravar o arquivo agora; tente de novo.");
  const doc: Documento = { id, titulo, tipo, tamanho: d.bytes.length, em: new Date().toISOString(), por,
    nome: limparTitulo(d.nome).replace(/[^\w.\- ]/g, "_") || "documento" };
  try {
    await registrar(tag, doc, por);
  } catch (e) {
    // a lista não aceitou: desfaz o arquivo (não fica arquivo sem dono no repositório)
    if (!f) demo.delete(caminho);
    else {
      const v = (await f.versoes(true).catch(() => null))?.get(caminho);
      if (v) await f.apagar(caminho, v, `Desfaz envio do equipamento ${tag}`).catch(() => false);
    }
    throw e;
  }
  return doc;
}

export async function gravarLink(tag: string, d: { titulo: string; url: string }, por: string): Promise<Documento> {
  if (!tagValida(tag)) throw new FonteErro("Equipamento inválido.");
  if (!linkValido(d.url)) throw new FonteErro("Link inválido: use um endereço começando com https:// (ou http://).");
  const doc: Documento = { id: novoId(), titulo: limparTitulo(d.titulo) || new URL(d.url).hostname, tipo: "link", tamanho: 0,
    em: new Date().toISOString(), por, url: d.url.trim() };
  await registrar(tag, doc, por);
  return doc;
}

/** Tira da lista (e apaga o arquivo, se der). */
export async function removerDocumento(tag: string, id: string, por: string): Promise<void> {
  if (!tagValida(tag) || !idValido(id)) throw new FonteErro("Documento inválido.");
  const doc = (await documentosDe(tag)).find((x) => x.id === id);
  if (!doc) return;
  await gravarCadastroLote(ARQ_DOCUMENTOS, { [tag]: (atual) => {
    const resto = lista(atual).filter((x) => x.id !== id);
    return resto.length ? { ...(atual ?? {}), documentos: resto } : null;
  } }, por);
  if (doc.tipo === "link") return;
  const f = fonte();
  if (!f) demo.delete(caminhoDe(tag, id));
  else {
    const versao = (await f.versoes(true)).get(caminhoDe(tag, id));
    if (versao) await f.apagar(caminhoDe(tag, id), versao, `Remove documento do equipamento ${tag}`).catch(() => false);
  }
}

let releuEm = 0;

/** O arquivo de um documento da lista (null se não existe ou é link). */
export async function lerDocumento(tag: string, id: string): Promise<{ doc: Documento; bytes: Uint8Array; tipo: TipoDocumento } | null> {
  if (!tagValida(tag) || !idValido(id)) return null;
  const doc = (await documentosDe(tag)).find((x) => x.id === id);
  if (!doc || doc.tipo === "link") return null;
  const f = fonte();
  let bytes: Uint8Array | undefined;
  if (!f) bytes = demo.get(caminhoDe(tag, id));
  else {
    bytes = (await f.ler(caminhoDe(tag, id)))?.bytes;
    // outra instância pode ter gravado agora: relê a lista de arquivos, no máximo a cada 15 s (poupa a cota da API)
    if (!bytes && Date.now() - releuEm > 15_000) {
      releuEm = Date.now();
      await f.versoes(true);
      bytes = (await f.ler(caminhoDe(tag, id)))?.bytes;
    }
  }
  const tipo = bytes && tipoDocumento(bytes);
  return bytes && tipo ? { doc, bytes, tipo } : null;
}
