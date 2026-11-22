import "server-only";

import { randomBytes } from "node:crypto";

import { registrar } from "../auditoria";
import { podeEditar, soEstoque, type Usuario } from "../auth/acesso";
import { catalogo } from "../dados/bases";
import { gravarCadastroLote, lerCadastro } from "../dados/cadastros";
import { LIMITE_DOCUMENTO, tipoDocumento } from "../dados/documentos";
import { fonte, FonteErro } from "../dados/fonte";
import { bases } from "../wcm/dados";
import { fotosUbmDemo, PASTA_FOTOS_UBM } from "./demo";
import {
  ARQ_ARMARIOS, ARQ_MOVIMENTOS, type Armario, armarioDe, armarioParaGravar, armariosDe, chaveOrdem, type EntradaArmario,
  type EntradaRetirada, type EntradaSolicitacao, type Foto, idArmarioValido, type Movimento, movimentoDe, movimentoParaGravar,
  movimentosDe, normalizarCodigo, podeMarcarLancada, normalizarIdArmario, type OrdemIw38, validarArmario, validarLancamento, validarRetirada,
  validarSolicitacao,
} from "./regras";

/**
 * Gravação da UBM (regras em ./regras.ts): armários em ubm_armarios.json, movimentos em ubm_movimentos.json, sempre por
 * gravarCadastroLote (relê e reaplica se outra pessoa gravou no meio). Fotos em app/documentos/ubm/<movimento>/<arquivo>,
 * um arquivo novo a cada envio (na demonstração, na memória). Testado em testes/ubm.test.ts.
 *
 * Quem grava: retirada e solicitação, quem vê a aba (a rota confere); armários, reposição, contagem e fechar solicitação,
 * só quem `gere` (perfil de edição e fora de Terceiro/Manutentor).
 */
const TIPOS_FOTO = ["image/jpeg", "image/png", "image/webp"];
const SO_GESTAO = "Só editores do PCM (fora de Terceiro e Manutentor) cadastram armários e registram reposição e contagem.";
const globalDemo = globalThis as unknown as { __cmFotosUbmDemo?: Map<string, Uint8Array> };
const demo = (globalDemo.__cmFotosUbmDemo ??= new Map(fotosUbmDemo()));
const novoId = () => randomBytes(9).toString("hex");
const agora = () => new Date().toISOString();
const idOk = (s: unknown): s is string => typeof s === "string" && /^[a-z0-9]{6,32}$/.test(s);
const caminho = (mov: string, arquivo: string) => `${PASTA_FOTOS_UBM}/${mov}/${arquivo}`;
type Anexo = { nome: string; bytes: Uint8Array };

/** Quem está gravando: login, nome para mostrar e se pode gerir (armários, reposição, contagem). */
export interface Quem { login: string; nome: string; gerir: boolean }

/** Gere a UBM: perfil de edição e fora das funções operacionais (Terceiro e Manutentor). */
export const podeGerir = (u: Usuario | null) => !!u && podeEditar(u) && !soEstoque(u);
export const quemDe = (u: Usuario & { nome?: string }): Quem => ({ login: u.login, nome: u.nome || u.login, gerir: podeGerir(u) });

/** Só para os testes: os caminhos das fotos guardadas na demonstração. */
export const _fotosGuardadas = () => [...demo.keys()];

export async function lerArmarios(fresco = false): Promise<Armario[]> {
  return armariosDe(await lerCadastro(ARQ_ARMARIOS, { fresco }));
}
export async function lerMovimentos(fresco = false): Promise<Movimento[]> {
  return movimentosDe(await lerCadastro(ARQ_MOVIMENTOS, { fresco }));
}

/** O armário pelo id (null se não existe). */
export async function armario(id: string, fresco = false): Promise<Armario | null> {
  const k = normalizarIdArmario(id);
  if (!idArmarioValido(k)) return null;
  return armarioDe(k, (await lerCadastro(ARQ_ARMARIOS, { fresco }))[k]);
}

