import * as ex from "@/lib/wcm/execucao";
import type { Confirmacao, Operacao, Ordem, Pessoa } from "@/lib/wcm/preparo";
import { dataBr, type Dia } from "@/lib/wcm/util";

/**
 * Contas da tela Execução das atividades que não estão em lib/wcm/execucao.ts (a porta de central/execucao.py):
 * o recorte de área/tipo como no central/execucao_ui.py e os quadros dos gráficos. Testado em testes/execucao_tela.test.ts.
 */

/** Ordens do IW38 na área/tipo escolhidos (null = sem IW38). */
export function ordensDoRecorte(ordens: Ordem[] | null, areas: string[], tipos: string[]): Ordem[] | null {
  if (!ordens) return null;
  return ordens.filter((o) => (!areas.length || areas.includes(o.localizacao)) && (!tipos.length || tipos.includes(o.tipo)));
}

/**
 * Operações (IW38OP) das ordens do recorte com situação e quem fez, e os apontamentos (IW47) só das pessoas da
 * Gestão de HH (sem a planilha, todos) — o _ops() de central/execucao_ui.py. `confRecorte` já vem filtrada por
 * área/tipo (filtrarConf do contexto).
 */
export function baseExecucao(oper: Operacao[], ordens: Ordem[] | null, confTodos: Confirmacao[] | null, confRecorte: Confirmacao[] | null,
  equipe: Pessoa[] | null, hoje: Dia): { ops: ex.Atividade[]; ap: ex.Apontamento[] } {
  let op = oper;
  if (ordens) { const s = new Set(ordens.map((o) => o.ordem)); op = op.filter((x) => s.has(x.ordem)); }
  let conf = confRecorte;
  if (conf && equipe?.length) { const s = new Set(equipe.map((p) => p.np)); conf = conf.filter((x) => s.has(x.np)); }
  return { ops: ex.operacoes(op, ordens, confTodos, equipe, hoje), ap: ex.apontamentos(conf, equipe) };
}

/** Semana a semana para o gráfico empilhado: executadas e o que falta das programadas. */
export function semanasGrafico(sem: ex.SemanaExecucao[]) {
  return {
    rotulos: sem.map((s) => dataBr(s.semana).slice(0, 5)),
    executadas: sem.map((s) => s.executadas),
    pendentes: sem.map((s) => s.programadas - s.executadas),
    taxa: sem.map((s) => (s.taxa == null ? null : Math.round(s.taxa * 10) / 10)),
  };
}

/** Quem apontou mais horas: HH em ordens com plano e fora de plano (o % em plano vale só para ordens conhecidas). */
export function topPessoas(pes: ex.PessoaExecucao[], n = 15) {
  return pes.slice(0, n).map((p) => {
    const plano = p.pctHhEmPlano == null ? 0 : (p.hhApontadas * p.pctHhEmPlano) / 100;
    return { rotulo: p.pessoa, detalhe: p.np, valor: p.hhApontadas, plano, fora: p.hhApontadas - plano };
  });
}
