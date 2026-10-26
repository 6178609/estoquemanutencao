import "server-only";

import type { Contexto } from "@/lib/wcm/contexto";
import { gruposPorSistema } from "@/lib/wcm/pecasPorSistema";

import { pecaMro, type BaseMateriais } from "../mro/logica";
import type { GrupoPecas, LinhaPeca } from "./_ui/PecasPorSistema";
import { infoCad, materiaisDe } from "./dados";

/**
 * Peças de um ativo agrupadas pelos sistemas (subconjuntos da IH08), com a situação de cada uma pela MB52 e pelo
 * catálogo Sysmat — a mesma lista na Biblioteca do ativo e na Gestão de MRO.
 */
export function gruposDoAtivo(c: Contexto, tag: string, bm: BaseMateriais, foto?: (codigo: string) => string | null): GrupoPecas[] {
  const cache = new Map<string, LinhaPeca>();
  const linha = (codigo: string): LinhaPeca => {
    const ja = cache.get(codigo);
    if (ja) return ja;
    const p = pecaMro(codigo, bm, c.cad.materiais);
    const l: LinhaPeca = { codigo, descricao: p.descricao, status: p.status, texto: p.texto, estoque: p.estoque, minimo: p.minimo, um: p.um,
      sysmat: p.sysmat, fabricanteRef: p.fabricanteRef, depositos: p.depositos, descrCompleta: p.descrCompleta, valor: p.valor,
      substituto: p.substituto, cadastro: p.cadastro, origem: "", foto: foto?.(codigo) ?? null };
    cache.set(codigo, l);
    return l;
  };
  return gruposPorSistema(tag, c.b.equipamentos.dados ?? [], (t) => materiaisDe(infoCad(c, t))).map((g) => ({
    chave: g.chave, rotulo: g.rotulo,
    pecas: g.codigos.map((cod) => ({ ...linha(cod), origem: g.origem[cod] ?? tag })).sort((a, b) => (a.descricao || "~").localeCompare(b.descricao || "~", "pt-BR")),
  }));
}
