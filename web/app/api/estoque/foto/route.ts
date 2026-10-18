import { NextResponse, type NextRequest } from "next/server";

import { autorizar } from "@/lib/auth/sessao";
import { estoque } from "@/lib/dados/bases";
import { FonteErro } from "@/lib/dados/fonte";
import { gravarFotoMaterial, LIMITE_FOTO, LIMITE_MINI, lerFotoMaterial, materialValido, podeEnviar } from "@/lib/dados/fotos";

export const dynamic = "force-dynamic";

/**
 * A foto de um material (só para quem vê o Estoque). Com `v` igual à versão do conteúdo, fica em cache no navegador
 * (a URL muda quando a foto muda); com `v` antigo ou sem `v`, o navegador confere de novo a cada vez.
 */
export async function GET(req: NextRequest) {
  if (!(await autorizar("estoque"))) return new NextResponse("Sem acesso.", { status: 403 });
  const p = req.nextUrl.searchParams;
  const v = p.get("v") ?? "";
  const foto = await lerFotoMaterial(p.get("m") ?? "", { mini: p.get("mini") === "1", recente: !!v && v !== "legado" })
    .catch((e) => { console.error("foto do material:", e); return null; });
  if (!foto) return new NextResponse("Sem foto.", { status: 404 });
  return new NextResponse(Buffer.from(foto.bytes), {
    headers: {
      "Content-Type": foto.tipo,
      "Cache-Control": v === foto.versao ? "private, max-age=31536000, immutable" : "private, no-cache",
      "Content-Disposition": "inline",
      "Content-Security-Policy": "default-src 'none'; sandbox",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

/** Põe ou troca a foto — qualquer pessoa com acesso ao Estoque (não precisa ser editor), de material que está no MB52. */
export async function POST(req: NextRequest) {
  const origem = req.headers.get("origin");
  if (origem && origem !== req.nextUrl.origin) return NextResponse.json({ erro: "Origem não permitida." }, { status: 403 });
  const u = await autorizar("estoque");
  if (!u) return NextResponse.json({ erro: "Sem acesso ao Estoque." }, { status: 403 });
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ erro: "Pedido inválido." }, { status: 400 });
  }
  const material = String(form.get("material") ?? "").trim();
  const arquivo = form.get("foto"), mini = form.get("mini");
  if (!materialValido(material) || !(arquivo instanceof Blob) || (mini !== null && !(mini instanceof Blob)))
    return NextResponse.json({ erro: "Material ou foto inválidos." }, { status: 400 });
  if (arquivo.size > LIMITE_FOTO || (mini instanceof Blob && mini.size > LIMITE_MINI))
    return NextResponse.json({ erro: "A foto passou de 1,5 MB." }, { status: 413 });
  try {
    const mb52 = await estoque();
    if (mb52.dados && !mb52.dados.some((i) => i.material === material))
      return NextResponse.json({ erro: "Esse material não está no estoque (MB52)." }, { status: 404 });
    if (!podeEnviar(u.login)) return NextResponse.json({ erro: "Muitas fotos em pouco tempo. Espere alguns minutos e tente de novo." }, { status: 429 });
    const foto = await gravarFotoMaterial(material, new Uint8Array(await arquivo.arrayBuffer()),
      mini instanceof Blob ? new Uint8Array(await mini.arrayBuffer()) : null, u.nome || u.login);
    return NextResponse.json({ ok: true, material, foto });
  } catch (e) {
    if (e instanceof FonteErro) return NextResponse.json({ erro: e.message }, { status: 409 });
    console.error("gravar foto do material:", e);
    return NextResponse.json({ erro: "Não foi possível gravar a foto agora; tente de novo." }, { status: 500 });
  }
}
