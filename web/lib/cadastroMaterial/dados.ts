import "server-only";

import { randomBytes } from "node:crypto";

import { registrar } from "../auditoria";
import { gravarCadastroLote, lerCadastro } from "../dados/cadastros";
import { LIMITE_DOCUMENTO, tipoDocumento } from "../dados/documentos";
import { comPecasDaRegra } from "../dados/regrasVinculo";
import { fonte, FonteErro } from "../dados/fonte";
import { bases } from "../wcm/dados";
import {
  type Acao, AG_ALMOX, ARQ_PEDIDOS, bloqueioDeAcao, type EntradaPedido, type Foto, type Papel, type Pedido, pedidoDe, pedidosDe,
  paraGravar, podeEditar, proximaSituacao, validarEntrada,
} from "./regras";

/**
 * Gravação dos pedidos de cadastro de material (regras em ./regras.ts). Tudo passa por gravarCadastroLote, que relê e
 * reaplica se outra pessoa gravou no meio; as regras são conferidas de novo sobre o pedido relido. Fotos em
 * app/documentos/pedidos_material/<pedido>/<arquivo>, um arquivo novo a cada envio (na demonstração, na memória).
 * Ao validar, o SAP entra em `materiais` do equipamento em cadastro_equipamentos.json. Testado em
 * testes/cadastroMaterial.test.ts.
 */
const PASTA = "app/documentos/pedidos_material";
const ARQ_EQUIPAMENTOS = "cadastro_equipamentos.json";
const TIPOS_FOTO = ["image/jpeg", "image/png", "image/webp"];
const MUDOU = "O pedido já mudou de situação; atualize a página.";
const SO_DONO = "Só quem lançou edita ou exclui, e só enquanto aguarda o almoxarifado.";
const ACOES: readonly Acao[] = ["aprovar", "recusar", "chegou", "validar", "recusar_chegada"];
const demo = new Map<string, Uint8Array>();
const novoId = () => randomBytes(9).toString("hex");
const agora = () => new Date().toISOString();
const idOk = (s: unknown): s is string => typeof s === "string" && /^[a-z0-9]{6,32}$/.test(s);
const caminho = (pedido: string, arquivo: string) => `${PASTA}/${pedido}/${arquivo}`;
type Anexo = { nome: string; bytes: Uint8Array };

/** Só para os testes: os caminhos das fotos guardadas na demonstração. */
export const _fotosGuardadas = () => [...demo.keys()];

/** Aprova pelo Almoxarifado/PCM quem vê a aba e está marcado em Usuários (Terceiro nunca; administrador não ganha nada). */
export function papelDe(u: { login: string; aprova_almox?: unknown; aprova_pcm?: unknown; funcao?: string }, veAba: boolean): Papel {
  const pode = veAba && u.funcao !== "terceiro";
  return { login: u.login, almox: pode && u.aprova_almox === true, pcm: pode && u.aprova_pcm === true };
}

export async function lerPedidos(fresco = false): Promise<Pedido[]> {
  return pedidosDe(await lerCadastro(ARQ_PEDIDOS, { fresco }));
}

/** Equipamentos que podem receber o pedido: tag → nome (cadastro do site + IH08 em uso, como a aba Equipamentos lista). */
/** Equipamentos em uso no IH08 (sem a base ou se ela falhar: lista vazia). */
const ih08Ativos = () => bases().then((b) => (b.equipamentos.dados ?? []).filter((e) => e.equipamento && !e.inativo)).catch(() => []);

export async function tagsEquipamentos(): Promise<Map<string, string>> {
  const [cad, ih08] = await Promise.all([lerCadastro(ARQ_EQUIPAMENTOS), ih08Ativos()]);
  const m = new Map<string, string>();
  for (const [tag, v] of Object.entries(cad)) {
    if (!tag || !v || typeof v !== "object" || Array.isArray(v)) continue;
    m.set(tag, String((v as Record<string, unknown>).nome ?? "").trim());
  }
  for (const e of ih08) {
    if (!m.get(e.equipamento)) m.set(e.equipamento, e.denominacao || "");
  }
  return m;
}

/** Lê o pedido agora (sem cache); a leitura é a "situação vista", conferida de novo dentro da gravação. */
async function pedidoAgora(id: string): Promise<Pedido> {
  if (!idOk(id)) throw new FonteErro("Pedido inválido.");
  const p = pedidoDe(id, (await lerCadastro(ARQ_PEDIDOS, { fresco: true }))[id]);
  if (!p) throw new FonteErro("Pedido não encontrado.");
  return p;
}

