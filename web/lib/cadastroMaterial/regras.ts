/**
 * Pedidos de cadastro de material — só as regras (sem gravar nada); a gravação fica em lib/cadastroMaterial/dados.ts.
 *
 * - Quem tem a aba lança o pedido (descrição, SAP, equipamento, foto) e vê todos os pedidos.
 * - Aprovação em sequência: Almoxarifado aprova (ou recusa, com motivo) → Almoxarifado marca a chegada com a foto do
 *   material recebido → PCM compara as fotos e valida (ou recusa a chegada, com motivo, e volta para o Almoxarifado).
 * - Quem aprova é marcado em Usuários (`aprova_almox`, `aprova_pcm`); o Papel já chega resolvido.
 * - Cadastro `pedidos_cadastro_material.json`: { <id do pedido>: Pedido sem o id }.
 * Spec: docs/superpowers/specs/2026-11-10-cadastro-material-design.md. Testado em testes/cadastroMaterial.test.ts.
 */

export const ARQ_PEDIDOS = "pedidos_cadastro_material.json";
export const AG_ALMOX = "Aguardando almoxarifado", AG_CHEGADA = "Aguardando chegada", AG_PCM = "Aguardando PCM",
  CONCLUIDO = "Concluído", RECUSADO = "Recusado";
export type Situacao = typeof AG_ALMOX | typeof AG_CHEGADA | typeof AG_PCM | typeof CONCLUIDO | typeof RECUSADO;
export const SITUACOES: readonly Situacao[] = [AG_ALMOX, AG_CHEGADA, AG_PCM, CONCLUIDO, RECUSADO];
export type Acao = "aprovar" | "recusar" | "chegou" | "validar" | "recusar_chegada";
const ACOES_EVENTO = ["aprovar", "recusar", "chegou", "validar", "recusar_chegada", "lancar", "editar"] as const;

/** `arquivo` = id do arquivo guardado (cada envio grava um arquivo novo). */
export interface Foto { nome: string; tipo: string; tamanho: number; arquivo: string }
export interface Evento { em: string; por: string; acao: Acao | "lancar" | "editar"; motivo?: string }
export interface Pedido {
  id: string; descricao: string; sap: string; equipamento: { tag: string; nome: string };
  observacao: string; foto: Foto | null; fotoChegada: Foto | null; situacao: Situacao;
  criadoPor: string; criadoEm: string; historico: Evento[];
}
export interface Papel { login: string; almox: boolean; pcm: boolean }
export interface EntradaPedido { descricao: string; sap: string; tag: string; observacao: string }

// ----------------------------------------------------------------------------
// Transições e quem age
// ----------------------------------------------------------------------------
const TRANSICOES: Record<string, Situacao> = {
  [`${AG_ALMOX}|aprovar`]: AG_CHEGADA,
  [`${AG_ALMOX}|recusar`]: RECUSADO,
  [`${AG_CHEGADA}|chegou`]: AG_PCM,
  [`${AG_PCM}|validar`]: CONCLUIDO,
  [`${AG_PCM}|recusar_chegada`]: AG_CHEGADA,
};

/** Para onde o pedido vai com a ação (null = transição não permitida). */
export function proximaSituacao(atual: Situacao, acao: Acao): Situacao | null {
  return TRANSICOES[`${atual}|${acao}`] ?? null;
}

const ACAO_DO_ALMOX: readonly Acao[] = ["aprovar", "recusar", "chegou"];
const PEDE_MOTIVO: readonly Acao[] = ["recusar", "recusar_chegada"];

/** Por que a pessoa não pode fazer a ação no pedido ("" = pode). */
export function bloqueioDeAcao(p: Papel, ped: Pick<Pedido, "situacao">, acao: Acao, motivo: string): string {
  if (ACAO_DO_ALMOX.includes(acao)) {
    if (!p.almox) return "Só quem aprova como Almoxarifado faz esta etapa.";
  } else if (!p.pcm) return "Só quem aprova como PCM faz esta etapa.";
  if (!proximaSituacao(ped.situacao, acao)) return `Pedido ${ped.situacao.toLowerCase()}: esta ação não vale agora.`;
  if (PEDE_MOTIVO.includes(acao) && String(motivo ?? "").trim().length < 3) return "Informe o motivo da recusa.";
  return "";
}

