import { semanaIso } from "@/lib/wcm/planos";
import { dia, partes, somarMeses, type Dia } from "@/lib/wcm/util";

import { capTurno } from "./parametros";
import type { HH, Parametros } from "./tipos";

/**
 * Calendário de trabalho (spec §4): condição de cada dia (útil, sábado, domingo, feriado, antes do início) e a
 * capacidade de cada turno pelos parâmetros.
 */

export type Condicao = "util" | "sabado" | "domingo" | "feriado" | "antes";
export interface DiaTrabalho {
  data: Dia; condicao: Condicao; feriado?: string; semana: string /* "2026-W46" */; diaSemana: number /* 0 dom..6 sáb */;
  mes: string; cap: { t1: HH; t2: HH };
}

export const NOME_DIA = ["DOM", "SEG", "TER", "QUA", "QUI", "SEX", "SÁB"];
const ZERO: HH = { mec: 0, ele: 0 };

const p2 = (n: number) => String(n).padStart(2, "0");

export function chaveMes(d: Dia): string {
  const x = partes(d);
  return `${x.ano}-${p2(x.mes)}`;
}

export function chaveSemana(d: Dia): string {
  const s = semanaIso(d);
  return `${s.ano}-W${p2(s.semana)}`;
}

export function diaDeIso(s: string): Dia | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s ?? "");
  return m ? dia(Number(m[1]), Number(m[2]), Number(m[3])) : null;
}

export function isoDe(d: Dia): string {
  const x = partes(d);
  return `${x.ano}-${p2(x.mes)}-${p2(x.dia)}`;
}

/** Primeiro dia do mês "AAAA-MM". */
export function inicioMes(mes: string): Dia {
  return diaDeIso(`${mes}-01`)!;
}

export function fimMes(mes: string): Dia {
  return somarMeses(inicioMes(mes), 1) - 1;
}

export function diasDoMes(mes: string, p: Parametros, inicio: Dia): DiaTrabalho[] {
  const feriados = new Map(p.feriados.map((f) => [f.data, f.nome]));
  const capT1 = capTurno(p.turnos.t1), capT2 = capTurno(p.turnos.t2), capSab = capTurno(p.turnos.sabado);
  const out: DiaTrabalho[] = [];
  for (let d = inicioMes(mes), f = fimMes(mes); d <= f; d++) {
    const ds = partes(d).semana;
    const feriado = feriados.get(isoDe(d));
    let condicao: Condicao;
    if (ds === 0) condicao = "domingo";
    else if (d < inicio) condicao = "antes";
    else if (feriado != null) condicao = "feriado";
    else if (ds === 6) condicao = "sabado";
    else condicao = "util";
    const cap = condicao === "util" ? { t1: { ...capT1 }, t2: { ...capT2 } }
      : condicao === "sabado" ? { t1: { ...capSab }, t2: { ...ZERO } } : { t1: { ...ZERO }, t2: { ...ZERO } };
    out.push({ data: d, condicao, ...(feriado != null && condicao === "feriado" ? { feriado } : {}), semana: chaveSemana(d),
      diaSemana: ds, mes, cap });
  }
  return out;
}

export function mesesDoHorizonte(inicio: Dia, meses: number): string[] {
  const out: string[] = [];
  for (let i = 0; i < meses; i++) out.push(chaveMes(somarMeses(inicio, i)));
  return out;
}

export function capacidadeDoMes(dias: DiaTrabalho[]): HH {
  const r = { mec: 0, ele: 0 };
  for (const d of dias) {
    r.mec += d.cap.t1.mec + d.cap.t2.mec;
    r.ele += d.cap.t1.ele + d.cap.t2.ele;
  }
  return r;
}
