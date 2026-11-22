import { NextResponse, type NextRequest } from "next/server";

import { COOKIE_ATIVO, COOKIE_SESSAO, expirou, MOTIVO, VALIDADE_S } from "./lib/auth/inatividade";
import { CABECALHO_CAMINHO, caminhoDeVolta, PARAM_VOLTA } from "./lib/auth/volta";

/** "&volta=<caminho>" para a entrada voltar à página pedida (só GET e caminho interno). */
function voltaPara(req: NextRequest) {
  const v = req.method === "GET" ? caminhoDeVolta(`${req.nextUrl.pathname}${req.nextUrl.search}`) : "";
  return v && v !== "/" ? `&${PARAM_VOLTA}=${encodeURIComponent(v)}` : "";
}

/** Segue adiante passando às páginas o caminho pedido (para a entrada voltar a ele depois do login: lib/auth/volta.ts). */
function seguir(req: NextRequest) {
  const h = new Headers(req.headers);
  h.set(CABECALHO_CAMINHO, `${req.nextUrl.pathname}${req.nextUrl.search}`.slice(0, 300));
  return NextResponse.next({ request: { headers: h } });
}

/**
 * Saída por inatividade no servidor: cada requisição de quem está logado renova a hora da última atividade (cookie);
 * se ela passou do limite (navegador fechado, computador suspenso…), encerra a sessão e manda para a entrada.
 * O navegador também sai sozinho no limite (components/Inatividade.tsx), com aviso antes.
 */
export function proxy(req: NextRequest) {
  if (!req.cookies.get(COOKIE_SESSAO)?.value) return seguir(req);
  const agora = Date.now();
  if (expirou(Number(req.cookies.get(COOKIE_ATIVO)?.value), agora)) {
    // na própria entrada só limpa os cookies (o login segue); API e server action recebem 401 (um redirect repetiria o
    // POST na entrada); navegação vai para a entrada com o motivo
    const caminho = req.nextUrl.pathname;
    const r = caminho === "/entrar" ? seguir(req)
      : caminho.startsWith("/api/") || req.headers.has("next-action")
        ? NextResponse.json({ erro: "Sessão encerrada por inatividade. Entre de novo." }, { status: 401 })
        : NextResponse.redirect(new URL(`/entrar?motivo=${MOTIVO}${voltaPara(req)}`, req.url));
    r.cookies.delete(COOKIE_SESSAO);
    r.cookies.delete(COOKIE_ATIVO);
    return r;
  }
  const r = seguir(req);
  r.cookies.set(COOKIE_ATIVO, String(agora), {
    // dura o mesmo que a sessão mais longa: sumir o cookie não pode valer como "sem registro" para quem voltou dias depois
    httpOnly: true, sameSite: "lax", path: "/", secure: process.env.NODE_ENV === "production", maxAge: VALIDADE_S,
  });
  return r;
}

export const config = {
  // tudo menos os arquivos estáticos (o ícone, os scripts e o CSS não contam como atividade)
  matcher: ["/((?!_next/static|_next/image|icon.png|favicon.ico|robots.txt).*)"],
};
