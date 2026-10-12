"use server";

import { revalidatePath } from "next/cache";

import { autorizar } from "@/lib/auth/sessao";
import { gravarCadastroLote, lerCadastro } from "@/lib/dados/cadastros";
import { equipe as lerEquipe } from "@/lib/wcm/dados";
import { deIsoDia } from "@/lib/wcm/filtros";
import * as hh from "@/lib/wcm/hh";
import * as ind from "@/lib/wcm/indicadores";

/**
 * Gravações do Gerenciador de HH — o mesmo cadastro (hh_disponibilidade.json) e as mesmas regras de
 * paginas/gestao_hh.py: só editor/administrador; mesclar=true (só os campos informados mudam).
 */
export type Resposta = { ok: true; msg: string } | { ok: false; erro: string };

const MATRICULA = /^[\w.\-]{1,30}$/;

async function quem() {
  const u = await autorizar("gestao_hh", true);
  return u ? u.nome || u.login : null;
}

async function gravar(itens: Record<string, Record<string, unknown> | null>, usuario: string, msg: string): Promise<Resposta> {
  try {
    await gravarCadastroLote(hh.ARQ, itens, usuario, true);
  } catch (e) {
    return { ok: false, erro: (e as Error).message };
  }
  revalidatePath("/gestao_hh");
  return { ok: true, msg };
}

export interface EdicaoPessoa { np: string; jornada: number | null; disponivel: number | null; conta: boolean; obs: string }

/** Jornada, % disponível, se conta na capacidade e observação (o que ficar igual ao padrão é apagado). */
export async function salvarDisponibilidade(edicoes: EdicaoPessoa[]): Promise<Resposta> {
  const usuario = await quem();
  if (!usuario) return { ok: false, erro: "Sem permissão para alterar a disponibilidade." };
  if (!Array.isArray(edicoes) || !edicoes.length || edicoes.length > 2000) return { ok: false, erro: "Nada para salvar." };
  const [metas, eq] = await Promise.all([lerCadastro(ind.ARQ_METAS), lerEquipe()]);
  const horasSemana = ind.horasSemanaDe(metas as Record<string, Record<string, unknown>>);
  const esp = new Map(eq.map((p) => [p.np, p.especialidade]));
  const itens: Record<string, Record<string, unknown>> = {};
  for (const e of edicoes) {
    if (!e || typeof e.np !== "string" || !MATRICULA.test(e.np) || !esp.has(e.np)) return { ok: false, erro: "Pessoa inválida." };
    const j = e.jornada == null ? null : Number(e.jornada), d = e.disponivel == null ? null : Number(e.disponivel);
    if ((j != null && (!Number.isFinite(j) || j < 0 || j > 80)) || (d != null && (!Number.isFinite(d) || d < 0 || d > 100)))
      return { ok: false, erro: "Jornada deve ficar entre 0 e 80 h e o disponível entre 0 e 100%." };
    itens[e.np] = { ...hh.itemDisponibilidade({ jornada: j, disponivel: d, contaNaCapacidade: !!e.conta,
      observacao: String(e.obs ?? "").slice(0, 500) }, horasSemana, esp.get(e.np) ?? "") };
  }
  return gravar(itens, usuario, `Disponibilidade de ${Object.keys(itens).length} pessoa(s) salva.`);
}

/** Nova ausência (férias, afastamento…) — datas ISO aaaa-mm-dd, inclusivas. */
export async function adicionarAusencia(np: string, tipo: string, de: string, ate: string, obs: string): Promise<Resposta> {
  const usuario = await quem();
  if (!usuario) return { ok: false, erro: "Sem permissão para alterar a disponibilidade." };
  const d0 = deIsoDia(String(de)), d1 = deIsoDia(String(ate || de));
  if (typeof np !== "string" || !MATRICULA.test(np)) return { ok: false, erro: "Escolha a pessoa." };
  if (!hh.TIPOS_AUSENCIA.includes(tipo)) return { ok: false, erro: "Tipo de ausência inválido." };
  if (d0 == null || d1 == null) return { ok: false, erro: "Escolha as datas." };
  const [ini, fim] = d1 < d0 ? [d1, d0] : [d0, d1];
  if (fim - ini > 730) return { ok: false, erro: "Ausência de mais de 2 anos: confira as datas." };
  const eq = await lerEquipe();
  const p = eq.find((x) => x.np === np);
  if (!p) return { ok: false, erro: "Pessoa fora da planilha de Gestão de HH." };
  const cad = await lerCadastro(hh.ARQ);
  const atual = ((cad[np] as hh.ItemHh | undefined)?.ausencias ?? []) as hh.AusenciaGravada[];
  const nova = hh.novaAusencia(np, tipo, ini, fim, String(obs ?? "").slice(0, 300), atual.length);
  return gravar({ [np]: { ausencias: [...atual, nova] } }, usuario, `${tipo} de ${p.nome || np} adicionada.`);
}

/** Remove ausências pelo id (por matrícula). */
export async function removerAusencias(sel: { np: string; id: string }[]): Promise<Resposta> {
  const usuario = await quem();
  if (!usuario) return { ok: false, erro: "Sem permissão para alterar a disponibilidade." };
  if (!Array.isArray(sel) || !sel.length || sel.length > 2000) return { ok: false, erro: "Nada selecionado." };
  const cad = await lerCadastro(hh.ARQ);
  const porNp = new Map<string, Set<string>>();
  for (const s of sel) {
    if (!s || typeof s.np !== "string" || !MATRICULA.test(s.np) || typeof s.id !== "string") return { ok: false, erro: "Seleção inválida." };
    (porNp.get(s.np) ?? porNp.set(s.np, new Set()).get(s.np)!).add(s.id);
  }
  const itens: Record<string, Record<string, unknown>> = {};
  for (const [np, ids] of porNp) {
    const lista = (((cad[np] as hh.ItemHh | undefined)?.ausencias ?? []) as hh.AusenciaGravada[]).filter((x) => !ids.has(x.id ?? ""));
    itens[np] = { ausencias: lista.length ? lista : null };
  }
  return gravar(itens, usuario, `${sel.length} ausência(s) removida(s).`);
}
