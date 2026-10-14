/**
 * Programação do mês (previsão manual) e pedidos de mudança de datas ao robô do SAP — porta de
 * central/mudanca_datas.py (as mesmas regras e os MESMOS arquivos do app Streamlit):
 * - `programacao_maquinas.json`: {"AAAA-MM-DD": {"campos": [...]}} — campos de ordenação das máquinas que param;
 * - `mudancas_datas.json`: os lotes (pedidos) que o sincronizador do PC com o SAP executa (status "solicitada");
 * - `robo_pc.json`: sinal de vida do sincronizador de cada PC.
 * A tela "Programação do mês" foi retirada; o Calendário de ordens ainda usa datasAlteradas e nomesDeAtivos.
 * Funções puras (testadas em testes/programacao.test.ts).
 */
import { dia, partes, type Dia } from "@/lib/wcm/util";

export const ARQ_PROGRAMACAO = "programacao_maquinas.json";
export const ARQ_LOTES = "mudancas_datas.json";
export const ARQ_ROBO_PC = "robo_pc.json";
export const DIAGNOSTICO = "diagnostico";
export const RECURSOS_NECESSARIOS = ["mudar_datas_iw38", "diagnostico"];
export const SINAL_MAX_MIN = 45;
export const MAX_ORDENS_LOTE = 300;
export const DESDE_SEMPRE = "2000-01-01";

export const RASCUNHO = "rascunho", SOLICITADA = "solicitada", EM_EXECUCAO = "em_execucao", CONCLUIDA = "concluida",
  COM_ERROS = "com_erros", CANCELADA = "cancelada";
export const ROTULO_STATUS: Record<string, string> = {
  [SOLICITADA]: "Aguardando o robô do SAP", [EM_EXECUCAO]: "Em execução no SAP", [CONCLUIDA]: "Concluída",
  [COM_ERROS]: "Concluída com erros", [CANCELADA]: "Cancelada", [RASCUNHO]: "Rascunho",
};
export const ABERTOS = [SOLICITADA, EM_EXECUCAO];
export const MESES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro",
  "Novembro", "Dezembro"];

export interface Consulta { dia: string; campos: string[]; de: string; ate: string }
export interface ItemLote {
  ordem: string; campo?: string; dia?: string; de_inicio?: string; de_fim?: string; para_inicio?: string; para_fim?: string;
  resultado?: string; mensagem?: string;
}
export interface Lote {
  criado_em?: string; criado_por?: string; status?: string; simular?: boolean; tipo?: string; origem?: string;
  atrasadas?: boolean; consultas?: Consulta[]; itens?: ItemLote[]; resumo?: string; teste?: Record<string, string>;
  executado_em?: string; iniciado_em?: string; atualizado_em?: string; progresso?: { texto?: string; em?: string };
  etapas?: { ok?: boolean; etapa?: string; detalhe?: string }[]; ordens_encontradas?: string[];
  campos_tela?: { id?: string; tipo?: string; texto?: string }[];
  consultas_resultado?: { dia?: string; campos?: string[]; encontradas?: number; erro?: string }[];
  [k: string]: unknown;
}

const p2 = (n: number) => String(n).padStart(2, "0");
export const isoDe = (d: Dia) => { const p = partes(d); return `${p.ano}-${p2(p.mes)}-${p2(p.dia)}`; };
export const deIso = (s: string): Dia | null => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  return m ? dia(+m[1], +m[2], +m[3]) : null;
};
export const fimDoMes = (d: Dia): Dia => { const p = partes(d); return dia(p.mes === 12 ? p.ano + 1 : p.ano, p.mes === 12 ? 1 : p.mes + 1, 1)! - 1; };
const inicioDoMes = (d: Dia): Dia => d - (partes(d).dia - 1);

/** "41020389, 41019661;41020389" → ["41020389", "41019661"] (vírgula, ponto e vírgula, espaço ou linha). */
export function separarCampos(texto: unknown): string[] {
  const vistos: string[] = [];
  for (const c of String(texto ?? "").trim().split(/[\s,;]+/)) {
    const x = c.trim().toUpperCase();
    if (x && !vistos.includes(x)) vistos.push(x);
  }
  return vistos;
}

