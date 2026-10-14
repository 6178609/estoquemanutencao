"use server";

import { revalidatePath } from "next/cache";

import { soEstoque, veInteira } from "@/lib/auth/acesso";
import { autorizar } from "@/lib/auth/sessao";
import { gravarCadastroLote, lerCadastro } from "@/lib/dados/cadastros";
import { fonte } from "@/lib/dados/fonte";
import { bases } from "@/lib/wcm/dados";

import { baseMateriais } from "./dados";
import { aplicarPecas, limparCodigos, MAX_PECAS, procurar, type PecaMro } from "./logica";

/**
 * Escrita da Gestão de MRO: só o campo `materiais` do `cadastro_equipamentos.json` (o mesmo que a aba Equipamentos
 * edita), relido na hora da gravação. Editor ou administrador que vê a aba (terceiros só consultam).
 */
const ARQ = "cadastro_equipamentos.json";

async function quemEdita() {
  const u = await autorizar("mro", true);
  return u && veInteira(u, "mro") && !soEstoque(u) ? u : null;
}

/** Busca na MB52 e no catálogo Sysmat para vincular (até 60 itens). */
export async function buscarMateriaisMro(q: string): Promise<{ itens: PecaMro[]; total: number; semBase: boolean }> {
  if (!(await quemEdita())) return { itens: [], total: 0, semBase: false };
  const [b, cadMat] = await Promise.all([baseMateriais(), lerCadastro("cadastro_materiais.json")]);
  if (!b.est && !b.cat) return { itens: [], total: 0, semBase: true };
  return { ...procurar(b, cadMat, q), semBase: false };
}

/** Vincula e/ou desvincula peças de um ativo da lista de equipamentos. */
export async function alterarPecas(tag: string, adicionar: string[], remover: string[]): Promise<{ erro: string } | { ok: true }> {
  const u = await quemEdita();
  if (!u) return { erro: "Seu acesso não permite alterar as peças dos ativos (só editor ou administrador)." };
  const t = String(tag ?? "").trim().toUpperCase().slice(0, 60);
  const add = limparCodigos(adicionar).slice(0, MAX_PECAS), rem = limparCodigos(remover);
  if (!t) return { erro: "Equipamento inválido." };
  if (!add.length && !rem.length) return { erro: "Nenhuma peça informada." };
  await fonte()?.versoes(true); // o cadastro de agora (para saber se o equipamento existe)
  const [b, cad] = await Promise.all([bases(), lerCadastro(ARQ)]);
  const noSap = !!b.equipamentos.dados?.some((x) => x.equipamento === t) || !!b.ordens.dados?.some((o) => o.equipChave === t);
  if (!cad[t] && !noSap) return { erro: `O equipamento ${t} não está na lista de equipamentos (IH08, IW38 ou cadastro do site).` };
  try {
    // a lista final é calculada sobre o item relido dentro da gravação condicional: edições ao mesmo tempo não se perdem
    await gravarCadastroLote(ARQ, { [t]: (atual) => aplicarPecas(atual, add, rem) }, u.nome || u.login);
  } catch (e) {
    return { erro: (e as Error).message };
  }
  for (const r of ["/mro", "/equipamentos", "/estoque", "/painel"]) revalidatePath(r);
  return { ok: true };
}
