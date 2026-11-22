import "server-only";

import { randomBytes } from "node:crypto";

import { registrar } from "../auditoria";
import { podeEditar, soEstoque, type Usuario } from "../auth/acesso";
import { catalogo, lerBase } from "../dados/bases";
import { gravarCadastroLote, lerCadastro, listarCadastros } from "../dados/cadastros";
import { LIMITE_DOCUMENTO, tipoDocumento } from "../dados/documentos";
import { fonte, FonteErro } from "../dados/fonte";
import { DESTINO } from "../leitura/tipos";
import { bases } from "../wcm/dados";
import { type Equipamento, type Ordem, prepararEquipamentos, prepararIw38 } from "../wcm/preparo";
import { hoje } from "../wcm/util";
import { fotosUbmDemo, PASTA_FOTOS_UBM } from "./demo";
import {
  ARQ_ARMARIOS, arquivoMovimentos, type Armario, armarioDe, armarioParaGravar, armariosDe, chaveOrdem, type EntradaArmario,
  type EntradaRetirada, type EntradaSolicitacao, type Foto, idArmarioValido, type Movimento, movimentoDe, movimentoParaGravar,
  ehArquivoMovimentos, movimentosDe, normalizarCodigo, podeMarcarLancada, normalizarIdArmario, type OrdemIw38, validarArmario, validarLancamento, validarRetirada,
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
/**
 * Todos os movimentos (todos os cadastros mensais: o saldo precisa de tudo desde a última contagem). Uma listagem só
 * (lista de versões da fonte) e cada mês lido com o cache por versão de lerCadastro.
 */
export async function lerMovimentos(fresco = false): Promise<Movimento[]> {
  const meses = await listarCadastros(ehArquivoMovimentos, fresco);
  const cads = await Promise.all(meses.map((n) => lerCadastro(n, { fresco })));
  return movimentosDe(Object.assign({}, ...cads));
}

/** O movimento pelo id (lido agora) e o cadastro mensal onde ele está (null se não existe). */
async function movimentoAgora(id: string): Promise<{ m: Movimento; arquivo: string } | null> {
  const m = (await lerMovimentos(true)).find((x) => x.id === id);
  return m ? { m, arquivo: arquivoMovimentos(m.em) } : null;
}

/** O armário pelo id (null se não existe). */
export async function armario(id: string, fresco = false): Promise<Armario | null> {
  const k = normalizarIdArmario(id);
  if (!idArmarioValido(k)) return null;
  return armarioDe(k, (await lerCadastro(ARQ_ARMARIOS, { fresco }))[k]);
}

/** O armário pelo cache (conferido pela versão); só relê sem cache se não achar (acabou de ser criado em outra instância). */
async function armarioAgora(id: string): Promise<Armario | null> {
  const a = await armario(id);
  return a && a.ativo ? a : armario(id, true);
}

async function armarioAtivo(id: string): Promise<Armario> {
  const a = await armarioAgora(id);
  if (!a || !a.ativo) throw new FonteErro("Armário não encontrado ou desativado: confira o QR code.");
  return a;
}

// ----------------------------------------------------------------------------
// Bases (só para mostrar e analisar; nunca travam a gravação)
// ----------------------------------------------------------------------------
// Os mapas ficam guardados presos à identidade dos dados da base (o cache de lerBase devolve o mesmo array enquanto a
// versão não muda): base nova = array novo = mapa novo; a mesma base = nenhum trabalho a cada consulta do formulário.
const mapasCatalogo = new WeakMap<object, Map<string, string>>();
const mapasOrdens = new WeakMap<object, WeakMap<object, Map<string, OrdemIw38>>>();

/** Código → descrição do catálogo do Sysmat (sem a base: mapa vazio). */
async function mapaCatalogo(): Promise<Map<string, string>> {
  const itens = (await catalogo().catch(() => null))?.dados;
  if (!itens) return new Map();
  let m = mapasCatalogo.get(itens);
  if (!m) {
    m = new Map();
    for (const i of itens) {
      const c = normalizarCodigo(i.material);
      const d = (i.descricaoCurta || i.descrCompleta || "").trim();
      if (c && d && !m.has(c)) m.set(c, d);
    }
    mapasCatalogo.set(itens, m);
  }
  return m;
}

/** Descrição do código no catálogo do Sysmat (null = não achou ou sem a base). */
export async function descricaoCatalogo(codigo: string): Promise<string | null> {
  const c = normalizarCodigo(codigo);
  return c ? (await mapaCatalogo()).get(c) ?? null : null;
}

/** Descrições do catálogo só dos códigos pedidos (sem a base: mapa vazio). */
export async function descricoesCatalogo(codigos: Set<string>): Promise<Map<string, string>> {
  const todos = await mapaCatalogo();
  return new Map([...codigos].flatMap((c) => (todos.has(c) ? [[c, todos.get(c)!] as const] : [])));
}

/**
 * Só a IW38 e o IH08 (não as outras bases): com o repositório de dados, lidas pelo lerBase com o mesmo preparo e a
 * mesma chave de cache de lib/wcm/dados.ts (a mesma versão não é baixada de novo); na demonstração, as bases fictícias.
 */
async function iw38EIh08(): Promise<{ ordens: Ordem[] | null; equipamentos: Equipamento[] }> {
  if (!fonte()) {
    const b = await bases();
    return { ordens: b.ordens.dados, equipamentos: b.equipamentos.dados ?? [] };
  }
  const h = hoje();
  const [iw38, ih08] = await Promise.all([lerBase(DESTINO.iw38, (l) => prepararIw38(l, h).ordens, String(h)),
    lerBase(DESTINO.ih08, (l) => prepararEquipamentos(l))]);
  return { ordens: iw38.dados, equipamentos: ih08.dados ?? [] };
}

/** A IW38 por chave da ordem, com o nome do equipamento do IH08 (null sem a base). */
export async function ordensIw38(): Promise<Map<string, OrdemIw38> | null> {
  const { ordens, equipamentos } = await iw38EIh08().catch(() => ({ ordens: null, equipamentos: [] as Equipamento[] }));
  if (!ordens?.length) return null;
  const porEquip = mapasOrdens.get(ordens) ?? new WeakMap<object, Map<string, OrdemIw38>>();
  mapasOrdens.set(ordens, porEquip);
  let m = porEquip.get(equipamentos);
  if (!m) {
    const nomes = new Map(equipamentos.map((e) => [e.equipamento, e.denominacao]));
    m = new Map();
    for (const o of ordens) {
      const k = chaveOrdem(o.ordem);
      if (k && !m.has(k)) m.set(k, { texto: o.texto, equipamento: o.equipamento, denominacao: nomes.get(o.equipamento) || "" });
    }
    porEquip.set(equipamentos, m);
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
  const m = (await lerMovimentos()).find((x) => x.id === id);
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

/** Grava movimentos novos no cadastro do mês (de Brasília) de cada um. */
async function gravarNovos(movs: Movimento[], quem: Quem) {
  const porArquivo = new Map<string, Movimento[]>();
  for (const m of movs) porArquivo.set(arquivoMovimentos(m.em), [...(porArquivo.get(arquivoMovimentos(m.em)) ?? []), m]);
  for (const [arquivo, lista] of porArquivo) {
    await gravarCadastroLote(arquivo, Object.fromEntries(lista.map((m) => [m.id, (atual: unknown) => {
      if (atual) throw new FonteErro("Não consegui gravar agora; tente de novo.");
      return movimentoParaGravar(m);
    }])), quem.login);
  }
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
  const a = await armarioAgora(armarioId);
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
  const achado = await movimentoAgora(id);
  if (!achado) throw new FonteErro("Solicitação não encontrada.");
  await gravarCadastroLote(achado.arquivo, { [id]: (atual) => {
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
  const achado = await movimentoAgora(id);
  if (!achado) throw new FonteErro("Retirada não encontrada.");
  await gravarCadastroLote(achado.arquivo, { [id]: (atual) => {
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
