/**
 * Machine Ledger (planilha corporativa WCM/RCM de cada máquina) — só as regras, sem gravar nada; leitura e gravação ficam
 * em lib/machineLedger/dados.ts. Spec: docs/superpowers/specs/2026-11-23-machine-ledger-design.md. Testado em
 * testes/machineLedger.test.ts.
 *
 * - Índice leve `machine_ledger.json`: { <id>: ItemIndice } (arquivo, nome, tipo, revisão, capa, equipamentos SAP ligados,
 *   sugestões de correspondência, contagens, quem enviou/confirmou).
 * - Um cadastro por ledger `machine_ledger/<id>.json`: { ledger: { componentes, plano, pecas } } — lido só quando a máquina
 *   é aberta ou o pente fino/cruzamentos precisam.
 * - `machine_ledger_conferidos.json`: { <chave do achado>: { por, em } } — achado marcado "conferido, está certo".
 * - Leitura da planilha pelos CABEÇALHOS (não pela posição): alguns ledgers têm uma coluna a mais no RCM e tudo desloca.
 *   O índice H é o que a planilha traz; vazio, é calculado pela fórmula que as planilhas usam de fato
 *   (P + T + V + 6 se impacta segurança + 4 se impacta qualidade — o título da coluna diz "P x G x T", mas os valores
 *   gravados seguem essa soma em ~97% das linhas conferidas). G (grau de impacto) vem como S/N = para a máquina.
 * - Código do material: resolvido na leitura (nunca gravado) contra o catálogo do Sysmat — código SAP (5 a 7 dígitos),
 *   código Sysmat ("SysMat-2006…", 8 dígitos) ou, sem código SAP, pela descrição curta exata (só se for única).
 */
import { semAcento } from "../dados/texto";
import { partes, type Dia } from "../wcm/util";

export const ARQ_INDICE = "machine_ledger.json";
export const PASTA_LEDGERS = "machine_ledger";
export const ARQ_CONFERIDOS = "machine_ledger_conferidos.json";
export const arquivoLedger = (id: string) => `${PASTA_LEDGERS}/${id}.json`;
export const ABAS_OBRIGATORIAS = ["CAPA", "RCM", "PLANO MESTRE", "GT_SPARE_PARTS"] as const;
export const MAX_LINHAS = 5_000;

// ----------------------------------------------------------------------------
// Tipos
// ----------------------------------------------------------------------------
export interface Capa { maquina: string; fabricante: string; modelo: string; area: string; funcao: string }
export interface Componente {
  equip: string; conjunto: string; subconjunto: string; componente: string;
  /** como está na planilha (ex.: "SysMat-20069677") */
  codigo: string; qtd: string; funcao: string; falha: string; deterioracao: string; modo: string; efeito: string;
  evidente: boolean; oculta: boolean;
  /** S/N da planilha (null = vazio) */
  seguranca: boolean | null; qualidade: boolean | null; parada: boolean | null;
  p: number | null; t: number | null; v: number | null; h: number | null; classe: string; tipoManut: string;
}
export interface Atividade {
  conjunto: string; subconjunto: string; componente: string; atividade: string; cilr: string; tipo: string;
  tempoMin: number | null; periodicidade: string; mec: number | null; ele: number | null; procedimento: string; planoSap: string;
}
export interface Peca {
  conjunto: string; codigo: string; descricao: string; consumivel: string; classe: string; estrategico: boolean; reserva: boolean;
  estSegAlmox: number | null; valorUnit: number | null; area: string; posicao: string; estSegUbm: number | null;
}
export interface Conteudo { componentes: Componente[]; plano: Atividade[]; pecas: Peca[] }
export type TipoLedger = "maquina" | "modelo";
export interface Sugestao { sap: string; denominacao: string; confianca: string; motivo: string }
export interface ItemIndice {
  arquivo: string; nome: string; tipo: TipoLedger; revisao: string; capa: Capa;
  /** equipamentos SAP ligados (confirmados) */
  equipamentos: string[];
  /** "automatica" (veio da importação) ou "confirmada" (um editor conferiu na aba) */
  origem: "automatica" | "confirmada";
  sugestoes: Sugestao[];
  contagens: { componentes: number; plano: number; pecas: number };
  enviadoEm: string; enviadoPor: string; confirmadoEm: string; confirmadoPor: string;
}
export type Indice = ItemIndice & { id: string };
export type Ledger = Indice & Conteudo;

// ----------------------------------------------------------------------------
// Texto
// ----------------------------------------------------------------------------
const CONTROLE = /[\u0000-\u001f\u007f]+/g;
export const txt = (v: unknown, max = 300): string => {
  if (v == null) return "";
  if (typeof v === "object") {
    const d = v as { data?: boolean; ano?: number; mes?: number; dia?: number };
    return d.data && d.ano ? `${String(d.dia).padStart(2, "0")}/${String(d.mes).padStart(2, "0")}/${d.ano}` : "";
  }
  return String(v).replace(CONTROLE, " ").replace(/\s+/g, " ").trim().slice(0, max);
};
/** Sem acento, maiúsculo, só letras/números separados por um espaço. */
export const norm = (v: unknown): string => semAcento(txt(v, 2000)).toUpperCase().replace(/[^A-Z0-9]+/g, " ").trim();
export const semZeros = (c: string) => c.replace(/^0+/, "") || c;
const num = (v: unknown): number | null => {
  const s = txt(v).replace(/\s/g, "");
  if (!s) return null;
  const n = Number(s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : s);
  return Number.isFinite(n) ? n : null;
};
const sn = (v: unknown): boolean | null => {
  const s = norm(v);
  return s.startsWith("S") ? true : s.startsWith("N") ? false : null;
};
const marcado = (v: unknown) => !!txt(v) && !/^(N|NAO|0|FALSE)$/.test(norm(v));
/** "Estratégico", "ESTRATEÉGICO"… */
const ehEstrategico = (v: unknown) => /^ESTR/.test(norm(v));
/** "SIM", "Estocagem recomendada" */
const ehReserva = (v: unknown) => { const s = norm(v); return s === "SIM" || s === "S" || /^ESTOCAGEM RECOMENDADA/.test(s); };

// ----------------------------------------------------------------------------
// Índice H e classe
// ----------------------------------------------------------------------------
/** Índice H como as planilhas calculam de fato (ver o cabeçalho deste arquivo); null sem P, T ou V. */
export function calcularH(c: Pick<Componente, "p" | "t" | "v" | "seguranca" | "qualidade">): number | null {
  if (c.p == null || c.t == null || c.v == null) return null;
  return c.p + c.t + c.v + (c.seguranca ? 6 : 0) + (c.qualidade ? 4 : 0);
}
/** Índice H do componente: o da planilha; vazio, o calculado. */
export const indiceH = (c: Componente): number | null => c.h ?? calcularH(c);
/** Classe pela régua do cabeçalho da planilha: C não para a máquina ou H ≤ 5; B 5 < H < 9; A H ≥ 9. */
export function classeDeH(h: number | null, parada: boolean | null): string {
  if (h == null) return "";
  if (parada === false || h <= 5) return "C";
  return h < 9 ? "B" : "A";
}
export const classeDe = (c: Componente) => c.classe || classeDeH(indiceH(c), c.parada);

// ----------------------------------------------------------------------------
// Leitura da planilha (no navegador, pela aba Enviar ledger; e na carga inicial)
// ----------------------------------------------------------------------------
export interface AbaLida { nome: string; linhas: unknown[][] }

/** A aba pelo nome: RCM prefere a do ano mais recente ("RCM 2026" antes de "RCM 2025" e de "RCM"). */
export function acharAba(abas: AbaLida[], qual: (typeof ABAS_OBRIGATORIAS)[number]): AbaLida | null {
  const cand = abas.filter((a) => {
    const n = norm(a.nome);
    if (qual === "RCM") return /\bRCM\b/.test(n);
    if (qual === "GT_SPARE_PARTS") return n.includes("SPARE");
    if (qual === "PLANO MESTRE") return n.includes("PLANO MESTRE");
    return n === "CAPA";
  });
  const ano = (a: AbaLida) => Number(/20\d\d/.exec(a.nome)?.[0] ?? 9999);
  return cand.sort((a, b) => ano(b) - ano(a))[0] ?? null;
}

/** Abas que faltam para ser um Machine Ledger (vazio = tem todas). */
export const abasFaltando = (abas: AbaLida[]) => ABAS_OBRIGATORIAS.filter((q) => !acharAba(abas, q));

