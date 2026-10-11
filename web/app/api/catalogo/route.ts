import { NextResponse, type NextRequest } from "next/server";

import { autorizar } from "@/lib/auth/sessao";
import { buscarCatalogo } from "@/lib/dados/catalogoBusca";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  if (!(await autorizar("estoque"))) return NextResponse.json({ erro: "Sem acesso." }, { status: 401 });
  const p = req.nextUrl.searchParams;
  const onde = p.get("onde");
  const r = await buscarCatalogo({
    q: (p.get("q") || "").slice(0, 200),
    status: p.getAll("status").slice(0, 20),
    categorias: p.getAll("categoria").slice(0, 50),
    onde: onde === "almox" || onde === "fora" ? onde : "todos",
    cursor: Math.max(0, Number(p.get("cursor")) || 0),
    limite: Math.min(300, Math.max(20, Number(p.get("limite")) || 150)),
  });
  if (!r) return NextResponse.json({ erro: "O catálogo de materiais (Sysmat) não está no repositório de dados." }, { status: 404 });
  return NextResponse.json(r, { headers: { "Cache-Control": "private, no-store" } });
}
