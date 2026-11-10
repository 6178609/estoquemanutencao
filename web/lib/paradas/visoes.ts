import { semanaIso } from "@/lib/wcm/planos";
import type { Dia } from "@/lib/wcm/util";

import { NOME_DIA, type Condicao, type DiaTrabalho } from "./calendario";
import { PARAMETROS_PADRAO } from "./parametros";
import type { AlocacaoBacklog, Ativo, Demanda, HH, Parametros, ResultadoMotor } from "./tipos";

/**
 * Visões da programação (spec §7), todas a partir do mesmo resultado do motor: Saldo HH por dia, resumo por mês,
 * campos de ordenação por dia e Ativos sem HH.
 */

export interface TurnoDoDia { ativos: { ativo: string; hh: HH; campos: string[] }[]; cap: HH; hh: HH; saldo: HH }
export interface LinhaSaldo {
  data: Dia; dia: string; condicao: Condicao; feriado?: string; t1: TurnoDoDia; t2: TurnoDoDia;
  backlog: HH /* saldo p/ backlog */; total: number; situacao: string; acima: HH; iw38?: HH; manual?: HH; final?: HH;
}
export interface ResumoMes {
  mes: string; carga: HH; capacidade: HH; programado: HH; saldo: HH; backlog: HH; semHh: HH; uso: HH /* 0..1 */;
  iw38?: HH; manual?: HH; final?: HH;
}

const zero = (): HH => ({ mec: 0, ele: 0 });
const mais = (a: HH, b: HH): HH => ({ mec: a.mec + b.mec, ele: a.ele + b.ele });
const menos = (a: HH, b: HH): HH => ({ mec: a.mec - b.mec, ele: a.ele - b.ele });
const pos = (a: HH): HH => ({ mec: Math.max(0, a.mec), ele: Math.max(0, a.ele) });

export function situacaoDoDia(d: DiaTrabalho, p: Parametros = PARAMETROS_PADRAO): string {
  switch (d.condicao) {
    case "feriado": return `Feriado – ${d.feriado ?? ""}`.trim();
    case "sabado": return `Sábado (${p.turnos.sabado.inicio} às ${p.turnos.sabado.fim})`;
    case "util": return "Dia útil";
    case "antes": return "Antes do início";
    default: return "Sem atuação";
  }
}

export function saldoPorDia(r: ResultadoMotor, dias: DiaTrabalho[], ativos: Record<string, Ativo>, aloc?: AlocacaoBacklog | null,
  manual?: Map<Dia, HH>, p: Parametros = PARAMETROS_PADRAO): LinhaSaldo[] {
  const porDia = new Map<Dia, ResultadoMotor["linhas"]>();
  for (const l of r.linhas) porDia.set(l.data, [...(porDia.get(l.data) ?? []), l]);
  return dias.map((d) => {
    const ls = porDia.get(d.data) ?? [];
    const turno = (t: 1 | 2, cap: HH): TurnoDoDia => {
      const m = new Map<string, { ativo: string; hh: HH; campos: string[] }>();
      for (const l of ls.filter((x) => x.turno === t)) {
        const a = m.get(l.ativo) ?? { ativo: l.ativo, hh: zero(), campos: l.campos };
        a.hh = mais(a.hh, l.hh);
        m.set(l.ativo, a);
      }
      const lista = [...m.values()].sort((a, b) => (a.ativo < b.ativo ? -1 : 1));
      const hh = lista.reduce((s, a) => mais(s, a.hh), zero());
      return { ativos: lista, cap: { ...cap }, hh, saldo: menos(cap, hh) };
    };
    const t1 = turno(1, d.cap.t1), t2 = turno(2, d.cap.t2);
    const dryBlend = t1.ativos.some((a) => ativos[a.ativo]?.exclusivoT1);
    const backlog = mais(dryBlend ? zero() : pos(t1.saldo), pos(t2.saldo));
    const acima = ls.reduce((s, l) => mais(s, l.acima), zero());
    const linha: LinhaSaldo = {
      data: d.data, dia: NOME_DIA[d.diaSemana], condicao: d.condicao, ...(d.feriado ? { feriado: d.feriado } : {}), t1, t2, backlog,
      total: backlog.mec + backlog.ele, situacao: situacaoDoDia(d, p), acima,
    };
    if (aloc || manual) {
      const x = aloc?.porDia[String(d.data)];
      linha.iw38 = x ? mais(x.t1, x.t2) : zero();
      linha.manual = manual?.get(d.data) ?? zero();
      linha.final = menos(menos(backlog, linha.iw38), linha.manual);
    }
    return linha;
  });
}

