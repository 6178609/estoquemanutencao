import "server-only";

import { lerCadastro } from "./cadastros";
import { fotosExternasDoItem } from "./fotosExternas";
import { ARQUIVO_REFERENCIA } from "./fotosReferencia";
import { ARQUIVO_TIPOS } from "./fotosTipo";
import { sugestoesDosMateriais } from "./fotosSugestao";
import type { SugestaoPublica } from "../fotoMaterial";
import { dadosDemo } from "./demo";
import { fonte } from "./fonte";
import { lerParquet } from "./parquet";
import {
  montarAlmox, prepararCatalogo, prepararMb52, usoDosMateriais, type ItemAlmox, type ItemCatalogo, type ItemEstoque,
} from "./materiais";

/** As bases gravadas no repositório de dados pelo envio em Fontes de dados. */
const ARQUIVOS = {
  mb52: "bases/MB52.parquet",
  catalogo: "bases/CATALOGO_MATERIAIS.parquet",
} as const;
export const MANIFESTO = "bases/manifesto.json";

/** Entrada do manifesto: data do export original, de onde veio e, numa base grande enviada pelo site, as partes. */
export interface InfoBase {
  modificado?: string;
  origem?: string;
  linhas?: number;
  enviado_em?: string;
  enviado_por?: string;
  partes?: string[];
}

export interface Base<T> {
  dados: T | null;
  atualizado: string | null; // data do export original (manifesto)
  origem: string;
  erro?: string;
}

const g = globalThis as unknown as { __cmBases?: Map<string, { versao: string; valor: unknown; atualizado?: string | null }> };
const cache = (g.__cmBases ??= new Map()); // uma cópia por processo (páginas e rotas de API)
const gl = globalThis as unknown as { __cmLendo?: Map<string, Promise<unknown>> };
const lendo = (gl.__cmLendo ??= new Map());

/** Quanto custou a última leitura de cada base neste servidor (para achar onde está a lentidão): tamanho e milissegundos. */
interface TempoBase { kb: number; linhas: number; baixar_ms: number; ler_ms: number; preparar_ms: number; em: string }
const gt = globalThis as unknown as { __cmTemposBases?: Map<string, TempoBase> };
const tempos = (gt.__cmTemposBases ??= new Map());
export function anotarTempo(nome: string, t: TempoBase) {
  tempos.set(nome, t);
}
export function temposBases(): Record<string, TempoBase> {
  return Object.fromEntries([...tempos].sort(([a], [b]) => a.localeCompare(b)));
}

export async function manifesto(): Promise<Record<string, InfoBase>> {
  const f = fonte();
  if (!f) return {};
  const versao = (await f.versoes()).get(MANIFESTO);
  if (!versao) return {};
  const c = cache.get(MANIFESTO);
  if (c?.versao === versao) return c.valor as Record<string, InfoBase>;
  const lido = await f.ler(MANIFESTO);
  const valor = lido ? JSON.parse(new TextDecoder().decode(lido.bytes)) : {};
  cache.set(MANIFESTO, { versao, valor });
  return valor;
}

/**
 * Lê uma base do repositório e prepara (com cache pela versão do arquivo; `sufixo` entra na chave do cache —
 * ex.: o dia, para bases cujo preparo depende de hoje).
 */
export async function lerBase<T>(caminho: string, preparar: (linhas: Record<string, unknown>[]) => T, sufixo = ""): Promise<Base<T>> {
  const f = fonte()!;
  const [versoes, man] = await Promise.all([f.versoes(), manifesto()]);
  const info = man[caminho] || {};
  const meta = { atualizado: info.modificado || null, origem: info.origem || caminho };
  // base enviada em partes (o manifesto diz quais) ou em arquivo único
  const arquivos = info.partes?.length ? info.partes : [caminho];
  if (arquivos.some((a) => !versoes.has(a))) return { dados: null, ...meta };
  const versao = arquivos.map((a) => versoes.get(a)).join("+") + (sufixo ? `@${sufixo}` : "");
  const c = cache.get(caminho);
  if (c?.versao === versao) return { dados: c.valor as T, ...meta };
  // a mesma base pedida por duas requisições ao mesmo tempo: baixa e prepara uma vez só
  const chaveEm = `${caminho}|${versao}`;
  const emAndamento = lendo.get(chaveEm) as Promise<Base<T>> | undefined;
  if (emAndamento) return emAndamento;
  const p = lerEPreparar(f, caminho, arquivos, versao, preparar, meta);
  lendo.set(chaveEm, p);
  try {
    return await p;
  } finally {
    lendo.delete(chaveEm);
  }
}

