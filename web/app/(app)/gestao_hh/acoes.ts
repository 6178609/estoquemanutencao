"use server";

import { revalidatePath } from "next/cache";

import { autorizar } from "@/lib/auth/sessao";
import { gravarCadastroLote, lerCadastro } from "@/lib/dados/cadastros";
import { equipe as lerEquipe, equipeDaPlanilha } from "@/lib/wcm/dados";
import { deIsoDia } from "@/lib/wcm/filtros";
import * as hh from "@/lib/wcm/hh";
import * as ind from "@/lib/wcm/indicadores";

/**
 * Gravações do Gerenciador de HH — o mesmo cadastro (hh_disponibilidade.json).
 * Só editor/administrador; mesclar=true (só os campos informados mudam).
 */
export type Resposta = { ok: true; msg: string } | { ok: false; erro: string };

const MATRICULA = /^[\w.\-]{1,30}$/;

async function quem() {
  const u = await autorizar("gestao_hh", true);
  return u ? u.nome || u.login : null;
}

/** Férias e treinamentos também são lançados pela aba Treinamentos e férias: quem só edita essa aba mexe só
 * nesses dois tipos (afastamento, licença… continuam na Gestão de HH). */
const TIPOS_TREINAMENTOS_FERIAS = new Set(["Férias", "Treinamento"]);
async function quemAusencias(): Promise<{ usuario: string; podeTipo: (tipo: string) => boolean } | null> {
  const g = await autorizar("gestao_hh", true);
  if (g) return { usuario: g.nome || g.login, podeTipo: () => true };
  const t = await autorizar("treinamentos_ferias", true);
  return t ? { usuario: t.nome || t.login, podeTipo: (tipo) => TIPOS_TREINAMENTOS_FERIAS.has(tipo) } : null;
}

