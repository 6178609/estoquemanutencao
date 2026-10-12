import { casaBusca, normalizarBusca } from "../dados/texto";
import type { Confirmacao, Operacao, Ordem, Pessoa } from "./preparo";
import { hoje as hojeLocal, paraData, partes, setorDoCentro, type Dia } from "./util";

/**
 * Calendário de ordens — porta de central/calendario.py: as ordens do IW38 em cada dia da data-base de início, por
 * turno. Cada cartão é uma ordem:
 * - título = objeto técnico (ou local de instalação, ou texto da ordem);
 * - quem = pessoas que apontaram na ordem (IW47, nome/área/cargo da Gestão de HH); sem apontamento, o centro de
 *   trabalho e as pessoas previstas no IW38OP;
 * - duração = trabalho planejado das operações (IW38OP);
 * - turno = turma das pessoas que apontaram (1ª, 2ª, 3ª, G); sem apontamento, "Sem executante";
 * - cor = plano de manutenção (azul) ou backlog (amarelo); borda = concluída, atrasada ou programada.
 *
 * O HTML do Streamlit não foi portado: `diasDoCalendario` devolve a grade (dias, turnos, cartões, "+N ordens") para
 * a página React desenhar. Testado em testes/calendario.test.ts.
 */

export const TURNOS: Record<string, string> = { "1ª": "1º turno", "2ª": "2º turno", "3ª": "3º turno", G: "Horário geral" };
export const SEM_EXECUTANTE = "Sem executante (IW47)";
export const ORDEM_TURNOS = ["1º turno", "2º turno", "3º turno", "Horário geral", SEM_EXECUTANTE];
export const CONCLUIDA = "Concluída", ATRASADA = "Atrasada", PROGRAMADA = "Programada", CANCELADA = "Cancelada";
export const SITUACOES = [PROGRAMADA, ATRASADA, CONCLUIDA, CANCELADA] as const;
export type SituacaoAgenda = (typeof SITUACOES)[number];
export const DIAS = ["DOM", "SEG", "TER", "QUA", "QUI", "SEX", "SÁB"];
export const MESES = ["JAN.", "FEV.", "MAR.", "ABR.", "MAI.", "JUN.", "JUL.", "AGO.", "SET.", "OUT.", "NOV.", "DEZ."];
export const NOMES_MESES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro",
  "Outubro", "Novembro", "Dezembro"];
/** Acima de 9 semanas a grade fica ilegível (a página mostra só as primeiras; a lista mostra tudo). */
export const MAX_DIAS_GRADE = 63;
const MINUSCULAS = new Set(["da", "de", "do", "das", "dos", "e"]);

/** Legenda da grade: fundo/borda de cada marca. */
export const LEGENDA = [
  { rotulo: "Plano de manutenção", cor: "#E8F1FC", borda: "#9DBFE6" },
  { rotulo: "Backlog", cor: "#FFF4D6", borda: "#F0C24B" },
  { rotulo: "Concluída (borda)", cor: "#0E9F46", borda: "#0E9F46" },
  { rotulo: "Atrasada (borda)", cor: "#E3262B", borda: "#E3262B" },
  { rotulo: "Hoje", cor: "#0A6EBD", borda: "#0A6EBD" },
];

/** O que a agenda usa de cada ordem (a Ordem do IW38 preparada serve; `data` ausente → `inicio`). */
export type OrdemAgenda = Partial<Pick<Ordem, "objeto" | "local" | "texto" | "tipo" | "natureza" | "centroTrabalho" |
  "localizacao" | "data" | "inicio" | "fim">> & { ordem: string; situacao?: string; ajustada?: boolean };
export type OperacaoAgenda = Pick<Operacao, "ordem" | "horas"> & Partial<Pick<Operacao, "pessoas" | "cancelada">>;
export type ConfirmacaoAgenda = Pick<Confirmacao, "ordem" | "np"> & Partial<Pick<Confirmacao, "nome" | "statusSistema">>;
export type PessoaAgenda = Pick<Pessoa, "np"> & Partial<Pick<Pessoa, "nome" | "turma" | "area" | "cargo">>;

/**
 * Aplica às ordens do IW38 as datas gravadas pelo robô depois do último export (ordem → [início, fim]); as ordens
 * mexidas ficam com `ajustada`.
 */
