import { NextResponse, type NextRequest } from "next/server";

import { COLUNAS, linha, notasDaPagina, ordenarNotas } from "@/app/(app)/notas/dados";
import { respostaCsv } from "@/app/(app)/ordens/_comum/csv";
import { hojeArquivo, paramsDe } from "@/app/(app)/ordens/_comum/rota";
import { autorizar } from "@/lib/auth/sessao";
import { contexto } from "@/lib/wcm/contexto";

/** Exportação da aba Notas: todas as notas do filtro. GET /api/notas?<mesmos parâmetros da página> */
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  if (!(await autorizar("notas"))) return NextResponse.json({ erro: "Sem acesso." }, { status: 403 });
  const p = paramsDe(req);
  const c = await contexto(p);
  const { lista } = ordenarNotas(notasDaPagina(c, p).filtradas, p);
  return respostaCsv(`notas_${hojeArquivo()}`, COLUNAS, lista.map(linha));
}
