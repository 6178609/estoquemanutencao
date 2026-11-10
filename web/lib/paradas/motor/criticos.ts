import type { Dia } from "@/lib/wcm/util";

import type { DiaTrabalho } from "../calendario";
import type { GrupoCritico, ItemPlano, Parametros } from "../tipos";
import { anotarSaldo, deixar, diasValidos, pendentes, porPrimeiraData, proximaParada, util, type Ctx } from "./comum";
import { encaixar, hhDe } from "./estado";

/**
 * Passo 2 — máquinas críticas (spec §5.3): no dia da semana do grupo (padrão semanal), inteiras no 1º turno; senão
 * qualquer dia útil ("fora do dia padrão"); senão o que couber no 1º candidato do padrão. A prensa leva o moinho SF
 * da vez no mesmo dia; o Banbury leva os seus "juntos".
 */

const doPadrao = (p: Parametros, g: GrupoCritico | null) => (d: DiaTrabalho) =>
  util(d) && g != null && (p.padraoSemanal[d.diaSemana as 1] ?? []).includes(g);

/** Coloca a parada de um crítico (1ª ou, com `depoisDe`, 2ª). Devolve o dia (ou null). */
export function colocarCritico(c: Ctx, ativo: string, depoisDe: Dia | null = null): Dia | null {
  const A = c.ativos[ativo];
  const itens = pendentes(c, ativo);
  if (!A || !itens.length) return null;
  const hh = hhDe(itens);
  const parada = proximaParada(c, ativo);
  const ok = (d: Dia, cap: boolean) => c.est.falhas(ativo, c.mes, d, "T1", { hh, ignorarCapacidade: !cap }).length === 0;
  const padrao = diasValidos(c, doPadrao(c.p, A.grupo), depoisDe);
  // 2b
  let d = padrao.find((x) => ok(x.data, true));
  if (d) { c.est.colocar(ativo, c.mes, d.data, 1, itens, parada, []); deixar(c, ativo, []); return depois(c, ativo, d.data); }
  // 2c
  d = diasValidos(c, util, depoisDe).find((x) => ok(x.data, true));
  if (d) {
    c.est.colocar(ativo, c.mes, d.data, 1, itens, parada, ["fora do dia padrão"]);
    deixar(c, ativo, []);
    return depois(c, ativo, d.data);
  }
  // 2d: o que couber no 1º candidato do padrão (ou, sem nenhum, no 1º dia útil) que passe nas regras
  for (const x of [...padrao, ...diasValidos(c, (y) => util(y) && !doPadrao(c.p, A.grupo)(y), depoisDe)]) {
    if (!ok(x.data, false)) continue;
    const r = encaixar(itens, c.est.livre(x.data, 1));
    if (!r.dentro.length) continue;
    c.est.colocar(ativo, c.mes, x.data, 1, r.dentro, parada, padrao.includes(x) ? [] : ["fora do dia padrão"]);
    deixar(c, ativo, r.fora);
    anotarSaldo(c, ativo);
    return depois(c, ativo, x.data);
  }
  anotarSaldo(c, ativo);
  return null;
}

/** Depois da prensa, o moinho SF; depois do Banbury, os juntos. */
function depois(c: Ctx, ativo: string, d: Dia): Dia {
  const A = c.ativos[ativo];
  if (A.papel === "prensa") anexarMoinho(c, d);
  for (const j of c.p.juntos) if (j.com === ativo) anexar(c, j.ativo, d, []);
  return d;
}

export function anexar(c: Ctx, ativo: string, d: Dia, marcas: ("semana da prensa")[]): boolean {
  const itens = pendentes(c, ativo);
  if (!itens.length || !c.ativos[ativo]) return false;
  if (c.est.paradasDoAtivo(c.mes, ativo).length >= c.p.maxParadasMes) return false;
  if (c.est.falhas(ativo, c.mes, d, "T1", { ignorarCapacidade: true }).length) return false;
  const r = encaixar(itens, c.est.livre(d, 1));
  if (!r.dentro.length) return false;
  c.est.colocar(ativo, c.mes, d, 1, r.dentro, proximaParada(c, ativo), marcas);
  deixar(c, ativo, r.fora);
  anotarSaldo(c, ativo);
  return true;
}

/** O moinho SF da vez: o que já começou no mês e tem saldo; senão o próximo do rodízio com demanda pendente. */
export function anexarMoinho(c: Ctx, d: Dia): void {
  const rod = c.p.rodizioMoinhos;
  const ehSf = (n: string) => c.ativos[n]?.papel === "moinho" && c.ativos[n]?.grupo != null;
  for (const n of rod) {
    if (ehSf(n) && pendentes(c, n).length && c.est.paradasDoAtivo(c.mes, n).length && anexar(c, n, d, ["semana da prensa"])) return;
  }
  for (let k = 1; k <= rod.length; k++) {
    const i = (c.rodizio.ultimo + k) % rod.length;
    const n = rod[i];
    if (!ehSf(n) || !pendentes(c, n).length || c.est.paradasDoAtivo(c.mes, n).length) continue;
    if (anexar(c, n, d, ["semana da prensa"])) { c.rodizio.ultimo = i; return; }
  }
}

/** Passo 2 inteiro. Devolve os itens pendentes por ativo (os de todos os ativos do mês). */
export function programarCriticos(c: Ctx): Map<string, ItemPlano[]> {
  const { p, mes } = c;
  for (const g of p.ordemCriticos) {
    const lista = [...c.pend.keys()].filter((a) => {
      const A = c.ativos[a];
      return A && A.grupo === g && (g !== "PRENSA/MOINHO SF" || A.papel === "prensa");
    });
    for (const a of porPrimeiraData(c, lista)) {
      // ativo já com parada (fixada): o saldo vai para o passo 5
      if (c.est.paradasDoAtivo(mes, a).length) { anotarSaldo(c, a); continue; }
      colocarCritico(c, a);
    }
  }
  return c.pend;
}
