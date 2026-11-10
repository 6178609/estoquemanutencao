import { somarMeses, type Dia } from "@/lib/wcm/util";

import { chaveMes, diasDoMes, inicioMes, type DiaTrabalho } from "../calendario";
import type { EntradaMotor, LinhaProgramacao, Retirado, ResultadoMotor } from "../tipos";
import { pendentes, type Ctx } from "./comum";
import { programarCriticos } from "./criticos";
import { Estado, hhDe } from "./estado";

/**
 * Motor de regras (spec §5): puro e determinístico. Recebe as demandas por ativo e mês e devolve a programação dia ×
 * turno, os ativos sem HH, os retirados e os avisos.
 */

export function mesesDaEntrada(e: EntradaMotor): string[] {
  const out: string[] = [];
  for (let d = inicioMes(chaveMes(e.inicio)); d <= e.fim; d = somarMeses(d, 1)) out.push(chaveMes(d));
  return out;
}

export function diasDaEntrada(e: EntradaMotor): DiaTrabalho[] {
  return mesesDaEntrada(e).flatMap((m) => diasDoMes(m, e.parametros, e.inicio)).filter((d) => d.data <= e.fim);
}

const fmt = (n: number) => String(n).replace(".", ",");
const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

export function ordenarLinhas(ls: LinhaProgramacao[]): LinhaProgramacao[] {
  return ls.slice().sort((a, b) => a.data - b.data || a.turno - b.turno || (a.grupo ? 0 : 1) - (b.grupo ? 0 : 1) || cmp(a.ativo, b.ativo));
}

export function programar(e: EntradaMotor): ResultadoMotor {
  const p = e.parametros;
  const dias = diasDaEntrada(e);
  const retirados: Retirado[] = [];
  const ativas = e.demandas.filter((d) => {
    const A = e.ativos[d.ativo];
    if (A && p.hhIrrelevante.tipos.includes(A.tipo) && d.hh.mec + d.hh.ele <= p.hhIrrelevante.limite + 1e-6) {
      retirados.push({ mes: d.mes, ativo: d.ativo, hh: { ...d.hh },
        motivo: `Só inspeção rápida (HH do mês ≤ ${fmt(p.hhIrrelevante.limite)} h): fora da programação` });
      return false;
    }
    return true;
  });
  const est = new Estado(dias, e.ativos, p, e.ocupacaoAnterior, ativas.map((d) => `${d.mes}|${d.ativo}`));
  const out: ResultadoMotor = { linhas: [], semHh: [], retirados, fixacoesOrfas: [], avisos: [] };
  const rodizio = { ultimo: -1 };
  for (const mes of mesesDaEntrada(e)) {
    const doMes = ativas.filter((d) => d.mes === mes && e.ativos[d.ativo]);
    const c: Ctx = {
      est, p, ativos: e.ativos, inicio: e.inicio, mes, diasMes: dias.filter((d) => d.mes === mes),
      demandas: new Map(doMes.map((d) => [d.ativo, d])), pend: new Map(doMes.map((d) => [d.ativo, d.itens.slice()])),
      ordemPend: [], semHh: out.semHh, avisos: out.avisos, rodizio,
    };
    programarCriticos(c);
    for (const [ativo] of c.pend) {
      const its = pendentes(c, ativo);
      const d0 = c.demandas.get(ativo)!;
      out.semHh.push({ mes, ativo, hh: hhDe(its), itens: its.map((i) => i.chave), primeiraData: d0.primeiraData as Dia, motivo: "pendente" });
    }
  }
  out.linhas = finalizar([...est.linhas.values()]);
  return out;
}

/** Ordena e preenche "parada n de m". */
export function finalizar(ls: LinhaProgramacao[]): LinhaProgramacao[] {
  const n = new Map<string, Set<number>>();
  for (const l of ls) if (!l.marcas.includes("parada extra")) {
    const k = `${l.mes}|${l.ativo}`;
    n.set(k, (n.get(k) ?? new Set()).add(l.parada));
  }
  return ordenarLinhas(ls.map((l) => ({ ...l, itens: l.itens.slice(), marcas: l.marcas.slice(),
    paradasNoMes: Math.max(n.get(`${l.mes}|${l.ativo}`)?.size ?? 0, l.parada) })));
}
