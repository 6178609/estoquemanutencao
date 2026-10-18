import { NextResponse, type NextRequest } from "next/server";

import { autorizar } from "@/lib/auth/sessao";
import { gravarFotoMaterial, LIMITE_FOTO, lerFotoMaterial, materialValido } from "@/lib/dados/fotos";

export const dynamic = "force-dynamic";

/** A foto de um material (só para quem vê o Estoque). A URL leva a versão (?v=), então pode ficar em cache. */
export async function GET(req: NextRequest) {
  if (!(await autorizar("estoque"))) return new NextResponse("Sem acesso.", { status: 403 });
  const material = req.nextUrl.searchParams.get("m") ?? "";
  const foto = await lerFotoMaterial(material).catch(() => null);
  if (!foto) return new NextResponse("Sem foto.", { status: 404 });
  return new NextResponse(Buffer.from(foto.bytes), {
    headers: { "Content-Type": foto.tipo, "Cache-Control": "private, max-age=31536000, immutable", "X-Content-Type-Options": "nosniff" },
  });
}

/** Põe ou troca a foto — qualquer pessoa com acesso ao Estoque (não precisa ser editor). */
export async function POST(req: NextRequest) {
  const u = await autorizar("estoque");
  if (!u) return NextResponse.json({ erro: "Sem acesso ao Estoque." }, { status: 403 });
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ erro: "Pedido inválido." }, { status: 400 });
  }
  const material = String(form.get("material") ?? "").trim();
  const arquivo = form.get("foto");
  if (!materialValido(material) || !(arquivo instanceof Blob)) return NextResponse.json({ erro: "Material ou foto inválidos." }, { status: 400 });
  if (arquivo.size > LIMITE_FOTO) return NextResponse.json({ erro: "A foto passou de 1,5 MB." }, { status: 413 });
  try {
    const foto = await gravarFotoMaterial(material, new Uint8Array(await arquivo.arrayBuffer()), u.nome || u.login);
    return NextResponse.json({ ok: true, material, foto });
  } catch (e) {
    return NextResponse.json({ erro: (e as Error).message }, { status: 400 });
  }
}
