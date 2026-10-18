import type { ItemCatalogo, ItemEstoque } from "@/lib/dados/materiais";
import { normalizarBusca } from "@/lib/dados/texto";
import * as ativos from "@/lib/wcm/ativos";
import type { LinhaAtivo } from "@/lib/wcm/ativos";

import { csv, listaParam, param, SEM_CLASSE, type Params, type SituacaoPeca } from "../equipamentos/logica";

/**
 * Regras puras da aba Gestão de MRO: cada ativo da lista de equipamentos (IH08 + cadastro do site + IW38) com as peças
 * de reposição vinculadas a ele e a situação delas no estoque (MB52 × mínimo), e o caminho inverso — cada material com
 * os ativos onde é usado. O vínculo é o campo `materiais` do `cadastro_equipamentos.json` (o mesmo da aba Equipamentos e do Almoxarifado). Cada peça é completada com a MB52 (saldo, unidade, valor, depósitos) e com o
 * catálogo Sysmat (código Sysmat, descrição completa, fabricante/referência, situação do cadastro, substituto).
 * Testado em testes/mro.test.ts.
 */

export const V_ATIVOS = "ativos", V_MATERIAIS = "materiais";
/** Item do cadastro criado só para guardar as peças (some sozinho quando a última peça é desvinculada). */
export const MARCA_MRO = "criado_pelo_mro";
export const SEM_PECAS = "Sem peças vinculadas", COM_FALTA = "Com peça em falta", EM_DIA = "Peças em dia";
export const SITUACOES_MRO = [SEM_PECAS, COM_FALTA, EM_DIA];
export const CRITS = ["Alta", "Média", "Baixa", SEM_CLASSE];
export const MAX_PECAS = 300;

const ordemCrit = (c: string) => ({ Alta: 0, "Média": 1, Baixa: 2 } as Record<string, number>)[c] ?? 3;
const emAlerta = (p: SituacaoPeca) => p.status !== "ok";

// ----------------------------------------------------------------------------
// Peça = MB52 + catálogo Sysmat + mínimo do cadastro de materiais
// ----------------------------------------------------------------------------
export interface PecaMro extends SituacaoPeca {
  um: string; valor: number | null; depositos: string; sysmat: string; descrCompleta: string; fabricanteRef: string;
  categoria: string; cadastro: string; substituto: string; noMb52: boolean; noSysmat: boolean;
}

/** As duas bases indexadas por código (o catálogo pelo código Alpargatas sem zeros à esquerda, como no Almoxarifado). */
export interface BaseMateriais { est: Map<string, ItemEstoque> | null; cat: Map<string, ItemCatalogo> | null }

export const semZeros = (c: string) => c.replace(/^0+/, "") || c;
const INATIVOS = new Set(["BLOQUEADO", "CANCELADO", "DUPLICADO"]);

export function indexarMateriais(estoque: ItemEstoque[] | null, catalogo: ItemCatalogo[] | null): BaseMateriais {
  let est: Map<string, ItemEstoque> | null = null, cat: Map<string, ItemCatalogo> | null = null;
  if (estoque) {
    est = new Map();
    for (const e of estoque) if (!est.has(e.material)) est.set(e.material, e);
    for (const e of estoque) if (!est.has(semZeros(e.material))) est.set(semZeros(e.material), e);
  }
  if (catalogo) {
    cat = new Map();
    for (const c of catalogo) if (c.material && !cat.has(semZeros(c.material))) cat.set(semZeros(c.material), c);
  }
  return { est, cat };
}

function situacaoSysmat(c: ItemCatalogo | undefined, temCat: boolean): string {
  if (!temCat) return "";
  if (!c) return "Não encontrado no Sysmat";
  return INATIVOS.has(c.status) ? c.status.charAt(0) + c.status.slice(1).toLowerCase() : "Ativo";
}

/**
 * Situação de uma peça: a regra da página Estoque (MB52 × mínimo). Material cadastrado no Sysmat sem linha no MB52
 * conta como zerado (existe, mas não tem saldo); fora das duas bases, "não encontrado".
 */
