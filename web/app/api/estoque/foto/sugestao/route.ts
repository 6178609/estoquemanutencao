import { NextResponse, type NextRequest } from "next/server";

import { autorizar } from "@/lib/auth/sessao";
import { FonteErro } from "@/lib/dados/fonte";
import { materialNoEstoque, materialValido } from "@/lib/dados/fotos";
import { buscarImagemSugestao, chaveSugestao, lerSugestoes, removerSugestao, SugestaoErro } from "@/lib/dados/fotosSugestao";

export const dynamic = "force-dynamic";

/**
 * A imagem de uma foto sugerida. O servidor busca o endereço do CADASTRO (nunca um endereço vindo do navegador), pelo
 * índice `i`; a chave `k` confere que é a mesma sugestão (se a lista mudou, responde 404 e a tela recarrega).
 */
export async function GET(req: NextRequest) {
  if (!(await autorizar("estoque"))) return new NextResponse("Sem acesso.", { status: 403 });
  const p = req.nextUrl.searchParams;
  const material = p.get("m") ?? "";
  const i = Number(p.get("i"));
  const k = p.get("k") ?? "";
  if (!materialValido(material) || !Number.isInteger(i) || i < 0 || !/^[0-9a-f]{12}$/.test(k))
    return new NextResponse("Pedido inválido.", { status: 400 });
  if (!(await materialNoEstoque(material))) return new NextResponse("Sem foto.", { status: 404 });
  const s = (await lerSugestoes(material))[i];
  if (!s || chaveSugestao(s.url) !== k) return new NextResponse("Sugestão não encontrada.", { status: 404 });
  try {
    const img = await buscarImagemSugestao(s.url);
    return new NextResponse(Buffer.from(img.bytes), {
      headers: {
        "Content-Type": img.tipo,
        "Cache-Control": "private, max-age=300",
        "Content-Disposition": "inline",
        "Content-Security-Policy": "default-src 'none'; sandbox",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (e) {
    console.warn("foto sugerida não carregou:", e instanceof SugestaoErro ? e.message : e);
    return new NextResponse("Não foi possível carregar a sugestão.", { status: 502 });
  }
}

/** Tira uma sugestão da lista (aprovada ou descartada); devolve as que sobraram do material. */
export async function POST(req: NextRequest) {
  const origem = req.headers.get("origin");
  if (origem && origem !== req.nextUrl.origin) return NextResponse.json({ erro: "Origem não permitida." }, { status: 403 });
  const u = await autorizar("estoque");
  if (!u) return NextResponse.json({ erro: "Sem acesso ao Estoque." }, { status: 403 });
  let corpo: { material?: unknown; k?: unknown };
  try {
    corpo = await req.json();
  } catch {
    return NextResponse.json({ erro: "Pedido inválido." }, { status: 400 });
  }
  const material = typeof corpo.material === "string" ? corpo.material.trim() : "";
  const k = typeof corpo.k === "string" ? corpo.k : "";
  if (!materialValido(material) || !/^[0-9a-f]{12}$/.test(k)) return NextResponse.json({ erro: "Pedido inválido." }, { status: 400 });
  try {
    if (!(await materialNoEstoque(material)))
      return NextResponse.json({ erro: "Esse material não está no estoque (MB52)." }, { status: 404 });
    const sugestoes = await removerSugestao(material, k, u.nome || u.login);
    return NextResponse.json({ ok: true, material, sugestoes });
  } catch (e) {
    if (e instanceof FonteErro) return NextResponse.json({ erro: e.message }, { status: 409 });
    console.error("remover sugestão de foto:", e);
    return NextResponse.json({ erro: "Não foi possível salvar agora; tente de novo." }, { status: 500 });
  }
}