/** Índice da coluna, procurando nas linhas de cabeçalho (a primeira que casa). */
function colunaEm(cab: unknown[][], rx: RegExp, depois = -1): number {
  for (const linha of cab) for (let i = 0; i < linha.length; i++) if (i > depois && rx.test(norm(linha[i]))) return i;
  return -1;
}
const cel = (l: unknown[], i: number) => (i >= 0 ? l[i] : "");

export function lerCapa(linhas: unknown[][]): { capa: Capa; revisao: string } {
  const tudo = linhas.flat().map((v) => txt(v, 4000)).filter(Boolean).join(" ");
  const campo = (rotulo: string, proximos: string) =>
    txt(new RegExp(`${rotulo}:\\s*(.*?)\\s*(?:${proximos}):`, "i").exec(`${tudo} Fim:`)?.[1] ?? "", 120);
  const prox = "Fabricante|Modelo|UGB|[ÁA]rea|Vers[ãa]o|Data da [úu]ltima revis[ãa]o|Planta|Elaboradores|Fim";
  const revisao = /Data da [úu]ltima revis[ãa]o:\s*(\d{1,2}\/\d{1,2}\/\d{2,4})/i.exec(tudo)?.[1] ?? "";
  // a função: o primeiro texto longo da capa que não é o cabeçalho (com os nomes dos elaboradores, que não guardamos)
  const funcao = linhas.flat().map((v) => txt(v, 4000)).find((s) => s.length > 80 && !/Elaboradores|Planta:/i.test(s)) ?? "";
  return {
    revisao,
    capa: { maquina: campo("Equipamento", prox), fabricante: campo("Fabricante", prox), modelo: campo("Modelo", prox),
      area: campo("[ÁA]rea", prox), funcao: funcao.slice(0, 600) },
  };
}

/** RCM pelos cabeçalhos: a linha com "Componente" e "COD SAP" e, nas de cima/baixo, impacto, P, T, V, H e classe. */
export function lerRcm(linhas: unknown[][]): Componente[] {
  const iCab = linhas.slice(0, 15).findIndex((l) => l.some((c) => /^COMPONENTE/.test(norm(c))) && l.some((c) => /COD.*SAP/.test(norm(c))));
  if (iCab < 0) return [];
  const cab = linhas.slice(Math.max(0, iCab - 2), iCab + 3);
  const l0 = [linhas[iCab]];
  const col = {
    equip: colunaEm(l0, /^EQUIPAMENTO/), conjunto: colunaEm(l0, /^CONJUNTO/), subconjunto: colunaEm(l0, /^SUBCONJUNTO/),
    componente: colunaEm(l0, /^COMPONENTE/), codigo: colunaEm(l0, /COD.*SAP/), qtd: colunaEm(l0, /^QUANT/),
    funcao: colunaEm(l0, /^FUNCAO DO COMP/), falha: colunaEm(l0, /^FALHA FUNCIONAL/), deterioracao: colunaEm(l0, /^TIPO DE DETERIORA/),
    modo: colunaEm(l0, /^MODO DE FALHA/), efeito: colunaEm(l0, /^EFEITO/),
    evidente: colunaEm(cab, /^EVIDENTE$/), oculta: colunaEm(cab, /^OCULTA$/),
    seguranca: colunaEm(cab, /IMPACTO EM SEGURANCA/), qualidade: colunaEm(cab, /IMPACTO EM QUALIDADE/),
    g: colunaEm(cab, /GRAU DE IMPACTO/), p: colunaEm(cab, /PROBABILIDADE/), t: colunaEm(cab, /TEMPO DE REPARO/),
    v: colunaEm(cab, /VALOR DO COMPONENTE/), h: colunaEm(cab, /INDICE H/),
    // classe (A/B/C) e tipo de manutenção (CBM/TBM/BM) pelos cabeçalhos "Classificação" e "MANUTENÇÃO PM"
    classe: colunaEm(cab, /^CLASSIFICACAO/), tipoManut: colunaEm(cab, /^MANUTENCAO PM$/),
  };
  const out: Componente[] = [];
  // células mescladas: equipamento, conjunto e subconjunto só vêm na 1ª linha do bloco (repete o de cima)
  let equip = "", conjunto = "", subconjunto = "";
  for (const l of linhas.slice(iCab + 1)) {
    const componente = txt(cel(l, col.componente), 200);
    const e0 = txt(cel(l, col.equip), 160), c0 = txt(cel(l, col.conjunto), 160), s0 = txt(cel(l, col.subconjunto), 160);
    if (e0) { equip = e0; conjunto = c0; subconjunto = s0; }
    if (c0) { conjunto = c0; subconjunto = s0; }
    if (s0) subconjunto = s0;
    if (!componente || /^(EQUIPAMENTO|MACHINE LEDGER|ESTRUTURA)/.test(norm(e0)) || /^COMPONENTE/.test(norm(componente)) || !(equip || conjunto)) continue;
    out.push({
      equip, conjunto, subconjunto,
      componente, codigo: limparCodigo(cel(l, col.codigo)), qtd: txt(cel(l, col.qtd), 20), funcao: txt(cel(l, col.funcao), 300),
      falha: txt(cel(l, col.falha), 300), deterioracao: txt(cel(l, col.deterioracao), 40), modo: txt(cel(l, col.modo), 300),
      efeito: txt(cel(l, col.efeito), 300), evidente: marcado(cel(l, col.evidente)), oculta: marcado(cel(l, col.oculta)),
      seguranca: sn(cel(l, col.seguranca)), qualidade: sn(cel(l, col.qualidade)), parada: sn(cel(l, col.g)),
      p: num(cel(l, col.p)), t: num(cel(l, col.t)), v: num(cel(l, col.v)), h: num(cel(l, col.h)),
      classe: /^[ABC]$/.test(norm(cel(l, col.classe))) ? norm(cel(l, col.classe)) : "",
      tipoManut: txt(cel(l, col.tipoManut), 20),
    });
    if (out.length >= MAX_LINHAS) break;
  }
  return out;
}

export function lerPlano(linhas: unknown[][]): Atividade[] {
  const iCab = linhas.slice(0, 10).findIndex((l) => l.some((c) => /^DETALHE ATIVIDADE/.test(norm(c))));
  if (iCab < 0) return [];
  const l0 = [linhas[iCab]];
  const col = {
    conjunto: colunaEm(l0, /^CONJUNTO/), subconjunto: colunaEm(l0, /^SUBCONJUNTO/), componente: colunaEm(l0, /^COMPONENTE/),
    atividade: colunaEm(l0, /^DETALHE ATIVIDADE/), cilr: colunaEm(l0, /CIL R/), tipo: colunaEm(l0, /MANUTENCAO PM/),
    tempo: colunaEm(l0, /^TEMPO/), periodicidade: colunaEm(l0, /^PERIODICIDADE/), mec: colunaEm(l0, /MEC$/), ele: colunaEm(l0, /ELE$/),
    procedimento: colunaEm(l0, /^PROCEDIMENTO|^ESPECIALIDADE/), plano: colunaEm(l0, /COD PLANOS?/),
  };
  const out: Atividade[] = [];
  for (const l of linhas.slice(iCab + 1)) {
    const atividade = txt(cel(l, col.atividade), 300);
    if (!atividade || /^DETALHE/.test(norm(atividade))) continue;
    out.push({ conjunto: txt(cel(l, col.conjunto), 160), subconjunto: txt(cel(l, col.subconjunto), 160), componente: txt(cel(l, col.componente), 200),
      atividade, cilr: txt(cel(l, col.cilr), 60), tipo: txt(cel(l, col.tipo), 60), tempoMin: num(cel(l, col.tempo)),
      periodicidade: txt(cel(l, col.periodicidade), 40), mec: num(cel(l, col.mec)), ele: num(cel(l, col.ele)),
      procedimento: txt(cel(l, col.procedimento), 120), planoSap: limparCodigo(cel(l, col.plano)) });
    if (out.length >= MAX_LINHAS) break;
  }
  return out;
}