async function armarioAtivo(id: string): Promise<Armario> {
  const a = await armario(id, true);
  if (!a || !a.ativo) throw new FonteErro("Armário não encontrado ou desativado: confira o QR code.");
  return a;
}

// ----------------------------------------------------------------------------
// Bases (só para mostrar e analisar; nunca travam a gravação)
// ----------------------------------------------------------------------------
/** Descrição do código no catálogo do Sysmat (null = não achou ou sem a base). */
export async function descricaoCatalogo(codigo: string): Promise<string | null> {
  const c = normalizarCodigo(codigo);
  if (!c) return null;
  const itens = (await catalogo().catch(() => null))?.dados ?? [];
  const i = itens.find((x) => normalizarCodigo(x.material) === c);
  return (i?.descricaoCurta || i?.descrCompleta || "").trim() || null;
}

/** Descrições do catálogo só dos códigos pedidos (sem a base: mapa vazio). */
export async function descricoesCatalogo(codigos: Set<string>): Promise<Map<string, string>> {
  const itens = (await catalogo().catch(() => null))?.dados ?? [];
  const m = new Map<string, string>();
  for (const i of itens) {
    const c = normalizarCodigo(i.material);
    const d = (i.descricaoCurta || i.descrCompleta || "").trim();
    if (codigos.has(c) && d && !m.has(c)) m.set(c, d);
  }
  return m;
}

/** A IW38 por chave da ordem, com o nome do equipamento do IH08 (null sem a base). */
export async function ordensIw38(): Promise<Map<string, OrdemIw38> | null> {
  const b = await bases().catch(() => null);
  const ordens = b?.ordens.dados;
  if (!ordens?.length) return null;
  const nomes = new Map((b!.equipamentos.dados ?? []).map((e) => [e.equipamento, e.denominacao]));
  const m = new Map<string, OrdemIw38>();
  for (const o of ordens) {
    const k = chaveOrdem(o.ordem);
    if (k && !m.has(k)) m.set(k, { texto: o.texto, equipamento: o.equipamento, denominacao: nomes.get(o.equipamento) || "" });
  }
  return m;
}

// ----------------------------------------------------------------------------
// Fotos
// ----------------------------------------------------------------------------
async function gravarFoto(mov: string, a: Anexo | null): Promise<Foto> {
  const bytes = a?.bytes instanceof Uint8Array ? a.bytes : new Uint8Array();
  const tipo = tipoDocumento(bytes);
  if (!tipo || !TIPOS_FOTO.includes(tipo)) throw new FonteErro("A foto tem de ser JPEG, PNG ou WebP.");
  if (bytes.length > LIMITE_DOCUMENTO) throw new FonteErro(`A foto passou de ${Math.round(LIMITE_DOCUMENTO / 1_000_000)} MB.`);
  const arquivo = novoId();
  const c = caminho(mov, arquivo);
  const f = fonte();
  if (!f) demo.set(c, bytes);
  else if (!(await f.gravarCondicional(c, bytes, null, "Foto de retirada da UBM")))
    throw new FonteErro("Não consegui gravar a foto agora; tente de novo.");
  const nome = String(a?.nome ?? "").replace(/[^\w.\- ]/g, "_").slice(0, 120) || "foto";
  return { nome, tipo, tamanho: bytes.length, arquivo };
}

async function apagarFoto(mov: string, arquivo: string | undefined) {
  if (!arquivo || !idOk(arquivo)) return;
  const c = caminho(mov, arquivo);
  const f = fonte();
  if (!f) { demo.delete(c); return; }
  const v = (await f.versoes(true).catch(() => null))?.get(c);
  const ok = v ? await f.apagar(c, v, "Remove foto da UBM").catch(() => false) : false;
  if (!ok) console.warn(`UBM: não consegui apagar a foto ${c}.`);
}

