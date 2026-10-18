import { NextResponse, type NextRequest } from "next/server";

import { autorizar } from "@/lib/auth/sessao";
import { gravarCadastroLote } from "@/lib/dados/cadastros";

export const dynamic = "force-dynamic";

/** Estoque mínimo de um material — grava no cadastro (só o mínimo; a foto fica). */
export async function POST(req: NextRequest) {
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
    return NextResponse.json({ erro: (e as Error).message }, { status: 409 });
  }
  return NextResponse.json({ ok: true, material, minimo });
}
