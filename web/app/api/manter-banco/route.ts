import { timingSafeEqual } from "node:crypto";

import { NextResponse, type NextRequest } from "next/server";

import { manterBancoAtivo } from "@/lib/manterBanco";

export const dynamic = "force-dynamic";

/**
 * Agendamento diário da Vercel (vercel.json) que mantém o banco ativo. Com CRON_SECRET definido, só aceita o segredo
 * que a Vercel envia; sem ele, só o agendador da Vercel (a resposta não traz dado nenhum, só se o banco respondeu).
 */
export async function GET(req: NextRequest) {
  const segredo = process.env.CRON_SECRET;
  if (segredo) {
    const veio = Buffer.from(req.headers.get("authorization") ?? "");
    const esperado = Buffer.from(`Bearer ${segredo}`);
    if (veio.length !== esperado.length || !timingSafeEqual(veio, esperado)) return new NextResponse(null, { status: 401 });
  } else if (!(req.headers.get("user-agent") ?? "").startsWith("vercel-cron")) {
    return new NextResponse(null, { status: 401 });
  }
  const r = await manterBancoAtivo();
  return NextResponse.json({ ok: r.ok, motivo: r.motivo }, { status: r.ok ? 200 : 503 });
}
