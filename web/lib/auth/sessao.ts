import "server-only";

import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { gravarCadastroLote, lerCadastro } from "../dados/cadastros";
import { fonte } from "../dados/fonte";
import { podeEditar, podeVer, type Usuario } from "./acesso";
import { COOKIE_ATIVO, COOKIE_SESSAO, VALIDADE_S } from "./inatividade";
import { confere, hashToken, normalizarLogin } from "./senha";

/**
 * Sessões no formato do cadastro: o hash do token fica em `sessoes` do usuário (usuarios.json), então
 * desativar alguém ou trocar a senha dele (que limpa as sessões) derruba o acesso.
 */
const COOKIE = COOKIE_SESSAO;
const DIAS_MANTER = 30;
const HORAS_SEM_MANTER = 12;
const MAX_FALHAS = 5;
const BLOQUEIO_MS = 5 * 60_000;
const ARQ = "usuarios.json";

export interface UsuarioSessao extends Usuario {
  login: string;
  demo?: boolean;
  trocarSenha?: boolean;
}

type Registro = Record<string, unknown> & { sessoes?: { h?: string; ate?: string }[] };

const tentativas = new Map<string, { falhas: number; ate: number }>();
// demonstração: na memória do processo (globalThis: as rotas de API e as páginas podem ter cópias separadas do módulo)
const globalDemo = globalThis as unknown as { __cmSessoesDemo?: Map<string, number> };
const sessoesDemo = (globalDemo.__cmSessoesDemo ??= new Map<string, number>()); // hash → validade (ms)
const USUARIO_DEMO: UsuarioSessao = { login: "demo", nome: "Visitante", funcao: "analista", perfil: "editor", demo: true };

async function usuarios(fresco = false): Promise<Record<string, Registro>> {
  const todos = await lerCadastro(ARQ, { fresco });
  return Object.fromEntries(Object.entries(todos).filter(([, v]) => v && typeof v === "object")) as Record<string, Registro>;
}

function publico(login: string, u: Registro): UsuarioSessao {
  return {
    login, nome: (u.nome as string) || login, funcao: u.funcao as string | undefined,
    perfil: u.perfil as string | undefined, abas: u.abas, ativo: u.ativo !== false, trocarSenha: !!u.trocar_senha,
  };
}

async function gravarCookie(login: string, token: string, manter: boolean) {
  const jar = await cookies();
  jar.set(COOKIE, `${encodeURIComponent(login)}:${token}`, {
    httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/",
    ...(manter ? { maxAge: DIAS_MANTER * 86400 } : {}),
  });
  // a contagem de inatividade começa agora (um registro antigo de outra sessão derrubaria esta na hora)
  jar.set(COOKIE_ATIVO, String(Date.now()), {
    httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: VALIDADE_S,
  });
}

/** Devolve mensagem de erro, ou "" se entrou. */
export async function entrar(loginDigitado: string, senha: string, manter: boolean): Promise<string> {
  const login = normalizarLogin(loginDigitado);
  if (!fonte()) return "Este site ainda está sem a fonte de dados: use “Entrar na demonstração”.";
  const t = tentativas.get(login);
  if (t && t.ate > Date.now()) return `Muitas tentativas erradas. Tente de novo em ${Math.ceil((t.ate - Date.now()) / 60_000)} min.`;
  const us = await usuarios();
  const u = us[login] || null;
  if (!u) {
    // senha certa de um pedido ainda não aprovado: avisa em vez de "incorretos"
    const { pendentes } = await import("./solicitacoes");
    const ped = (await pendentes().catch(() => ({})) as Record<string, Record<string, unknown>>)[login];
    if (ped && (await confere(ped, senha))) return "Seu pedido de acesso ainda está aguardando aprovação de um administrador.";
  }
  if (!u || !(await confere(u, senha))) {
    const falhas = (t?.falhas || 0) + 1;
    tentativas.set(login, falhas >= MAX_FALHAS ? { falhas: 0, ate: Date.now() + BLOQUEIO_MS } : { falhas, ate: 0 });
    return "Login ou senha incorretos.";
  }
  if (u.ativo === false) return "Usuário desativado. Fale com um administrador.";
  tentativas.delete(login);
  const token = randomBytes(32).toString("base64url");
  const agora = new Date();
  const ate = new Date(agora.getTime() + (manter ? DIAS_MANTER * 86400_000 : HORAS_SEM_MANTER * 3600_000));
  const iso = (d: Date) => d.toISOString().replace(/\.\d{3}Z$/, "+00:00");
  const validas = (u.sessoes || []).filter((s) => (s.ate || "") > iso(agora));
  await gravarCadastroLote(ARQ, {
    [login]: { sessoes: [...validas, { h: hashToken(token), ate: iso(ate) }].slice(-10), ultimo_acesso: iso(agora) },
  }, login, true);
  await gravarCookie(login, token, manter);
  return "";
}