export function lerPecas(linhas: unknown[][]): Peca[] {
  const iCab = linhas.slice(0, 10).findIndex((l) => l.some((c) => /^DESCRICAO$/.test(norm(c))) && l.some((c) => /^CODIGO/.test(norm(c))));
  if (iCab < 0) return [];
  const l0 = [linhas[iCab]];
  const col = {
    conjunto: colunaEm(l0, /^CONJUNTO/), codigo: colunaEm(l0, /^CODIGO/), descricao: colunaEm(l0, /^DESCRICAO$/),
    consumivel: colunaEm(l0, /^CONSUMIVEL/), classe: colunaEm(l0, /^CLASSIFICACAO/), estrategico: colunaEm(l0, /^ESTRATEGICO/),
    reserva: colunaEm(l0, /RESERVA/), almox: colunaEm(l0, /SEGURANCA A/), valor: colunaEm(l0, /^VALOR UNITARIO/),
    area: colunaEm(l0, /^AREA DE ESTOCAGEM/), posicao: colunaEm(l0, /^LOCALIZACAO/), ubm: colunaEm(l0, /SEGURANCA U/),
  };
  const out: Peca[] = [];
  for (const l of linhas.slice(iCab + 1)) {
    const descricao = txt(cel(l, col.descricao), 200);
    if (!descricao || /^DESCRICAO$/.test(norm(descricao))) continue;
    out.push({ conjunto: txt(cel(l, col.conjunto), 160), codigo: limparCodigo(cel(l, col.codigo)), descricao, consumivel: txt(cel(l, col.consumivel), 40),
      classe: txt(cel(l, col.classe), 40), estrategico: ehEstrategico(cel(l, col.estrategico)), reserva: ehReserva(cel(l, col.reserva)),
      estSegAlmox: num(cel(l, col.almox)), valorUnit: num(cel(l, col.valor)), area: txt(cel(l, col.area), 60),
      posicao: txt(cel(l, col.posicao), 60), estSegUbm: num(cel(l, col.ubm)) });
    if (out.length >= MAX_LINHAS) break;
  }
  return out;
}

/** Nome do ledger pelo arquivo: "MACHINE LEDGER - MOINHO SF 05.xlsx" → "MOINHO SF 05". */
export const nomeDoArquivo = (arquivo: string) =>
  txt(arquivo.replace(/\.(xlsx|xlsm|md)$/i, "").replace(/machine\s*ledger/ig, "").replace(/^[\s\-_]+|[\s\-_]+$/g, ""), 120);

/** A planilha inteira: erro se faltar aba obrigatória ou se o RCM vier sem componentes. */
export function lerLedger(arquivo: string, abas: AbaLida[]): { erro: string } | { capa: Capa; revisao: string; nome: string; conteudo: Conteudo } {
  const faltam = abasFaltando(abas);
  if (faltam.length) return { erro: `Não parece um Machine Ledger: faltam as abas ${faltam.join(", ")}.` };
  const { capa, revisao } = lerCapa(acharAba(abas, "CAPA")!.linhas);
  const componentes = lerRcm(acharAba(abas, "RCM")!.linhas);
  if (!componentes.length) return { erro: "A aba do RCM não tem componentes (ou o cabeçalho \"Componente\"/\"COD SAP\" não foi encontrado)." };
  return { capa, revisao, nome: nomeDoArquivo(arquivo), conteudo: { componentes, plano: lerPlano(acharAba(abas, "PLANO MESTRE")!.linhas),
    pecas: lerPecas(acharAba(abas, "GT_SPARE_PARTS")!.linhas) } };
}

// ----------------------------------------------------------------------------
// Cadastros (índice, conteúdo)
// ----------------------------------------------------------------------------
const ehObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const lista = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
export const idValido = (id: unknown): id is string => typeof id === "string" && /^ml-[a-z0-9]{4,40}$/.test(id);
export const equipValido = (e: unknown): e is string => typeof e === "string" && /^[A-Z0-9][A-Z0-9._\-]{0,29}$/.test(e);
export const limparEquipamentos = (xs: unknown): string[] =>
  [...new Set(lista(xs).map((x) => semZeros(txt(x, 30).toUpperCase())).filter(equipValido))].slice(0, 50);

export function indiceDe(cad: Record<string, unknown>): Indice[] {
  return Object.entries(cad).filter(([id, v]) => idValido(id) && ehObj(v)).map(([id, v0]) => {
    const v = v0 as Record<string, unknown>, c = ehObj(v.capa) ? v.capa : {}, n = ehObj(v.contagens) ? v.contagens : {};
    return {
      id, arquivo: txt(v.arquivo, 200), nome: txt(v.nome, 120) || id, tipo: v.tipo === "modelo" ? "modelo" : "maquina", revisao: txt(v.revisao, 20),
      capa: { maquina: txt(c.maquina, 120), fabricante: txt(c.fabricante, 80), modelo: txt(c.modelo, 80), area: txt(c.area, 80), funcao: txt(c.funcao, 600) },
      equipamentos: limparEquipamentos(v.equipamentos), origem: v.origem === "confirmada" ? "confirmada" : "automatica",
      sugestoes: lista(v.sugestoes).filter(ehObj).map((s) => ({ sap: semZeros(txt(s.sap, 30)), denominacao: txt(s.denominacao, 120),
        confianca: txt(s.confianca, 20), motivo: txt(s.motivo, 200) })).filter((s) => s.sap),
      contagens: { componentes: Number(n.componentes) || 0, plano: Number(n.plano) || 0, pecas: Number(n.pecas) || 0 },
      enviadoEm: txt(v.enviadoEm, 40), enviadoPor: txt(v.enviadoPor, 80), confirmadoEm: txt(v.confirmadoEm, 40), confirmadoPor: txt(v.confirmadoPor, 80),
    } satisfies Indice;
  }).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR", { numeric: true }));
}

/** O item do índice para gravar (sem o id). */
export function itemIndice(i: Omit<Indice, "id">): Record<string, unknown> {
  return { ...i, equipamentos: limparEquipamentos(i.equipamentos) };
}

/** Código como veio da planilha, sem o ".0" que o Excel põe em número (9990001.0 → 9990001). */
export const limparCodigo = (v: unknown) => txt(v, 40).replace(/^(\d+)\.0+$/, "$1");
const numOuNull = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : v == null || v === "" ? null : num(v));
const boolOuNull = (v: unknown): boolean | null => (typeof v === "boolean" ? v : v == null || v === "" ? null : sn(v));

/**
 * Conteúdo de um ledger campo a campo (texto com limite, número, S/N): vale para a leitura do cadastro e para o que o
 * navegador manda no envio (nada além desses campos é gravado). Linhas acima de MAX_LINHAS são cortadas.
 */
export function sanitizarConteudo(v: unknown): Conteudo {
  const l = ehObj(v) ? v : {};
  const comp = (x: Record<string, unknown>): Componente => ({
    equip: txt(x.equip, 160), conjunto: txt(x.conjunto, 160), subconjunto: txt(x.subconjunto, 160), componente: txt(x.componente, 200),
    codigo: limparCodigo(x.codigo), qtd: txt(x.qtd, 20), funcao: txt(x.funcao), falha: txt(x.falha), deterioracao: txt(x.deterioracao, 40), modo: txt(x.modo),
    efeito: txt(x.efeito), evidente: x.evidente === true, oculta: x.oculta === true, seguranca: boolOuNull(x.seguranca), qualidade: boolOuNull(x.qualidade),
    parada: boolOuNull(x.parada), p: numOuNull(x.p), t: numOuNull(x.t), v: numOuNull(x.v), h: numOuNull(x.h),
    classe: /^[ABC]$/.test(txt(x.classe, 2)) ? txt(x.classe, 2) : "", tipoManut: txt(x.tipoManut, 20) });
  const ativ = (x: Record<string, unknown>): Atividade => ({
    conjunto: txt(x.conjunto, 160), subconjunto: txt(x.subconjunto, 160), componente: txt(x.componente, 200), atividade: txt(x.atividade),
    cilr: txt(x.cilr, 60), tipo: txt(x.tipo, 60), tempoMin: numOuNull(x.tempoMin), periodicidade: txt(x.periodicidade, 40), mec: numOuNull(x.mec),
    ele: numOuNull(x.ele), procedimento: txt(x.procedimento, 120), planoSap: limparCodigo(x.planoSap) });
  const peca = (x: Record<string, unknown>): Peca => ({
    conjunto: txt(x.conjunto, 160), codigo: limparCodigo(x.codigo), descricao: txt(x.descricao, 200), consumivel: txt(x.consumivel, 40),
    classe: txt(x.classe, 40), estrategico: x.estrategico === true, reserva: x.reserva === true, estSegAlmox: numOuNull(x.estSegAlmox),
    valorUnit: numOuNull(x.valorUnit), area: txt(x.area, 60), posicao: txt(x.posicao, 60), estSegUbm: numOuNull(x.estSegUbm) });
  return {
    componentes: lista(l.componentes).filter(ehObj).slice(0, MAX_LINHAS).map(comp).filter((c) => c.componente),
    plano: lista(l.plano).filter(ehObj).slice(0, MAX_LINHAS).map(ativ).filter((a) => a.atividade),
    pecas: lista(l.pecas).filter(ehObj).slice(0, MAX_LINHAS).map(peca).filter((x) => x.descricao),
  };
}

