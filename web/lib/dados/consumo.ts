import "server-only";

import { DESTINO } from "../leitura/tipos";
import { prepararConsumo, type Consumo } from "../wcm/consumo";
import { lerBase, type Base } from "./bases";
import { fonte } from "./fonte";

/** Consumo real de materiais nas ordens (IW13), por equipamento; sem a base (ou sem fonte de dados), vazio. */
export async function consumoMateriais(): Promise<Base<Consumo>> {
  if (!fonte()) return { dados: null, atualizado: null, origem: DESTINO.iw13 };
  return lerBase(DESTINO.iw13, prepararConsumo);
}
