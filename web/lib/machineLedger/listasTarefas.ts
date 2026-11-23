/**
 * Listas de tarefas gerais do SAP (export em texto da IA07/IA03: blocos "LTa <grupo> <numerador> <descrição>", operações,
 * texto longo, campos e componentes "Comp.mat.") e a associação operação ↔ componente do RCM do Machine Ledger, para gerar
 * a carga IA06 (mesmo CSV e script da Gestão de MRO, app/(app)/mro/ia06.ts). Só regras; leitura e gravação em ./dados.ts.
 * Testado em testes/machineLedgerListas.test.ts.
 *
 * - Cadastro `listas_tarefas.json`: { "<grupo>|<numerador>": { descricao, estrategia, centro, operacoes: [...] } }.
 * - Cadastro `machine_ledger_operacoes.json`: { "<ledger>|<componente>": { grupo, numerador, operacao, quantidade, por, em } }
 *   = a operação confirmada pelo PCM para o componente (a chave do componente = hash do conjunto/subconjunto/componente).
 * - Sugestão por texto: o nome do componente (inteiro, ou as 2 primeiras palavras, ou a única/1ª com 5+ letras), depois o
 *   subconjunto e o conjunto, contra o texto breve + longo da operação (sem acento, plural reduzido).
 * - Um material entra UMA vez em cada lista (grupo + numerador), em qualquer operação: já na lista = fora da carga, e
 *   componentes com o mesmo material na mesma lista viram uma linha só (quantidades somadas).
 */
import type { ItemInclusao } from "@/app/(app)/mro/ia06";

import { type BaseCodigos, codigoDoComponente, INATIVOS, type Componente, chaveNome, frase, norm, type OrigemCodigo, pecasPorDescricao, type Peca, type ResolvidoComOrigem, semZeros, txt } from "./regras";

export const ARQ_LISTAS = "listas_tarefas.json";
export const ARQ_OPERACOES = "machine_ledger_operacoes.json";
export const MAX_LISTAS = 5_000, MAX_OPERACOES = 200, MAX_TEXTO_LONGO = 2_000;

export interface CompMat { material: string; descricao: string; quantidade: number | null; um: string }
export interface OperacaoSap {
  numero: string; texto: string; textoLongo: string; centroTrabalho: string; chave: string; pessoas: number | null; trabalhoMin: number | null;
  pacote: string; componentes: CompMat[];
}
export interface ListaSap { grupo: string; numerador: string; descricao: string; estrategia: string; centro: string; operacoes: OperacaoSap[] }
export const chaveLista = (grupo: string, numerador: string) => `${grupo.trim().toUpperCase()}|${String(Number(numerador) || numerador).trim()}`;