export function pecaMro(codigo: string, b: BaseMateriais, cadMat: Record<string, unknown>): PecaMro {
  const e = b.est?.get(codigo) ?? b.est?.get(semZeros(codigo));
  const c = b.cat?.get(semZeros(codigo));
  const info = cadMat[codigo];
  const mBruto = info && typeof info === "object" ? Number((info as Record<string, unknown>).minimo) : NaN;
  const minimo = Number.isFinite(mBruto) && mBruto > 0 ? mBruto : null;
  const extra = {
    um: e?.um || c?.um || "", valor: e ? e.valor : null, depositos: e?.depositos ?? "", sysmat: c?.sysmat ?? "",
    descrCompleta: c?.descrCompleta ?? "", fabricanteRef: c?.fabricanteRef ?? "", categoria: c?.categoria ?? "",
    cadastro: situacaoSysmat(c, !!b.cat), substituto: c?.substituto ?? "", noMb52: !!e, noSysmat: !!c,
  };
  const descricao = e?.descricao || c?.descricaoCurta || "";
  if (!e) {
    if (c && b.est) return { codigo, descricao, status: "zerado", texto: "sem saldo no MB52 · cadastrado no Sysmat", estoque: 0, minimo, ...extra };
    if (c) return { codigo, descricao, status: "ausente", texto: "cadastrado no Sysmat · sem a base MB52", estoque: null, minimo, ...extra };
    return { codigo, descricao, status: "ausente", texto: "não encontrado no MB52 nem no Sysmat", estoque: null, minimo, ...extra };
  }
  const q = e.estoque;
  const texto = `estoque: ${n0.format(q)}${e.um ? ` ${e.um}` : ""}`;
  if (q <= 0) return { codigo, descricao, status: "zerado", texto, estoque: q, minimo, ...extra };
  if (minimo && q < minimo) return { codigo, descricao, status: "baixo", texto: `${texto} · mín. ${n0.format(minimo)}`, estoque: q, minimo, ...extra };
  return { codigo, descricao, status: "ok", texto, estoque: q, minimo, ...extra };
}

const n0 = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 });

/** Busca para vincular: MB52 primeiro, depois o que só está no catálogo Sysmat (código, descrição, Sysmat, fabricante). */
export function procurar(b: BaseMateriais, cadMat: Record<string, unknown>, q: string, max = 60): { itens: PecaMro[]; total: number } {
  const termos = normalizarBusca(String(q ?? "").slice(0, 120)).split(/\s+/).filter(Boolean);
  const casa = (txt: string) => !termos.length || termos.every((t) => txt.includes(t));
  const achados: string[] = [];
  const vistos = new Set<string>();
  let total = 0;
  for (const [cod, e] of b.est ?? []) {
    if (cod !== e.material || vistos.has(semZeros(cod))) continue; // a entrada extra (sem zeros) do índice
    vistos.add(semZeros(cod));
    const c = b.cat?.get(semZeros(cod));
    if (!casa(normalizarBusca(`${cod} ${e.descricao} ${c?.sysmat ?? ""} ${c?.fabricanteRef ?? ""}`))) continue;
    total++;
    if (achados.length < max) achados.push(cod);
  }
  for (const [chave, c] of b.cat ?? []) {
    if (vistos.has(chave) || INATIVOS.has(c.status)) continue;
    if (!casa(normalizarBusca(`${c.material} ${c.descricaoCurta} ${c.sysmat} ${c.fabricanteRef}`))) continue;
    total++;
    if (achados.length < max) achados.push(semZeros(c.material)); // vincula sem zeros à esquerda, como o MB52
  }
  return { itens: achados.map((cod) => pecaMro(cod, b, cadMat)), total };
}

// ----------------------------------------------------------------------------
// Por ativo
// ----------------------------------------------------------------------------
export interface AtivoMro {
  /** campo: o campo de ordenação do IW38 (o mais usado nas ordens do equipamento); "" quando não há. */
  codigo: string; campo: string; nome: string; criticidade: string; area: string; local: string; situacao: string; desativado: boolean;
  pecas: PecaMro[]; emFalta: number; zeradas: number; mro: string;
}

type AtivoBase = Pick<LinhaAtivo, "codigo" | "equipamento" | "criticidade" | "area" | "localInstalacao" | "situacao">;

/** Campo de ordenação geral de cada equipamento. */
export { campoGeralPorEquipamento as camposPorEquipamento, campoGeralPorEquipamento } from "@/lib/wcm/util";

/** O que aparece no lugar do equipamento: o campo de ordenação (o código vai embaixo); sem campo, o código. */
export const rotuloAtivo = (a: { codigo: string; campo: string }) => a.campo || a.codigo;

/** Uma linha por ativo: Alta primeiro e, dentro da criticidade, quem tem mais peças em falta. */
export function linhasPorAtivo(inv: AtivoBase[], materiaisDe: (codigo: string) => string[], situacao: (material: string) => PecaMro,
  campoDe: (codigo: string) => string = () => ""): AtivoMro[] {
  const cache = new Map<string, PecaMro>();
  const sit = (m: string) => cache.get(m) ?? cache.set(m, situacao(m)).get(m)!;
  return inv.map((x): AtivoMro => {
    const pecas = [...new Set(materiaisDe(x.codigo))].map(sit);
    const emFalta = pecas.filter(emAlerta).length;
    return {
      codigo: x.codigo, campo: campoDe(x.codigo), nome: x.equipamento, criticidade: x.criticidade, area: x.area, local: x.localInstalacao, situacao: x.situacao,
      desativado: x.situacao === ativos.DESATIVADO, pecas, emFalta, zeradas: pecas.filter((p) => p.status === "zerado").length,
      mro: !pecas.length ? SEM_PECAS : emFalta ? COM_FALTA : EM_DIA,
    };
  }).sort((a, b) => ordemCrit(a.criticidade) - ordemCrit(b.criticidade) || b.emFalta - a.emFalta || b.pecas.length - a.pecas.length
    || (a.codigo < b.codigo ? -1 : a.codigo > b.codigo ? 1 : 0));
}