export function comDatasAlteradas<T extends OrdemAgenda>(ordens: T[] | null,
  ajustes: Record<string, [string | Dia, string | Dia]>): (T & { ajustada: boolean })[] | null {
  if (ordens == null) return null;
  const d = (v: string | Dia) => (typeof v === "number" ? v : paraData(v));
  return ordens.map((o) => {
    const a = Object.prototype.hasOwnProperty.call(ajustes, o.ordem) ? ajustes[o.ordem] : undefined;
    if (!a) return { ...o, ajustada: false };
    const ini = d(a[0]), fim = d(a[1]);
    const x: T & { ajustada: boolean } = { ...o, ajustada: true, inicio: ini, fim };
    if ("data" in o) x.data = ini;
    return x;
  });
}

/** JOSIVAN GILDO DA SILVA → Josivan Gildo da Silva. */
export function nomeProprio(s: unknown): string {
  const p = String(s ?? "").trim().split(/\s+/).filter(Boolean);
  return p.map((x, i) => {
    const m = x.toLowerCase();
    return MINUSCULAS.has(m) && i ? m : x.charAt(0).toUpperCase() + x.slice(1).toLowerCase();
  }).join(" ");
}

/** Horas → "3h", "50 min", "1h 17min" ("" sem duração). */
export function duracao(horas: number | null | undefined): string {
  if (horas == null || Number.isNaN(horas) || horas <= 0) return "";
  const minutos = arredPar(horas * 60);
  const h = Math.floor(minutos / 60), m = minutos % 60;
  if (!h) return `${m} min`;
  return m ? `${h}h ${m}min` : `${h}h`;
}
/** round() do Python (meio para o par). */
const arredPar = (x: number) => { const r = Math.round(x); return r - x === 0.5 && r % 2 ? r - 1 : r; };

/** Domingo da semana de d (o calendário começa no domingo). */
export function inicioSemana(d: Dia): Dia {
  return d - partes(d).semana;
}

/** Uma linha da agenda: a ordem num dia e turno. */
export interface ItemAgenda {
  dia: Dia; ordem: string; titulo: string; texto: string; tipo: string; natureza: string; situacao: SituacaoAgenda;
  situacaoOrdem: string; turno: string; quem: string; duracaoH: number | null; centroTrabalho: string;
  localizacao: string; executantes: number; ajustada: boolean;
}

const tiraPontos = (s: string) => s.replace(/^[ ·]+|[ ·]+$/g, ""); // o strip(" ·") do Python
const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/**
 * Uma linha por ordem e turno, com o dia (data-base de início), título, quem, duração e situação. A ordem aparece no
 * turno de cada turma que apontou nela (IW47); sem apontamento, em "Sem executante" com o centro de trabalho e as
 * pessoas previstas. Concluída = não pendente no IW38 ou CONF + ENTE na IW47; atrasada = pendente com o dia já passado.
 */
