import { NextResponse, type NextRequest } from "next/server";

import { autorizar } from "@/lib/auth/sessao";
import { materialValido } from "@/lib/dados/fotos";
import { respostaFotoExterna } from "@/lib/dados/fotosExternas";
import { lerFotoReferencia } from "@/lib/dados/fotosReferencia";

export const dynamic = "force-dynamic";

/** A foto do item pela referência do fabricante (por código de material). */
export async function GET(req: NextRequest) {
  if (!(await autorizar("estoque"))) return new NextResponse("Sem acesso.", { status: 403 });
  const p = req.nextUrl.searchParams;
  const material = p.get("m") ?? "";
  const k = p.get("k") ?? "";
  if (!materialValido(material) || !/^[0-9a-f]{12}$/.test(k)) return new NextResponse("Pedido inválido.", { status: 400 });
  return respostaFotoExterna(await lerFotoReferencia(material), k, p.get("mini") === "1");
}
