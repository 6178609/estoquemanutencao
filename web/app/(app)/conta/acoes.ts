"use server";

import { revalidatePath } from "next/cache";

import { registrar } from "@/lib/auditoria";
import { exigir, hashSessaoAtual } from "@/lib/auth/sessao";
import { atualizarMeusDados, desconectarTodos, trocarSenha } from "@/lib/auth/usuarios";

export interface EstadoSenha {
  erro: string;
  ok: string;
}

/** Troca a própria senha. Na troca obrigatória (primeiro acesso / senha redefinida) não pede a atual. */
export async function acaoTrocarSenha(_: EstadoSenha, form: FormData): Promise<EstadoSenha> {
  const u = await exigir();
  if (u.demo) return { erro: "Na demonstração não há senha para trocar.", ok: "" };
  const atual = u.trocarSenha ? null : String(form.get("atual") || "");
  const erro = await trocarSenha(u.login, atual, String(form.get("s1") || ""), String(form.get("s2") || ""),
    await hashSessaoAtual());
  if (erro) return { erro, ok: "" };
  registrar(u.login, "senha_trocada", u.login, { obrigatoria: !!u.trocarSenha });
  revalidatePath("/", "layout");
  return { erro: "", ok: "Senha alterada. Os outros aparelhos conectados foram desconectados." };
}

export async function acaoDesconectarTodos() {
  const u = await exigir();
  if (!u.demo) {
    await desconectarTodos(u.login);
    registrar(u.login, "sessoes_encerradas", u.login);
  }
  revalidatePath("/", "layout");
}

export interface EstadoDados {
  erro: string;
  ok: string;
}

/** Atualização dos dados cadastrais (nome completo e e-mail): obrigatória todo mês, e liberada a qualquer hora em Minha conta. */
export async function acaoAtualizarDados(_: EstadoDados, form: FormData): Promise<EstadoDados> {
  const u = await exigir();
  if (u.demo) return { erro: "Na demonstração não há dados para atualizar.", ok: "" };
  const erro = await atualizarMeusDados(u.login, String(form.get("nome") || ""), String(form.get("email") || ""));
  if (erro) return { erro, ok: "" };
  registrar(u.login, "dados_atualizados", u.login, { obrigatoria: !!u.atualizarDados });
  revalidatePath("/", "layout");
  return { erro: "", ok: "Dados atualizados. A próxima confirmação será pedida daqui a 1 mês." };
}
