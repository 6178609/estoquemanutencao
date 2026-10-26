import { casaBusca, chave as chaveTexto, normalizarBusca } from "../dados/texto";
import { ENCERRADA_SEM_CONF } from "./preparo";
import * as planos from "./planos";
import { dia, mediana, partes, type Dia } from "./util";

/**
 * Mapa 52 semanas: as chamadas dos planos (IP19) de um ano num quadro plano × semana ISO, com o HH de cada semana
 * contra a capacidade da equipe (Gerenciador de HH). Só o que a IP19 trouxer — nada é projetado.
 *
 * - Status da chamada: Executada (concluída na IP19/IW38 ou ordem encerrada), Saltada (ignorada/cancelada),
 *   Pendente de liberação (ordem gerada e ainda "Aberta" no IW38), Ordem gerada (solicitada/chamada) e A gerar
 *   (em espera). Data já passada sem execução marca a chamada como atrasada.
 * - Disciplina: o tipo entre parênteses no status da IP19 ("Programado,espera (Inspeção)" → Inspeção).
 * - Periodicidade: o ciclo da IP19; sem ele, o código do pacote (S, M, 2M, 6M, 1A…); sem pacote legível, estimada
 *   pelo intervalo entre as chamadas do plano.
 * - Capacidade de um centro da IP19: a configurada em Metas; senão a equipe do mesmo centro; senão a equipe dos centros
 *   ligados (COMPONEN → MEC_COMP, ELE_COMP, ELMCCOMP; MONTAGEM → *MONT; UTILIDAD → *UTIL), cada um com a capacidade
 *   configurada em Metas ou a do Gerenciador de HH.
 * Testado em testes/mapa52.test.ts.
 */

export const A_GERAR = "A gerar", GERADA = "Ordem gerada", PENDENTE = "Pendente de liberação", EXECUTADA = "Executada",
  SALTADA = "Saltada";
export const STATUS = [GERADA, A_GERAR, PENDENTE, EXECUTADA, SALTADA] as const;
export type Status52 = (typeof STATUS)[number];
/** Na célula com mais de uma chamada, vale o primeiro desta lista. */
const PRIORIDADE: Status52[] = [PENDENTE, GERADA, A_GERAR, EXECUTADA, SALTADA];
export const SEM_DISCIPLINA = "Sem disciplina";
/** Marca de cada status no texto da célula (o status não fica só na cor). */
export const SIMBOLO: Record<Status52, string> = { [GERADA]: "●", [A_GERAR]: "○", [PENDENTE]: "◆", [EXECUTADA]: "✓", [SALTADA]: "–" };

type Ch = planos.ChamadaClassificada;

export function status52(c: Ch): Status52 {
  if (c.situacao === planos.SALTADA) return SALTADA;
  if (c.situacao === planos.CONCLUIDA || c.situacaoIw38 === ENCERRADA_SEM_CONF) return EXECUTADA;
  if (c.ordem !== "" && c.situacaoIw38 === "Aberta") return PENDENTE;
  if (c.ordem !== "" || /SOLICITAD|CHAMAD/.test(chaveTexto(c.tipoProgramacao))) return GERADA;
  return A_GERAR;
}

export const disciplina = (c: Ch) => c.atividade || SEM_DISCIPLINA;

// ----------------------------------------------------------------------------
// Periodicidade
// ----------------------------------------------------------------------------
const SIGLAS: [RegExp, string, string][] = [
  [/^D$/, "D", "Diário"], [/^S$/, "S", "Semanal"], [/^Q$/, "Q", "Quinzenal"], [/^1?M$/, "M", "Mensal"], [/^2M$/, "2M", "Bimestral"],
  [/^3M$/, "3M", "Trimestral"], [/^4M$/, "4M", "Quadrimestral"], [/^6M$/, "6M", "Semestral"], [/^(1A|A|12M)$/, "A", "Anual"],
  [/^2A$/, "2A", "Bienal"],
];
const NOME_SIGLA: Record<string, string> = Object.fromEntries(SIGLAS.map(([, s, n]) => [n, s]));

/** Sigla e nome de um código de pacote/ciclo ("2M" → 2M/Bimestral); null se não for código conhecido. */
function deCodigo(v: string): { sigla: string; nome: string } | null {
  const k = chaveTexto(v).replace(/\s+/g, "");
  for (const [re, sigla, nome] of SIGLAS) if (re.test(k) || chaveTexto(nome) === k) return { sigla, nome };
  return null;
}

export interface Periodicidade { sigla: string; nome: string }