/** Altera o pedido relido na hora da gravação; `fn` lança FonteErro para recusar. */
async function alterarPedido(lido: Pedido, por: string, fn: (p: Pedido) => Pedido | null) {
  await gravarCadastroLote(ARQ_PEDIDOS, { [lido.id]: (atual) => {
    const p = pedidoDe(lido.id, atual);
    if (!p) throw new FonteErro("Pedido não encontrado.");
    if (p.situacao !== lido.situacao) throw new FonteErro(MUDOU);
    const novo = fn(p);
    return novo ? paraGravar(novo) : null;
  } }, por);
}

/** Grava a foto num arquivo novo (nunca por cima). */
async function gravarFoto(pedido: string, a: Anexo | null): Promise<Foto> {
  const bytes = a?.bytes instanceof Uint8Array ? a.bytes : new Uint8Array();
  const tipo = tipoDocumento(bytes);
  if (!tipo || !TIPOS_FOTO.includes(tipo)) throw new FonteErro("A foto tem de ser JPEG, PNG ou WebP.");
  if (bytes.length > LIMITE_DOCUMENTO) throw new FonteErro(`A foto passou de ${Math.round(LIMITE_DOCUMENTO / 1_000_000)} MB.`);
  const arquivo = novoId();
  const c = caminho(pedido, arquivo);
  const f = fonte();
  if (!f) demo.set(c, bytes);
  else if (!(await f.gravarCondicional(c, bytes, null, "Foto de pedido de cadastro de material")))
    throw new FonteErro("Não consegui gravar a foto agora; tente de novo.");
  const nome = String(a?.nome ?? "").replace(/[^\w.\- ]/g, "_").slice(0, 120) || "foto";
  return { nome, tipo, tamanho: bytes.length, arquivo };
}

async function apagarFoto(pedido: string, arquivo: string | undefined) {
  if (!arquivo || !idOk(arquivo)) return;
  const c = caminho(pedido, arquivo);
  const f = fonte();
  if (!f) { demo.delete(c); return; }
  const v = (await f.versoes(true).catch(() => null))?.get(c);
  const ok = v ? await f.apagar(c, v, "Remove foto de pedido de cadastro de material").catch(() => false) : false;
  if (!ok) console.warn(`Cadastro de material: não consegui apagar a foto ${c}.`);
}

async function camposValidos(e: EntradaPedido) {
  const tags = await tagsEquipamentos();
  const v = validarEntrada(e, new Set(tags.keys()));
  if ("erro" in v) throw new FonteErro(v.erro);
  return { ...v.campos, nome: tags.get(v.campos.tag) ?? "" };
}

// ----------------------------------------------------------------------------
// Lançar, editar e excluir (quem lançou)
// ----------------------------------------------------------------------------
export async function lancarPedido(p: Papel, e: EntradaPedido, foto: Anexo, por: string): Promise<string> {
  if (!p.login) throw new FonteErro("Entre no site para lançar o pedido.");
  const c = await camposValidos(e);
  const id = novoId();
  const f = await gravarFoto(id, foto);
  const em = agora();
  const ped: Pedido = {
    id, descricao: c.descricao, sap: c.sap, equipamento: { tag: c.tag, nome: c.nome }, observacao: c.observacao, foto: f,
    fotoChegada: null, situacao: AG_ALMOX, criadoPor: p.login, criadoEm: em, historico: [{ em, por, acao: "lancar" }],
  };
  try {
    await gravarCadastroLote(ARQ_PEDIDOS, { [id]: (atual) => {
      if (atual) throw new FonteErro("Não consegui lançar o pedido agora; tente de novo.");
      return paraGravar(ped);
    } }, por);
  } catch (err) {
    await apagarFoto(id, f.arquivo); // não fica foto sem pedido
    throw err;
  }
  void registrar(por, "cadastro_material", id, { acao: "lancar" });
  return id;
}

export async function editarPedido(p: Papel, id: string, e: EntradaPedido, foto: Anexo | null, por: string): Promise<void> {
  const lido = await pedidoAgora(id);
  if (!podeEditar(p, lido)) throw new FonteErro(SO_DONO);
  const c = await camposValidos(e);
  const nova = foto ? await gravarFoto(id, foto) : null;
  let antiga = "";
  try {
    await alterarPedido(lido, por, (atual) => {
      if (!podeEditar(p, atual)) throw new FonteErro(SO_DONO);
      antiga = nova ? atual.foto?.arquivo ?? "" : "";
      return {
        ...atual, descricao: c.descricao, sap: c.sap, equipamento: { tag: c.tag, nome: c.nome }, observacao: c.observacao,
        foto: nova ?? atual.foto, historico: [...atual.historico, { em: agora(), por, acao: "editar" }],
      };
    });
  } catch (err) {
    if (nova) await apagarFoto(id, nova.arquivo);
    throw err;
  }
  if (antiga) await apagarFoto(id, antiga);
  void registrar(por, "cadastro_material", id, { acao: "editar" });
}

