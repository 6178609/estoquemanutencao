import { NextResponse, type NextRequest } from "next/server";

import { respostaCsv } from "@/app/(app)/ordens/_comum/csv";
import { hojeArquivo, paramsDe } from "@/app/(app)/ordens/_comum/rota";
import { checagens, colunasDe } from "@/app/(app)/qualidade/dados";
import { autorizar } from "@/lib/auth/sessao";
import { contexto } from "@/lib/wcm/contexto";

/** Registros com problema de UMA checagem, para corrigir no SAP. GET /api/qualidade?id=<checagem>&<filtros> */
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  if (!(await autorizar("qualidade"))) return NextResponse.json({ erro: "Sem acesso." }, { status: 403 });
  const p = paramsDe(req);
  const ch = (await checagens(await contexto(p))).find((x) => x.id === p.id);
  if (!ch) return NextResponse.json({ erro: "Checagem não encontrada." }, { status: 404 });
  return respostaCsv(`qualidade_${ch.id}_${hojeArquivo()}`, colunasDe(ch), ch.problemas);
}
