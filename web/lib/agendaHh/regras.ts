/**
 * Controle de HH (aba "agenda_hh"): regras puras, portadas do app "Controle de HH | PCM".
 *
 * - Horas disponíveis de cada técnico no período = dias úteis (seg–sex) × jornada/dia − férias − folga
 *   (a folga dentro das férias não desconta duas vezes).
 * - Programação de serviços (equipamento, ordem, data, turno, status, minutos, técnico responsável).
 * - Comparativo disponível × programado por técnico, folha de cobertura e calendário.
 *
 * Datas sempre "aaaa-mm-dd" e contas em UTC (meio-dia), para dar o mesmo resultado em qualquer fuso.
 * Testado em testes/agendaHh.test.ts (só dados fictícios).
 */

export const ARQ = "agenda_hh.json";
export const PREFIXO_TECNICO = "t_";
export const PREFIXO_PROGRAMACAO = "p_";

export const TURNOS_TECNICO = ["1º turno", "2º turno", "3º turno", "Administrativo"] as const;
export const TURNOS_PROGRAMACAO = ["1º turno", "2º turno"] as const;
export const STATUS = ["programada", "reprogramada", "concluida"] as const;
export type Status = (typeof STATUS)[number];
export const ROTULO_STATUS: Record<Status, string> = { programada: "Programada", reprogramada: "Reprogramada", concluida: "Concluída" };
/** Sugestões do campo "Centro de trabalho" (o campo aceita qualquer texto). */
export const CENTROS_SUGERIDOS = ["Mistura", "Prensas", "Vulcanização", "Injetados", "Acabamento", "Utilidades"];

/** Foto do técnico: data URL já reduzida no navegador (240 px, JPEG). */
export const LIMITE_FOTO = 80_000;
export const FOTO_LADO = 240;
export const FOTO_QUALIDADE = 0.78;
export const MAX_MINUTOS = 10_080;
export const MAX_LINHAS_PLANILHA = 500;

export interface Tecnico {
  id: string;
  nome: string;
  np: string;
  centro: string;
  area: string;
  turno: string;
  jornada: number;
  feriasInicio: string | null;
  feriasFim: string | null;
  folga: string | null;
  foto: string;
}

export interface Programacao {
  id: string;
  equipamento: string;
  tipoOrdem: string;
  ordem: string;
  descricao: string;
  area: string;
  data: string;
  /** "1º turno", "2º turno" ou "" (registro antigo, sem turno) */
  turno: string;
  status: Status;
  minutos: number;
  tecnicoId: string;
  tecnicoNome: string;
  np: string;
  criadoEm: string;
  /** reprogramações: a data anterior, a nova, quando e quem mudou */
  historico: Reprogramacao[];
}

export interface Reprogramacao { de: string; para: string; em: string; por: string }

/** Ausência lançada na Gestão de HH (férias, afastamento, treinamento, folga…), já em datas ISO. `horas` > 0 = parcial. */
export interface AusenciaExterna { tipo: string; de: string; ate: string; horas: number | null }

export interface Periodo { ini: string; fim: string }
export type ModoPeriodo = "dia" | "semana" | "mes" | "personalizado";

// ----------------------------------------------------------------------------
// Datas
// ----------------------------------------------------------------------------
const DIA_MS = 86_400_000;

export function isoValida(v: unknown): v is string {
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const [a, m, d] = v.split("-").map(Number);
  const dt = new Date(Date.UTC(a, m - 1, d));
  return dt.getUTCFullYear() === a && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

/** Dia (meio-dia UTC) de uma data ISO; null se inválida. */
export function deIso(v: string | null | undefined): Date | null {
  if (!isoValida(v)) return null;
  const [a, m, d] = v.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, d, 12));
}

export function paraIso(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

export function somarDias(iso: string, dias: number): string {
  const d = deIso(iso);
  return d ? paraIso(new Date(d.getTime() + dias * DIA_MS)) : iso;
}

/** Dia da semana (0 = domingo … 6 = sábado). */
export function diaDaSemana(iso: string): number {
  return deIso(iso)?.getUTCDay() ?? 0;
}

/** Hoje no fuso de Brasília. */
export function hojeIso(agora = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(agora);
}

/** Período da visão: o dia, a semana de segunda a sexta ou o mês da data de referência. */
export function periodoDaVisao(modo: Exclude<ModoPeriodo, "personalizado">, referencia: string): Periodo {
  const ref = isoValida(referencia) ? referencia : hojeIso();
  if (modo === "dia") return { ini: ref, fim: ref };
  const d = deIso(ref)!;
  if (modo === "mes") {
    const ini = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1, 12));
    const fim = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0, 12));
    return { ini: paraIso(ini), fim: paraIso(fim) };
  }
  const dia = d.getUTCDay();
  const segunda = somarDias(ref, dia === 0 ? -6 : 1 - dia);
  return { ini: segunda, fim: somarDias(segunda, 4) };
}

export function periodoValido(p: Periodo | null | undefined): p is Periodo {
  return !!p && isoValida(p.ini) && isoValida(p.fim) && p.ini <= p.fim;
}

/** Dias úteis (segunda a sexta) entre as duas datas, inclusive. */
export function contarDiasUteis(ini: string, fim: string): number {
  const a = deIso(ini), b = deIso(fim);
  if (!a || !b || a > b) return 0;
  const total = Math.round((b.getTime() - a.getTime()) / DIA_MS) + 1;
  const semanas = Math.floor(total / 7);
  let n = semanas * 5;
  const inicio = a.getUTCDay();
  for (let i = 0; i < total % 7; i++) {
    const w = (inicio + i) % 7;
    if (w !== 0 && w !== 6) n++;
  }
  return n;
}

/** Dias úteis em comum entre o período e o intervalo (férias). */
export function sobreposicaoDiasUteis(ini: string, fim: string, de: string | null | undefined, ate: string | null | undefined): number {
  if (!de || !ate) return 0;
  const a = ini > de ? ini : de;
  const b = fim < ate ? fim : ate;
  return a <= b ? contarDiasUteis(a, b) : 0;
}

export function diaUtilNoPeriodo(data: string | null | undefined, ini: string, fim: string): boolean {
  if (!data || !isoValida(data) || data < ini || data > fim) return false;
  const w = diaDaSemana(data);
  return w !== 0 && w !== 6;
}

/** Todas as datas do período (no máximo 370). */
export function datasDoPeriodo(p: Periodo): string[] {
  if (!periodoValido(p)) return [];
  const out: string[] = [];
  for (let d = p.ini; d <= p.fim && out.length < 370; d = somarDias(d, 1)) out.push(d);
  return out;
}

