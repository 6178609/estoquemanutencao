import "server-only";

import { createHash, randomBytes } from "node:crypto";

import { AREAS, type Area } from "../suporte/guias";
import { type Alteracao, gravarCadastroLote, lerCadastro } from "./cadastros";
import { fonte, FonteErro } from "./fonte";
import { tipoImagem } from "./fotos";

/**
 * Bibliotecas de documentos. O arquivo vai para o repositório de dados (privado) e a lista fica num cadastro, separada
 * do cadastro principal (pôr um manual não "cadastra" nada no site). Também aceita só um link. Em demonstração, o
 * arquivo fica só na memória. Duas bibliotecas, mesmas regras:
 * - do ativo (equipamento): `documentos_equipamentos.json` ({ TAG: { documentos: [...] } }), arquivos em
 *   `app/documentos/equipamentos/<pasta da TAG>/<id>`;
 * - técnica (Suporte Técnico): `documentos_tecnicos.json` ({ area: { documentos: [...] } }), arquivos em
 *   `app/documentos/tecnicos/<área>/<id>`.
 */
export const ARQ_DOCUMENTOS = "documentos_equipamentos.json";
export const ARQ_DOCUMENTOS_TECNICOS = "documentos_tecnicos.json";
export const LIMITE_DOCUMENTO = 4_000_000; // a Vercel recebe até ~4,5 MB por pedido
const PASTA = "app/documentos/equipamentos";
const PASTA_TECNICOS = "app/documentos/tecnicos";
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
  /** referência: o arquivo está no documento da origem (mesmo manual em vários equipamentos; sem bytes próprios) */
  origem?: { tag: string; id: string };
}

interface Origem { tag: string; id: string }

/** Documento da biblioteca técnica, com a área a que pertence. */
export type DocumentoTecnico = Documento & { area: Area };

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
const pastaEquipamento = (tag: string) => `${PASTA}/${createHash("sha1").update(tag).digest("hex").slice(0, 16)}`;
const novoId = () => Date.now().toString(36) + randomBytes(4).toString("hex");
/** Título limpo: sem quebras de linha, até 120 caracteres. */
export const limparTitulo = (t: string) =>
  t.replace(/[\u0000-\u001f\u007f\u200b-\u200f\u202a-\u202e\u2066-\u2069]/g, " ").replace(/\s+/g, " ").trim().slice(0, 120);

/** Diferença entre as bibliotecas: cadastro, pasta, validação da chave e as mensagens (o texto de hoje não muda). */
interface Colecao {
  arquivo: string;
  pastaDe: (chave: string) => string;
  chaveValida: (chave: string) => boolean;
  /** "Este equipamento" / "Esta área": começo das mensagens de lotação */
  dono: string;
  /** "do equipamento" / "da área": meio das mensagens de arquivo */
  de: string;
  /** erro quando a chave (TAG ou área) não é válida */
  chaveInvalida: string;
  /** erro ao remover quando a chave ou o id não é válido */
  erroRemover: string;
}

const ATIVO: Colecao = {
  arquivo: ARQ_DOCUMENTOS,
  pastaDe: pastaEquipamento,
  chaveValida: tagValida,
  dono: "Este equipamento",
  de: "do equipamento",
  chaveInvalida: "Equipamento inválido.",
  erroRemover: "Documento inválido.",
};

const TECNICO: Colecao = {
  arquivo: ARQ_DOCUMENTOS_TECNICOS,
  pastaDe: (area) => `${PASTA_TECNICOS}/${area}`,
  chaveValida: (area) => AREAS.some((a) => a.id === area),
  dono: "Esta área",
  de: "da área",
  chaveInvalida: "Área inválida.",
  erroRemover: "Área ou documento inválido.",
};

const caminhoDe = (c: Colecao, chave: string, id: string) => `${c.pastaDe(chave)}/${id}`;

