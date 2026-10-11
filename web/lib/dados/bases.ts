import "server-only";

import { lerCadastro } from "./cadastros";
import { dadosDemo } from "./demo";
import { fonte } from "./fonte";
import { lerParquet } from "./parquet";
import {
  montarAlmox, prepararCatalogo, prepararMb52, usoDosMateriais, type ItemAlmox, type ItemCatalogo, type ItemEstoque,
} from "./materiais";

/** As bases que o sincronizador (e o envio pela tela do site atual) gravam no repositório de dados. */
export const ARQUIVOS = {
  mb52: "bases/MB52.parquet",
  catalogo: "bases/CATALOGO_MATERIAIS.parquet",
} as const;
const MANIFESTO = "bases/manifesto.json";

export interface Base<T> {
  dados: T | null;
  atualizado: string | null; // data do export original (manifesto)
  origem: string;
  erro?: string;
}

const g = globalThis as unknown as { __cmBases?: Map<string, { versao: string; valor: unknown }> };
const cache = (g.__cmBases ??= new Map()); // uma cópia por processo (páginas e rotas de API)

async function manifesto(): Promise<Record<string, { modificado?: string; origem?: string }>> {
  const f = fonte();
  if (!f) return {};
  const versao = (await f.versoes()).get(MANIFESTO);
  if (!versao) return {};
  const c = cache.get(MANIFESTO);
  if (c?.versao === versao) return c.valor as Record<string, { modificado?: string; origem?: string }>;
  const lido = await f.ler(MANIFESTO);
  const valor = lido ? JSON.parse(new TextDecoder().decode(lido.bytes)) : {};
  cache.set(MANIFESTO, { versao, valor });
  return valor;
}

async function lerBase<T>(caminho: string, preparar: (linhas: Record<string, unknown>[]) => T): Promise<Base<T>> {
  const f = fonte()!;
  const [versoes, man] = await Promise.all([f.versoes(), manifesto()]);
  const versao = versoes.get(caminho);
  const info = man[caminho] || {};
  const meta = { atualizado: info.modificado || null, origem: info.origem || caminho };
  if (!versao) return { dados: null, ...meta };
  const c = cache.get(caminho);
  if (c?.versao === versao) return { dados: c.valor as T, ...meta };
  try {
    const lido = await f.ler(caminho);
    if (!lido) return { dados: null, ...meta };
    const valor = preparar(await lerParquet(lido.bytes));
    cache.set(caminho, { versao, valor });
    return { dados: valor, ...meta };
  } catch (e) {
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