/** Só datas ISO válidas com lista de campos não vazia (o cadastro guarda metadados junto). */
export function programacaoValida(prog: Record<string, unknown> | null | undefined): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const [k, v] of Object.entries(prog ?? {})) {
    if (deIso(k) == null) continue;
    const campos = v && typeof v === "object" && !Array.isArray(v) ? (v as { campos?: unknown }).campos : v;
    const lista = separarCampos((Array.isArray(campos) ? campos : campos ? [campos] : []).map(String).join(" "));
    if (lista.length) out[k] = lista;
  }
  return out;
}

/**
 * Consultas da IW38 para os dias de [ini, fim]. Para cada máquina, as paradas do mês dividem o mês: cada dia recebe
 * as ordens com data desde o dia seguinte à parada anterior (ou o início do mês; com `atrasadas`, desde sempre) até
 * ele; a última parada do mês leva também as ordens até o fim do mês.
 */
export function consultas(prog: Record<string, string[]>, ini: Dia, fim: Dia, atrasadas = false): Consulta[] {
  const porCampo = new Map<string, Dia[]>();
  for (const [d, campos] of Object.entries(prog)) {
    const x = deIso(d);
    if (x == null) continue;
    for (const c of campos) (porCampo.get(c) ?? porCampo.set(c, []).get(c)!).push(x);
  }
  const grupos = new Map<string, { d: Dia; de: Dia; ate: Dia; campos: string[] }>();
  for (const [campo, dias] of porCampo) {
    const meses = new Set(dias.map((d) => inicioDoMes(d)));
    for (const m of meses) {
      const paradas = [...new Set(dias.filter((d) => inicioDoMes(d) === m))].sort((a, b) => a - b);
      paradas.forEach((d, i) => {
        if (d < ini || d > fim) return;
        const de = i ? paradas[i - 1] + 1 : atrasadas ? deIso(DESDE_SEMPRE)! : inicioDoMes(d);
        const ate = i < paradas.length - 1 ? d : fimDoMes(d);
        const k = `${d}|${de}|${ate}`;
        (grupos.get(k) ?? grupos.set(k, { d, de, ate, campos: [] }).get(k)!).campos.push(campo);
      });
    }
  }
  return [...grupos.values()].sort((a, b) => a.d - b.d || a.de - b.de || a.ate - b.ate)
    .map((g) => ({ dia: isoDe(g.d), campos: g.campos.sort(), de: isoDe(g.de), ate: isoDe(g.ate) }));
}

export interface OrdemCampo {
  ordem: string; campo: string; texto: string; tipo: string; situacao: string; inicio: Dia | null; fim: Dia | null;
}
export interface Prevista {
  dia: string; ordem: string; campo: string; ativo: string; texto: string; tipo: string; situacao: string;
  inicioAtual: Dia | null; fimAtual: Dia | null;
}

/** Prévia pelo IW38 exportado: ordens abertas/liberadas que cada consulta deve trazer. */
export function estimativa(ordens: OrdemCampo[] | null, cons: Consulta[], concluidas: Set<string> = new Set(),
  nomes: Record<string, string> = {}): Prevista[] {
  if (!ordens?.length || !cons.length) return [];
  const abertas = ordens.filter((o) => (o.situacao === "Aberta" || o.situacao === "Liberada") && !concluidas.has(o.ordem));
  const out: Prevista[] = [];
  for (const c of cons) {
    const set = new Set(c.campos), de = deIso(c.de)!, ate = deIso(c.ate)!;
    for (const o of abertas) {
      if (!set.has(o.campo) || o.inicio == null || o.inicio < de || o.inicio > ate) continue;
      out.push({ dia: c.dia, ordem: o.ordem, campo: o.campo, ativo: nomes[o.campo] ?? "", texto: o.texto, tipo: o.tipo,
        situacao: o.situacao, inicioAtual: o.inicio, fimAtual: o.fim });
    }
  }
  const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
  return out.sort((a, b) => cmp(a.dia, b.dia) || cmp(a.campo, b.campo) || cmp(a.ordem, b.ordem));
}

// ----------------------------------------------------------------------------
// Lotes
// ----------------------------------------------------------------------------
/** Agora em UTC, ISO com segundos ("2026-10-12T13:05:00+00:00"), como o Python. */
export const agora = (t = new Date()) => t.toISOString().replace(/\.\d{3}Z$/, "+00:00");

