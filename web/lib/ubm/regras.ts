/**
 * UBM (Unidade Básica de Manutenção: armário kanban em campo com itens do Almox) — só as regras, sem gravar nada; a gravação
 * fica em lib/ubm/dados.ts. Spec: docs/superpowers/specs/2026-11-22-ubm-design.md. Testado em testes/ubm.test.ts.
 *
 * - Cadastro `ubm_armarios.json`: { <id do armário, ex. UBM-01>: Armario sem o id } com o kit (código, UM, mínimo, padrão).
 * - Cadastros `ubm_movimentos_<AAAA-MM>.json` (um por mês de Brasília do movimento): { <id>: Movimento sem o id } —
 *   retirada, solicitação, reposição e contagem. A leitura junta todos os meses (o saldo precisa desde a última contagem).
 * - Retirada: só a confirmada pelo líder na validação da IW13 (lib/ubm/validacao.ts, origem "validacao"); as antigas
 *   do QR de retirada (desativado em 22/11/2026, origem "qr") continuam lidas no saldo e no histórico.
 * - Código nunca trava a solicitação: só o formato é conferido; a IW38 e o catálogo do Sysmat servem para mostrar a
 *   descrição e para a análise (a associação é feita na leitura, nunca gravada).
 * - Saldo por armário e item: a contagem fixa o saldo naquele momento; depois soma as reposições e tira as retiradas.
 */
import { somarValores, valorDe, type Precos } from "../dados/custoMaterial";

export const ARQ_ARMARIOS = "ubm_armarios.json";
/** Prefixo dos cadastros mensais de movimentos: `ubm_movimentos_<AAAA-MM>.json`. */
export const PREFIXO_MOVIMENTOS = "ubm_movimentos_";
export const FUSO = "America/Sao_Paulo";
const formatoDia = new Intl.DateTimeFormat("en-CA", { timeZone: FUSO });
/** Dia de Brasília (AAAA-MM-DD) de um instante ISO ("" se inválido). */
export function diaBr(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : formatoDia.format(d);
}
/** Cadastro do mês (de Brasília) do movimento. */
export const arquivoMovimentos = (iso: string) => `${PREFIXO_MOVIMENTOS}${(diaBr(iso) || diaBr(new Date().toISOString())).slice(0, 7)}.json`;
/** O nome é de um cadastro mensal de movimentos? */
export const ehArquivoMovimentos = (nome: string) => new RegExp(`^${PREFIXO_MOVIMENTOS}\\d{4}-\\d{2}\\.json$`).test(nome);
export const TIPOS_SOLICITACAO = {
  acabou: "Item acabou ou está no fim",
  faltando: "Item que deveria estar no armário",
  reposicao: "Pedido de reposição ao Almox",
} as const;
export type TipoSolicitacao = keyof typeof TIPOS_SOLICITACAO;
export type TipoMovimento = "retirada" | "solicitacao" | "reposicao" | "contagem";
const TIPOS_MOV: readonly TipoMovimento[] = ["retirada", "solicitacao", "reposicao", "contagem"];
/** Unidades só de peça inteira; as outras (M, KG, L…) aceitam decimal com até 2 casas. */
export const UM_INTEIRA = new Set(["PC", "UN", "PAR", "CJ", "KIT", "JG", "PCT", "CX", "RL"]);
export const MAX_QUANTIDADE = 999;
export const MAX_ITENS_KIT = 500;
export const DIAS_PARADO = 90;