export async function entrarDemo(): Promise<void> {
  if (fonte()) return; // com dados reais não existe atalho
  const token = randomBytes(32).toString("base64url");
  sessoesDemo.set(hashToken(token), Date.now() + HORAS_SEM_MANTER * 3600_000);
  await gravarCookie("demo", token, false);
}

export async function sair(): Promise<void> {
  const jar = await cookies();
  const valor = jar.get(COOKIE)?.value;
  jar.delete(COOKIE);
  jar.delete(COOKIE_ATIVO);
  if (!valor || !fonte()) return;
  const [loginCod, token] = valor.split(":");
  const login = decodeURIComponent(loginCod || "");
  const u = (await usuarios())[login];
  if (!u || !token) return;
  const h = hashToken(token);
  await gravarCadastroLote(ARQ, { [login]: { sessoes: (u.sessoes || []).filter((s) => s.h !== h) } }, login, true);
}

/** Quem está usando (null = ninguém). Confere o cadastro de agora: desativado ou sessão revogada sai na hora. */
export async function usuarioAtual(): Promise<UsuarioSessao | null> {
  const valor = (await cookies()).get(COOKIE)?.value;
  if (!valor) return null;
  const i = valor.indexOf(":");
  if (i < 1) return null;
  const login = decodeURIComponent(valor.slice(0, i));
  const h = hashToken(valor.slice(i + 1));
  if (!fonte()) {
    const validade = sessoesDemo.get(h);
    return login === "demo" && validade && validade > Date.now() ? USUARIO_DEMO : null;
  }
  const agora = new Date().toISOString();
  const valida = (u: Registro | undefined) => !!u && u.ativo !== false && (u.sessoes || []).some((s) => s.h === h && (s.ate || "") > agora);
  let u = (await usuarios())[login];
  // sessão criada há pouco em outra instância do servidor: confere a versão de agora antes de recusar
  if (!valida(u)) u = (await usuarios(true))[login];
  return valida(u) ? publico(login, u!) : null;
}

/** Hash do token deste aparelho (para manter só esta sessão ao trocar a senha). */
export async function hashSessaoAtual(): Promise<string | null> {
  const valor = (await cookies()).get(COOKIE)?.value || "";
  const i = valor.indexOf(":");
  return i > 0 ? hashToken(valor.slice(i + 1)) : null;
}

/** Para páginas: exige login e acesso à aba (senão vai para a entrada / para o início). */
export async function exigir(aba?: string): Promise<UsuarioSessao> {
  const u = await usuarioAtual();
  if (!u) redirect("/entrar");
  if (aba && !podeVer(u, aba)) redirect("/");
  return u;
}

/** Para rotas de API e ações: null se não pode (a rota responde 401/403). */
export async function autorizar(aba: string, editar = false): Promise<UsuarioSessao | null> {
  const u = await usuarioAtual();
  if (!u || !podeVer(u, aba) || (editar && !podeEditar(u))) return null;
  return u;
}
