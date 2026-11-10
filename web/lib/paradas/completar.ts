import type { Operacao, Ordem } from "@/lib/wcm/preparo";

import { disciplinaDoCentro } from "./leitura";
import type { ItemPlano, OrigemHh, Parametros } from "./tipos";

/**
 * Completar o HH (spec §2.5): a IP19 "nova" vem sem operação (HH 0, sem centro). Cada chamada nessa situação vira um
 * item por operação — da própria ordem (C1), da ordem do mesmo plano + equipamento mais próxima (C2) ou de outra
 * chamada do mesmo plano + equipamento (C3); sem nada, continua com HH 0 (C4).
 */

type OrdemMin = Pick<Ordem, "ordem" | "plano" | "equipamento" | "inicio">;
type OpMin = Pick<Operacao, "ordem" | "operacao" | "centroTrabalho" | "horas" | "cancelada">;
interface Fonte { centro: string; hh: number }

const chamadaDe = (i: ItemPlano) => `${i.plano}|${i.item}|${i.dataIp19}`;

export function completarHh(itens: ItemPlano[], ordens: OrdemMin[], ops: OpMin[], p: Parametros): { itens: ItemPlano[]; completadas: Record<OrigemHh, number> } {
  const completadas: Record<OrigemHh, number> = { "ip19": 0, "iw38op-ordem": 0, "iw38op-plano": 0, "ip19-mesmo-plano": 0, "sem-hh": 0 };
  const eliminados = new Set(p.centrosEliminados.map((x) => x.toUpperCase()));
  const opsPorOrdem = new Map<string, OpMin[]>();
  for (const o of ops) {
    if (o.cancelada) continue;
    const l = opsPorOrdem.get(o.ordem) ?? [];
    l.push(o);
    opsPorOrdem.set(o.ordem, l);
  }
  for (const l of opsPorOrdem.values()) l.sort((a, b) => (a.operacao < b.operacao ? -1 : a.operacao > b.operacao ? 1 : 0));
  const ordensPorPlanoEq = new Map<string, OrdemMin[]>();
  for (const o of ordens) {
    if (!o.plano || o.inicio == null || !opsPorOrdem.has(o.ordem)) continue;
    const k = `${o.plano}|${o.equipamento}`;
    ordensPorPlanoEq.set(k, [...(ordensPorPlanoEq.get(k) ?? []), o]);
  }

  // chamadas em ordem de aparição
  const chamadas = new Map<string, ItemPlano[]>();
  for (const i of itens) chamadas.set(chamadaDe(i), [...(chamadas.get(chamadaDe(i)) ?? []), i]);
  const precisa = (g: ItemPlano[]) => g.reduce((s, i) => s + i.hh, 0) <= 1e-9 || g.every((i) => i.centroAssumido);
  // chamadas com HH (as que servem de modelo no C3), por plano + equipamento
  const modelos = new Map<string, ItemPlano[][]>();
  for (const g of chamadas.values()) {
    if (precisa(g)) continue;
    const k = `${g[0].plano}|${g[0].equipamento}`;
    modelos.set(k, [...(modelos.get(k) ?? []), g]);
  }

  const out: ItemPlano[] = [];
  for (const g of chamadas.values()) {
    if (!precisa(g)) { out.push(...g); completadas.ip19++; continue; }
    const c = g[0];
    const k = `${c.plano}|${c.equipamento}`;
    let fontes: Fonte[] | null = null, origem: OrigemHh = "sem-hh";
    // C1
    if (c.ordem && opsPorOrdem.has(c.ordem)) {
      fontes = opsPorOrdem.get(c.ordem)!.map((o) => ({ centro: o.centroTrabalho, hh: o.horas }));
      origem = "iw38op-ordem";
    }
    // C2: início mais próximo; empate, a mais recente
    if (!fontes) {
      const cands = (ordensPorPlanoEq.get(k) ?? []).slice().sort((a, b) =>
        Math.abs(a.inicio! - c.dataIp19) - Math.abs(b.inicio! - c.dataIp19) || b.inicio! - a.inicio! || (a.ordem < b.ordem ? -1 : 1));
      if (cands.length) {
        fontes = opsPorOrdem.get(cands[0].ordem)!.map((o) => ({ centro: o.centroTrabalho, hh: o.horas }));
        origem = "iw38op-plano";
      }
    }
    // C3: data mais próxima; empate, a anterior
    if (!fontes) {
      const cands = (modelos.get(k) ?? []).slice().sort((a, b) =>
        Math.abs(a[0].dataIp19 - c.dataIp19) - Math.abs(b[0].dataIp19 - c.dataIp19) || a[0].dataIp19 - b[0].dataIp19);
      if (cands.length) {
        fontes = cands[0].map((i) => ({ centro: i.centro, hh: i.hh }));
        origem = "ip19-mesmo-plano";
      }
    }
    if (!fontes) {
      const hh = g.reduce((s, i) => s + i.hh, 0);
      if (hh <= 1e-9) { out.push(...g.map((i) => ({ ...i, origemHh: "sem-hh" as const }))); completadas["sem-hh"]++; }
      else { out.push(...g); completadas.ip19++; }
      continue;
    }
    completadas[origem]++;
    let n = 0;
    for (const f of fontes) {
      const centro = f.centro.trim().toUpperCase();
      if (eliminados.has(centro)) continue;
      const disc = disciplinaDoCentro(centro, p.centrosComponentes);
      if (disc === null) continue; // fora de Componentes
      const { centroAssumido: _, ...resto } = c;
      void _;
      out.push({ ...resto, chave: `${chamadaDe(c)}|${n++}`, centro, disciplina: disc === "vazio" ? "MEC" : disc, hh: f.hh,
        origemHh: origem, ...(disc === "vazio" ? { centroAssumido: true } : {}) });
    }
  }
  return { itens: out, completadas };
}
