import "server-only";

import { randomBytes } from "node:crypto";

import { createHash } from "node:crypto";

import { ehAdmin, soEstoque } from "../auth/acesso";
import { usuarios } from "../auth/usuarios";
import { gravarCadastroLote, lerCadastro } from "../dados/cadastros";
import { LIMITE_DOCUMENTO, tipoDocumento } from "../dados/documentos";
import { fonte, FonteErro } from "../dados/fonte";
import {
  ARQ_CARTAO, type Bloco, blocoDe, blocosDe, bloqueioDeConferencia, bloqueioDeEdicao, CHAVE_MESES, CONFERIDO, type Cupom, type EntradaGasto,
  type Gasto, idValido, LANCADO, MAX_GASTOS_POR_BLOCO, mesDe, mesesFechados, type Papel, paraGravar, RECUSADO, validarGasto,
} from "./regras";

/**
 * Gravação da gestão do cartão (regras em ./regras.ts). Tudo condicionado à versão do cadastro (gravarCadastroLote
 * relê e reaplica se outra pessoa gravou no meio); as regras são conferidas de novo dentro da gravação.
 */
const PASTA = "app/documentos/cartao";
const demo = new Map<string, Uint8Array>();
const novoId = () => randomBytes(9).toString("hex");
const agora = () => new Date().toISOString();
/** Hoje em Brasília (aaaa-mm-dd). */
export const hojeBr = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());

/** Quem confere: Líder, Analista ou administrador (pela função, mesmo com lista de abas personalizada). */
export function papelDe(u: { login: string; funcao?: string; perfil?: string; abas?: unknown }): Papel {
  return { login: u.login, confere: !soEstoque(u) && (["lider", "analista"].includes(u.funcao ?? "") || ehAdmin(u)) };
}

export async function lerCartao(fresco = false) {
  const cad = await lerCadastro(ARQ_CARTAO, { fresco });
  return { blocos: blocosDe(cad), fechados: mesesFechados(cad) };
}

const caminho = (bloco: string, gasto: string) => `${PASTA}/${bloco}/${gasto}`;

/** Grava o cupom num arquivo novo (`arquivo` = id dele): nunca por cima de um cupom que já valeu. */
async function gravarCupom(bloco: string, arquivoId: string, a: { nome: string; bytes: Uint8Array }): Promise<Cupom> {
  const tipo = tipoDocumento(a.bytes);
  if (!tipo) throw new FonteErro("O cupom tem de ser PDF ou foto (JPEG, PNG ou WebP).");
  if (a.bytes.length > LIMITE_DOCUMENTO) throw new FonteErro("O cupom passou de 4 MB.");
  const f = fonte();
  const c = caminho(bloco, arquivoId);
  if (!f) demo.set(c, a.bytes);
  else if (!(await f.gravarCondicional(c, a.bytes, null, "Cupom fiscal (cartão)"))) throw new FonteErro("Não consegui gravar o cupom agora; tente de novo.");
  return { nome: a.nome.replace(/[^\w.\- ]/g, "_").slice(0, 120) || "cupom", tipo, tamanho: a.bytes.length, arquivo: arquivoId };
}

/** Arquivo do cupom de um gasto. */
const arquivoDe = (g: Pick<Gasto, "id" | "cupom">) => g.cupom?.arquivo || g.id;

async function apagarCupom(bloco: string, arquivoId: string) {
  const f = fonte();
  const c = caminho(bloco, arquivoId);
  if (!f) { demo.delete(c); return; }
  const v = (await f.versoes(true).catch(() => null))?.get(c);
  if (v) await f.apagar(c, v, "Remove cupom fiscal (cartão)").catch(() => false);
}

/** Altera um bloco relido na hora da gravação; `fn` lança FonteErro para recusar. */
async function alterarBloco(id: string, por: string, fn: (b: Bloco, fechados: Set<string>) => Bloco) {
  if (!idValido(id)) throw new FonteErro("Bloco inválido.");
  let fechados = new Set<string>();
  // os meses fechados são relidos na mesma gravação (a chave deles vem primeiro e não é alterada)
  await gravarCadastroLote(ARQ_CARTAO, { [CHAVE_MESES]: (atual) => { fechados = mesesFechados({ [CHAVE_MESES]: atual }); return undefined; },
    [id]: (atual) => {
    const b = blocoDe(id, atual);
    if (!b) throw new FonteErro("Bloco não encontrado.");
    return paraGravar(fn(b, fechados));
  } }, por);
}

