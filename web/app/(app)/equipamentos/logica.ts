import { normalizarBusca } from "@/lib/dados/texto";
import * as ativos from "@/lib/wcm/ativos";
import type { LinhaAtivo } from "@/lib/wcm/ativos";
import type { Equipamento, Nota, Ordem } from "@/lib/wcm/preparo";
import { paraData, partes, type Dia } from "@/lib/wcm/util";

/**
 * Regras puras da aba Equipamentos: filtros do inventário e
 * da análise, agregado por equipamento das ordens do IW38, situação das peças vinculadas e a validação do cadastro
 * (as chaves do `cadastro_equipamentos.json`). Testado em testes/equipamentos.test.ts.
 */

export const CRITICIDADES = ["Alta", "Média", "Baixa"];
export const CATEGORIAS = ["Mecânico", "Elétrico", "Instrumentação", "Hidráulico", "Pneumático", "Civil", "Utilidades", "Outro"];
export const SEM_CLASSE = "Sem classe";
export const NAO_CLASSIFICADO = "(não classificado)";
const PENDENTES = new Set(["Aberta", "Liberada", "Encerrada sem confirmação"]);
const POR_PAGINA = 50;
export const V_ATIVOS = "Gestão de ativos", V_CADASTRO = "Cadastro de equipamentos", V_ANALISE = "Análise pelas ordens (IW38)";
export const VISOES = [V_ATIVOS, V_CADASTRO, V_ANALISE];
/** Rótulo da coluna/campo com o campo de ordenação geral do equipamento (o mesmo do Calendário e da Gestão de MRO). */
export const ROTULO_CAMPO = "Campo de ordenação";
/** Padrão de `campoEq`: sem a função, não há coluna de campo (as planilhas e buscas seguem como antes). */
const semCampo = (_codigo: string): string => "";
export type CampoEq = (codigo: string) => string;

export type Params = Record<string, string | string[] | undefined>;

// ----------------------------------------------------------------------------
// Utilidades de endereço, paginação e exportação
// ----------------------------------------------------------------------------
export const param = (p: Params, k: string): string => {
  const v = p[k];
  return (Array.isArray(v) ? v[0] : v ?? "").trim();
};
export const listaParam = (p: Params, k: string): string[] =>
  param(p, k).split(",").map((x) => x.trim()).filter((x) => x && x !== "-").slice(0, 60);

interface Pagina<T> { itens: T[]; pag: number; paginas: number; total: number; inicio: number }

export function paginar<T>(xs: T[], pag: number, tamanho = POR_PAGINA): Pagina<T> {
  const paginas = Math.max(1, Math.ceil(xs.length / tamanho));
  const p = Math.min(Math.max(1, Math.floor(pag) || 1), paginas);
  const inicio = (p - 1) * tamanho;
  return { itens: xs.slice(inicio, inicio + tamanho), pag: p, paginas, total: xs.length, inicio };
}