// ----------------------------------------------------------------------------
// Disponibilidade
// ----------------------------------------------------------------------------
export interface Disponibilidade {
  diasUteis: number;
  teorico: number;
  diasFerias: number;
  horasFerias: number;
  diasFolga: number;
  horasFolga: number;
  /** dias úteis de ausências da Gestão de HH que não caem nas férias/folga do cadastro */
  diasOutras: number;
  /** horas dessas ausências (dias inteiros + cargas parciais, como treinamento de 4 h) */
  horasOutras: number;
  disponivel: number;
}

/** Ausência de dia inteiro? (carga horária 0 = EAD/fora do horário: não tira HH; carga > 0 = parcial) */
const diaInteiro = (a: AusenciaExterna) => a.horas == null;

export function disponibilidade(t: Pick<Tecnico, "jornada" | "feriasInicio" | "feriasFim" | "folga">, p: Periodo,
  externas: AusenciaExterna[] = []): Disponibilidade {
  const jornada = Number(t.jornada) || 0;
  const diasUteis = contarDiasUteis(p.ini, p.fim);
  const teorico = diasUteis * jornada;
  const diasFerias = sobreposicaoDiasUteis(p.ini, p.fim, t.feriasInicio, t.feriasFim);
  const horasFerias = Math.min(teorico, diasFerias * jornada);
  const nasFerias = (d: string) => !!(t.feriasInicio && t.feriasFim && d >= t.feriasInicio && d <= t.feriasFim);
  const folgaNasFerias = !!t.folga && nasFerias(t.folga);
  const diasFolga = diaUtilNoPeriodo(t.folga, p.ini, p.fim) && !folgaNasFerias ? 1 : 0;
  const horasFolga = diasFolga * jornada;
  // ausências da Gestão de HH: cada dia útil conta uma vez só (fora das férias e da folga do cadastro)
  let diasOutras = 0, parciais = 0;
  if (externas.length) {
    const cobertos = new Set<string>();
    for (const a of externas) {
      if (!isoValida(a.de) || !isoValida(a.ate) || a.ate < p.ini || a.de > p.fim) continue;
      if (diaInteiro(a)) {
        for (let d = a.de < p.ini ? p.ini : a.de; d <= a.ate && d <= p.fim; d = somarDias(d, 1))
          if (diaUtilNoPeriodo(d, p.ini, p.fim) && !nasFerias(d) && !(diasFolga && d === t.folga)) cobertos.add(d);
      } else if ((a.horas ?? 0) > 0) parciais += a.horas!;
    }
    diasOutras = cobertos.size;
  }
  const restante = Math.max(0, teorico - horasFerias - horasFolga);
  const horasOutras = Math.min(restante, diasOutras * jornada + parciais);
  return { diasUteis, teorico, diasFerias, horasFerias, diasFolga, horasFolga, diasOutras, horasOutras,
    disponivel: Math.max(0, restante - horasOutras) };
}

export type SituacaoTecnico = "disponivel" | "ferias" | "folga" | "ausencia" | "indisponivel";
export const ROTULO_SITUACAO: Record<SituacaoTecnico, string> = {
  disponivel: "Disponível", ferias: "Férias no período", folga: "Folga no período", ausencia: "Ausência na Gestão de HH",
  indisponivel: "Indisponível",
};

export function situacao(c: Disponibilidade): SituacaoTecnico {
  if (c.disponivel === 0 && c.teorico > 0) return "indisponivel";
  if (c.diasFerias > 0) return "ferias";
  if (c.diasFolga > 0) return "folga";
  if (c.horasOutras > 0) return "ausencia";
  return "disponivel";
}

/** Ausências da Gestão de HH do técnico (pelo NP, sem zeros à esquerda). */
export const chaveNp = (np: string) => String(np ?? "").replace(/[\s.\-]/g, "").replace(/^0+(?=\d)/, "");
export type AusenciasPorNp = Record<string, AusenciaExterna[]>;
export const ausenciasDo = (t: Pick<Tecnico, "np">, mapa: AusenciasPorNp | undefined) => (t.np && mapa?.[chaveNp(t.np)]) || [];

/** Motivo de o dia não ter HH: fim de semana, férias, folga ou ausência da Gestão de HH (null = dia normal). */
export type MotivoDia = "fim de semana" | "férias" | "folga" | "ausência";
export function motivoDoDia(t: Pick<Tecnico, "feriasInicio" | "feriasFim" | "folga">, data: string, externas: AusenciaExterna[] = []): MotivoDia | null {
  const w = diaDaSemana(data);
  if (w === 0 || w === 6) return "fim de semana";
  if (t.feriasInicio && t.feriasFim && data >= t.feriasInicio && data <= t.feriasFim) return "férias";
  if (t.folga === data) return "folga";
  if (externas.some((a) => diaInteiro(a) && data >= a.de && data <= a.ate)) return "ausência";
  return null;
}

export interface Alerta { tecnicoId: string; nome: string; data: string; disponivel: number; programado: number; motivo: MotivoDia | "sobrecarga" }

/**
 * Alertas de sobrecarga: técnico/dia com mais horas programadas do que as disponíveis no dia (jornada menos ausência
 * parcial), ou com programação em fim de semana, férias, folga ou ausência da Gestão de HH. Concluídas não contam.
 */
export function alertas(tecnicos: Tecnico[], lista: Programacao[], p: Periodo, mapa?: AusenciasPorNp): Alerta[] {
  const porTecDia = new Map<string, number>();
  for (const x of lista) {
    if (x.status === "concluida" || x.data < p.ini || x.data > p.fim) continue;
    const k = `${x.tecnicoId}|${x.data}`;
    porTecDia.set(k, (porTecDia.get(k) ?? 0) + (Number(x.minutos) || 0) / 60);
  }
  const porId = new Map(tecnicos.map((t) => [t.id, t]));
  const out: Alerta[] = [];
  for (const [k, programado] of porTecDia) {
    const [id, data] = k.split("|");
    const t = porId.get(id);
    if (!t) continue;
    const ext = ausenciasDo(t, mapa);
    const motivo = motivoDoDia(t, data, ext);
    const parcial = ext.filter((a) => !diaInteiro(a) && data >= a.de && data <= a.ate).reduce((s, a) => s + (a.horas ?? 0), 0);
    const disponivel = motivo ? 0 : Math.max(0, t.jornada - parcial);
    if (motivo || programado > disponivel + 1e-9)
      out.push({ tecnicoId: id, nome: t.nome, data, disponivel, programado, motivo: motivo ?? "sobrecarga" });
  }
  return out.sort((a, b) => a.data.localeCompare(b.data) || comparar(a.nome, b.nome));
}