export function agenda(ordens: OrdemAgenda[] | null, oper: OperacaoAgenda[] | null = null, conf: ConfirmacaoAgenda[] | null = null,
  equipe: PessoaAgenda[] | null = null, hoje: Dia = hojeLocal()): ItemAgenda[] {
  if (!ordens?.length) return [];
  const os = ordens.map((o) => ({ o, dia: "data" in o ? o.data ?? null : o.inicio ?? null }))
    .filter((x): x is { o: OrdemAgenda; dia: Dia } => x.dia != null);
  const nas = new Set(os.map((x) => x.o.ordem));

  // duração = trabalho planejado das operações não canceladas; pessoas previstas = o maior "número" delas
  const horas = new Map<string, number>(), previstas = new Map<string, number>();
  for (const op of oper ?? []) {
    if (!nas.has(op.ordem) || op.cancelada) continue;
    horas.set(op.ordem, (horas.get(op.ordem) ?? 0) + (Number.isNaN(op.horas) ? 0 : op.horas));
    const p = op.pessoas ?? NaN;
    if (!Number.isNaN(p)) previstas.set(op.ordem, Math.max(previstas.get(op.ordem) ?? -Infinity, p));
  }

  // quem apontou (IW47) e em que turma
  const pessoas: { ordem: string; pessoa: string; turno: string; rotulo: string }[] = [];
  const tokens = new Map<string, Set<string>>();
  const info = new Map<string, PessoaAgenda>();
  for (const p of equipe ?? []) if (!info.has(p.np)) info.set(p.np, p);
  const vistos = new Set<string>();
  for (const c of conf ?? []) {
    if (!nas.has(c.ordem)) continue;
    const e = info.get(c.np);
    const pessoa = nomeProprio(e?.nome || c.nome || c.np);
    const turma = e?.turma ?? "";
    const turno = Object.prototype.hasOwnProperty.call(TURNOS, turma) ? TURNOS[turma] : SEM_EXECUTANTE;
    const cargo = (e?.cargo ?? "").split(/\s+/).filter(Boolean)[0] ?? "";
    const extra = tiraPontos(`${[...(e?.area ?? "")].slice(0, 3).join("")} · ${nomeProprio(cargo)}`);
    const k = `${c.ordem}\x1f${pessoa}`;
    if (!vistos.has(k)) {
      vistos.add(k);
      pessoas.push({ ordem: c.ordem, pessoa, turno, rotulo: pessoa + (extra ? ` (${extra})` : "") });
    }
    let t = tokens.get(c.ordem);
    if (!t) tokens.set(c.ordem, (t = new Set()));
    for (const x of (c.statusSistema ?? "").split(/\s+/)) if (x) t.add(x);
  }
  const concluidaIw47 = (ordem: string) => { const t = tokens.get(ordem); return !!t && t.has("CONF") && t.has("ENTE"); };

  // por ordem × turno: os rótulos (na ordem do IW47) e quantas pessoas
  const porTurno = new Map<string, Map<string, { quem: string[]; pessoas: Set<string> }>>();
  for (const p of pessoas) {
    let m = porTurno.get(p.ordem);
    if (!m) porTurno.set(p.ordem, (m = new Map()));
    let g = m.get(p.turno);
    if (!g) m.set(p.turno, (g = { quem: [], pessoas: new Set() }));
    g.quem.push(p.rotulo);
    g.pessoas.add(p.pessoa);
  }

  const out: ItemAgenda[] = [];
  for (const { o, dia } of os) {
    const s = (v: string | undefined) => v ?? "";
    const sit = s(o.situacao);
    const pendente = ["Aberta", "Liberada", "Sem status"].includes(sit) && !concluidaIw47(o.ordem);
    const situacao: SituacaoAgenda = sit === "Cancelada" ? CANCELADA : !pendente ? CONCLUIDA : dia < hoje ? ATRASADA : PROGRAMADA;
    const titulo = s(o.objeto) || s(o.local) || s(o.texto);
    const base = {
      dia, ordem: o.ordem, titulo, texto: s(o.texto), tipo: s(o.tipo), natureza: s(o.natureza), situacao, situacaoOrdem: sit,
      duracaoH: horas.has(o.ordem) ? horas.get(o.ordem)! : null, centroTrabalho: s(o.centroTrabalho),
      localizacao: s(o.localizacao), ajustada: !!o.ajustada,
    };
    const turnos = [...(porTurno.get(o.ordem) ?? new Map()).entries()].sort((a, b) => cmp(a[0], b[0]));
    if (!turnos.length) {
      const n = previstas.get(o.ordem);
      const prev = n != null && Math.trunc(n) ? ` · ${Math.trunc(n)} pessoa(s) prevista(s)` : "";
      out.push({ ...base, turno: SEM_EXECUTANTE, quem: base.centroTrabalho + prev, executantes: 0 });
    } else for (const [turno, g] of turnos) out.push({ ...base, turno, quem: g.quem.join(", "), executantes: g.pessoas.size });
  }
  const ordemTurno = (t: string) => { const i = ORDEM_TURNOS.indexOf(t); return i < 0 ? ORDEM_TURNOS.length : i; };
  return out.sort((a, b) => a.dia - b.dia || ordemTurno(a.turno) - ordemTurno(b.turno) || cmp(a.natureza, b.natureza)
    || cmp(a.titulo, b.titulo) || cmp(a.ordem, b.ordem));
}