const origemValida = (o: unknown) => o === undefined || (!!o && typeof o === "object"
  && typeof (o as Origem).tag === "string" && tagValida((o as Origem).tag)
  && typeof (o as Origem).id === "string" && idValido((o as Origem).id));

function lista(item: unknown): Documento[] {
  const d = (item as { documentos?: unknown } | undefined)?.documentos;
  // só o que tem a forma certa (o link ainda é conferido de novo: ele vira href na tela)
  return Array.isArray(d) ? (d.filter((x) => {
    const y = x as Documento;
    return !!y && typeof y === "object" && typeof y.id === "string" && typeof y.titulo === "string" && typeof y.tipo === "string"
      && typeof y.em === "string" && (y.tipo !== "link" || linkValido(y.url)) && origemValida(y.origem);
  }) as Documento[]) : [];
}

const maisRecente = <T extends { em: string }>(a: T, b: T) => b.em.localeCompare(a.em);

async function documentosDeColecao(c: Colecao, chave: string): Promise<Documento[]> {
  if (!c.chaveValida(chave)) return [];
  return lista((await lerCadastro(c.arquivo))[chave]).sort(maisRecente);
}

async function registrar(c: Colecao, chave: string, doc: Documento, por: string) {
  await gravarCadastroLote(c.arquivo, { [chave]: (atual) => {
    if (lista(atual).length >= MAX_POR_EQUIPAMENTO) throw new FonteErro(`${c.dono} já tem ${MAX_POR_EQUIPAMENTO} documentos; remova algum antes.`);
    return { ...(atual ?? {}), documentos: [...lista(atual), doc] };
  } }, por);
}

/** Guarda o arquivo (PDF ou imagem) na pasta da chave, sem pôr na lista (quem chama põe). */
async function gravarArquivoNaColecao(c: Colecao, chave: string, d: { titulo: string; nome: string; bytes: Uint8Array }, por: string): Promise<Documento> {
  if (!c.chaveValida(chave)) throw new FonteErro(c.chaveInvalida);
  if ((await documentosDeColecao(c, chave)).length >= MAX_POR_EQUIPAMENTO) throw new FonteErro(`${c.dono} já tem ${MAX_POR_EQUIPAMENTO} documentos; remova algum antes.`);
  const tipo = tipoDocumento(d.bytes);
  if (!tipo) throw new FonteErro("Envie um PDF ou uma imagem (JPEG, PNG ou WebP).");
  if (d.bytes.length > LIMITE_DOCUMENTO) throw new FonteErro("O arquivo passou de 4 MB. Para manuais maiores, use “Adicionar link”.");
  const titulo = limparTitulo(d.titulo) || limparTitulo(d.nome.replace(/\.[a-z0-9]+$/i, "")) || "Documento";
  const id = novoId();
  const f = fonte();
  const caminho = caminhoDe(c, chave, id);
  if (!f) guardarDemo(caminho, d.bytes);
  else if (!(await f.gravarCondicional(caminho, d.bytes, null, `Documento ${c.de} ${chave}`)))
    throw new FonteErro("Não consegui gravar o arquivo agora; tente de novo.");
  return { id, titulo, tipo, tamanho: d.bytes.length, em: new Date().toISOString(), por,
    nome: limparTitulo(d.nome).replace(/[^\w.\- ]/g, "_") || "documento" };
}

/** Apaga o arquivo guardado (se ainda existir). */
async function apagarArquivo(c: Colecao, chave: string, id: string, por: string): Promise<void> {
  const f = fonte();
  const caminho = caminhoDe(c, chave, id);
  if (!f) { demo.delete(caminho); return; }
  const v = (await f.versoes(true).catch(() => null))?.get(caminho);
  if (v) await f.apagar(caminho, v, `Remove documento ${c.de} ${chave} (${por})`).catch(() => false);
}

