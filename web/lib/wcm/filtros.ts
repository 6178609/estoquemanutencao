import { dataBr, dia, hoje as hojeLocal, partes, somarMeses, inicioDoMes, type Dia } from "./util";

/**
 * Filtros globais: período "de/até" com atalhos, área, setor, centro de trabalho e tipo
 * de ordem. Valem para todas as abas — ficam no endereço (?ini=…) e num cookie, para trocar de aba manter o recorte.
 */
export interface Filtros {
  ini: Dia;
  fim: Dia;
  areas: string[];
  setores: string[];
  centros: string[];
  tipos: string[];
}

export const COOKIE_FILTROS = "cm_filtros";
const ATALHOS = ["Mês atual", "Mês passado", "Últimos 3 meses", "Próximos 30 dias", "Ano atual", "Últimos 12 meses", "Tudo"] as const;
type Atalho = (typeof ATALHOS)[number];

const iso = (d: Dia) => { const p = partes(d); return `${p.ano}-${String(p.mes).padStart(2, "0")}-${String(p.dia).padStart(2, "0")}`; };
const deIso = (s: string | undefined | null): Dia | null => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || "");
  return m ? dia(Number(m[1]), Number(m[2]), Number(m[3])) : null;
};

function periodoDoAtalho(a: Atalho, hoje: Dia, minimo?: Dia | null, maximo?: Dia | null): [Dia, Dia] {
  const mes = inicioDoMes(hoje);
  switch (a) {
    case "Mês atual": return [mes, hoje];
    case "Mês passado": return [somarMeses(mes, -1), mes - 1];
    case "Últimos 3 meses": return [somarMeses(mes, -2), hoje];
    case "Próximos 30 dias": return [hoje, hoje + 30];
    case "Ano atual": return [dia(partes(hoje).ano, 1, 1)!, hoje];
    case "Últimos 12 meses": return [somarMeses(mes, -11), hoje];
    case "Tudo": return [minimo ?? somarMeses(mes, -24), Math.max(maximo ?? hoje, hoje)];
  }
}

function padrao(hoje = hojeLocal()): Filtros {
  return { ini: inicioDoMes(hoje), fim: hoje, areas: [], setores: [], centros: [], tipos: [] };
}

const lista = (v: string | string[] | undefined) => (Array.isArray(v) ? v : v ? v.split(",") : []).map((x) => x.trim()).filter(Boolean).slice(0, 60);

/** Lê os filtros do endereço; o que não vier no endereço vem do cookie (a última escolha) ou do padrão. */
export function lerFiltros(params: Record<string, string | string[] | undefined>, cookie?: string | null, hoje = hojeLocal(),
  limites: { minimo?: Dia | null; maximo?: Dia | null } = {}): Filtros {
  let salvo: Partial<Record<string, string>> = {};
  try { salvo = cookie ? JSON.parse(decodeURIComponent(cookie)) : {}; } catch { salvo = {}; }
  const tem = (k: string) => params[k] !== undefined;
  const v = (k: string) => (tem(k) ? params[k] : salvo[k]);
  const p = padrao(hoje);
  let ini = deIso(String(v("ini") ?? "")) ?? p.ini, fim = deIso(String(v("fim") ?? "")) ?? p.fim;
  // atalho no endereço (ou guardado) vale sobre as datas: "Mês atual" continua sendo o mês atual amanhã
  const at = String((tem("ini") || tem("fim") ? params.atalho : v("atalho")) ?? "");
  if ((ATALHOS as readonly string[]).includes(at)) [ini, fim] = periodoDoAtalho(at as Atalho, hoje, limites.minimo, limites.maximo);
  if (fim < ini) [ini, fim] = [fim, ini];
  return { ini, fim, areas: lista(v("area") as string), setores: lista(v("setor") as string), centros: lista(v("centro") as string), tipos: lista(v("tipo") as string) };
}


export const paraIso = iso;
export const deIsoDia = deIso;

/** "01/10/2026 a 11/10/2026 (11 dias)" */
export function descrever(ini: Dia, fim: Dia): string {
  return ini === fim ? dataBr(ini) : `${dataBr(ini)} a ${dataBr(fim)} (${fim - ini + 1} dias)`;
}

export function filtrado(f: Filtros): boolean {
  return !!(f.areas.length || f.setores.length || f.centros.length || f.tipos.length);
}
