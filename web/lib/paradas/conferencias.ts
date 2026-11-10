import { dataBr, type Dia } from "@/lib/wcm/util";

import type { DiaTrabalho } from "./calendario";
import { capTurno } from "./parametros";
import type { Alerta } from "./regras";
import type { AlocacaoBacklog, EntradaMotor, HH, ResultadoMotor, ResumoBacklog } from "./tipos";
import type { LinhaSaldo, ResumoMes } from "./visoes";

/** As 11 conferências da planilha do planejador (spec §9), na ordem C1…C11, com tolerância de 0,5 h. */

export interface Conferencia { id: string; texto: string; resultado: "OK" | "VERIFICAR" | "—"; detalhe?: string; abas: string }

const TOL = 0.5;
const zero = (): HH => ({ mec: 0, ele: 0 });
const mais = (a: HH, b: HH): HH => ({ mec: a.mec + b.mec, ele: a.ele + b.ele });
const igual = (a: HH, b: HH) => Math.abs(a.mec - b.mec) <= TOL && Math.abs(a.ele - b.ele) <= TOL;
const f1 = (n: number) => n.toLocaleString("pt-BR", { maximumFractionDigits: 1 });
const hhTxt = (h: HH) => `MEC ${f1(h.mec)} h · ELE ${f1(h.ele)} h`;
const ddmm = (d: Dia) => dataBr(d).slice(0, 5);
const lista = (xs: string[], max = 8) => xs.slice(0, max).join(", ") + (xs.length > max ? ` e mais ${xs.length - max}` : "");

