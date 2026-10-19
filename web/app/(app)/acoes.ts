"use server";

import { redirect } from "next/navigation";

import { sair } from "@/lib/auth/sessao";

export async function acaoSair() {
  await sair();
  redirect("/entrar");
}

/** Saída por inatividade: encerra a sessão sem redirecionar (o navegador vai para a entrada com o aviso do motivo). */
export async function acaoSairPorInatividade() {
  await sair(true);
}
