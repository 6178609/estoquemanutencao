import { NextResponse, type NextRequest } from "next/server";

import { autorizar } from "@/lib/auth/sessao";
import { FonteErro } from "@/lib/dados/fonte";
import { alterarFotoMaterial, materialNoEstoque, materialValido } from "@/lib/dados/fotos";

export const dynamic = "force-dynamic";

/** Torna uma foto a principal (`principal`) ou tira uma da lista (`remover`). Mesma regra de acesso da inclusão. */
export async function POST(req: NextRequest) {
  const origem = req.headers.get("origin");
  if (origem && origem !== req.nextUrl.origin) return NextResponse.json({ erro: "Origem não permitida." }, { status: 403 });
  const u = await autorizar("estoque");
  if (!u) return NextResponse.json({ erro: "Sem acesso ao Estoque." }, { status: 403 });
  let corpo: { material?: unknown; acao?: unknown; foto?: unknown };
  try {
    corpo = await req.json();
  } catch {
    return NextResponse.json({ erro: "Pedido inválido." }, { status: 400 });
  }
  const material = typeof corpo.material === "string" ? corpo.material.trim() : "";
  const acao = corpo.acao;
  const foto = typeof corpo.foto === "string" ? corpo.foto : "";
  const fotoValida = foto.startsWith("app/fotos/materiais/") || foto.startsWith("fotos_materiais/");
  if (!materialValido(material) || (acao !== "principal" && acao !== "remover") || !fotoValida)
    return NextResponse.json({ erro: "Material, ação ou foto inválidos." }, { status: 400 });
  try {
    if (!(await materialNoEstoque(material)))
      return NextResponse.json({ erro: "Esse material não está no estoque (MB52)." }, { status: 404 });
    const fotos = await alterarFotoMaterial(material, acao, foto, u.nome || u.login);
    return NextResponse.json({ ok: true, material, foto: fotos[0] ?? null, fotos });
  } catch (e) {
    if (e instanceof FonteErro) return NextResponse.json({ erro: e.message }, { status: 409 });
    console.error("alterar foto do material:", e);
    return NextResponse.json({ erro: "Não foi possível salvar agora; tente de novo." }, { status: 500 });
  }
}
