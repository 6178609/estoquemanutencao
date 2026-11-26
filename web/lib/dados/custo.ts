import "server-only";

import { DESTINO } from "../leitura/tipos";
import { type Base, lerBase } from "./bases";
import { custoDemo } from "./demo";
import { prepararCusto, type Precos } from "./custoMaterial";
import { fonte } from "./fonte";

let demo: Precos | null = null;

/**
 * Preço por material (base "custo_material", bases/CUSTO_MATERIAL.parquet), lido pelo lerBase com cache pela versão do
 * arquivo (sem montar as outras bases). Na demonstração, a lista fictícia de lib/dados/demo.ts. dados null = sem a base.
 */
export async function custoMateriais(): Promise<Base<Precos>> {
  if (!fonte()) return { dados: (demo ??= prepararCusto(custoDemo())), atualizado: new Date().toISOString(), origem: "demonstração" };
  return lerBase(DESTINO.custo_material, prepararCusto);
}

/** Os preços, ou null sem a base (ou se a leitura falhar: a tela segue sem as colunas de valor). */
export async function precosOuNada(): Promise<Precos | null> {
  return (await custoMateriais().catch(() => null))?.dados ?? null;
}