export interface FiltroAtivos { q: string; crits: string[]; areas: string[]; mro: string[]; desativados: boolean }

export function lerFiltroAtivos(p: Params): FiltroAtivos {
  return { q: param(p, "q"), crits: listaParam(p, "crit"), areas: listaParam(p, "area"), mro: listaParam(p, "smro"), desativados: param(p, "desat") === "1" };
}

export function filtrarAtivos(t: AtivoMro[], f: FiltroAtivos): AtivoMro[] {
  const termos = normalizarBusca(f.q).split(/\s+/).filter(Boolean);
  return t.filter((x) => {
    if (!f.desativados && x.desativado) return false;
    if (f.crits.length && !f.crits.includes(x.criticidade || SEM_CLASSE)) return false;
    if (f.areas.length && !f.areas.includes(x.area)) return false;
    if (f.mro.length && !f.mro.includes(x.mro)) return false;
    if (termos.length) {
      const hay = normalizarBusca([x.codigo, x.campo, x.nome, x.area, x.local, ...x.pecas.flatMap((p) => [p.codigo, p.descricao, p.sysmat, p.fabricanteRef])].join(" "));
      if (!termos.every((t) => hay.includes(t))) return false;
    }
    return true;
  });
}

// ----------------------------------------------------------------------------
// Por material (onde é usado)
// ----------------------------------------------------------------------------
export interface UsoAtivo { codigo: string; campo: string; nome: string; criticidade: string }
export interface MaterialMro extends PecaMro { ativos: UsoAtivo[]; nAlta: number }

/** Cada material vinculado com os ativos (não desativados) que o usam: em falta e de ativos Alta primeiro. */
export function linhasPorMaterial(t: AtivoMro[]): MaterialMro[] {
  const m = new Map<string, MaterialMro>();
  for (const a of t) {
    if (a.desativado) continue;
    for (const p of a.pecas) {
      const x = m.get(p.codigo) ?? m.set(p.codigo, { ...p, ativos: [], nAlta: 0 }).get(p.codigo)!;
      x.ativos.push({ codigo: a.codigo, campo: a.campo, nome: a.nome, criticidade: a.criticidade });
      if (a.criticidade === "Alta") x.nAlta++;
    }
  }
  const peso = { ausente: 0, zerado: 0, baixo: 1, ok: 2 } as const;
  return [...m.values()].sort((a, b) => peso[a.status] - peso[b.status] || b.nAlta - a.nAlta || b.ativos.length - a.ativos.length
    || (a.codigo < b.codigo ? -1 : 1));
}

export interface FiltroMateriais { q: string; falta: boolean; alta: boolean }

export function lerFiltroMateriais(p: Params): FiltroMateriais {
  return { q: param(p, "mq"), falta: param(p, "mfalta") === "1", alta: param(p, "malta") === "1" };
}

export function filtrarMateriais(t: MaterialMro[], f: FiltroMateriais): MaterialMro[] {
  const termos = normalizarBusca(f.q).split(/\s+/).filter(Boolean);
  return t.filter((x) => {
    if (f.falta && !emAlerta(x)) return false;
    if (f.alta && !x.nAlta) return false;
    if (termos.length) {
      const hay = normalizarBusca([x.codigo, x.descricao, x.sysmat, x.fabricanteRef, ...x.ativos.flatMap((a) => [a.codigo, a.campo, a.nome])].join(" "));
      if (!termos.every((t) => hay.includes(t))) return false;
    }
    return true;
  });
}

// ----------------------------------------------------------------------------
// Números do topo
// ----------------------------------------------------------------------------
export interface ResumoMro {
  ativos: number; comPecas: number; cobertura: number | null; alta: number; altaComPecas: number; coberturaAlta: number | null;
  materiais: number; materiaisEmFalta: number; criticosEmFalta: number; ativosComFalta: number;
}

