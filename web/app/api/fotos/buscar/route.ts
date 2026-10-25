import { timingSafeEqual } from "node:crypto";

import { NextResponse, type NextRequest } from "next/server";

import { autorizar } from "@/lib/auth/sessao";
import { limiteDiario, ORCAMENTO_MANUAL, rodadaFotos } from "@/lib/fotos/rodadaFotos";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Agendamento diário (vercel.json): só com o segredo CRON_SECRET que a própria Vercel envia. Orçamento do dia inteiro. */
export async function GET(req: NextRequest) {
  const segredo = process.env.CRON_SECRET;
  const veio = Buffer.from(req.headers.get("authorization") ?? "");
  const esperado = Buffer.from(`Bearer ${segredo ?? ""}`);
  if (!segredo || veio.length !== esperado.length || !timingSafeEqual(veio, esperado))
    return NextResponse.json({ erro: "Não autorizado." }, { status: 401 });
  try {
    const limite = limiteDiario();
    return NextResponse.json(await rodadaFotos({ limiteDia: limite, porRodada: limite }));
  } catch (e) {
    console.error("busca automática de fotos:", e);
    return NextResponse.json({ erro: "Falhou a busca de fotos." }, { status: 500 });
  }
}

/** "Buscar agora" (editores com acesso a Fontes de dados): mesma rotina, com 10 buscas e o mesmo orçamento do dia. */
export async function POST(req: NextRequest) {
  const origem = req.headers.get("origin");
  if (origem && origem !== req.nextUrl.origin) return NextResponse.json({ erro: "Origem não permitida." }, { status: 403 });
  const u = await autorizar("dados", true);
  if (!u || u.demo) return NextResponse.json({ erro: "Só editores busca fotos agora." }, { status: 403 });
  try {
    const limite = limiteDiario();
    return NextResponse.json(await rodadaFotos({ limiteDia: limite, porRodada: Math.min(ORCAMENTO_MANUAL, limite) }));
  } catch (e) {
    console.error("busca de fotos (manual):", e);
    return NextResponse.json({ erro: "Falhou a busca de fotos; tente de novo." }, { status: 500 });
  }
}
