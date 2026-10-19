"use server";

import { revalidatePath } from "next/cache";

import { soEstoque, veInteira } from "@/lib/auth/acesso";
import { autorizar } from "@/lib/auth/sessao";
import { gravarCadastroLote, lerCadastro } from "@/lib/dados/cadastros";
import { contexto } from "@/lib/wcm/contexto";
import { bases } from "@/lib/wcm/dados";

import { infoCad, inventarioAtivos, materiaisDe } from "../equipamentos/dados";
import { NIVEIS, porAtivo, type Nivel } from "./alocacao";
import { baseMateriais, camposDosAtivos, sugestoesAlocacao } from "./dados";
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
  const [b, cad] = await Promise.all([bases(), lerCadastro(ARQ, { fresco: true })]); // o cadastro de agora
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

// ----------------------------------------------------------------------------
// Alocação automática (pelo texto) — em lote, com desfazer da última
// ----------------------------------------------------------------------------
const ARQ_LOG = "alocacao_automatica.json";
const MAX_LOTE = 20_000;

/** Vincula de uma vez todas as sugestões dos níveis escolhidos (recalculadas aqui, no servidor). */
export async function alocarAutomatico(niveis: Nivel[], ativoUnico?: string): Promise<{ erro: string } | { ok: true; pares: number; ativos: number }> {
  const u = await quemEdita();
  if (!u) return { erro: "Seu acesso não permite alterar as peças dos ativos (só editor ou administrador)." };
  const ns = niveis.filter((n): n is Nivel => NIVEIS.includes(n));
  if (!ns.length) return { erro: "Escolha o nível de confiança." };
  const c = await contexto({});
  const [inv, bm, campos] = await Promise.all([inventarioAtivos(c), baseMateriais(), camposDosAtivos(c)]);
  const todas = await sugestoesAlocacao(c, inv, bm, campos, (k) => new Set(materiaisDe(infoCad(c, k))));
  const escolhidas = todas.filter((s) => ns.includes(s.nivel) && (!ativoUnico || s.ativo === ativoUnico)).slice(0, MAX_LOTE);
  if (!escolhidas.length) return { erro: "Nenhuma sugestão nesses níveis." };
  const grupos = porAtivo(escolhidas);
  try {
    // tudo numa gravação só; cada ativo calculado sobre o item relido (nada se perde com edições ao mesmo tempo)
    await gravarCadastroLote(ARQ, Object.fromEntries([...grupos].map(([t, mats]) => [t, (atual: Record<string, unknown> | undefined) => aplicarPecas(atual, mats, [])])),
      u.nome || u.login);
    await gravarCadastroLote(ARQ_LOG, { ultima: { em: new Date().toISOString(), por: u.nome || u.login, niveis: ns, pares: escolhidas.map((s) => [s.ativo, s.material]) } },
      u.nome || u.login);
  } catch (e) {
    return { erro: (e as Error).message };
  }
  for (const r of ["/mro", "/equipamentos", "/estoque", "/painel"]) revalidatePath(r);
  return { ok: true, pares: escolhidas.length, ativos: grupos.size };
}

/** Desfaz a última alocação automática (tira só os vínculos que ela pôs). */
export async function desfazerAlocacao(): Promise<{ erro: string } | { ok: true; pares: number }> {
  const u = await quemEdita();
  if (!u) return { erro: "Seu acesso não permite alterar as peças dos ativos (só editor ou administrador)." };
  const ultima = (await lerCadastro(ARQ_LOG, { fresco: true })).ultima as { pares?: unknown } | undefined;
  const pares = Array.isArray(ultima?.pares) ? (ultima!.pares as unknown[]).filter((p): p is [string, string] => Array.isArray(p) && p.length === 2) : [];
  if (!pares.length) return { erro: "Não há alocação automática para desfazer." };
  const grupos = new Map<string, string[]>();
  for (const [t, m] of pares) (grupos.get(t) ?? grupos.set(t, []).get(t)!).push(String(m));
  try {
    await gravarCadastroLote(ARQ, Object.fromEntries([...grupos].map(([t, mats]) => [t, (atual: Record<string, unknown> | undefined) => aplicarPecas(atual, [], mats)])),
      u.nome || u.login);
    await gravarCadastroLote(ARQ_LOG, { ultima: null }, u.nome || u.login);
  } catch (e) {
    return { erro: (e as Error).message };
  }
  for (const r of ["/mro", "/equipamentos", "/estoque", "/painel"]) revalidatePath(r);
  return { ok: true, pares: pares.length };
}