/** CSV que o Excel em português abre direto (BOM, ponto e vírgula, vírgula decimal). */
export function csv(colunas: string[], linhas: unknown[][]): string {
  const cel = (v: unknown): string => {
    let s: string;
    if (v == null || (typeof v === "number" && Number.isNaN(v))) s = "";
    else if (typeof v === "number") s = String(Math.round(v * 100) / 100).replace(".", ",");
    else if (typeof v === "boolean") s = v ? "Sim" : "Não";
    else s = String(v);
    // fórmula injetada (=, +, -, @ no começo) vira texto
    if (/^[=+\-@]/.test(s) && typeof v !== "number") s = `'${s}`;
    return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return "﻿" + [colunas, ...linhas].map((l) => l.map(cel).join(";")).join("\r\n");
}

/** Dia → "dd/mm/aaaa" para a planilha. */
export function dataCsv(d: Dia | null | undefined): string {
  if (d == null) return "";
  const p = partes(d);
  return `${String(p.dia).padStart(2, "0")}/${String(p.mes).padStart(2, "0")}/${p.ano}`;
}

export { hashTexto } from "@/lib/wcm/util";

// ----------------------------------------------------------------------------
// Inventário (Gestão de ativos)
// ----------------------------------------------------------------------------
interface FiltroInventario {
  q: string; areas: string[]; crits: string[]; sits: string[]; recs: string[]; semPlano: boolean; site: boolean;
}

export function lerFiltroInventario(p: Params): FiltroInventario {
  return { q: param(p, "iq"), areas: listaParam(p, "iarea"), crits: listaParam(p, "icrit"), sits: listaParam(p, "isit"),
    recs: listaParam(p, "irec"), semPlano: param(p, "iplano") === "1", site: param(p, "isite") === "1" };
}

export function filtrarInventario(t: LinhaAtivo[], f: FiltroInventario, campoEq: CampoEq = semCampo): LinhaAtivo[] {
  const termos = normalizarBusca(f.q).split(/\s+/).filter(Boolean);
  return t.filter((x) => {
    if (f.areas.length && !f.areas.includes(x.area)) return false;
    if (f.crits.length && !f.crits.includes(x.criticidade || SEM_CLASSE)) return false;
    if (f.sits.length ? !f.sits.includes(x.situacao) : x.situacao === ativos.DESATIVADO) return false;
    if (f.recs.length && !f.recs.includes(x.recomendacao)) return false;
    if (f.semPlano && x.cobertoPorPlano) return false;
    if (f.site && x.origem === "SAP") return false;
    if (termos.length) {
      const hay = normalizarBusca([x.codigo, x.equipamento, x.localInstalacao, x.area, x.fabricante, x.modelo, x.serie, campoEq(x.codigo)].join(" "));
      if (!termos.every((t) => hay.includes(t))) return false;
    }
    return true;
  });
}

/** Colunas da planilha do inventário (a ordem da tabela, com o ciclo de vida inteiro). */
export function csvInventario(t: LinhaAtivo[], campoEq: CampoEq = semCampo): string {
  const com = campoEq !== semCampo;
  // o campo de ordenação vem IMEDIATAMENTE ANTES do código
  const cols: [keyof LinhaAtivo | null, string][] = ativos.COLUNAS.flatMap(([k, r]): [keyof LinhaAtivo | null, string][] =>
    (k === "codigo" && com ? [[null, ROTULO_CAMPO], [k, r]] : [[k, r]]));
  return csv(cols.map(([, r]) => r), t.map((x) => cols.map(([k]) => (k == null ? campoEq(x.codigo) : k === "garantiaAte" ? dataCsv(x.garantiaAte) : x[k]))));
}

// ----------------------------------------------------------------------------
// Peças vinculadas: situação no estoque (a regra da página Estoque)
// ----------------------------------------------------------------------------
export type StatusPeca = "ok" | "baixo" | "zerado" | "ausente";
export interface SituacaoPeca { codigo: string; descricao: string; status: StatusPeca; texto: string; estoque: number | null; minimo: number | null }

const n0 = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 });

export function situacaoPeca(codigo: string, estoque: Map<string, { descricao: string; estoque: number }> | null,
  cadMat: Record<string, unknown>): SituacaoPeca {
  const it = estoque?.get(codigo);
  const info = cadMat[codigo];
  const mBruto = info && typeof info === "object" ? Number((info as Record<string, unknown>).minimo) : NaN;
  const minimo = Number.isFinite(mBruto) && mBruto > 0 ? mBruto : null;
  if (!it) return { codigo, descricao: "", status: "ausente", texto: "não encontrado na base de material atual", estoque: null, minimo };
  const q = it.estoque;
  const texto = `estoque: ${n0.format(q)}`;
  if (q <= 0) return { codigo, descricao: it.descricao, status: "zerado", texto, estoque: q, minimo };
  if (minimo && q < minimo) return { codigo, descricao: it.descricao, status: "baixo", texto: `${texto} · mín. ${n0.format(minimo)}`, estoque: q, minimo };
  return { codigo, descricao: it.descricao, status: "ok", texto, estoque: q, minimo };
}

