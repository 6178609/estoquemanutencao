import { chave } from "../dados/texto";

/**
 * Regras pequenas usadas em todo o motor — as mesmas de central/util.py.
 *
 * Datas: o SAP só traz o dia, então uma data é um número inteiro de dias desde 01/01/1970 (`Dia`) — comparar,
 * somar e agrupar por mês fica trivial e não há fuso no meio. `null` = sem data.
 */
export type Dia = number;
const MS_DIA = 86_400_000;

export function dia(ano: number, mes: number, d: number): Dia | null {
  const t = Date.UTC(ano, mes - 1, d);
  const x = new Date(t);
  if (x.getUTCFullYear() !== ano || x.getUTCMonth() !== mes - 1 || x.getUTCDate() !== d) return null; // 31/02
  return Math.round(t / MS_DIA);
}

export function partes(d: Dia): { ano: number; mes: number; dia: number; semana: number } {
  const x = new Date(d * MS_DIA);
  return { ano: x.getUTCFullYear(), mes: x.getUTCMonth() + 1, dia: x.getUTCDate(), semana: x.getUTCDay() };
}

/** Hoje no horário da fábrica (o servidor roda em UTC e viraria o dia às 21h). */
export function hoje(): Dia {
  const [a, m, d] = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date()).split("-").map(Number);
  return dia(a, m, d)!;
}

export const MESES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

/** Primeiro dia do mês da data. */
export function inicioDoMes(d: Dia): Dia {
  const p = partes(d);
  return dia(p.ano, p.mes, 1)!;
}

export function somarMeses(d: Dia, n: number): Dia {
  const p = partes(d);
  const t = new Date(Date.UTC(p.ano, p.mes - 1 + n, 1));
  return dia(t.getUTCFullYear(), t.getUTCMonth() + 1, 1)!;
}

/** "02/01/2025" */
export function dataBr(d: Dia | null | undefined): string {
  if (d == null) return "";
  const p = partes(d);
  return `${String(p.dia).padStart(2, "0")}/${String(p.mes).padStart(2, "0")}/${p.ano}`;
}

/** "Jan/25" */
export function mesBr(d: Dia): string {
  const p = partes(d);
  return `${MESES[p.mes - 1]}/${String(p.ano).slice(2)}`;
}

const RX_DATA = /^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})/;
const RX_ISO = /^(\d{4})-(\d{1,2})-(\d{1,2})/;

/** Datas como o sincronizador grava (dd/mm/aaaa, às vezes com hora) ou ISO; só hora ("07:48") não é data. */
export function paraData(v: unknown): Dia | null {
  if (v == null) return null;
  const s = String(v).trim();
  if (!s) return null;
  let m = RX_DATA.exec(s);
  if (m) {
    const a = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
    return dia(a, Number(m[2]), Number(m[1]));
  }
  m = RX_ISO.exec(s);
  if (m) return dia(Number(m[1]), Number(m[2]), Number(m[3]));
  return null;
}

// ----------------------------------------------------------------------------
// Fora da visão do site: Fábrica Piloto, Desenho e alguns centros de trabalho
// ----------------------------------------------------------------------------
export const CENTROS_FORA = new Set(["FABPILOT", "SOFICOM", "ELMCPILT", "MTZ_PILT", "OPER_MTZ", "OPER_MATRIZ", "MATR",
  "OPER", "TPME", "ELMC_MTZ"]);
const LOCALIZACOES_FORA = new Set(["DESEN"]);
const RX_PILOTO = /\bFAB(?:RICA)?\.?\s*PILOT/;

type Linha = Record<string, unknown>;
const codigo = (v: unknown) => String(v ?? "").trim().toUpperCase();

export function foraDaVisao(l: Linha, textos: string[] = []): boolean {
  if ("Centro de trabalho" in l && CENTROS_FORA.has(codigo(l["Centro de trabalho"]))) return true;
  if ("Localização" in l && LOCALIZACOES_FORA.has(codigo(l["Localização"]))) return true;
  if ("Local de instalação" in l && /PILOT|MATRIZARIA/.test(chave(l["Local de instalação"]))) return true;
  for (const nome of ["Objeto técnico", "Denominação", ...textos])
    if (nome in l && RX_PILOTO.test(chave(l[nome]))) return true;
  return false;
}

// ----------------------------------------------------------------------------
// Setor de cada centro de trabalho (pelo código: ..._COMP → Componentes…)
// ----------------------------------------------------------------------------
const SETORES_RX: [RegExp, string][] = [
  [/COMP|GPA|INJ/, "Componentes"], [/MONT/, "Montagem"], [/UTIL|REFRIG/, "Utilidades"], [/CORT/, "Corte"],
  [/(^|_)PRE/, "Predial"], [/MATZ|MATRIZ|MTZ/, "Matrizaria"], [/FERRAM/, "Ferramentaria"], [/LUBRIF/, "Lubrificação"],
  [/^GPM$|PLANEJ/, "Planejamento (GPM)"], [/AUT/, "Automação"], [/TERC/, "Terceiros"], [/SRI/, "SRI"], [/SATELIT/, "Satélite"],
];
export const OUTROS_SETOR = "Outros";
export const SETORES = [...SETORES_RX.map(([, s]) => s), OUTROS_SETOR];
const cacheSetor = new Map<string, string>();

export function setorDoCentro(c: unknown): string {
  const k = codigo(c);
  if (!k) return "";
  let s = cacheSetor.get(k);
  if (s === undefined) {
    s = SETORES_RX.find(([rx]) => rx.test(k))?.[1] ?? OUTROS_SETOR;
    cacheSetor.set(k, s);
  }
  return s;
}

/** Soma ignorando NaN. */
export function soma(xs: Iterable<number>): number {
  let s = 0;
  for (const x of xs) if (!Number.isNaN(x)) s += x;
  return s;
}

/** Mediana (NaN se vazio). */
export function mediana(xs: number[]): number {
  const v = xs.filter((x) => !Number.isNaN(x)).sort((a, b) => a - b);
  if (!v.length) return NaN;
  const m = v.length >> 1;
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
}

export function agrupar<T, K>(xs: T[], chaveDe: (x: T) => K): Map<K, T[]> {
  const m = new Map<K, T[]>();
  for (const x of xs) {
    const k = chaveDe(x);
    const g = m.get(k);
    if (g) g.push(x);
    else m.set(k, [x]);
  }
  return m;
}

/** Hash curto (FNV-1a) de um texto — chave de cache que muda quando o cadastro muda. */
export function hashTexto(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(36) + ":" + s.length;
}
