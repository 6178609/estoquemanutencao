import "server-only";

import { catalogo, estoque } from "@/lib/dados/bases";
import { camposGerais } from "@/lib/wcm/campoGeral";
import type { Contexto } from "@/lib/wcm/contexto";

import { guardar } from "../saude/calculo";
import { listasPorEquipamento, listasPorPlano, type ListaTarefas } from "./ia06";
import { indexarMateriais, type BaseMateriais } from "./logica";

/** MB52 + catálogo Sysmat indexados por código (refeito só quando um dos dois exports muda). */
export async function baseMateriais(): Promise<BaseMateriais> {
  const [e, c] = await Promise.all([estoque(), catalogo()]);
  const chave = `mro|${e.atualizado}:${e.dados?.length ?? -1}|${c.atualizado}:${c.dados?.length ?? -1}`;
  return guardar(chave, () => indexarMateriais(e.dados, c.dados));
}

/** Campo de ordenação de cada equipamento (o geral, o mesmo de todas as abas). */
export async function camposDosAtivos(c: Contexto): Promise<Map<string, string>> {
  return camposGerais(c);
}

/** Listas de tarefas (grupo + numerador) de cada equipamento: planos das ordens do IW38 × IP19. */
export async function listasDosAtivos(c: Contexto): Promise<Map<string, ListaTarefas[]>> {
  const ordens = c.b.ordens.dados ?? [], ip19 = c.b.cruas.ip19;
  return guardar(`mro-listas|${c.b.ordens.atualizado}:${ordens.length}|${ip19.atualizado}:${ip19.dados?.length ?? -1}`,
    () => listasPorEquipamento(ordens, listasPorPlano(ip19.dados)));
}
