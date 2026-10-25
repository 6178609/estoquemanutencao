import { NextResponse, type NextRequest } from "next/server";

import { autorizar } from "@/lib/auth/sessao";
import { FonteErro } from "@/lib/dados/fonte";
import { importarFotos } from "@/lib/dados/fotosImportar";
import { SugestaoErro } from "@/lib/dados/fotosSugestao";

export const dynamic = "force-dynamic";

const LIMITE_ARQUIVO = 8_000_000;

/**
 * Importa o arquivo de fotos do fabricante por código de material. Só editores e administradores com acesso a Fontes de
 * dados. As fotos entram direto no material (sem aprovação); a foto própria continua na frente.
 */
export async function POST(req: NextRequest) {
  const origem = req.headers.get("origin");
  if (origem && origem !== req.nextUrl.origin) return NextResponse.json({ erro: "Origem não permitida." }, { status: 403 });
  const u = await autorizar("dados", true);
  if (!u) return NextResponse.json({ erro: "Só editores e administradores importam fotos." }, { status: 403 });
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ erro: "Pedido inválido." }, { status: 400 });
  }
  const arquivo = form.get("arquivo");
  if (!(arquivo instanceof Blob)) return NextResponse.json({ erro: "Escolha o arquivo JSON das fotos." }, { status: 400 });
  if (arquivo.size > LIMITE_ARQUIVO) return NextResponse.json({ erro: "O arquivo passou de 8 MB." }, { status: 413 });
  let json: unknown;
  try {
    json = JSON.parse(await arquivo.text());
  } catch {
    return NextResponse.json({ erro: "O arquivo não é um JSON válido." }, { status: 400 });
  }
  try {
    const n = await importarFotos(json, u.nome || u.login);
    return NextResponse.json({ ok: true, ...n });
  } catch (e) {
    if (e instanceof SugestaoErro || e instanceof FonteErro) return NextResponse.json({ erro: e.message }, { status: 400 });
    console.error("importar fotos:", e);
    return NextResponse.json({ erro: "Não foi possível importar agora; tente de novo." }, { status: 500 });
  }
}
