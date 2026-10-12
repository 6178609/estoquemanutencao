import { NextResponse, type NextRequest } from "next/server";

import { saudeAtivos } from "@/app/(app)/saude/calculo";
import { csvFila, filtrarFila, lerFiltroFila } from "@/app/(app)/saude/fila";
import { autorizar } from "@/lib/auth/sessao";
import { contexto } from "@/lib/wcm/contexto";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Planilha da fila de ataque (Saúde dos ativos) com os mesmos filtros da tela. */
export async function GET(req: NextRequest) {
  if (!(await autorizar("saude"))) return NextResponse.json({ erro: "Sem acesso." }, { status: 403 });
  const params: Record<string, string> = Object.fromEntries(req.nextUrl.searchParams.entries());
  const c = await contexto(params);
  if (!c.b.ordens.dados) return NextResponse.json({ erro: "Sem a base IW38." }, { status: 404 });
  const vis = filtrarFila(await saudeAtivos(c), lerFiltroFila(params));
  return new NextResponse(csvFila(vis), {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="saude_dos_ativos.csv"', "Cache-Control": "no-store" },
  });
}