/** A foto de um movimento (quem pode ver é conferido na rota). */
export async function lerFoto(id: string): Promise<{ bytes: Uint8Array; tipo: string; nome: string; arquivo: string } | null> {
  if (!idOk(id)) return null;
  const m = movimentoDe(id, (await lerCadastro(ARQ_MOVIMENTOS))[id]);
  if (!m?.foto) return null;
  const fo = fonte();
  const c = caminho(id, m.foto.arquivo);
  const bytes = fo ? (await fo.ler(c))?.bytes : demo.get(c);
  const tipo = bytes && tipoDocumento(bytes);
  return bytes && tipo && TIPOS_FOTO.includes(tipo) ? { bytes, tipo, nome: m.foto.nome, arquivo: m.foto.arquivo } : null;
}

// ----------------------------------------------------------------------------
// Movimentos
// ----------------------------------------------------------------------------
const vazio = { ordem: "", turno: "", uso: "", observacao: "", tipoSolicitacao: "" as const, foto: null, fechadaEm: "", fechadaPor: "",
  lancadoNaOrdem: false, lancadoEm: "", lancadoPor: "" };

async function gravarNovos(movs: Movimento[], quem: Quem) {
  await gravarCadastroLote(ARQ_MOVIMENTOS, Object.fromEntries(movs.map((m) => [m.id, (atual: unknown) => {
    if (atual) throw new FonteErro("Não consegui gravar agora; tente de novo.");
    return movimentoParaGravar(m);
  }])), quem.login);
}

/** Retirada pelo QR: ordem e código livres (só o formato), foto obrigatória. Devolve o id. */
export async function registrarRetirada(quem: Quem, armarioId: string, e: EntradaRetirada, foto: Anexo | null): Promise<string> {
  if (!quem.login) throw new FonteErro("Entre no site para registrar a retirada.");
  const a = await armarioAtivo(armarioId);
  const v = validarRetirada({ ...e, temFoto: !!foto && foto.bytes.length > 0 }, a);
  if ("erro" in v) throw new FonteErro(v.erro);
  const id = novoId();
  const f = await gravarFoto(id, foto);
  const em = agora();
  const m: Movimento = { ...vazio, id, tipo: "retirada", armario: a.id, em, por: quem.login, porNome: quem.nome, ...v.campos, foto: f,
    ...(v.campos.lancadoNaOrdem ? { lancadoEm: em, lancadoPor: quem.nome } : {}) };
  try {
    await gravarNovos([m], quem);
  } catch (err) {
    await apagarFoto(id, f.arquivo); // não fica foto sem retirada
    throw err;
  }
  void registrar(quem.login, "ubm_retirada", id, { armario: a.id, codigo: m.codigo, quantidade: m.quantidade, ordem: m.ordem,
    lancado_na_ordem: m.lancadoNaOrdem });
  return id;
}

/** Solicitação pelo QR (acabou, faltando, reposição), foto opcional. */
export async function registrarSolicitacao(quem: Quem, armarioId: string, e: EntradaSolicitacao, foto: Anexo | null): Promise<string> {
  if (!quem.login) throw new FonteErro("Entre no site para registrar a solicitação.");
  const a = await armarioAtivo(armarioId);
  const v = validarSolicitacao(e, a);
  if ("erro" in v) throw new FonteErro(v.erro);
  const id = novoId();
  const f = foto && foto.bytes.length ? await gravarFoto(id, foto) : null;
  const { tipo, ...campos } = v.campos;
  const m: Movimento = { ...vazio, id, tipo: "solicitacao", tipoSolicitacao: tipo, armario: a.id, em: agora(), por: quem.login,
    porNome: quem.nome, ...campos, foto: f };
  try {
    await gravarNovos([m], quem);
  } catch (err) {
    if (f) await apagarFoto(id, f.arquivo);
    throw err;
  }
  void registrar(quem.login, "ubm_solicitacao", id, { armario: a.id, tipo, codigo: m.codigo });
  return id;
}

