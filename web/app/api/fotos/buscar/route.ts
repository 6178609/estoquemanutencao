import { timingSafeEqual } from "node:crypto";

import { NextResponse, type NextRequest } from "next/server";

import { autorizar } from "@/lib/auth/sessao";
import { conferirFotos } from "@/lib/fotos/conferencia";
import { limiteDiario, ORCAMENTO_MANUAL, rodadaFotos } from "@/lib/fotos/rodadaFotos";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Tempo que sobra para a busca dentro dos 300 s da função (com folga para o item em andamento e a gravação); a
 * conferência começa uns 16 s depois do prazo no pior caso (página 8 s + imagem 8 s).
 */
const restante = (t0: number) => Math.max(0, 250_000 - (Date.now() - t0));

/** A conferência nunca derruba a busca: se falhar, a busca segue e o erro vai para o log. */
const conferencia_ = (limite: number, prazoMs: number) =>
  conferirFotos({ limite, prazoMs }).catch((e) => { console.error("conferência de fotos:", e); return null; });

/**
 * Agendamento diário (vercel.json): só com o segredo CRON_SECRET que a própria Vercel envia. Primeiro confere as fotos
 * do fabricante já gravadas (a que a loja bloqueia sai da tela), depois busca novas com o orçamento do dia inteiro.
 */
export async function GET(req: NextRequest) {
  const segredo = process.env.CRON_SECRET;
  const veio = Buffer.from(req.headers.get("authorization") ?? "");
  const esperado = Buffer.from(`Bearer ${segredo ?? ""}`);
  if (!segredo || veio.length !== esperado.length || !timingSafeEqual(veio, esperado))
    return NextResponse.json({ erro: "Não autorizado." }, { status: 401 });
  try {
    const t0 = Date.now();
    const conferencia = await conferencia_(1_000, 100_000);
    const limite = limiteDiario();
    return NextResponse.json({ ...(await rodadaFotos({ limiteDia: limite, porRodada: limite, prazoMs: restante(t0) })), conferencia });
  } catch (e) {
    console.error("busca automática de fotos:", e);
    return NextResponse.json({ erro: "Falhou a busca de fotos." }, { status: 500 });
  }
}

/** "Conferir e buscar agora" (editores com acesso a Fontes de dados): confere até 200 fotos e faz até 10 buscas. */
export async function POST(req: NextRequest) {
  const origem = req.headers.get("origin");
  if (origem && origem !== req.nextUrl.origin) return NextResponse.json({ erro: "Origem não permitida." }, { status: 403 });
  const u = await autorizar("dados", true);
  if (!u || u.demo) return NextResponse.json({ erro: "Só editores busca fotos agora." }, { status: 403 });
  try {
    const t0 = Date.now();
    const conferencia = await conferencia_(200, 40_000);
    const limite = limiteDiario();
    return NextResponse.json({ ...(await rodadaFotos({ limiteDia: limite, porRodada: Math.min(ORCAMENTO_MANUAL, limite),
      prazoMs: restante(t0) })), conferencia });
  } catch (e) {
    console.error("busca de fotos (manual):", e);
    return NextResponse.json({ erro: "Falhou a busca de fotos; tente de novo." }, { status: 500 });
  }
}
