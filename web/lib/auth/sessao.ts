import "server-only";

import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { gravarCadastroLote, lerCadastro } from "../dados/cadastros";
import { fonte } from "../dados/fonte";
import { podeEditar, podeVer, type Usuario } from "./acesso";
import { auditar } from "../seguranca/auditoria";
import { bloqueadoPor, ipAtual, limpar, registrarFalha, type Regra } from "../seguranca/limite";
import { COOKIE_SESSAO } from "./cookie";
import { confere, hashToken, normalizarLogin } from "./senha";

/**
 * Sessões no mesmo formato do site atual: o hash do token fica em `sessoes` do usuário (usuarios.json), então
 * desativar alguém ou trocar a senha dele (que limpa as sessões) derruba o acesso nos dois sites.
 */
const COOKIE = COOKIE_SESSAO;
const DIAS_MANTER = 30;
const HORAS_SEM_MANTER = 12;
// três travas: quem erra muito num NP (só aquele aparelho), um aparelho que testa muitos NPs, e o NP que sofre
// ataque de muitos aparelhos. A do NP é bem mais folgada, para ninguém conseguir trancar a conta dos outros.
const REGRA_IP_NP: Regra = { max: 5, janelaMs: 5 * 60_000 };
const REGRA_IP: Regra = { max: 20, janelaMs: 10 * 60_000 };
const REGRA_NP: Regra = { max: 40, janelaMs: 15 * 60_000 };
const ARQ = "usuarios.json";

export interface UsuarioSessao extends Usuario {
  login: string;
  demo?: boolean;
  trocarSenha?: boolean;
}

type Registro = Record<string, unknown> & { sessoes?: { h?: string; ate?: string }[] };

// demonstração: na memória do processo (globalThis: as rotas de API e as páginas podem ter cópias separadas do módulo)
const globalDemo = globalThis as unknown as { __cmSessoesDemo?: Map<string, number> };
const sessoesDemo = (globalDemo.__cmSessoesDemo ??= new Map<string, number>()); // hash → validade (ms)
const USUARIO_DEMO: UsuarioSessao = { login: "demo", nome: "Visitante", funcao: "analista", perfil: "editor", demo: true };

async function usuarios(): Promise<Record<string, Registro>> {
  const todos = await lerCadastro(ARQ);
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
}

/** Devolve mensagem de erro, ou "" se entrou. */
export async function entrar(loginDigitado: string, senha: string, manter: boolean): Promise<string> {
  const login = normalizarLogin(loginDigitado).slice(0, 64);
  if (!fonte()) return "Este site ainda está sem a fonte de dados: use “Entrar na demonstração”.";
  const ip = await ipAtual();
  const chaves = { ipNp: `login:${ip}:${login}`, ip: `login-ip:${ip}`, np: `login-np:${login}` };
  const espera = Math.max(await bloqueadoPor(chaves.ipNp, REGRA_IP_NP), await bloqueadoPor(chaves.ip, REGRA_IP),
    await bloqueadoPor(chaves.np, REGRA_NP));
  if (espera) {
    auditar("login_bloqueado", { login, ip });
    return `Muitas tentativas erradas. Tente de novo em ${espera} min.`;
  }
  const us = await usuarios();
  const u = Object.hasOwn(us, login) ? us[login] : null;
  if (!u || !(await confere(u, senha))) {
    await Promise.all([registrarFalha(chaves.ipNp, REGRA_IP_NP), registrarFalha(chaves.ip, REGRA_IP),
      registrarFalha(chaves.np, REGRA_NP)]);
    auditar("login_falha", { login, ip });
    return "Login ou senha incorretos.";
  }
  if (u.ativo === false) return "Usuário desativado. Fale com um administrador.";
  await limpar(chaves.ipNp);
  const token = randomBytes(32).toString("base64url");
  const agora = new Date();
  const ate = new Date(agora.getTime() + (manter ? DIAS_MANTER * 86400_000 : HORAS_SEM_MANTER * 3600_000));
  const iso = (d: Date) => d.toISOString().replace(/\.\d{3}Z$/, "+00:00");
  const validas = (u.sessoes || []).filter((s) => (s.ate || "") > iso(agora));
  await gravarCadastroLote(ARQ, {
    [login]: { sessoes: [...validas, { h: hashToken(token), ate: iso(ate) }].slice(-10), ultimo_acesso: iso(agora) },
  }, login, true);
  await gravarCookie(login, token, manter);
  auditar("login_ok", { login, ip });
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
  if (!valor || !fonte()) return;
  const [loginCod, token] = valor.split(":");
  const login = decodeURIComponent(loginCod || "");
  const us = await usuarios();
  const u = Object.hasOwn(us, login) ? us[login] : undefined;
  if (!u || !token) return;
  const h = hashToken(token);
  await gravarCadastroLote(ARQ, { [login]: { sessoes: (u.sessoes || []).filter((s) => s.h !== h) } }, login, true);
  auditar("logout", { login });
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
  const us = await usuarios();
  const u = Object.hasOwn(us, login) ? us[login] : undefined;
  if (!u || u.ativo === false) return null;
  const agora = new Date().toISOString();
  return (u.sessoes || []).some((s) => s.h === h && (s.ate || "") > agora) ? publico(login, u) : null;
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
