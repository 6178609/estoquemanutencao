import { NextResponse } from "next/server";

import { aquecer } from "@/lib/aquecimento";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * Deixa o servidor pronto (dados na memória) antes de alguém abrir o site. Sem login: não devolve nenhum dado, só o
 * tempo de cada etapa em milissegundos (para acompanhar a lentidão). Chamado a cada 5 min pelo agendamento do GitHub.
 */
// rota pública: no máximo 30 chamadas por minuto em cada servidor (o agendamento chama 1 a cada 5 min)
const g = globalThis as unknown as { __cmAquecerChamadas?: number[] };

export async function GET() {
  const agora = Date.now();
  const recentes = (g.__cmAquecerChamadas ?? []).filter((t) => agora - t < 60_000);
  if (recentes.length >= 30) return NextResponse.json({ ok: false, erro: "Muitas chamadas; tente em 1 minuto." }, { status: 429 });
  g.__cmAquecerChamadas = [...recentes, agora];
  const etapas = await aquecer();
  return NextResponse.json({ ok: Object.values(etapas).every((v) => typeof v === "number"), etapas }, { headers: { "Cache-Control": "no-store" } });
}
