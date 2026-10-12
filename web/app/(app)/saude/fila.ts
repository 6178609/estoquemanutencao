import { normalizarBusca } from "@/lib/dados/texto";
import * as saude from "@/lib/wcm/saude";
import type { LinhaSaude } from "@/lib/wcm/saude";

import { csv, dataCsv, listaParam, param, type Params } from "../equipamentos/logica";

/**
 * Fila de ataque da Saúde dos ativos (porta do filtro de paginas/saude.py): busca por código/nome/área/centro, faixa
 * (padrão: Crítica + Atenção), criticidade e principal causa. Testado em testes/saude-tela.test.ts.
 */
export const FAIXA_PADRAO = [saude.CRITICA, saude.ATENCAO];

export interface FiltroFila { q: string; faixas: string[]; crits: string[]; causas: string[] }

export function lerFiltroFila(p: Params): FiltroFila {
  // sem o parâmetro = padrão (críticos e em atenção); "-" = todas as faixas
  const faixas = p.sfaixa === undefined ? FAIXA_PADRAO : listaParam(p, "sfaixa");
  return { q: param(p, "sq"), faixas, crits: listaParam(p, "scrit"), causas: listaParam(p, "scausa") };
}

export function filtrarFila(t: LinhaSaude[], f: FiltroFila): LinhaSaude[] {
  const termos = normalizarBusca(f.q).split(/\s+/).filter(Boolean);
  return t.filter((l) => {
    if (f.faixas.length && !f.faixas.includes(l.faixa)) return false;
    if (f.crits.length && !f.crits.includes(l.criticidade || saude.SEM_CLASSE)) return false;
    if (f.causas.length && !f.causas.includes(l.principalCausa)) return false;
    if (termos.length) {
      const hay = normalizarBusca(`${l.codigo} ${l.equipamento} ${l.area} ${l.centro}`);
      if (!termos.every((x) => hay.includes(x))) return false;
    }
    return true;
  });
}

/** Distribuição do índice em faixas de 10 pontos (0–9 … 90–100), separada pela faixa de saúde. */
export function histograma(t: LinhaSaude[]): { rotulos: string[]; porFaixa: Record<string, number[]> } {
  const rotulos = Array.from({ length: 10 }, (_, i) => (i === 9 ? "90–100" : `${i * 10}–${i * 10 + 9}`));
  const porFaixa: Record<string, number[]> = Object.fromEntries(saude.FAIXAS.map((f) => [f, Array(10).fill(0)]));
  for (const l of t) porFaixa[l.faixa][Math.min(9, Math.floor(l.saude / 10))]++;
  return { rotulos, porFaixa };
}

/** Planilha da fila (todas as colunas do Python, sem as pts_*). */
export function csvFila(t: LinhaSaude[]): string {
  return csv(saude.COLUNAS.map(([, r]) => r), t.map((l) => saude.COLUNAS.map(([k]) => (k === "ultimaFalha" ? dataCsv(l.ultimaFalha) : l[k] as unknown))));
}
