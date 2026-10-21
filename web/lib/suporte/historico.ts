/**
 * Histórico de um equipamento para o diagnóstico: as últimas quebras e os modos de causa mais frequentes, só do que é
 * dele. Função pura (sem leitura de bases), testada em testes/suporte-historico.test.ts.
 */
import type { Quebra } from "@/lib/wcm/indicadores";
import { analisarModos, type ModoCausa } from "@/lib/wcm/modosFalha";
import type { Confirmacao } from "@/lib/wcm/preparo";

export interface OrdemDoHistorico { ordem: string; tipo: string; equipChave: string }

export interface HistoricoDoEquipamento { quebras: Quebra[]; modos: ModoCausa[] }

/**
 * `quebras`: todas as quebras do recorte (filtra pelo equipamento). `ordens`: todas as ordens (só as do equipamento
 * entram nos modos). `conf`: confirmações (IW47); só as das ordens dele entram. Limite padrão: 5 de cada.
 */
export function historicoDoEquipamento(
  eq: string, quebras: Quebra[], ordens: OrdemDoHistorico[], conf: Confirmacao[], limite = 5,
): HistoricoDoEquipamento {
  const doEq = ordens.filter((o) => o.equipChave === eq);
  const ids = new Set(doEq.map((o) => o.ordem));
  const tipos = new Map(doEq.map((o) => [o.ordem, o.tipo.toUpperCase()] as const));
  const ultimas = quebras
    .filter((q) => q.equipChave === eq)
    .sort((a, b) => (b.data ?? 0) - (a.data ?? 0))
    .slice(0, limite);
  const modos = analisarModos(conf.filter((c) => ids.has(c.ordem)), tipos).modos.slice(0, limite);
  return { quebras: ultimas, modos };
}