export const textoAlerta = (a: Alerta) => a.motivo === "sobrecarga"
  ? `${a.nome}: ${formatarHoras(a.programado)} programadas para ${formatarHoras(a.disponivel)} disponíveis em ${formatarData(a.data)}`
  : `${a.nome}: programação em dia de ${a.motivo} (${formatarData(a.data)})`;

export interface FiltrosTecnicos { centro?: string; turno?: string; area?: string; busca?: string; ordem?: "maior" | "menor" | "nome" }

export const comparar = (a: string, b: string) => String(a).localeCompare(String(b), "pt-BR", { sensitivity: "base" });

export function tecnicosVisiveis(tecnicos: Tecnico[], p: Periodo, f: FiltrosTecnicos = {}, mapa?: AusenciasPorNp): Tecnico[] {
  const busca = (f.busca ?? "").trim().toLocaleLowerCase("pt-BR");
  const disp = new Map(tecnicos.map((t) => [t.id, disponibilidade(t, p, ausenciasDo(t, mapa)).disponivel]));
  return tecnicos
    .filter((t) => (!f.centro || t.centro === f.centro) && (!f.turno || t.turno === f.turno) && (!f.area || t.area === f.area)
      && (!busca || t.nome.toLocaleLowerCase("pt-BR").includes(busca)))
    .sort((a, b) => {
      if (f.ordem === "nome") return comparar(a.nome, b.nome);
      const d = disp.get(a.id)! - disp.get(b.id)!;
      return f.ordem === "menor" ? d : -d;
    });
}

export interface ResumoHoras { total: number; exibidos: number; ausencias: number; media: number }

export function resumoHoras(tecnicos: Tecnico[], p: Periodo, mapa?: AusenciasPorNp): ResumoHoras {
  const calc = tecnicos.map((t) => disponibilidade(t, p, ausenciasDo(t, mapa)));
  const total = calc.reduce((s, c) => s + c.disponivel, 0);
  return { total, exibidos: tecnicos.length, ausencias: calc.filter((c) => c.diasFerias > 0 || c.diasFolga > 0 || c.horasOutras > 0).length,
    media: tecnicos.length ? total / tecnicos.length : 0 };
}

/** Soma das horas disponíveis por centro de trabalho (maior primeiro). */
export function horasPorCentro(tecnicos: Tecnico[], p: Periodo, mapa?: AusenciasPorNp): { rotulo: string; valor: number }[] {
  const m = new Map<string, number>();
  for (const t of tecnicos) m.set(t.centro, (m.get(t.centro) ?? 0) + disponibilidade(t, p, ausenciasDo(t, mapa)).disponivel);
  return [...m.entries()].map(([rotulo, valor]) => ({ rotulo, valor })).sort((a, b) => b.valor - a.valor || comparar(a.rotulo, b.rotulo));
}

export function horasPorTecnico(tecnicos: Tecnico[], p: Periodo, mapa?: AusenciasPorNp): { rotulo: string; valor: number }[] {
  return tecnicos.map((t) => ({ rotulo: `${t.nome} • ${t.centro}`, valor: disponibilidade(t, p, ausenciasDo(t, mapa)).disponivel }))
    .sort((a, b) => b.valor - a.valor || comparar(a.rotulo, b.rotulo));
}

/** Valores distintos e ordenados de um campo. */
export function distintos<T>(itens: T[], campo: (i: T) => string): string[] {
  return [...new Set(itens.map(campo).filter(Boolean))].sort(comparar);
}

// ----------------------------------------------------------------------------
// Programação e comparativo
// ----------------------------------------------------------------------------
export interface FiltrosProgramacao { busca?: string; status?: string; tecnicoId?: string; area?: string; de?: string; ate?: string }

export function buscarProgramacoes(lista: Programacao[], f: FiltrosProgramacao = {}): Programacao[] {
  const q = (f.busca ?? "").trim().toLocaleLowerCase("pt-BR");
  return lista.filter((p) => {
    const texto = [p.equipamento, p.ordem, p.descricao, p.area, p.tecnicoNome, p.np].join(" ").toLocaleLowerCase("pt-BR");
    return (!q || texto.includes(q)) && (!f.status || p.status === f.status) && (!f.tecnicoId || p.tecnicoId === f.tecnicoId)
      && (!f.area || p.area === f.area) && (!f.de || p.data >= f.de) && (!f.ate || p.data <= f.ate);
  });
}

export function resumoProgramacao(lista: Programacao[]) {
  return { total: lista.length, programadas: lista.filter((p) => p.status === "programada").length,
    reprogramadas: lista.filter((p) => p.status === "reprogramada").length,
    concluidas: lista.filter((p) => p.status === "concluida").length,
    minutos: lista.reduce((s, p) => s + (Number(p.minutos) || 0), 0) };
}

export function horasProgramadas(lista: Programacao[], tecnicoId: string, p: Periodo): number {
  return lista.filter((x) => x.tecnicoId === tecnicoId && x.data >= p.ini && x.data <= p.fim)
    .reduce((s, x) => s + (Number(x.minutos) || 0) / 60, 0);
}

export interface LinhaComparativo { tecnico: Tecnico; disponivel: number; programado: number; saldo: number; ocupacao: number }

export function comparativo(tecnicos: Tecnico[], lista: Programacao[], p: Periodo, f: { area?: string; tecnicoId?: string } = {},
  mapa?: AusenciasPorNp) {
  const linhas: LinhaComparativo[] = tecnicos
    .filter((t) => (!f.area || t.area === f.area) && (!f.tecnicoId || t.id === f.tecnicoId))
    .sort((a, b) => comparar(a.nome, b.nome))
    .map((tecnico) => {
      const disponivel = disponibilidade(tecnico, p, ausenciasDo(tecnico, mapa)).disponivel;
      const programado = horasProgramadas(lista, tecnico.id, p);
      const ocupacao = disponivel > 0 ? (programado / disponivel) * 100 : programado > 0 ? 100 : 0;
      return { tecnico, disponivel, programado, saldo: disponivel - programado, ocupacao };
    });
  const disponivel = linhas.reduce((s, l) => s + l.disponivel, 0);
  const programado = linhas.reduce((s, l) => s + l.programado, 0);
  const ids = new Set(linhas.map((l) => l.tecnico.id));
  const doPeriodo = lista.filter((x) => ids.has(x.tecnicoId) && x.data >= p.ini && x.data <= p.fim);
  const concluidas = doPeriodo.filter((x) => x.status === "concluida").length;
  // HH programado por tipo de ordem (maior primeiro)
  const tipos = new Map<string, number>();
  for (const x of doPeriodo) tipos.set(x.tipoOrdem || "Sem tipo", (tipos.get(x.tipoOrdem || "Sem tipo") ?? 0) + (Number(x.minutos) || 0) / 60);
  return { linhas, disponivel, programado, saldo: disponivel - programado, ocupacao: disponivel > 0 ? (programado / disponivel) * 100 : 0,
    /** aderência: concluídas ÷ programações do período (null sem programação) */
    aderencia: doPeriodo.length ? (concluidas / doPeriodo.length) * 100 : null, concluidas, programacoes: doPeriodo.length,
    porTipo: [...tipos.entries()].map(([rotulo, valor]) => ({ rotulo, valor })).sort((a, b) => b.valor - a.valor || comparar(a.rotulo, b.rotulo)),
    alertas: alertas(linhas.map((l) => l.tecnico), lista, p, mapa) };
}

