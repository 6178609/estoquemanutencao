import { NextResponse, type NextRequest } from "next/server";

import { autorizar } from "@/lib/auth/sessao";
import { gravarCadastroLote } from "@/lib/dados/cadastros";
import { origemConfere } from "@/lib/seguranca/origem";

export const dynamic = "force-dynamic";

/** Estoque mínimo de um material — grava no mesmo cadastro do site atual (só o mínimo; a foto fica). */
export async function POST(req: NextRequest) {
  if (!origemConfere(req.headers, req.nextUrl.host)) return NextResponse.json({ erro: "Origem não permitida." }, { status: 403 });
  const u = await autorizar("estoque", true);
  if (!u) return NextResponse.json({ erro: "Só editor ou administrador altera o mínimo." }, { status: 403 });
  let corpo: { material?: unknown; minimo?: unknown };
  try {
    corpo = await req.json();
  } catch {
    return NextResponse.json({ erro: "Pedido inválido." }, { status: 400 });
  }
  const material = typeof corpo.material === "string" ? corpo.material.trim() : "";
  const minimo = corpo.minimo === null ? null : Number(corpo.minimo);
  if (!/^[\w.\-]{1,40}$/.test(material) || (minimo !== null && (!Number.isFinite(minimo) || minimo < 0 || minimo > 1e9)))
    return NextResponse.json({ erro: "Material ou mínimo inválido." }, { status: 400 });
  try {
    await gravarCadastroLote("cadastro_materiais.json", { [material]: { minimo } }, u.nome || u.login, true);
  } catch (e) {
    console.error("estoque/minimo", e);
    return NextResponse.json({ erro: "Não foi possível gravar agora. Tente de novo." }, { status: 409 });
  }
  return NextResponse.json({ ok: true, material, minimo });
}
