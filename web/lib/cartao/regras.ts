/**
 * Gestão de compras no cartão de crédito — só as regras (sem gravar nada); a gravação fica em lib/cartao/dados.ts.
 *
 * - Um bloco por portador do cartão (pessoa ligada a um usuário do site). O portador lança os próprios gastos e
 *   anexa o cupom fiscal (PDF ou foto); quem confere (Líder, Analista, administrador) vê todos os blocos.
 * - Gasto nasce "Lançado"; quem confere marca "Conferido" ou "Recusado" (com motivo). Só o lançado pode ser editado
 *   ou excluído, pelo portador. Mês fechado (pela data da compra) não aceita mais nada.
 * - Cadastro `cartao_credito.json`: { <id do bloco>: Bloco, "_meses": { fechados: ["2026-10", …] } }; cupons em
 *   `app/documentos/cartao/<bloco>/<gasto>` (repositório de dados, privado).
 * Testado em testes/cartao.test.ts.
 */

export const ARQ_CARTAO = "cartao_credito.json";
export const CHAVE_MESES = "_meses";
export const LANCADO = "Lançado", CONFERIDO = "Conferido", RECUSADO = "Recusado";
export const STATUS = [LANCADO, CONFERIDO, RECUSADO] as const;
export type StatusGasto = (typeof STATUS)[number];
export const CATEGORIAS = ["Peças / material", "Serviço", "Ferramenta", "Combustível / transporte", "Alimentação", "Outros"] as const;
export const MAX_GASTOS_POR_BLOCO = 3000;
export const VALOR_MAXIMO = 1_000_000;

/** `arquivo` = id do arquivo guardado (troca de cupom grava num arquivo novo; vazio = o id do próprio gasto) */
export interface Cupom { nome: string; tipo: string; tamanho: number; arquivo?: string }
export interface Gasto {
  id: string;
  /** data da compra, aaaa-mm-dd */
  data: string;
  valor: number; estabelecimento: string; descricao: string; categoria: string;
  /** nº do cupom ou da nota fiscal */
  documento: string; ordem: string; centroCusto: string;
  cupom?: Cupom;
  status: StatusGasto; motivo?: string;
  em: string; por: string;
  conferidoEm?: string; conferidoPor?: string;
}
export interface Bloco { id: string; nome: string; login: string; ativo: boolean; criadoEm: string; gastos: Gasto[] }