// ----------------------------------------------------------------------------
// Folha de cobertura
// ----------------------------------------------------------------------------
const minusculo = (s: string) => String(s ?? "").trim().toLocaleLowerCase("pt-BR");

/** Técnico da programação: pelo id; senão pelo NP (se só um tiver); senão pelo nome (se só um tiver). */
export function tecnicoDaProgramacao(p: Programacao, tecnicos: Tecnico[]): Tecnico | null {
  const porId = tecnicos.find((t) => t.id === p.tecnicoId);
  if (porId) return porId;
  const np = String(p.np ?? "").trim();
  if (np) {
    const m = tecnicos.filter((t) => String(t.np ?? "").trim() === np);
    if (m.length === 1) return m[0];
  }
  const nome = minusculo(p.tecnicoNome);
  const m = tecnicos.filter((t) => minusculo(t.nome) === nome);
  return m.length === 1 ? m[0] : null;
}

export function chavePessoa(p: Programacao, tecnicos: Tecnico[]): string {
  const t = tecnicoDaProgramacao(p, tecnicos);
  return t ? `id:${t.id}` : p.tecnicoId ? `id:${p.tecnicoId}` : `nome:${minusculo(p.tecnicoNome)}`;
}

export interface PessoaCobertura { chave: string; nome: string; np: string; foto: string }

/** Pessoas da folha: os técnicos cadastrados e quem aparece só na programação (técnico excluído). */
export function pessoasCobertura(tecnicos: Tecnico[], lista: Programacao[]): PessoaCobertura[] {
  const m = new Map<string, PessoaCobertura>();
  for (const t of tecnicos) m.set(`id:${t.id}`, { chave: `id:${t.id}`, nome: t.nome, np: t.np, foto: t.foto });
  for (const p of lista) {
    const k = chavePessoa(p, tecnicos);
    if (!m.has(k)) m.set(k, { chave: k, nome: p.tecnicoNome || "Sem técnico", np: p.np || "", foto: "" });
  }
  return [...m.values()].sort((a, b) => comparar(a.nome, b.nome));
}

export function filtrarCobertura(lista: Programacao[], tecnicos: Tecnico[], f: { periodo: Periodo; pessoas: string[]; area?: string }): Programacao[] {
  const pessoas = new Set(f.pessoas);
  return lista
    .filter((p) => p.data >= f.periodo.ini && p.data <= f.periodo.fim && (!pessoas.size || pessoas.has(chavePessoa(p, tecnicos)))
      && (!f.area || p.area === f.area))
    .sort((a, b) => a.data.localeCompare(b.data) || comparar(a.tecnicoNome, b.tecnicoNome) || comparar(a.equipamento, b.equipamento)
      || comparar(a.ordem, b.ordem));
}

// ----------------------------------------------------------------------------
// Calendário
// ----------------------------------------------------------------------------
export interface ItemCalendario {
  id: string; equipamento: string; turno: string; status: Status; minutos: number; tecnicos: string[]; descricoes: string[]; quantidade: number;
}

/** Programações do período agrupadas por dia e por turno + equipamento (soma os minutos). turno "sem turno" = só as sem turno. */
export function calendario(lista: Programacao[], p: Periodo, f: { area?: string; turno?: string } = {}) {
  const itens = lista.filter((x) => x.data >= p.ini && x.data <= p.fim && (!f.area || x.area === f.area)
    && (!f.turno || (f.turno === "sem turno" ? !x.turno : x.turno === f.turno)));
  const porDia = new Map<string, Map<string, ItemCalendario & { _t: Set<string>; _d: Set<string> }>>();
  for (const x of itens) {
    const dia = porDia.get(x.data) ?? porDia.set(x.data, new Map()).get(x.data)!;
    const k = `${x.turno || "sem turno"}|${minusculo(x.equipamento)}`;
    let g = dia.get(k);
    if (!g) dia.set(k, (g = { id: x.id, equipamento: x.equipamento, turno: x.turno || "", status: x.status, minutos: 0, tecnicos: [],
      descricoes: [], quantidade: 0, _t: new Set(), _d: new Set() }));
    g.minutos += Number(x.minutos) || 0;
    if (x.tecnicoNome) g._t.add(x.tecnicoNome);
    if (x.descricao) g._d.add(x.descricao);
    if (x.status === "reprogramada") g.status = "reprogramada";
    g.quantidade++;
  }
  const dias = new Map<string, ItemCalendario[]>();
  for (const [d, m] of porDia)
    dias.set(d, [...m.values()].map(({ _t, _d, ...g }) => ({ ...g, tecnicos: [..._t], descricoes: [..._d] }))
      .sort((a, b) => comparar(a.equipamento, b.equipamento)));
  const equipamentos = new Set(itens.map((x) => minusculo(x.equipamento)).filter(Boolean));
  return { datas: datasDoPeriodo(p), dias, diasComProgramacao: porDia.size, equipamentos: equipamentos.size, total: itens.length };
}

// ----------------------------------------------------------------------------
// Formatação
// ----------------------------------------------------------------------------
const NUM = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 });
const DATA = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" });
const DATA_CURTA = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", timeZone: "UTC" });
const MES_CURTO = new Intl.DateTimeFormat("pt-BR", { month: "short", timeZone: "UTC" });

export const formatarNumero = (v: number) => NUM.format(Number.isFinite(v) ? v : 0);
export const formatarHoras = (v: number) => `${formatarNumero(Number(v) || 0)}h`;
export const formatarHorasSinal = (v: number) => `${(Number(v) || 0) < 0 ? "−" : ""}${formatarHoras(Math.abs(Number(v) || 0))}`;
export const formatarPct = (v: number) => `${formatarNumero(v)}%`;