export const pecasEmAlerta = (xs: SituacaoPeca[]) => xs.filter((x) => x.status !== "ok").length;

// ----------------------------------------------------------------------------
// Análise pelas ordens (IW38): uma linha por equipamento
// ----------------------------------------------------------------------------
interface LinhaAnalise {
  codigo: string; nome: string; criticidade: string; abc: string; categoria: string; local: string; centro: string;
  ordens: number; backlog: number; custo: number; pendentes: number; notas: number | null; notasSemOrdem: number | null;
  quebras: number | null; ultima: Dia | null; pecas: number; pecasEmFalta: number; desativado: boolean;
}

type OrdemA = Pick<Ordem, "equipChave" | "objeto" | "local" | "centroTrabalho" | "situacao" | "data" | "comPlano" | "custoReal">;
type NotaA = Pick<Nota, "equipChave" | "quebra" | "comOrdem">;
type EquipA = Pick<Equipamento, "equipamento" | "denominacao" | "codigoAbc" | "desativado">;

function moda(m: Map<string, number>): string {
  let melhor = "", n = -1;
  for (const [v, c] of m) if (c > n || (c === n && v < melhor)) { melhor = v; n = c; }
  return melhor;
}

/**
 * Agregado da visão "Análise": nome, local e centro mais frequentes, pendentes e última ordem (todas as datas do
 * recorte); ordens, backlog (sem plano) e custo no período. Entram também os equipamentos do cadastro do site sem ordem
 * e o `extra` (o equipamento aberto na ficha, mesmo só no IH08).
 */
export function agregarAnalise(todas: OrdemA[], ini: Dia, fim: Dia, e: {
  cadEq: Record<string, unknown>; equip: EquipA[] | null; notas: NotaA[] | null; pecas?: (codigo: string) => SituacaoPeca[]; extra?: string;
}): LinhaAnalise[] {
  interface Acc { nome: string; locais: Map<string, number>; centros: Map<string, number>; pendentes: number; ultima: Dia | null;
    ordens: number; backlog: number; custo: number }
  const acc = new Map<string, Acc>();
  for (const o of todas) {
    if (!o.equipChave) continue;
    let a = acc.get(o.equipChave);
    if (!a) acc.set(o.equipChave, (a = { nome: o.objeto, locais: new Map(), centros: new Map(), pendentes: 0, ultima: null, ordens: 0, backlog: 0, custo: 0 }));
    if (o.local) a.locais.set(o.local, (a.locais.get(o.local) ?? 0) + 1);
    if (o.centroTrabalho) a.centros.set(o.centroTrabalho, (a.centros.get(o.centroTrabalho) ?? 0) + 1);
    if (PENDENTES.has(o.situacao)) a.pendentes++;
    if (o.data != null && (a.ultima == null || o.data > a.ultima)) a.ultima = o.data;
    if (o.data != null && o.data >= ini && o.data <= fim) {
      a.ordens++;
      if (!o.comPlano) a.backlog++;
      if (!Number.isNaN(o.custoReal)) a.custo += o.custoReal;
    }
  }
  const ref = new Map<string, EquipA>();
  for (const x of e.equip ?? []) if (!ref.has(x.equipamento)) ref.set(x.equipamento, x);
  const cad = (k: string): Record<string, unknown> => {
    const v = e.cadEq[k];
    return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
  };
  const chaves = [...acc.keys()];
  for (const k of [...Object.keys(e.cadEq), e.extra ?? ""]) if (k && !acc.has(k) && (k in e.cadEq || ref.has(k))) chaves.push(k);
  const notas = e.notas ? new Map<string, { n: number; q: number; sem: number }>() : null;
  for (const n of e.notas ?? []) {
    const m = notas!.get(n.equipChave) ?? { n: 0, q: 0, sem: 0 };
    m.n++; if (n.quebra) m.q++; if (!n.comOrdem) m.sem++;
    notas!.set(n.equipChave, m);
  }
  const vistos = new Set<string>();
  const out: LinhaAnalise[] = [];
  for (const k of chaves) {
    if (vistos.has(k)) continue;
    vistos.add(k);
    const a = acc.get(k), eq = ref.get(k), info = cad(k);
    const abc = (eq?.codigoAbc ?? "").toUpperCase().trim();
    const mats = Array.isArray(info.materiais) ? [...new Set(info.materiais.map(String))] : [];
    const pc = e.pecas ? e.pecas(k) : [];
    const nt = notas?.get(k);
    out.push({
      codigo: k, nome: (a ? a.nome || eq?.denominacao : String(info.nome || "") || eq?.denominacao) || "",
      criticidade: String(info.criticidade || "") || ativos.ABC_PARA_CRITICIDADE[abc] || "", abc,
      categoria: String(info.categoria ?? ""), local: a ? moda(a.locais) : "", centro: a ? moda(a.centros) : "",
      ordens: a?.ordens ?? 0, backlog: a?.backlog ?? 0, custo: a?.custo ?? 0, pendentes: a?.pendentes ?? 0,
      notas: notas ? nt?.n ?? 0 : null, notasSemOrdem: notas ? nt?.sem ?? 0 : null, quebras: notas ? nt?.q ?? 0 : null,
      ultima: a?.ultima ?? null, pecas: mats.length, pecasEmFalta: pecasEmAlerta(pc), desativado: !!eq?.desativado,
    });
  }
  return out;
}