// ----------------------------------------------------------------------------
// Grade do calendário (o que o HTML do Streamlit desenhava)
// ----------------------------------------------------------------------------
export interface Cartao {
  item: ItemAgenda;
  /** "backlog" (amarelo) ou "" (plano, azul) */
  fundo: "backlog" | "";
  /** borda à esquerda: concluída (verde), atrasada (vermelha), cancelada (esmaecido/riscado) ou "" (programada) */
  borda: "concluida" | "atrasada" | "cancelada" | "";
  titulo: string;
  /** quem + duração, separados por " • " */
  quem: string;
  /** texto da dica (title) do cartão */
  dica: string;
}

export interface TurnoDoDia {
  turno: string;
  /** cartões mostrados direto no dia */
  visiveis: Cartao[];
  /** cartões que vão para o "+N ordem(ns)" (todos, quando o turno inteiro não coube) */
  escondidos: Cartao[];
  /** o turno inteiro foi para o "+N ordem(ns)" (o cabeçalho dele aparece só lá dentro) */
  oculto: boolean;
}

export interface DiaDoCalendario {
  dia: Dia; numero: number; mes: string;
  /** célula em branco (fora do período, sem mês de referência) */
  vazio: boolean;
  /** esmaecido (fora do período ou de outro mês, com mês de referência) */
  fora: boolean;
  hoje: boolean;
  /** ordens distintas no dia e a soma da duração delas */
  ordens: number; horas: number;
  /** "3 ordem(ns) · 4h 30min" ("" sem ordens — a tela mostra "Sem programação") */
  total: string;
  turnos: TurnoDoDia[];
  /** quantos cartões estão no "+N ordem(ns)" */
  escondidos: number;
}

/** O cartão de uma linha da agenda: cores, título, quem/duração e a dica. */
export function cartao(r: ItemAgenda): Cartao {
  const dur = duracao(r.duracaoH);
  const quem = [r.quem, dur].filter(Boolean).join(" • ");
  const dica = (r.ajustada ? "↻ Data alterada pelo robô do SAP (ainda não está no IW38 exportado)\n" : "")
    + `Ordem ${r.ordem} · ${r.tipo} · ${r.natureza}\n${r.texto}\n${r.titulo}\n`
    + `Situação: ${r.situacao} (${r.situacaoOrdem}) · ${r.centroTrabalho} · ${r.localizacao}\n${quem}`;
  const borda = r.situacao === CONCLUIDA ? "concluida" : r.situacao === ATRASADA ? "atrasada" : r.situacao === CANCELADA ? "cancelada" : "";
  return { item: r, fundo: r.natureza === "Backlog" ? "backlog" : "", borda, titulo: (r.ajustada ? "↻ " : "") + r.titulo, quem, dica };
}

function montarDia(d: Dia, linhas: ItemAgenda[], hoje: Dia, fora: boolean, vazio: boolean, maxCartoes: number): DiaDoCalendario {
  const p = partes(d);
  const dd: DiaDoCalendario = { dia: d, numero: p.dia, mes: MESES[p.mes - 1], vazio, fora, hoje: d === hoje, ordens: 0, horas: 0,
    total: "", turnos: [], escondidos: 0 };
  if (vazio || !linhas.length) return dd;
  const porOrdem = new Map<string, number | null>();
  for (const l of linhas) if (!porOrdem.has(l.ordem)) porOrdem.set(l.ordem, l.duracaoH);
  dd.ordens = porOrdem.size;
  dd.horas = [...porOrdem.values()].reduce<number>((s, h) => s + (h == null || Number.isNaN(h) ? 0 : h), 0);
  dd.total = `${dd.ordens} ordem(ns)${dd.horas > 0 ? " · " + duracao(dd.horas) : ""}`;
  // turnos na ordem em que aparecem (a agenda já vem ordenada por turno); até maxCartoes cartões no dia
  const grupos = new Map<string, ItemAgenda[]>();
  for (const l of linhas) { const g = grupos.get(l.turno); if (g) g.push(l); else grupos.set(l.turno, [l]); }
  let mostrados = 0;
  for (const [turno, g] of grupos) {
    const cartoes = g.map(cartao);
    const livres = Math.max(maxCartoes - mostrados, 0);
    const visiveis = cartoes.slice(0, livres);
    mostrados += Math.min(livres, cartoes.length);
    const oculto = livres < 1 && cartoes.length > 0;
    dd.turnos.push({ turno, visiveis: oculto ? [] : visiveis, escondidos: oculto ? cartoes : cartoes.slice(livres), oculto });
    dd.escondidos += oculto ? cartoes.length : cartoes.length - visiveis.length;
  }
  return dd;
}