const numBr = (s: string): number | null => {
  const t = s.trim();
  if (!t) return null;
  const n = Number(t.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
};
/** Duas ou mais espaços separam os campos de uma linha do export. */
const campos = (l: string) => l.split(/\s{2,}/).map((x) => x.trim());
const op4 = (o: string) => (/^\d{1,4}$/.test(o) ? o.padStart(4, "0") : o);
/** Minutos a partir de "30,0 MIN" / "1,5 H". */
function minutos(valor: string, unidade: string): number | null {
  const n = numBr(valor);
  if (n == null) return null;
  const u = norm(unidade);
  return Math.round((u.startsWith("H") ? n * 60 : u.startsWith("D") ? n * 1440 : n) * 100) / 100;
}

/**
 * Lê o export em texto. Suboperações ("Suboperaç.") entram no texto longo da operação de cima (os campos delas ficam de
 * fora). Erro se não houver nenhum bloco "LTa".
 */
export function lerListasTarefas(texto: string): { listas: ListaSap[] } | { erro: string } {
  const linhas = texto.replace(/^﻿/, "").split(/\r?\n/);
  const listas: ListaSap[] = [];
  let lista: ListaSap | null = null, op: OperacaoSap | null = null, comp: CompMat | null = null, emSub = false, longo: string[] = [];
  const fechaOp = () => { if (op) op.textoLongo = txt(longo.join("\n").replace(/[ \t]+/g, " "), MAX_TEXTO_LONGO); longo = []; };
  for (const bruta of linhas) {
    const l = bruta.replace(/\s+$/, "");
    if (!l.trim()) continue;
    const c = campos(l);
    const rot = norm(c[0]);
    if (/^LTA$/.test(rot) && c.length >= 3) {
      fechaOp();
      lista = { grupo: txt(c[1], 20).toUpperCase(), numerador: txt(c[2], 4), descricao: txt(c.slice(3).join(" "), 120), estrategia: "", centro: "", operacoes: [] };
      listas.push(lista); op = null; comp = null; emSub = false;
      continue;
    }
    if (!lista) continue;
    if (!op && rot === "ESTRATEGIA") { lista.estrategia = txt(c[1], 20); continue; }
    if (!op && rot === "CENTRO") { lista.centro = txt(c[1], 10); continue; }
    if (!op && rot === "UTILIZACAO") continue;
    const mOp = /^Opera\S*\s+(\d{1,4})(?:\s+(.*))?$/.exec(l);
    if (mOp && rot.startsWith("OPERACAO")) {
      fechaOp();
      op = { numero: op4(mOp[1]), texto: txt(mOp[2] ?? "", 80), textoLongo: "", centroTrabalho: "", chave: "", pessoas: null, trabalhoMin: null, pacote: "", componentes: [] };
      if (lista.operacoes.length < MAX_OPERACOES) lista.operacoes.push(op);
      comp = null; emSub = false;
      continue;
    }
    if (!op) continue;
    const mSub = /^Subopera\S*\s+(\d{1,4})\s+(.*)$/.exec(l);
    if (mSub) { emSub = true; longo.push(`Suboperação ${op4(mSub[1])}: ${mSub[2].trim()}`); continue; }
    if (rot === "CEN TRABALHO") { if (!emSub && !op.centroTrabalho) op.centroTrabalho = txt(c[1], 20); continue; }
    if (rot === "CHAVE DE CONTROLE") { if (!emSub && !op.chave) op.chave = txt(c[1], 10); continue; }
    if (rot === "NUM DE PESSOAS") { if (!emSub && op.pessoas == null) op.pessoas = numBr(c[1] ?? ""); continue; }
    if (rot === "TRABALHO") { if (!emSub && op.trabalhoMin == null) op.trabalhoMin = minutos(c[1] ?? "", c[2] ?? ""); continue; }
    if (rot === "DURACAO") continue;
    if (/^PAC MANUTEN/.test(rot)) { if (!emSub && !op.pacote) op.pacote = txt(c.slice(1).join(" "), 30); continue; }
    if (rot === "COMP MAT") {
      comp = { material: semZeros(txt(c[1], 40)), descricao: txt(c.slice(2).join(" "), 80), quantidade: null, um: "" };
      op.componentes.push(comp);
      continue;
    }
    if (rot === "LISTA TECNICA" || rot === "CATEGORIA DO ITEM") continue;
    if (rot === "QUANTIDADE" && comp) { comp.quantidade = numBr(c[1] ?? ""); comp.um = txt(c[2], 6); continue; }
    // texto longo: as linhas soltas depois do cabeçalho da operação (a 1ª repete o texto breve)
    if (!op.centroTrabalho || emSub) longo.push(l.trim());
  }
  fechaOp();
  if (!listas.length) return { erro: "Não parece o export das listas de tarefas: nenhum bloco \"LTa <grupo> <numerador>\" encontrado." };
  return { listas: listas.slice(0, MAX_LISTAS) };
}

// ----------------------------------------------------------------------------
// Cadastro
// ----------------------------------------------------------------------------
const ehObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const nOuNull = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const lista = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

/** Uma lista validada campo a campo (leitura do cadastro e envio pela aba). */
export function sanitizarLista(grupo: unknown, numerador: unknown, v: unknown): ListaSap | null {
  const g = txt(grupo, 20).toUpperCase(), n = txt(numerador, 4);
  if (!/^[A-Z0-9_\-]{1,20}$/.test(g) || !/^\d{1,4}$/.test(n) || !ehObj(v)) return null;
  return {
    grupo: g, numerador: n, descricao: txt(v.descricao, 120), estrategia: txt(v.estrategia, 20), centro: txt(v.centro, 10),
    operacoes: lista(v.operacoes).filter(ehObj).slice(0, MAX_OPERACOES).map((o) => ({
      numero: op4(txt(o.numero, 4)), texto: txt(o.texto, 80), textoLongo: txt(o.textoLongo, MAX_TEXTO_LONGO), centroTrabalho: txt(o.centroTrabalho, 20),
      chave: txt(o.chave, 10), pessoas: nOuNull(o.pessoas), trabalhoMin: nOuNull(o.trabalhoMin), pacote: txt(o.pacote, 30),
      componentes: lista(o.componentes).filter(ehObj).slice(0, 200).map((c) => ({ material: semZeros(txt(c.material, 40)), descricao: txt(c.descricao, 80),
        quantidade: nOuNull(c.quantidade), um: txt(c.um, 6) })).filter((c) => c.material),
    })).filter((o) => /^\d{4}$/.test(o.numero)),
  };
}
export function listasDe(cad: Record<string, unknown>): Map<string, ListaSap> {
  const out = new Map<string, ListaSap>();
  for (const [k, v] of Object.entries(cad)) {
    const [g, n] = k.split("|");
    const l = sanitizarLista(g, n, v);
    if (l) out.set(chaveLista(l.grupo, l.numerador), l);
  }
  return out;
}
/** Item do cadastro (sem o grupo/numerador, que estão na chave). */
export const itemLista = ({ grupo: _g, numerador: _n, ...resto }: ListaSap): Record<string, unknown> => resto;

// ----------------------------------------------------------------------------
// Associação operação ↔ componente
// ----------------------------------------------------------------------------
export type Confianca = "alta" | "media" | "baixa";
export interface OperacaoDaMaquina { grupo: string; numerador: string; descricaoLista: string; op: OperacaoSap }
export interface Sugestao { grupo: string; numerador: string; operacao: string; texto: string; pontos: number; confianca: Confianca; motivo: string }

/**
 * Chave estável do componente (conjunto/subconjunto/componente normalizados, hash curto). O "equip" do RCM não entra (de
 * propósito, para não perder as confirmações gravadas): o mesmo componente repetido em linhas de outro equip é uma chave só.
 */
export function chaveComponente(c: Pick<Componente, "conjunto" | "subconjunto" | "componente">): string {
  let h = 2166136261;
  for (const ch of `${norm(c.conjunto)}|${norm(c.subconjunto)}|${norm(c.componente)}`) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; }
  return h.toString(36);
}
export const chaveAssociacao = (ledger: string, c: Pick<Componente, "conjunto" | "subconjunto" | "componente">) => `${ledger}|${chaveComponente(c)}`;
export const confiancaDe = (pontos: number): Confianca => (pontos >= 70 ? "alta" : pontos >= 45 ? "media" : "baixa");

