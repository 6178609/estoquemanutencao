import { semanaIso } from "@/lib/wcm/planos";
import { dataBr, partes, type Dia } from "@/lib/wcm/util";

import { fimMes, inicioMes, segunda, type Condicao, type DiaTrabalho } from "./calendario";
import type { Ativo, GrupoCritico, HH, Marca, Parametros, ResultadoMotor, Turno } from "./tipos";
import type { LinhaSaldo, ResumoMes } from "./visoes";

/**
 * Calendário do mês (spec §7 V2): semanas de segunda a sábado; por dia o HH usado × capacidade e, por turno, os cartões
 * das paradas. Dias de outro mês vêm sem cartões (`doMes: false`); domingo não aparece.
 */

export interface Cartao { ativo: string; rotulo: string; marcas: Marca[]; hh: HH; alerta: boolean; grupo: GrupoCritico | null; campos: string[] }
export interface TurnoCalendario { t: Turno; janela: string; cartoes: Cartao[] }
export interface DiaCalendario {
  data: Dia; doMes: boolean; condicao: Condicao | "fora"; feriado?: string;
  hhDia: { mec: [number, number]; ele: [number, number] }; turnos: TurnoCalendario[];
}
export interface CalendarioMes { mes: string; semanas: { rotulo: string; dias: DiaCalendario[] }[]; resumo: ResumoMes | null }

export function calendarioDoMes(x: {
  mes: string; r: ResultadoMotor; dias: DiaTrabalho[]; ativos: Record<string, Ativo>; saldo: LinhaSaldo[]; resumo: ResumoMes[];
  alertas: { linhaId: string }[]; p: Parametros;
}): CalendarioMes {
  const { mes, p } = x;
  const comAlerta = new Set(x.alertas.map((a) => a.linhaId));
  const dt = new Map(x.dias.map((d) => [d.data, d]));
  const sd = new Map(x.saldo.map((s) => [s.data, s]));
  const porDiaTurno = new Map<string, ResultadoMotor["linhas"]>();
  for (const l of x.r.linhas) porDiaTurno.set(`${l.data}|${l.turno}`, [...(porDiaTurno.get(`${l.data}|${l.turno}`) ?? []), l]);
  const janela = (d: Dia, t: Turno) => {
    const c = partes(d).semana === 6 ? p.turnos.sabado : t === 1 ? p.turnos.t1 : p.turnos.t2;
    return `${c.inicio}–${c.fim}`;
  };
  const cartao = (l: ResultadoMotor["linhas"][number]): Cartao => ({
    ativo: l.ativo, marcas: l.marcas, hh: { ...l.hh }, alerta: comAlerta.has(l.id), grupo: l.grupo, campos: x.ativos[l.ativo]?.campos ?? l.campos,
    rotulo: l.parada === 3 ? `${l.ativo} (parada extra)` : l.paradasNoMes > 1 ? `${l.ativo} (parada ${l.parada}/${l.paradasNoMes})` : l.ativo,
  });
  const semanas: CalendarioMes["semanas"] = [];
  for (let seg = segunda(inicioMes(mes)), fim = fimMes(mes); seg <= fim; seg += 7) {
    const dias: DiaCalendario[] = [];
    for (let d = seg; d < seg + 6; d++) {
      const w = dt.get(d);
      const doMes = w?.mes === mes;
      const s = sd.get(d);
      const turnos: TurnoCalendario[] = !doMes || !w || (w.condicao !== "util" && w.condicao !== "sabado") ? []
        : (w.condicao === "util" ? [1, 2] as Turno[] : [1] as Turno[]).map((t) => ({
          t, janela: janela(d, t),
          cartoes: (porDiaTurno.get(`${d}|${t}`) ?? []).slice().sort((a, b) => (a.grupo ? 0 : 1) - (b.grupo ? 0 : 1) || (a.ativo < b.ativo ? -1 : 1)).map(cartao),
        }));
      const cap = w && doMes ? { mec: w.cap.t1.mec + w.cap.t2.mec, ele: w.cap.t1.ele + w.cap.t2.ele } : { mec: 0, ele: 0 };
      const usado = s && doMes ? { mec: s.t1.hh.mec + s.t2.hh.mec, ele: s.t1.hh.ele + s.t2.hh.ele } : { mec: 0, ele: 0 };
      dias.push({ data: d, doMes, condicao: doMes && w ? w.condicao : "fora", ...(doMes && w?.feriado ? { feriado: w.feriado } : {}),
        hhDia: { mec: [usado.mec, cap.mec], ele: [usado.ele, cap.ele] }, turnos });
    }
    if (!dias.some((d) => d.doMes)) continue; // a semana só tinha o domingo do mês
    semanas.push({ rotulo: `Semana ${String(semanaIso(seg).semana).padStart(2, "0")} · ${dataBr(seg).slice(0, 5)} a ${dataBr(seg + 5).slice(0, 5)}`, dias });
  }
  return { mes, semanas, resumo: x.resumo.find((r) => r.mes === mes) ?? null };
}