/** Id do lote: "AAAAMMDD-HHMMSS-xxxx" no horário da fábrica. */
export function novoId(t = new Date(), aleatorio = Math.random): string {
  const f = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).formatToParts(t);
  const v = (k: string) => f.find((x) => x.type === k)?.value ?? "00";
  const hex = Array.from({ length: 4 }, () => Math.floor(aleatorio() * 16).toString(16)).join("");
  return `${v("year")}${v("month")}${v("day")}-${v("hour")}${v("minute")}${v("second")}-${hex}`;
}

export function novoLote(cons: Consulta[], usuario: string, simular = false, atrasadas = false): [string, Lote] {
  if (!cons.length) throw new Error("Nenhum dia com campo de ordenação no período escolhido.");
  return [novoId(), { criado_em: agora(), criado_por: usuario, status: SOLICITADA, simular, origem: "programação do mês",
    atrasadas, consultas: cons, itens: [], resumo: "" }];
}

export function loteDesfazer(lote: Lote, usuario: string): [string, Lote] {
  const itens = (lote.itens ?? []).filter((i) => i.resultado === "ok" && i.de_inicio);
  if (!itens.length) throw new Error("Nada para desfazer neste lote (nenhuma ordem alterada com sucesso).");
  const novos = itens.map((i) => ({ ordem: i.ordem, campo: i.campo ?? "", dia: i.de_inicio ?? "", de_inicio: i.para_inicio ?? "",
    de_fim: i.para_fim ?? "", para_inicio: i.de_inicio!, para_fim: i.de_fim || i.de_inicio!, resultado: "", mensagem: "" }));
  return [novoId(), { criado_em: agora(), criado_por: usuario, status: SOLICITADA, simular: false, origem: "desfazer",
    consultas: [], itens: novos, resumo: "" }];
}

export function novoDiagnostico(usuario: string, campo = "", ordem = "", de?: Dia, ate?: Dia): [string, Lote] {
  const c = separarCampos(campo)[0] ?? "";
  const teste = Object.fromEntries(Object.entries({ campo: c, ordem: String(ordem ?? "").replace(/\D/g, ""),
    de: de != null ? isoDe(de) : "", ate: ate != null ? isoDe(ate) : "" }).filter(([, v]) => v));
  return [novoId(), { criado_em: agora(), criado_por: usuario, status: SOLICITADA, simular: true, tipo: DIAGNOSTICO,
    origem: "teste do robô", teste, consultas: [], itens: [], resumo: "" }];
}

/** Ordem → [início, fim] gravados pelo robô depois do último export do IW38 (o calendário usa até o próximo export). */
export function datasAlteradas(lotes: Record<string, unknown>, depoisDe: string | null = null): Record<string, [string, string]> {
  const limite = depoisDe ? Date.parse(depoisDe) : NaN;
  const exec: [number, Lote][] = [];
  for (const v of Object.values(lotes ?? {})) {
    const l = v as Lote;
    if (!l || typeof l !== "object" || l.simular || !l.executado_em) continue;
    const q = Date.parse(l.executado_em);
    if (Number.isNaN(q) || (!Number.isNaN(limite) && q <= limite)) continue;
    exec.push([q, l]);
  }
  const out: Record<string, [string, string]> = {};
  for (const [, l] of exec.sort((a, b) => a[0] - b[0]))
    for (const it of l.itens ?? []) if (it.resultado === "ok" && it.para_inicio) out[it.ordem] = [it.para_inicio, it.para_fim || it.para_inicio];
  return out;
}

export interface LinhaLote {
  lote: string; criadoEm: string; por: string; situacao: string; status: string; simulacao: boolean; origem: string; dias: string;
  ordens: number; ok: number; erros: number; resumo: string; diagnostico: boolean;
}