export async function excluirPedido(p: Papel, id: string, por: string): Promise<void> {
  const lido = await pedidoAgora(id);
  if (!podeEditar(p, lido)) throw new FonteErro(SO_DONO);
  let fotos: (string | undefined)[] = [];
  await alterarPedido(lido, por, (atual) => {
    if (!podeEditar(p, atual)) throw new FonteErro(SO_DONO);
    fotos = [atual.foto?.arquivo, atual.fotoChegada?.arquivo];
    return null;
  });
  for (const a of fotos) await apagarFoto(id, a);
  void registrar(por, "cadastro_material", id, { acao: "excluir" });
}

// ----------------------------------------------------------------------------
// Etapas (Almoxarifado e PCM)
// ----------------------------------------------------------------------------
/**
 * Acrescenta o SAP em `materiais` do equipamento (sem duplicar). Equipamento só no IH08 (em uso) ganha um item novo no
 * cadastro, como nas regras de vínculo (comPecasDaRegra); fora das duas fontes, aviso para vincular à mão.
 */
async function vincular(tag: string, nome: string, sap: string, por: string): Promise<string> {
  const noIh08 = (await ih08Ativos()).find((e) => e.equipamento === tag);
  let achou = false;
  try {
    await gravarCadastroLote(ARQ_EQUIPAMENTOS, { [tag]: (atual) => {
      const item = atual && typeof atual === "object" && !Array.isArray(atual) ? atual : undefined;
      if (!item && !noIh08) return undefined;
      achou = true;
      return comPecasDaRegra(item, nome || noIh08?.denominacao || "", [sap]) ?? undefined;
    } }, por);
  } catch {
    return "Não consegui vincular o material ao equipamento agora: vincule à mão.";
  }
  return achou ? "" : "Equipamento não encontrado no cadastro: vincule à mão.";
}

export async function agir(p: Papel, id: string, acao: Acao, motivo: string, fotoChegada: Anexo | null, por: string): Promise<{ aviso?: string }> {
  // lida antes de qualquer outra espera: é a situação que a pessoa viu
  const lido = await pedidoAgora(id);
  if (!ACOES.includes(acao)) throw new FonteErro("Ação inválida.");
  const mot = String(motivo ?? "").trim().slice(0, 300);
  const b = bloqueioDeAcao(p, lido, acao, mot);
  if (b) throw new FonteErro(b);
  if (acao === "chegou" && !fotoChegada) throw new FonteErro("Anexe a foto do material recebido.");
  const nova = acao === "chegou" ? await gravarFoto(id, fotoChegada) : null;
  let antiga = "";
  try {
    await alterarPedido(lido, por, (atual) => {
      const m = bloqueioDeAcao(p, atual, acao, mot);
      if (m) throw new FonteErro(m);
      antiga = nova ? atual.fotoChegada?.arquivo ?? "" : "";
      return {
        ...atual, situacao: proximaSituacao(atual.situacao, acao)!, fotoChegada: nova ?? atual.fotoChegada,
        historico: [...atual.historico, { em: agora(), por, acao, ...(["recusar", "recusar_chegada"].includes(acao) ? { motivo: mot } : {}) }],
      };
    });
  } catch (err) {
    if (nova) await apagarFoto(id, nova.arquivo);
    throw err;
  }
  if (antiga) await apagarFoto(id, antiga);
  const aviso = acao === "validar" ? await vincular(lido.equipamento.tag, lido.equipamento.nome, lido.sap, por) : "";
  void registrar(por, "cadastro_material", id, acao === "validar" ? { acao, sap: lido.sap, tag: lido.equipamento.tag } : { acao });
  return aviso ? { aviso } : {};
}

/** A foto do pedido ou da chegada (quem pode ver é conferido na rota). */
export async function lerFoto(id: string, qual: "pedido" | "chegada"): Promise<{ bytes: Uint8Array; tipo: string; nome: string } | null> {
  if (!idOk(id)) return null;
  const p = pedidoDe(id, (await lerCadastro(ARQ_PEDIDOS, { fresco: true }))[id]);
  const f = qual === "pedido" ? p?.foto : qual === "chegada" ? p?.fotoChegada : null;
  if (!f) return null;
  const fo = fonte();
  const c = caminho(id, f.arquivo);
  const bytes = fo ? (await fo.ler(c))?.bytes : demo.get(c);
  const tipo = bytes && tipoDocumento(bytes);
  return bytes && tipo && TIPOS_FOTO.includes(tipo) ? { bytes, tipo, nome: f.nome } : null;
}