type Alteracao = (atual: Record<string, unknown> | undefined) => Record<string, unknown> | null | undefined;
async function gravar(itens: Record<string, Record<string, unknown> | null | Alteracao>, usuario: string, msg: string): Promise<Resposta> {
  try {
    await gravarCadastroLote(hh.ARQ, itens, usuario, true);
  } catch (e) {
    return { ok: false, erro: (e as Error).message };
  }
  revalidatePath("/gestao_hh");
  revalidatePath("/treinamentos_ferias");
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
export interface DadosTreinamento { titulo?: string; horas?: string | number | null; entidade?: string; validade?: string }

export async function adicionarAusencia(np: string, tipo: string, de: string, ate: string, obs: string,
  treino?: DadosTreinamento): Promise<Resposta> {
  const quemAus = await quemAusencias();
  if (!quemAus) return { ok: false, erro: "Sem permissão para alterar a disponibilidade." };
  if (!quemAus.podeTipo(tipo)) return { ok: false, erro: "Por esta aba só se lançam férias e treinamentos." };
  const usuario = quemAus.usuario;
  const d0 = deIsoDia(String(de)), d1 = deIsoDia(String(ate || de));
  if (typeof np !== "string" || !MATRICULA.test(np)) return { ok: false, erro: "Escolha a pessoa." };
  if (!hh.TIPOS_AUSENCIA.includes(tipo)) return { ok: false, erro: "Tipo de ausência inválido." };
  if (d0 == null || d1 == null) return { ok: false, erro: "Escolha as datas." };
  const [ini, fim] = d1 < d0 ? [d1, d0] : [d0, d1];
  if (fim - ini > 730) return { ok: false, erro: "Ausência de mais de 2 anos: confira as datas." };
  const eq = await lerEquipe();
  const p = eq.find((x) => x.np === np);
  if (!p) return { ok: false, erro: "Pessoa fora da equipe da Gestão de HH." };
  const ex = treino ?? {};
  const horas = ex.horas == null || String(ex.horas).trim() === "" ? null : Number(String(ex.horas).replace(",", "."));
  // 0 = EAD/fora do horário; abaixo de 0,1 h arredondaria para 0 sem a pessoa querer
  if (horas != null && (!Number.isFinite(horas) || horas < 0 || (horas > 0 && horas < 0.1) || horas > 2000))
    return { ok: false, erro: "Carga horária inválida (0 para EAD ou fora do horário; senão a partir de 0,1 h)." };
  const validade = ex.validade ? deIsoDia(String(ex.validade)) : null;
  if (ex.validade && validade == null) return { ok: false, erro: "Data de validade inválida." };
  if (tipo === "Treinamento" && !String(ex.titulo ?? "").trim()) return { ok: false, erro: "Informe o nome do treinamento." };
  const extra = { titulo: String(ex.titulo ?? "").slice(0, 120), horas, entidade: String(ex.entidade ?? "").slice(0, 120), validade };
  // a lista é relida na hora da gravação (outra pessoa pode ter cadastrado ao mesmo tempo)
  return gravar({ [np]: (atual) => {
    const lista = ((atual as hh.ItemHh | undefined)?.ausencias ?? []) as hh.AusenciaGravada[];
    return { ...(atual ?? {}), ausencias: [...lista, hh.novaAusencia(np, tipo, ini, fim, String(obs ?? "").slice(0, 300), lista.length, extra)] };
  } }, usuario, `${tipo === "Treinamento" && extra.titulo ? extra.titulo : tipo} de ${p.nome || np} adicionado(a).`);
}

/** Remove ausências pelo id (por matrícula). */
export async function removerAusencias(sel: { np: string; id: string }[]): Promise<Resposta> {
  const quemAus = await quemAusencias();
  if (!quemAus) return { ok: false, erro: "Sem permissão para alterar a disponibilidade." };
  if (!Array.isArray(sel) || !sel.length || sel.length > 2000) return { ok: false, erro: "Nada selecionado." };
  const porNp = new Map<string, Set<string>>();
  for (const s of sel) {
    if (!s || typeof s.np !== "string" || !MATRICULA.test(s.np) || typeof s.id !== "string") return { ok: false, erro: "Seleção inválida." };
    (porNp.get(s.np) ?? porNp.set(s.np, new Set()).get(s.np)!).add(s.id);
  }
  // feito sobre a lista relida na hora de gravar; quem só edita Treinamentos e férias não remove outros tipos
  const itens: Record<string, Alteracao> = {};
  for (const [np, ids] of porNp) {
    itens[np] = (atual) => {
      const lista = ((atual as hh.ItemHh | undefined)?.ausencias ?? []) as hh.AusenciaGravada[];
      if (lista.some((x) => ids.has(x.id ?? "") && !quemAus.podeTipo(x.tipo ?? "")))
        throw new Error("Por esta aba só se removem férias e treinamentos.");
      const resto = lista.filter((x) => !ids.has(x.id ?? ""));
      return { ...(atual ?? {}), ausencias: resto.length ? resto : null };
    };
  }
  return gravar(itens, quemAus.usuario, `${sel.length} ausência(s) removida(s).`);
}

// ----------------------------------------------------------------------------
// Pessoas: cadastro manual da equipe (no lugar da planilha de Gestão de HH)
// ----------------------------------------------------------------------------
/** Matrícula como a IW47 traz: só números, sem zeros à esquerda. */
const limparMatricula = (np: string) => String(np ?? "").replace(/[\s.\-]/g, "").replace(/^0+(?=\d)/, "");

/**
 * Passa as pessoas da última planilha para o cadastro (idempotente): quem já tem nome no cadastro fica como está;
 * jornada, % e ausências de cada pessoa são mantidas (a alteração é feita sobre o item relido na hora).
 */
async function migrar(usuario: string): Promise<number> {
  const plan = (await equipeDaPlanilha()).dados ?? [];
  const pacote = hh.itensDaEquipe(plan);
  const itens: Record<string, Alteracao> = {};
  // quem entrou de fato nesta gravação (a alteração roda de novo a cada nova tentativa: vale a última)
  const migrados = new Set<string>();
  for (const [np, p] of Object.entries(pacote))
    itens[np] = (atual) => {
      if (atual && String(atual.nome ?? "").trim()) { migrados.delete(np); return undefined; }
      migrados.add(np);
      return { ...(atual ?? {}), ...p, origem: "planilha" };
    };
  if (Object.keys(itens).length) await gravarCadastroLote(hh.ARQ, itens, usuario, true);
  return migrados.size;
}

export async function passarEquipeParaCadastro(): Promise<Resposta> {
  const usuario = await quem();
  if (!usuario) return { ok: false, erro: "Sem permissão para alterar a equipe." };
  try {
    const n = await migrar(usuario);
    if (!n) return { ok: false, erro: "Nada para passar: a equipe já está no cadastro ou não há planilha de Gestão de HH com pessoas." };
    revalidatePath("/", "layout");
    return { ok: true, msg: `${n} pessoa(s) passadas para o cadastro. A planilha não precisa mais ser enviada.` };
  } catch (e) {
    return { ok: false, erro: (e as Error).message };
  }
}

export interface PessoaForm { np: string; nome: string; cargo: string; centro: string; area: string; turma: string; supervisor: string }

/** Cadastra (nova = true) ou edita uma pessoa da equipe. Na primeira gravação, a equipe da planilha vem junto. */
export async function salvarPessoa(p: PessoaForm, nova: boolean): Promise<Resposta> {
  const usuario = await quem();
  if (!usuario) return { ok: false, erro: "Sem permissão para alterar a equipe." };
  const np = limparMatricula(p?.np);
  if (!/^\d{3,10}$/.test(np)) return { ok: false, erro: "Matrícula (Nº pessoal) deve ter de 3 a 10 números." };
  const campo = (v: unknown, n = 80) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, n);
  const dados = { nome: campo(p.nome, 120), cargo: campo(p.cargo), centro: campo(p.centro, 20).toUpperCase(), area: campo(p.area, 40),
    turma: campo(p.turma, 20), supervisor: campo(p.supervisor, 120) };
  if (!dados.nome) return { ok: false, erro: "Informe o nome." };
  if (!dados.centro) return { ok: false, erro: "Informe o centro de trabalho." };
  try {
    const cad = await lerCadastro(hh.ARQ);
    if (!hh.temEquipeCadastrada(cad)) await migrar(usuario); // a primeira gravação traz a equipe atual junto
    const depois = await lerCadastro(hh.ARQ);
    const existente = Object.keys(depois).find((k) => k.replace(/^0+(?=\d)/, "") === np && String((depois[k] as hh.ItemHh)?.nome ?? "").trim());
    if (nova && existente) return { ok: false, erro: `A matrícula ${np} já está cadastrada (${(depois[existente] as hh.ItemHh).nome}).` };
    const chave = existente ?? np;
    // conferido de novo na hora de gravar (alguém pode ter cadastrado a mesma matrícula ao mesmo tempo); a edição
    // mantém a situação (editar uma pessoa desligada não a reativa)
    return gravar({ [chave]: (atual) => {
      if (nova && String(atual?.nome ?? "").trim()) throw new Error(`A matrícula ${np} acabou de ser cadastrada (${atual!.nome}).`);
      return { ...(atual ?? {}), ...dados, ...(nova ? { ativo: true } : {}) };
    } }, usuario,
      nova ? `${dados.nome} cadastrado(a) na equipe.` : `Dados de ${dados.nome} salvos.`);
  } catch (e) {
    return { ok: false, erro: (e as Error).message };
  }
}

/** Desliga (sai da equipe; o histórico fica) ou reativa uma pessoa. */
export async function mudarAtivo(npBruto: string, ativo: boolean): Promise<Resposta> {
  const usuario = await quem();
  if (!usuario) return { ok: false, erro: "Sem permissão para alterar a equipe." };
  const np = String(npBruto ?? "");
  if (!MATRICULA.test(np)) return { ok: false, erro: "Pessoa inválida." };
  try {
    const cad = await lerCadastro(hh.ARQ);
    if (!hh.temEquipeCadastrada(cad)) await migrar(usuario);
    const atual = (await lerCadastro(hh.ARQ))[np] as hh.ItemHh | undefined;
    if (!atual?.nome) return { ok: false, erro: "Pessoa fora do cadastro da equipe." };
    return gravar({ [np]: (a) => ({ ...(a ?? {}), ativo }) }, usuario,
      ativo ? `${atual.nome} voltou para a equipe.` : `${atual.nome} desligado(a) da equipe (o histórico fica).`);
  } catch (e) {
    return { ok: false, erro: (e as Error).message };
  }
}