/** Editar ou excluir: só quem lançou e enquanto aguarda o almoxarifado. */
export function podeEditar(p: Papel, ped: Pick<Pedido, "situacao" | "criadoPor">): boolean {
  return ped.situacao === AG_ALMOX && !!p.login && ped.criadoPor.toLowerCase() === p.login.toLowerCase();
}

// ----------------------------------------------------------------------------
// Validação do lançamento
// ----------------------------------------------------------------------------
export function validarEntrada(e: EntradaPedido, tags: Set<string>): { erro: string } | { campos: EntradaPedido } {
  const descricao = String(e.descricao ?? "").trim();
  if (descricao.length < 5 || descricao.length > 200) return { erro: "Descrição: de 5 a 200 caracteres." };
  const sap = String(e.sap ?? "").trim();
  if (!/^\d{5,12}$/.test(sap)) return { erro: "Número SAP: só números, de 5 a 12 dígitos." };
  const tag = String(e.tag ?? "").trim();
  if (!tag || !tags.has(tag)) return { erro: "Escolha o equipamento da lista." };
  const observacao = String(e.observacao ?? "").trim();
  if (observacao.length > 500) return { erro: "Observação: até 500 caracteres." };
  // sem zeros à esquerda: a mesma chave do catálogo e da aba Equipamentos
  return { campos: { descricao, sap: sap.replace(/^0+/, "") || "0", tag, observacao } };
}

// ----------------------------------------------------------------------------
// Leitura segura do cadastro
// ----------------------------------------------------------------------------
const txt = (v: unknown, max = 200) => String(v ?? "").replace(/[\u0000-\u001f]+/g, " ").trim().slice(0, max);
const idValido = (s: unknown): s is string => typeof s === "string" && /^[a-z0-9]{6,32}$/.test(s);
const ehObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

function fotoDe(v: unknown): Foto | null {
  if (!ehObj(v) || !idValido(v.arquivo) || !txt(v.tipo)) return null;
  return { nome: txt(v.nome, 120) || "foto", tipo: txt(v.tipo, 40), tamanho: Number(v.tamanho) || 0, arquivo: v.arquivo };
}

function eventoDe(v: unknown): Evento | null {
  if (!ehObj(v) || !(ACOES_EVENTO as readonly string[]).includes(v.acao as string)) return null;
  return { em: txt(v.em, 40), por: txt(v.por, 80), acao: v.acao as Evento["acao"], ...(v.motivo ? { motivo: txt(v.motivo, 300) } : {}) };
}

/** Um pedido do cadastro (null se a forma não vale). */
export function pedidoDe(id: string, v: unknown): Pedido | null {
  if (!idValido(id) || !ehObj(v)) return null;
  if (!SITUACOES.includes(v.situacao as Situacao)) return null;
  const descricao = txt(v.descricao, 200), sap = txt(v.sap, 12);
  const eq = ehObj(v.equipamento) ? v.equipamento : {};
  const tag = txt(eq.tag, 60);
  if (!descricao || !sap || !tag) return null;
  return {
    id, descricao, sap, equipamento: { tag, nome: txt(eq.nome, 200) },
    observacao: txt(v.observacao, 500), foto: fotoDe(v.foto), fotoChegada: fotoDe(v.fotoChegada),
    situacao: v.situacao as Situacao, criadoPor: txt(v.criadoPor, 80), criadoEm: txt(v.criadoEm, 40),
    historico: (Array.isArray(v.historico) ? v.historico : []).map(eventoDe).filter((x): x is Evento => x != null),
  };
}

/** O que vai para o cadastro (a chave já é o id). */
export const paraGravar = (p: Pedido): Record<string, unknown> => ({
  descricao: p.descricao, sap: p.sap, equipamento: p.equipamento, observacao: p.observacao, foto: p.foto,
  fotoChegada: p.fotoChegada, situacao: p.situacao, criadoPor: p.criadoPor, criadoEm: p.criadoEm, historico: p.historico,
});

/** Os pedidos do cadastro (só os de forma válida), o mais novo primeiro. */
export function pedidosDe(cad: Record<string, unknown>): Pedido[] {
  return Object.entries(cad).map(([id, v]) => pedidoDe(id, v)).filter((p): p is Pedido => p != null)
    .sort((a, b) => b.criadoEm.localeCompare(a.criadoEm));
}

