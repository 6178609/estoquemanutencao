"use server";

import { revalidatePath } from "next/cache";

import { autorizar } from "@/lib/auth/sessao";
import { gravarCadastroLote, lerCadastro } from "@/lib/dados/cadastros";
import * as ind from "@/lib/wcm/indicadores";

/**
 * Gravações da aba Metas e parâmetros — o MESMO metas_wcm.json do app Streamlit (paginas/metas.py):
 *   "<id do indicador>" → {"meta": x | ""} (mesclar) · "_parametros" → {"horas_semana": x} (mesclar)
 *   "capacidade:<centro>" → {"hh": x} ou removido · "tipo:<código>" → {"descricao": "...", "classe": "..."} (mesclar)
 */
export interface Resposta { erro: string; ok: string }

const NEGADO: Resposta = { erro: "Só editores e administradores alteram metas e parâmetros.", ok: "" };
const numeroValido = (v: unknown, max = 1e12) => typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= max;

async function gravar(itens: Record<string, Record<string, unknown> | null>, usuario: string, mesclar: boolean, ok: string): Promise<Resposta> {
  try {
    await gravarCadastroLote(ind.ARQ_METAS, itens, usuario, mesclar);
  } catch (e) {
    return { erro: (e as Error).message || "Falha ao gravar.", ok: "" };
  }
  revalidatePath("/", "layout"); // metas mudam o farol de todas as abas
  return { erro: "", ok };
}

/** {id: meta | null} — null deixa o indicador sem meta (grava "" como o Streamlit). */
export async function salvarMetas(mudancas: Record<string, number | null>): Promise<Resposta> {
  const u = await autorizar("metas", true);
  if (!u) return NEGADO;
  const itens: Record<string, Record<string, unknown>> = {};
  for (const [id, v] of Object.entries(mudancas ?? {})) {
    if (!ind.POR_ID[id]) return { erro: `Indicador desconhecido: ${id}.`, ok: "" };
    if (v !== null && !numeroValido(v)) return { erro: `Meta inválida em ${ind.POR_ID[id].nome}.`, ok: "" };
    itens[id] = { meta: v === null ? "" : v };
  }
  if (!Object.keys(itens).length) return { erro: "Nada mudou.", ok: "" };
  return gravar(itens, u.nome || u.login, true, `${Object.keys(itens).length} meta(s) salva(s).`);
}

/** Remove as metas personalizadas (volta às padrão). */
export async function restaurarMetas(): Promise<Resposta> {
  const u = await autorizar("metas", true);
  if (!u) return NEGADO;
  const cad = await lerCadastro(ind.ARQ_METAS);
  const itens = Object.fromEntries(ind.KPIS.filter((k) => k.id in cad).map((k) => [k.id, null]));
  if (!Object.keys(itens).length) return { erro: "As metas já são as padrão.", ok: "" };
  return gravar(itens, u.nome || u.login, false, "Metas de volta ao padrão.");
}

export async function salvarJornada(horas: number): Promise<Resposta> {
  const u = await autorizar("metas", true);
  if (!u) return NEGADO;
  if (!numeroValido(horas, 80) || horas < 1) return { erro: "A jornada deve ficar entre 1 e 80 horas por semana.", ok: "" };
  return gravar({ _parametros: { horas_semana: horas } }, u.nome || u.login, true, "Jornada salva.");
}

/** {centro: HH/semana | null} — null volta a usar a média apontada. */
export async function salvarCapacidades(mudancas: Record<string, number | null>): Promise<Resposta> {
  const u = await autorizar("metas", true);
  if (!u) return NEGADO;
  const itens: Record<string, Record<string, unknown> | null> = {};
  for (const [ctr, v] of Object.entries(mudancas ?? {})) {
    if (!ctr || ctr.length > 60) return { erro: "Centro de trabalho inválido.", ok: "" };
    if (v !== null && !numeroValido(v, 1e6)) return { erro: `Capacidade inválida em ${ctr}.`, ok: "" };
    itens[`capacidade:${ctr}`] = v === null ? null : { hh: v };
  }
  if (!Object.keys(itens).length) return { erro: "Nada mudou.", ok: "" };
  return gravar(itens, u.nome || u.login, false, `${Object.keys(itens).length} capacidade(s) salva(s).`);
}

export async function salvarTipos(mudancas: Record<string, { descricao: string; classe: string }>): Promise<Resposta> {
  const u = await autorizar("metas", true);
  if (!u) return NEGADO;
  const itens: Record<string, Record<string, unknown>> = {};
  for (const [cod, v] of Object.entries(mudancas ?? {})) {
    if (!/^[\w.\-]{1,20}$/.test(cod)) return { erro: `Código de tipo inválido: ${cod}.`, ok: "" };
    const descricao = String(v?.descricao ?? "").trim().slice(0, 120), classe = String(v?.classe ?? "");
    if (classe && !ind.CLASSES_TIPO.includes(classe)) return { erro: `Classe inválida em ${cod}.`, ok: "" };
    itens[`tipo:${cod}`] = { descricao, classe };
  }
  if (!Object.keys(itens).length) return { erro: "Nada mudou.", ok: "" };
  return gravar(itens, u.nome || u.login, true, `${Object.keys(itens).length} tipo(s) de ordem salvo(s).`);
}