interface FiltroAnalise { q: string; crits: string[]; pend: boolean; periodo: boolean }

export function lerFiltroAnalise(p: Params): FiltroAnalise {
  return { q: param(p, "aq"), crits: listaParam(p, "acrit"), pend: param(p, "apend") === "1", periodo: param(p, "aper") !== "0" };
}

export function filtrarAnalise(t: LinhaAnalise[], f: FiltroAnalise, campoEq: CampoEq = semCampo): LinhaAnalise[] {
  const termos = normalizarBusca(f.q).split(/\s+/).filter(Boolean);
  return t.filter((x) => {
    if (f.crits.length && !f.crits.includes(x.criticidade || NAO_CLASSIFICADO)) return false;
    if (f.pend && !(x.pendentes > 0)) return false;
    if (f.periodo && !(x.ordens > 0)) return false;
    if (termos.length) {
      const hay = normalizarBusca(`${x.codigo} ${x.nome} ${x.local} ${campoEq(x.codigo)}`);
      if (!termos.every((t) => hay.includes(t))) return false;
    }
    return true;
  }).sort((a, b) => b.custo - a.custo || b.ordens - a.ordens);
}

const COLUNAS_ANALISE: [keyof LinhaAnalise, string][] = [
  ["codigo", "Código"], ["nome", "Nome"], ["criticidade", "Criticidade"], ["abc", "ABC"], ["categoria", "Categoria"],
  ["local", "Local"], ["centro", "Centro"], ["ordens", "Ordens no período"], ["backlog", "Backlog"], ["custo", "Custo no período (R$)"],
  ["pendentes", "Pendentes"], ["notas", "Notas"], ["notasSemOrdem", "Notas sem ordem"], ["quebras", "Quebras"],
  ["ultima", "Última ordem"], ["pecas", "Peças"], ["pecasEmFalta", "Peças em falta"],
];

