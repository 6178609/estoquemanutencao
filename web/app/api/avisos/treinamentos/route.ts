import { timingSafeEqual } from "node:crypto";

import { NextResponse, type NextRequest } from "next/server";

import { ehAdmin } from "@/lib/auth/acesso";
import { usuarioAtual } from "@/lib/auth/sessao";
import { enviarAvisoTreinamentos, type ResultadoEnvio } from "@/lib/avisos/treinamentos";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Endereço do site para o link do e-mail: o domínio de produção da Vercel, ou o da própria requisição. */
function site(req: NextRequest): string {
  const prod = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  return prod ? `https://${prod}` : req.nextUrl.origin;
}

const resposta = (r: ResultadoEnvio) => NextResponse.json(r, { status: r.ok ? 200 : 409 });

/** Agendamento da Vercel (toda segunda, vercel.json): só com o segredo CRON_SECRET que a própria Vercel envia. */
export async function GET(req: NextRequest) {
  const segredo = process.env.CRON_SECRET;
  const veio = Buffer.from(req.headers.get("authorization") ?? "");
  const esperado = Buffer.from(`Bearer ${segredo ?? ""}`);
  if (!segredo || veio.length !== esperado.length || !timingSafeEqual(veio, esperado))
    return NextResponse.json({ erro: "Não autorizado." }, { status: 401 });
  try {
    return resposta(await enviarAvisoTreinamentos({ manual: false, por: "aviso semanal", site: site(req) }));
  } catch (e) {
    console.error("aviso semanal de treinamentos:", e);
    return NextResponse.json({ erro: "Falhou ao montar ou enviar o aviso." }, { status: 500 });
  }
}

/** "Enviar agora" (administrador): manda mesmo que o desta semana já tenha ido. */
export async function POST(req: NextRequest) {
  const origem = req.headers.get("origin");
  if (origem && origem !== req.nextUrl.origin) return NextResponse.json({ erro: "Origem não permitida." }, { status: 403 });
  const u = await usuarioAtual();
  if (!u || !ehAdmin(u) || u.demo) return NextResponse.json({ erro: "Só administradores enviam o aviso." }, { status: 403 });
  try {
    return resposta(await enviarAvisoTreinamentos({ manual: true, por: u.nome || u.login, site: site(req) }));
  } catch (e) {
    console.error("aviso de treinamentos (manual):", e);
    return NextResponse.json({ ok: false, motivo: "Falhou ao montar ou enviar o aviso; tente de novo." }, { status: 500 });
  }
}
