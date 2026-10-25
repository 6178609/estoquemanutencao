import "server-only";

import { lerCadastro } from "./cadastros";
import { fotoDoCadastro, type FotoCadastro } from "./fotosExternas";

/** Foto por tipo de material (PDM), ilustrativa: `fotos_tipos.json`, `{ "<PDM>": { url, pagina, titulo, buscado_em } }`. */
export const ARQUIVO_TIPOS = "fotos_tipos.json";

/** Tipo de material: texto de 1 a 120 caracteres, sem caracteres de controle. */
export const pdmValido = (p: string) => p.length >= 1 && p.length <= 120 && !/[\u0000-\u001f\u007f]/.test(p);

export async function lerFotoTipo(pdm: string): Promise<FotoCadastro | null> {
  if (!pdmValido(pdm)) return null;
  const cad = await lerCadastro(ARQUIVO_TIPOS);
  return Object.hasOwn(cad, pdm) ? fotoDoCadastro(cad[pdm]) : null;
}

/** Há algum tipo com foto no cadastro (a tela só mostra o filtro "Foto ilustrativa" quando há). */
export async function temFotoTipo(): Promise<boolean> {
  return Object.keys(await lerCadastro(ARQUIVO_TIPOS)).length > 0;
}