/** Guarda o arquivo (PDF ou imagem) e põe na lista da chave. */
async function gravarNaColecao(c: Colecao, chave: string, d: { titulo: string; nome: string; bytes: Uint8Array }, por: string): Promise<Documento> {
  const doc = await gravarArquivoNaColecao(c, chave, d, por);
  try {
    await registrar(c, chave, doc, por);
  } catch (e) {
    // a lista não aceitou: desfaz o arquivo (não fica arquivo sem dono no repositório)
    await apagarArquivo(c, chave, doc.id, por);
    throw e;
  }
  return doc;
}

async function gravarLinkNa(c: Colecao, chave: string, d: { titulo: string; url: string }, por: string): Promise<Documento> {
  if (!c.chaveValida(chave)) throw new FonteErro(c.chaveInvalida);
  if (!linkValido(d.url)) throw new FonteErro("Link inválido: use um endereço começando com https:// (ou http://).");
  const doc: Documento = { id: novoId(), titulo: limparTitulo(d.titulo) || new URL(d.url).hostname, tipo: "link", tamanho: 0,
    em: new Date().toISOString(), por, url: d.url.trim() };
  await registrar(c, chave, doc, por);
  return doc;
}

/** Documentos que apontam para o arquivo `chave/id` (referências de outros equipamentos). */
async function referenciasA(c: Colecao, chave: string, id: string, fresco = false): Promise<Documento[]> {
  const cadastro = await lerCadastro(c.arquivo, { fresco });
  return Object.keys(cadastro).flatMap((k) => lista(cadastro[k]).filter((d) => d.origem?.tag === chave && d.origem.id === id));
}

const msgComReferencias = (n: number) => `Este manual está vinculado a ${n} ${n === 1 ? "outro equipamento" : "outros equipamentos"}. `
  + "Tire o vínculo deles antes de remover.";

/** Tira da lista (e apaga o arquivo, se der). Um arquivo com referências em outros equipamentos não sai antes delas. */
async function removerDaColecao(c: Colecao, chave: string, id: string, por: string): Promise<void> {
  if (!c.chaveValida(chave) || !idValido(id)) throw new FonteErro(c.erroRemover);
  const doc = (await documentosDeColecao(c, chave)).find((x) => x.id === id);
  if (!doc) return;
  const refs = await referenciasA(c, chave, id);
  if (refs.length) throw new FonteErro(msgComReferencias(refs.length));
  await gravarCadastroLote(c.arquivo, { [chave]: (atual) => {
    const resto = lista(atual).filter((x) => x.id !== id);
    return resto.length ? { ...(atual ?? {}), documentos: resto } : null;
  } }, por);
  // link e referência não têm arquivo próprio
  if (doc.tipo === "link" || doc.origem) return;
  // conferência de novo, logo antes de apagar o arquivo: uma referência gravada nesse meio tempo impede a remoção
  const agora = await referenciasA(c, chave, id, true);
  if (agora.length) {
    await registrar(c, chave, doc, por).catch(() => undefined);
    throw new FonteErro(msgComReferencias(agora.length));
  }
  await apagarArquivo(c, chave, id, por);
}

/** Quando a lista de arquivos de cada biblioteca foi relida (no máximo a cada 15 s). */
const releuEm = new Map<string, number>();

/** Os bytes de um arquivo guardado (undefined se não existe). */
async function bytesDe(c: Colecao, chave: string, id: string): Promise<Uint8Array | undefined> {
  const f = fonte();
  const caminho = caminhoDe(c, chave, id);
  if (!f) return demo.get(caminho);
  let bytes = (await f.ler(caminho))?.bytes;
  // outra instância pode ter gravado agora: relê a lista de arquivos, no máximo a cada 15 s (poupa a cota da API)
  const ultima = releuEm.get(c.arquivo) ?? 0;
  if (!bytes && Date.now() - ultima > 15_000) {
    releuEm.set(c.arquivo, Date.now());
    await f.versoes(true);
    bytes = (await f.ler(caminho))?.bytes;
  }
  return bytes;
}

/** O arquivo de um documento da lista (null se não existe ou é link). A referência lê o arquivo da origem; se a origem
 *  sumiu da lista, a referência ficou solta e a leitura diz isso (em vez de ler um arquivo órfão). */
