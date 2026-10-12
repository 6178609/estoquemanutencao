import { NextResponse, type NextRequest } from "next/server";

import { respostaCsv } from "@/app/(app)/ordens/_comum/csv";
import { hojeArquivo, paramsDe } from "@/app/(app)/ordens/_comum/rota";
import { colunasEscolhidas, linha, ordenarOrdens, ordensDaPagina } from "@/app/(app)/ordens/dados";
import { autorizar } from "@/lib/auth/sessao";
import { contexto } from "@/lib/wcm/contexto";

/**
 * Exportação da aba Ordens: TODAS as ordens do filtro (recorte global + filtros da página), nas colunas escolhidas.
 * GET /api/ordens?<mesmos parâmetros da página>
 */
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  if (!(await autorizar("ordens"))) return NextResponse.json({ erro: "Sem acesso." }, { status: 403 });
  const p = paramsDe(req);
  const c = await contexto(p);
  const { filtradas } = ordensDaPagina(c, p);
  const { lista } = ordenarOrdens(filtradas, p);
  return respostaCsv(`ordens_filtradas_${hojeArquivo()}`, colunasEscolhidas(p).colunas, lista.map(linha));
}
