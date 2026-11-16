import { campoDoEquipamento } from "@/lib/wcm/campoGeral";
import { DESATIVADO } from "@/lib/wcm/ativos";
import type { Contexto } from "@/lib/wcm/contexto";
import type { EquipamentoManual } from "@/lib/manuais/lista";

import { inventarioAtivos } from "../equipamentos/dados";

/**
 * Equipamentos da aba Manuais: `todos` (inventário com campo e área), `ativosIH08` (IH08 sem desativados, para a
 * cobertura) e `ativosTela` (os de `todos` que estão em `ativosIH08`: a escolha do Vincular e a lista "Sem manual").
 */
export async function equipamentosDosManuais(c: Contexto) {
  const [inv, campoEq] = await Promise.all([inventarioAtivos(c), campoDoEquipamento(c)]);
  const todos: EquipamentoManual[] = inv.map((x) => ({ codigo: x.codigo, nome: x.equipamento || "", campo: campoEq(x.codigo) || "", area: x.area || "" }));
  const ativosIH08 = inv.filter((x) => x.situacao !== DESATIVADO && x.origem !== "Site").map((x) => ({ codigo: x.codigo, area: x.area || "" }));
  const codigosAtivos = new Set(ativosIH08.map((a) => a.codigo));
  const ativosTela = todos.filter((x) => codigosAtivos.has(x.codigo));
  return { todos, ativosIH08, ativosTela };
}
