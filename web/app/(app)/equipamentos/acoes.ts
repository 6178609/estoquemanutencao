"use server";

import { revalidatePath } from "next/cache";

import { veInteira } from "@/lib/auth/acesso";
import { autorizar } from "@/lib/auth/sessao";
import { gravarCadastroLote, lerCadastro } from "@/lib/dados/cadastros";
import { comPecaSemCadastro, semPecaSemCadastro, validarPecaSemCadastro } from "@/lib/dados/pecasSemCadastro";
import { bases } from "@/lib/wcm/dados";
import { partes } from "@/lib/wcm/util";

import { procurarMateriais } from "./dados";
import { validarCadastro, type FormCadastro, type SituacaoPeca } from "./logica";

/**
 * Escrita do cadastro de equipamentos — o `cadastro_equipamentos.json`, com estas chaves
 * (nome, categoria, criticidade, observacoes, materiais, situacao, fabricante, modelo, serie, ano_instalacao,
 * vida_util, garantia_ate, valor_reposicao). Só editor/administrador que vê a aba inteira.
 */
const ARQ = "cadastro_equipamentos.json";

async function quemEdita() {
  const u = await autorizar("equipamentos", true);
  return u && veInteira(u, "equipamentos") ? u : null;
}

export async function salvarEquipamento(form: Partial<FormCadastro>, editando: string | null): Promise<{ erro: string } | { ok: true; tag: string }> {
  const u = await quemEdita();
  if (!u) return { erro: "Seu acesso não permite alterar o cadastro de equipamentos (só editor ou administrador)." };
  const b = await bases();
  const v = validarCadastro(form, partes(b.hoje).ano);
  if ("erro" in v) return v;
  const cad = await lerCadastro(ARQ);
  const ed = editando && editando in cad ? editando : null;
  if (v.tag !== ed && v.tag in cad) return { erro: `A TAG ${v.tag} já está cadastrada — use Editar na lista.` };
  // o formulário não mexe nas peças sem cadastro: elas seguem no item (também quando a TAG é renomeada)
  const semCad = ed ? cad[ed]?.pecas_sem_cadastro : undefined;
  const itens: Parameters<typeof gravarCadastroLote>[1] = { [v.tag]: (atual) => {
    const lista = atual?.pecas_sem_cadastro ?? semCad;
    return { ...v.item, ...(lista ? { pecas_sem_cadastro: lista } : {}) };
  } };
  if (ed && ed !== v.tag) itens[ed] = null; // TAG renomeada
  try {
    await gravarCadastroLote(ARQ, itens, u.nome || u.login);
  } catch (e) {
    return { erro: (e as Error).message };
  }
  revalidatePath("/equipamentos");
  revalidatePath("/mro");
  return { ok: true, tag: v.tag };
}

export async function removerEquipamento(tag: string): Promise<{ erro: string } | { ok: true }> {
  const u = await quemEdita();
  if (!u) return { erro: "Só editor ou administrador remove equipamentos." };
  if (typeof tag !== "string" || !tag || tag.length > 60) return { erro: "TAG inválida." };
  try {
    await gravarCadastroLote(ARQ, { [tag]: null }, u.nome || u.login);
  } catch (e) {
    return { erro: (e as Error).message };
  }
  revalidatePath("/equipamentos");
  revalidatePath("/mro");
  return { ok: true };
}

/** Busca na base de material (MB52) para vincular componentes: até 60 itens. */
export async function buscarMateriais(q: string): Promise<{ itens: SituacaoPeca[]; total: number; semBase: boolean }> {
  if (!(await quemEdita())) return { itens: [], total: 0, semBase: false };
  return procurarMateriais(q);
}

/** Nome, código ABC e situação do equipamento no SAP (IH08, depois IW38) — sugestão ao digitar a TAG. */
export async function sugestaoSap(tag: string): Promise<{ nome: string; abc: string; desativado: boolean } | null> {
  if (!(await quemEdita())) return null;
  const t = String(tag ?? "").trim().toUpperCase().slice(0, 60);
  if (!t) return null;
  const b = await bases();
  const eq = b.equipamentos.dados?.find((x) => x.equipamento === t);
  const nomeO = b.ordens.dados?.find((o) => o.equipChave === t)?.objeto ?? "";
  if (!eq && !nomeO) return null;
  return { nome: eq?.denominacao || nomeO, abc: eq?.codigoAbc ?? "", desativado: !!eq?.desativado };
}

/** Põe uma peça sem cadastro no Sysmat no equipamento (lista para pedir o cadastro). */
export async function adicionarPecaSemCadastro(tag: string, form: Record<string, unknown>): Promise<{ erro: string } | { ok: true }> {
  const u = await quemEdita();
  if (!u) return { erro: "Só editor ou administrador inclui peças." };
  if (typeof tag !== "string" || !tag || tag.length > 60) return { erro: "Equipamento inválido." };
  const v = validarPecaSemCadastro(form ?? {});
  if ("erro" in v) return v;
  const b = await bases();
  const nome = b.equipamentos.dados?.find((x) => x.equipamento === tag)?.denominacao ?? tag;
  let repetida = false;
  try {
    await gravarCadastroLote(ARQ, { [tag]: (atual) => {
      const novo = comPecaSemCadastro(atual, nome, v, crypto.randomUUID().slice(0, 12), new Date().toISOString(), u.nome || u.login);
      repetida = !novo;
      return novo ?? undefined;
    } }, u.nome || u.login);
  } catch (e) {
    return { erro: (e as Error).message };
  }
  if (repetida) return { erro: "Essa peça já está na lista (mesma descrição e referência)." };
  revalidatePath("/equipamentos/biblioteca");
  return { ok: true };
}

export async function removerPecaSemCadastro(tag: string, id: string): Promise<{ erro: string } | { ok: true }> {
  const u = await quemEdita();
  if (!u) return { erro: "Só editor ou administrador remove peças." };
  if (typeof tag !== "string" || !tag || tag.length > 60 || typeof id !== "string" || id.length > 40) return { erro: "Pedido inválido." };
  try {
    await gravarCadastroLote(ARQ, { [tag]: (atual) => semPecaSemCadastro(atual, id) ?? undefined }, u.nome || u.login);
  } catch (e) {
    return { erro: (e as Error).message };
  }
  revalidatePath("/equipamentos/biblioteca");
  return { ok: true };
}