/** Sobre os ativos não desativados. */
export function resumo(t: AtivoMro[]): ResumoMro {
  const vivos = t.filter((x) => !x.desativado);
  const alta = vivos.filter((x) => x.criticidade === "Alta");
  const pct = (a: number, b: number) => (b ? (a / b) * 100 : null);
  const mats = linhasPorMaterial(vivos);
  const comPecas = vivos.filter((x) => x.pecas.length).length, altaComPecas = alta.filter((x) => x.pecas.length).length;
  return {
    ativos: vivos.length, comPecas, cobertura: pct(comPecas, vivos.length), alta: alta.length, altaComPecas, coberturaAlta: pct(altaComPecas, alta.length),
    materiais: mats.length, materiaisEmFalta: mats.filter(emAlerta).length, criticosEmFalta: mats.filter((x) => emAlerta(x) && x.nAlta).length,
    ativosComFalta: vivos.filter((x) => x.emFalta).length,
  };
}

// ----------------------------------------------------------------------------
// Gravação do vínculo (cadastro_equipamentos.json, campo `materiais`)
// ----------------------------------------------------------------------------
const CODIGO = /^[\w.\-]+$/;

/** Códigos de material válidos, sem repetir (o mesmo limite do cadastro de equipamentos). */
export function limparCodigos(xs: unknown): string[] {
  if (!Array.isArray(xs)) return [];
  return [...new Set(xs.map((m) => String(m ?? "").trim().slice(0, 40)).filter((m) => CODIGO.test(m)))];
}

/** Lista final do ativo: a atual + as novas − as retiradas, na ordem em que foram vinculadas. */
export function novaLista(atual: unknown, adicionar: string[], remover: string[]): string[] {
  const fora = new Set(remover);
  return [...new Set([...limparCodigos(atual), ...adicionar])].filter((m) => !fora.has(m)).slice(0, MAX_PECAS);
}

const CAMPOS_SO_MRO = new Set(["materiais", MARCA_MRO, "atualizado_em", "atualizado_por"]);

/**
 * O item do ativo depois da alteração (calculado sobre o item relido na hora da gravação):
 * - fora do cadastro: cria o item só com as peças, marcado como criado pelo MRO — sem nome nem criticidade, que
 *   continuam vindo do SAP (IH08/IW38);
 * - no cadastro: troca só o campo `materiais`, sem tocar no resto;
 * - item criado pelo MRO que fica sem peças (e ninguém completou o cadastro dele): sai do cadastro.
 * `undefined` = nada a gravar.
 */
export function aplicarPecas(atual: Record<string, unknown> | undefined, adicionar: string[], remover: string[]): Record<string, unknown> | null | undefined {
  const lista = novaLista(atual?.materiais, adicionar, remover);
  if (!atual) return lista.length ? { materiais: lista, [MARCA_MRO]: true } : undefined;
  if (!lista.length && atual[MARCA_MRO] && Object.keys(atual).every((k) => CAMPOS_SO_MRO.has(k))) return null;
  const { materiais: _antes, ...resto } = atual;
  return lista.length ? { ...resto, materiais: lista } : resto;
}

// ----------------------------------------------------------------------------
// Planilhas
// ----------------------------------------------------------------------------
/** Uma linha por ativo × peça (ativo sem peça sai numa linha só). */
export function csvAtivos(t: AtivoMro[]): string {
  const linhas: unknown[][] = [];
  for (const a of t) {
    const base = [a.campo, a.codigo, a.nome, a.criticidade || SEM_CLASSE, a.area, a.local, a.situacao, a.mro];
    if (!a.pecas.length) linhas.push([...base, ...COLS_PECA.map(() => "")]);
    for (const p of a.pecas) linhas.push([...base, ...celulasPeca(p)]);
  }
  return csv(["Campo de ordenação", "Equipamento", "Nome", "Criticidade", "Área", "Local de instalação", "Situação do ativo", "Situação MRO", ...COLS_PECA], linhas);
}

export function csvMateriais(t: MaterialMro[]): string {
  return csv([...COLS_PECA, "Ativos que usam", "Ativos Alta", "Equipamentos"],
    t.map((x) => [...celulasPeca(x), x.ativos.length, x.nAlta, x.ativos.map(rotuloAtivo).join(", ")]));
}

const COLS_PECA = ["Material", "Descrição", "Estoque (MB52)", "UM", "Mínimo", "Valor em estoque (R$)", "Depósitos", "Situação da peça",
  "Código Sysmat", "Situação no Sysmat", "Fabricante / referência", "Categoria", "Substituto", "Descrição completa (Sysmat)"];
const celulasPeca = (p: PecaMro): unknown[] => [p.codigo, p.descricao, p.estoque ?? "", p.um, p.minimo ?? "", p.valor ?? "", p.depositos,
  TEXTO_STATUS[p.status], p.sysmat, p.cadastro, p.fabricanteRef, p.categoria, p.substituto, p.descrCompleta];

export const TEXTO_STATUS: Record<SituacaoPeca["status"], string> = {
  ok: "Em estoque", baixo: "Abaixo do mínimo", zerado: "Zerado", ausente: "Não encontrado no MB52/Sysmat",
};
