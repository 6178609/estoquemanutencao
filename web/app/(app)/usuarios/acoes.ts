"use server";

import { revalidatePath } from "next/cache";

import { registrar } from "@/lib/auditoria";
import { ehAdmin, FUNCOES } from "@/lib/auth/acesso";
import { exigir } from "@/lib/auth/sessao";
import { aprovar, recusar } from "@/lib/auth/solicitacoes";
import { criarUsuario, editarUsuario, excluirUsuario } from "@/lib/auth/usuarios";
import { TODAS } from "@/lib/navegacao";

export interface EstadoUsuario {
  erro: string;
  ok: string;
  alvo?: string;
}

async function admin() {
  const u = await exigir();
  return ehAdmin(u) && !u.demo && u.ativo !== false ? u : null;
}

const campo = (f: FormData, k: string) => String(f.get(k) || "");

export async function acaoCriarUsuario(_: EstadoUsuario, f: FormData): Promise<EstadoUsuario> {
  const eu = await admin();
  if (!eu) return { erro: "Só administradores podem cadastrar usuários.", ok: "" };
  const erro = await criarUsuario(eu.login, { nome: campo(f, "nome"), login: campo(f, "login"), funcao: campo(f, "funcao"),
    perfil: campo(f, "perfil"), senha: campo(f, "senha"), email: campo(f, "email") });
  if (erro) return { erro, ok: "" };
  registrar(eu.login, "usuario_criado", campo(f, "login").trim(), { funcao: campo(f, "funcao"), perfil: campo(f, "perfil") });
  revalidatePath("/usuarios");
  return { erro: "", ok: `Usuário ${campo(f, "login").trim()} criado. Passe a senha provisória para a pessoa — ela troca no primeiro acesso.` };
}

export async function acaoEditarUsuario(_: EstadoUsuario, f: FormData): Promise<EstadoUsuario> {
  const eu = await admin();
  if (!eu) return { erro: "Só administradores podem alterar usuários.", ok: "" };
  const alvo = campo(f, "alvo");
  const escolher = campo(f, "modo_abas") === "escolher";
  const funcao = campo(f, "funcao");
  const abas = escolher ? f.getAll("abas").map(String).filter((a) => TODAS.includes(a)) : null;
  const r = await editarUsuario(eu, alvo, {
    novoLogin: campo(f, "novo_login"), nome: campo(f, "nome"), funcao: funcao in FUNCOES ? funcao : "",
    perfil: campo(f, "perfil"), ativo: f.get("ativo") === "on", novaSenha: campo(f, "nova_senha"), email: campo(f, "email"),
    abas,
  });
  if (r.erro) return { erro: r.erro, ok: "", alvo };
  // o que ficou valendo (nunca a senha: só se foi redefinida)
  registrar(eu.login, "usuario_editado", r.login, { login_anterior: r.login !== alvo ? alvo : undefined, funcao, perfil: campo(f, "perfil"),
    ativo: f.get("ativo") === "on", abas: abas ?? "pela função", acesso_redefinido: !!campo(f, "nova_senha") });
  revalidatePath("/", "layout");
  return { erro: "", ok: r.login !== alvo ? `Usuário agora entra com o NP ${r.login}.` : "Usuário atualizado.", alvo: r.login };
}

export async function acaoExcluirUsuario(_: EstadoUsuario, f: FormData): Promise<EstadoUsuario> {
  const eu = await admin();
  if (!eu) return { erro: "Só administradores podem excluir usuários.", ok: "" };
  const alvo = campo(f, "alvo");
  const erro = await excluirUsuario(eu, alvo);
  if (erro) return { erro, ok: "", alvo };
  registrar(eu.login, "usuario_excluido", alvo);
  revalidatePath("/usuarios");
  return { erro: "", ok: `Usuário ${alvo} excluído.` };
}

export async function acaoAprovar(_: EstadoUsuario, f: FormData): Promise<EstadoUsuario> {
  const eu = await admin();
  if (!eu) return { erro: "Só administradores podem aprovar pedidos.", ok: "" };
  const alvo = campo(f, "alvo");
  const escolher = campo(f, "modo_abas") === "escolher";
  const abas = escolher ? f.getAll("abas").map(String).filter((a) => TODAS.includes(a)) : null;
  const erro = await aprovar(alvo, campo(f, "funcao"), campo(f, "perfil"), abas, eu.login);
  if (erro) return { erro, ok: "", alvo };
  registrar(eu.login, "pedido_aprovado", alvo, { funcao: campo(f, "funcao"), perfil: campo(f, "perfil"), abas: abas ?? "pela função" });
  revalidatePath("/usuarios");
  return { erro: "", ok: `Acesso de ${alvo} liberado. A pessoa já pode entrar com o NP e a senha que escolheu.`, alvo };
}

export async function acaoRecusar(_: EstadoUsuario, f: FormData): Promise<EstadoUsuario> {
  const eu = await admin();
  if (!eu) return { erro: "Só administradores podem recusar pedidos.", ok: "" };
  const alvo = campo(f, "alvo");
  const erro = await recusar(alvo, campo(f, "motivo"), eu.login);
  if (erro) return { erro, ok: "", alvo };
  registrar(eu.login, "pedido_recusado", alvo);
  revalidatePath("/usuarios");
  return { erro: "", ok: `Pedido de ${alvo} recusado.`, alvo };
}
