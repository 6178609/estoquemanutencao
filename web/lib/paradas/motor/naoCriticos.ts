import type { Dia } from "@/lib/wcm/util";

import type { DiaTrabalho } from "../calendario";
import type { Marca } from "../tipos";
import {
  anotarSaldo, colocarModo, deixar, diasValidos, hhTotal, livreModo, pendentes, proximaParada, sabado, util, type Ctx,
} from "./comum";
import { hhDe, type ModoTurno } from "./estado";

/**
 * Passos 3 (só sábado) e 4 (não críticos) da spec §5.3. Os dois escolhem, dentro da janela, o dia menos carregado
 * em que a demanda inteira cabe; senão qualquer dia do mês ("antecipado" antes da 1ª data); senão o que couber no dia
 * com mais HH livre (o resto vai para o passo 5).
 */

interface Modo { modo: ModoTurno; filtro?: (d: DiaTrabalho) => boolean; preferirVazio?: boolean }

const livreDia = (c: Ctx, d: Dia) => {
  const a = c.est.livre(d, 1), b = c.est.livre(d, 2);
  return a.mec + a.ele + b.mec + b.ele;
};

/** O dia menos carregado (menos ativos; empate: mais HH livre; empate: mais cedo) em que tudo cabe e as regras valem. */
function escolher(c: Ctx, ativo: string, dias: DiaTrabalho[], m: Modo): DiaTrabalho | null {
  const hh = hhDe(pendentes(c, ativo));
  let cands = dias.filter((d) => (!m.filtro || m.filtro(d)) && c.est.falhas(ativo, c.mes, d.data, m.modo, { hh }).length === 0);
  if (m.preferirVazio) {
    const vazios = cands.filter((d) => c.est.ativosNoTurno(d.data, 2).length === 0);
    if (vazios.length) cands = vazios;
  }
  let melhor: DiaTrabalho | null = null;
  for (const d of cands) {
    if (!melhor) { melhor = d; continue; }
    const na = c.est.ativosNoDia(d.data).length, nb = c.est.ativosNoDia(melhor.data).length;
    if (na < nb || (na === nb && livreDia(c, d.data) > livreDia(c, melhor.data) + 1e-9)) melhor = d;
  }
  return melhor;
}

export function modosDe(c: Ctx, ativo: string): Modo[] {
  const A = c.ativos[ativo];
  if (A.so1Turno || A.soSabado) return [{ modo: "T1" }];
  if (A.preferenciaT1) {
    return [{ modo: "T1", filtro: (d) => c.est.grupoDoDia(d.data) != null }, { modo: "T1", filtro: (d) => c.est.grupoDoDia(d.data) == null },
      { modo: "T2" }, { modo: "T2+T1" }];
  }
  return [{ modo: "T2", preferirVazio: true }, { modo: "T2+T1" }, { modo: "T1" }];
}

/**
 * Coloca uma parada do ativo (não crítico ou só sábado). Com `depoisDe`, é a 2ª parada: só semanas posteriores, sem a
 * janela da 1ª data. Devolve true se colocou alguma coisa.
 */
export function colocarNaoCritico(c: Ctx, ativo: string, depoisDe: Dia | null = null): boolean {
  const A = c.ativos[ativo];
  const itens = pendentes(c, ativo);
  const dem = c.demandas.get(ativo);
  if (!A || !itens.length) return false;
  const primeira = dem?.primeiraData ?? c.inicio;
  const parada = proximaParada(c, ativo);
  const tipoDia = A.soSabado ? sabado : (d: DiaTrabalho) => util(d) || sabado(d);
  const todos = diasValidos(c, tipoDia, depoisDe);
  const ini = depoisDe == null ? Math.max(c.inicio, primeira - c.p.antecipacaoDias) : -Infinity;
  const janela = todos.filter((d) => d.data >= ini);
  const modos = modosDe(c, ativo);
  // 4c e 4d
  for (const [dias, fora] of [[janela, false], [todos, true]] as const) {
    for (const m of modos) {
      const d = escolher(c, ativo, dias, m);
      if (!d) continue;
      const marcas: Marca[] = fora && d.data < primeira && depoisDe == null ? ["antecipado"] : [];
      colocarModo(c, ativo, d.data, m.modo, itens, parada, marcas);
      deixar(c, ativo, []);
      return true;
    }
  }
  // 4e: o que couber no dia com mais HH livre
  const modo: ModoTurno = A.so1Turno || A.soSabado ? "T1" : "T2+T1";
  const cands = todos.filter((d) => (modo === "T1" || util(d)) && c.est.falhas(ativo, c.mes, d.data, modo, { ignorarCapacidade: true }).length === 0)
    .map((d) => { const l = livreModo(c, d.data, modo); return { d, livre: l.mec + l.ele }; })
    .sort((a, b) => b.livre - a.livre || a.d.data - b.d.data);
  for (const { d } of cands) {
    const r = colocarModo(c, ativo, d.data, modo, itens, parada, d.data < primeira && depoisDe == null ? ["antecipado"] : []);
    if (!r.linhas.length) continue;
    deixar(c, ativo, r.fora);
    anotarSaldo(c, ativo);
    return true;
  }
  anotarSaldo(c, ativo);
  return false;
}

/** Ativos do passo 4, por (1ª data, HH decrescente, nome). */
function ordemPasso4(c: Ctx, lista: string[]): string[] {
  return lista.slice().sort((a, b) => (c.demandas.get(a)?.primeiraData ?? 0) - (c.demandas.get(b)?.primeiraData ?? 0)
    || hhTotal(pendentes(c, b)) - hhTotal(pendentes(c, a)) || (a < b ? -1 : a > b ? 1 : 0));
}

/** O ativo segue com outro (MOINHO 04 com o BANBURY) e o outro tem demanda no mês. */
export const segueOutro = (c: Ctx, ativo: string) => {
  const j = c.ativos[ativo]?.juntoCom;
  return !!j && c.est.comDemanda.has(`${c.mes}|${j}`);
};

export function programarSabado(c: Ctx): void {
  const lista = [...c.pend.keys()].filter((a) => c.ativos[a]?.soSabado);
  for (const a of ordemPasso4(c, lista)) {
    if (c.est.paradasDoAtivo(c.mes, a).length) { anotarSaldo(c, a); continue; }
    colocarNaoCritico(c, a);
  }
}

export function programarNaoCriticos(c: Ctx): void {
  const lista = [...c.pend.keys()].filter((a) => {
    const A = c.ativos[a];
    return A && A.grupo == null && !A.soSabado && A.papel !== "prensa" && !segueOutro(c, a);
  });
  for (const a of ordemPasso4(c, lista)) {
    if (c.est.paradasDoAtivo(c.mes, a).length) { anotarSaldo(c, a); continue; }
    colocarNaoCritico(c, a);
  }
}