/**
 * Grade domingo→sábado de `ini` a `fim` (completa as semanas), na ordem de leitura (7 por linha). `mesRef`: dias
 * fora do período continuam aparecendo, esmaecidos, e os de outro mês também ficam esmaecidos; sem ele, os dias fora
 * do período ficam em branco. Cada dia mostra até `maxCartoes` cartões; o resto vai para o "+N ordem(ns)".
 */
export function diasDoCalendario(ag: ItemAgenda[], ini: Dia, fim: Dia, hoje: Dia, mesRef: number | null = null,
  maxCartoes = 12): DiaDoCalendario[] {
  const porDia = new Map<Dia, ItemAgenda[]>();
  for (const l of ag) { const g = porDia.get(l.dia); if (g) g.push(l); else porDia.set(l.dia, [l]); }
  const out: DiaDoCalendario[] = [];
  for (let d = inicioSemana(ini), ult = inicioSemana(fim) + 6; d <= ult; d++) {
    const dentro = d >= ini && d <= fim;
    const linhas = porDia.get(d) ?? [];
    if (!dentro) out.push(montarDia(d, linhas, hoje, true, mesRef == null, maxCartoes));
    else out.push(montarDia(d, linhas, hoje, mesRef != null && partes(d).mes !== mesRef, false, maxCartoes));
  }
  return out;
}

// ----------------------------------------------------------------------------
// O que a página mostra (filtros e indicadores) — as contas de paginas/calendario.py
// ----------------------------------------------------------------------------
export interface FiltroAgenda {
  busca?: string; situacoes?: string[]; naturezas?: string[]; turnos?: string[]; localizacoes?: string[];
  centros?: string[];
  /** setores (pelo código do centro de trabalho); vale só quando nenhum centro foi escolhido */
  setores?: string[];
}

/** Filtros da página (busca em ordem, título, texto, quem, centro e tipo; sem acento). */
export function filtrarAgenda(ag: ItemAgenda[], f: FiltroAgenda): ItemAgenda[] {
  const em = (v: string[] | undefined) => (v?.length ? new Set(v) : null);
  const sit = em(f.situacoes), nat = em(f.naturezas), tur = em(f.turnos), loc = em(f.localizacoes), ct = em(f.centros),
    set = em(f.setores);
  const busca = f.busca?.trim() ? f.busca : "";
  return ag.filter((l) => (!busca || casaBusca(normalizarBusca(
    `${l.ordem} ${l.titulo} ${l.texto} ${l.quem} ${l.centroTrabalho} ${l.tipo}`), busca))
    && (!sit || sit.has(l.situacao)) && (!nat || nat.has(l.natureza)) && (!tur || tur.has(l.turno))
    && (!loc || loc.has(l.localizacao))
    && (ct ? ct.has(l.centroTrabalho) : !set || (l.centroTrabalho !== "" && set.has(setorDoCentro(l.centroTrabalho)))));
}

export interface ResumoAgenda {
  ordens: number; concluidas: number; atrasadas: number;
  /** HH planejado (IW38OP) das ordens */
  horas: number;
  /** ordens sem apontamento na IW47 */
  semIw47: number;
}

/** Indicadores do período (uma vez por ordem, na primeira linha dela). */
export function resumoAgenda(noPeriodo: ItemAgenda[]): ResumoAgenda {
  const primeira = new Map<string, ItemAgenda>();
  const semExec = new Set<string>();
  for (const l of noPeriodo) {
    if (!primeira.has(l.ordem)) primeira.set(l.ordem, l);
    if (l.turno === SEM_EXECUTANTE) semExec.add(l.ordem);
  }
  const os = [...primeira.values()];
  return {
    ordens: os.length, concluidas: os.filter((l) => l.situacao === CONCLUIDA).length,
    atrasadas: os.filter((l) => l.situacao === ATRASADA).length,
    horas: os.reduce((s, l) => s + (l.duracaoH ?? 0), 0), semIw47: os.filter((l) => semExec.has(l.ordem)).length,
  };
}
