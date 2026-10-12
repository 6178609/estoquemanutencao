import type { NextRequest } from "next/server";

import type { Params } from "./url";

/** Parâmetros do endereço de uma rota de API no mesmo formato do searchParams das páginas. */
export function paramsDe(req: NextRequest): Params {
  const out: Params = {};
  for (const k of new Set(req.nextUrl.searchParams.keys())) {
    const v = req.nextUrl.searchParams.getAll(k);
    out[k] = v.length > 1 ? v : v[0];
  }
  return out;
}

/** Data de hoje no nome do arquivo exportado (aaaa-mm-dd). */
export const hojeArquivo = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
