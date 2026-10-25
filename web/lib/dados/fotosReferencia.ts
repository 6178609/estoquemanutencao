import "server-only";

import { lerCadastro } from "./cadastros";
import { fotoDoCadastro, type FotoCadastro } from "./fotosExternas";

/** Foto exata do item (do fabricante, achada pela referência): `fotos_referencia.json`, por código de material. */
export const ARQUIVO_REFERENCIA = "fotos_referencia.json";

export async function lerFotoReferencia(material: string): Promise<FotoCadastro | null> {
  const cad = await lerCadastro(ARQUIVO_REFERENCIA);
  return Object.hasOwn(cad, material) ? fotoDoCadastro(cad[material]) : null;
}
