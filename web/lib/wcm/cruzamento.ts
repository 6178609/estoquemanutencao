import {
  ancorarNotas, ancorarOrdens, marcarQuebras, quebrasDasOrdens, regraQuebra, tiposPorOrdem, type Confirmacao, type Equipamento,
  type Nota, type Operacao, type Ordem, type RegraQuebra,
} from "./preparo";
import type { Dia } from "./util";

/**
 * Cruzamentos entre as bases já preparadas (servidor e demonstração usam o mesmo caminho):
 * - data dos dados: o "hoje" dos indicadores é o último dia que as bases de ordens/apontamentos cobrem;
 * - quebras: notas marcadas pela regra em vigor e, sem nenhuma Y1 na IW28, as ordens YM11 sem nota;
 * - código ABC: o do IH08; sem ele, o da nota IW28 mais recente do equipamento.
 */

/**
 * Último dia coberto pelos exports de ordens e apontamentos: maior data de entrada das ordens (IW38), de lançamento
 * dos apontamentos (IW47) e de fim real das operações (IW38OP) — datas que só existem depois de acontecer (as datas-base
 * de início/fim podem estar no futuro). Nunca depois do calendário; sem nenhuma, o calendário.
 */
export function dataDosDados(ordens: Ordem[] | null, oper: Operacao[] | null, conf: Confirmacao[] | null, calendario: Dia): Dia {
  let max = -Infinity;
  for (const o of ordens ?? []) if (o.entrada != null && o.entrada > max) max = o.entrada;
  for (const c of conf ?? []) if (c.data != null && c.data > max) max = c.data;
  for (const o of oper ?? []) if (o.fimReal != null && o.fimReal > max) max = o.fimReal;
  return Number.isFinite(max) ? Math.min(max, calendario) : calendario;
}

/** Código ABC de cada equipamento pelas notas IW28: o da nota mais recente que traz o código (empate: maior nº de nota). */
export function abcDasNotas(notas: Nota[] | null): Map<string, string> {
  const melhor = new Map<string, { abc: string; data: number; nota: string }>();
  for (const n of notas ?? []) {
    const abc = n.codigoAbc.trim().toUpperCase();
    if (!abc || !n.equipamento) continue;
    const data = n.data ?? -Infinity;
    const atual = melhor.get(n.equipamento);
    if (!atual || data > atual.data || (data === atual.data && n.nota.localeCompare(atual.nota, undefined, { numeric: true }) > 0))
      melhor.set(n.equipamento, { abc, data, nota: n.nota });
  }
  return new Map([...melhor].map(([eq, x]) => [eq, x.abc]));
}

/** Equipamentos do IH08 com o ABC completado pelas notas onde o IH08 não traz (origemAbc diz de onde veio). */
export function completarAbc(equip: Equipamento[], notas: Nota[] | null): Equipamento[] {
  const daNota = abcDasNotas(notas);
  if (!daNota.size) return equip;
  return equip.map((e) => {
    if (e.codigoAbc) return e;
    const abc = daNota.get(e.equipamento);
    return abc ? { ...e, codigoAbc: abc, origemAbc: "IW28" as const } : e;
  });
}

export interface Cruzadas {
  hoje: Dia;
  regraQuebra: RegraQuebra;
  ordens: Ordem[] | null;
  notas: Nota[] | null;
  equipamentos: Equipamento[] | null;
  /** quebras pelas ordens YM11 sem nota (só na regra "ym11"; vazio na regra "y1") */
  quebrasOrdem: Nota[];
}

export function cruzarBases(x: { ordens: Ordem[] | null; notas: Nota[] | null; oper: Operacao[] | null; conf: Confirmacao[] | null;
  equipamentos: Equipamento[] | null; calendario: Dia }): Cruzadas {
  const hoje = dataDosDados(x.ordens, x.oper, x.conf, x.calendario);
  // as bases foram preparadas com o calendário: atraso e dias em aberto passam a contar até a data dos dados
  const ordens = x.ordens && hoje !== x.calendario ? ancorarOrdens(x.ordens, hoje) : x.ordens;
  const notasCruas = x.notas && hoje !== x.calendario ? ancorarNotas(x.notas, hoje) : x.notas;
  const regra = regraQuebra(notasCruas);
  const tipos = tiposPorOrdem(ordens ?? [], x.oper ?? [], x.conf ?? []);
  const notas = notasCruas ? marcarQuebras(notasCruas, tipos, regra) : null;
  const equipamentos = x.equipamentos ? completarAbc(x.equipamentos, notas) : null;
  const abc = new Map<string, string>([...abcDasNotas(notas), ...(x.equipamentos ?? []).filter((e) => e.codigoAbc).map((e) => [e.equipamento, e.codigoAbc] as const)]);
  const porEquip = new Map((x.equipamentos ?? []).map((e) => [e.equipamento, e] as const));
  // quebras vindas do IW38OP/IW47 não trazem área nem localização: completa pelo IH08 (senão somem no filtro de área)
  const quebrasOrdem = (regra === "ym11" ? quebrasDasOrdens(ordens ?? [], x.oper ?? [], x.conf ?? [], notas, abc, hoje) : []).map((q) => {
    const e = porEquip.get(q.equipamento);
    return e && (!q.local || !q.localizacao) ? { ...q, local: q.local || e.local, localizacao: q.localizacao || e.localizacao } : q;
  });
  return { hoje, regraQuebra: regra, ordens, notas, equipamentos, quebrasOrdem };
}
