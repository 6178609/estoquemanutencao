"use server";

import { revalidatePath } from "next/cache";

import { podeEditar, veInteira } from "@/lib/auth/acesso";
import { autorizar } from "@/lib/auth/sessao";
import { gravarCadastroLote } from "@/lib/dados/cadastros";
import { ARQ_COMENTARIOS, chaveMaquina, chaveValida, limparComentario } from "@/lib/wcm/roadmapSim";

/**
 * Comentário manual de uma máquina do Roadmap (editor ou administrador que vê a aba inteira). `texto: null` volta ao
 * comentário da planilha; texto vazio grava um comentário manual vazio (apaga o da planilha na tela).
 */
export async function salvarComentarioRoadmap(fabrica: string, maquina: string, texto: string | null): Promise<{ erro: string } | { ok: true }> {
  const u = await autorizar("indicadores_sim", true);
  if (!u || !veInteira(u, "indicadores_sim") || !podeEditar(u)) return { erro: "Seu acesso não permite alterar os comentários (só editor ou administrador)." };
  const k = chaveMaquina(String(fabrica ?? ""), String(maquina ?? ""));
  if (!chaveValida(k)) return { erro: "Máquina inválida." };
  try {
    await gravarCadastroLote(ARQ_COMENTARIOS, { [k]: texto === null ? null : { comentario: limparComentario(texto) } }, u.nome || u.login);
  } catch (e) {
    return { erro: (e as Error).message };
  }
  revalidatePath("/indicadores_sim");
  return { ok: true };
}