export function resumoPorMes(demandas: Demanda[], r: ResultadoMotor, saldo: LinhaSaldo[]): ResumoMes[] {
  const meses = new Map<string, ResumoMes>();
  const de = (mes: string) => {
    let x = meses.get(mes);
    if (!x) {
      x = { mes, carga: zero(), capacidade: zero(), programado: zero(), saldo: zero(), backlog: zero(), semHh: zero(), uso: zero() };
      meses.set(mes, x);
    }
    return x;
  };
  const retirado = new Set(r.retirados.map((x) => `${x.mes}|${x.ativo}`));
  for (const d of demandas) if (!retirado.has(`${d.mes}|${d.ativo}`)) de(d.mes).carga = mais(de(d.mes).carga, d.hh);
  for (const s of r.semHh) de(s.mes).semHh = mais(de(s.mes).semHh, s.hh);
  for (const l of saldo) {
    const x = de(mesDe(l.data));
    x.capacidade = mais(x.capacidade, mais(l.t1.cap, l.t2.cap));
    x.programado = mais(x.programado, mais(l.t1.hh, l.t2.hh));
    x.backlog = mais(x.backlog, l.backlog);
    if (l.final) {
      x.iw38 = mais(x.iw38 ?? zero(), l.iw38!);
      x.manual = mais(x.manual ?? zero(), l.manual!);
      x.final = mais(x.final ?? zero(), l.final);
    }
  }
  for (const x of meses.values()) {
    x.saldo = menos(x.capacidade, x.carga);
    x.uso = { mec: x.capacidade.mec ? x.programado.mec / x.capacidade.mec : 0, ele: x.capacidade.ele ? x.programado.ele / x.capacidade.ele : 0 };
  }
  return [...meses.values()].sort((a, b) => (a.mes < b.mes ? -1 : 1));
}

function mesDe(d: Dia): string {
  const x = new Date(d * 86_400_000);
  return `${x.getUTCFullYear()}-${String(x.getUTCMonth() + 1).padStart(2, "0")}`;
}

export interface CamposDoDia { data: Dia; dia: string; semana: number; situacao: string; maquinas: number; t1: string[]; t2: string[]; lista: string }

export function camposPorDia(r: ResultadoMotor, dias: DiaTrabalho[], ativos: Record<string, Ativo>, p: Parametros = PARAMETROS_PADRAO): CamposDoDia[] {
  const porDia = new Map<Dia, ResultadoMotor["linhas"]>();
  for (const l of r.linhas) porDia.set(l.data, [...(porDia.get(l.data) ?? []), l]);
  const dt = new Map(dias.map((d) => [d.data, d]));
  return [...porDia.keys()].sort((a, b) => a - b).map((data) => {
    const ls = porDia.get(data)!;
    const campos = (a: string, l: { campos: string[] }) => (ativos[a]?.campos ?? l.campos);
    const rot = (t: 1 | 2) => [...new Map(ls.filter((l) => l.turno === t).map((l) => [l.ativo, `${l.ativo} · ${campos(l.ativo, l).join(", ")}`])).values()].sort();
    const lista = [...new Set(ls.flatMap((l) => campos(l.ativo, l)))].join("; ");
    const d = dt.get(data);
    const ds = new Date(data * 86_400_000).getUTCDay();
    return { data, dia: NOME_DIA[ds], semana: semanaIso(data).semana, situacao: d ? situacaoDoDia(d, p) : "Fora do horizonte",
      maquinas: new Set(ls.map((l) => l.ativo)).size, t1: rot(1), t2: rot(2), lista };
  });
}

export interface LinhaSemHh {
  ativo: string; campos: string[]; equipamentos: string[]; mes: string; primeiraData: Dia; hh: HH; total: number; itens: number; motivo: string;
}

export function ativosSemHh(r: ResultadoMotor, ativos: Record<string, Ativo>): LinhaSemHh[] {
  return r.semHh.map((s) => ({
    ativo: s.ativo, campos: ativos[s.ativo]?.campos ?? [], equipamentos: ativos[s.ativo]?.equipamentos ?? [], mes: s.mes,
    primeiraData: s.primeiraData, hh: { ...s.hh }, total: s.hh.mec + s.hh.ele, itens: s.itens.length, motivo: s.motivo,
  })).sort((a, b) => (a.mes < b.mes ? -1 : a.mes > b.mes ? 1 : a.ativo < b.ativo ? -1 : a.ativo > b.ativo ? 1 : 0));
}