export function tabelaLotes(lotes: Record<string, unknown>): LinhaLote[] {
  const out: LinhaLote[] = [];
  for (const [id, v] of Object.entries(lotes ?? {})) {
    const l = v as Lote;
    if (!l || typeof l !== "object") continue;
    const itens = l.itens ?? [];
    const dias = [...new Set((l.consultas ?? []).map((c) => c.dia))].sort().map((d) => `${d.slice(8, 10)}/${d.slice(5, 7)}`);
    out.push({ lote: id, criadoEm: l.criado_em ?? "", por: l.criado_por ?? "", status: l.status ?? "",
      situacao: ROTULO_STATUS[l.status ?? ""] ?? l.status ?? "", simulacao: !!l.simular && l.tipo !== DIAGNOSTICO,
      origem: l.origem ?? "", dias: dias.join(", "), ordens: itens.length, ok: itens.filter((i) => i.resultado === "ok").length,
      erros: itens.filter((i) => i.resultado === "erro").length, resumo: l.resumo ?? "", diagnostico: l.tipo === DIAGNOSTICO });
  }
  return out.sort((a, b) => (Date.parse(b.criadoEm) || 0) - (Date.parse(a.criadoEm) || 0));
}

// ----------------------------------------------------------------------------
// Situação do robô (sinal de vida que o sincronizador de cada PC grava em robo_pc.json)
// ----------------------------------------------------------------------------
export interface SituacaoRobo { pc: string; estado: "ok" | "desatualizado" | "nao_configurado" | "offline"; texto: string; vistoMin: number; versao: string }

export function tempo(min: number): string {
  if (min < 1) return "menos de 1 min";
  if (min < 120) return `${min} min`;
  if (min < 48 * 60) return `${Math.floor(min / 60)} h`;
  return min < 10 ** 6 ? `${Math.floor(min / 1440)} dia(s)` : "muito tempo";
}

export function situacaoRobo(sinais: Record<string, unknown>, agoraMs = Date.now()): SituacaoRobo[] {
  const out: SituacaoRobo[] = [];
  for (const [pc, v] of Object.entries(sinais ?? {})) {
    if (!v || typeof v !== "object") continue;
    const s = v as { visto_em?: string; recursos?: string[]; versao_codigo?: string; robo_configurado?: boolean };
    const visto = Date.parse(s.visto_em ?? "");
    const min = Number.isNaN(visto) ? 10 ** 6 : Math.max(0, Math.floor((agoraMs - visto) / 60_000));
    const faltam = RECURSOS_NECESSARIOS.filter((r) => !(s.recursos ?? []).includes(r));
    let estado: SituacaoRobo["estado"], texto: string;
    if (min > SINAL_MAX_MIN) { estado = "offline"; texto = `sem sinal há ${tempo(min)} (PC desligado, Windows sem ninguém logado ou sincronizador parado)`; }
    else if (faltam.length) { estado = "desatualizado"; texto = "código antigo neste PC — rode o atualizar.bat (pasta do sistema)"; }
    else if (!s.robo_configurado) { estado = "nao_configurado"; texto = "sincronizador ligado, mas o robô do SAP não está configurado (rode automacao\\configurar_robo.bat)"; }
    else { estado = "ok"; texto = `pronto · visto há ${tempo(min)}`; }
    out.push({ pc, estado, texto, vistoMin: min, versao: s.versao_codigo || "?" });
  }
  return out.sort((a, b) => a.vistoMin - b.vistoMin);
}

/** Minutos desde a última notícia de um lote aberto. */
export function paradoHa(l: Lote, agoraMs = Date.now()): number | null {
  const ts = [l.atualizado_em, l.iniciado_em, l.criado_em, l.progresso?.em].map((x) => Date.parse(x ?? "")).filter((x) => !Number.isNaN(x));
  return ts.length ? Math.floor((agoraMs - Math.max(...ts)) / 60_000) : null;
}

/** Código → nome do ativo: o objeto técnico mais comum das ordens (o campo de ordenação vence o equipamento); o IH08 por cima. */
export function nomesDeAtivos(ordens: { equipamento: string; campo: string; objeto: string }[], ih08: [string, string][]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const col of ["equipamento", "campo"] as const) {
    const cont = new Map<string, Map<string, number>>();
    for (const o of ordens) {
      const k = (o[col] ?? "").trim().toUpperCase();
      if (!k || !o.objeto) continue;
      const m = cont.get(k) ?? cont.set(k, new Map()).get(k)!;
      m.set(o.objeto, (m.get(o.objeto) ?? 0) + 1);
    }
    for (const [k, m] of cont) {
      let melhor = "", n = -1;
      for (const [v, q] of m) if (q > n || (q === n && v < melhor)) { melhor = v; n = q; }
      out[k] = melhor;
    }
  }
  for (const [e, nome] of ih08) if (nome.trim()) out[e.trim().toUpperCase()] = nome;
  return out;
}