export function conteudoDe(cad: Record<string, unknown>): Conteudo {
  return sanitizarConteudo(cad.ledger);
}

/** O ledger do índice com o mesmo arquivo ou o mesmo nome (normalizados): reenviar não cria outro. */
export function ledgerDoMesmoNome(indice: Pick<Indice, "id" | "arquivo" | "nome">[], arquivo: string, nome: string): string | null {
  const a = norm(nomeDoArquivo(arquivo)), n = norm(nome);
  return indice.find((i) => norm(nomeDoArquivo(i.arquivo)) === a || (!!n && norm(i.nome) === n))?.id ?? null;
}

/** id estável para um arquivo novo: "ml-" + hash curto do nome. */
export function idPara(arquivo: string): string {
  let h = 2166136261;
  for (const ch of norm(nomeDoArquivo(arquivo))) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; }
  return `ml-${h.toString(16).padStart(8, "0")}`;
}

// ----------------------------------------------------------------------------
// Catálogo do Sysmat e MB52 (resolução de códigos)
// ----------------------------------------------------------------------------
export interface ItemCat { material: string; descricao: string; descrCompleta: string; status: string; para: string; sysmat: string; pdm: string; um: string }
export interface BaseCodigos {
  cat: Map<string, ItemCat> | null;
  porSysmat: Map<string, string>;
  /** descrição curta normalizada → código (null = mais de um código com a mesma descrição) */
  porDescricao: Map<string, string | null>;
  /** saldo na MB52 por código (sem zeros); null = sem a base */
  saldo: Map<string, { estoque: number; um: string; descricao: string }> | null;
}
export const INATIVOS = new Set(["BLOQUEADO", "CANCELADO", "DUPLICADO"]);

export function indexarBase(catalogo: { material: string; sysmat: string; substituto: string; descricaoCurta: string; descrCompleta: string; status: string; pdm: string; um?: string }[] | null,
  estoque: { material: string; descricao: string; um: string; estoque: number }[] | null): BaseCodigos {
  let cat: Map<string, ItemCat> | null = null;
  const porSysmat = new Map<string, string>(), porDescricao = new Map<string, string | null>();
  if (catalogo) {
    cat = new Map();
    for (const c of catalogo) {
      if (!c.material) continue;
      const k = semZeros(c.material);
      if (cat.has(k)) continue;
      cat.set(k, { material: k, descricao: c.descricaoCurta, descrCompleta: c.descrCompleta, status: (c.status || "").toUpperCase(),
        para: semZeros(c.substituto || ""), sysmat: c.sysmat, pdm: c.pdm, um: c.um ?? "" });
      if (c.sysmat) porSysmat.set(semZeros(c.sysmat), k);
      if (INATIVOS.has((c.status || "").toUpperCase())) continue;
      const d = norm(c.descricaoCurta);
      if (d) porDescricao.set(d, porDescricao.has(d) && porDescricao.get(d) !== k ? null : k);
    }
  }
  let saldo: BaseCodigos["saldo"] = null;
  if (estoque) {
    saldo = new Map();
    for (const e of estoque) {
      const k = semZeros(e.material), a = saldo.get(k);
      saldo.set(k, { estoque: (a?.estoque ?? 0) + (Number(e.estoque) || 0), um: e.um, descricao: e.descricao });
    }
  }
  return { cat, porSysmat, porDescricao, saldo };
}

export type SituacaoCodigo = "ok" | "bloqueado" | "inexistente" | "sem_codigo";
export interface Resolvido { codigo: string; situacao: SituacaoCodigo; origem: "ledger" | "sysmat" | "descricao" | ""; para: string; status: string }

/**
 * O código SAP de uma peça/componente do ledger:
 * - só dígitos, 5 a 7 (o ".0" do Excel já sai na leitura) = código SAP;
 * - "SysMat-<nº>" ou 8 dígitos começando por 2006 = código Sysmat, convertido pelo catálogo;
 * - qualquer outro texto (código do fabricante, desenho, com letras ou pontuação) ou vazio = sem código SAP → procura a
 *   descrição curta exata (e única) no catálogo.
 * BLOQUEADO no Sysmat = "bloqueado" (aviso de compra, não código inválido); inexistente, CANCELADO ou DUPLICADO = "inexistente"
 * (com o "Para" do catálogo, se houver). "SysMat-…" que não está no catálogo também é inexistente; 8 dígitos sem prefixo, não.
 */
export function resolverCodigo(bruto: string, descricao: string, b: BaseCodigos): Resolvido {
  const s = limparCodigo(bruto);
  const vazio: Resolvido = { codigo: "", situacao: "sem_codigo", origem: "", para: "", status: "" };
  const sap = /^\d{5,7}$/.test(s) ? semZeros(s) : "";
  const pref = /^SYS\s*-?\s*MAT\W*(\d{5,9})$/i.exec(s)?.[1];
  const sysmat = pref ?? (/^2006\d{4}$/.test(s) ? s : "");
  if (!b.cat) return sap ? { ...vazio, codigo: sap, situacao: "ok", origem: "ledger" } : vazio;
  const achou = (k: string, origem: Resolvido["origem"]): Resolvido => {
    const c = b.cat!.get(k)!;
    const situacao: SituacaoCodigo = c.status === "BLOQUEADO" ? "bloqueado" : INATIVOS.has(c.status) ? "inexistente" : "ok";
    return { codigo: k, situacao, origem, para: c.para, status: c.status };
  };
  if (sap) {
    if (b.cat.has(sap)) return achou(sap, "ledger");
    if (b.porSysmat.has(sap)) return achou(b.porSysmat.get(sap)!, "sysmat");
    return { codigo: sap, situacao: "inexistente", origem: "ledger", para: "", status: "" };
  }
  if (sysmat) {
    const k = b.porSysmat.get(semZeros(sysmat));
    if (k) return achou(k, "sysmat");
    if (pref) return { codigo: semZeros(sysmat), situacao: "inexistente", origem: "sysmat", para: "", status: "" };
  }
  const porDesc = b.porDescricao.get(norm(descricao));
  if (porDesc) return achou(porDesc, "descricao");
  return vazio;
}

// ----------------------------------------------------------------------------
// Pente fino do MRO
// ----------------------------------------------------------------------------
export const TIPOS_ACHADO = {
  faltando: "Faltando no ativo",
  sem_respaldo: "Vinculada sem respaldo",
  codigo_invalido: "Código inválido",
  bloqueado: "Bloqueado para compra",
  descricao_divergente: "Descrição divergente",
  estrategico_sem_saldo: "Estratégico sem saldo",
  reserva_sem_saldo: "Estocagem recomendada sem saldo",
  ledger_copiado: "Ledger copiado",
} as const;
export type TipoAchado = keyof typeof TIPOS_ACHADO;
/** Achados do próprio ledger (valem para todos os equipamentos dele); os outros são do vínculo de um ativo. */
export const DO_LEDGER = new Set<TipoAchado>(["codigo_invalido", "bloqueado", "descricao_divergente", "estrategico_sem_saldo", "reserva_sem_saldo", "ledger_copiado"]);
export interface Achado {
  chave: string; tipo: TipoAchado; ledger: string; ledgerNome: string;
  /** os ativos afetados (o próprio, nos achados de vínculo; os do ledger, nos do próprio ledger) */
  ativos: string[]; codigo: string; descricao: string; detalhe: string;
  /** "vincular" | "desvincular": a ação de vínculo da linha (no `ativos[0]`) */
  acao: "vincular" | "desvincular" | null;
  forte?: boolean; para?: string;
  /** sem respaldo de código vinculado a muitos ativos (≥ 3 ou ≥ 20% dos ativos com ledger) */
  usoGeral?: boolean;
  /** fora da MB52 de hoje (nunca esteve no estoque, pelo export atual) */
  foraMb52?: boolean;
  /** aviso secundário: oculto por padrão (sem respaldo sem sinal forte; estocagem recomendada sem saldo) */
  secundario?: boolean;
  /** de onde veio o código do ledger (RCM, peça de reposição, Sysmat pela descrição) */
  origemCodigo?: OrigemCodigo;
}
export const chaveAchado = (tipo: TipoAchado, alvo: string, codigo: string) => `${tipo}|${alvo}|${codigo}`;

