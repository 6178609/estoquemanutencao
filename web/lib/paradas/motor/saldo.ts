import { segunda } from "../calendario";
import type { Marca } from "../tipos";
import { anotarSaldo, deixar, MOTIVO, pendentes, semanaDaPrimeira, type Ctx } from "./comum";
import { anexar, colocarCritico } from "./criticos";
import { encaixar, hhDe, TOL } from "./estado";
import { colocarNaoCritico, segueOutro } from "./naoCriticos";

/**
 * Passo 5 (saldo ≤ 4 h junto da parada; senão 2ª parada em semana posterior) e passo 7 (reavaliação dos que ficaram
 * sem HH) da spec §5.3.
 */

const moinhoSf = (c: Ctx, a: string) => c.ativos[a]?.papel === "moinho" && c.ativos[a]?.grupo != null;

/** R20: o saldo (MEC ≤ 4 e ELE ≤ 4) entra na parada já existente com mais folga, acima do limite. */
export function juntarEstouro(c: Ctx, ativo: string): boolean {
  const its = pendentes(c, ativo);
  if (!its.length) return false;
  const h = hhDe(its);
  if (h.mec > c.p.estouro.mec + TOL || h.ele > c.p.estouro.ele + TOL) return false;
  const A = c.ativos[ativo];
  let ls = c.est.linhasDoAtivo(c.mes, ativo);
  if (A.grupo || A.so1Turno) ls = ls.filter((l) => l.turno === 1).length ? ls.filter((l) => l.turno === 1) : ls;
  if (!ls.length) return false;
  const folga = (l: (typeof ls)[number]) => { const x = c.est.livre(l.data, l.turno); return x.mec + x.ele; };
  const l = ls.slice().sort((a, b) => folga(b) - folga(a) || a.data - b.data || a.turno - b.turno)[0];
  const livre = c.est.livre(l.data, l.turno);
  const acima = { mec: Math.max(0, h.mec - Math.max(0, livre.mec)), ele: Math.max(0, h.ele - Math.max(0, livre.ele)) };
  c.est.acrescentar(l.id, its, acima, acima.mec > TOL || acima.ele > TOL ? "estouro ≤4h" : undefined);
  deixar(c, ativo, []);
  return true;
}

/** Uma nova parada do ativo pelo procedimento do seu passo (2, 3 ou 4), em semana posterior à 1ª. */
export function novaParada(c: Ctx, ativo: string): boolean {
  const A = c.ativos[ativo];
  if (!A || moinhoSf(c, ativo)) return false;
  if (c.est.paradasDoAtivo(c.mes, ativo).filter((d) => !c.est.linhasDoAtivo(c.mes, ativo)
    .some((l) => l.data === d && l.marcas.includes("parada extra"))).length >= c.p.maxParadasMes) return false;
  if (c.est.numerosDeParada(c.mes, ativo).filter((n) => n <= 2).length >= 2) return false;
  const depois = semanaDaPrimeira(c, ativo);
  if (A.juntoCom && segueOutro(c, ativo)) {
    for (const d of c.est.paradasDoAtivo(c.mes, A.juntoCom)) {
      if (depois != null && segunda(d) <= depois) continue;
      if (anexar(c, ativo, d, [])) return true;
    }
    return false;
  }
  return A.grupo ? colocarCritico(c, ativo, depois) != null : colocarNaoCritico(c, ativo, depois);
}

export function motivoSemHh(c: Ctx, ativo: string): string {
  const A = c.ativos[ativo];
  if (A?.papel === "prensa") return MOTIVO.prensa;
  if (moinhoSf(c, ativo)) return MOTIVO.moinho;
  if (c.est.linhasDoAtivo(c.mes, ativo).some((l) => l.marcas.includes("parada extra"))) return MOTIVO.extra;
  return MOTIVO.demais;
}

/** Passo 5. Devolve os ativos que ainda ficaram com saldo (vão para Ativos sem HH, depois do passo 7). */
export function programarSaldo(c: Ctx): string[] {
  for (const a of c.pend.keys()) anotarSaldo(c, a);
  const sobra: string[] = [];
  for (let i = 0; i < c.ordemPend.length; i++) {
    const a = c.ordemPend[i];
    if (!pendentes(c, a).length) continue;
    if (juntarEstouro(c, a)) continue;
    novaParada(c, a);
    if (!pendentes(c, a).length || juntarEstouro(c, a)) continue;
    sobra.push(a);
  }
  const semPrensa = !c.est.linhasDoAtivoDoMes(c.mes).some((l) => c.ativos[l.ativo]?.papel === "prensa");
  if (semPrensa && sobra.some((a) => moinhoSf(c, a))) c.avisos.push(`${c.mes}: mês sem prensa — os moinhos SF ficaram em Ativos sem HH.`);
  return sobra;
}

/** Passo 7: o outro turno do mesmo dia de uma parada do ativo; senão nova parada em outra semana. */
export function reavaliar(c: Ctx, ativos: string[]): void {
  for (const a of ativos) {
    const A = c.ativos[a];
    if (!A || !pendentes(c, a).length) continue;
    for (const l of c.est.linhasDoAtivo(c.mes, a).slice().sort((x, y) => x.data - y.data || x.turno - y.turno)) {
      const its = pendentes(c, a);
      if (!its.length) break;
      const outro = l.turno === 1 ? 2 : 1;
      if (c.est.falhas(a, c.mes, l.data, outro === 1 ? "T1" : "T2", { ignorarCapacidade: true }).length) continue;
      const r = encaixar(its, c.est.livre(l.data, outro));
      if (!r.dentro.length || r.dentro.every((i) => i.hh <= TOL)) continue;
      const id = `${c.mes}|${a}|${l.parada}|${outro}`;
      if (c.est.linhas.has(id)) c.est.acrescentar(id, r.dentro, { mec: 0, ele: 0 });
      else {
        const marcas: Marca[] = [...new Set<Marca>([...l.marcas, "1º+2º turno"])];
        c.est.colocar(a, c.mes, l.data, outro, r.dentro, l.parada, marcas);
        if (!l.marcas.includes("1º+2º turno")) l.marcas.push("1º+2º turno");
      }
      deixar(c, a, r.fora);
    }
    if (pendentes(c, a).length) novaParada(c, a);
    if (pendentes(c, a).length) juntarEstouro(c, a);
  }
}