const DIAS_POR: [RegExp, number][] = [[/^D/, 1], [/^S/, 7], [/^M/, 30], [/^A/, 365]];
/** Ciclo escrito como intervalo ("14 DIA", "2 SEM", "6 MES") → periodicidade pelo número de dias. */
function deIntervalo(v: string): Periodicidade | null {
  const m = /^(\d+(?:[.,]\d+)?)\s*([A-Z]+)/.exec(chaveTexto(v));
  const f = m && DIAS_POR.find(([re]) => re.test(m[2]));
  if (!m || !f) return null;
  const nome = planos.nomeDoCiclo(Number(m[1].replace(",", ".")) * f[1]).replace("*", "");
  return { sigla: NOME_SIGLA[nome] ?? nome.slice(0, 2), nome };
}

/** Periodicidade de cada plano (pela chave), pelo histórico inteiro de chamadas recebidas. */
export function periodicidades(ch: Ch[]): Map<string, Periodicidade> {
  const porPlano = new Map<string, Ch[]>();
  for (const c of ch) (porPlano.get(c.chave) ?? porPlano.set(c.chave, []).get(c.chave)!).push(c);
  const out = new Map<string, Periodicidade>();
  for (const [k, g] of porPlano) {
    let p: Periodicidade | null = null;
    for (const c of g) if (!p && c.ciclo) p = deCodigo(c.ciclo) ?? deIntervalo(c.ciclo) ?? { sigla: c.ciclo.slice(0, 3), nome: c.ciclo };
    // pacote "S 4 7" → o primeiro código legível (S); números soltos não dizem o ciclo
    if (!p) for (const c of g) {
      for (const t of c.pacote.split(/\s+/)) { p = deCodigo(t); if (p) break; }
      if (p) break;
    }
    if (!p) {
      const datas = [...new Set(g.map((c) => c.data).filter((d): d is Dia => d != null))].sort((a, b) => a - b);
      const med = mediana(datas.slice(1).map((d, i) => d - datas[i]));
      if (!Number.isNaN(med)) {
        const nome = planos.nomeDoCiclo(med).replace("*", "");
        p = { sigla: NOME_SIGLA[nome] ?? nome.slice(0, 2), nome };
      }
    }
    out.set(k, p ?? { sigla: "·", nome: "Sem periodicidade" });
  }
  return out;
}

// ----------------------------------------------------------------------------
// Semanas do ano ISO
// ----------------------------------------------------------------------------
const MESES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
export interface Semana { n: number; segunda: Dia; mes: string; rotulo: string }

/** As 52 (ou 53) semanas ISO do ano, cada uma no mês da sua quinta-feira. */
export function semanasDoAno(ano: number): Semana[] {
  const s1 = planos.segunda(dia(ano, 1, 4)!); // a semana 1 contém o dia 4 de janeiro
  const out: Semana[] = [];
  for (let s = s1, n = 1; planos.semanaIso(s).ano === ano; s += 7, n++)
    out.push({ n, segunda: s, mes: MESES[partes(s + 3).mes - 1], rotulo: String(n).padStart(2, "0") });
  return out;
}

/** Anos ISO com alguma chamada (crescente). */
export function anos(ch: Ch[]): number[] {
  return [...new Set(ch.map((c) => c.ano).filter((a): a is number => a != null))].sort((a, b) => a - b);
}

// ----------------------------------------------------------------------------
// Filtros
// ----------------------------------------------------------------------------
export interface Filtro52 {
  ano: number; disciplinas?: string[]; centros?: string[]; periodicidades?: string[]; status?: string[]; busca?: string;
}

/** Chamadas do ano que passam nos filtros (status filtra a chamada, não o plano). */
export function filtrar(ch: Ch[], f: Filtro52, per: Map<string, Periodicidade>): Ch[] {
  const em = (l?: string[]) => (l?.length ? new Set(l) : null);
  const dis = em(f.disciplinas), ctr = em(f.centros), pe = em(f.periodicidades), st = em(f.status);
  const b = f.busca?.trim() ?? "";
  return ch.filter((c) => c.ano === f.ano && c.semana != null
    && (!dis || dis.has(disciplina(c))) && (!ctr || ctr.has(c.centroTrabalho))
    && (!pe || pe.has(per.get(c.chave)?.nome ?? "")) && (!st || st.has(status52(c)))
    && (!b || casaBusca(normalizarBusca(`${c.chave} ${c.texto} ${c.local} ${c.equipamento} ${c.objeto}`), b)));
}