/**
 * A melhor operação das listas da máquina para o componente (null = nenhuma casa). Pontos: nome inteiro do componente
 * no texto 100; as 2 primeiras palavras significativas 70 (+10 com o subconjunto ou o conjunto também no texto); a palavra
 * única do nome (5+ letras) 55 sozinha (média) e 70 com o subconjunto ou o conjunto (alta); só a 1ª de duas (5+ letras) 40
 * (+10); só o subconjunto 50; só o conjunto 30. Empate: a operação que vem antes (lista, número).
 */
export function sugerirOperacao(c: Pick<Componente, "conjunto" | "subconjunto" | "componente">, ops: OperacaoDaMaquina[]): Sugestao | null {
  const nome = frase(c.componente), k = chaveNome(c.componente), k1 = k.split(" ")[0] ?? "";
  const sub = c.subconjunto ? frase(c.subconjunto) : "", conj = c.conjunto ? frase(c.conjunto) : "";
  let melhor: Sugestao | null = null;
  for (const o of ops) {
    const T = frase(`${o.op.texto} ${o.op.textoLongo}`);
    const temSub = !!sub.trim() && T.includes(sub), temConj = !!conj.trim() && T.includes(conj);
    let pontos = 0, motivo = "";
    if (nome.trim().split(" ").length >= 2 && T.includes(nome)) { pontos = 100; motivo = "nome do componente no texto da operação"; }
    else if ((k.includes(" ") || k.length >= 5) && T.includes(` ${k} `)) {
      pontos = k.includes(" ") ? 70 + (temSub || temConj ? 10 : 0) : temSub || temConj ? 70 : 55;
      motivo = `"${k.toLowerCase()}" no texto${temSub ? " + subconjunto" : temConj ? " + conjunto" : ""}`;
    }
    else if (k1.length >= 5 && T.includes(` ${k1} `)) { pontos = 40 + (temSub || temConj ? 10 : 0); motivo = `"${k1.toLowerCase()}" no texto${temSub ? " + subconjunto" : temConj ? " + conjunto" : ""}`; }
    else if (temSub) { pontos = 50; motivo = "subconjunto citado na operação"; }
    else if (temConj) { pontos = 30; motivo = "conjunto citado na operação"; }
    if (pontos && (!melhor || pontos > melhor.pontos))
      melhor = { grupo: o.grupo, numerador: o.numerador, operacao: o.op.numero, texto: o.op.texto, pontos, confianca: confiancaDe(pontos), motivo };
  }
  return melhor;
}

