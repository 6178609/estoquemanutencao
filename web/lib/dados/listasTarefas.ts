import "server-only";

import { DESTINO } from "../leitura/tipos";
import { listasDemo } from "../wcm/demo";
import { prepararListas, type ListaLT } from "../wcm/listasTarefas";
import { hoje } from "../wcm/util";
import { lerBase, type Base } from "./bases";
import { fonte } from "./fonte";

/** As listas de tarefas enviadas em Fontes de dados (texto da IA03/IA06), já preparadas; na demonstração, as fictícias. */
export async function listasTarefas(): Promise<Base<ListaLT[]>> {
  if (!fonte()) {
    const b = listasDemo(hoje());
    return { ...b, dados: prepararListas(b.dados) };
  }
  return lerBase(DESTINO.listas_tarefas, prepararListas);
}
