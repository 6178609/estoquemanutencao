"use server";

import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { registrar } from "@/lib/auditoria";
import { entrar, entrarDemo } from "@/lib/auth/sessao";
import { normalizarLogin } from "@/lib/auth/senha";
import { solicitar } from "@/lib/auth/solicitacoes";
import { criarPrimeiroAdmin } from "@/lib/auth/usuarios";

export interface EstadoEntrada {
  erro: string;
  login: string;
}

export async function acaoEntrar(_: EstadoEntrada, form: FormData): Promise<EstadoEntrada> {
  const login = String(form.get("login") || "");
  const senha = String(form.get("senha") || "");
  if (!login.trim() || !senha) return { erro: "Informe seu NP e a senha.", login };
  const erro = await entrar(login, senha, form.get("manter") === "on");
  if (erro) return { erro, login };
  redirect("/");
}

export async function acaoDemo() {
  await entrarDemo();
  redirect("/");
}

export interface EstadoPrimeiro {
  erro: string;
  nome: string;
  login: string;
  funcao: string;
}

/** Primeiro acesso com o repositório de dados vazio: cria o administrador e já entra. */
export async function acaoPrimeiroAdmin(_: EstadoPrimeiro, form: FormData): Promise<EstadoPrimeiro> {
  const campo = (k: string) => String(form.get(k) || "");
  const d = { nome: campo("nome"), login: campo("login"), funcao: campo("funcao"), senha: campo("senha"),
    senha2: campo("senha2"), codigo: campo("codigo") };
  const r = await criarPrimeiroAdmin(d);
  if (r.erro) return { erro: r.erro, nome: d.nome, login: d.login, funcao: d.funcao };
  registrar(r.login, "primeiro_admin", r.login);
  const erro = await entrar(r.login, d.senha, true);
  if (erro) return { erro, nome: d.nome, login: d.login, funcao: d.funcao };
  redirect("/usuarios?primeiro=1");
}

export interface EstadoPedido {
  erro: string;
  ok: boolean;
  nome: string;
  login: string;
  funcao: string;
  motivo: string;
}

/** Pedido de acesso: fica pendente até um administrador aprovar em Usuários › Solicitações. */
export async function acaoSolicitar(_: EstadoPedido, form: FormData): Promise<EstadoPedido> {
  const campo = (k: string) => String(form.get(k) || "");
  const d = { nome: campo("nome"), login: campo("login"), funcao: campo("funcao"), motivo: campo("motivo"),
    senha: campo("senha"), senha2: campo("senha2") };
  // limite por navegador: na fábrica todos saem pelo mesmo IP
  const jar = await cookies();
  let origem = jar.get("cm_nav")?.value || "";
  if (!/^[\w-]{16,64}$/.test(origem)) {
    origem = randomBytes(16).toString("base64url");
    jar.set("cm_nav", origem, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 86400 });
  }
  const erro = await solicitar(d, origem);
  if (!erro) registrar(normalizarLogin(d.login), "pedido_acesso", normalizarLogin(d.login), { funcao: d.funcao });
  return { erro, ok: !erro, nome: d.nome, login: d.login, funcao: d.funcao, motivo: d.motivo };
}
