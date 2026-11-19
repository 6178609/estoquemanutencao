"use server";

import { randomBytes } from "node:crypto";

import { revalidatePath } from "next/cache";

import { podeEditar } from "@/lib/auth/acesso";
import { autorizar } from "@/lib/auth/sessao";
import { equipeDaGestaoHh, lerAgendaCrua, ordemDaIw38 } from "@/lib/agendaHh/dados";
import * as R from "@/lib/agendaHh/regras";
import { type Alteracao, gravarCadastroLote, lerCadastro } from "@/lib/dados/cadastros";

/**
 * Gravações do Controle de HH (agenda_hh.json): só quem vê a aba com perfil de edição, fora da demonstração. Tudo é
 * conferido de novo aqui (as mesmas regras do formulário, em lib/agendaHh/regras.ts).
 */
export type Resposta = { ok: true; msg: string; avisos?: string[] } | { ok: false; erro: string; erros?: R.Erros; avisos?: string[] };

const novoId = () => randomBytes(9).toString("hex");
const agora = () => new Date().toISOString();
const SEM_PERMISSAO: Resposta = { ok: false, erro: "Sem permissão para alterar o Controle de HH." };

async function quem(): Promise<string | null> {
  const u = await autorizar("agenda_hh", true);
  return u && podeEditar(u) && !u.demo ? u.nome || u.login : null;
}

async function gravar(itens: Record<string, Record<string, unknown> | null | Alteracao>, usuario: string, msg: string,
  avisos?: string[]): Promise<Resposta> {
  try {
    await gravarCadastroLote(R.ARQ, itens, usuario);
  } catch (e) {
    return { ok: false, erro: (e as Error).message };
  }
  revalidatePath("/agenda_hh");
  return { ok: true, msg, avisos };
}

const idOk = (id: unknown): id is string => typeof id === "string" && R.ID_VALIDO.test(id);

// ----------------------------------------------------------------------------
// Técnicos
// ----------------------------------------------------------------------------
export async function salvarTecnico(entrada: R.EntradaTecnico, id?: string): Promise<Resposta> {
  const usuario = await quem();
  if (!usuario) return SEM_PERMISSAO;
  const v = R.validarTecnico(entrada ?? {});
  if (!v.ok) return { ok: false, erro: "Confira os campos destacados.", erros: v.erros };
  if (id !== undefined && !idOk(id)) return { ok: false, erro: "Técnico inválido." };
  const chave = `${R.PREFIXO_TECNICO}${id ?? novoId()}`;
  return gravar({ [chave]: (atual) => {
    if (id && !atual) throw new Error("O técnico não existe mais; atualize a página.");
    return R.itemTecnico(v.valor);
  } }, usuario, id ? "Cadastro atualizado com sucesso." : "Técnico cadastrado com sucesso.");
}

export async function excluirTecnico(id: string): Promise<Resposta> {
  const usuario = await quem();
  if (!usuario) return SEM_PERMISSAO;
  if (!idOk(id)) return { ok: false, erro: "Técnico inválido." };
  // as programações dele ficam (guardam o nome e o NP)
  return gravar({ [`${R.PREFIXO_TECNICO}${id}`]: null }, usuario, "Cadastro excluído.");
}

/** Traz da equipe da Gestão de HH quem ainda não está cadastrado aqui (pelo NP). */
export async function trazerDaEquipe(): Promise<Resposta> {
  const usuario = await quem();
  if (!usuario) return SEM_PERMISSAO;
  try {
    const [equipe, { tecnicos }] = await Promise.all([equipeDaGestaoHh(), lerAgendaCrua()]);
    const novos = R.tecnicosDaEquipe(equipe, tecnicos);
    if (!novos.length) return { ok: false, erro: equipe.length ? "Toda a equipe da Gestão de HH já está cadastrada aqui." : "A Gestão de HH ainda não tem equipe." };
    const itens: Record<string, Alteracao> = {};
    for (const t of novos) itens[`${R.PREFIXO_TECNICO}${novoId()}`] = () => R.itemTecnico(t);
    return gravar(itens, usuario, `${novos.length} técnico(s) trazido(s) da Gestão de HH. Confira turno e jornada de cada um.`);
  } catch (e) {
    return { ok: false, erro: (e as Error).message };
  }
}

