/**
 * Números em pt-BR nos editores: "1.234,56" é 1234.56 e "1.234" é 1234 (milhar com ponto).
 * Puro e sem dependências; testes em testes/numeroBr.test.ts.
 */

/** Número para texto pt-BR com milhar; null/undefined viram "". */
export function mostrarBr(v: number | null | undefined, casas = 2): string {
  if (v == null) return "";
  return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: casas }).format(v);
}

/** Texto pt-BR para número: vazio → null; texto inválido ou negativo → NaN. */
export function lerBr(t: string): number | null {
  const s = t.trim().replace(/\s/g, "");
  if (!s) return null;
  let n: number;
  if (s.includes(",")) n = Number(s.replace(/\./g, "").replace(",", "."));
  else if (/^[1-9]\d{0,2}(\.\d{3})+$/.test(s)) n = Number(s.replace(/\./g, ""));
  else n = Number(s);
  return Number.isFinite(n) && n >= 0 ? n : NaN;
}