const PARADAS = new Set(["DE", "DA", "DO", "DAS", "DOS", "PARA", "COM", "SEM", "TIPO", "MOD", "REF", "UND", "PCS", "PECA", "MM", "POL"]);
/** Palavras que contam na comparação de descrições (≥ 3 letras, ou números com 2+ dígitos), plural reduzido. */
export function palavras(t: string): Set<string> {
  return new Set(norm(t).split(" ").filter((w) => (w.length >= 3 && !PARADAS.has(w)) || /^\d{2,}$/.test(w)).map((w) => (w.length > 4 && w.endsWith("S") ? w.slice(0, -1) : w)));
}
/** As duas descrições têm alguma palavra em comum? */
export const semelhantes = (a: string, b: string) => {
  const pa = palavras(a);
  if (!pa.size) return true;
  const pb = palavras(b);
  for (const w of pa) if (pb.has(w)) return true;
  return false;
};

/** Números soltos de um texto ("MOINHO SF 05" → {5}). */
const numeros = (t: string) => new Set(norm(t).split(" ").filter((w) => /^\d{1,3}$/.test(w)).map((w) => String(Number(w))));

/** As linhas do RCM que apontam outra máquina (número diferente do nome do ledger): o texto mais comum e quantas. */
export function rcmDeOutraMaquina(nome: string, componentes: Pick<Componente, "equip">[]): { texto: string; linhas: number } | null {
  const meus = numeros(nome);
  // faixa no nome ("INJ 15 a 19", "15-19"): todos os números dela
  for (const m of norm(nome.replace(/(\d)\s*-\s*(\d)/g, "$1 A $2")).matchAll(/\b(\d{1,3}) (?:A|AO|ATE) (\d{1,3})\b/g))
    for (let n = Number(m[1]); n <= Number(m[2]) && n - Number(m[1]) < 50; n++) meus.add(String(n));
  if (!meus.size) return null;
  const conta = new Map<string, number>();
  for (const c of componentes) {
    const ns = numeros(c.equip);
    if (!ns.size || [...ns].some((n) => meus.has(n))) continue;
    conta.set(c.equip, (conta.get(c.equip) ?? 0) + 1);
  }
  if (!conta.size) return null;
  const [texto, linhas] = [...conta].sort((a, b) => b[1] - a[1])[0];
  return { texto, linhas: [...conta.values()].reduce((s, n) => s + n, 0) || linhas };
}

export type OrigemCodigo = "RCM" | "peça de reposição" | "Sysmat pela descrição" | "Sysmat pela referência" | "";

