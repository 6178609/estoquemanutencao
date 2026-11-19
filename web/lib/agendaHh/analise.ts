/**
 * Controle de HH (aba "agenda_hh"): análises extras do Comparativo e do Calendário, em funções puras.
 *
 * - Aderência à programação: concluídas ÷ programações do período (status tratado como texto: "programada",
 *   "reprogramada", "concluida" ou qualquer outro que venha a existir).
 * - HH programado por tipo de ordem e por status.
 * - Sobrecarga por técnico no período (programado > disponível) e alertas por dia do calendário (técnico com mais
 *   horas do que as do dia, ou programado em fim de semana, férias ou folga), reaproveitando `alertas` das regras.
 *
 * Testado em testes/agendaHhAnalise.test.ts (só dados fictícios).
 */
import {
  type Alerta, type AusenciasPorNp, type LinhaComparativo, type Periodo, type Programacao, type Tecnico,
  ROTULO_STATUS, STATUS, alertas, comparar,
} from "./regras";

const horasDe = (p: Pick<Programacao, "minutos">) => (Number(p.minutos) || 0) / 60;

/** Rótulo do status (o conhecido em pt-BR; um status novo aparece com a primeira letra maiúscula). */
export function rotuloStatus(status: string): string {
  const s = String(status ?? "").trim();
  if (!s) return "Sem status";
  return (ROTULO_STATUS as Record<string, string>)[s] ?? s.charAt(0).toLocaleUpperCase("pt-BR") + s.slice(1);
}

/** Programações dentro do período (e, se dado, só dos técnicos do conjunto). */
export function programacoesDoPeriodo(lista: Programacao[], p: Periodo, tecnicoIds?: Set<string>): Programacao[] {
  return lista.filter((x) => x.data >= p.ini && x.data <= p.fim && (!tecnicoIds || tecnicoIds.has(x.tecnicoId)));
}

export interface Aderencia { total: number; concluidas: number; pendentes: number; pct: number | null; horasConcluidas: number; horasTotal: number }

/** Aderência: concluídas ÷ total (em quantidade); `pct` null sem programação. */
export function aderencia(lista: Programacao[]): Aderencia {
  const total = lista.length;
  const feitas = lista.filter((x) => String(x.status) === "concluida");
  const horasTotal = lista.reduce((s, x) => s + horasDe(x), 0);
  return { total, concluidas: feitas.length, pendentes: total - feitas.length, pct: total ? (feitas.length / total) * 100 : null,
    horasConcluidas: feitas.reduce((s, x) => s + horasDe(x), 0), horasTotal };
}

export interface LinhaStatus { status: string; rotulo: string; quantidade: number; horas: number }

/** Quantidade e horas por status: os conhecidos na ordem de STATUS, os outros depois (por nome). Só status presentes. */
export function porStatus(lista: Programacao[]): LinhaStatus[] {
  const m = new Map<string, LinhaStatus>();
  for (const x of lista) {
    const s = String(x.status ?? "").trim();
    const l = m.get(s) ?? { status: s, rotulo: rotuloStatus(s), quantidade: 0, horas: 0 };
    l.quantidade++;
    l.horas += horasDe(x);
    m.set(s, l);
  }
  const ordem = (s: string) => { const i = (STATUS as readonly string[]).indexOf(s); return i < 0 ? STATUS.length : i; };
  return [...m.values()].sort((a, b) => ordem(a.status) - ordem(b.status) || comparar(a.rotulo, b.rotulo));
}

/** HH programado por tipo de ordem (maior primeiro; sem tipo = "Sem tipo"). */
export function hhPorTipo(lista: Programacao[]): { rotulo: string; valor: number; quantidade: number }[] {
  const m = new Map<string, { valor: number; quantidade: number }>();
  for (const x of lista) {
    const k = String(x.tipoOrdem ?? "").trim() || "Sem tipo";
    const v = m.get(k) ?? { valor: 0, quantidade: 0 };
    v.valor += horasDe(x);
    v.quantidade++;
    m.set(k, v);
  }
  return [...m.entries()].map(([rotulo, v]) => ({ rotulo, ...v })).sort((a, b) => b.valor - a.valor || comparar(a.rotulo, b.rotulo));
}

