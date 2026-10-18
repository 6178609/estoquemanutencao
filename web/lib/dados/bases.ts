import "server-only";

import { lerCadastro } from "./cadastros";
import { dadosDemo } from "./demo";
import { fonte } from "./fonte";
import { lerParquet } from "./parquet";
import {
  montarAlmox, prepararCatalogo, prepararMb52, usoDosMateriais, type ItemAlmox, type ItemCatalogo, type ItemEstoque,
} from "./materiais";

/** As bases gravadas no repositório de dados pelo sincronizador do PC e pelo envio no site. */
export const ARQUIVOS = {
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
  pc?: string;
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
  // base enviada em partes pelo site (o manifesto diz quais) ou o arquivo único do sincronizador
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
    const lidos = await Promise.all(arquivos.map((a) => f.ler(a)));
    if (lidos.some((l) => !l)) return { dados: null, ...meta };
    const linhas = (await Promise.all(lidos.map((l) => lerParquet(l!.bytes)))).flat();
    const valor = preparar(linhas);
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

export interface Almoxarifado {
  itens: ItemAlmox[];
  estoque: Base<ItemEstoque[]>;
  catalogo: Base<ItemCatalogo[]>;
}

export async function almoxarifado(): Promise<Almoxarifado> {
  const [est, cat, cadMat, cadEq] = await Promise.all([
    estoque(), catalogo(), lerCadastro("cadastro_materiais.json"), lerCadastro("cadastro_equipamentos.json"),
  ]);
  const itens = est.dados ? montarAlmox(est.dados, cat.dados, cadMat, usoDosMateriais(cadEq)) : [];
  return { itens, estoque: est, catalogo: cat };
}
