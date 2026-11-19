import "server-only";

import { lerCadastro } from "../dados/cadastros";
import { bases } from "../wcm/dados";
import * as hh from "../wcm/hh";
import {
  ARQ, type AusenciaExterna, type AusenciasPorNp, chaveNp, chaveOrdem, lerAgenda, type OrdemResumo, type PessoaDaEquipe, paraIso,
  type Programacao, type Tecnico,
} from "./regras";

/**
 * Leitura do Controle de HH (agenda_hh.json) e o que ele usa das outras bases do site: as ausências e a equipe da
 * Gestão de HH (hh_disponibilidade.json) e as ordens (IW38) e equipamentos (IH08). Na demonstração, o cadastro vem
 * de lib/dados/demo.ts (fictício) e as bases, de lib/wcm/demo.ts.
 */
const iso = (d: number) => paraIso(new Date(d * 86_400_000));

/** Ausências da Gestão de HH por NP (sem zeros à esquerda), em datas ISO. */
export async function ausenciasDaGestaoHh(): Promise<AusenciasPorNp> {
  const cad = await lerCadastro(hh.ARQ).catch(() => ({}));
  const out: AusenciasPorNp = {};
  for (const a of hh.ausencias(cad)) {
    const k = chaveNp(a.np);
    if (!k) continue;
    (out[k] ??= []).push({ tipo: a.tipo, de: iso(a.de), ate: iso(a.ate), horas: a.semHh ? 0 : a.horas } satisfies AusenciaExterna);
  }
  return out;
}

/** Técnicos (com as ausências da Gestão de HH) e programações. */
export async function lerAgendaHh(): Promise<{ tecnicos: Tecnico[]; programacoes: Programacao[] }> {
  const [cad, aus] = await Promise.all([lerCadastro(ARQ, { fresco: true }), ausenciasDaGestaoHh()]);
  const { tecnicos, programacoes } = lerAgenda(cad);
  return { tecnicos: tecnicos.map((t) => ({ ...t, ausenciasHh: aus[chaveNp(t.np)] ?? [] })), programacoes };
}

/** Só técnicos e programações (sem as ausências): para conferir as gravações. */
export async function lerAgendaCrua() {
  return lerAgenda(await lerCadastro(ARQ, { fresco: true }));
}

/** A equipe da Gestão de HH (cadastro manual ou última planilha), com a jornada semanal cadastrada. */
export async function equipeDaGestaoHh(): Promise<PessoaDaEquipe[]> {
  const [b, cad] = await Promise.all([bases(), lerCadastro(hh.ARQ).catch(() => ({}))]);
  return (b.equipe.dados ?? []).map((p) => {
    const item = (cad as Record<string, hh.ItemHh>)[p.np];
    const j = Number(item?.jornada);
    return { np: p.np, nome: p.nome, centroTrabalho: p.centroTrabalho, area: p.area, especialidade: p.especialidade, turma: p.turma,
      jornadaSemana: item?.jornada != null && Number.isFinite(j) && j > 0 ? j : null };
  });
}

/** A ordem da IW38 pelo número (sem a base ou sem a ordem: null). */
export async function ordemDaIw38(numero: string): Promise<OrdemResumo | null> {
  const n = chaveOrdem(numero);
  if (!n) return null;
  const b = await bases();
  const o = (b.ordens.dados ?? []).find((x) => chaveOrdem(x.ordem) === n);
  if (!o) return null;
  const e = o.equipamento ? (b.equipamentos.dados ?? []).find((x) => x.equipamento === o.equipamento) : undefined;
  return { ordem: o.ordem, tipo: o.tipo, texto: o.texto, equipamento: o.equipamento, denominacao: e?.denominacao || "",
    area: o.setor || o.centroTrabalho || "" };
}

/** Equipamentos em uso (IH08) para a busca do campo Equipamento: "código · denominação". */
export async function listaEquipamentos(): Promise<string[]> {
  const b = await bases().catch(() => null);
  const out = new Set<string>();
  for (const e of b?.equipamentos.dados ?? []) {
    if (!e.equipamento || e.desativado) continue;
    out.add([e.equipamento, e.denominacao].filter(Boolean).join(" · ").slice(0, 80));
    if (out.size >= 5000) break;
  }
  return [...out].sort((a, b) => a.localeCompare(b, "pt-BR"));
}
