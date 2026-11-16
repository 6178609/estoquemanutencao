import { NextResponse, type NextRequest } from "next/server";

import { equipamentosDosManuais } from "@/app/(app)/manuais/dados";
import { quemEditaEquipamentos } from "@/lib/auth/editor";
import { buscarEquipamentos } from "@/lib/manuais/lista";
import { contexto } from "@/lib/wcm/contexto";

/** Busca de equipamentos para o "Vincular manual" (sob demanda: a página não leva a lista inteira). GET ?q=termo */
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  if (!(await quemEditaEquipamentos(req))) return NextResponse.json({ erro: "Só editor ou administrador vincula manuais." }, { status: 403 });
  const q = req.nextUrl.searchParams.get("q") ?? "";
  const { ativosTela } = await equipamentosDosManuais(await contexto({}));
  return NextResponse.json(buscarEquipamentos(ativosTela, q));
}