// ----------------------------------------------------------------------------
// Ordem, resumo e planilha
// ----------------------------------------------------------------------------
/** O que espera pelo papel vem primeiro (almox: aprovar, depois chegada; pcm: validar); o resto, mais novo primeiro. */
export function ordenarPara(p: Papel, ps: Pedido[]): Pedido[] {
  const primeiro: Situacao[] = [...(p.almox ? [AG_ALMOX, AG_CHEGADA] as const : []), ...(p.pcm ? [AG_PCM] as const : [])];
  const peso = (s: Situacao) => { const i = primeiro.indexOf(s); return i < 0 ? primeiro.length : i; };
  return [...ps].sort((a, b) => peso(a.situacao) - peso(b.situacao) || b.criadoEm.localeCompare(a.criadoEm));
}

const semAcento = (v: string) => v.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

/**
 * Filtros da tela e da planilha: situação (só as do site; outra é ignorada), mês do lançamento ("AAAA-MM"; outro
 * formato é ignorado) e busca na descrição, no SAP e no equipamento (tag ou nome), sem diferenciar acento e maiúscula.
 */
export function filtrarPedidos(ps: Pedido[], f: { situacao?: string; mes?: string; q?: string }): Pedido[] {
  const sit = SITUACOES.includes(f.situacao as Situacao) ? f.situacao : "";
  const mes = /^\d{4}-\d{2}$/.test(f.mes ?? "") ? f.mes! : "";
  const q = semAcento(String(f.q ?? "").trim());
  return ps.filter((p) => (!sit || p.situacao === sit) && (!mes || p.criadoEm.startsWith(mes))
    && (!q || semAcento(`${p.descricao}\n${p.sap}\n${p.equipamento.tag}\n${p.equipamento.nome}`).includes(q)));
}

/** Quando o pedido foi validado (último "validar"; sem ele, a data do lançamento). */
const validadoEm = (p: Pedido) => p.historico.filter((e) => e.acao === "validar").at(-1)?.em ?? p.criadoEm;

/** Indicadores do topo; `mes` = "AAAA-MM" para os concluídos no mês. */
export function resumo(ps: Pedido[], mes: string): { agAlmox: number; agChegada: number; agPcm: number; concluidosMes: number } {
  const r = { agAlmox: 0, agChegada: 0, agPcm: 0, concluidosMes: 0 };
  for (const p of ps) {
    if (p.situacao === AG_ALMOX) r.agAlmox++;
    else if (p.situacao === AG_CHEGADA) r.agChegada++;
    else if (p.situacao === AG_PCM) r.agPcm++;
    else if (p.situacao === CONCLUIDO && validadoEm(p).startsWith(mes)) r.concluidosMes++;
  }
  return r;
}

const dataBr = (iso: string) => (/^\d{4}-\d{2}-\d{2}/.test(iso) ? iso.slice(0, 10).split("-").reverse().join("/") : iso);

/** Planilha (CSV, ; e BOM para o Excel) dos pedidos. */
export function csvPedidos(ps: Pedido[]): string {
  const esc = (v: string) => `"${v.replaceAll('"', '""')}"`;
  // texto que começa com = + - @ vira fórmula no Excel: neutraliza
  const seguro = (v: string) => (/^[=+\-@]/.test(v) ? `'${v}` : v);
  const cab = ["Lançado em", "Lançado por", "Descrição", "Número SAP", "Equipamento (tag)", "Equipamento", "Observação",
    "Situação", "Última etapa", "Última etapa por", "Motivo"];
  const linhas = ps.map((p) => {
    const ult = p.historico.at(-1);
    const ultRecusa = [...p.historico].reverse().find((e) => e.motivo);
    return [dataBr(p.criadoEm), p.criadoPor, p.descricao, p.sap, p.equipamento.tag, p.equipamento.nome, p.observacao,
      p.situacao, ult ? dataBr(ult.em) : "", ult?.por ?? "", ultRecusa?.motivo ?? ""];
  });
  return "﻿" + [cab, ...linhas].map((l) => l.map((v) => esc(seguro(v))).join(";")).join("\r\n");
}
