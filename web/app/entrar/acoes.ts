"use server";

import { redirect } from "next/navigation";

import { entrar, entrarDemo } from "@/lib/auth/sessao";
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
  const erro = await entrar(r.login, d.senha, true);
  if (erro) return { erro, nome: d.nome, login: d.login, funcao: d.funcao };
  redirect("/usuarios?primeiro=1");
}