/** Reposição (soma ao saldo) ou contagem (fixa o saldo) de vários itens do armário. Devolve quantos itens. */
export async function lancar(quem: Quem, armarioId: string, tipo: "reposicao" | "contagem", linhas: { codigo: string; quantidade: string }[],
  observacao = ""): Promise<number> {
  if (!quem.gerir) throw new FonteErro(SO_GESTAO);
  const a = await armario(armarioId, true);
  if (!a) throw new FonteErro("Armário não encontrado.");
  const v = validarLancamento(linhas, a, tipo === "contagem");
  if ("erro" in v) throw new FonteErro(v.erro);
  const em = agora();
  const obs = String(observacao ?? "").trim().slice(0, 300);
  const movs = v.itens.map((i): Movimento => ({ ...vazio, id: novoId(), tipo, armario: a.id, em, por: quem.login, porNome: quem.nome,
    codigo: i.codigo, quantidade: i.quantidade, observacao: obs }));
  await gravarNovos(movs, quem);
  void registrar(quem.login, "ubm_reposicao", a.id, { tipo, itens: movs.length, codigos: movs.map((m) => m.codigo) });
  return movs.length;
}

/** Fecha (atende) uma solicitação aberta. */
export async function fecharSolicitacao(quem: Quem, id: string): Promise<void> {
  if (!quem.gerir) throw new FonteErro("Só editores do PCM (fora de Terceiro e Manutentor) fecham solicitações.");
  if (!idOk(id)) throw new FonteErro("Solicitação inválida.");
  await gravarCadastroLote(ARQ_MOVIMENTOS, { [id]: (atual) => {
    const m = movimentoDe(id, atual);
    if (!m || m.tipo !== "solicitacao") throw new FonteErro("Solicitação não encontrada.");
    if (m.fechadaEm) throw new FonteErro("A solicitação já foi fechada; atualize a página.");
    return movimentoParaGravar({ ...m, fechadaEm: agora(), fechadaPor: quem.nome });
  } }, quem.login);
  void registrar(quem.login, "ubm_solicitacao", id, { acao: "fechar" });
}

/** Marca a retirada como já adicionada à ordem pelo SAP Mobile (quem retirou ou quem gere a UBM). */
export async function marcarLancada(quem: Quem, id: string): Promise<void> {
  if (!idOk(id)) throw new FonteErro("Retirada inválida.");
  await gravarCadastroLote(ARQ_MOVIMENTOS, { [id]: (atual) => {
    const m = movimentoDe(id, atual);
    if (!m || m.tipo !== "retirada") throw new FonteErro("Retirada não encontrada.");
    if (m.lancadoNaOrdem) throw new FonteErro("A retirada já está marcada como lançada; atualize a página.");
    if (!podeMarcarLancada(quem, m)) throw new FonteErro("Só quem retirou ou um editor do PCM marca a retirada como lançada.");
    return movimentoParaGravar({ ...m, lancadoNaOrdem: true, lancadoEm: agora(), lancadoPor: quem.nome });
  } }, quem.login);
  void registrar(quem.login, "ubm_lancada", id);
}

/** Cadastra (novo = true: o id não pode existir) ou altera um armário e o kit. */
export async function salvarArmario(quem: Quem, e: EntradaArmario, novo: boolean): Promise<string> {
  if (!quem.gerir) throw new FonteErro(SO_GESTAO);
  const v = validarArmario(e);
  if ("erro" in v) throw new FonteErro(v.erro);
  const c = v.campos;
  await gravarCadastroLote(ARQ_ARMARIOS, { [c.id]: (atual) => {
    if (novo && atual) throw new FonteErro(`Já existe o armário ${c.id}.`);
    if (!novo && !atual) throw new FonteErro("Armário não encontrado.");
    const criadoEm = (atual && typeof atual.criadoEm === "string" && atual.criadoEm) || agora();
    return armarioParaGravar({ ...c, criadoEm });
  } }, quem.login);
  void registrar(quem.login, "ubm_armario", c.id, { acao: novo ? "criar" : "editar", itens: c.itens.length, ativo: c.ativo });
  return c.id;
}
