import { NextResponse, type NextRequest } from "next/server";

import { podeVerValores } from "@/lib/auth/acesso";
import { autorizar } from "@/lib/auth/sessao";
import { historicoMaterial } from "@/lib/dados/historicoIw13";

export const dynamic = "force-dynamic";

/**
 * Histórico de retiradas (IW13) de um material, para o detalhamento da aba Estoque: quem vê a aba Estoque. O valor
 * (quantidade × preço médio) só vai para quem vê a aba Custos (`podeVerValores`); para os outros nem sai do servidor.
 */
export async function GET(req: NextRequest) {
  const u = await autorizar("estoque");
  if (!u) return NextResponse.json({ erro: "Sem acesso." }, { status: 403 });
  const m = (req.nextUrl.searchParams.get("m") ?? "").trim();
  if (!/^[A-Za-z0-9-]{1,40}$/.test(m)) return NextResponse.json({ erro: "Material inválido." }, { status: 400 });
  try {
    return NextResponse.json(await historicoMaterial(m, podeVerValores(u)), { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("histórico de retiradas (IW13):", e);
    return NextResponse.json({ erro: "Não foi possível ler a IW13 agora; tente de novo." }, { status: 500 });
  }
}
