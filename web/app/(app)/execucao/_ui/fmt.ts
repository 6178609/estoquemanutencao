/** Números das telas de execução, HH, preditiva e AF (vazio/NaN = "—"). */
const cache = new Map<number, Intl.NumberFormat>();
const nf = (casas: number) => {
  let f = cache.get(casas);
  if (!f) cache.set(casas, (f = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: casas })));
  return f;
};

export const vazio = (v: number | null | undefined): v is null | undefined => v == null || Number.isNaN(v);
export const num = (v: number | null | undefined, casas = 1, suf = "") => (vazio(v) ? "—" : `${nf(casas).format(v)}${suf}`);
export const int = (v: number | null | undefined) => num(v, 0);
export const pct = (v: number | null | undefined, casas = 1) => num(v, casas, "%");
export const horas = (v: number | null | undefined, casas = 0) => num(v, casas, " h");