// ----------------------------------------------------------------------------
// Blocos (quem confere)
// ----------------------------------------------------------------------------
export async function criarBloco(p: Papel, d: { nome: string; login: string }, por: string): Promise<string> {
  if (!p.confere) throw new FonteErro("Só Líder, Analista ou administrador criam blocos.");
  const nome = String(d.nome ?? "").trim().slice(0, 80), login = String(d.login ?? "").trim();
  if (!nome) throw new FonteErro("Informe o nome do portador.");
  // o próprio usuário sempre pode (Líder/Analista que também usa o cartão); os demais têm de existir, ativos e com acesso
  if (!login) throw new FonteErro("Escolha o usuário do site do portador.");
  if (login !== p.login) {
    const r = (await usuarios())[login];
    if (!r) throw new FonteErro("Escolha o usuário do site do portador.");
    if (r.ativo === false) throw new FonteErro("Este usuário está desativado.");
    if (soEstoque({ ...r, login })) throw new FonteErro("Terceiro e Manutentor só veem Estoque e Suporte: não podem ter bloco de cartão.");
  }
  const { blocos } = await lerCartao(true);
  if (blocos.some((b) => b.login.toLowerCase() === login.toLowerCase())) throw new FonteErro("Este usuário já tem um bloco.");
  // id pelo login: dois pedidos ao mesmo tempo caem na mesma chave (o segundo é recusado)
  const id = "p" + createHash("sha256").update(login.toLowerCase()).digest("hex").slice(0, 15);
  await gravarCadastroLote(ARQ_CARTAO, { [id]: (atual) => {
    if (atual) throw new FonteErro("Este usuário já tem um bloco.");
    return paraGravar({ id, nome, login, ativo: true, criadoEm: agora(), gastos: [] });
  } }, por);
  return id;
}

export async function ativarBloco(p: Papel, id: string, ativo: boolean, por: string) {
  if (!p.confere) throw new FonteErro("Só Líder, Analista ou administrador alteram blocos.");
  await alterarBloco(id, por, (b) => ({ ...b, ativo }));
}

// ----------------------------------------------------------------------------
// Gastos (portador)
// ----------------------------------------------------------------------------
export async function lancarGasto(p: Papel, blocoId: string, e: EntradaGasto, arquivo: { nome: string; bytes: Uint8Array } | null, por: string) {
  const v = validarGasto(e, hojeBr());
  if ("erro" in v) throw new FonteErro(v.erro);
  const { blocos, fechados } = await lerCartao(true);
  const b = blocos.find((x) => x.id === blocoId);
  if (!b) throw new FonteErro("Bloco não encontrado.");
  const motivo = bloqueioDeEdicao(p, b, null, fechados, mesDe(v.campos.data));
  if (motivo) throw new FonteErro(motivo);
  const id = novoId();
  const cupom = arquivo ? await gravarCupom(blocoId, id, arquivo) : undefined;
  const g: Gasto = { id, ...v.campos, ...(cupom ? { cupom } : {}), status: LANCADO, em: agora(), por };
  try {
    await alterarBloco(blocoId, por, (atual, fch) => {
      const m = bloqueioDeEdicao(p, atual, null, fch, mesDe(g.data));
      if (m) throw new FonteErro(m);
      if (atual.gastos.length >= MAX_GASTOS_POR_BLOCO) throw new FonteErro("Bloco cheio: fale com o administrador.");
      return { ...atual, gastos: [...atual.gastos, g] };
    });
  } catch (err) {
    if (cupom) await apagarCupom(blocoId, id); // não fica cupom sem gasto
    throw err;
  }
}

export async function editarGasto(p: Papel, blocoId: string, gastoId: string, e: EntradaGasto,
  arquivo: { nome: string; bytes: Uint8Array } | null, por: string) {
  const v = validarGasto(e, hojeBr());
  if ("erro" in v) throw new FonteErro(v.erro);
  const { blocos, fechados } = await lerCartao(true);
  const b = blocos.find((x) => x.id === blocoId);
  const g0 = b?.gastos.find((x) => x.id === gastoId);
  if (!b || !g0) throw new FonteErro("Gasto não encontrado.");
  const motivo = bloqueioDeEdicao(p, b, g0, fechados, mesDe(v.campos.data));
  if (motivo) throw new FonteErro(motivo);
  // cupom novo vai para um arquivo novo; o antigo só sai depois que o gasto foi gravado
  const cupom = arquivo ? await gravarCupom(blocoId, novoId(), arquivo) : undefined;
  let antigo = "";
  try {
    await alterarBloco(blocoId, por, (atual, fch) => {
      const g = atual.gastos.find((x) => x.id === gastoId);
      if (!g) throw new FonteErro("Gasto não encontrado.");
      const m = bloqueioDeEdicao(p, atual, g, fch, mesDe(v.campos.data));
      if (m) throw new FonteErro(m);
      antigo = cupom && g.cupom ? arquivoDe(g) : "";
      const novo: Gasto = { ...g, ...v.campos, ...(cupom ? { cupom } : {}) };
      return { ...atual, gastos: atual.gastos.map((x) => (x.id === gastoId ? novo : x)) };
    });
  } catch (err) {
    if (cupom?.arquivo) await apagarCupom(blocoId, cupom.arquivo);
    throw err;
  }
  if (antigo) await apagarCupom(blocoId, antigo);
}

