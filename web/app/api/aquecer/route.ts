import { NextResponse } from "next/server";

import { aquecer } from "@/lib/aquecimento";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * Deixa o servidor pronto (dados na memória) antes de alguém abrir o site. Sem login: não devolve nenhum dado, só o
 * tempo de cada etapa em milissegundos (para acompanhar a lentidão). Chamado a cada 5 min pelo agendamento do GitHub.
 */
export async function GET() {
  const etapas = await aquecer();
  return NextResponse.json({ ok: Object.values(etapas).every((v) => typeof v === "number"), etapas }, { headers: { "Cache-Control": "no-store" } });
}