/** Foto guardada em app/documentos/ubm/<movimento>/<arquivo> (`arquivo` = id do arquivo, um novo a cada envio). */
export interface Foto { nome: string; tipo: string; tamanho: number; arquivo: string }
/** Item do kit: `maximo` = quantidade padrão no armário; `minimo` (opcional no cadastro) vale o padrão quando não informado. */
export interface ItemKit { codigo: string; descricao: string; um: string; minimo: number; maximo: number }
export interface Armario { id: string; nome: string; local: string; ativo: boolean; itens: ItemKit[]; criadoEm: string }
export interface Movimento {
  id: string; tipo: TipoMovimento; armario: string; em: string; por: string; porNome: string;
  /** `turno` só nas retiradas antigas do QR (lido para o histórico) */
  codigo: string; quantidade: number; ordem: string; turno: string; uso: string; observacao: string;
  tipoSolicitacao: TipoSolicitacao | ""; foto: Foto | null;
  /** solicitação: fechada por quem e quando ("" = aberta) */
  fechadaEm: string; fechadaPor: string;
  /** retirada: "validacao" = confirmada pelo líder pela IW13; "qr" = antiga, do QR de retirada (desativado) */
  origem: OrigemRetirada | "";
}
export type OrigemRetirada = "qr" | "validacao";
/** Texto do uso gravado na retirada confirmada na validação do líder. */
export const USO_VALIDACAO = "Confirmado pelo líder pela IW13 (ordem de quebra)";

// ----------------------------------------------------------------------------
// Normalização e validação das entradas
// ----------------------------------------------------------------------------
const txt = (v: unknown, max = 200) => String(v ?? "").replace(/[\u0000-\u001f\u007f]+/g, " ").trim().slice(0, max);
const ehObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const r2 = (n: number) => Math.round(n * 100) / 100;

/** Código do material: maiúsculas, sem espaço; só números perde os zeros à esquerda (a chave do catálogo). */
export function normalizarCodigo(v: unknown): string {
  const s = txt(v, 60).toUpperCase().replace(/\s+/g, "");
  return /^\d+$/.test(s) ? s.replace(/^0+(?=\d)/, "") : s;
}
export const codigoValido = (c: string) => /^[A-Z0-9][A-Z0-9.\-/_]{0,39}$/.test(c);

/** Ordem: texto livre curto (o número da IW38 ou o que a pessoa tiver em mãos). */
export const normalizarOrdem = (v: unknown) => txt(v, 40).toUpperCase().replace(/\s+/g, "");
export const ordemValida = (o: string) => /^[A-Z0-9][A-Z0-9.\-/_]{0,19}$/.test(o);
/** Chave da ordem para cruzar com a IW38: só os dígitos, sem zeros à esquerda ("" = sem número). */
export const chaveOrdem = (v: string) => String(v ?? "").replace(/\D/g, "").replace(/^0+(?=\d)/, "");

/** Unidade de medida: sigla curta em maiúsculas (até 4 letras); vazio = "PC". */
export function normalizarUm(v: unknown): string | null {
  const s = txt(v, 10).toUpperCase().replace(/\.$/, "");
  if (!s) return "PC";
  return /^[A-Z]{1,4}\d?$/.test(s) ? s : null;
}
export const umInteira = (um: string) => UM_INTEIRA.has(um.toUpperCase());