export function conferir(x: {
  e: EntradaMotor; r: ResultadoMotor; dias: DiaTrabalho[]; saldo: LinhaSaldo[]; resumo: ResumoMes[]; alertas: Alerta[];
  backlog?: { aloc: AlocacaoBacklog; resumo: ResumoBacklog } | null; manual?: Map<Dia, HH>;
}): Conferencia[] {
  const { e, r, dias, saldo, resumo } = x;
  const p = e.parametros;
  const out: Conferencia[] = [];
  const add = (id: string, texto: string, abas: string, ok: boolean | null, detalhe?: string) =>
    out.push({ id, texto, abas, resultado: ok == null ? "—" : ok ? "OK" : "VERIFICAR", ...(detalhe ? { detalhe } : {}) });
  const diaDe = new Map(dias.map((d) => [d.data, d]));

  // C1
  const t1 = capTurno(p.turnos.t1), t2 = capTurno(p.turnos.t2), sab = capTurno(p.turnos.sabado);
  const c1 = dias.filter((d) => {
    const esp = d.condicao === "util" ? [t1, t2] : d.condicao === "sabado" ? [sab, zero()] : [zero(), zero()];
    return !igual(d.cap.t1, esp[0]) || !igual(d.cap.t2, esp[1]);
  }).map((d) => ddmm(d.data));
  add("C1", "Capacidade = pessoas × horas por pessoa (T1, T2, sábado) e dia útil = T1 + T2", "Parâmetros · Saldo HH", !c1.length,
    c1.length ? `Dias com capacidade diferente dos Parâmetros: ${lista(c1)}` : `Dia útil: ${hhTxt(mais(t1, t2))}; sábado: ${hhTxt(sab)}`);

  // C2 e C3
  const porTurno = new Map<string, ResultadoMotor["linhas"]>();
  for (const l of r.linhas) porTurno.set(`${l.data}|${l.turno}`, [...(porTurno.get(`${l.data}|${l.turno}`) ?? []), l]);
  const c2: string[] = [], c3: string[] = [];
  for (const [k, ls] of porTurno) {
    const [d, t] = k.split("|").map(Number);
    const dt = diaDe.get(d);
    const cap = dt ? (t === 1 ? dt.cap.t1 : dt.cap.t2) : zero();
    const hh = ls.reduce((s, l) => mais(s, l.hh), zero()), ac = ls.reduce((s, l) => mais(s, l.acima), zero());
    if (hh.mec - cap.mec > ac.mec + TOL || hh.ele - cap.ele > ac.ele + TOL) c2.push(`${ddmm(d)} ${t}º turno`);
    if (cap.mec + cap.ele <= 0) c3.push(`${ddmm(d)} ${t}º turno`);
  }
  add("C2", "Limite do turno só é estourado por saldo ≤ 4 h", "Programação · Saldo HH", !c2.length, c2.length ? `Acima do limite: ${lista(c2)}` : undefined);
  add("C3", "Nenhuma atividade em domingo, feriado ou 2º turno de sábado", "Programação", !c3.length, c3.length ? `Turnos sem atuação com parada: ${lista(c3)}` : undefined);

  // C4
  const prog = r.linhas.reduce((s, l) => mais(s, l.hh), zero());
  const doSaldo = saldo.reduce((s, l) => mais(s, mais(l.t1.hh, l.t2.hh)), zero());
  add("C4", "Programado no Saldo HH = Programação (MEC e ELE)", "Saldo HH · Programação", igual(prog, doSaldo),
    `Saldo HH ${hhTxt(doSaldo)} · Programação ${hhTxt(prog)}`);

  // C5
  const itens = new Map(e.demandas.flatMap((d) => d.itens.map((i) => [i.chave, i] as const)));
  const vistos = new Set<string>(), repetidos: string[] = [];
  let ref = zero(), faltam = 0;
  for (const l of r.linhas) for (const k of l.itens) {
    if (vistos.has(k)) repetidos.push(k);
    vistos.add(k);
    const i = itens.get(k);
    if (!i) { faltam++; continue; }
    ref = mais(ref, i.disciplina === "MEC" ? { mec: i.hh, ele: 0 } : { mec: 0, ele: i.hh });
  }
  add("C5", "Itens IP19 com data programada = HH da Programação (MEC e ELE)", "Programação", igual(ref, prog) && !repetidos.length && !faltam,
    repetidos.length ? `${repetidos.length} item(ns) em duas linhas` : `Itens ${hhTxt(ref)} · Programação ${hhTxt(prog)}`);

  // C6
  const retirado = new Set(r.retirados.map((y) => `${y.mes}|${y.ativo}`));
  const carga = e.demandas.filter((d) => !retirado.has(`${d.mes}|${d.ativo}`)).reduce((s, d) => mais(s, d.hh), zero());
  const sem = r.semHh.reduce((s, y) => mais(s, y.hh), zero());
  add("C6", "IP19 = Programado + Sem HH (MEC e ELE, todos os meses)", "Programação · Ativos sem HH", igual(carga, mais(prog, sem)),
    `IP19 ${hhTxt(carga)} · programado + sem HH ${hhTxt(mais(prog, sem))}`);

  // C7
  const c7 = resumo.filter((m) => !igual(m.programado, saldo.filter((l) => mesDe(l.data) === m.mes).reduce((s, l) => mais(s, mais(l.t1.hh, l.t2.hh)), zero())))
    .map((m) => m.mes);
  add("C7", "Resumo dos calendários = Saldo HH", "Calendário · Saldo HH", !c7.length, c7.length ? `Meses diferentes: ${c7.join(", ")}` : undefined);

  // C8 (só nos meses com carga na IP19)
  const comCarga = new Set(resumo.filter((m) => m.carga.mec + m.carga.ele > 0).map((m) => m.mes));
  const pulados = [...new Set(saldo.map((l) => mesDe(l.data)))].filter((m) => !comCarga.has(m)).sort();
  const c8 = saldo.filter((l) => l.data >= e.inicio && comCarga.has(mesDe(l.data)) && ((l.condicao === "util" && (!l.t1.ativos.length || !l.t2.ativos.length))
    || (l.condicao === "sabado" && !l.t1.ativos.length))).map((l) => ddmm(l.data));
  const txtPulados = pulados.length ? `Meses sem carga na IP19 (não conferidos): ${pulados.map(mesCurto).join(", ")}.` : "";
  add("C8", "Nenhum turno vazio (dia útil com T1 e T2; sábado útil com T1)", "Calendário · Saldo HH", !c8.length,
    [c8.length ? `Dias com turno vazio: ${lista(c8)}.` : "", txtPulados].filter(Boolean).join(" ") || undefined);

  // C9
  const n = new Map<string, number>();
  for (const a of x.alertas) n.set(a.codigo, (n.get(a.codigo) ?? 0) + 1);
  add("C9", "Sem alertas de regra na Programação", "Programação", x.alertas.length === 0,
    x.alertas.length ? `${x.alertas.length} alerta${x.alertas.length > 1 ? "s" : ""}: ${[...n].map(([c, q]) => (q > 1 ? `${c} (${q})` : c)).join(", ")}` : undefined);

  // C10 e C11 (parte 4)
  if (!x.backlog) {
    add("C10", "Backlog (IW38 + manual) não passa do saldo do dia (saldo final ≥ 0)", "Saldo HH", null, "Sem alocação do backlog (parte 4).");
    add("C11", "IW38: pendente = já no calendário + alocado + sem saldo", "IW38 Plano × Backlog", null, "Sem alocação do backlog (parte 4).");
    return out;
  }
  const c10 = saldo.filter((l) => {
    const a = x.backlog!.aloc.porDia[String(l.data)];
    const usado = mais(a ? mais(a.t1, a.t2) : zero(), x.manual?.get(l.data) ?? zero());
    return usado.mec > l.backlog.mec + TOL || usado.ele > l.backlog.ele + TOL;
  }).map((l) => ddmm(l.data));
  add("C10", "Backlog (IW38 + manual) não passa do saldo do dia (saldo final ≥ 0)", "Saldo HH", !c10.length,
    c10.length ? `Dias com saldo final negativo: ${lista(c10)}` : undefined);
  const rb = x.backlog.resumo;
  const soma = mais(mais(rb.noCalendario, rb.alocado), rb.semSaldo);
  add("C11", "IW38: pendente = já no calendário + alocado + sem saldo", "IW38 Plano × Backlog", igual(rb.pendente, soma),
    `Pendente ${hhTxt(rb.pendente)} · soma ${hhTxt(soma)}`);
  return out;
}

const NOME_MES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const mesCurto = (m: string) => `${NOME_MES[Number(m.slice(5, 7)) - 1]}/${m.slice(2, 4)}`;

function mesDe(d: Dia): string {
  const x = new Date(d * 86_400_000);
  return `${x.getUTCFullYear()}-${String(x.getUTCMonth() + 1).padStart(2, "0")}`;
}