async function lerEPreparar<T>(f: NonNullable<ReturnType<typeof fonte>>, caminho: string, arquivos: string[], versao: string,
  preparar: (linhas: Record<string, unknown>[]) => T, meta: { atualizado: string | null; origem: string }): Promise<Base<T>> {
  try {
    const t0 = Date.now();
    const lidos = await Promise.all(arquivos.map((a) => f.ler(a)));
    if (lidos.some((l) => !l)) return { dados: null, ...meta };
    const t1 = Date.now();
    const linhas = (await Promise.all(lidos.map((l) => lerParquet(l!.bytes)))).flat();
    const t2 = Date.now();
    const valor = preparar(linhas);
    const t = { kb: Math.round(lidos.reduce((s, l) => s + l!.bytes.byteLength, 0) / 1024), linhas: linhas.length,
      baixar_ms: t1 - t0, ler_ms: t2 - t1, preparar_ms: Date.now() - t2, em: new Date().toISOString() };
    anotarTempo(caminho.replace(/^bases\//, "").replace(/\.parquet$/, ""), t);
    console.info(`[dados] ${caminho}: ${t.kb} KB, ${t.linhas} linhas — baixar ${t.baixar_ms} ms, ler ${t.ler_ms} ms, preparar ${t.preparar_ms} ms`);
    cache.set(caminho, { versao, valor, atualizado: meta.atualizado });
    return { dados: valor, ...meta };
  } catch (e) {
    // falhou o download (GitHub fora, demorou…): segue com a versão anterior, se houver, em vez de esvaziar a tela;
    // a próxima requisição tenta de novo
    const antiga = cache.get(caminho);
    console.warn(`[dados] ${caminho}: ${(e as Error).message}${antiga ? " (usando a versão anterior)" : ""}`);
    // (o erro vai junto: quem guarda o resultado sabe que precisa tentar de novo)
    if (antiga) return { dados: antiga.valor as T, ...meta, atualizado: antiga.atualizado ?? meta.atualizado, erro: (e as Error).message };
    return { dados: null, ...meta, erro: (e as Error).message };
  }
}

export async function estoque(): Promise<Base<ItemEstoque[]>> {
  if (!fonte()) return { dados: dadosDemo().estoque, atualizado: new Date().toISOString(), origem: "demonstração" };
  return lerBase(ARQUIVOS.mb52, (l) => prepararMb52(l).resumo);
}

export async function catalogo(): Promise<Base<ItemCatalogo[]>> {
  if (!fonte()) return { dados: dadosDemo().catalogo, atualizado: new Date().toISOString(), origem: "demonstração" };
  return lerBase(ARQUIVOS.catalogo, prepararCatalogo);
}

interface Almoxarifado {
  itens: ItemAlmox[];
  estoque: Base<ItemEstoque[]>;
  catalogo: Base<ItemCatalogo[]>;
  /** Fotos sugeridas por material (só os do MB52), sem o endereço da imagem. */
  sugestoes: Record<string, SugestaoPublica[]>;
  /** Há fotos ilustrativas por tipo no cadastro (a tela mostra o filtro só então). */
  temTipos: boolean;
}

export async function almoxarifado(): Promise<Almoxarifado> {
  const [est, cat, cadMat, cadEq, cadRef, cadTipo] = await Promise.all([
    estoque(), catalogo(), lerCadastro("cadastro_materiais.json"), lerCadastro("cadastro_equipamentos.json"),
    lerCadastro(ARQUIVO_REFERENCIA), lerCadastro(ARQUIVO_TIPOS),
  ]);
  const itens = est.dados ? montarAlmox(est.dados, cat.dados, cadMat, usoDosMateriais(cadEq)).map((i) => ({
    ...i, ...fotosExternasDoItem(i.material, i.pdm, cadRef, cadTipo),
  })) : [];
  const sugestoes = await sugestoesDosMateriais(new Set(itens.map((i) => i.material)));
  return { itens, estoque: est, catalogo: cat, sugestoes, temTipos: Object.keys(cadTipo).length > 0 };
}
