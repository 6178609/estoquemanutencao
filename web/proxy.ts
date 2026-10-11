import { NextResponse, type NextRequest } from "next/server";

import { COOKIE_SESSAO } from "@/lib/auth/cookie";

/**
 * Porta de entrada do site:
 * 1. Nega por padrão: sem cookie de sessão só passa o que é público (tela de entrada e o relatório de CSP). Isto é
 *    só a primeira barreira (existência do cookie); a validação de verdade continua em cada página e rota
 *    (usuarioAtual/autorizar), então uma rota nova esquecida não fica aberta.
 * 2. Gera o nonce e manda a Content-Security-Policy (por enquanto só em modo relatório: nada é bloqueado; as
 *    violações aparecem no log da Vercel via /api/csp-report. Quando ficarem em zero, troque
 *    CSP_ENFORCAR para true).
 */
const CSP_ENFORCAR = false;
const PUBLICAS = ["/entrar", "/api/csp-report"];

function csp(nonce: string): string {
  const dev = process.env.NODE_ENV === "development";
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' blob: data:",
    "font-src 'self' data:",
    "connect-src 'self'",
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(dev || !CSP_ENFORCAR ? [] : ["upgrade-insecure-requests"]),
    "report-uri /api/csp-report",
  ].join("; ");
}

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const publica = PUBLICAS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  if (!publica && !req.cookies.get(COOKIE_SESSAO)?.value) {
    if (pathname.startsWith("/api/")) return NextResponse.json({ erro: "Sem acesso." }, { status: 401 });
    return NextResponse.redirect(new URL("/entrar", req.url));
  }

  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const politica = csp(nonce);
  const cabecalhos = new Headers(req.headers);
  cabecalhos.set("x-nonce", nonce);
  // o Next lê o nonce deste cabeçalho de REQUISIÇÃO (o navegador nunca o vê); quem o navegador aplica é o da resposta
  cabecalhos.set("Content-Security-Policy", politica);
  const resp = NextResponse.next({ request: { headers: cabecalhos } });
  resp.headers.set(CSP_ENFORCAR ? "Content-Security-Policy" : "Content-Security-Policy-Report-Only", politica);
  return resp;
}

export const config = {
  matcher: [
    {
      source: "/((?!_next/static|_next/image|icon.png|logo_alpargatas.png|logo_sim.png).*)",
      missing: [{ type: "header", key: "next-router-prefetch" }, { type: "header", key: "purpose", value: "prefetch" }],
    },
  ],
};
