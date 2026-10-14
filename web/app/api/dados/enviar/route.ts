import { NextResponse, type NextRequest } from "next/server";

import { autorizar } from "@/lib/auth/sessao";
import { LIMITE_BYTES, receberParte } from "@/lib/dados/envio";
import { FonteErro } from "@/lib/dados/fonte";
import { ehTipo } from "@/lib/leitura/tipos";
import { COOKIE_ENVIO, ENVIO_VALE_MS } from "@/lib/wcm/dados";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Uma parte de uma base (parquet feito no navegador a partir do export do SAP). Só editor ou administrador. */
export async function POST(req: NextRequest) {
  const u = await autorizar("dados", true);
  if (!u) return NextResponse.json({ erro: "Só editor ou administrador com acesso a Fontes de dados envia bases." }, { status: 403 });
  if (Number(req.headers.get("content-length") || 0) > LIMITE_BYTES + 100_000)
    return NextResponse.json({ erro: "Parte grande demais." }, { status: 413 });
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ erro: "Pedido inválido." }, { status: 400 });
  }
  const tipo = form.get("tipo");
  const dados = form.get("dados");
  const texto = (k: string, max = 200) => String(form.get(k) || "").slice(0, max);
  const modificado = texto("modificado", 40);
  if (!ehTipo(tipo) || !(dados instanceof Blob) || Number.isNaN(Date.parse(modificado)))
    return NextResponse.json({ erro: "Pedido inválido." }, { status: 400 });
  try {
    const r = await receberParte({
      tipo, envio: texto("envio", 40), parte: Number(texto("parte", 4)), total: Number(texto("total", 4)),
      bytes: new Uint8Array(await dados.arrayBuffer()), arquivo: texto("arquivo"), aba: texto("aba") || null,
      modificado: new Date(modificado).toISOString().replace(/\.\d{3}Z$/, "+00:00"), linhas: Number(texto("linhas", 10)) || 0,
      por: u.login,
    });
    const resp = NextResponse.json({ ok: true, ...r });
    // por 2 min as telas de quem enviou esperam a base nova em vez de mostrar a anterior (ver bases())
    resp.cookies.set(COOKIE_ENVIO, String(Date.now()), { httpOnly: true, sameSite: "lax", path: "/", maxAge: ENVIO_VALE_MS / 1000,
      secure: process.env.NODE_ENV === "production" });
    return resp;
  } catch (e) {
    const status = e instanceof FonteErro ? 409 : 500;
    return NextResponse.json({ erro: (e as Error).message }, { status });
  }
}