// ----------------------------------------------------------------------------
// O mapa
// ----------------------------------------------------------------------------
export interface Celula52 { status: Status52; n: number; atrasada: boolean; hh: number }
export interface Linha52 {
  chave: string; texto: string; local: string; equipamento: string; centro: string; disciplina: string;
  periodicidade: Periodicidade; chamadas: number; hh: number;
  /** HH médio de uma chamada */
  hhChamada: number;
  /** semana (1..53) → célula */
  celulas: Record<number, Celula52>;
}
export const ORDENS = { centro: "Centro · periodicidade", plano: "Plano", hh: "HH no ano" } as const;
export type Ordenar = keyof typeof ORDENS;

const moda = (vs: string[]) => {
  const m = new Map<string, number>();
  for (const v of vs) if (v) m.set(v, (m.get(v) ?? 0) + 1);
  let melhor = "", n = 0;
  for (const [v, q] of m) if (q > n || (q === n && v < melhor)) { melhor = v; n = q; }
  return melhor;
};
const PESO_PER = new Map(SIGLAS.map(([, s], i) => [s, i]));

/** Uma linha por plano com as chamadas (já filtradas) do ano. */
export function mapa(ch: Ch[], per: Map<string, Periodicidade>, hoje: Dia, ordenar: Ordenar = "centro"): Linha52[] {
  const grupos = new Map<string, Ch[]>();
  for (const c of ch) if (c.semana != null) (grupos.get(c.chave) ?? grupos.set(c.chave, []).get(c.chave)!).push(c);
  const linhas: Linha52[] = [];
  for (const [k, g] of grupos) {
    const celulas: Record<number, Celula52> = {};
    let hh = 0;
    for (const c of g) {
      const s = status52(c);
      const atrasada = c.data != null && c.data < hoje && s !== EXECUTADA && s !== SALTADA;
      hh += c.horas;
      const x = celulas[c.semana!];
      if (!x) celulas[c.semana!] = { status: s, n: 1, atrasada, hh: c.horas };
      else {
        x.n++; x.hh += c.horas; x.atrasada ||= atrasada;
        if (PRIORIDADE.indexOf(s) < PRIORIDADE.indexOf(x.status)) x.status = s;
      }
    }
    linhas.push({
      chave: k, texto: moda(g.map((c) => c.texto)), local: moda(g.map((c) => c.local)),
      equipamento: moda(g.map((c) => c.objeto || c.equipamento)), centro: moda(g.map((c) => c.centroTrabalho)),
      disciplina: moda(g.map(disciplina)), periodicidade: per.get(k) ?? { sigla: "·", nome: "Sem periodicidade" },
      chamadas: g.length, hh, hhChamada: hh / g.length, celulas,
    });
  }
  const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
  const porPlano = (a: Linha52, b: Linha52) => cmp(a.chave, b.chave);
  if (ordenar === "plano") return linhas.sort(porPlano);
  if (ordenar === "hh") return linhas.sort((a, b) => b.hh - a.hh || porPlano(a, b));
  return linhas.sort((a, b) => cmp(a.centro, b.centro)
    || (PESO_PER.get(a.periodicidade.sigla) ?? 99) - (PESO_PER.get(b.periodicidade.sigla) ?? 99) || porPlano(a, b));
}

// ----------------------------------------------------------------------------
// Carga × capacidade
// ----------------------------------------------------------------------------
export interface CargaSemana {
  semana: number; hh: number; ordens: number; semOrdem: number;
  porDisciplina: Record<string, { hh: number; ordens: number }>;
  porCentro: Record<string, { hh: number; ordens: number }>;
}

/** HH e chamadas de cada semana do ano (saltadas não são trabalho e ficam fora). */
export function cargaSemanal(ch: Ch[], semanas: Semana[]): CargaSemana[] {
  const out = semanas.map((s): CargaSemana => ({ semana: s.n, hh: 0, ordens: 0, semOrdem: 0, porDisciplina: {}, porCentro: {} }));
  for (const c of ch) {
    if (c.semana == null || status52(c) === SALTADA) continue;
    const x = out[c.semana - 1];
    if (!x) continue;
    x.hh += c.horas; x.ordens++;
    if (c.ordem === "") x.semOrdem++;
    const d = (x.porDisciplina[disciplina(c)] ??= { hh: 0, ordens: 0 });
    d.hh += c.horas; d.ordens++;
    const k = c.centroTrabalho || "(sem centro)";
    const t = (x.porCentro[k] ??= { hh: 0, ordens: 0 });
    t.hh += c.horas; t.ordens++;
  }
  return out;
}

