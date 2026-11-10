import { NextResponse, type NextRequest } from "next/server";

import { autorizar } from "@/lib/auth/sessao";
import { datasheetsDe, gravarDatasheet, gravarLinkDatasheet, LIMITE_DOCUMENTO, lerDatasheet, removerDatasheet } from "@/lib/dados/documentos";
import { FonteErro } from "@/lib/dados/fonte";
import { podeEnviar } from "@/lib/dados/fotos";

export const dynamic = "force-dynamic";

/**
 * Datasheets do material (aba Estoque): GET lista (ou abre o PDF com `id`); POST põe um link ou um PDF (editor);
 * DELETE tira um (editor). A busca automática grava os links pela rotina das fotos (lib/datasheet/rodada.ts).
 */
function erro(e: unknown) {
  if (e instanceof FonteErro) return NextResponse.json({ erro: e.message }, { status: 400 });
  console.error("datasheet do material:", e);
  return NextResponse.json({ erro: "Não foi possível gravar agora; tente de novo." }, { status: 500 });
}

const material = (v: unknown) => (typeof v === "string" && /^\d{1,18}$/.test(v.trim()) ? v.trim() : "");

export async function GET(req: NextRequest) {
  if (!(await autorizar("estoque"))) return NextResponse.json({ erro: "Sem acesso." }, { status: 403 });
  const p = req.nextUrl.searchParams;
  const m = material(p.get("m"));
  if (!m) return NextResponse.json({ erro: "Material inválido." }, { status: 400 });
  const id = p.get("id");
  if (!id) return NextResponse.json({ datasheets: (await datasheetsDe(m)).map(({ id, titulo, tipo, url, em, por }) => ({ id, titulo, tipo, url, em, por })) });
  let r: Awaited<ReturnType<typeof lerDatasheet>> = null;
  try {
    r = await lerDatasheet(m, id);
  } catch (e) {
    if (e instanceof FonteErro) return new NextResponse(e.message, { status: 404 });
  }
  if (!r) return new NextResponse("Datasheet não encontrado.", { status: 404 });
  const nome = (r.doc.nome || `datasheet-${m}.pdf`).replace(/[^\w.\- ]/g, "_");
  return new NextResponse(Buffer.from(r.bytes), { headers: {
    "Content-Type": r.tipo, "Content-Disposition": `inline; filename="${nome}"`, "Cache-Control": "private, max-age=31536000, immutable",
    "X-Content-Type-Options": "nosniff", ...(r.tipo === "application/pdf" ? {} : { "Content-Security-Policy": "default-src 'none'; sandbox" }),
  } });
}

export async function POST(req: NextRequest) {
  const origem = req.headers.get("origin");
  if (origem && origem !== req.nextUrl.origin) return NextResponse.json({ erro: "Origem não permitida." }, { status: 403 });
  const u = await autorizar("estoque", true);
  if (!u || u.demo) return NextResponse.json({ erro: "Só editor ou administrador põe datasheet." }, { status: 403 });
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ erro: "Pedido inválido (arquivo maior que 4 MB?)." }, { status: 400 });
  }
  const m = material(form.get("material")), titulo = String(form.get("titulo") ?? ""), url = String(form.get("url") ?? "").trim();
  const arquivo = form.get("arquivo");
  if (!m) return NextResponse.json({ erro: "Material inválido." }, { status: 400 });
  if (!podeEnviar(`datasheet:${u.login}`)) return NextResponse.json({ erro: "Muitos envios em pouco tempo. Espere alguns minutos e tente de novo." }, { status: 429 });
  try {
    if (url) return NextResponse.json({ ok: true, doc: await gravarLinkDatasheet(m, { titulo: titulo || "Datasheet", url }, u.nome || u.login) });
    if (!(arquivo instanceof File)) return NextResponse.json({ erro: "Escolha um PDF ou informe o link do datasheet." }, { status: 400 });
    if (arquivo.size > LIMITE_DOCUMENTO) return NextResponse.json({ erro: "O arquivo passou de 4 MB. Use o link do fabricante." }, { status: 413 });
    const doc = await gravarDatasheet(m, { titulo: titulo || "Datasheet", nome: arquivo.name, bytes: new Uint8Array(await arquivo.arrayBuffer()) }, u.nome || u.login);
    return NextResponse.json({ ok: true, doc });
  } catch (e) {
    return erro(e);
  }
}

export async function DELETE(req: NextRequest) {
  const origem = req.headers.get("origin");
  if (origem && origem !== req.nextUrl.origin) return NextResponse.json({ erro: "Origem não permitida." }, { status: 403 });
  const u = await autorizar("estoque", true);
  if (!u || u.demo) return NextResponse.json({ erro: "Só editor ou administrador remove datasheet." }, { status: 403 });
  const p = req.nextUrl.searchParams;
  const m = material(p.get("m"));
  if (!m) return NextResponse.json({ erro: "Material inválido." }, { status: 400 });
  try {
    await removerDatasheet(m, p.get("id") ?? "", u.nome || u.login);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return erro(e);
  }
}
