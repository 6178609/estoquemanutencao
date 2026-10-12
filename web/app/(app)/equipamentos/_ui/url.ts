/** Endereços das telas de Equipamentos e Saúde: troca alguns parâmetros e mantém o resto (filtros globais inclusive). */
export type Params = Record<string, string | string[] | undefined>;

export function hrefCom(params: Params, mudar: Record<string, string | number | null | undefined>, ancora?: string): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v == null || k in mudar) continue;
    for (const x of Array.isArray(v) ? v : [v]) p.append(k, x);
  }
  for (const [k, v] of Object.entries(mudar)) if (v != null && v !== "") p.set(k, String(v));
  const q = p.toString();
  return `?${q}${ancora ? `#${ancora}` : ""}`;
}