export interface Sobrecarga { tecnicoId: string; nome: string; disponivel: number; programado: number; excesso: number; ocupacao: number }

/** Técnicos com mais horas programadas do que disponíveis no período (maior excesso primeiro). */
export function sobrecargas(linhas: Pick<LinhaComparativo, "tecnico" | "disponivel" | "programado" | "ocupacao">[]): Sobrecarga[] {
  return linhas.filter((l) => l.programado > l.disponivel + 1e-9)
    .map((l) => ({ tecnicoId: l.tecnico.id, nome: l.tecnico.nome, disponivel: l.disponivel, programado: l.programado,
      excesso: l.programado - l.disponivel, ocupacao: l.ocupacao }))
    .sort((a, b) => b.excesso - a.excesso || comparar(a.nome, b.nome));
}

export type NivelOcupacao = "livre" | "normal" | "alta" | "sobrecarga";

/** Faixa da ocupação: sobrecarga > 100%, alta ≥ 85%, normal > 0, livre = 0. */
export function nivelOcupacao(ocupacao: number, programado: number, disponivel: number): NivelOcupacao {
  if (programado > disponivel + 1e-9) return "sobrecarga";
  if (ocupacao >= 85) return "alta";
  return programado > 0 ? "normal" : "livre";
}

export interface ResumoAlertasTecnico { sobrecarga: number; foraDoDia: number }

/** Quantos dias com alerta cada técnico tem: sobrecarga no dia e programação fora do dia de trabalho. */
export function alertasPorTecnico(lista: Alerta[]): Map<string, ResumoAlertasTecnico> {
  const m = new Map<string, ResumoAlertasTecnico>();
  for (const a of lista) {
    const r = m.get(a.tecnicoId) ?? { sobrecarga: 0, foraDoDia: 0 };
    if (a.motivo === "sobrecarga") r.sobrecarga++;
    else r.foraDoDia++;
    m.set(a.tecnicoId, r);
  }
  return m;
}

/** Programações com os mesmos filtros do calendário (área da programação; turno, ou "sem turno"). */
export function filtrarCalendario(lista: Programacao[], p: Periodo, f: { area?: string; turno?: string } = {}): Programacao[] {
  return lista.filter((x) => x.data >= p.ini && x.data <= p.fim && (!f.area || x.area === f.area)
    && (!f.turno || (f.turno === "sem turno" ? !x.turno : x.turno === f.turno)));
}

/**
 * Alertas do calendário agrupados por dia: técnico com programado acima das horas do dia, ou programado em fim de
 * semana, férias, folga ou ausência. Usa as mesmas programações que o calendário mostra (filtros de área e turno).
 */
export function alertasDoCalendario(tecnicos: Tecnico[], lista: Programacao[], p: Periodo, f: { area?: string; turno?: string } = {},
  mapa?: AusenciasPorNp): Map<string, Alerta[]> {
  const m = new Map<string, Alerta[]>();
  for (const a of alertas(tecnicos, filtrarCalendario(lista, p, f), p, mapa)) {
    const l = m.get(a.data);
    if (l) l.push(a);
    else m.set(a.data, [a]);
  }
  return m;
}

/** Resumo dos alertas do calendário: dias com alerta, alertas de sobrecarga e de dia sem expediente. */
export function resumoAlertasCalendario(porDia: Map<string, Alerta[]>) {
  let sobrecarga = 0, foraDoDia = 0;
  for (const l of porDia.values()) for (const a of l) if (a.motivo === "sobrecarga") sobrecarga++; else foraDoDia++;
  return { dias: porDia.size, sobrecarga, foraDoDia };
}