/** As operações das listas (na ordem lista → operação). */
export function operacoesDasListas(listas: ListaSap[]): OperacaoDaMaquina[] {
  return listas.flatMap((l) => l.operacoes.map((op) => ({ grupo: l.grupo, numerador: l.numerador, descricaoLista: l.descricao, op })));
}

export interface Confirmada { grupo: string; numerador: string; operacao: string; quantidade: number | null; por: string; em: string }
/** Código do componente confirmado pelo PCM (origem "Sysmat pela referência"), no mesmo item da associação. */
export interface CodigoConfirmado { codigo: string; por: string; em: string }
export function codigosConfirmadosDe(cad: Record<string, unknown>): Map<string, CodigoConfirmado> {
  return new Map(Object.entries(cad).filter(([, v]) => ehObj(v) && /^\d{5,7}$/.test(txt(v.codigo, 10))).map(([k, v0]) => {
    const v = v0 as Record<string, unknown>;
    return [k, { codigo: txt(v.codigo, 10), por: txt(v.codigoPor, 80), em: txt(v.codigoEm, 40) }];
  }));
}

export function confirmadasDe(cad: Record<string, unknown>): Map<string, Confirmada> {
  return new Map(Object.entries(cad).filter(([, v]) => ehObj(v) && txt(v.grupo, 20)).map(([k, v0]) => {
    const v = v0 as Record<string, unknown>;
    return [k, { grupo: txt(v.grupo, 20).toUpperCase(), numerador: txt(v.numerador, 4), operacao: op4(txt(v.operacao, 4)), quantidade: nOuNull(v.quantidade),
      por: txt(v.por, 80), em: txt(v.em, 40) }];
  }));
}

/**
 * As listas do cadastro das listas ligadas à máquina (sem repetir). Ligada sem numerador (IP19 sem a coluna) = todas as
 * listas do grupo.
 */
export function listasDasLigadas(ligadas: { grupo: string; numerador: string }[], listas: Map<string, ListaSap>): ListaSap[] {
  const out = new Map<string, ListaSap>();
  for (const l of ligadas) {
    const k = chaveLista(l.grupo, l.numerador);
    if (String(l.numerador ?? "").trim()) { const x = listas.get(k); if (x) out.set(k, x); continue; }
    for (const [kk, x] of listas) if (kk.startsWith(k)) out.set(kk, x);
  }
  return [...out.values()];
}

/** O material já está como Comp.mat. nessa operação da lista? */
export function jaNaOperacao(listas: Map<string, ListaSap>, grupo: string, numerador: string, operacao: string, material: string): boolean {
  const l = listas.get(chaveLista(grupo, numerador));
  const m = semZeros(material).toUpperCase();
  return !!l?.operacoes.find((o) => o.numero === op4(operacao))?.componentes.some((c) => semZeros(c.material).toUpperCase() === m);
}

/**
 * Em que operação da lista (grupo + numerador) o material já está como Comp.mat. ("" = em nenhuma). O SAP/script da IA06
 * aceita o material uma vez por lista, em qualquer operação.
 */
