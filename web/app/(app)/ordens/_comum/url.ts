/**
 * Parâmetros do endereço das telas (filtros da página, ?pag=, ?ord=, detalhe…). Funções puras: servem ao servidor
 * (links de paginação/ordenação) e ao navegador.
 */
export type Params = Record<string, string | string[] | undefined>;

export const um = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] ?? "" : v ?? "");

export const lista = (v: string | string[] | undefined) =>
  (Array.isArray(v) ? v : v ? v.split(",") : []).map((x) => x.trim()).filter(Boolean).slice(0, 80);

export const ligado = (v: string | string[] | undefined, padrao = false) => {
  const s = um(v);
  return s === "" ? padrao : s === "1";
};

/** "?a=1&b=2" a partir dos parâmetros atuais com as mudanças (null/"" remove). */
export function href(params: Params, mudar: Record<string, string | number | null | undefined> = {}): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (k in mudar || v == null) continue;
    for (const x of Array.isArray(v) ? v : [v]) p.append(k, x);
  }
  for (const [k, v] of Object.entries(mudar)) if (v != null && v !== "") p.set(k, String(v));
  const s = p.toString();
  return s ? `?${s}` : "?";
}

/** Termos de busca: todas as palavras precisam aparecer (sem acento, maiúsculas, pontuação vira espaço). */
export function termos(q: string): string[] {
  return q.normalize("NFD").replace(/\p{Mn}/gu, "").toUpperCase().replace(/[^A-Z0-9]+/g, " ").trim().split(" ").filter(Boolean);
}

export function casa(palheiro: string, ts: string[]): boolean {
  for (const t of ts) if (!palheiro.includes(t)) return false;
  return true;
}

export const POR_PAGINA = 50;

export function paginar<T>(xs: T[], pag: string | string[] | undefined, porPagina = POR_PAGINA): { itens: T[]; pagina: number; paginas: number } {
  const paginas = Math.max(1, Math.ceil(xs.length / porPagina));
  const pagina = Math.min(paginas, Math.max(1, Math.trunc(Number(um(pag)) || 1)));
  return { itens: xs.slice((pagina - 1) * porPagina, pagina * porPagina), pagina, paginas };
}

/** Ordena por um campo (texto, número, booleano; vazios sempre no fim). */
export function ordenar<T>(xs: T[], valor: (x: T) => unknown, desc: boolean): T[] {
  const vazio = (v: unknown) => v == null || v === "" || (typeof v === "number" && Number.isNaN(v));
  return [...xs].sort((a, b) => {
    const va = valor(a), vb = valor(b);
    if (vazio(va)) return vazio(vb) ? 0 : 1;
    if (vazio(vb)) return -1;
    const r = typeof va === "number" && typeof vb === "number" ? va - vb
      : typeof va === "boolean" ? Number(va) - Number(vb) : String(va).localeCompare(String(vb), "pt-BR", { numeric: true });
    return desc ? -r : r;
  });
}

/** Faixas de idade em dias: [rótulo, mínimo, máximo]. */
export type Faixa = readonly [string, number, number];
export function faixaDe(dias: number, faixas: readonly Faixa[]): number {
  const i = faixas.findIndex(([, a, b]) => dias >= a && dias <= b);
  return i < 0 ? faixas.length - 1 : i;
}