export function formatarMinutos(minutos: number): string {
  const v = Number(minutos) || 0;
  if (v < 60) return `${v} min`;
  const h = Math.floor(v / 60), r = v % 60;
  return r ? `${h}h ${r}min` : `${h}h`;
}

export function formatarData(iso: string | null | undefined): string {
  const d = deIso(iso);
  return d ? DATA.format(d) : "—";
}
export function formatarDataCurta(iso: string): string {
  const d = deIso(iso);
  return d ? DATA_CURTA.format(d) : "—";
}
export function mesCurto(iso: string): string {
  const d = deIso(iso);
  return d ? MES_CURTO.format(d).replace(".", "") : "";
}

export function iniciais(nome: string): string {
  const partes = String(nome ?? "").trim().split(/\s+/).filter(Boolean);
  if (!partes.length) return "FT";
  return `${partes[0][0]}${partes.length > 1 ? partes[partes.length - 1][0] : ""}`.toLocaleUpperCase("pt-BR");
}

export const normalizarTexto = (v: unknown) => String(v ?? "").trim().replace(/\s+/g, " ");

// ----------------------------------------------------------------------------
// Validação (a mesma no navegador e no servidor)
// ----------------------------------------------------------------------------
export type Erros = Record<string, string>;
export type Resultado<T> = { ok: true; valor: T } | { ok: false; erros: Erros };

export const FOTO_VALIDA = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/;

export interface EntradaTecnico {
  nome?: unknown; np?: unknown; centro?: unknown; area?: unknown; turno?: unknown; jornada?: unknown;
  feriasInicio?: unknown; feriasFim?: unknown; folga?: unknown; foto?: unknown;
}

const dataOpcional = (v: unknown) => (v == null || v === "" ? null : String(v));

/**
 * Técnico: nome, NP, centro, área, turno e jornada (1 a 24 h) obrigatórios; férias com as duas datas e fim ≥ início;
 * folga e foto opcionais. `legado` (backup do sistema antigo): NP e área podem faltar.
 */
export function validarTecnico(e: EntradaTecnico, opcoes: { legado?: boolean } = {}): Resultado<Omit<Tecnico, "id">> {
  const erros: Erros = {};
  const nome = normalizarTexto(e.nome).slice(0, 80);
  let np = normalizarTexto(e.np).slice(0, 20);
  if (opcoes.legado && /^n[aã]o informado$/i.test(np)) np = "";
  const centro = normalizarTexto(e.centro).slice(0, 40);
  const area = normalizarTexto(e.area).slice(0, 60);
  const turno = normalizarTexto(e.turno);
  const jornadaTexto = String(e.jornada ?? "").trim().replace(",", ".");
  const jornada = Number(jornadaTexto);
  const feriasInicio = dataOpcional(e.feriasInicio), feriasFim = dataOpcional(e.feriasFim), folga = dataOpcional(e.folga);
  const foto = typeof e.foto === "string" ? e.foto : "";
  if (!nome) erros.nome = "Informe o nome completo.";
  if (!np && !opcoes.legado) erros.np = "Informe o NP — número pessoal.";
  if (!centro) erros.centro = "Informe o centro de trabalho.";
  if (!area && !opcoes.legado) erros.area = "Informe a área de atuação.";
  if (!turno) erros.turno = "Selecione o turno.";
  else if (!opcoes.legado && !(TURNOS_TECNICO as readonly string[]).includes(turno)) erros.turno = "Turno inválido.";
  if (!jornadaTexto || !Number.isFinite(jornada) || jornada < 1 || jornada > 24) erros.jornada = "Informe uma jornada entre 1 e 24 horas.";
  if ((feriasInicio && !isoValida(feriasInicio)) || (feriasFim && !isoValida(feriasFim))) erros.feriasFim = "Data das férias inválida.";
  else if ((feriasInicio && !feriasFim) || (!feriasInicio && feriasFim)) erros.feriasFim = "Informe as duas datas das férias.";
  else if (feriasInicio && feriasFim && feriasInicio > feriasFim) erros.feriasFim = "A data final deve ser igual ou posterior ao início.";
  if (folga && !isoValida(folga)) erros.folga = "Data de folga inválida.";
  if (foto && (foto.length > LIMITE_FOTO || !FOTO_VALIDA.test(foto))) erros.foto = "Foto inválida ou grande demais: escolha outra imagem.";
  if (Object.keys(erros).length) return { ok: false, erros };
  return { ok: true, valor: { nome, np, centro, area, turno, jornada: Math.round(jornada * 100) / 100, feriasInicio, feriasFim, folga, foto } };
}

export interface EntradaProgramacao {
  equipamento?: unknown; tipoOrdem?: unknown; ordem?: unknown; descricao?: unknown; area?: unknown; data?: unknown;
  turno?: unknown; status?: unknown; minutos?: unknown; tecnicoId?: unknown;
}

/**
 * Programação: todos os campos obrigatórios; turno 1º ou 2º (um registro antigo sem turno pode continuar sem turno ao
 * ser editado: `semTurnoPermitido`); minutos inteiros de 1 a 10.080; o técnico tem de estar cadastrado.
 */
export function validarProgramacao(e: EntradaProgramacao, tecnicos: Tecnico[], opcoes: { semTurnoPermitido?: boolean } = {}):
  Resultado<Omit<Programacao, "id" | "criadoEm" | "historico">> {
  const erros: Erros = {};
  const equipamento = normalizarTexto(e.equipamento).slice(0, 80);
  const tipoOrdem = normalizarTexto(e.tipoOrdem).slice(0, 40);
  const ordem = normalizarTexto(e.ordem).slice(0, 30);
  const descricao = normalizarTexto(e.descricao).slice(0, 300);
  const area = normalizarTexto(e.area).slice(0, 60);
  const data = String(e.data ?? "");
  const turno = normalizarTexto(e.turno);
  const status = String(e.status ?? "") as Status;
  const minutosTexto = String(e.minutos ?? "").trim();
  const minutos = Number(minutosTexto);
  const tecnico = tecnicos.find((t) => t.id === e.tecnicoId);
  if (!equipamento) erros.equipamento = "Informe o equipamento.";
  if (!tipoOrdem) erros.tipoOrdem = "Informe o tipo de ordem.";
  if (!ordem) erros.ordem = "Informe o número da ordem.";
  if (!descricao) erros.descricao = "Informe a descrição.";
  if (!area) erros.area = "Informe a área de atuação.";
  if (!isoValida(data)) erros.data = "Informe a data programada.";
  if (turno ? !(TURNOS_PROGRAMACAO as readonly string[]).includes(turno) : !opcoes.semTurnoPermitido) erros.turno = "Selecione o 1º ou 2º turno.";
  if (!STATUS.includes(status)) erros.status = "Status inválido.";
  if (!minutosTexto || !Number.isInteger(minutos) || minutos < 1 || minutos > MAX_MINUTOS) erros.minutos = "Informe o tempo em minutos.";
  if (!tecnico) erros.tecnicoId = "Selecione o técnico responsável.";
  if (Object.keys(erros).length) return { ok: false, erros };
  return { ok: true, valor: { equipamento, tipoOrdem, ordem, descricao, area, data, turno, status, minutos, tecnicoId: tecnico!.id,
    tecnicoNome: tecnico!.nome, np: tecnico!.np } };
}

