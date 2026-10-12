import { NextResponse, type NextRequest } from "next/server";

import { respostaCsv } from "@/app/(app)/ordens/_comum/csv";
import { hojeArquivo, paramsDe } from "@/app/(app)/ordens/_comum/rota";
import { COLUNAS, filtrar, lerFiltro, linha, ordenarReq } from "@/app/(app)/requisicoes/dados";
import { autorizar } from "@/lib/auth/sessao";
import { bases } from "@/lib/wcm/dados";

/** Exportação da aba Requisições: todas as requisições do filtro. GET /api/requisicoes?<mesmos parâmetros da página> */
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!(await autorizar("requisicoes"))) return NextResponse.json({ erro: "Sem acesso." }, { status: 403 });
  const p = paramsDe(req);
  const b = await bases();
  const { filtradas } = filtrar(b.requisicoes.dados ?? [], lerFiltro(p, b.hoje));
  return respostaCsv(`requisicoes_${hojeArquivo()}`, COLUNAS, ordenarReq(filtradas, p).lista.map(linha));
}
