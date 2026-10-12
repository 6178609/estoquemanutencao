import "server-only";

import { estoque as lerEstoque } from "@/lib/dados/bases";
import * as ativos from "@/lib/wcm/ativos";
import { dados, type Contexto } from "@/lib/wcm/contexto";
import * as ind from "@/lib/wcm/indicadores";

import { assinatura, FABRICA, guardar, saudeAtivos } from "../saude/calculo";
import { situacaoPeca, type SituacaoPeca } from "./logica";

/**
 * Dados da aba Equipamentos no servidor: o inventário da Gestão de ativos (fábrica inteira, como em
 * central/ativos_ui._inventario), o estoque por material (situação das peças vinculadas) e o cadastro do site.
 */

/** Inventário de ativos: IH08 + cadastro do site + ordens do IW38, com saúde, quebras e cobertura preventiva. */
export async function inventarioAtivos(c: Contexto): Promise<ativos.LinhaAtivo[]> {
  const b = c.b;
  if (!b.ordens.dados) {
    return guardar(`inv0|${assinatura(c)}`, () => ativos.inventario(b.hoje, { equip: b.equipamentos.dados, cadEq: c.cad.equipamentos,
      chamadas: c.chamadas }));
  }
  const [d, s] = await Promise.all([dados(c, FABRICA), saudeAtivos(c, true)]);
  return guardar(`inv|${assinatura(c)}`, () => ativos.inventario(d.hoje, {
    equip: b.equipamentos.dados, ordens: d.ordens, cadEq: c.cad.equipamentos, quebras: ind.quebras(d), chamadas: d.chamadas, saude: s,
  }));
}

export type MapaEstoque = Map<string, { descricao: string; estoque: number }>;

/** MB52 por material (null = sem a base). */
export async function mapaEstoque(): Promise<MapaEstoque | null> {
  const e = await lerEstoque();
  if (!e.dados) return null;
  return guardar(`est|${e.atualizado}|${e.dados.length}`, () => {
    const m: MapaEstoque = new Map();
    for (const x of e.dados!) if (!m.has(x.material)) m.set(x.material, { descricao: x.descricao, estoque: x.estoque });
    return m;
  });
}

/** Item do cadastro do site (objeto vazio se não houver). */
export function infoCad(c: Contexto, tag: string): Record<string, unknown> {
  const v = c.cad.equipamentos[tag];
  return v && typeof v === "object" && !Array.isArray(v) ? v : {};
}

export function materiaisDe(info: Record<string, unknown>): string[] {
  return Array.isArray(info.materiais) ? [...new Set(info.materiais.map(String))] : [];
}

/** Peças vinculadas a um equipamento com a situação no estoque. */
export function pecasDe(c: Contexto, tag: string, est: MapaEstoque | null): SituacaoPeca[] {
  return materiaisDe(infoCad(c, tag)).map((m) => situacaoPeca(m, est, c.cad.materiais));
}
