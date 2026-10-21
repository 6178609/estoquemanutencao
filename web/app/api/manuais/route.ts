import { NextResponse, type NextRequest } from "next/server";

import { veInteira } from "@/lib/auth/acesso";
import { autorizar } from "@/lib/auth/sessao";
import { FonteErro } from "@/lib/dados/fonte";
import { gravarDocumentoEmVarios, gravarLinkEmVarios, LIMITE_DOCUMENTO } from "@/lib/dados/documentos";
import { podeEnviar } from "@/lib/dados/fotos";

export const dynamic = "force-dynamic";

/** Quem vincula manuais: o mesmo da biblioteca do ativo (editor ou administrador que vê a aba Equipamentos inteira). */
async function quemEdita(req: NextRequest) {
  const origem = req.headers.get("origin");
  if (origem && origem !== req.nextUrl.origin) return null;
  const u = await autorizar("equipamentos", true);
  return u && veInteira(u, "equipamentos") ? u : null;
}

function erro(e: unknown) {
  if (e instanceof FonteErro) return NextResponse.json({ erro: e.message }, { status: 400 });
  console.error("manuais:", e);
  return NextResponse.json({ erro: "Não foi possível gravar agora; tente de novo." }, { status: 500 });
}

/** Vincula um arquivo (PDF/imagem até 4 MB) ou um link a um ou mais equipamentos (até 50). */
export async function POST(req: NextRequest) {
  const u = await quemEdita(req);
  if (!u) return NextResponse.json({ erro: "Só editor ou administrador vincula manuais." }, { status: 403 });
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ erro: "Pedido inválido (arquivo maior que 4 MB?)." }, { status: 400 });
  }
  const eqs = form.getAll("eqs").map((x) => String(x));
  const titulo = String(form.get("titulo") ?? "");
  const url = String(form.get("url") ?? "");
  const arquivo = form.get("arquivo");
  const por = u.nome || u.login;
  if (!podeEnviar(`manual:${u.login}`)) return NextResponse.json({ erro: "Muitos envios em pouco tempo. Espere alguns minutos e tente de novo." }, { status: 429 });
  try {
    if (url) return NextResponse.json({ ok: true, vinculados: (await gravarLinkEmVarios(eqs, { titulo, url }, por)).length });
    if (!(arquivo instanceof File)) return NextResponse.json({ erro: "Escolha um arquivo ou informe um link." }, { status: 400 });
    if (arquivo.size > LIMITE_DOCUMENTO) return NextResponse.json({ erro: "O arquivo passou de 4 MB. Para manuais maiores, use “Adicionar link”." }, { status: 413 });
    const feitos = await gravarDocumentoEmVarios(eqs, { titulo, nome: arquivo.name, bytes: new Uint8Array(await arquivo.arrayBuffer()) }, por);
    return NextResponse.json({ ok: true, vinculados: feitos.length });
  } catch (e) {
    return erro(e);
  }
}
