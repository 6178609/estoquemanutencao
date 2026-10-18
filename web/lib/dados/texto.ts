/**
 * Regras de texto: cabeçalhos normalizados, colunas achadas por
 * padrão e números no formato do SAP/Excel. Testado em testes/texto.test.ts.
 */

export function semAcento(t: unknown): string {
  const s = t == null ? "" : String(t);
  return s.normalize("NFD").replace(/\p{Mn}/gu, "");
}

/** "Denominação do loc.instalação" → "DENOMINACAO DO LOC INSTALACAO" */
export function chave(t: unknown): string {
  return semAcento(t).toUpperCase().replace(/[^A-Z0-9]+/g, " ").trim();
}

/** Primeira coluna cuja chave casa com algum dos padrões (na ordem dada), fora as que casam com `excluir`. */
export function acharColuna(colunas: string[], padroes: string[], excluir?: string): string | null {
  const chaves = colunas.map((c) => [c, chave(c)] as const);
  for (const padrao of padroes) {
    const rx = new RegExp(padrao);
    const fora = excluir ? new RegExp(excluir) : null;
    for (const [col, k] of chaves) {
      if (rx.test(k) && !(fora && fora.test(k))) return col;
    }
  }
  return null;
}

/** Célula como texto limpo (sem "nan", sem ".0" em códigos numéricos). */
export function texto(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "number") return Number.isNaN(v) ? "" : Number.isInteger(v) ? String(v) : String(v);
  if (typeof v === "bigint") return v.toString();
  const s = String(v).trim();
  return s === "nan" || s === "NaN" ? "" : s;
}

/** 1.234,56 · 1234.56 · 1234,56 · 12,00- (sinal no fim) → número; vazio/ilegível → NaN. */
export function paraNumero(v: unknown): number {
  if (v == null) return NaN;
  if (typeof v === "number") return v;
  if (typeof v === "bigint") return Number(v);
  let s = String(v).trim();
  if (!s) return NaN;
  const neg = s.endsWith("-") || s.startsWith("-");
  s = s.replace(/[^0-9.,]/g, "");
  if (!s) return NaN;
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  else if ((s.match(/\./g) || []).length > 1) s = s.replace(/\./g, "");
  const n = Number(s);
  if (Number.isNaN(n)) return NaN;
  return neg ? -Math.abs(n) : n;
}

/** Para a busca: sem acento e maiúsculo. */
export function normalizarBusca(t: string): string {
  return semAcento(t).toUpperCase();
}

/** Todos os termos (separados por espaço) aparecem no texto já normalizado? */
export function casaBusca(textoNormalizado: string, busca: string): boolean {
  const termos = normalizarBusca(busca).split(/\s+/).filter(Boolean);
  return termos.every((t) => textoNormalizado.includes(t));
}
