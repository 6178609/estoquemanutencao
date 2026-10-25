import "server-only";

import { gravarCadastroLote } from "./cadastros";
import { materialValido } from "./fotos";
import { fotoDoCadastro, type FotoCadastro } from "./fotosExternas";
import { ARQUIVO_REFERENCIA } from "./fotosReferencia";
import { SugestaoErro } from "./fotosSugestao";
import { ARQUIVO_TIPOS, pdmValido } from "./fotosTipo";

/**
 * Importação das fotos (um arquivo JSON, detectado pelo conteúdo): raiz `{ "tipos": { "<PDM>": {...} } }` vai para
 * `fotos_tipos.json`; raiz `{ "materiais": { "<código>": {...} } }` vai para `fotos_referencia.json`. Os dois juntos
 * no mesmo arquivo valem. Só substitui os itens do arquivo; os outros ficam.
 */
const MAX_ITENS = 5_000;

export interface FotosImportadas { tipos: Record<string, FotoCadastro>; materiais: Record<string, FotoCadastro> }

function bloco(valor: unknown, nome: string, valida: (chave: string) => boolean): Record<string, FotoCadastro> {
  if (valor === undefined) return {};
  if (!valor || typeof valor !== "object" || Array.isArray(valor)) throw new SugestaoErro(`"${nome}" precisa ser um objeto.`);
  const entradas = Object.entries(valor);
  if (entradas.length > MAX_ITENS) throw new SugestaoErro(`"${nome}" passou de ${MAX_ITENS} itens.`);
  const out: Record<string, FotoCadastro> = {};
  for (const [chave, item] of entradas) {
    if (!valida(chave)) continue;
    const f = fotoDoCadastro(item);
    if (f) out[chave] = f; // endereço recusado (não https, rede interna…) fica de fora
  }
  return out;
}

/** Detecta o formato pelo conteúdo e devolve só o que é aproveitável. Lança SugestaoErro se não há "tipos" nem "materiais". */
export function normalizarFotosImportadas(json: unknown): FotosImportadas {
  if (!json || typeof json !== "object" || Array.isArray(json)) throw new SugestaoErro("O arquivo não está no formato das fotos.");
  const raiz = json as Record<string, unknown>;
  if (!Object.hasOwn(raiz, "tipos") && !Object.hasOwn(raiz, "materiais"))
    throw new SugestaoErro('O arquivo precisa ter "tipos" (fotos por tipo de material) ou "materiais" (fotos por código).');
  return {
    tipos: bloco(raiz.tipos, "tipos", pdmValido),
    materiais: bloco(raiz.materiais, "materiais", materialValido),
  };
}

/** Grava no cadastro certo; devolve quantos tipos e quantos materiais entraram. */
export async function importarFotos(json: unknown, por: string): Promise<{ tipos: number; materiais: number }> {
  const f = normalizarFotosImportadas(json);
  const tipos = Object.keys(f.tipos).length, materiais = Object.keys(f.materiais).length;
  if (tipos) await gravarCadastroLote(ARQUIVO_TIPOS, f.tipos as unknown as Record<string, Record<string, unknown>>, por, false);
  if (materiais) await gravarCadastroLote(ARQUIVO_REFERENCIA, f.materiais as unknown as Record<string, Record<string, unknown>>, por, false);
  return { tipos, materiais };
}