// ----------------------------------------------------------------------------
// Leitura segura do cadastro
// ----------------------------------------------------------------------------
const txt = (v: unknown, max = 200) => String(v ?? "").replace(/[\u0000-\u001f]+/g, " ").trim().slice(0, max);
const ehData = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T12:00:00Z`))
  && new Date(`${s}T12:00:00Z`).toISOString().slice(0, 10) === s;
export const idValido = (s: unknown): s is string => typeof s === "string" && /^[a-z0-9]{6,32}$/.test(s);

function gastoDe(x: unknown): Gasto | null {
  if (!x || typeof x !== "object") return null;
  const g = x as Record<string, unknown>;
  const valor = Number(g.valor);
  if (!idValido(g.id) || !ehData(txt(g.data, 10)) || !Number.isFinite(valor)) return null;
  const status = STATUS.includes(g.status as StatusGasto) ? (g.status as StatusGasto) : LANCADO;
  const c = g.cupom as Record<string, unknown> | undefined;
  return {
    id: g.id, data: txt(g.data, 10), valor, estabelecimento: txt(g.estabelecimento, 120), descricao: txt(g.descricao, 300),
    categoria: txt(g.categoria, 40) || "Outros", documento: txt(g.documento, 40), ordem: txt(g.ordem, 20), centroCusto: txt(g.centroCusto, 20),
    ...(c && typeof c === "object" && txt(c.tipo) ? { cupom: { nome: txt(c.nome, 120) || "cupom", tipo: txt(c.tipo, 40), tamanho: Number(c.tamanho) || 0,
      ...(idValido(c.arquivo) ? { arquivo: c.arquivo } : {}) } } : {}),
    status, ...(g.motivo ? { motivo: txt(g.motivo, 300) } : {}), em: txt(g.em, 40), por: txt(g.por, 80),
    ...(g.conferidoEm ? { conferidoEm: txt(g.conferidoEm, 40), conferidoPor: txt(g.conferidoPor, 80) } : {}),
  };
}

/** Um bloco do cadastro (null se a forma não vale). */
export function blocoDe(id: string, v: unknown): Bloco | null {
  if (!idValido(id) || !v || typeof v !== "object") return null;
  const b = v as Record<string, unknown>;
  const nome = txt(b.nome, 80), login = txt(b.login, 40);
  if (!nome || !login) return null;
  const gastos = (Array.isArray(b.gastos) ? b.gastos : []).map(gastoDe).filter((g): g is Gasto => g != null);
  return { id, nome, login, ativo: b.ativo !== false, criadoEm: txt(b.criadoEm, 40), gastos };
}

/** O que vai para o cadastro (a chave já é o id). */
export const paraGravar = (b: Bloco): Record<string, unknown> =>
  ({ nome: b.nome, login: b.login, ativo: b.ativo, criadoEm: b.criadoEm, gastos: b.gastos });

/** Os blocos do cadastro (só os de forma válida), por nome. */
export function blocosDe(cad: Record<string, unknown>): Bloco[] {
  return Object.entries(cad).filter(([k]) => k !== CHAVE_MESES).map(([id, v]) => blocoDe(id, v)).filter((b): b is Bloco => b != null)
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
}

export function mesesFechados(cad: Record<string, unknown>): Set<string> {
  const m = cad[CHAVE_MESES] as { fechados?: unknown } | undefined;
  return new Set(Array.isArray(m?.fechados) ? m!.fechados.map(String).filter((x) => /^\d{4}-\d{2}$/.test(x)) : []);
}

// ----------------------------------------------------------------------------
// Quem pode o quê
// ----------------------------------------------------------------------------
/** "AAAA-MM" de uma data aaaa-mm-dd. */
export const mesDe = (data: string) => data.slice(0, 7);

export interface Papel { confere: boolean; login: string }
export const ehPortador = (p: Papel, b: Bloco) => b.login.toLowerCase() === p.login.toLowerCase();
/** Blocos que a pessoa vê: todos para quem confere; o próprio para o portador. */
export const blocosVisiveis = (p: Papel, bs: Bloco[]) => (p.confere ? bs : bs.filter((b) => ehPortador(p, b)));

/** Por que não dá para lançar, editar ou excluir o gasto ("" = pode). */
export function bloqueioDeEdicao(p: Papel, b: Bloco, g: Pick<Gasto, "data" | "status"> | null, fechados: Set<string>, mesNovo?: string): string {
  if (!ehPortador(p, b)) return "Só o portador do cartão lança e altera os próprios gastos.";
  if (!b.ativo) return "Este bloco está desativado.";
  if (g && g.status !== LANCADO) return `Gasto já ${g.status.toLowerCase()}: não pode mais ser alterado.`;
  if (g && fechados.has(mesDe(g.data))) return `O mês ${rotuloMes(mesDe(g.data))} está fechado.`;
  if (mesNovo && fechados.has(mesNovo)) return `O mês ${rotuloMes(mesNovo)} está fechado.`;
  return "";
}

/** Por que não dá para conferir/recusar ("" = pode). */
export function bloqueioDeConferencia(p: Papel, g: Pick<Gasto, "data">, fechados: Set<string>, b?: Bloco): string {
  if (!p.confere) return "Só Líder, Analista ou administrador conferem os gastos.";
  // segregação de funções: ninguém confere o próprio gasto
  if (b && ehPortador(p, b)) return "Os seus gastos são conferidos por outra pessoa.";
  if (fechados.has(mesDe(g.data))) return `O mês ${rotuloMes(mesDe(g.data))} está fechado.`;
  return "";
}

// ----------------------------------------------------------------------------
// Validação do lançamento
// ----------------------------------------------------------------------------
export interface EntradaGasto {
  data?: unknown; valor?: unknown; estabelecimento?: unknown; descricao?: unknown; categoria?: unknown;
  documento?: unknown; ordem?: unknown; centroCusto?: unknown;
}
type CamposGasto = Pick<Gasto, "data" | "valor" | "estabelecimento" | "descricao" | "categoria" | "documento" | "ordem" | "centroCusto">;

/** "1.234,56", "1234.56" ou "R$ 89,90" → número (NaN se não der). */
export function valorDe(v: unknown): number {
  if (typeof v === "number") return v;
  let s = String(v ?? "").replace(/R\$|\s/gi, "");
  if (!s) return NaN;
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  return /^-?\d+(\.\d+)?$/.test(s) ? Number(s) : NaN;
}

export function validarGasto(e: EntradaGasto, hoje: string): { campos: CamposGasto } | { erro: string } {
  const data = txt(e.data, 10);
  if (!ehData(data)) return { erro: "Informe a data da compra." };
  if (data > hoje) return { erro: "A data da compra não pode ser no futuro." };
  if (data < "2000-01-01") return { erro: "Data da compra inválida." };
  const valor = Math.round(valorDe(e.valor) * 100) / 100;
  if (!Number.isFinite(valor) || valor <= 0) return { erro: "Informe o valor (maior que zero)." };
  if (valor > VALOR_MAXIMO) return { erro: "Valor alto demais: confira o número." };
  const estabelecimento = txt(e.estabelecimento, 120), descricao = txt(e.descricao, 300);
  if (!estabelecimento) return { erro: "Informe o estabelecimento." };
  if (!descricao) return { erro: "Descreva o que foi comprado." };
  const categoria = txt(e.categoria, 40);
  if (!(CATEGORIAS as readonly string[]).includes(categoria)) return { erro: "Escolha a categoria." };
  const ordem = txt(e.ordem, 20).replace(/\s/g, "");
  if (ordem && !/^\d{5,12}$/.test(ordem)) return { erro: "Ordem de manutenção: só números (ex.: 32220059)." };
  return { campos: { data, valor, estabelecimento, descricao, categoria, documento: txt(e.documento, 40), ordem, centroCusto: txt(e.centroCusto, 20).toUpperCase() } };
}

// ----------------------------------------------------------------------------
// Resumos
// ----------------------------------------------------------------------------
const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
export const rotuloMes = (m: string) => `${MESES[Number(m.slice(5, 7)) - 1] ?? "?"}/${m.slice(0, 4)}`;

export interface ResumoBloco {
  total: number; gastos: number; lancados: number; conferidos: number; recusados: number; semCupom: number;
  /** soma dos não recusados */
  valido: number;
}
export function resumo(gs: Gasto[]): ResumoBloco {
  const r: ResumoBloco = { total: 0, gastos: gs.length, lancados: 0, conferidos: 0, recusados: 0, semCupom: 0, valido: 0 };
  for (const g of gs) {
    r.total += g.valor;
    if (g.status === LANCADO) r.lancados++;
    else if (g.status === CONFERIDO) r.conferidos++;
    else r.recusados++;
    if (g.status !== RECUSADO) r.valido += g.valor;
    if (!g.cupom && g.status !== RECUSADO) r.semCupom++;
  }
  r.total = Math.round(r.total * 100) / 100;
  r.valido = Math.round(r.valido * 100) / 100;
  return r;
}

export const doMes = (gs: Gasto[], mes: string) => gs.filter((g) => mesDe(g.data) === mes)
  .sort((a, b) => b.data.localeCompare(a.data) || b.em.localeCompare(a.em));

/** Valor (não recusado) por categoria, do maior para o menor. */
export function porCategoria(gs: Gasto[]): [string, number][] {
  const m = new Map<string, number>();
  for (const g of gs) if (g.status !== RECUSADO) m.set(g.categoria, (m.get(g.categoria) ?? 0) + g.valor);
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
}

/** Meses com gasto (mais recente primeiro), sempre com o mês atual. */
export function mesesComGasto(bs: Bloco[], mesAtual: string): string[] {
  return [...new Set([mesAtual, ...bs.flatMap((b) => b.gastos.map((g) => mesDe(g.data)))])].sort().reverse();
}

/** Planilha (CSV, ; e BOM para o Excel) dos gastos do mês dos blocos visíveis. */
export function csvMes(bs: Bloco[], mes: string): string {
  const esc = (v: string) => `"${v.replaceAll('"', '""')}"`;
  const cab = ["Portador", "Data", "Valor", "Estabelecimento", "Descrição", "Categoria", "Nº cupom/NF", "Ordem", "Centro de custo",
    "Cupom anexado", "Status", "Motivo", "Lançado por", "Conferido por"];
  const linhas = bs.flatMap((b) => doMes(b.gastos, mes).map((g) => [b.nome, g.data.split("-").reverse().join("/"),
    g.valor.toFixed(2).replace(".", ","), g.estabelecimento, g.descricao, g.categoria, g.documento, g.ordem, g.centroCusto,
    g.cupom ? "sim" : "não", g.status, g.motivo ?? "", g.por, g.conferidoPor ?? ""]));
  // texto que começa com = + - @ vira fórmula no Excel: neutraliza
  const seguro = (v: string) => (/^[=+\-@]/.test(v) ? `'${v}` : v);
  return "﻿" + [cab, ...linhas].map((l) => l.map((v) => esc(seguro(v))).join(";")).join("\r\n");
}