// ----------------------------------------------------------------------------
// Programação
// ----------------------------------------------------------------------------
/** Campos da ordem da IW38 (equipamento, descrição, tipo e área) para preencher o formulário. */
export async function buscarOrdem(numero: string): Promise<{ ok: true; campos: ReturnType<typeof R.camposDaOrdem> } | { ok: false; erro: string }> {
  if (!(await autorizar("agenda_hh"))) return { ok: false, erro: "Sem acesso." };
  if (typeof numero !== "string" || !R.chaveOrdem(numero) || numero.length > 30) return { ok: false, erro: "Número de ordem inválido." };
  try {
    const o = await ordemDaIw38(numero);
    return o ? { ok: true, campos: R.camposDaOrdem(o) } : { ok: false, erro: "Ordem não encontrada na IW38 carregada." };
  } catch {
    return { ok: false, erro: "Não consegui ler a IW38 agora." };
  }
}

export async function salvarProgramacao(entrada: R.EntradaProgramacao, id?: string): Promise<Resposta> {
  const usuario = await quem();
  if (!usuario) return SEM_PERMISSAO;
  if (id !== undefined && !idOk(id)) return { ok: false, erro: "Programação inválida." };
  const { tecnicos, programacoes } = await lerAgendaCrua();
  const existente = id ? programacoes.find((p) => p.id === id) : undefined;
  if (id && !existente) return { ok: false, erro: "A programação não existe mais; atualize a página." };
  const v = R.validarProgramacao(entrada ?? {}, tecnicos, { semTurnoPermitido: !!existente && !existente.turno });
  if (!v.ok) return { ok: false, erro: "Confira os campos destacados.", erros: v.erros };
  const chave = `${R.PREFIXO_PROGRAMACAO}${id ?? novoId()}`;
  return gravar({ [chave]: (atual) => {
    const antes = atual ? R.programacaoDe(id!, atual) : null;
    if (id && !antes) throw new Error("A programação não existe mais; atualize a página.");
    const historico = antes ? R.comReprogramacao(antes, v.valor.data, agora(), usuario) : [];
    return R.itemProgramacao({ ...v.valor, criadoEm: antes?.criadoEm || agora(), historico });
  } }, usuario, id ? "Programação atualizada." : "Programação cadastrada.");
}

const listaIds = (ids: unknown): string[] | null =>
  Array.isArray(ids) && ids.length > 0 && ids.length <= 5000 && ids.every(idOk) ? [...new Set(ids as string[])] : null;

export async function excluirProgramacoes(ids: string[]): Promise<Resposta> {
  const usuario = await quem();
  if (!usuario) return SEM_PERMISSAO;
  const lista = listaIds(ids);
  if (!lista) return { ok: false, erro: "Nada selecionado." };
  return gravar(Object.fromEntries(lista.map((id) => [`${R.PREFIXO_PROGRAMACAO}${id}`, null])), usuario,
    `${lista.length} ${lista.length === 1 ? "programação excluída" : "programações excluídas"}.`);
}

export async function mudarStatus(ids: string[], status: R.Status): Promise<Resposta> {
  const usuario = await quem();
  if (!usuario) return SEM_PERMISSAO;
  const lista = listaIds(ids);
  if (!lista) return { ok: false, erro: "Nada selecionado." };
  if (!R.STATUS.includes(status)) return { ok: false, erro: "Status inválido." };
  const itens: Record<string, Alteracao> = {};
  for (const id of lista) itens[`${R.PREFIXO_PROGRAMACAO}${id}`] = (atual) => (atual ? { ...atual, status } : undefined);
  return gravar(itens, usuario, `${lista.length} programação(ões) agora “${R.ROTULO_STATUS[status]}”.`);
}

