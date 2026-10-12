import { NextResponse, type NextRequest } from "next/server";

import { autorizar } from "@/lib/auth/sessao";
import { gravarCadastroLote } from "@/lib/dados/cadastros";

export const dynamic = "force-dynamic";

/** Nomes dos tipos de ordem lidos da aba de apoio da Gestão de HH → app/tipos_ordem.json (código → descrição). */
export async function POST(req: NextRequest) {
  const u = await autorizar("dados", true);
  if (!u) return NextResponse.json({ erro: "Sem permissão." }, { status: 403 });
  let corpo: Record<string, unknown>;
  try { corpo = await req.json(); } catch { return NextResponse.json({ erro: "Pedido inválido." }, { status: 400 }); }
  const itens = Object.fromEntries(Object.entries(corpo ?? {}).filter(([k, v]) => /^[A-Z]{1,3}\d{2}$/.test(k) && typeof v === "string" && v.length < 120)
    .slice(0, 200).map(([k, v]) => [k, { descricao: String(v).trim() }]));
  if (!Object.keys(itens).length) return NextResponse.json({ ok: true, tipos: 0 });
  await gravarCadastroLote("tipos_ordem.json", itens, u.login, true);
  return NextResponse.json({ ok: true, tipos: Object.keys(itens).length });
}
