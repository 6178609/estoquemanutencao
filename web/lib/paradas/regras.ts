import type { Dia } from "@/lib/wcm/util";

import { diasDaEntrada } from "./motor";
import { Estado, TOL, type Codigo } from "./motor/estado";
import type { EntradaMotor, LinhaProgramacao, Turno } from "./tipos";

/**
 * Alertas de regra (spec §6): recalculados sobre as linhas finais (depois de fixações e edições). Cada linha é
 * conferida contra todas as outras (regra simétrica: dois ativos do mesmo tipo no dia → alerta nas duas).
 */

export interface Alerta { linhaId: string; codigo: Codigo; texto: string }

export const TEXTO_ALERTA: Record<Codigo, string> = {
  CALENDARIO: "Data sem atuação (domingo, feriado, 2º turno de sábado ou antes do início)",
  SO_T1: "Ativo só de 1º turno programado no 2º turno",
  SABADO: "Dia da semana não permitido (só sábado, ou crítico/injetora EXP no sábado)",
  DOIS_CRITICOS: "Mais de um grupo crítico no mesmo dia",
  MOINHO_SEM_PRENSA: "Moinho SF fora do dia de uma prensa",
  MESMO_TIPO: "Dois ativos do mesmo tipo no mesmo dia",
  SEMANA_REPETIDA: "O mesmo ativo mais de um dia na semana",
  PRENSA_SEMANA: "Mais de uma prensa na semana",
  PRENSA_SEGUIDA: "A mesma prensa em semanas seguidas",
  PELLET_SEMANA: "Mais de uma Pellet na semana",
  PELLET_SEGUIDA: "A mesma Pellet em semanas seguidas",
  DRY_BLEND_SOZINHA: "Outro ativo no 1º turno do dia do DRY BLEND",
  MAX_DIA: "Mais ativos no dia do que o máximo dos Parâmetros",
  T1_CHEIO: "Mais de um não crítico no 1º turno de dia de crítico",
  JUNTO_FORA: "Fora do dia do ativo com que deve parar junto",
  CAPACIDADE: "Acima da capacidade do turno",
  PARADAS_MES: "Mais paradas no mês do que o máximo dos Parâmetros",
  SEGUNDA_MESMA_SEMANA: "2ª parada na mesma semana da 1ª",
  FORA_DO_MES: "Parada fora do mês da IP19",
};

export function alertas(linhas: LinhaProgramacao[], e: EntradaMotor): Alerta[] {
  const est = new Estado(diasDaEntrada(e), e.ativos, e.parametros, e.ocupacaoAnterior, e.demandas.map((d) => `${d.mes}|${d.ativo}`));
  for (const l of linhas) est.inserir({ ...l, itens: [...l.itens], marcas: [...l.marcas] });
  const out: Alerta[] = [];
  const add = (linhaId: string, codigo: Codigo) => out.push({ linhaId, codigo, texto: TEXTO_ALERTA[codigo] });
  // capacidade: o excesso do turno além do estouro ≤ 4 h registrado nas linhas
  const capOk = new Map<string, boolean>();
  const turnoOk = (d: Dia, t: Turno) => {
    const k = `${d}|${t}`;
    if (!capOk.has(k)) {
      const ls = est.linhasDoDia(d).filter((l) => l.turno === t);
      const cap = est.cap(d, t);
      const u = ls.reduce((a, l) => ({ mec: a.mec + l.hh.mec, ele: a.ele + l.hh.ele }), { mec: 0, ele: 0 });
      const ac = ls.reduce((a, l) => ({ mec: a.mec + l.acima.mec, ele: a.ele + l.acima.ele }), { mec: 0, ele: 0 });
      capOk.set(k, u.mec - cap.mec <= ac.mec + TOL && u.ele - cap.ele <= ac.ele + TOL);
    }
    return capOk.get(k)!;
  };
  for (const l of linhas) {
    const cods = est.falhas(l.ativo, l.mes, l.data, l.turno === 1 ? "T1" : "T2",
      { ignorar: new Set([l.id]), extra: l.marcas.includes("parada extra") });
    for (const c of cods) add(l.id, c);
    if (!turnoOk(l.data, l.turno)) add(l.id, "CAPACIDADE");
  }
  return out;
}
