import "server-only";

import { catalogo, estoque } from "@/lib/dados/bases";

import { guardar } from "../saude/calculo";
import { indexarMateriais, type BaseMateriais } from "./logica";

/** MB52 + catálogo Sysmat indexados por código (refeito só quando um dos dois exports muda). */
export async function baseMateriais(): Promise<BaseMateriais> {
  const [e, c] = await Promise.all([estoque(), catalogo()]);
  const chave = `mro|${e.atualizado}:${e.dados?.length ?? -1}|${c.atualizado}:${c.dados?.length ?? -1}`;
  return guardar(chave, () => indexarMateriais(e.dados, c.dados));
}
