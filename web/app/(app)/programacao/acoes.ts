"use server";

import { revalidatePath } from "next/cache";

import { autorizar } from "@/lib/auth/sessao";
import { gravarCadastroLote, lerCadastro } from "@/lib/dados/cadastros";
import { FonteErro } from "@/lib/dados/fonte";

import * as md from "./logica";

/**
 * Gravações da Programação do mês — os MESMOS arquivos do app Streamlit (gravarCadastroLote):
 * - o dia da programação em programacao_maquinas.json;
 * - os pedidos ao robô do SAP em mudancas_datas.json com status "solicitada": o sincronizador do PC que tem o SAP
 *   pega o pedido em até 1 minuto, roda o robô e grava o resultado no mesmo lote (o site na Vercel não tem SAP).
 * Só administrador ou editor com acesso à aba.
 */
export type Resposta = { ok?: string; erro?: string };

async function quem(): Promise<string | null> {
  const u = await autorizar("programacao", true);
  return u ? u.nome || u.login : null;
}
const falha = (e: unknown): Resposta => ({ erro: e instanceof FonteErro || e instanceof Error ? e.message : "Não deu para gravar agora." });
const lotesAbertos = async () => Object.values(await lerCadastro(md.ARQ_LOTES)).some((v) => md.ABERTOS.includes(String((v as md.Lote)?.status)));

export async function salvarDia(iso: string, textoCampos: string): Promise<Resposta & { campos?: string[] }> {
  const q = await quem();
  if (!q) return { erro: "Sem permissão para alterar a programação." };
  if (md.deIso(iso) == null) return { erro: "Dia inválido." };
  const campos = md.separarCampos(textoCampos);
  try {
    await gravarCadastroLote(md.ARQ_PROGRAMACAO, { [iso]: campos.length ? { campos } : null }, q);
    revalidatePath("/programacao");
    return { ok: "Salvo.", campos };
  } catch (e) { return falha(e); }
}

export async function testarRobo(campo: string, ordem: string, mesIso: string): Promise<Resposta> {
  const q = await quem();
  if (!q) return { erro: "Só administrador ou editor." };
  try {
    if (await lotesAbertos()) return { erro: "Já há um pedido em andamento." };
    const ini = md.deIso(mesIso) ?? undefined;
    const [id, lote] = md.novoDiagnostico(q, campo, ordem, ini, ini != null ? md.fimDoMes(ini) : undefined);
    await gravarCadastroLote(md.ARQ_LOTES, { [id]: lote }, q);
    revalidatePath("/programacao");
    return { ok: "Teste enviado ao robô do SAP." };
  } catch (e) { return falha(e); }
}

export async function iniciarMudanca(de: string, ate: string, atrasadas: boolean, simular: boolean, confirma: boolean): Promise<Resposta> {
  const q = await quem();
  if (!q) return { erro: "Só administrador ou editor pode iniciar." };
  if (!confirma) return { erro: "Marque a confirmação." };
  let ini = md.deIso(de), fim = md.deIso(ate);
  if (ini == null || fim == null) return { erro: "Período inválido." };
  if (fim < ini) [ini, fim] = [fim, ini];
  try {
    if (await lotesAbertos()) return { erro: "Já há um lote em andamento." };
    const prog = md.programacaoValida(await lerCadastro(md.ARQ_PROGRAMACAO));
    const [id, lote] = md.novoLote(md.consultas(prog, ini, fim, atrasadas), q, simular, atrasadas);
    await gravarCadastroLote(md.ARQ_LOTES, { [id]: lote }, q);
    revalidatePath("/programacao");
    return { ok: `Lote ${id} enviado ao robô do SAP.` };
  } catch (e) { return falha(e); }
}

export async function desfazerLote(id: string): Promise<Resposta> {
  const q = await quem();
  if (!q) return { erro: "Só administrador ou editor." };
  try {
    const lotes = await lerCadastro(md.ARQ_LOTES);
    const lote = lotes[id] as md.Lote | undefined;
    if (!lote) return { erro: "Lote não encontrado." };
    if (await lotesAbertos()) return { erro: "Já há um lote em andamento." };
    if (lote.simular || ![md.CONCLUIDA, md.COM_ERROS].includes(String(lote.status))) return { erro: "Este lote não pode ser desfeito." };
    const [novo, l] = md.loteDesfazer(lote, q);
    await gravarCadastroLote(md.ARQ_LOTES, { [novo]: l }, q);
    revalidatePath("/programacao");
    return { ok: `Lote ${novo} (desfazer) enviado ao robô do SAP.` };
  } catch (e) { return falha(e); }
}

export async function cancelarLote(id: string): Promise<Resposta> {
  const q = await quem();
  if (!q) return { erro: "Só administrador ou editor." };
  try {
    const lote = (await lerCadastro(md.ARQ_LOTES))[id] as md.Lote | undefined;
    if (!lote) return { erro: "Lote não encontrado." };
    if (!md.ABERTOS.includes(String(lote.status))) return { erro: "Este pedido já terminou." };
    const { atualizado_em: _a, atualizado_por: _p, ...resto } = lote as md.Lote & { atualizado_por?: string };
    void _a; void _p;
    await gravarCadastroLote(md.ARQ_LOTES, { [id]: { ...resto, status: md.CANCELADA, resumo: `cancelado por ${q}` } }, q);
    revalidatePath("/programacao");
    return { ok: "Pedido cancelado." };
  } catch (e) { return falha(e); }
}
