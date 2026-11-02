import { AbasParam } from "../equipamentos/_ui/Blocos";
import type { Params } from "./_comum/params";

/** As duas visões da IP19 na aba Planos: as chamadas semana a semana e o mapa do ano inteiro (52 semanas). */
export function AbasProgramacao({ params, atual }: { params: Params; atual: "chamadas" | "mapa" }) {
  return <AbasParam params={params} param="vista" atual={atual}
    abas={[{ id: "chamadas", rotulo: "Chamadas por semana" }, { id: "mapa", rotulo: "Mapa 52 semanas" }]} />;
}
