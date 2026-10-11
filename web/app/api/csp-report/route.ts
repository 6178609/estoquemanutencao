import { NextResponse, type NextRequest } from "next/server";

export const dynamic = "force-dynamic";

/** Recebe as violações da Content-Security-Policy e as joga no log da Vercel (filtre por "cm_csp"). Pública de propósito: o navegador não manda cookie aqui. */
export async function POST(req: NextRequest) {
  const texto = (await req.text().catch(() => "")).slice(0, 4000);
  console.warn(JSON.stringify({ cm_csp: texto }));
  return new NextResponse(null, { status: 204 });
}
