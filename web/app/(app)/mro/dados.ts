import "server-only";

import { catalogo, estoque } from "@/lib/dados/bases";
import { camposDeOrdenacao } from "@/lib/wcm/camposOrdenacao";
import type { Contexto } from "@/lib/wcm/contexto";

import { guardar } from "../saude/calculo";
import { camposPorEquipamento, indexarMateriais, type BaseMateriais } from "./logica";

/** MB52 + catálogo Sysmat indexados por código (refeito só quando um dos dois exports muda). */
export async function baseMateriais(): Promise<BaseMateriais> {
  const [e, c] = await Promise.all([estoque(), catalogo()]);
  const chave = `mro|${e.atualizado}:${e.dados?.length ?? -1}|${c.atualizado}:${c.dados?.length ?? -1}`;
  return guardar(chave, () => indexarMateriais(e.dados, c.dados));
}

/** Campo de ordenação de cada equipamento (o mais usado nas ordens dele no IW38). */
export async function camposDosAtivos(c: Contexto): Promise<Map<string, string>> {
  const ordens = c.b.ordens.dados ?? [];
  const porOrdem = await camposDeOrdenacao(c.b.ordens.dados);
  return guardar(`mro-campos|${c.b.ordens.atualizado}:${ordens.length}:${porOrdem.size}`, () => camposPorEquipamento(ordens, porOrdem));
}