/** Linhas da planilha (cabeçalho do modelo) → programações, com as mesmas conferências do app original. */
export async function importarPlanilha(objetos: Record<string, unknown>[]): Promise<Resposta> {
  const usuario = await quem();
  if (!usuario) return SEM_PERMISSAO;
  if (!Array.isArray(objetos)) return { ok: false, erro: "Planilha inválida." };
  const { tecnicos } = await lerAgendaCrua();
  const { itens, erros } = R.prepararImportacao(objetos, tecnicos);
  if (erros.length) return { ok: false, erro: "Corrija a planilha antes de importar.", avisos: erros };
  const gravar_: Record<string, Alteracao> = {};
  const em = agora();
  for (const { linha, entrada } of itens) {
    const v = R.validarProgramacao(entrada, tecnicos);
    if (!v.ok) return { ok: false, erro: `Linha ${linha}: ${Object.values(v.erros).join(" ")}` };
    gravar_[`${R.PREFIXO_PROGRAMACAO}${novoId()}`] = () => R.itemProgramacao({ ...v.valor, criadoEm: em, historico: [] });
  }
  return gravar(gravar_, usuario, `${itens.length} programação(ões) importada(s) com sucesso.`);
}

// ----------------------------------------------------------------------------
// Backup (formato do app original)
// ----------------------------------------------------------------------------
/**
 * Restaura um lote já preparado no navegador (R.prepararRestauracao). O primeiro lote (`substituir`) apaga o que existe:
 * os dados atuais são substituídos, como no app original. Tudo é validado de novo aqui.
 */
export async function restaurarBackup(lote: { tecnicos: R.Tecnico[]; programacoes: R.Programacao[] }, substituir: boolean): Promise<Resposta> {
  const usuario = await quem();
  if (!usuario) return SEM_PERMISSAO;
  const tecs = Array.isArray(lote?.tecnicos) ? lote.tecnicos : [], progs = Array.isArray(lote?.programacoes) ? lote.programacoes : [];
  if (tecs.length > 2000 || progs.length > 20000) return { ok: false, erro: "Lote grande demais." };
  const atuais = substituir ? [] : (await lerAgendaCrua()).tecnicos;
  const itens: Record<string, Record<string, unknown> | null> = {};
  if (substituir) for (const k of Object.keys(await lerCadastro(R.ARQ, { fresco: true }))) itens[k] = null;
  const validos: R.Tecnico[] = [];
  for (const t of tecs) {
    const v = R.validarTecnico(t ?? {}, { legado: true });
    if (!idOk(t?.id) || !v.ok) return { ok: false, erro: `Técnico inválido no backup: ${String(t?.nome ?? "?").slice(0, 80)}.` };
    validos.push({ id: t.id, ...v.valor });
    itens[`${R.PREFIXO_TECNICO}${t.id}`] = R.itemTecnico(v.valor);
  }
  const todos = [...atuais, ...validos];
  for (const p of progs) {
    const v = R.validarProgramacao(p ?? {}, todos, { semTurnoPermitido: true });
    if (!idOk(p?.id) || !v.ok) return { ok: false, erro: `Programação inválida no backup: ordem ${String(p?.ordem ?? "?").slice(0, 30)}.` };
    itens[`${R.PREFIXO_PROGRAMACAO}${p.id}`] = R.itemProgramacao({ ...v.valor, criadoEm: typeof p.criadoEm === "string" ? p.criadoEm.slice(0, 40) : "",
      historico: R.historicoDe(p.historico) });
  }
  return gravar(itens, usuario, `${validos.length} técnico(s) e ${progs.length} programação(ões) restaurados.`);
}
