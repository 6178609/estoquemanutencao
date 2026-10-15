import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * Aviso do navegador de que a pessoa segue usando o site (lendo uma tela longa sem trocar de página): a passagem pelo
 * proxy renova a hora da última atividade; com a sessão já vencida o proxy responde 401 antes de chegar aqui.
 */
export function GET() {
  return new NextResponse(null, { status: 204, headers: { "Cache-Control": "no-store" } });
}