export async function excluirGasto(p: Papel, blocoId: string, gastoId: string, por: string) {
  let arquivoCupom = "";
  await alterarBloco(blocoId, por, (atual, fch) => {
    const g = atual.gastos.find((x) => x.id === gastoId);
    if (!g) throw new FonteErro("Gasto não encontrado.");
    const m = bloqueioDeEdicao(p, atual, g, fch);
    if (m) throw new FonteErro(m);
    arquivoCupom = g.cupom ? arquivoDe(g) : "";
    return { ...atual, gastos: atual.gastos.filter((x) => x.id !== gastoId) };
  });
  if (arquivoCupom) await apagarCupom(blocoId, arquivoCupom);
}

// ----------------------------------------------------------------------------
// Conferência e fechamento (quem confere)
// ----------------------------------------------------------------------------
export async function conferirGasto(p: Papel, blocoId: string, gastoId: string, status: string, motivo: string, por: string) {
  if (![CONFERIDO, RECUSADO, LANCADO].includes(status)) throw new FonteErro("Situação inválida.");
  const mot = String(motivo ?? "").trim().slice(0, 300);
  if (status === RECUSADO && !mot) throw new FonteErro("Diga o motivo da recusa.");
  await alterarBloco(blocoId, por, (atual, fch) => {
    const g = atual.gastos.find((x) => x.id === gastoId);
    if (!g) throw new FonteErro("Gasto não encontrado.");
    const m = bloqueioDeConferencia(p, g, fch, atual);
    if (m) throw new FonteErro(m);
    if (status === CONFERIDO && !g.cupom) throw new FonteErro("Sem o cupom fiscal anexado não dá para conferir: recuse ou peça o cupom.");
    const { motivo: _m, conferidoEm: _e, conferidoPor: _p, ...resto } = g;
    void _m; void _e; void _p;
    const novo: Gasto = status === LANCADO ? { ...resto, status: LANCADO }
      : { ...resto, status: status as Gasto["status"], ...(status === RECUSADO ? { motivo: mot } : {}), conferidoEm: agora(), conferidoPor: por };
    return { ...atual, gastos: atual.gastos.map((x) => (x.id === gastoId ? novo : x)) };
  });
}

/** Fecha (ou reabre) o mês: fechar é de quem confere; reabrir, só do administrador. */
export async function fecharMes(p: Papel & { admin: boolean }, mes: string, fechar: boolean, por: string) {
  if (!/^\d{4}-\d{2}$/.test(mes)) throw new FonteErro("Mês inválido.");
  if (fechar && mes > mesDe(hojeBr())) throw new FonteErro("Só dá para fechar o mês atual ou um anterior.");
  if (fechar && !p.confere) throw new FonteErro("Só Líder, Analista ou administrador fecham o mês.");
  if (!fechar && !p.admin) throw new FonteErro("Só o administrador reabre um mês fechado.");
  await gravarCadastroLote(ARQ_CARTAO, { [CHAVE_MESES]: (atual) => {
    const s = new Set(Array.isArray(atual?.fechados) ? (atual!.fechados as unknown[]).map(String) : []);
    if (fechar) s.add(mes); else s.delete(mes);
    return { fechados: [...s].sort() };
  } }, por);
}

/** O cupom de um gasto, para quem vê o bloco. */
export async function lerCupom(p: Papel, blocoId: string, gastoId: string): Promise<{ bytes: Uint8Array; tipo: string; nome: string } | null> {
  if (!idValido(blocoId) || !idValido(gastoId)) return null;
  const { blocos } = await lerCartao();
  const b = blocos.find((x) => x.id === blocoId);
  if (!b || !(p.confere || b.login.toLowerCase() === p.login.toLowerCase())) return null;
  const g = b.gastos.find((x) => x.id === gastoId);
  if (!g?.cupom) return null;
  const f = fonte();
  const c = caminho(blocoId, arquivoDe(g));
  const bytes = f ? (await f.ler(c))?.bytes : demo.get(c);
  const tipo = bytes && tipoDocumento(bytes);
  return bytes && tipo ? { bytes, tipo, nome: g.cupom.nome } : null;
}
