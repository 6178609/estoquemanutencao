/**
 * Peças de um ativo agrupadas pelos sistemas (subconjuntos) dele no SAP: um grupo por subconjunto direto do equipamento
 * (com as peças dos níveis abaixo dele) e, por último, "Geral" com as peças só do equipamento. Funções puras
 * (testes/pecasPorSistema.test.ts); a tela é app/(app)/equipamentos/_ui/PecasPorSistema.tsx.
 */
import { chave } from "../dados/texto";

export interface EquipHierarquia { equipamento: string; denominacao: string; superior?: string; inativo?: boolean; desativado?: boolean }
/** codigos: as peças do grupo; origem: em que equipamento cada peça está vinculada (para desvincular no lugar certo). */
export interface GrupoSistema { chave: string; rotulo: string; codigos: string[]; origem: Record<string, string> }

export const GERAL = "geral";

/** Nome curto do sistema pelo nome do subconjunto ("INJ PVC 06 GOLDEN - SISTEMA DE AQUECIMEN" → "Aquecimento"). */
export function rotuloSistema(denominacao: string): string {
  const parte = denominacao.includes(" - ") ? denominacao.slice(denominacao.lastIndexOf(" - ") + 3) : denominacao;
  const c = chave(parte).replace(/^(SISTEMA|SIST) (DE |DA |DO )?/, "").replace(/^(SISTEMA|SIST)\b ?/, "").trim();
  const NOMES: [RegExp, string][] = [
    [/^HIDRAULIC/, "Hidráulico"], [/^UNIDADE HIDRAULIC/, "Unidade hidráulica"], [/^INJECA?O?$|^INJEC/, "Injeção"], [/^AQUECIMEN/, "Aquecimento"],
    [/^REFRIGERA/, "Refrigeração"], [/^COMAN/, "Comando e força"], [/^CONTROLE/, "Controle"], [/^FECHAMEN/, "Fechamento"],
    [/^SEGURAN/, "Segurança"], [/^ESTRUTUR/, "Estrutura"], [/^ABASTECIMEN/, "Abastecimento"], [/^LUBRIFIC/, "Lubrificação"],
    [/^PNEUMATIC/, "Pneumático"], [/^ELETRIC/, "Elétrico"], [/^ACIONAMEN/, "Acionamento"],
  ];
  for (const [re, nome] of NOMES) if (re.test(c)) return nome;
  const t = parte.trim().toLowerCase();
  return t ? t[0].toUpperCase() + t.slice(1) : denominacao;
}

/**
 * Grupos de códigos de material do ativo: um por subconjunto direto ativo (com as peças dele e dos que estão abaixo, sem
 * repetir) e "Geral" com as peças do próprio equipamento que não estão em nenhum sistema. Grupos vazios saem.
 */
export function gruposPorSistema(tag: string, equips: EquipHierarquia[], materiaisDe: (tag: string) => string[]): GrupoSistema[] {
  const filhos = new Map<string, EquipHierarquia[]>();
  for (const e of equips) {
    if (!e.superior || e.inativo || e.desativado) continue;
    const l = filhos.get(e.superior);
    if (l) l.push(e); else filhos.set(e.superior, [e]);
  }
  // visitados: uma hierarquia com ciclo no SAP não repete nem volta ao próprio equipamento
  const abaixo = (raiz: string): Record<string, string> => {
    const out: Record<string, string> = {};
    const vistos = new Set([tag]);
    const pilha = [raiz];
    while (pilha.length) {
      const t = pilha.pop()!;
      if (vistos.has(t)) continue;
      vistos.add(t);
      for (const m of materiaisDe(t)) out[m] ??= t;
      for (const f of filhos.get(t) ?? []) pilha.push(f.equipamento);
    }
    return out;
  };
  const grupos: GrupoSistema[] = [];
  const nosSistemas = new Set<string>();
  for (const f of filhos.get(tag) ?? []) {
    const origem = abaixo(f.equipamento);
    const codigos = Object.keys(origem);
    if (!codigos.length) continue;
    codigos.forEach((c) => nosSistemas.add(c));
    grupos.push({ chave: f.equipamento, rotulo: rotuloSistema(f.denominacao), codigos, origem });
  }
  const geral = [...new Set(materiaisDe(tag))].filter((c) => !nosSistemas.has(c));
  if (geral.length) grupos.push({ chave: GERAL, rotulo: grupos.length ? "Geral (só no equipamento)" : "Peças do equipamento", codigos: geral,
    origem: Object.fromEntries(geral.map((c) => [c, tag])) });
  return grupos;
}