// ----------------------------------------------------------------------------
// Planilha de programação (importar Excel)
// ----------------------------------------------------------------------------
export const COLUNAS_MODELO = ["Equipamento", "Tipo de Ordem", "Ordem", "Descrição", "Área de Atuação", "Data Programada", "Turno", "Status",
  "Tempo em Min", "NP"] as const;

/** Data de uma célula: objeto de data do leitor de xlsx, número de série do Excel, aaaa-mm-dd ou dd/mm/aaaa. */
export function dataDaCelula(v: unknown): string {
  if (v && typeof v === "object" && "ano" in v && "mes" in v && "dia" in v) {
    const d = v as { ano: number; mes: number; dia: number };
    const iso = `${String(d.ano).padStart(4, "0")}-${String(d.mes).padStart(2, "0")}-${String(d.dia).padStart(2, "0")}`;
    return isoValida(iso) ? iso : "";
  }
  if (typeof v === "number" && Number.isFinite(v) && v > 0) {
    return paraIso(new Date(Date.UTC(1899, 11, 30) + Math.floor(v) * DIA_MS + DIA_MS / 2));
  }
  const t = String(v ?? "").trim();
  if (isoValida(t)) return t;
  const m = t.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  const iso = m ? `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}` : "";
  return isoValida(iso) ? iso : "";
}

