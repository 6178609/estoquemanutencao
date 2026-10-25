import { NextResponse, type NextRequest } from "next/server";

import { autorizar } from "@/lib/auth/sessao";
import { respostaFotoExterna } from "@/lib/dados/fotosExternas";
import { lerFotoTipo, pdmValido } from "@/lib/dados/fotosTipo";

export const dynamic = "force-dynamic";

/** A foto ilustrativa de um tipo de material (PDM). `k` é a chave do endereço atual; o servidor busca o endereço do cadastro. */
export async function GET(req: NextRequest) {
  if (!(await autorizar("estoque"))) return new NextResponse("Sem acesso.", { status: 403 });
  const p = req.nextUrl.searchParams;
  const pdm = p.get("p") ?? "";
  const k = p.get("k") ?? "";
  if (!pdmValido(pdm) || !/^[0-9a-f]{12}$/.test(k)) return new NextResponse("Pedido inválido.", { status: 400 });
  return respostaFotoExterna(await lerFotoTipo(pdm), k);
}