/** Número digitado (vírgula ou ponto decimal, aceita "1.234,5"); null se não for número. */
export function lerNumero(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  let s = txt(v, 30).replace(/\s/g, "");
  if (!s) return null;
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  if (!/^-?\d+(\.\d+)?$/.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/**
 * Quantidade de 0,01 a 999 (com `zero`, a partir de 0): inteira para peça (PC, UN…); decimal com até 2 casas para as
 * outras unidades e para código sem UM conhecida (fora do kit). Devolve o número ou a mensagem de erro.
 */
export function validarQuantidade(v: unknown, um: string, zero = false): number | string {
  const n = lerNumero(v);
  const inteira = !!um && umInteira(um);
  const faixa = `${zero ? "0" : inteira ? "1" : "0,01"} a ${MAX_QUANTIDADE}`;
  if (n == null) return `Quantidade: um número de ${faixa}.`;
  if (inteira && !Number.isInteger(n)) return `Quantidade em ${um}: só número inteiro.`;
  if (Math.abs(r2(n) - n) > 1e-9) return "Quantidade: no máximo 2 casas decimais.";
  if (n < 0 || (!zero && n === 0) || n > MAX_QUANTIDADE) return `Quantidade: de ${faixa}.`;
  return r2(n);
}

/** Item do kit do armário pelo código (null = fora do kit). */
export function itemDoKit(a: Pick<Armario, "itens"> | null | undefined, codigo: string): ItemKit | null {
  const c = normalizarCodigo(codigo);
  return a?.itens.find((i) => i.codigo === c) ?? null;
}

export interface EntradaSolicitacao { tipo: string; codigo: string; quantidade: string; observacao: string }
export interface CamposSolicitacao { tipo: TipoSolicitacao; codigo: string; quantidade: number; observacao: string }

/** Solicitação: o código só pode faltar em "item que deveria estar" (aí a observação descreve o item). */
export function validarSolicitacao(e: EntradaSolicitacao, armario: Pick<Armario, "itens"> | null): { erro: string } | { campos: CamposSolicitacao } {
  const tipo = txt(e.tipo, 20);
  if (!(tipo in TIPOS_SOLICITACAO)) return { erro: "Escolha o tipo da solicitação." };
  const codigo = normalizarCodigo(e.codigo);
  if (codigo && !codigoValido(codigo)) return { erro: "Código do material: até 40 letras ou números." };
  if (!codigo && tipo !== "faltando") return { erro: "Informe o código do material." };
  const q = validarQuantidade(txt(e.quantidade) || "1", itemDoKit(armario, codigo)?.um ?? "");
  if (typeof q === "string") return { erro: q };
  const observacao = txt(e.observacao, 600);
  if (observacao.length > 500) return { erro: "Observação: até 500 caracteres." };
  if (!codigo && observacao.length < 3) return { erro: "Sem o código, descreva o item na observação." };
  return { campos: { tipo: tipo as TipoSolicitacao, codigo, quantidade: q, observacao } };
}

/** Reposição (zero = false) ou contagem (zero = true): várias linhas código + quantidade do mesmo armário. */
export function validarLancamento(linhas: { codigo: string; quantidade: string }[], armario: Pick<Armario, "itens"> | null, zero: boolean):
  { erro: string } | { itens: { codigo: string; quantidade: number }[] } {
  const itens: { codigo: string; quantidade: number }[] = [];
  const vistos = new Set<string>();
  for (const l of linhas.slice(0, MAX_ITENS_KIT + 1)) {
    if (!txt(l.codigo) && !txt(l.quantidade)) continue;
    const codigo = normalizarCodigo(l.codigo);
    if (!codigoValido(codigo)) return { erro: `Código inválido: "${txt(l.codigo, 40)}".` };
    if (vistos.has(codigo)) return { erro: `Código repetido: ${codigo}.` };
    vistos.add(codigo);
    const q = validarQuantidade(l.quantidade, itemDoKit(armario, codigo)?.um ?? "", zero);
    if (typeof q === "string") return { erro: `${codigo}: ${q}` };
    itens.push({ codigo, quantidade: q });
  }
  if (!itens.length) return { erro: "Informe ao menos um item com quantidade." };
  if (itens.length > MAX_ITENS_KIT) return { erro: `No máximo ${MAX_ITENS_KIT} itens por lançamento.` };
  return { itens };
}

// ----------------------------------------------------------------------------
// Armário e kit
// ----------------------------------------------------------------------------
export const normalizarIdArmario = (v: unknown) => txt(v, 20).toUpperCase().replace(/\s+/g, "");
export const idArmarioValido = (id: string) => /^UBM-\d{2,3}$/.test(id);

/** Uma linha do kit (como vem do formulário, da colagem ou da planilha). */
export interface LinhaKit { codigo: unknown; descricao?: unknown; um?: unknown; quantidade: unknown; minimo?: unknown;
  /** linha real de origem (planilha com linhas vazias no meio) para as mensagens */
  linha?: number }

/** Confere o kit linha a linha (linha = posição para a mensagem); sem erros, devolve os itens prontos. */
export function prepararKit(linhas: LinhaKit[], primeiraLinha = 1): { itens: ItemKit[]; erros: string[] } {
  const itens: ItemKit[] = [];
  const erros: string[] = [];
  if (linhas.length > MAX_ITENS_KIT) return { itens, erros: [`O kit passa de ${MAX_ITENS_KIT} itens. Nada foi importado.`] };
  const vistos = new Set<string>();
  linhas.forEach((l, i) => {
    const n = typeof l.linha === "number" ? l.linha : i + primeiraLinha;
    const codigo = normalizarCodigo(l.codigo);
    if (!codigoValido(codigo)) { erros.push(`Linha ${n}: código inválido.`); return; }
    if (vistos.has(codigo)) { erros.push(`Linha ${n}: código ${codigo} repetido.`); return; }
    const um = normalizarUm(l.um);
    if (!um) { erros.push(`Linha ${n}: UM inválida (sigla de até 4 letras, ex.: PC, M).`); return; }
    const max = validarQuantidade(l.quantidade, um);
    if (typeof max === "string") { erros.push(`Linha ${n}: ${max.replace("Quantidade", "quantidade padrão")}`); return; }
    let min = max;
    if (txt(l.minimo) !== "") {
      const m = validarQuantidade(l.minimo, um, true);
      if (typeof m === "string") { erros.push(`Linha ${n}: ${m.replace("Quantidade", "mínimo")}`); return; }
      if (m > max) { erros.push(`Linha ${n}: o mínimo passa da quantidade padrão.`); return; }
      min = m;
    }
    vistos.add(codigo);
    itens.push({ codigo, descricao: txt(l.descricao, 120), um, minimo: min, maximo: max });
  });
  return { itens: erros.length ? [] : itens, erros };
}

/**
 * Kit colado (texto ou células copiadas da planilha): uma linha por item, colunas separadas por tab, ponto e vírgula ou
 * dois ou mais espaços. 4 colunas = código, descrição, UM, quantidade (5ª opcional: mínimo); 3 colunas = código, UM,
 * quantidade; 2 colunas = código, quantidade (UM "PC"). A primeira linha é pulada se for o cabeçalho.
 */
export function linhasDoTexto(texto: string): LinhaKit[] {
  const linhas = String(texto ?? "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (linhas.length && /c[oó]digo|material/i.test(linhas[0]) && lerNumero(linhas[0].split(/\t|;|\s{2,}/).at(-1)) == null) linhas.shift();
  return linhas.map((l) => {
    const c = l.split(/\t|;|\s{2,}/).map((x) => x.trim());
    if (c.length >= 4) return { codigo: c[0], descricao: c[1], um: c[2], quantidade: c[3], minimo: c[4] };
    // 3 colunas: código, UM, quantidade — ou código, descrição, quantidade quando a 2ª não parece uma UM
    if (c.length === 3) return pareceUm(c[1]) ? { codigo: c[0], um: c[1], quantidade: c[2] } : { codigo: c[0], descricao: c[1], quantidade: c[2] };
    if (c.length === 2) return { codigo: c[0], quantidade: c[1] };
    return { codigo: c[0], quantidade: "" };
  });
}

/** Sigla de UM digitada como sigla (sem minúsculas, até 4 letras): "Cabo" é descrição, "M" e "PC" são UM. */
const pareceUm = (v: string) => !/[a-zà-ÿ]/.test(v) && normalizarUm(v) !== null && v.trim() !== "";

/** Colunas do modelo de Excel do kit (mesmo padrão do Controle de HH: cabeçalho comparado sem acento nem caixa). */
export const COLUNAS_KIT = ["Código", "Descrição", "UM", "Quantidade padrão", "Mínimo"] as const;
const chaveColuna = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase().replace(/\s+/g, " ");

/** Linhas cruas da planilha (cabeçalho + dados) → linhas do kit; colunas fora do modelo são ignoradas. */
export function linhasDaPlanilha(linhas: unknown[][]): { linhas: LinhaKit[]; erro: string } {
  const [cab, ...resto] = linhas;
  if (!cab) return { linhas: [], erro: "A planilha está vazia." };
  const pos = (nome: string) => cab.findIndex((c) => chaveColuna(String(c ?? "")) === chaveColuna(nome));
  const [ic, id, iu, iq, im] = COLUNAS_KIT.map(pos);
  if (ic < 0 || iq < 0) return { linhas: [], erro: "A planilha precisa das colunas Código e Quantidade padrão (baixe o modelo)." };
  const val = (l: unknown[], i: number) => (i < 0 ? "" : l[i] ?? "");
  // a linha real da planilha (cabeçalho = 1) acompanha o item, mesmo pulando as linhas vazias
  return { erro: "", linhas: resto.map((l, i) => ({ l, linha: i + 2 })).filter(({ l }) => l.some((v) => v != null && String(v).trim() !== ""))
    .map(({ l, linha }) => ({ codigo: val(l, ic), descricao: val(l, id), um: val(l, iu), quantidade: val(l, iq), minimo: val(l, im), linha })) };
}

/** As linhas do kit para a planilha (mesmas colunas do modelo). */
export const linhasKitPlanilha = (itens: ItemKit[]) => itens.map((i) => [i.codigo, i.descricao, i.um, i.maximo, i.minimo === i.maximo ? null : i.minimo]);

export interface EntradaArmario { id: string; nome: string; local: string; ativo: boolean; itens: LinhaKit[] }

export function validarArmario(e: EntradaArmario): { erro: string } | { campos: Omit<Armario, "criadoEm"> } {
  const id = normalizarIdArmario(e.id);
  if (!idArmarioValido(id)) return { erro: "Identificação do armário: UBM- e 2 ou 3 números (ex.: UBM-01)." };
  const nome = txt(e.nome, 100);
  if (nome.length < 3 || nome.length > 80) return { erro: "Nome do armário: de 3 a 80 caracteres." };
  const local = txt(e.local, 100);
  if (local.length > 80) return { erro: "Local/linha: até 80 caracteres." };
  const kit = prepararKit(Array.isArray(e.itens) ? e.itens : []);
  if (kit.erros.length) return { erro: `Kit: ${kit.erros.slice(0, 3).join(" ")}` };
  return { campos: { id, nome, local, ativo: e.ativo !== false, itens: kit.itens } };
}

// ----------------------------------------------------------------------------
// Leitura segura dos cadastros
// ----------------------------------------------------------------------------
const idMovValido = (s: unknown): s is string => typeof s === "string" && /^[a-z0-9]{6,32}$/.test(s);

function fotoDe(v: unknown): Foto | null {
  if (!ehObj(v) || !idMovValido(v.arquivo) || !txt(v.tipo)) return null;
  return { nome: txt(v.nome, 120) || "foto", tipo: txt(v.tipo, 40), tamanho: Number(v.tamanho) || 0, arquivo: v.arquivo };
}

function itemKitDe(v: unknown): ItemKit | null {
  if (!ehObj(v)) return null;
  const codigo = normalizarCodigo(v.codigo), um = normalizarUm(v.um) ?? "PC";
  const maximo = Number(v.maximo), minimo = Number(v.minimo);
  if (!codigoValido(codigo) || !Number.isFinite(maximo) || maximo <= 0) return null;
  return { codigo, descricao: txt(v.descricao, 120), um, maximo: r2(maximo),
    minimo: Number.isFinite(minimo) && minimo >= 0 && minimo <= maximo ? r2(minimo) : r2(maximo) };
}

export function armarioDe(id: string, v: unknown): Armario | null {
  if (!idArmarioValido(id) || !ehObj(v)) return null;
  const nome = txt(v.nome, 80);
  if (!nome) return null;
  return { id, nome, local: txt(v.local, 80), ativo: v.ativo !== false, criadoEm: txt(v.criadoEm, 40),
    itens: (Array.isArray(v.itens) ? v.itens : []).map(itemKitDe).filter((i): i is ItemKit => i != null) };
}

export function armariosDe(cad: Record<string, unknown>): Armario[] {
  return Object.entries(cad).map(([id, v]) => armarioDe(id, v)).filter((a): a is Armario => a != null)
    .sort((a, b) => a.id.localeCompare(b.id, "pt-BR", { numeric: true }));
}

export const armarioParaGravar = (a: Armario): Record<string, unknown> =>
  ({ nome: a.nome, local: a.local, ativo: a.ativo, itens: a.itens, criadoEm: a.criadoEm });

export function movimentoDe(id: string, v: unknown): Movimento | null {
  if (!idMovValido(id) || !ehObj(v) || !TIPOS_MOV.includes(v.tipo as TipoMovimento)) return null;
  const armario = normalizarIdArmario(v.armario);
  const q = Number(v.quantidade);
  if (!idArmarioValido(armario) || !Number.isFinite(q) || q < 0) return null;
  const ts = txt(v.tipoSolicitacao, 20);
  return {
    id, tipo: v.tipo as TipoMovimento, armario, em: txt(v.em, 40), por: txt(v.por, 80), porNome: txt(v.porNome, 120),
    codigo: normalizarCodigo(v.codigo), quantidade: r2(q), ordem: normalizarOrdem(v.ordem), turno: txt(v.turno, 40),
    uso: txt(v.uso, 500), observacao: txt(v.observacao, 500), tipoSolicitacao: ts in TIPOS_SOLICITACAO ? ts as TipoSolicitacao : "",
    foto: fotoDe(v.foto), fechadaEm: txt(v.fechadaEm, 40), fechadaPor: txt(v.fechadaPor, 120),
    origem: v.tipo !== "retirada" ? "" : v.origem === "validacao" ? "validacao" : "qr",
  };
}

/** Os movimentos válidos, do mais novo para o mais antigo. */
export function movimentosDe(cad: Record<string, unknown>): Movimento[] {
  return Object.entries(cad).map(([id, v]) => movimentoDe(id, v)).filter((m): m is Movimento => m != null)
    .sort((a, b) => b.em.localeCompare(a.em) || b.id.localeCompare(a.id));
}

export function movimentoParaGravar(m: Movimento): Record<string, unknown> {
  const { id: _id, ...resto } = m;
  void _id;
  return Object.fromEntries(Object.entries(resto).filter(([, v]) => v !== "" && v !== null));
}

// ----------------------------------------------------------------------------
// Saldo e reposição
// ----------------------------------------------------------------------------
const chaveSaldo = (armario: string, codigo: string) => `${armario}|${codigo}`;

/**
 * Saldo de cada armário|código: em ordem de data, a contagem fixa o saldo; a reposição soma; a retirada subtrai
 * (pode ficar negativo: retirada sem a reposição registrada). Solicitação não mexe no saldo.
 */
export function saldos(movs: Movimento[]): Map<string, number> {
  const m = new Map<string, number>();
  const ordem = [...movs].sort((a, b) => a.em.localeCompare(b.em) || a.id.localeCompare(b.id));
  for (const x of ordem) {
    if (!x.codigo || x.tipo === "solicitacao") continue;
    const k = chaveSaldo(x.armario, x.codigo);
    const atual = m.get(k) ?? 0;
    m.set(k, r2(x.tipo === "contagem" ? x.quantidade : x.tipo === "reposicao" ? atual + x.quantidade : atual - x.quantidade));
  }
  return m;
}
export const saldoDe = (s: Map<string, number>, armario: string, codigo: string) => s.get(chaveSaldo(armario, codigo)) ?? 0;

export interface LinhaSaldo extends ItemKit { armario: string; saldo: number; repor: boolean; separar: number }

/** O kit de cada armário (ativo) com o saldo; `repor` quando o saldo está abaixo do mínimo, separando padrão − saldo. */
export function saldoDoKit(armarios: Armario[], movs: Movimento[]): LinhaSaldo[] {
  const s = saldos(movs);
  return armarios.filter((a) => a.ativo).flatMap((a) => a.itens.map((i) => {
    const saldo = saldoDe(s, a.id, i.codigo);
    const repor = saldo < i.minimo;
    return { ...i, armario: a.id, saldo, repor, separar: repor ? r2(i.maximo - saldo) : 0 };
  }));
}

/** Lista de reposição para o planejamento: só o que está abaixo do mínimo. */
export const listaReposicao = (armarios: Armario[], movs: Movimento[]) => saldoDoKit(armarios, movs).filter((l) => l.repor);

// ----------------------------------------------------------------------------
// Filtros e análise
// ----------------------------------------------------------------------------
export interface Filtro { armario?: string; de?: string; ate?: string }
const dataOk = (s: string | undefined) => (/^\d{4}-\d{2}-\d{2}$/.test(s ?? "") ? s! : "");

/** Armário (id) e período (de/até, AAAA-MM-DD, pela data do movimento); filtros inválidos são ignorados. */
export function filtrar(movs: Movimento[], f: Filtro): Movimento[] {
  const armario = idArmarioValido(f.armario ?? "") ? f.armario : "";
  const de = dataOk(f.de), ate = dataOk(f.ate);
  // dia de Brasília: uma retirada às 21h30 é do dia dela, não do dia seguinte (UTC)
  return movs.filter((m) => { const d = diaBr(m.em); return (!armario || m.armario === armario) && (!de || d >= de) && (!ate || d <= ate); });
}

/** Segunda-feira da semana do instante, pelo dia de Brasília (AAAA-MM-DD; aceita também só a data). */
export function semanaDe(iso: string): string {
  const dia = /^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso : diaBr(iso);
  const d = new Date(`${dia}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return "";
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}

export interface OrdemIw38 { texto: string; equipamento: string; denominacao: string }
export interface Grupo { chave: string; rotulo: string; quantidade: number; retiradas: number }

function agrupar(rs: Movimento[], chave: (m: Movimento) => string, rotulo: (k: string) => string = (k) => k): Grupo[] {
  const m = new Map<string, Grupo>();
  for (const r of rs) {
    const k = chave(r);
    const g = m.get(k) ?? { chave: k, rotulo: rotulo(k), quantidade: 0, retiradas: 0 };
    g.quantidade = r2(g.quantidade + r.quantidade);
    g.retiradas++;
    m.set(k, g);
  }
  return [...m.values()];
}
const porQuantidade = (a: Grupo, b: Grupo) => b.retiradas - a.retiradas || b.quantidade - a.quantidade || a.chave.localeCompare(b.chave);

export interface Analise {
  retiradas: number; quantidade: number;
  /** porLider: quem confirmou a retirada (o líder na validação; nas antigas do QR, quem retirou) */
  porMaterial: Grupo[]; porLider: Grupo[]; porEquipamento: Grupo[]; porOrdem: Grupo[]; porArmario: Grupo[]; porSemana: Grupo[];
  /** itens do kit sem retirada nos últimos 90 dias (de `hoje`) */
  parados: (ItemKit & { armario: string; ultima: string })[];
  /** retiradas de códigos que não estão no kit do armário: candidatos a entrar */
  foraDoKit: (Grupo & { armario: string; codigo: string })[];
  solicitacoesAbertas: Movimento[];
  /** retiradas cuja ordem não está na IW38 (null = IW38 não carregada, não dá para conferir) */
  semOrdemNaIw38: Movimento[] | null;
}

/**
 * Análise das saídas no filtro (armário + período). `ordens` = IW38 por chave da ordem (null sem a base).
 * Itens parados e solicitações abertas olham o armário filtrado, mas não o período (parado = 90 dias até `hoje`).
 */
export function analisar(armarios: Armario[], movs: Movimento[], f: Filtro, ordens: Map<string, OrdemIw38> | null, hoje: string): Analise {
  const noFiltro = filtrar(movs, f);
  const rs = noFiltro.filter((m) => m.tipo === "retirada");
  const doArmario = filtrar(movs, { armario: f.armario });
  const ordemDe = (m: Movimento) => ordens?.get(chaveOrdem(m.ordem));
  const kit = new Map(armarios.map((a) => [a.id, new Set(a.itens.map((i) => i.codigo))]));

  const limite = new Date(`${dataOk(hoje) || diaBr(new Date().toISOString())}T12:00:00Z`);
  limite.setUTCDate(limite.getUTCDate() - DIAS_PARADO);
  const corte = limite.toISOString().slice(0, 10);
  const ultima = new Map<string, string>();
  for (const m of doArmario) if (m.tipo === "retirada") {
    const k = chaveSaldo(m.armario, m.codigo);
    if ((ultima.get(k) ?? "") < m.em) ultima.set(k, m.em);
  }
  const armariosFiltro = armarios.filter((a) => a.ativo && (!idArmarioValido(f.armario ?? "") || a.id === f.armario));
  const parados = armariosFiltro.flatMap((a) => a.itens
    .map((i) => ({ ...i, armario: a.id, ultima: ultima.get(chaveSaldo(a.id, i.codigo)) ?? "" }))
    .filter((i) => (i.ultima ? diaBr(i.ultima) : "") < corte));

  const fora = rs.filter((m) => !kit.get(m.armario)?.has(m.codigo));
  const foraDoKit = agrupar(fora, (m) => chaveSaldo(m.armario, m.codigo)).sort(porQuantidade)
    .map((g) => { const [armario, codigo] = g.chave.split("|"); return { ...g, armario, codigo }; });

  return {
    retiradas: rs.length,
    quantidade: r2(rs.reduce((s, m) => s + m.quantidade, 0)),
    porMaterial: agrupar(rs, (m) => m.codigo).sort(porQuantidade),
    porLider: agrupar(rs, (m) => m.porNome || m.por || "Sem nome").sort(porQuantidade),
    porEquipamento: agrupar(rs, (m) => ordemDe(m)?.equipamento || "", (k) => k || (ordens ? "Ordem não encontrada na IW38" : "IW38 não carregada"))
      .map((g) => {
        const o = rs.map(ordemDe).find((x) => x?.equipamento === g.chave && g.chave);
        return o?.denominacao ? { ...g, rotulo: `${g.chave} · ${o.denominacao}` } : g;
      }).sort(porQuantidade),
    porOrdem: agrupar(rs, (m) => m.ordem, (k) => { const o = ordens?.get(chaveOrdem(k)); return o?.texto ? `${k} · ${o.texto}` : k; }).sort(porQuantidade),
    porArmario: agrupar(rs, (m) => m.armario, (k) => { const a = armarios.find((x) => x.id === k); return a ? `${k} · ${a.nome}` : k; }).sort(porQuantidade),
    porSemana: agrupar(rs, (m) => semanaDe(m.em)).sort((a, b) => a.chave.localeCompare(b.chave)),
    parados,
    foraDoKit,
    solicitacoesAbertas: doArmario.filter((m) => m.tipo === "solicitacao" && !m.fechadaEm),
    semOrdemNaIw38: ordens ? rs.filter((m) => !ordemDe(m)) : null,
  };
}

/** Quantidade para a tela: até 2 casas, vírgula decimal. */
export const fmtQtd = (n: number) => new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 }).format(n);

// ----------------------------------------------------------------------------
// Valores (preço médio do SAP, base custo_material; só para quem vê valores)
// ----------------------------------------------------------------------------
/** Valor do kit pela quantidade padrão × preço médio (os sem preço, ou com outra UM, ficam de fora e são contados). */
export function valorDoKit(itens: Pick<ItemKit, "codigo" | "um" | "maximo">[], precos: Precos | null) {
  return somarValores(itens.map((i) => valorDe(precos, i.codigo, i.maximo, i.um)));
}

/** Valor da lista de reposição: quantidade a separar × preço médio. */
export function valorDaReposicao(linhas: Pick<LinhaSaldo, "codigo" | "um" | "separar">[], precos: Precos | null) {
  return somarValores(linhas.map((l) => valorDe(precos, l.codigo, l.separar, l.um)));
}

/** Valor das retiradas do filtro (quantidade × preço; a UM é a do item no kit do armário). */
export function valorDasRetiradas(armarios: Armario[], movs: Movimento[], f: Filtro, precos: Precos | null) {
  const porId = new Map(armarios.map((a) => [a.id, a]));
  return somarValores(filtrar(movs, f).filter((m) => m.tipo === "retirada")
    .map((m) => valorDe(precos, m.codigo, m.quantidade, itemDoKit(porId.get(m.armario), m.codigo)?.um ?? "")));
}