export function csvAnalise(t: LinhaAnalise[], campoEq: CampoEq = semCampo): string {
  const cols = COLUNAS_ANALISE.filter(([k]) => !(["notas", "notasSemOrdem", "quebras"].includes(k) && t.every((x) => x[k] == null)));
  const com = campoEq !== semCampo;
  // o campo de ordenação vem IMEDIATAMENTE ANTES do código
  const todas: [keyof LinhaAnalise | null, string][] = cols.flatMap(([k, r]): [keyof LinhaAnalise | null, string][] =>
    (k === "codigo" && com ? [[null, ROTULO_CAMPO], [k, r]] : [[k, r]]));
  return csv(todas.map(([, r]) => r), t.map((x) => todas.map(([k]) => (k == null ? campoEq(x.codigo) : k === "ultima" ? dataCsv(x.ultima) : x[k]))));
}

/** Média de dias entre uma ordem de backlog (sem plano) e a seguinte — aproxima o MTBF. */
export function intervaloMedio(datas: Dia[]): number | null {
  const d = [...datas].sort((a, b) => a - b);
  if (d.length < 2) return null;
  return (d[d.length - 1] - d[0]) / (d.length - 1);
}

// ----------------------------------------------------------------------------
// Cadastro de equipamentos: validação do formulário → item do JSON
// ----------------------------------------------------------------------------
export interface FormCadastro {
  tag: string; nome: string; categoria: string; criticidade: string; observacoes: string; materiais: string[];
  situacao: string; fabricante: string; modelo: string; serie: string; ano_instalacao: number | string | null;
  vida_util: number | string | null; garantia_ate: string | null; valor_reposicao: number | string | null;
}

interface ItemCadastro {
  nome: string; categoria: string; criticidade: string; observacoes: string; materiais: string[]; situacao: string;
  fabricante: string; modelo: string; serie: string; ano_instalacao: number | null; vida_util: number | null;
  garantia_ate: string | null; valor_reposicao: number | null;
}

const vazio = (v: unknown) => v == null || (typeof v === "string" && !v.trim());
const corta = (v: unknown, n: number) => String(v ?? "").trim().slice(0, n);

/** Valida o formulário; devolve a TAG (maiúscula) e o item, ou o erro em português. */
export function validarCadastro(f: Partial<FormCadastro>, anoHoje: number): { erro: string } | { tag: string; item: ItemCadastro } {
  const tag = corta(f.tag, 60).toUpperCase();
  const nome = corta(f.nome, 160);
  if (!tag || !nome) return { erro: "Preencha a TAG e o nome do equipamento." };
  if (/[\u0000-\u001f]/.test(tag)) return { erro: "A TAG tem caracteres inválidos." };
  const categoria = CATEGORIAS.includes(String(f.categoria)) ? String(f.categoria) : CATEGORIAS[0];
  const criticidade = CRITICIDADES.includes(String(f.criticidade)) ? String(f.criticidade) : "Média";
  const situacao = ativos.SITUACOES.includes(String(f.situacao)) ? String(f.situacao) : ativos.OPERACAO;
  let ano: number | null = null, vida: number | null = null, valor: number | null = null, garantia: string | null = null;
  if (!vazio(f.ano_instalacao)) {
    ano = Number(f.ano_instalacao);
    if (!Number.isInteger(ano) || ano < 1900 || ano > anoHoje) return { erro: `Ano de instalação entre 1900 e ${anoHoje}.` };
  }
  if (!vazio(f.vida_util)) {
    vida = Number(f.vida_util);
    if (!Number.isInteger(vida) || vida < 1 || vida > 100) return { erro: "Vida útil entre 1 e 100 anos." };
  }
  if (!vazio(f.valor_reposicao)) {
    valor = Number(String(f.valor_reposicao).replace(",", "."));
    if (!Number.isFinite(valor) || valor < 0 || valor > 1e11) return { erro: "Valor de reposição inválido." };
    valor = Math.round(valor * 100) / 100;
  }
  if (!vazio(f.garantia_ate)) {
    const s = String(f.garantia_ate).trim().slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || paraData(s) == null) return { erro: "Data da garantia inválida." };
    garantia = s;
  }
  const materiais = [...new Set((Array.isArray(f.materiais) ? f.materiais : []).map((m) => corta(m, 40)).filter((m) => /^[\w.\-]+$/.test(m)))].slice(0, 300);
  return { tag, item: {
    nome, categoria, criticidade, observacoes: corta(f.observacoes, 2000), materiais, situacao,
    fabricante: corta(f.fabricante, 80), modelo: corta(f.modelo, 80), serie: corta(f.serie, 60),
    ano_instalacao: ano, vida_util: vida, garantia_ate: garantia, valor_reposicao: valor,
  } };
}

