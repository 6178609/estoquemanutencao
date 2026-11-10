import type { Crua, Equipamento, Operacao, Ordem } from "@/lib/wcm/preparo";
import type { Dia } from "@/lib/wcm/util";

import { demandas, montarAtivos } from "./ativos";
import { diaDeIso, fimMes, mesesDoHorizonte, type DiaTrabalho } from "./calendario";
import { completarHh } from "./completar";
import { conferir, type Conferencia } from "./conferencias";
import { itensDaIp19, type LeituraIp19 } from "./leitura";
import { diasDaEntrada, programar } from "./motor";
import { parametrosDe } from "./parametros";
import { alertas, type Alerta } from "./regras";
import type { EntradaMotor, Fixacao, HH, OrigemHh, ResultadoMotor } from "./tipos";
import { resumoPorMes, saldoPorDia, type LinhaSaldo, type ResumoMes } from "./visoes";

/**
 * Montagem pura: bases já lidas + cadastro → entrada do motor (leitura → completar → ativos → demanda) e o cálculo
 * completo (motor, alertas, visões e conferências). Usada no servidor e, na parte 3, no cliente.
 */

type Cadastro = Record<string, Record<string, unknown>>;

export interface ForaDasClasses { ativo: string; denominacao: string; campos: string[]; equipamentos: string[]; hh: HH; itens: number }
export interface Montado {
  entrada: EntradaMotor; leitura: LeituraIp19; completadas: Record<OrigemHh, number>; avisos: string[];
  /** ativos sem classe (com `soClasses`): ficam fora do calendário, só listados */
  foraDasClasses: ForaDasClasses[];
}

function fixacoesDe(cad: Cadastro | null): Fixacao[] {
  const out: Fixacao[] = [];
  for (const [k, v] of Object.entries(cad ?? {})) {
    if (!k.startsWith("fixacao:") || !v || typeof v !== "object") continue;
    const f = v as Record<string, unknown>;
    const data = typeof f.data === "number" ? f.data : typeof f.data === "string" ? diaDeIso(f.data) : null;
    const turno = f.turno === 1 || f.turno === 2 || f.turno === "1+2" ? f.turno : null;
    const parada = f.parada === 1 || f.parada === 2 ? f.parada : null;
    if (data == null || turno == null || parada == null || typeof f.mes !== "string" || typeof f.ativo !== "string") continue;
    out.push({ id: k.slice("fixacao:".length), mes: f.mes, ativo: f.ativo, parada, data, turno, ...(f.extra ? { extra: true } : {}) });
  }
  return out.sort((a, b) => (a.id < b.id ? -1 : 1));
}

export function montarEntrada(x: {
  ip19: Crua[] | null; ordens: Ordem[] | null; ops: Operacao[] | null; eqs: Equipamento[] | null;
  campoGeral: (eq: string) => string; cad: Cadastro | null; hoje: Dia; demo?: boolean;
}): Montado {
  const { p, avisos } = parametrosDe(x.cad);
  const inicio = (p.inicio ? diaDeIso(p.inicio) : null) ?? x.hoje;
  const meses = mesesDoHorizonte(inicio, p.meses);
  const fim = fimMes(meses[meses.length - 1]);
  const eqs = new Map((x.eqs ?? []).map((e) => [e.equipamento, e]));
  const leitura = itensDaIp19(x.ip19 ?? [], p, eqs, new Set(meses), { qualquerCentro: x.demo });
  const { itens, completadas } = completarHh(leitura.itens, x.ordens ?? [], x.ops ?? [], p);
  const m = montarAtivos(itens, eqs, x.campoGeral, p);
  let dem = demandas(m.itens);
  const foraDasClasses: ForaDasClasses[] = [];
  if (p.soClasses) {
    const fora = new Map<string, ForaDasClasses>();
    for (const d of dem) {
      const a = m.ativos[d.ativo];
      if (!a?.semClasse) continue;
      const x = fora.get(d.ativo) ?? { ativo: d.ativo, denominacao: a.denominacao, campos: a.campos, equipamentos: a.equipamentos, hh: { mec: 0, ele: 0 }, itens: 0 };
      x.hh = { mec: x.hh.mec + d.hh.mec, ele: x.hh.ele + d.hh.ele };
      x.itens += d.itens.length;
      fora.set(d.ativo, x);
    }
    dem = dem.filter((d) => !m.ativos[d.ativo]?.semClasse);
    foraDasClasses.push(...[...fora.values()].sort((a, b) => (a.ativo < b.ativo ? -1 : 1)));
  }
  const entrada: EntradaMotor = { demandas: dem, ativos: m.ativos, parametros: p, inicio, fim, fixacoes: fixacoesDe(x.cad),
    ocupacaoAnterior: [] };
  const todos = [...avisos, ...m.avisos];
  if (completadas["sem-hh"]) todos.push(`${completadas["sem-hh"]} chamada(s) da IP19 sem operação e sem ordem/plano anterior para completar o HH.`);
  return { entrada, leitura, completadas, avisos: todos, foraDasClasses };
}

export interface Calculo {
  r: ResultadoMotor; dias: DiaTrabalho[]; alertas: Alerta[]; saldo: LinhaSaldo[]; resumo: ResumoMes[]; conferencias: Conferencia[];
}

export function calcular(entrada: EntradaMotor): Calculo {
  const r = programar(entrada);
  const dias = diasDaEntrada(entrada);
  const al = alertas(r.linhas, entrada);
  const saldo = saldoPorDia(r, dias, entrada.ativos, null, undefined, entrada.parametros);
  const resumo = resumoPorMes(entrada.demandas, r, saldo);
  return { r, dias, alertas: al, saldo, resumo, conferencias: conferir({ e: entrada, r, dias, saldo, resumo, alertas: al }) };
}
