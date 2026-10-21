"use server";

import { revalidatePath } from "next/cache";

import { autorizar } from "@/lib/auth/sessao";
import { gravarCadastroLote } from "@/lib/dados/cadastros";
import * as ind from "@/lib/wcm/indicadores";

import { validarOrcamento } from "./validacao";

/**
 * Valor disponível mensal (metas_wcm.json): "orcamento:AAAA-MM" → {"valor": x} ou removido quando vazio.
 * Só os 12 meses do ano gravado; os demais itens do arquivo não são tocados.
 */
export interface Resposta { erro: string; ok: string }

const NEGADO: Resposta = { erro: "Só editores e administradores lançam o valor disponível.", ok: "" };

/** Grava os 12 meses de um ano. valores[0] = janeiro; null apaga aquele mês. */
export async function salvarOrcamento(ano: number, valores: (number | null)[]): Promise<Resposta> {
  const u = await autorizar("custos", true);
  if (!u) return NEGADO;
  const erro = validarOrcamento(ano, valores);
  if (erro) return { erro, ok: "" };
  const itens: Record<string, { valor: number } | null> = {};
  valores.forEach((v, i) => {
    const mes = String(i + 1).padStart(2, "0");
    itens[`orcamento:${ano}-${mes}`] = v === null ? null : { valor: Math.round(v * 100) / 100 };
  });
  try {
    await gravarCadastroLote(ind.ARQ_METAS, itens, u.nome || u.login, false);
  } catch (e) {
    return { erro: (e as Error).message || "Falha ao gravar.", ok: "" };
  }
  revalidatePath("/", "layout"); // o disponível aparece em toda a aba Custos
  return { erro: "", ok: "Valor disponível salvo." };
}