/** HH por mês (1..12, pela quinta-feira da semana) e disciplina. */
export function hhMensal(carga: CargaSemana[], semanas: Semana[]): Record<string, number>[] {
  const out = Array.from({ length: 12 }, () => ({} as Record<string, number>));
  carga.forEach((x, i) => {
    const m = partes(semanas[i].segunda + 3).mes - 1;
    for (const [d, v] of Object.entries(x.porDisciplina)) out[m][d] = (out[m][d] ?? 0) + v.hh;
  });
  return out;
}

/**
 * Centros da equipe que respondem pelo centro da IP19: o mesmo código; senão os centros da equipe cujo final (sem o
 * prefixo da especialidade MEC_, ELE_, ELMC, TEC_, SRV_, OPER_) é o começo do código da IP19 (COMPONEN → *COMP).
 */
export function centrosDaEquipe(centroIp19: string, daEquipe: string[]): string[] {
  if (!centroIp19) return [];
  if (daEquipe.includes(centroIp19)) return [centroIp19];
  const ini = centroIp19.slice(0, 4).toUpperCase();
  if (ini.length < 4) return [];
  return daEquipe.filter((e) => {
    const m = /^(MEC_|ELE_|ELMC|TEC_|SRV_|OPER_)(.+)$/.exec(e.toUpperCase());
    return !!m && m[2].startsWith(ini);
  }).sort();
}

export interface Capacidade52 { horas: number | null; origem: string }

/** Centros conhecidos: os da equipe com gente e os configurados em Metas. */
const conhecidos = (disp: Record<string, [number, number]>, conf: Record<string, number>) =>
  [...new Set([...Object.keys(disp).filter((k) => disp[k][1] > 0), ...Object.keys(conf).filter((k) => k && conf[k] > 0)])];
/** Horas de um centro da equipe: a configurada em Metas vale no lugar do Gerenciador de HH (como na Programação semanal). */
const horasDe = (e: string, disp: Record<string, [number, number]>, conf: Record<string, number>) =>
  conf[e] != null && conf[e] > 0 ? conf[e] : disp[e]?.[0] ?? 0;

/**
 * Capacidade semanal de um centro da IP19: configurada (Metas) › equipe do centro › equipe dos centros ligados
 * (centrosDaEquipe). `disp` = {centro da equipe: [horas disponíveis na semana, técnicos]} (Gerenciador de HH).
 */
export function capacidadeDoCentro(centro: string, disp: Record<string, [number, number]>,
  configurada: Record<string, number> = {}): Capacidade52 {
  const conf = configurada[centro];
  if (conf != null && conf > 0) return { horas: conf, origem: "configurada em Metas" };
  const cs = centrosDaEquipe(centro, conhecidos(disp, configurada));
  if (!cs.length) return { horas: null, origem: "sem equipe cadastrada" };
  return { horas: cs.reduce((s, k) => s + horasDe(k, disp, configurada), 0), origem: `equipe ${cs.join(" + ")}` };
}

/** Capacidade de um conjunto de centros da IP19 sem contar duas vezes o mesmo centro da equipe. */
export function capacidadeDosCentros(centros: string[], disp: Record<string, [number, number]>,
  configurada: Record<string, number> = {}): number | null {
  const daEquipe = conhecidos(disp, configurada);
  const usados = new Set<string>();
  let total = 0, achou = false;
  for (const c of new Set(centros)) {
    const conf = configurada[c];
    if (conf != null && conf > 0 && !daEquipe.includes(c)) { total += conf; achou = true; continue; }
    for (const e of centrosDaEquipe(c, daEquipe)) if (!usados.has(e)) { usados.add(e); total += horasDe(e, disp, configurada); achou = true; }
  }
  return achou ? total : null;
}

/** Soma da capacidade de toda a equipe na semana. */
export const capacidadeTotal = (disp: Record<string, [number, number]>) =>
  Object.values(disp).reduce((s, [h]) => s + h, 0);

export const FAIXAS = ["Disponível", "Meta", "Limite", "Sobrecarga"] as const;
export type Faixa = (typeof FAIXAS)[number];
/** Até 85% disponível · 85–90% meta · 90–95% limite · acima de 95% sobrecarga. */
export function faixa(pct: number | null): Faixa | null {
  if (pct == null) return null;
  if (pct <= 85) return "Disponível";
  if (pct <= 90) return "Meta";
  if (pct <= 95) return "Limite";
  return "Sobrecarga";
}

export const utilizacao = (hh: number, cap: number | null) => (cap && cap > 0 ? (hh / cap) * 100 : null);