async function lerDaColecao(c: Colecao, chave: string, id: string): Promise<{ doc: Documento; bytes: Uint8Array; tipo: TipoDocumento } | null> {
  if (!c.chaveValida(chave) || !idValido(id)) return null;
  const doc = (await documentosDeColecao(c, chave)).find((x) => x.id === id);
  if (!doc || doc.tipo === "link") return null;
  const origem: Origem = doc.origem ?? { tag: chave, id };
  if (doc.origem) {
    const existe = c.chaveValida(origem.tag) && (await documentosDeColecao(c, origem.tag)).some((x) => x.id === origem.id);
    if (!existe) throw new FonteErro("Arquivo de origem não encontrado. Refaça o vínculo deste manual.");
  }
  const bytes = await bytesDe(c, origem.tag, origem.id);
  const tipo = bytes && tipoDocumento(bytes);
  return bytes && tipo ? { doc, bytes, tipo } : null;
}

// ---------------------------------------------------------------------------- biblioteca do ativo

export async function documentosDe(tag: string): Promise<Documento[]> {
  return documentosDeColecao(ATIVO, tag);
}

/** Guarda o arquivo (PDF ou imagem) e põe na lista do equipamento. */
export async function gravarDocumento(tag: string, d: { titulo: string; nome: string; bytes: Uint8Array }, por: string): Promise<Documento> {
  return gravarNaColecao(ATIVO, tag, d, por);
}

export async function gravarLink(tag: string, d: { titulo: string; url: string }, por: string): Promise<Documento> {
  return gravarLinkNa(ATIVO, tag, d, por);
}

/** Tira da lista (e apaga o arquivo, se der). */
export async function removerDocumento(tag: string, id: string, por: string): Promise<void> {
  return removerDaColecao(ATIVO, tag, id, por);
}

/** O arquivo de um documento da lista (null se não existe ou é link). */
export async function lerDocumento(tag: string, id: string): Promise<{ doc: Documento; bytes: Uint8Array; tipo: TipoDocumento } | null> {
  return lerDaColecao(ATIVO, tag, id);
}

/** Até quantos equipamentos de uma vez (um manual vinculado a vários). */
export const MAX_LOTE = 50;

/** Lista de equipamentos sem repetição; recusa lista vazia, grande demais ou com TAG inválida (antes de gravar). */
function tagsDoLote(tags: string[]): string[] {
  const unicas = [...new Set(tags)];
  if (!unicas.length) throw new FonteErro("Escolha pelo menos um equipamento.");
  if (unicas.length > MAX_LOTE) throw new FonteErro(`Escolha no máximo ${MAX_LOTE} equipamentos de cada vez.`);
  if (!unicas.every(tagValida)) throw new FonteErro("Equipamento inválido.");
  return unicas;
}

/** No lote, o título é obrigatório (sem ele, o nome do arquivo não entra no lugar). */
function tituloDoLote(t: string): string {
  const x = limparTitulo(t);
  if (!x) throw new FonteErro("Informe o título do manual.");
  return x;
}

/**
 * Põe as entradas dos equipamentos numa ÚNICA alteração do cadastro: ou entram todas, ou nenhuma (uma falha no teto
 * de algum equipamento não deixa nada pela metade).
 */
async function registrarVarios(entradas: { tag: string; doc: Documento }[], por: string): Promise<void> {
  const itens: Record<string, Alteracao> = {};
  for (const { tag, doc } of entradas) {
    itens[tag] = (atual) => {
      if (lista(atual).length >= MAX_POR_EQUIPAMENTO) {
        throw new FonteErro(`O equipamento ${tag} já tem ${MAX_POR_EQUIPAMENTO} documentos; remova algum antes.`);
      }
      return { ...(atual ?? {}), documentos: [...lista(atual), doc] };
    };
  }
  await gravarCadastroLote(ARQ_DOCUMENTOS, itens, por);
}

