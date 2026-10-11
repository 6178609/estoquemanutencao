"use server";

import { redirect } from "next/navigation";

import { entrar, entrarDemo } from "@/lib/auth/sessao";

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