export function jaNaLista(listas: Map<string, ListaSap>, grupo: string, numerador: string, material: string): string {
  const l = listas.get(chaveLista(grupo, numerador));
  const m = semZeros(material).toUpperCase();
  return l?.operacoes.find((o) => o.componentes.some((c) => semZeros(c.material).toUpperCase() === m))?.numero ?? "";
}

/**
 * Quantidade instalada do RCM como número (padrão 1). "1.0"/"2.5" (número do Excel, ponto decimal) = Number; com vírgula,
 * formato brasileiro ("1,5", "1.000,5").
 */
export const quantidadeRcm = (qtd: string) => {
  const t = String(qtd ?? "").trim();
  const n = /^\d+(\.\d+)?$/.test(t) ? Number(t) : t.includes(",") ? numBr(t) : null;
  return n && Number.isFinite(n) && n > 0 ? n : 1;
};

// ----------------------------------------------------------------------------
// Linhas da seção "Operações e IA06" e a carga IA06
// ----------------------------------------------------------------------------
export interface LinhaOperacao {
  chave: string; componente: string; conjunto: string; subconjunto: string; codigoLedger: string;
  /** código SAP resolvido (regra resolverCodigo) e se serve para a IA06 (situação "ok") */
  codigo: string; codigoOk: boolean; origemCodigo: OrigemCodigo; descricaoSap: string; um: string; qtdRcm: number;
  /** código sugerido pela referência (precisa de confirmação), candidatos (ambíguo), token usado e se o PCM confirmou */
  sugerido: boolean; candidatos: { codigo: string; descricao: string }[]; referencia: string; codigoConfirmado: CodigoConfirmado | null;
  /** código confirmado antes que não é mais a sugestão nem um candidato (o RCM ou o catálogo mudou): ignorado, o PCM confere */
  confirmacaoAntiga: CodigoConfirmado | null;
  sugestao: Sugestao | null; confirmada: Confirmada | null;
  /** a operação confirmada não existe mais nas listas da máquina (export novo ou lista desligada): fora da IA06 */
  confirmadaOrfa: boolean;
  /** a operação da lista em uso (confirmada, senão a sugerida) que já tem o material como Comp.mat. ("" = nenhuma) */
  jaNaLista: string;
}

/**
 * O código confirmado pelo PCM vale só enquanto o componente ainda é "Sysmat pela referência" e o código é a sugestão ou um
 * dos candidatos; senão é uma confirmação antiga (ignorada).
 */
export function confirmacaoValida(r: Pick<ResolvidoComOrigem, "sugerido" | "codigo" | "candidatos">, cc: CodigoConfirmado | null): boolean {
  return !!cc && !!r.sugerido && (r.codigo === cc.codigo || (r.candidatos ?? []).some((x) => x.codigo === cc.codigo));
}

/** Ordem de preferência entre resoluções do mesmo componente repetido no RCM (menor = melhor). */
function nota(r: ResolvidoComOrigem): number {
  if (r.situacao === "ok" && !r.sugerido) return r.origemCodigo === "RCM" ? 0 : r.origemCodigo === "peça de reposição" ? 1 : 2;
  if (r.sugerido && r.codigo) return 3;
  if (r.sugerido) return 4;
  return r.situacao === "bloqueado" ? 5 : r.situacao === "inexistente" ? 6 : 7;
}

/**
 * Uma linha por componente do RCM. O mesmo componente repetido no RCM (mesmo conjunto/subconjunto/componente; o "equip" não
 * entra na chave) entra uma vez, com a melhor resolução de código entre as linhas repetidas.
 */
