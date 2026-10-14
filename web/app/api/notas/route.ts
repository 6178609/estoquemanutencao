import { NextResponse, type NextRequest } from "next/server";

import { COLUNAS, comCampo, linha, notasDaPagina, ordenarNotas } from "@/app/(app)/notas/dados";
import { respostaCsv } from "@/app/(app)/ordens/_comum/csv";
import { hojeArquivo, paramsDe } from "@/app/(app)/ordens/_comum/rota";
import { autorizar } from "@/lib/auth/sessao";
import { campoDoEquipamento } from "@/lib/wcm/campoGeral";
import { contexto } from "@/lib/wcm/contexto";

/** Exportação da aba Notas: todas as notas do filtro. GET /api/notas?<mesmos parâmetros da página> */
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  if (!(await autorizar("notas"))) return NextResponse.json({ erro: "Sem acesso." }, { status: 403 });
  const p = paramsDe(req);
  const c = await contexto(p);
  const campoEq = await campoDoEquipamento(c);
  const { lista } = ordenarNotas(comCampo(notasDaPagina(c, p).filtradas, campoEq), p);
  return respostaCsv(`notas_${hojeArquivo()}`, COLUNAS, lista.map(linha));
}