/** Valores iniciais do formulário (editar o cadastrado, ou cadastrar a partir do SAP com nome e criticidade do ABC). */
export function formInicial(tag: string, info: Record<string, unknown> | null | undefined, sap?: { nome: string; abc: string; desativado: boolean } | null): FormCadastro {
  const i = info ?? {};
  const num = (v: unknown) => { const x = Number(v); return v != null && v !== "" && Number.isFinite(x) && x > 0 ? x : null; };
  const ano = num(i.ano_instalacao), vida = num(i.vida_util);
  const gar = i.garantia_ate ? paraData(i.garantia_ate) : null;
  let garantia: string | null = null;
  if (gar != null) { const p = partes(gar); garantia = `${p.ano}-${String(p.mes).padStart(2, "0")}-${String(p.dia).padStart(2, "0")}`; }
  return {
    tag, nome: String(i.nome || "") || sap?.nome || "",
    categoria: CATEGORIAS.includes(String(i.categoria)) ? String(i.categoria) : CATEGORIAS[0],
    criticidade: CRITICIDADES.includes(String(i.criticidade)) ? String(i.criticidade) : ativos.ABC_PARA_CRITICIDADE[sap?.abc?.toUpperCase().trim() ?? ""] ?? "Média",
    observacoes: String(i.observacoes ?? ""),
    situacao: ativos.SITUACOES.includes(String(i.situacao)) ? String(i.situacao) : sap?.desativado ? ativos.DESATIVADO : ativos.OPERACAO,
    fabricante: String(i.fabricante ?? ""), modelo: String(i.modelo ?? ""), serie: String(i.serie ?? ""),
    ano_instalacao: ano != null ? Math.trunc(ano) : null, vida_util: vida != null ? Math.trunc(vida) : null,
    garantia_ate: garantia, valor_reposicao: num(i.valor_reposicao),
    materiais: [...new Set((Array.isArray(i.materiais) ? i.materiais : []).map(String))],
  };
}

// ----------------------------------------------------------------------------
// Lista do cadastro (visão "Cadastro de equipamentos")
// ----------------------------------------------------------------------------
interface FiltroCadastro { q: string; crits: string[] }

export function lerFiltroCadastro(p: Params): FiltroCadastro {
  return { q: param(p, "cq"), crits: listaParam(p, "ccrit") };
}

/** Itens do cadastro em ordem de TAG, pela busca (TAG, nome, códigos e descrições dos componentes) e criticidade. */
export function filtrarCadastro(cad: Record<string, unknown>, f: FiltroCadastro, descricao: (material: string) => string = () => "", campoEq: CampoEq = semCampo):
  [string, Record<string, unknown>][] {
  const termos = normalizarBusca(f.q).split(/\s+/).filter(Boolean);
  return Object.entries(cad)
    .filter((e): e is [string, Record<string, unknown>] => !!e[1] && typeof e[1] === "object" && !Array.isArray(e[1]))
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .filter(([k, v]) => {
      if (f.crits.length && !f.crits.includes(String(v.criticidade ?? ""))) return false;
      if (!termos.length) return true;
      const mats = Array.isArray(v.materiais) ? v.materiais.map(String) : [];
      const hay = normalizarBusca([k, String(v.nome ?? ""), ...mats, ...mats.map(descricao), campoEq(k)].join(" "));
      return termos.every((t) => hay.includes(t));
    });
}