export function statusDaCelula(v: unknown): Status | "" {
  const n = String(v ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();
  return n === "programada" || n === "reprogramada" ? n : n === "concluida" ? "concluida" : "";
}

/** Linha da planilha → texto por coluna do modelo (cabeçalho comparado sem acento nem caixa). */
const chaveColuna = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase().replace(/\s+/g, " ");

export function objetosDaPlanilha(linhas: unknown[][]): Record<string, unknown>[] {
  const [cab, ...resto] = linhas;
  if (!cab) return [];
  const porChave = new Map(COLUNAS_MODELO.map((c) => [chaveColuna(c), c]));
  const colunas = cab.map((c) => porChave.get(chaveColuna(String(c ?? ""))) ?? null);
  return resto
    .filter((l) => l.some((v) => v != null && String(v).trim() !== ""))
    .map((l) => Object.fromEntries(colunas.flatMap((c, i) => (c ? [[c, l[i] ?? ""]] : []))));
}

export interface LinhaImportada { linha: number; entrada: EntradaProgramacao }

/** Confere as linhas como o app original: tudo obrigatório, turno 1º/2º, minutos 1–10.080 e o NP cadastrado. */
export function prepararImportacao(objetos: Record<string, unknown>[], tecnicos: Tecnico[]): { itens: LinhaImportada[]; erros: string[] } {
  const itens: LinhaImportada[] = [];
  const erros: string[] = [];
  if (!objetos.length) return { itens, erros: ["A planilha não possui linhas preenchidas."] };
  if (objetos.length > MAX_LINHAS_PLANILHA) return { itens, erros: [`Importe no máximo ${MAX_LINHAS_PLANILHA} linhas por vez.`] };
  objetos.forEach((o, i) => {
    const linha = i + 2;
    const np = normalizarTexto(o["NP"]);
    const tecnico = np ? tecnicos.find((t) => String(t.np ?? "").trim() === np) : undefined;
    const turno = normalizarTexto(o["Turno"]);
    const minutos = Number(String(o["Tempo em Min"] ?? "").trim().replace(",", "."));
    const entrada: EntradaProgramacao = {
      equipamento: normalizarTexto(o["Equipamento"]), tipoOrdem: normalizarTexto(o["Tipo de Ordem"]), ordem: normalizarTexto(o["Ordem"]),
      descricao: normalizarTexto(o["Descrição"]), area: normalizarTexto(o["Área de Atuação"]), data: dataDaCelula(o["Data Programada"]),
      turno, status: statusDaCelula(o["Status"]), minutos, tecnicoId: tecnico?.id ?? "",
    };
    const faltam: string[] = [];
    if (!entrada.equipamento) faltam.push("Equipamento");
    if (!entrada.tipoOrdem) faltam.push("Tipo de Ordem");
    if (!entrada.ordem) faltam.push("Ordem");
    if (!entrada.descricao) faltam.push("Descrição");
    if (!entrada.area) faltam.push("Área de Atuação");
    if (!entrada.data) faltam.push("Data Programada");
    if (!entrada.status) faltam.push("Status");
    if (!(TURNOS_PROGRAMACAO as readonly string[]).includes(turno)) faltam.push("Turno (1º turno ou 2º turno)");
    if (!Number.isInteger(minutos) || minutos < 1 || minutos > MAX_MINUTOS) faltam.push("Tempo em Min");
    if (!tecnico) faltam.push("NP não cadastrado");
    if (faltam.length) erros.push(`Linha ${linha}: ${faltam.join(", ")}`);
    else itens.push({ linha, entrada });
  });
  return { itens, erros };
}

// ----------------------------------------------------------------------------
// Cadastro (agenda_hh.json): técnicos em "t_<id>", programações em "p_<id>"
// ----------------------------------------------------------------------------
export const ID_VALIDO = /^[A-Za-z0-9_-]{4,64}$/;
type Item = Record<string, unknown>;
const texto = (v: unknown) => (typeof v === "string" ? v : v == null ? "" : String(v));

export function tecnicoDe(id: string, v: Item | undefined): Tecnico | null {
  if (!v || typeof v !== "object" || !texto(v.nome)) return null;
  return { id, nome: texto(v.nome), np: texto(v.np), centro: texto(v.centro), area: texto(v.area), turno: texto(v.turno),
    jornada: Number(v.jornada) || 0, feriasInicio: isoValida(v.feriasInicio) ? v.feriasInicio : null,
    feriasFim: isoValida(v.feriasFim) ? v.feriasFim : null, folga: isoValida(v.folga) ? v.folga : null, foto: texto(v.foto) };
}

export function programacaoDe(id: string, v: Item | undefined): Programacao | null {
  if (!v || typeof v !== "object" || !isoValida(v.data)) return null;
  return { id, equipamento: texto(v.equipamento), tipoOrdem: texto(v.tipoOrdem), ordem: texto(v.ordem), descricao: texto(v.descricao),
    area: texto(v.area), data: v.data, turno: texto(v.turno), status: STATUS.includes(v.status as Status) ? v.status as Status : "programada",
    minutos: Number(v.minutos) || 0, tecnicoId: texto(v.tecnicoId), tecnicoNome: texto(v.tecnicoNome), np: texto(v.np),
    criadoEm: texto(v.criadoEm), historico: historicoDe(v.historico) };
}

export function historicoDe(v: unknown): Reprogramacao[] {
  return Array.isArray(v) ? v.flatMap((h) => (h && typeof h === "object" && isoValida((h as Item).de) && isoValida((h as Item).para)
    ? [{ de: (h as Item).de as string, para: (h as Item).para as string, em: texto((h as Item).em), por: texto((h as Item).por) }] : [])) : [];
}

/** Ao editar: se a data mudou, guarda a data anterior no histórico (no máximo as 50 últimas). */
export function comReprogramacao(antes: Pick<Programacao, "data" | "historico">, novaData: string, em: string, por: string): Reprogramacao[] {
  if (antes.data === novaData) return antes.historico;
  return [...antes.historico, { de: antes.data, para: novaData, em, por }].slice(-50);
}

export function lerAgenda(cad: Record<string, Item>): { tecnicos: Tecnico[]; programacoes: Programacao[] } {
  const tecnicos: Tecnico[] = [], programacoes: Programacao[] = [];
  for (const [k, v] of Object.entries(cad)) {
    if (k.startsWith(PREFIXO_TECNICO)) { const t = tecnicoDe(k.slice(PREFIXO_TECNICO.length), v); if (t) tecnicos.push(t); }
    else if (k.startsWith(PREFIXO_PROGRAMACAO)) { const p = programacaoDe(k.slice(PREFIXO_PROGRAMACAO.length), v); if (p) programacoes.push(p); }
  }
  tecnicos.sort((a, b) => comparar(a.nome, b.nome));
  // mais novas primeiro (como o original), depois pela data programada
  programacoes.sort((a, b) => b.criadoEm.localeCompare(a.criadoEm) || b.data.localeCompare(a.data));
  return { tecnicos, programacoes };
}

/** Item gravado (sem o id, que vai na chave; campos vazios saem). */
export function itemTecnico(t: Omit<Tecnico, "id">): Item {
  return Object.fromEntries(Object.entries({ ...t, tipo: "tecnico" }).filter(([, v]) => v !== null && v !== ""));
}
export function itemProgramacao(p: Omit<Programacao, "id">): Item {
  return Object.fromEntries(Object.entries({ ...p, tipo: "programacao" })
    .filter(([, v]) => v !== null && v !== "" && !(Array.isArray(v) && !v.length)));
}

// ----------------------------------------------------------------------------
// Backup no formato do app original (GET/POST /api/backup)
// ----------------------------------------------------------------------------
export interface BackupSistema {
  version: number;
  exportedAt: string;
  technicians: Record<string, unknown>[];
  programming: Record<string, unknown>[];
}

export function backupDoSistema(tecnicos: Tecnico[], programacoes: Programacao[], agora = new Date()): BackupSistema {
  return {
    version: 1,
    exportedAt: agora.toISOString(),
    technicians: tecnicos.map((t) => ({ id: t.id, name: t.nome, personalNumber: t.np, center: t.centro, area: t.area, shift: t.turno,
      dailyHours: t.jornada, vacationStart: t.feriasInicio, vacationEnd: t.feriasFim, dayOffDate: t.folga, photo: t.foto })),
    programming: programacoes.map((p) => ({ id: p.id, equipment: p.equipamento, orderType: p.tipoOrdem, orderNumber: p.ordem,
      description: p.descricao, area: p.area, scheduledDate: p.data, shift: p.turno, status: p.status, durationMinutes: p.minutos,
      technicianId: p.tecnicoId, technicianName: p.tecnicoNome, personalNumber: p.np, createdAt: p.criadoEm,
      rescheduleHistory: p.historico.map((h) => ({ from: h.de, to: h.para, at: h.em, by: h.por })) })),
  };
}

const lista = (v: unknown): Record<string, unknown>[] =>
  Array.isArray(v) ? v.filter((x): x is Record<string, unknown> => !!x && typeof x === "object" && !Array.isArray(x)) : [];

/** Técnico do backup (nomes do app original ou deste site) → entrada da validação. */
export function entradaTecnicoDoBackup(o: Record<string, unknown>): EntradaTecnico & { id: string } {
  return { id: texto(o.id), nome: o.name ?? o.nome, np: o.personalNumber ?? o.np, centro: o.center ?? o.centro, area: o.area,
    turno: o.shift ?? o.turno, jornada: o.dailyHours ?? o.jornada, feriasInicio: o.vacationStart ?? o.feriasInicio,
    feriasFim: o.vacationEnd ?? o.feriasFim, folga: o.dayOffDate ?? o.folga, foto: o.photo ?? o.foto };
}

export interface ProgramacaoBackup extends EntradaProgramacao { id: string; tecnicoNome: string; np: string; criadoEm: string; historico: Reprogramacao[] }

export function entradaProgramacaoDoBackup(o: Record<string, unknown>): ProgramacaoBackup {
  return { id: texto(o.id), equipamento: o.equipment ?? o.equipamento, tipoOrdem: o.orderType ?? o.tipoOrdem, ordem: o.orderNumber ?? o.ordem,
    descricao: o.description ?? o.descricao, area: o.area, data: o.scheduledDate ?? o.data, turno: o.shift ?? o.turno, status: o.status,
    minutos: o.durationMinutes ?? o.minutos, tecnicoId: texto(o.technicianId ?? o.tecnicoId),
    tecnicoNome: normalizarTexto(o.technicianName ?? o.tecnicoNome), np: normalizarTexto(o.personalNumber ?? o.np),
    criadoEm: texto(o.createdAt ?? o.criadoEm),
    historico: historicoDe(Array.isArray(o.rescheduleHistory)
      ? o.rescheduleHistory.map((h) => (h && typeof h === "object" ? { de: (h as Item).from, para: (h as Item).to, em: (h as Item).at, por: (h as Item).by } : h))
      : o.historico) };
}

/**
 * Lê o JSON do backup: o formato do app original (lista de técnicos, ou { technicians, programming | programmingEntries |
 * entries }) ou o exportado por esta aba (o mesmo formato).
 */
export function lerBackup(json: unknown): { tecnicos: (EntradaTecnico & { id: string })[]; programacoes: ProgramacaoBackup[] } | null {
  const o = json && typeof json === "object" ? (json as Record<string, unknown>) : null;
  const tecnicos = Array.isArray(json) ? lista(json) : o && Array.isArray(o.technicians) ? lista(o.technicians) : null;
  if (!tecnicos) return null;
  const progs = o && !Array.isArray(json) ? lista(o.programming ?? o.programmingEntries ?? o.entries) : [];
  return { tecnicos: tecnicos.map(entradaTecnicoDoBackup), programacoes: progs.map(entradaProgramacaoDoBackup) };
}

/**
 * Prepara a restauração: valida cada técnico (modo legado) e cada programação (turno pode faltar), liga a programação ao
 * técnico pelo id antigo, senão pelo NP ou pelo nome. Ids antigos válidos ficam; os outros ganham id novo.
 */
export function prepararRestauracao(dados: NonNullable<ReturnType<typeof lerBackup>>, novoId: () => string):
  { tecnicos: Tecnico[]; programacoes: Programacao[]; avisos: string[] } {
  const avisos: string[] = [];
  const tecnicos: Tecnico[] = [];
  const usados = new Set<string>();
  const idUnico = (id: string) => {
    let novo = ID_VALIDO.test(id) && !usados.has(id) ? id : novoId();
    while (usados.has(novo)) novo = novoId();
    usados.add(novo);
    return novo;
  };
  const deParaId = new Map<string, string>();
  dados.tecnicos.forEach((e, i) => {
    const v = validarTecnico({ ...e, foto: typeof e.foto === "string" && e.foto.length <= LIMITE_FOTO && FOTO_VALIDA.test(e.foto) ? e.foto : "" },
      { legado: true });
    if (!v.ok) { avisos.push(`Técnico ${i + 1} (${normalizarTexto(e.nome) || "sem nome"}): ${Object.values(v.erros).join(" ")}`); return; }
    if (typeof e.foto === "string" && e.foto && !v.valor.foto) avisos.push(`Foto de ${v.valor.nome} não veio (grande demais ou inválida).`);
    const id = idUnico(e.id);
    if (e.id) deParaId.set(e.id, id);
    tecnicos.push({ id, ...v.valor });
  });
  const programacoes: Programacao[] = [];
  dados.programacoes.forEach((e, i) => {
    const pelaChave = tecnicos.find((t) => t.id === deParaId.get(e.tecnicoId as string));
    const tecnico = pelaChave ?? tecnicoDaProgramacao({ tecnicoId: "", np: e.np, tecnicoNome: e.tecnicoNome } as Programacao, tecnicos);
    const v = validarProgramacao({ ...e, tecnicoId: tecnico?.id ?? "" }, tecnicos, { semTurnoPermitido: true });
    if (!v.ok) { avisos.push(`Programação ${i + 1} (ordem ${normalizarTexto(e.ordem) || "?"}): ${Object.values(v.erros).join(" ")}`); return; }
    programacoes.push({ id: idUnico(e.id), ...v.valor, criadoEm: e.criadoEm && !Number.isNaN(Date.parse(e.criadoEm)) ? e.criadoEm : "",
      historico: e.historico });
  });
  return { tecnicos, programacoes, avisos };
}

// ----------------------------------------------------------------------------
// Integração com as bases do site
// ----------------------------------------------------------------------------
/** Turma da equipe (Gestão de HH) → turno do técnico: "1"/"2"/"3" no texto viram o turno; o resto, Administrativo. */
export function turnoDaTurma(turma: string): string {
  const n = /([123])/.exec(String(turma ?? ""))?.[1];
  return n ? `${n}º turno` : "Administrativo";
}

export interface PessoaDaEquipe { np: string; nome: string; centroTrabalho: string; area: string; especialidade?: string; turma: string;
  /** jornada semanal do cadastro da Gestão de HH (h/semana), se houver */
  jornadaSemana?: number | null }

/**
 * Técnicos novos a partir da equipe da Gestão de HH: só quem ainda não está (mesmo NP, sem zeros à esquerda). Jornada/dia =
 * jornada semanal ÷ 5 (arredondada a 0,5 h, entre 1 e 24), ou 8 h.
 */
export function tecnicosDaEquipe(equipe: PessoaDaEquipe[], existentes: Pick<Tecnico, "np">[]): Omit<Tecnico, "id">[] {
  const ja = new Set(existentes.map((t) => chaveNp(t.np)).filter(Boolean));
  const out: Omit<Tecnico, "id">[] = [];
  for (const p of equipe) {
    const np = chaveNp(p.np);
    if (!np || !normalizarTexto(p.nome) || ja.has(np)) continue;
    ja.add(np);
    const j = p.jornadaSemana && p.jornadaSemana > 0 ? Math.round((p.jornadaSemana / 5) * 2) / 2 : 8;
    const v = validarTecnico({ nome: p.nome, np, centro: p.centroTrabalho || "Sem centro", area: p.area || p.especialidade || "Manutenção",
      turno: turnoDaTurma(p.turma), jornada: Math.min(24, Math.max(1, j)) });
    if (v.ok) out.push(v.valor);
  }
  return out;
}

export interface OrdemResumo { ordem: string; tipo: string; texto: string; equipamento: string; denominacao: string; area: string }

/** Campos da programação preenchidos a partir da ordem da IW38 (equipamento com o nome do IH08, quando há). */
export function camposDaOrdem(o: OrdemResumo): Pick<Programacao, "equipamento" | "tipoOrdem" | "descricao" | "area"> {
  const equip = [o.equipamento, o.denominacao].filter(Boolean).join(" · ");
  return { equipamento: equip.slice(0, 80), tipoOrdem: o.tipo.slice(0, 40), descricao: o.texto.slice(0, 300), area: o.area.slice(0, 60) };
}

/** Número da ordem como o SAP traz (só dígitos, sem zeros à esquerda). */
export const chaveOrdem = (v: string) => String(v ?? "").replace(/\D/g, "").replace(/^0+(?=\d)/, "");
