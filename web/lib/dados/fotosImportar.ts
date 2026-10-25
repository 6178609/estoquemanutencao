import "server-only";

import { gravarCadastroLote } from "./cadastros";
import { materialValido } from "./fotos";
import { fotoDoCadastro, type FotoCadastro } from "./fotosExternas";
import { ARQUIVO_REFERENCIA } from "./fotosReferencia";
import { SugestaoErro } from "./fotosSugestao";

/**
 * Importação das fotos do fabricante (um arquivo JSON): raiz `{ "materiais": { "<código>": {...} } }` vai para
 * `fotos_referencia.json`. Só substitui os itens do arquivo; os outros ficam.
 */
const MAX_ITENS = 5_000;

export interface FotosImportadas { materiais: Record<string, FotoCadastro> }

/** Confere o formato e devolve só o que é aproveitável. Lança SugestaoErro se não há "materiais". */
export function normalizarFotosImportadas(json: unknown): FotosImportadas {
  if (!json || typeof json !== "object" || Array.isArray(json)) throw new SugestaoErro("O arquivo não está no formato das fotos.");
  const valor = (json as Record<string, unknown>).materiais;
  if (!Object.hasOwn(json, "materiais")) throw new SugestaoErro('O arquivo precisa ter "materiais" (fotos por código).');
  if (!valor || typeof valor !== "object" || Array.isArray(valor)) throw new SugestaoErro('"materiais" precisa ser um objeto.');
  const entradas = Object.entries(valor);
  if (entradas.length > MAX_ITENS) throw new SugestaoErro(`"materiais" passou de ${MAX_ITENS} itens.`);
  const materiais: Record<string, FotoCadastro> = {};
  for (const [chave, item] of entradas) {
    if (!materialValido(chave)) continue;
    const f = fotoDoCadastro(item);
    if (f) materiais[chave] = f; // endereço recusado (não https, rede interna…) fica de fora
  }
  return { materiais };
}

/** Grava no cadastro de fotos do fabricante; devolve quantos materiais entraram. */
export async function importarFotos(json: unknown, por: string): Promise<{ materiais: number }> {
  const f = normalizarFotosImportadas(json);
  const materiais = Object.keys(f.materiais).length;
  if (materiais) await gravarCadastroLote(ARQUIVO_REFERENCIA, f.materiais as unknown as Record<string, Record<string, unknown>>, por, false);
  return { materiais };
}
