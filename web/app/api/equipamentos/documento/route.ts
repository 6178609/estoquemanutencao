import { NextResponse, type NextRequest } from "next/server";

import { autorizar } from "@/lib/auth/sessao";
import { FonteErro } from "@/lib/dados/fonte";
import { documentoEmPartes, gravarDocumento, gravarLink, LIMITE_DOCUMENTO, lerDocumento, removerDocumento } from "@/lib/dados/documentos";
import { podeEnviar } from "@/lib/dados/fotos";
import { fluxoDoEnvio, partesFaltando } from "@/lib/dados/manuaisPartes";
import { quemEditaEquipamentos } from "@/lib/auth/editor";

export const dynamic = "force-dynamic";
// manual em partes (até 100 MB) sai em fluxo: o download pode levar mais que o padrão
export const maxDuration = 300;

/** Cabeçalhos de quem baixa: os mesmos de sempre (o tipo vem da assinatura do arquivo). */
function cabecalhos(tipo: string, nome: string, tamanho?: number): Record<string, string> {
  return {
    "Content-Type": tipo,
    ...(tamanho === undefined ? {} : { "Content-Length": String(tamanho) }),
    "Content-Disposition": `inline; filename="${nome}"`,
    "Cache-Control": "private, max-age=31536000, immutable", // o id é único e o arquivo nunca muda
    "X-Content-Type-Options": "nosniff",
    // o tipo vem da assinatura do arquivo (só PDF ou imagem); a imagem ainda abre isolada
    ...(tipo === "application/pdf" ? {} : { "Content-Security-Policy": "default-src 'none'; sandbox" }),
  };
}

function erro(e: unknown) {
  if (e instanceof FonteErro) return NextResponse.json({ erro: e.message }, { status: 400 });
  console.error("biblioteca do ativo:", e);
  return NextResponse.json({ erro: "Não foi possível gravar agora; tente de novo." }, { status: 500 });
}

/** Abre o arquivo: para quem vê a aba Equipamentos ou a aba Manuais (a tela de Manuais mostra os arquivos dela). */
export async function GET(req: NextRequest) {
  if (!(await autorizar("manuais")) && !(await autorizar("equipamentos"))) return new NextResponse("Sem acesso.", { status: 403 });
  const p = req.nextUrl.searchParams;
  const eq = p.get("eq") ?? "", id = p.get("id") ?? "";
  // manual em partes: as partes saem em fluxo, sem juntar tudo na memória
  let emPartes: Awaited<ReturnType<typeof documentoEmPartes>> = null;
  try {
    emPartes = await documentoEmPartes(eq, id);
  } catch (e) {
    if (e instanceof FonteErro) return new NextResponse(e.message, { status: 404 });
    throw e;
  }
  if (emPartes) {
    const { partes, nome, tipo, tamanho } = emPartes;
    if ((await partesFaltando(partes.envio, partes.total)).length) return new NextResponse("Arquivo incompleto.", { status: 404 });
    return new NextResponse(fluxoDoEnvio(partes.envio, partes.total), { headers: cabecalhos(tipo, nome.replace(/[^\w.\- ]/g, "_"), tamanho) });
  }
  let r: Awaited<ReturnType<typeof lerDocumento>> = null;
  try {
    r = await lerDocumento(eq, id);
  } catch (e) {
    if (e instanceof FonteErro) return new NextResponse(e.message, { status: 404 });
  }
  if (!r) return new NextResponse("Documento não encontrado.", { status: 404 });
  const nome = (r.doc.nome || "documento").replace(/[^\w.\- ]/g, "_");
  return new NextResponse(Buffer.from(r.bytes), { headers: cabecalhos(r.tipo, nome) });
}

/** Põe um arquivo (PDF/imagem até 4 MB) ou um link na biblioteca do equipamento. */
export async function POST(req: NextRequest) {
  const u = await quemEditaEquipamentos(req);
  if (!u) return NextResponse.json({ erro: "Só editor ou administrador põe documentos na biblioteca." }, { status: 403 });
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ erro: "Pedido inválido (arquivo maior que 4 MB?)." }, { status: 400 });
  }
  const eq = String(form.get("eq") ?? ""), titulo = String(form.get("titulo") ?? ""), url = String(form.get("url") ?? "");
  const arquivo = form.get("arquivo");
  if (!podeEnviar(`doc:${u.login}`)) return NextResponse.json({ erro: "Muitos envios em pouco tempo. Espere alguns minutos e tente de novo." }, { status: 429 });
  try {
    if (url) return NextResponse.json({ ok: true, doc: await gravarLink(eq, { titulo, url }, u.nome || u.login) });
    if (!(arquivo instanceof File)) return NextResponse.json({ erro: "Escolha um arquivo ou informe um link." }, { status: 400 });
    if (arquivo.size > LIMITE_DOCUMENTO) return NextResponse.json({ erro: "O arquivo passou de 4 MB. Para manuais maiores, use “Adicionar link”." }, { status: 413 });
    const doc = await gravarDocumento(eq, { titulo, nome: arquivo.name, bytes: new Uint8Array(await arquivo.arrayBuffer()) }, u.nome || u.login);
    return NextResponse.json({ ok: true, doc });
  } catch (e) {
    return erro(e);
  }
}

export async function DELETE(req: NextRequest) {
  const u = await quemEditaEquipamentos(req);
  if (!u) return NextResponse.json({ erro: "Só editor ou administrador remove documentos." }, { status: 403 });
  const p = req.nextUrl.searchParams;
  try {
    await removerDocumento(p.get("eq") ?? "", p.get("id") ?? "", u.nome || u.login);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return erro(e);
  }
}
