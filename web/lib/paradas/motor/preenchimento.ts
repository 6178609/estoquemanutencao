import type { LinhaProgramacao, Turno } from "../tipos";
import { diasValidos, sabado, util, type Ctx } from "./comum";
import { TOL } from "./estado";

/**
 * Passo 6 (spec §5.3): nenhum turno vazio. Para cada turno vazio, em ordem cronológica, move para ele a parada de um
 * não crítico do mesmo mês que esteja num turno com outro ativo, sem quebrar nenhuma regra nem passar da capacidade.
 */
export function preencher(c: Ctx): void {
  const { est, p } = c;
  // paradas do mês com uma linha só (refeito só depois de um movimento)
  let unicas: LinhaProgramacao[] | null = null;
  const paradasUnicas = () => {
    if (!unicas) {
      const porParada = new Map<string, LinhaProgramacao[]>();
      for (const l of est.linhasDoAtivoDoMes(c.mes)) porParada.set(`${l.ativo}|${l.parada}`, [...(porParada.get(`${l.ativo}|${l.parada}`) ?? []), l]);
      unicas = [...porParada.values()].filter((ls) => ls.length === 1).map((ls) => ls[0]);
    }
    return unicas;
  };
  for (const d of diasValidos(c, (x) => util(x) || sabado(x))) {
    const turnos: Turno[] = util(d) ? [1, 2] : [1];
    for (const t of turnos) {
      if (est.ativosNoTurno(d.data, t).length) continue;
      const cands: LinhaProgramacao[] = [];
      for (const l of paradasUnicas()) {
        const A = c.ativos[l.ativo];
        if (!A || A.grupo != null || A.papel === "prensa" || l.data === d.data) continue;
        if (l.marcas.some((m) => m === "fixada" || m === "parada extra") || l.acima.mec > TOL || l.acima.ele > TOL) continue;
        if (sabado(d) && !A.soSabado && !p.tiposSabadoPreenchimento.includes(A.tipo)) continue;
        // a preferência pelo 1º turno junto do crítico não é desfeita
        if (A.preferenciaT1 && l.turno === 1 && est.grupoDoDia(l.data) != null) continue;
        if (est.ativosNoTurno(l.data, l.turno).length < 2) continue;
        if (est.falhas(l.ativo, c.mes, d.data, t === 1 ? "T1" : "T2", { hh: l.hh, ignorar: new Set([l.id]), parada: l.parada }).length) continue;
        cands.push(l);
      }
      if (!cands.length) continue;
      cands.sort((a, b) => est.ativosNoDia(b.data).length - est.ativosNoDia(a.data).length
        || (a.hh.mec + a.hh.ele) - (b.hh.mec + b.hh.ele) || a.data - b.data || (a.ativo < b.ativo ? -1 : 1));
      est.mover(cands[0].id, d.data, t, "preenchimento");
      unicas = null;
    }
  }
}