export function linhasOperacoes(ledger: string, comps: Componente[], ops: OperacaoDaMaquina[], confirmadas: Map<string, Confirmada>,
  listas: Map<string, ListaSap>, b: BaseCodigos, pecas: Peca[] = [], codigos: Map<string, CodigoConfirmado> = new Map()): LinhaOperacao[] {
  const porDesc = pecasPorDescricao(pecas);
  const grupos = new Map<string, { c: Componente; r: ResolvidoComOrigem }>();
  for (const c of comps) {
    const chave = chaveAssociacao(ledger, c);
    const r = codigoDoComponente(c, porDesc, b);
    const a = grupos.get(chave);
    if (!a || nota(r) < nota(a.r)) grupos.set(chave, { c, r });
  }
  const existe = new Set(ops.map((o) => `${o.grupo}|${o.numerador}|${o.op.numero}`));
  const out: LinhaOperacao[] = [];
  for (const [chave, { c, r: r0 }] of grupos) {
    const cc0 = codigos.get(chave) ?? null;
    const valida = confirmacaoValida(r0, cc0);
    const cc = valida ? cc0 : null;
    const r = cc ? { ...r0, codigo: cc.codigo } : r0;
    const cat = r.codigo ? b.cat?.get(r.codigo) : undefined;
    const codigoOk = cc ? !!cat && !INATIVOS.has(cat.status) : r.situacao === "ok" && !r.sugerido;
    const sugestao = ops.length ? sugerirOperacao(c, ops) : null, confirmada = confirmadas.get(chave) ?? null;
    const confirmadaOrfa = !!confirmada && !existe.has(`${confirmada.grupo}|${confirmada.numerador}|${confirmada.operacao}`);
    const usada = confirmada ?? sugestao;
    out.push({ chave, componente: c.componente, conjunto: c.conjunto, subconjunto: c.subconjunto, codigoLedger: c.codigo, codigo: r.codigo,
      codigoOk, origemCodigo: r.origemCodigo, sugerido: !!r.sugerido, candidatos: r.candidatos ?? [], referencia: r.referencia ?? "", codigoConfirmado: cc,
      confirmacaoAntiga: cc0 && !valida ? cc0 : null, descricaoSap: cat?.descricao ?? "", um: cat?.um || b.saldo?.get(r.codigo)?.um || "", qtdRcm: quantidadeRcm(c.qtd),
      sugestao, confirmada, confirmadaOrfa, jaNaLista: usada && r.codigo ? jaNaLista(listas, usada.grupo, usada.numerador, r.codigo) : "" });
  }
  return out;
}

/** Linhas prontas para a IA06: código válido, operação confirmada e ainda existente (ou sugestão alta, se pedido) e material fora da lista. */
export const prontaParaIa06 = (l: LinhaOperacao, incluirAlta: boolean) =>
  l.codigoOk && !l.jaNaLista && (l.confirmada ? !l.confirmadaOrfa : incluirAlta && l.sugestao?.confianca === "alta");

/**
 * Itens da carga IA06 (o mesmo formato da Gestão de MRO), com o número da operação: um por lista + material (o SAP aceita o
 * material uma vez por lista), quantidades somadas e a operação do primeiro componente — o número de itens é o de linhas do
 * CSV. `ativos`: o ativo (texto) ou um por equipamento do ledger (identificarAtivo), como na coluna ATIVOS da Gestão de MRO.
 */
export function itensIa06(linhas: LinhaOperacao[], quantidades: Record<string, number>, incluirAlta: boolean, ativos: string | string[]): ItemInclusao[] {
  const lista = (Array.isArray(ativos) ? ativos : [ativos]).filter(Boolean);
  const por = new Map<string, ItemInclusao>();
  for (const l of linhas) {
    if (!prontaParaIa06(l, incluirAlta)) continue;
    const o = (l.confirmada ?? l.sugestao)!;
    const q0 = quantidades[l.chave] ?? l.confirmada?.quantidade ?? l.qtdRcm, q = q0 > 0 ? q0 : 1;
    const k = `${chaveLista(o.grupo, o.numerador)}|${semZeros(l.codigo).toUpperCase()}`;
    const a = por.get(k);
    if (a) { a.quantidade = Math.round((a.quantidade + q) * 1000) / 1000; continue; }
    por.set(k, { grupo: o.grupo, numerador: o.numerador, operacao: o.operacao, material: l.codigo, quantidade: q, um: l.um,
      texto: l.descricaoSap || l.componente, equipamento: lista[0] ?? "", ...(lista.length > 1 ? { ativos: lista } : {}), origemCodigo: l.origemCodigo });
  }
  return [...por.values()];
}

/** Quantos componentes prontos foram juntados com outro do mesmo material na mesma lista (aviso da tela). */
export const juntadosIa06 = (linhas: LinhaOperacao[], incluirAlta: boolean, itens: ItemInclusao[]) =>
  linhas.filter((l) => prontaParaIa06(l, incluirAlta)).length - itens.length;