// ----------------------------------------------------------------------------
// Referência do fabricante (código do componente no nome: XY1-AB-123CD, 9876.54.32/1, 6205-2Z)
// ----------------------------------------------------------------------------
const SEPARA_PALAVRAS = /[\s,;:()[\]{}_*'"“”]+/;
const MEDIDA = /^\d+(?:[.,]\d+)?(?:MM|CM|M|MTS?|V|VCC|VAC|VDC|A|MA|W|KW|CV|HP|BAR|PSI|RPM|KG|G|L|ML|HZ|KHZ|KVA|NM|MCA|POL|PC|UN|X\d+)$/;
const compacta = (w: string) => w.replace(/[-./\\]/g, "");
/**
 * Tokens de referência de um texto: palavras (separadas por espaço, vírgula, dois-pontos, parênteses, sublinhado…) com dígito e
 * letra, ou com hífen/ponto/barra, que tenham 5+ caracteres depois de tirar os separadores; medidas puras (22MM, 24VCC,
 * 220V, 1/2") ficam fora. O token sai compacto (sem - . / \\) e em maiúsculas.
 */
export function tokensReferencia(texto: string): string[] {
  const out = new Set<string>();
  for (const bruto of semAcento(txt(texto, 2000)).toUpperCase().split(SEPARA_PALAVRAS)) {
    const w = bruto.replace(/^[-./\\]+|[-./\\]+$/g, "");
    const c = compacta(w);
    if (c.length < 5 || !/^[A-Z0-9]+$/.test(c) || MEDIDA.test(c) || MEDIDA.test(w)) continue;
    const temSep = /[-./\\]/.test(w), temLetra = /[A-Z]/.test(c), temDigito = /\d/.test(c);
    if ((temLetra && temDigito) || (temSep && temDigito)) out.add(c);
  }
  return [...out];
}
const MAX_POR_TOKEN = 6;
const indicesRef = new WeakMap<object, Map<string, string[]>>();
/** Token → materiais (Descr Curta + Descr Completa; aprovados e bloqueados, sem cancelado/duplicado). Guardado por catálogo. */
export function indiceReferencias(b: BaseCodigos): Map<string, string[]> {
  if (!b.cat) return new Map();
  let m = indicesRef.get(b.cat);
  if (m) return m;
  m = new Map();
  for (const c of b.cat.values()) {
    if (c.status === "CANCELADO" || c.status === "DUPLICADO") continue;
    for (const t of tokensReferencia(`${c.descricao} ${c.descrCompleta}`)) {
      const l = m.get(t) ?? [];
      if (l.length < MAX_POR_TOKEN && !l.includes(c.material)) l.push(c.material);
      m.set(t, l);
    }
  }
  indicesRef.set(b.cat, m);
  return m;
}
export interface PorReferencia { codigo: string; token: string; candidatos: { codigo: string; descricao: string }[] }
/**
 * Material do Sysmat pela referência do texto: aceito só quando os tokens apontam UM único material (o primeiro token com um
 * único material; dois tokens com materiais únicos diferentes = ambíguo). Ambíguo: `codigo` vazio e até 5 candidatos.
 */
export function porReferencia(texto: string, b: BaseCodigos): PorReferencia | null {
  const idx = indiceReferencias(b);
  const unicos = new Map<string, string>(); // material → token
  let ambiguo: { token: string; mats: string[] } | null = null;
  for (const t of tokensReferencia(texto)) {
    const mats = idx.get(t);
    if (!mats?.length) continue;
    if (mats.length === 1) { if (!unicos.has(mats[0])) unicos.set(mats[0], t); }
    else if (!ambiguo) ambiguo = { token: t, mats };
  }
  const desc = (k: string) => ({ codigo: k, descricao: b.cat?.get(k)?.descricao ?? "" });
  if (unicos.size === 1) { const [[codigo, token]] = [...unicos]; return { codigo, token, candidatos: [desc(codigo)] }; }
  if (unicos.size > 1) return { codigo: "", token: [...unicos.values()].join(", "), candidatos: [...unicos.keys()].slice(0, 5).map(desc) };
  if (ambiguo) return { codigo: "", token: ambiguo.token, candidatos: ambiguo.mats.slice(0, 5).map(desc) };
  return null;
}
/** Descrição normalizada para casar componente × peça de reposição (sem acento, maiúsculas, espaços colapsados). */
export const descricaoNorm = (t: string) => semAcento(txt(t, 400)).toUpperCase().replace(/\s+/g, " ").trim();
/** Peças de reposição do ledger por descrição normalizada. */
export function pecasPorDescricao(pecas: Peca[]): Map<string, Peca[]> {
  const m = new Map<string, Peca[]>();
  for (const p of pecas) { const k = descricaoNorm(p.descricao); if (k) m.set(k, [...(m.get(k) ?? []), p]); }
  return m;
}
/**
 * `sugerido`: código achado pela referência (precisa da confirmação do PCM para a IA06); `candidatos`: referência ambígua
 * (o PCM escolhe um); `referencia`: o token usado.
 */
export type ResolvidoComOrigem = Resolvido & { origemCodigo: OrigemCodigo; sugerido?: boolean; candidatos?: { codigo: string; descricao: string }[]; referencia?: string };
/**
 * O código SAP de um componente do RCM: o do próprio RCM, se for válido; senão o da peça de reposição (GT_SPARE_PARTS) do
 * mesmo ledger com a descrição idêntica (normalizada; desempate: mesmo conjunto); senão a descrição curta exata no Sysmat.
 * Sem nada disso, o resultado do RCM (inexistente, bloqueado ou sem código).
 */
export function codigoDoComponente(c: Pick<Componente, "codigo" | "componente" | "conjunto">, porDesc: Map<string, Peca[]>, b: BaseCodigos): ResolvidoComOrigem {
  const r = resolverCodigo(c.codigo, "", b);
  if (r.situacao === "ok") return { ...r, origemCodigo: "RCM" };
  const cands = porDesc.get(descricaoNorm(c.componente)) ?? [];
  const ordem = [...cands.filter((p) => norm(p.conjunto) === norm(c.conjunto)), ...cands.filter((p) => norm(p.conjunto) !== norm(c.conjunto))];
  for (const p of ordem) {
    const rp = resolverCodigo(p.codigo, p.descricao, b);
    if (rp.situacao === "ok") return { ...rp, origemCodigo: rp.origem === "descricao" ? "Sysmat pela descrição" : "peça de reposição" };
  }
  const rd = resolverCodigo("", c.componente, b);
  if (rd.situacao === "ok") return { ...rd, origemCodigo: "Sysmat pela descrição" };
  // pela referência: o nome do componente e as peças de reposição de mesma descrição (sugestão para o PCM confirmar)
  const ref = porReferencia([c.componente, ...ordem.map((p) => p.descricao)].join(" "), b);
  if (ref?.codigo) {
    const st = b.cat!.get(ref.codigo)!.status;
    return { codigo: ref.codigo, situacao: st === "BLOQUEADO" ? "bloqueado" : "ok", origem: "", para: "", status: st, origemCodigo: "Sysmat pela referência",
      sugerido: true, referencia: ref.token, candidatos: ref.candidatos };
  }
  if (ref) return { ...r, origemCodigo: "Sysmat pela referência", sugerido: true, referencia: ref.token, candidatos: ref.candidatos };
  return { ...r, origemCodigo: r.codigo ? "RCM" : "" };
}
/** Origem do código de uma peça de reposição (o código dela ou a descrição curta no Sysmat). */
export const origemDaPeca = (r: Resolvido): OrigemCodigo => (r.origem === "descricao" ? "Sysmat pela descrição" : r.codigo ? "peça de reposição" : "");

/** As peças do ledger (spare parts + componentes do RCM), cada código uma vez, já resolvidas e com a origem do código. */
export interface PecaLedger { codigoLedger: string; descricao: string; r: Resolvido; peca: Peca | null; componente: Componente | null; origemCodigo: OrigemCodigo }
export function pecasResolvidas(l: Conteudo, b: BaseCodigos): PecaLedger[] {
  const out = new Map<string, PecaLedger>();
  const add = (codigoLedger: string, descricao: string, r: Resolvido, origemCodigo: OrigemCodigo, peca: Peca | null, componente: Componente | null) => {
    if (r.situacao === "sem_codigo") return;
    const a = out.get(r.codigo);
    if (a) { if (!a.peca && peca) a.peca = peca; if (!a.componente && componente) a.componente = componente; return; }
    out.set(r.codigo, { codigoLedger, descricao, r, peca, componente, origemCodigo });
  };
  for (const p of l.pecas) { const r = resolverCodigo(p.codigo, p.descricao, b); add(p.codigo, p.descricao, r, origemDaPeca(r), p, null); }
  const porDesc = pecasPorDescricao(l.pecas);
  for (const c of l.componentes) {
    // o código do próprio RCM entra sempre (inválido = achado); sem código válido, o da peça de reposição/Sysmat
    const r0 = resolverCodigo(c.codigo, "", b);
    if (r0.situacao !== "sem_codigo") add(c.codigo, c.componente, r0, "RCM", null, c);
    if (r0.situacao !== "ok") { const rc = codigoDoComponente(c, porDesc, b); if (rc.situacao === "ok" && !rc.sugerido) add(c.codigo, c.componente, rc, rc.origemCodigo, null, c); }
  }
  return [...out.values()];
}

/** Ledger para o pente fino: índice + conteúdo. */
export interface EntradaPente { indice: Indice; conteudo: Conteudo }
export const USO_GERAL_ATIVOS = 3, USO_GERAL_FRACAO = 0.2;

/**
 * Os achados do pente fino. `vinculados(ativo)` = os materiais do ativo em cadastro_equipamentos.json (os mesmos da
 * Gestão de MRO); `conferidos` = chaves marcadas "conferido, está certo" (somem da lista).
 */
export function penteFino(ledgers: EntradaPente[], vinculados: (ativo: string) => string[], b: BaseCodigos, conferidos: Set<string> = new Set()): Achado[] {
  const out: Achado[] = [];
  const push = (a: Achado) => { if (!conferidos.has(a.chave)) out.push(a); };
  const fabricantes = new Map<string, string>(); // ledger → fabricante normalizado
  for (const { indice } of ledgers) {
    const f = norm(indice.capa.fabricante).split(" ").find((w) => w.length >= 3) ?? "";
    if (f) fabricantes.set(indice.id, f);
  }
  // códigos do ledger por ativo (um ativo pode ter mais de um ledger)
  const porAtivo = new Map<string, { codigos: Map<string, { ledger: Indice; p: PecaLedger }>; fabs: Set<string>; ledger: Indice }>();
  const resolvidas = new Map<string, PecaLedger[]>();
  for (const { indice, conteudo } of ledgers) {
    const pecas = pecasResolvidas(conteudo, b);
    resolvidas.set(indice.id, pecas);
    for (const a of indice.equipamentos) {
      const x = porAtivo.get(a) ?? { codigos: new Map(), fabs: new Set<string>(), ledger: indice };
      porAtivo.set(a, x);
      if (fabricantes.has(indice.id)) x.fabs.add(fabricantes.get(indice.id)!);
      for (const p of pecas) if (p.r.situacao !== "inexistente" && p.r.situacao !== "sem_codigo" && !x.codigos.has(p.r.codigo)) x.codigos.set(p.r.codigo, { ledger: indice, p });
    }
  }
  const todosFabs = new Set(fabricantes.values());
  const vincPorAtivo = new Map([...porAtivo.keys()].map((a) => [a, new Set(vinculados(a).map(semZeros))]));
  // em quantos ativos com ledger cada código está vinculado (uso geral = parafuso, graxa, conexão…)
  const usos = new Map<string, number>();
  for (const v of vincPorAtivo.values()) for (const c of v) usos.set(c, (usos.get(c) ?? 0) + 1);
  const limiteUso = Math.max(1, Math.min(USO_GERAL_ATIVOS, Math.ceil(porAtivo.size * USO_GERAL_FRACAO)));
  // 1 e 2: vínculos por ativo
  for (const [ativo, x] of porAtivo) {
    const vinc = vincPorAtivo.get(ativo)!;
    for (const [cod, { ledger, p }] of x.codigos) {
      if (vinc.has(cod) || p.r.situacao !== "ok") continue;
      push({ chave: chaveAchado("faltando", ativo, cod), tipo: "faltando", ledger: ledger.id, ledgerNome: ledger.nome, ativos: [ativo], codigo: cod, origemCodigo: p.origemCodigo,
        descricao: b.cat?.get(cod)?.descricao || p.descricao, detalhe: `No ledger${p.peca?.conjunto ? ` (${p.peca.conjunto})` : p.componente?.conjunto ? ` (${p.componente.conjunto})` : ""} e não vinculada ao ativo.`, acao: "vincular" });
    }
    for (const cod of vinc) {
      if (x.codigos.has(cod)) continue;
      const c = b.cat?.get(cod);
      const texto = norm(`${c?.descricao ?? ""} ${c?.descrCompleta ?? ""}`);
      const outro = [...todosFabs].find((f) => !x.fabs.has(f) && new RegExp(`\\b${f}\\b`).test(texto));
      const proprio = [...x.fabs].some((f) => new RegExp(`\\b${f}\\b`).test(texto));
      const forte = !!outro && !proprio;
      const usoGeral = (usos.get(cod) ?? 0) >= limiteUso && porAtivo.size > 1;
      push({ chave: chaveAchado("sem_respaldo", ativo, cod), tipo: "sem_respaldo", ledger: x.ledger.id, ledgerNome: x.ledger.nome, ativos: [ativo],
        codigo: cod, descricao: c?.descricao || b.saldo?.get(cod)?.descricao || "", acao: "desvincular", forte, usoGeral, secundario: !forte,
        detalhe: forte ? `Vinculada ao ativo, fora do ledger, e a descrição cita outro fabricante (${outro}).`
          : usoGeral ? `Fora do ledger, mas vinculada em ${usos.get(cod)} ativos com ledger (uso geral).` : "Vinculada ao ativo e fora do ledger da máquina." });
    }
  }
  // 3 a 7: o próprio ledger
  for (const { indice, conteudo } of ledgers) {
    const alvo = indice.id;
    for (const p of resolvidas.get(alvo) ?? []) {
      const base = { ledger: alvo, ledgerNome: indice.nome, ativos: indice.equipamentos, acao: null, origemCodigo: p.origemCodigo } as const;
      const c = b.cat?.get(p.r.codigo);
      const paraOk = !!p.r.para && !!b.cat?.get(p.r.para) && !INATIVOS.has(b.cat!.get(p.r.para)!.status);
      if (p.r.situacao === "inexistente") {
        push({ ...base, chave: chaveAchado("codigo_invalido", alvo, p.r.codigo), tipo: "codigo_invalido", codigo: p.r.codigo, descricao: p.descricao,
          para: paraOk ? p.r.para : "", detalhe: p.r.status ? `Código ${p.r.status.toLowerCase()} no Sysmat${paraOk ? ` — usar o "Para" ${p.r.para}` : ""}.`
            : p.r.origem === "sysmat" ? "Código Sysmat que não está no catálogo." : "Código não existe no catálogo do Sysmat (ou foi cancelado/duplicado e saiu do banco)." });
        continue;
      }
      if (p.r.situacao === "bloqueado")
        push({ ...base, chave: chaveAchado("bloqueado", alvo, p.r.codigo), tipo: "bloqueado", codigo: p.r.codigo, descricao: c?.descricao || p.descricao,
          para: paraOk ? p.r.para : "", detalhe: `Cadastro bloqueado para compra no Sysmat${paraOk ? ` — "Para" ${p.r.para}` : ""}.` });
      if (p.r.origem === "ledger" && c && !semelhantes(p.descricao, `${c.descricao} ${c.descrCompleta}`))
        push({ ...base, chave: chaveAchado("descricao_divergente", alvo, p.r.codigo), tipo: "descricao_divergente", codigo: p.r.codigo, descricao: p.descricao,
          detalhe: `No Sysmat: "${c.descricao}" — sem palavra em comum (provável código trocado).` });
      const pc = p.peca;
      if (pc && (pc.estrategico || pc.reserva) && b.saldo) {
        const e = b.saldo.get(p.r.codigo), s = e?.estoque ?? 0, seg = pc.estSegAlmox ?? 0;
        if (s <= 0 || seg > s) {
          const tipo: TipoAchado = pc.estrategico ? "estrategico_sem_saldo" : "reserva_sem_saldo";
          push({ ...base, chave: chaveAchado(tipo, alvo, p.r.codigo), tipo, codigo: p.r.codigo, descricao: c?.descricao || p.descricao, foraMb52: !e,
            secundario: tipo === "reserva_sem_saldo",
            detalhe: `${pc.estrategico ? "Estratégico" : "Estocagem recomendada"}: ${!e ? "nunca esteve na MB52 (fora do export atual)" : `saldo MB52 ${s}`}${seg ? ` · estoque de segurança Almox ${seg}` : ""}.` });
        }
      }
    }
    const outra = rcmDeOutraMaquina(indice.nome, conteudo.componentes);
    if (outra)
      push({ ledger: alvo, ledgerNome: indice.nome, ativos: indice.equipamentos, acao: null, chave: chaveAchado("ledger_copiado", alvo, ""), tipo: "ledger_copiado", codigo: "", descricao: outra.texto,
        detalhe: `${outra.linhas} linha(s) do RCM apontam "${outra.texto}" (outra máquina).` });
  }
  return out;
}

export interface ResumoTipo { achados: number; codigos: number; ledgers: number }
export interface Resumo {
  porTipo: Record<TipoAchado, ResumoTipo>;
  /** achados do próprio ledger, por ledger (uma vez cada, com quantos equipamentos ele cobre) */
  porLedger: { ledger: string; nome: string; n: number; equipamentos: number }[];
  /** só os achados de vínculo (faltando, sem respaldo), por ativo */
  porAtivo: { ativo: string; n: number; porTipo: Partial<Record<TipoAchado, number>> }[];
}
/** Resumo por tipo (achados, códigos únicos, em quantos ledgers), por ledger e por ativo (só vínculo). */
export function resumoAchados(achados: Achado[], equipamentosDe: (ledger: string) => number = () => 0): Resumo {
  const porTipo = Object.fromEntries(Object.keys(TIPOS_ACHADO).map((k) => [k, { achados: 0, codigos: 0, ledgers: 0 }])) as Record<TipoAchado, ResumoTipo>;
  const cods = new Map<TipoAchado, Set<string>>(), leds = new Map<TipoAchado, Set<string>>();
  const ledgers = new Map<string, { nome: string; n: number }>();
  const ativos = new Map<string, { n: number; porTipo: Partial<Record<TipoAchado, number>> }>();
  for (const a of achados) {
    porTipo[a.tipo].achados++;
    (cods.get(a.tipo) ?? cods.set(a.tipo, new Set()).get(a.tipo)!).add(a.codigo || a.ledger);
    (leds.get(a.tipo) ?? leds.set(a.tipo, new Set()).get(a.tipo)!).add(a.ledger);
    if (DO_LEDGER.has(a.tipo)) {
      const l = ledgers.get(a.ledger) ?? { nome: a.ledgerNome, n: 0 };
      l.n++;
      ledgers.set(a.ledger, l);
    } else for (const at of a.ativos) {
      const x = ativos.get(at) ?? { n: 0, porTipo: {} };
      x.n++;
      x.porTipo[a.tipo] = (x.porTipo[a.tipo] ?? 0) + 1;
      ativos.set(at, x);
    }
  }
  for (const t of Object.keys(porTipo) as TipoAchado[]) { porTipo[t].codigos = cods.get(t)?.size ?? 0; porTipo[t].ledgers = leds.get(t)?.size ?? 0; }
  return {
    porTipo,
    porLedger: [...ledgers].map(([ledger, x]) => ({ ledger, nome: x.nome, n: x.n, equipamentos: equipamentosDe(ledger) })).sort((a, b) => b.n - a.n || a.nome.localeCompare(b.nome)),
    porAtivo: [...ativos].map(([ativo, x]) => ({ ativo, ...x })).sort((a, b) => b.n - a.n || a.ativo.localeCompare(b.ativo)),
  };
}

/** Filtro padrão da lista: esconde os avisos secundários (a não ser que peça "todos"). */
export const visivel = (a: Achado, todos: boolean) => todos || !a.secundario;

// ----------------------------------------------------------------------------
// Permissões
// ----------------------------------------------------------------------------
interface UsuarioMin { perfil?: string; funcao?: string; abas?: unknown }
/** Grava (correspondência, vínculos, conferido, envio de ledger): perfil de edição e fora de Terceiro/Manutentor, como a Gestão de MRO. */
export function podeGravar(u: UsuarioMin | null, veAba: boolean): boolean {
  return !!u && veAba && (u.perfil === "admin" || u.perfil === "editor") && !(u.funcao === "terceiro" || u.funcao === "manutentor");
}

// ----------------------------------------------------------------------------
// Quebras (Planos de AF / IW28) × componentes do RCM
// ----------------------------------------------------------------------------
export interface Quebra {
  /** "AF" (Planos de AF), "IW28" (nota de quebra) ou "IW38" (ordem YM11, quando a IW28 não traz notas Y1) */
  fonte: "AF" | "IW28" | "IW38"; numero: string; data: Dia | null; equipamento: string;
  conjunto: string; subconjunto: string; componente: string; texto: string; criticidade: string; os: string;
}
export type Nivel = "componente" | "subconjunto" | "conjunto" | "nenhum";
export interface Associacao { nivel: Nivel; /** índice do componente no RCM (nível componente) */ indice: number; rotulo: string }
export const NAO_ASSOCIADA = "Não associada ao componente";

/** Texto normalizado com plural reduzido, entre espaços (para procurar frases inteiras). */
export const frase = (t: string) => ` ${norm(t).split(" ").filter(Boolean).map((w) => (w.length > 4 && w.endsWith("S") ? w.slice(0, -1) : w)).join(" ")} `;
const SIGNIFICATIVA = (w: string) => w.length >= 3 && !PARADAS.has(w) && !/\d/.test(w);
/** A "chave" do nome do componente: as duas primeiras palavras significativas ("VÁLVULA SOLENÓIDE XY1-AB-123CD" → "VALVULA SOLENOIDE"). */
export function chaveNome(nome: string): string {
  const ws = frase(nome).trim().split(" ").filter(SIGNIFICATIVA);
  return ws.slice(0, 2).join(" ");
}

/**
 * Associa a quebra ao RCM pelo texto (componente, subconjunto, conjunto e descrição da falha, sem acento), do mais
 * específico ao mais geral: (1) componente — o nome da AF bate com o do componente, ou a chave do nome do componente
 * (2 primeiras palavras) aparece no texto, ou, valendo menos, só a 1ª palavra (≥ 5 letras); vence quem casa mais e, no
 * empate, o que também tem o subconjunto/conjunto no texto (depois, o primeiro do RCM); (2) subconjunto citado no texto; (3) conjunto citado; senão, "Não associada ao componente".
 */
export function associarQuebra(q: Pick<Quebra, "conjunto" | "subconjunto" | "componente" | "texto">, comps: Pick<Componente, "conjunto" | "subconjunto" | "componente">[]): Associacao {
  const T = frase(`${q.componente} ${q.subconjunto} ${q.conjunto} ${q.texto}`);
  const qc = frase(q.componente).trim();
  let melhor: { i: number; pontos: number } | null = null;
  comps.forEach((c, i) => {
    const k = chaveNome(c.componente);
    if (!k) return;
    const k1 = k.split(" ")[0];
    const nomeC = frase(c.componente).trim();
    // nome completo da AF = do componente, ou a chave (2 palavras) no texto; só a 1ª palavra (≥ 5 letras) vale menos
    const casa2 = (qc && (nomeC === qc || nomeC.startsWith(`${qc} `) || ` ${qc} `.includes(` ${k} `))) || T.includes(` ${k} `);
    const casa1 = !casa2 && k1.length >= 5 && T.includes(` ${k1} `);
    if (!casa2 && !casa1) return;
    const extra = (c.subconjunto && T.includes(frase(c.subconjunto)) ? 2 : 0) + (c.conjunto && T.includes(frase(c.conjunto)) ? 1 : 0);
    const pontos = (casa2 ? 10 * k.split(" ").length + 10 : 10) + extra;
    if (!melhor || pontos > melhor.pontos) melhor = { i, pontos };
  });
  if (melhor) return { nivel: "componente", indice: (melhor as { i: number }).i, rotulo: comps[(melhor as { i: number }).i].componente };
  const procura = (campo: "subconjunto" | "conjunto") => {
    let achado = "";
    for (const c of comps) {
      const f = c[campo] && frase(c[campo]);
      if (f && f.trim() && T.includes(f) && f.length > achado.length) achado = c[campo];
    }
    return achado;
  };
  const sub = procura("subconjunto");
  if (sub) return { nivel: "subconjunto", indice: -1, rotulo: sub };
  const conj = procura("conjunto");
  if (conj) return { nivel: "conjunto", indice: -1, rotulo: conj };
  return { nivel: "nenhum", indice: -1, rotulo: NAO_ASSOCIADA };
}

export interface LinhaCalendario {
  chave: string; rotulo: string; nivel: Nivel; indice: number; conjunto: string; subconjunto: string; h: number | null; classe: string;
  /** contagem por mês (0–11) e por semana do mês (0–4) */
  meses: number[]; semanas: number[][]; total: number; quebras: Quebra[];
}

/** Semana do mês (0 = dias 1–7 … 4 = 29–31). */
export const semanaDoMes = (d: Dia) => Math.min(4, Math.floor((partes(d).dia - 1) / 7));

/**
 * Calendário de quebras do ano: uma linha por componente (ou subconjunto/conjunto, quando a quebra só cita esse nível) com
 * as quebras por mês e semana; as não associadas ficam numa linha no fim. Ordem: mais quebras primeiro.
 */
export function calendarioQuebras(comps: Componente[], quebras: Quebra[], ano: number): LinhaCalendario[] {
  const linhas = new Map<string, LinhaCalendario>();
  for (const q of quebras) {
    if (q.data == null || partes(q.data).ano !== ano) continue;
    const a = associarQuebra(q, comps);
    const chave = a.nivel === "componente" ? `c${a.indice}` : `${a.nivel}|${a.rotulo}`;
    let l = linhas.get(chave);
    if (!l) {
      const c = a.nivel === "componente" ? comps[a.indice] : null;
      l = { chave, rotulo: a.nivel === "componente" ? a.rotulo : a.nivel === "nenhum" ? NAO_ASSOCIADA : `${a.rotulo} (${a.nivel}, sem componente)`,
        nivel: a.nivel, indice: a.indice, conjunto: c?.conjunto ?? "", subconjunto: c?.subconjunto ?? "", h: c ? indiceH(c) : null, classe: c ? classeDe(c) : "",
        meses: Array(12).fill(0), semanas: Array.from({ length: 12 }, () => Array(5).fill(0)), total: 0, quebras: [] };
      linhas.set(chave, l);
    }
    const m = partes(q.data).mes - 1;
    l.meses[m]++;
    l.semanas[m][semanaDoMes(q.data)]++;
    l.total++;
    l.quebras.push(q);
  }
  return [...linhas.values()].sort((a, b) => Number(a.nivel === "nenhum") - Number(b.nivel === "nenhum") || b.total - a.total || a.rotulo.localeCompare(b.rotulo));
}

export interface SinalQuebra { rotulo: string; conjunto: string; h: number | null; classe: string; quebras: number; sinal: "rcm_subestimado" | "h_alto_sem_plano" }
/**
 * Quebras × índice H: componente com quebra recorrente (2+ no período) e H baixo (≤ 5 ou classe C) = RCM subestimado;
 * componente de H alto (≥ 9 ou classe A) sem atividade no Plano Mestre (pelo nome do componente) = H alto sem plano.
 */
export function sinaisQuebra(comps: Componente[], plano: Atividade[], quebras: Quebra[]): SinalQuebra[] {
  const cont = new Map<number, number>();
  for (const q of quebras) {
    const a = associarQuebra(q, comps);
    if (a.nivel === "componente") cont.set(a.indice, (cont.get(a.indice) ?? 0) + 1);
  }
  const noPlano = plano.map((p) => frase(`${p.componente} ${p.atividade}`));
  const out: SinalQuebra[] = [];
  const vistos = new Set<string>();
  comps.forEach((c, i) => {
    const h = indiceH(c), classe = classeDe(c), n = cont.get(i) ?? 0;
    const k = norm(c.componente);
    if (vistos.has(k)) return;
    if (n >= 2 && ((h != null && h <= 5) || classe === "C")) { out.push({ rotulo: c.componente, conjunto: c.conjunto, h, classe, quebras: n, sinal: "rcm_subestimado" }); vistos.add(k); return; }
    const chave = chaveNome(c.componente);
    if (((h != null && h >= 9) || classe === "A") && chave && !noPlano.some((t) => t.includes(` ${chave} `))) {
      out.push({ rotulo: c.componente, conjunto: c.conjunto, h, classe, quebras: n, sinal: "h_alto_sem_plano" });
      vistos.add(k);
    }
  });
  return out.sort((a, b) => Number(a.sinal !== "rcm_subestimado") - Number(b.sinal !== "rcm_subestimado") || b.quebras - a.quebras || (b.h ?? 0) - (a.h ?? 0));
}

// ----------------------------------------------------------------------------
// Outros cruzamentos
// ----------------------------------------------------------------------------
export interface Consumido { material: string; descricao: string; ordens: number; quantidade: number }
/** IW13 × ledger: consumidas no ativo e fora do ledger (candidatas a entrar) e quantas do ledger tiveram consumo. */
export function consumoXLedger(consumo: Consumido[], codigosLedger: Set<string>): { naoPrevistas: Consumido[]; previstasConsumidas: number } {
  const naoPrevistas = consumo.filter((c) => !codigosLedger.has(semZeros(c.material))).sort((a, b) => b.ordens - a.ordens || b.quantidade - a.quantidade);
  return { naoPrevistas, previstasConsumidas: consumo.length - naoPrevistas.length };
}

export interface PlanoSap { plano: string; texto: string }
/** IP19 × Plano Mestre: por código de plano quando o ledger traz; sem código, só a contagem dos dois lados. */
export function planoXIp19(plano: Atividade[], ip19: PlanoSap[]): { semPlanoSap: Atividade[]; semCodigo: number; foraDoLedger: PlanoSap[] } {
  const doSap = new Map(ip19.map((p) => [semZeros(p.plano), p]));
  const citados = new Set(plano.map((a) => semZeros(a.planoSap.replace(/\D/g, ""))).filter(Boolean));
  return {
    semPlanoSap: plano.filter((a) => a.planoSap && !doSap.has(semZeros(a.planoSap.replace(/\D/g, "")))),
    semCodigo: plano.filter((a) => !a.planoSap).length,
    foraDoLedger: [...doSap.values()].filter((p) => !citados.has(semZeros(p.plano))),
  };
}

/** Peças com estoque de segurança UBM > 0 (sugestão para o kit da UBM). */
export const sugestoesUbm = (pecas: Peca[]) => pecas.filter((p) => (p.estSegUbm ?? 0) > 0);

/** Árvore conjunto › subconjunto › componentes. */
export function arvore(comps: Componente[]): { conjunto: string; subs: { subconjunto: string; comps: Componente[] }[] }[] {
  const m = new Map<string, Map<string, Componente[]>>();
  for (const c of comps) {
    const a = m.get(c.conjunto || "—") ?? new Map<string, Componente[]>();
    m.set(c.conjunto || "—", a);
    const s = a.get(c.subconjunto || "—") ?? [];
    a.set(c.subconjunto || "—", s);
    s.push(c);
  }
  return [...m].map(([conjunto, subs]) => ({ conjunto, subs: [...subs].map(([subconjunto, cs]) => ({ subconjunto, comps: cs })) }));
}