/**
 * Um arquivo (PDF ou imagem) em vários equipamentos: os bytes são gravados UMA vez, no 1º equipamento da lista; nos
 * outros entra uma referência (`origem`) para ele. Tudo numa só alteração do cadastro.
 */
export async function gravarDocumentoEmVarios(tags: string[], d: { titulo: string; nome: string; bytes: Uint8Array }, por: string):
  Promise<{ tag: string; doc: Documento }[]> {
  const lote = tagsDoLote(tags);
  const titulo = tituloDoLote(d.titulo);
  const [origem, ...demais] = lote;
  const arquivo = await gravarArquivoNaColecao(ATIVO, origem, { titulo, nome: d.nome, bytes: d.bytes }, por);
  const entradas = [{ tag: origem, doc: arquivo }, ...demais.map((tag) => ({ tag, doc: {
    id: novoId(), titulo: arquivo.titulo, tipo: arquivo.tipo, tamanho: arquivo.tamanho, em: new Date().toISOString(), por,
    nome: arquivo.nome, origem: { tag: origem, id: arquivo.id } } as Documento }))];
  try {
    await registrarVarios(entradas, por);
  } catch (e) {
    await apagarArquivo(ATIVO, origem, arquivo.id, por);
    throw e;
  }
  return entradas;
}

/** Um link em vários equipamentos: uma entrada de link por equipamento, numa só alteração. */
export async function gravarLinkEmVarios(tags: string[], d: { titulo: string; url: string }, por: string): Promise<{ tag: string; doc: Documento }[]> {
  const lote = tagsDoLote(tags);
  const titulo = tituloDoLote(d.titulo);
  if (!linkValido(d.url)) throw new FonteErro("Link inválido: use um endereço começando com https:// (ou http://).");
  const em = new Date().toISOString();
  const entradas = lote.map((tag) => ({ tag, doc: { id: novoId(), titulo, tipo: "link" as const, tamanho: 0, em, por, url: d.url.trim() } }));
  await registrarVarios(entradas, por);
  return entradas;
}

/** Todos os documentos de todos os equipamentos, do mais recente (só leitura, para a listagem). */
export async function todosDocumentosEquipamentos(): Promise<{ tag: string; doc: Documento }[]> {
  const cadastro = await lerCadastro(ARQ_DOCUMENTOS);
  return Object.keys(cadastro)
    .filter(tagValida)
    .flatMap((tag) => lista(cadastro[tag]).map((doc) => ({ tag, doc })))
    .sort((a, b) => maisRecente(a.doc, b.doc));
}

// ---------------------------------------------------------------------------- biblioteca técnica

/** Documentos de uma área (ou de todas, sem área), do mais recente. Área inválida: lista vazia. */
export async function documentosTecnicos(area?: Area): Promise<DocumentoTecnico[]> {
  const cadastro = await lerCadastro(TECNICO.arquivo);
  const areas: string[] = area === undefined ? AREAS.map((a) => a.id) : [area];
  return areas
    .filter(TECNICO.chaveValida)
    .flatMap((a) => lista(cadastro[a]).map((doc) => ({ ...doc, area: a as Area })))
    .sort(maisRecente);
}

export async function gravarDocumentoTecnico(area: Area, d: { titulo: string; nome: string; bytes: Uint8Array }, por: string): Promise<DocumentoTecnico> {
  return { ...(await gravarNaColecao(TECNICO, area, d, por)), area };
}

export async function gravarLinkTecnico(area: Area, d: { titulo: string; url: string }, por: string): Promise<DocumentoTecnico> {
  return { ...(await gravarLinkNa(TECNICO, area, d, por)), area };
}

export async function removerDocumentoTecnico(area: Area, id: string, por: string): Promise<void> {
  return removerDaColecao(TECNICO, area, id, por);
}

export async function lerDocumentoTecnico(area: Area, id: string): Promise<{ doc: Documento; bytes: Uint8Array; tipo: TipoDocumento } | null> {
  return lerDaColecao(TECNICO, area, id);
}
