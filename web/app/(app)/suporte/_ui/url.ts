/** Endereço da aba Suporte Técnico: `?visao=` e os parâmetros de cada visão (busca, área, guia, tipo, sintoma, eq). */
export type Params = Record<string, string | string[] | undefined>;

/** Primeiro valor do parâmetro, sem espaços nas pontas ("" quando não veio). */
export function um(p: Params, k: string): string {
  const v = Array.isArray(p[k]) ? p[k]![0] : p[k];
  return (v ?? "").trim();
}

/** Link para a aba Suporte Técnico numa visão, com os parâmetros dados (os vazios somem do endereço). */
export function hrefSuporte(visao: string, extra: Record<string, string | undefined> = {}): string {
  const p = new URLSearchParams({ visao });
  for (const [k, v] of Object.entries(extra)) if (v) p.set(k, v);
  return `/suporte?${p.toString()}`;
}

/** Classes da pílula de escolha (chips de área, de tipo, abas da visão). */
export function pilula(ativo: boolean): string {
  return ativo
    ? "inline-flex min-h-11 items-center rounded-full border border-transparent bg-tinta px-4 text-[13.5px] font-semibold text-tinta-texto"
    : "inline-flex min-h-11 items-center rounded-full border border-borda bg-superficie px-4 text-[13.5px] text-texto-2 transition hover:border-borda-forte hover:text-texto";
}
