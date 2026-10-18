import { acharColuna, chave, paraNumero, texto } from "../dados/texto";
import { hoje as hojeLocal, inicioDoMes, paraData, partes, somarMeses, type Dia } from "./util";
import type { Nota } from "./preparo";

/**
 * Gerenciador de AF (análise de falha) — planos de AF e ações de AF.
 *
 * Lê as duas abas do "Gerenciador de AF" (Excel mantido pelo PCM): "Análise de Falha" (uma linha por AF) e
 * "Plano de ação AF" (uma linha por ação de cada AF). Testado em testes/af.test.ts.
 *
 * Convenções (legenda da aba Base_Dados do próprio gerenciador):
 * - Status da análise: AP = analisada no prazo, AFP = analisada fora do prazo, EA = em andamento, R = risco de
 *   atraso, NA = não analisada, CANCELADA.
 * - Nas ações o gerenciador usa os mesmos códigos (AP/AFP = concluída no/fora do prazo). Ação sem status e sem
 *   data realizada ainda não foi iniciada.
 * - O nº da AF é, em 98% dos casos, a ordem corretiva da quebra (Nº O.S Corretiva); o código SAP liga a AF ao
 *   equipamento (ficha, quebras e ordens do site).
 * - Os indicadores corporativos seguem a aba "RESUMO CORPORATIVO": taxa de análise de quebra crítica (A),
 *   execução de AFs e ações de AFs, com gerado × executado por data limite.
 */
type Crua = Record<string, unknown>;

// ----------------------------------------------------------------------------
// Situações
// ----------------------------------------------------------------------------
export const AF_NO_PRAZO = "Analisada no prazo", AF_FORA_PRAZO = "Analisada fora do prazo", AF_ATRASADA = "Atrasada",
  AF_RISCO = "Risco de atraso", AF_ANDAMENTO = "Em andamento", AF_CANCELADA = "Cancelada";
export const SITUACOES_AF = [AF_NO_PRAZO, AF_FORA_PRAZO, AF_ATRASADA, AF_RISCO, AF_ANDAMENTO, AF_CANCELADA] as const;
export type SituacaoAf = (typeof SITUACOES_AF)[number];
export const AF_CONCLUIDAS: readonly SituacaoAf[] = [AF_NO_PRAZO, AF_FORA_PRAZO];
export const AF_ABERTAS: readonly SituacaoAf[] = [AF_ATRASADA, AF_RISCO, AF_ANDAMENTO];

export const AC_NO_PRAZO = "Concluída no prazo", AC_FORA_PRAZO = "Concluída fora do prazo", AC_ATRASADA = "Atrasada",
  AC_VENCE = "Vence em até 7 dias", AC_ANDAMENTO = "Em andamento", AC_NAO_INICIADA = "Não iniciada",
  AC_CANCELADA = "Cancelada";
export const SITUACOES_ACAO = [AC_NO_PRAZO, AC_FORA_PRAZO, AC_ATRASADA, AC_VENCE, AC_ANDAMENTO, AC_NAO_INICIADA,
  AC_CANCELADA] as const;
export type SituacaoAcao = (typeof SITUACOES_ACAO)[number];
export const AC_CONCLUIDAS: readonly SituacaoAcao[] = [AC_NO_PRAZO, AC_FORA_PRAZO];
export const AC_ABERTAS: readonly SituacaoAcao[] = [AC_ATRASADA, AC_VENCE, AC_ANDAMENTO, AC_NAO_INICIADA];

/** Verde / laranja / vermelho do tema; amarelo de risco; azul e cinzas neutros. */
export const COR: Record<string, string> = {
  [AF_NO_PRAZO]: "#0E9F46", [AF_FORA_PRAZO]: "#F7931E", [AF_ATRASADA]: "#E3262B", [AF_RISCO]: "#F2B705",
  [AF_ANDAMENTO]: "#0A6EBD", [AF_CANCELADA]: "#B0B6B3",
  // "Atrasada", "Em andamento" e "Cancelada" são o mesmo rótulo (e a mesma cor) nas AFs e nas ações
  [AC_NO_PRAZO]: "#0E9F46", [AC_FORA_PRAZO]: "#F7931E", [AC_VENCE]: "#F2B705", [AC_NAO_INICIADA]: "#8C9491",
};

export const PILARES: Record<string, string> = {
  MP: "Manutenção Profissional", PR: "Projeto (fragilidade)", PS: "Peças sobressalentes / suprimentos",
  OA: "Operação / manutenção autônoma", PE: "Pessoas / educação",
};

/** As 4 colunas de marcação da ação. */
export const TIPOS_ACAO = ["Causa raiz", "TTR", "Padronização", "Expansão"] as const;
export type TipoAcao = (typeof TIPOS_ACAO)[number];
export const CAMPO_TIPO_ACAO: Record<TipoAcao, "causaRaiz" | "ttr" | "padronizacao" | "expansao"> = {
  "Causa raiz": "causaRaiz", TTR: "ttr", "Padronização": "padronizacao", "Expansão": "expansao",
};
/** Rótulo das telas para a ação sem nenhuma das 4 marcações. */
export const SEM_TIPO = "Sem tipo marcado";

// ----------------------------------------------------------------------------
// Registros
// ----------------------------------------------------------------------------
export interface Af {
  numero: string; tipoAnalise: string; area: string; areaFalha: string; codigoSap: string; equipamento: string;
  conjunto: string; subconjunto: string; componente: string; pilar: string; causaRaiz: string; especialidade: string;
  criticidade: string; osCorretiva: string; resumo: string; supervisor: string; turno: string; status: string;
  ajuste: string; link: string; observacoes: string;
  /** Horas (NaN se vazio). */
  duracaoParada: number;
  /** % das ações concluídas, 0–100 (NaN se vazio). */
  pctAcoesConcluidas: number;
  dataFalha: Dia | null; dataLimite: Dia | null; dataAnalise: Dia | null;
  situacao: SituacaoAf;
  /** Data da análise − data da falha (null sem uma das duas; pode ser negativo). */
  diasParaAnalise: number | null;
  /** Aberta e vencida: hoje − limite; analisada fora do prazo: análise − limite; senão 0 (null sem a data). */
  diasDeAtraso: number | null;
}

export interface AcaoAf {
  numeroAf: string; numeroAcao: string; tipoAnalise: string; area: string; areaFalha: string; codigoSap: string;
  equipamento: string; especialidade: string; osCorrecao: string; link: string; acao: string; supervisor: string;
  responsavel: string; status: string; ordemQuebra: string; observacoes: string;
  /** Marcações (caixas de seleção do Excel). */
  causaRaiz: boolean; ttr: boolean; padronizacao: boolean; expansao: boolean;
  dataInicio: Dia | null; dataLimite: Dia | null; dataRealizada: Dia | null;
  /** "<nº AF>-<nº ação>" */
  id: string;
  situacao: SituacaoAcao;
  diasDeAtraso: number | null;
  /** Data realizada − data de início (null sem uma das duas). */
  diasParaConcluir: number | null;
  /** "Causa raiz, Padronização" — as marcações, na ordem de TIPOS_ACAO. */
  tipoDaAcao: string;
  /** Dados da AF de origem (vazios sem a aba de análises). */
  afCadastrada: boolean; criticidade: string; pilar: string; causaRaizAf: string; dataFalha: Dia | null;
}

// ----------------------------------------------------------------------------
// Leitura
// ----------------------------------------------------------------------------
const AF_COLUNAS: Record<string, string[]> = {
  numero: ["^N DA ANALISE$"], tipoAnalise: ["^TIPO DE ANALISE$"], area: ["^AREA$"], areaFalha: ["^AREA DA FALHA$"],
  codigoSap: ["^COD SAP$"], equipamento: ["^EQUIPAMENTO$"], conjunto: ["^CONJUNTO$"], subconjunto: ["^SUBCONJUNTO$"],
  componente: ["^COMPONENTE$"], pilar: ["PILAR"], causaRaiz: ["^CAUSA RAIZ$"], especialidade: ["ESPECIAL"],
  criticidade: ["CRITICIDADE"], osCorretiva: ["O S CORRETIVA", "OS CORRETIVA"], resumo: ["RESUMO DA FALHA"],
  duracaoParada: ["DURACAO DA PARADA"], supervisor: ["SUPERVISOR"], turno: ["^TURNO$"], status: ["^STATUS DA ANALISE$"],
  dataFalha: ["^DATA DA FALHA$"], dataLimite: ["DATA LIMITE"], ajuste: ["^AJUSTE$|DATA AJUSTADA"],
  dataAnalise: ["^DATA DA ANALISE$"], pctAcoesConcluidas: ["^STATUS DAS ACOES$"], link: ["^LINK"],
  observacoes: ["OBSERVAC"],
};
const ACAO_COLUNAS: Record<string, string[]> = {
  numeroAf: ["^N DA ANALISE$"], numeroAcao: ["^N DA ACAO$"], tipoAnalise: ["^TIPO DE ANALISE$"], area: ["^AREA$"],
  areaFalha: ["^AREA DA FALHA$"], codigoSap: ["^COD SAP$"], equipamento: ["^EQUIPAMENTO$"],
  especialidade: ["ESPECIALIDADE"], osCorrecao: ["^O S DE CORRECAO"], link: ["^LINK$"], acao: ["^ACAO$"],
  causaRaiz: ["^CAUSA RAIZ$"], ttr: ["^TTR$"], padronizacao: ["^PADRONIZACAO$"], expansao: ["^EXPANSAO$"],
  supervisor: ["SUPERVISOR"], responsavel: ["^RESPONSAVEL$"], status: ["^STATUS$"], dataInicio: ["DATA DE INICIO"],
  dataLimite: ["DATA LIMITE"], dataRealizada: ["DATA REALIZADA"], ordemQuebra: ["ORDEM DA QUEBRA"],
  observacoes: ["OBSERVAC"],
};

/** Acha cada coluna pelo cabeçalho, sem repetir coluna já usada. */
function mapear(cru: Crua[], mapa: Record<string, string[]>): Record<string, string | null> {
  const colunas = cru.length ? Object.keys(cru[0]) : [];
  const usadas = new Set<string>();
  const out: Record<string, string | null> = {};
  for (const [nome, padroes] of Object.entries(mapa)) {
    const col = acharColuna(colunas.filter((c) => !usadas.has(c)), padroes);
    if (col) usadas.add(col);
    out[nome] = col;
  }
  return out;
}

const SEM_VALOR = /^[\s*#.\-_]*$/; // "***", "###", ".", "########" que o gerenciador usa como vazio

/** Texto limpo: espaços colapsados e os "vazios" do gerenciador viram "". */
function limpo(v: unknown): string {
  const s = texto(v).replace(/\s+/g, " ").trim();
  return SEM_VALOR.test(s) ? "" : s;
}

const RX_SERIAL = /^\d{5}(\.\d+)?$/;
const SERIAL_ZERO = -25569; // 30/12/1899 em dias desde 01/01/1970

/** Data da célula: texto (dd/mm/aaaa ou ISO), Date, ou número serial do Excel. */
export function paraDia(v: unknown): Dia | null {
  if (v == null || v === "") return null;
  if (v instanceof Date) return Number.isNaN(+v) ? null : Math.floor(Date.UTC(v.getFullYear(), v.getMonth(), v.getDate()) / 86_400_000);
  if (typeof v === "number") return v > 20000 && v < 80000 ? Math.floor(SERIAL_ZERO + v) : null;
  const s = String(v).trim();
  if (RX_SERIAL.test(s)) return paraDia(Number(s));
  return paraData(s);
}

/** Supervisor/responsável: "Diego Santos", "DIEGO SANTOS " e "diego santos" viram o mesmo nome. */
const nome = (v: unknown) => chave(texto(v));

/** Colunas de marcação (caixa de seleção do Excel): True/"x"/"X"/"sim" = marcado. */
const MARCADO = new Set(["TRUE", "X", "SIM", "S", "VERDADEIRO", "1"]);
export function marcado(v: unknown): boolean {
  if (v === true) return true;
  if (typeof v === "number") return v === 1;
  return typeof v === "string" && MARCADO.has(chave(v));
}

const cel = (l: Crua, col: string | null) => (col ? l[col] : undefined);
const diasEntre = (a: Dia | null, b: Dia | null) => (a != null && b != null ? a - b : null);
const maiorQueZero = (n: number | null) => (n == null ? null : Math.max(n, 0));

/** Uma linha por análise de falha, com a situação calculada e os prazos. */
export function prepararAfs(cru: Crua[], hoje: Dia = hojeLocal()): Af[] {
  const c = mapear(cru, AF_COLUNAS);
  const out: Af[] = [];
  for (const l of cru) {
    const t = (k: string) => limpo(cel(l, c[k]));
    const numero = t("numero");
    if (!numero) continue;
    const pct = paraNumero(cel(l, c.pctAcoesConcluidas));
    const crit = t("criticidade");
    const a = {
      numero, tipoAnalise: t("tipoAnalise"), area: t("area"), areaFalha: t("areaFalha"), codigoSap: t("codigoSap"),
      equipamento: t("equipamento"), conjunto: t("conjunto"), subconjunto: t("subconjunto"), componente: t("componente"),
      pilar: t("pilar").toUpperCase(), causaRaiz: t("causaRaiz"), especialidade: t("especialidade"),
      criticidade: crit ? crit.toUpperCase().slice(0, 1) : "", osCorretiva: t("osCorretiva"), resumo: t("resumo"),
      supervisor: nome(t("supervisor")), turno: t("turno"), status: t("status").toUpperCase(), ajuste: t("ajuste"),
      link: t("link"), observacoes: t("observacoes"),
      duracaoParada: paraNumero(cel(l, c.duracaoParada)),
      pctAcoesConcluidas: pct <= 1 ? pct * 100 : pct, // o gerenciador guarda 0–1
      dataFalha: paraDia(cel(l, c.dataFalha)), dataLimite: paraDia(cel(l, c.dataLimite)),
      dataAnalise: paraDia(cel(l, c.dataAnalise)),
    };
    const situacao = situacaoAf(a, hoje);
    let atraso: number | null = 0;
    if (AF_ABERTAS.includes(situacao) && a.dataLimite != null && a.dataLimite < hoje) atraso = hoje - a.dataLimite;
    else if (situacao === AF_FORA_PRAZO) atraso = diasEntre(a.dataAnalise, a.dataLimite);
    out.push({ ...a, situacao, diasParaAnalise: diasEntre(a.dataAnalise, a.dataFalha), diasDeAtraso: maiorQueZero(atraso) });
  }
  return out;
}

export function situacaoAf(a: Pick<Af, "status" | "ajuste" | "dataAnalise" | "dataLimite">, hoje: Dia): SituacaoAf {
  const st = a.status, analise = a.dataAnalise, limite = a.dataLimite;
  if (st === "CANCELADA" || a.ajuste.toUpperCase().startsWith("CANCEL")) return AF_CANCELADA;
  if (st === "AP") return AF_NO_PRAZO;
  if (st === "AFP") return AF_FORA_PRAZO;
  if (analise != null && limite != null) return analise <= limite ? AF_NO_PRAZO : AF_FORA_PRAZO; // sem o código: pela data
  if (analise != null) return AF_NO_PRAZO;
  if (limite != null && limite < hoje) return AF_ATRASADA; // sem análise e com o prazo vencido
  if (st === "R") return AF_RISCO;
  return AF_ANDAMENTO;
}

/** Uma linha por ação, com a situação calculada; `afs` completa área, criticidade e causa da AF. */
export function prepararAcoes(cru: Crua[], hoje: Dia = hojeLocal(), afs: Af[] | null = null): AcaoAf[] {
  const c = mapear(cru, ACAO_COLUNAS);
  const ref = new Map<string, Af>();
  for (const a of afs ?? []) if (!ref.has(a.numero)) ref.set(a.numero, a);
  const comAfs = ref.size > 0;
  const out: AcaoAf[] = [];
  for (const l of cru) {
    const t = (k: string) => limpo(cel(l, c[k]));
    const numeroAf = t("numeroAf"), acao = t("acao");
    if (!numeroAf || !acao) continue;
    const m = (k: string) => (c[k] ? marcado(l[c[k]!]) : false);
    const a = {
      numeroAf, numeroAcao: t("numeroAcao"), tipoAnalise: t("tipoAnalise"), area: t("area"), areaFalha: t("areaFalha"),
      codigoSap: t("codigoSap"), equipamento: t("equipamento"), especialidade: t("especialidade"),
      osCorrecao: t("osCorrecao"), link: t("link"), acao, supervisor: nome(t("supervisor")),
      responsavel: nome(t("responsavel")), status: t("status").toUpperCase(), ordemQuebra: t("ordemQuebra"),
      observacoes: t("observacoes"),
      causaRaiz: m("causaRaiz"), ttr: m("ttr"), padronizacao: m("padronizacao"), expansao: m("expansao"),
      dataInicio: paraDia(cel(l, c.dataInicio)), dataLimite: paraDia(cel(l, c.dataLimite)),
      dataRealizada: paraDia(cel(l, c.dataRealizada)),
    };
    const situacao = situacaoAcao(a, hoje);
    let atraso: number | null = 0;
    if (AC_ABERTAS.includes(situacao) && a.dataLimite != null && a.dataLimite < hoje) atraso = hoje - a.dataLimite;
    else if (situacao === AC_FORA_PRAZO) atraso = diasEntre(a.dataRealizada, a.dataLimite);
    const af = ref.get(numeroAf);
    out.push({
      ...a,
      // área, equipamento e código SAP vazios na ação vêm da AF
      area: a.area || af?.area || "", equipamento: a.equipamento || af?.equipamento || "",
      codigoSap: a.codigoSap || af?.codigoSap || "",
      id: `${numeroAf}-${a.numeroAcao}`, situacao, diasDeAtraso: maiorQueZero(atraso),
      diasParaConcluir: diasEntre(a.dataRealizada, a.dataInicio),
      tipoDaAcao: TIPOS_ACAO.filter((tp) => a[CAMPO_TIPO_ACAO[tp]]).join(", "),
      afCadastrada: comAfs && !!af, criticidade: af?.criticidade ?? "", pilar: af?.pilar ?? "",
      causaRaizAf: af?.causaRaiz ?? "", dataFalha: af?.dataFalha ?? null,
    });
  }
  return out;
}

export function situacaoAcao(a: Pick<AcaoAf, "status" | "dataRealizada" | "dataLimite">, hoje: Dia): SituacaoAcao {
  const st = a.status, feita = a.dataRealizada, limite = a.dataLimite;
  if (st.startsWith("CANCEL")) return AC_CANCELADA;
  if (feita != null && st === "AP") return AC_NO_PRAZO;
  if (feita != null && st === "AFP") return AC_FORA_PRAZO;
  if (feita != null && limite != null) return feita <= limite ? AC_NO_PRAZO : AC_FORA_PRAZO;
  if (feita != null) return AC_NO_PRAZO;
  if (limite != null && limite < hoje) return AC_ATRASADA;
  if (limite != null && limite <= hoje + 7) return AC_VENCE;
  if (st === "EA" || st === "R" || st === "A") return AC_ANDAMENTO;
  return AC_NAO_INICIADA;
}

/** Marcações da ação, na ordem de TIPOS_ACAO (vazio = SEM_TIPO). */
export function tiposDaAcao(a: Pick<AcaoAf, "causaRaiz" | "ttr" | "padronizacao" | "expansao">): TipoAcao[] {
  return TIPOS_ACAO.filter((tp) => a[CAMPO_TIPO_ACAO[tp]]);
}

// ----------------------------------------------------------------------------
// Indicadores (aba RESUMO CORPORATIVO)
// ----------------------------------------------------------------------------
const entre = (d: Dia | null, ini: Dia, fim: Dia) => d != null && d >= ini && d <= fim;
const pct = (a: number, b: number) => (b ? (a / b) * 100 : null);
const contar = <T>(xs: T[], f: (x: T) => boolean) => xs.reduce((n, x) => n + (f(x) ? 1 : 0), 0);

/**
 * Quebras de equipamento classe A registradas na IW28 (nota Y1 → ordem YM11) — só como referência: nem toda
 * parada vira AF (o gatilho depende da duração) e a nota quase nunca traz a ordem da AF. As notas precisam vir
 * marcadas (marcarQuebras de preparo.ts).
 */
export function quebrasAIw28<T extends Pick<Nota, "quebra" | "codigoAbc" | "data">>(notas: T[] | null): T[] {
  return (notas ?? []).filter((n) => n.quebra && n.codigoAbc === "A" && n.data != null);
}

/** Ids iguais aos dos KPIs (indicadores e metas). */
export interface IndicadoresAf {
  af_geradas: number; af_geradas_a: number; af_no_prazo: number | null; af_realizadas: number;
  af_execucao: number | null; af_atrasadas: number; af_abertas: number; dias_para_analise: number | null;
  taxa_quebra_a: number | null; af_a_no_prazo: number | null; quebras_a_iw28: number | null;
  acoes_geradas: number; acoes_no_prazo: number | null; acoes_execucao: number | null; acoes_realizadas: number;
  acoes_atrasadas: number; acoes_abertas: number; acoes_por_af: number | null;
}

/**
 * Indicadores de AF no período [ini, fim] (os de "hoje" valem para a data atual), com as definições da aba
 * RESUMO CORPORATIVO do gerenciador (canceladas nunca contam):
 * - taxa_quebra_a ("Taxa de Análise de Quebra Crít. (A)"): AFs de criticidade A com data da falha no período que
 *   já foram analisadas ÷ AFs A com data da falha no período.
 * - af_execucao ("Execução de AF's"): AFs com data limite no período (até hoje) analisadas ÷ AFs com data limite
 *   no período; af_no_prazo: só as analisadas até a data limite.
 * - acoes_execucao ("Ações de AF's"): ações com data limite no período (até hoje) realizadas ÷ ações com data
 *   limite no período; acoes_no_prazo: só as realizadas até a data limite.
 */
export function indicadores(afs: Af[], acoes: AcaoAf[], ini: Dia, fim: Dia, hoje: Dia = hojeLocal(),
  notas: Pick<Nota, "quebra" | "codigoAbc" | "data">[] | null = null): IndicadoresAf {
  const vivas = afs.filter((a) => a.situacao !== AF_CANCELADA);
  const geradas = vivas.filter((a) => entre(a.dataFalha, ini, fim));
  const venc = vivas.filter((a) => entre(a.dataLimite, ini, fim) && a.dataLimite! <= hoje);
  const concluidas = contar(venc, (a) => AF_CONCLUIDAS.includes(a.situacao));
  const analisadas = geradas.filter((a) => a.diasParaAnalise != null && a.diasParaAnalise >= 0);
  const geradasA = geradas.filter((a) => a.criticidade === "A");

  const vivasAc = acoes.filter((a) => a.situacao !== AC_CANCELADA);
  const vencAc = vivasAc.filter((a) => entre(a.dataLimite, ini, fim) && a.dataLimite! <= hoje);
  const iniciadas = contar(vivasAc, (a) => entre(a.dataInicio, ini, fim));
  return {
    af_geradas: geradas.length,
    af_geradas_a: geradasA.length,
    af_no_prazo: pct(contar(venc, (a) => a.situacao === AF_NO_PRAZO), venc.length),
    af_realizadas: concluidas,
    af_execucao: pct(concluidas, venc.length),
    af_atrasadas: contar(vivas, (a) => a.situacao === AF_ATRASADA),
    af_abertas: contar(vivas, (a) => AF_ABERTAS.includes(a.situacao)),
    dias_para_analise: analisadas.length
      ? analisadas.reduce((s, a) => s + a.diasParaAnalise!, 0) / analisadas.length : null,
    taxa_quebra_a: pct(contar(geradasA, (a) => AF_CONCLUIDAS.includes(a.situacao)), geradasA.length),
    af_a_no_prazo: pct(contar(geradasA, (a) => a.situacao === AF_NO_PRAZO), geradasA.length),
    quebras_a_iw28: notas ? contar(quebrasAIw28(notas), (n) => entre(n.data, ini, fim)) : null,
    acoes_geradas: iniciadas,
    acoes_no_prazo: pct(contar(vencAc, (a) => a.situacao === AC_NO_PRAZO), vencAc.length),
    acoes_execucao: pct(contar(vencAc, (a) => AC_CONCLUIDAS.includes(a.situacao)), vencAc.length),
    acoes_realizadas: contar(vivasAc, (a) => entre(a.dataRealizada, ini, fim)),
    acoes_atrasadas: contar(vivasAc, (a) => a.situacao === AC_ATRASADA),
    acoes_abertas: contar(vivasAc, (a) => AC_ABERTAS.includes(a.situacao)),
    acoes_por_af: geradas.length ? iniciadas / geradas.length : null,
  };
}

export const IND_TAXA_A = "Taxa de análise de quebra crítica (A)", IND_EXECUCAO_AF = "Execução de AFs",
  IND_ACOES_AF = "Ações de AFs";
export const INDICADORES_SEMANAIS = [IND_TAXA_A, IND_EXECUCAO_AF, IND_ACOES_AF] as const;

export interface LinhaSemanal {
  /** Segunda-feira da semana. */
  semana: Dia;
  indicador: (typeof INDICADORES_SEMANAIS)[number];
  gerado: number;
  executado: number;
  /** Executado ÷ gerado × 100 (null sem gerado). */
  percentual: number | null;
  futura: boolean;
}

/**
 * Acompanhamento semanal no formato do RESUMO CORPORATIVO: para cada semana (segunda a domingo) e indicador,
 * Gerado × Executado × Percentual (taxa de quebra A pela data da falha; execução de AFs e ações pela data limite).
 */
export function semanal(afs: Af[], acoes: AcaoAf[], ini: Dia, fim: Dia, hoje: Dia = hojeLocal()): LinhaSemanal[] {
  const segunda = ini - ((partes(ini).semana + 6) % 7);
  const vivas = afs.filter((a) => a.situacao !== AF_CANCELADA);
  const vivasA = vivas.filter((a) => a.criticidade === "A");
  const vivasAc = acoes.filter((a) => a.situacao !== AC_CANCELADA);
  const linhas: LinhaSemanal[] = [];
  const linha = (semana: Dia, indicador: LinhaSemanal["indicador"], gerado: number, executado: number) =>
    linhas.push({ semana, indicador, gerado, executado, percentual: gerado > 0 ? (executado / gerado) * 100 : null,
      futura: semana > hoje });
  for (let s = segunda; s <= fim; s += 7) {
    const e = s + 6;
    let w: { situacao: string }[] = vivasA.filter((a) => entre(a.dataFalha, s, e));
    linha(s, IND_TAXA_A, w.length, contar(w, (a) => (AF_CONCLUIDAS as readonly string[]).includes(a.situacao)));
    w = vivas.filter((a) => entre(a.dataLimite, s, e));
    linha(s, IND_EXECUCAO_AF, w.length, contar(w, (a) => (AF_CONCLUIDAS as readonly string[]).includes(a.situacao)));
    w = vivasAc.filter((a) => entre(a.dataLimite, s, e));
    linha(s, IND_ACOES_AF, w.length, contar(w, (a) => (AC_CONCLUIDAS as readonly string[]).includes(a.situacao)));
  }
  return linhas;
}

/** Série mês a mês dos indicadores de AF (`mes` = 1º dia do mês). */
export function mensal(afs: Af[], acoes: AcaoAf[], ini: Dia, fim: Dia, hoje: Dia = hojeLocal(),
  notas: Pick<Nota, "quebra" | "codigoAbc" | "data">[] | null = null): ({ mes: Dia } & IndicadoresAf)[] {
  const out: ({ mes: Dia } & IndicadoresAf)[] = [];
  for (let m = inicioDoMes(ini); m <= fim; m = somarMeses(m, 1)) {
    const a = Math.max(m, ini), b = Math.min(somarMeses(m, 1) - 1, fim);
    out.push({ mes: m, ...indicadores(afs, acoes, a, b, hoje, notas) });
  }
  return out;
}

/** Ordena com os nulos no fim, crescente ou decrescente. */
function porCampo<T>(...chaves: [(x: T) => number | string | null, boolean][]) {
  return (a: T, b: T) => {
    for (const [f, cresc] of chaves) {
      const x = f(a), y = f(b);
      if (x === y) continue;
      if (x == null) return 1;
      if (y == null) return -1;
      return (x < y ? -1 : 1) * (cresc ? 1 : -1);
    }
    return 0;
  };
}

/** As ações de uma AF, pela data limite e pelo nº da ação. */
export function acoesDaAf(acoes: AcaoAf[], numero: string): AcaoAf[] {
  return acoes.filter((a) => a.numeroAf === numero)
    .sort(porCampo<AcaoAf>([(a) => a.dataLimite, true], [(a) => a.numeroAcao, true]));
}

// ----------------------------------------------------------------------------
// Apoio às telas
// ----------------------------------------------------------------------------
/** Ordem da fila de AFs: atrasadas primeiro. */
export const ORDEM_SITUACAO_AF: Record<SituacaoAf, number> = {
  [AF_ATRASADA]: 0, [AF_RISCO]: 1, [AF_ANDAMENTO]: 2, [AF_FORA_PRAZO]: 3, [AF_NO_PRAZO]: 4, [AF_CANCELADA]: 5,
};

/** Grupos dos gráficos de AF (risco e andamento = "Em aberto"). */
export const G_NO_PRAZO = "Analisada no prazo", G_FORA = "Analisada fora do prazo", G_ABERTO = "Em aberto",
  G_ATRASADA = "Atrasada";
export const GRUPOS_AF = [G_NO_PRAZO, G_FORA, G_ABERTO, G_ATRASADA] as const;
export const CORES_GRUPO_AF = [COR[AF_NO_PRAZO], COR[AF_FORA_PRAZO], COR[AF_ANDAMENTO], COR[AF_ATRASADA]];
export const GRUPO_DA_SITUACAO_AF: Partial<Record<SituacaoAf, (typeof GRUPOS_AF)[number]>> = {
  [AF_NO_PRAZO]: G_NO_PRAZO, [AF_FORA_PRAZO]: G_FORA, [AF_ATRASADA]: G_ATRASADA, [AF_RISCO]: G_ABERTO,
  [AF_ANDAMENTO]: G_ABERTO,
};

/**
 * AFs atrasadas ou em risco hoje (atrasada, risco de atraso, ou em andamento com a data limite em até 3 dias):
 * atrasadas primeiro, as mais atrasadas antes, depois pela data limite.
 */
export function afsEmRisco(afs: Af[], hoje: Dia = hojeLocal()): Af[] {
  return afs.filter((a) => a.situacao === AF_ATRASADA || a.situacao === AF_RISCO
    || (a.situacao === AF_ANDAMENTO && a.dataLimite != null && a.dataLimite <= hoje + 3))
    .sort(porCampo<Af>([(a) => ORDEM_SITUACAO_AF[a.situacao], true], [(a) => a.diasDeAtraso, false],
      [(a) => a.dataLimite, true]));
}

/**
 * Fila de prioridade das ações: atrasadas e que vencem em até 7 dias, as mais atrasadas primeiro;
 * `venceEmDias` só nas que vencem (dias até a data limite).
 */
export function filaDeAcoes(acoes: AcaoAf[], hoje: Dia = hojeLocal()): (AcaoAf & { venceEmDias: number | null })[] {
  return acoes.filter((a) => a.situacao === AC_ATRASADA || a.situacao === AC_VENCE)
    .map((a) => ({ ...a, venceEmDias: a.situacao === AC_VENCE && a.dataLimite != null ? a.dataLimite - hoje : null }))
    .sort(porCampo<AcaoAf>([(a) => a.diasDeAtraso, false], [(a) => a.dataLimite, true]));
}

/**
 * Cartões extras da tela de ações: ações que vencem em 7 dias (hoje), dias médios para concluir as realizadas no
 * período e, para quando não há a aba de análises, ações iniciadas no período ÷ AFs distintas dessas ações.
 */
export function extrasDasAcoes(acoes: AcaoAf[], ini: Dia, fim: Dia): {
  acoes_vencem_7d: number; acoes_dias_concluir: number | null; acoes_por_af_sem_afs: number | null;
} {
  const vivas = acoes.filter((a) => a.situacao !== AC_CANCELADA);
  const concl = vivas.filter((a) => entre(a.dataRealizada, ini, fim) && a.diasParaConcluir != null && a.diasParaConcluir >= 0);
  const ger = vivas.filter((a) => entre(a.dataInicio, ini, fim));
  return {
    acoes_vencem_7d: contar(vivas, (a) => a.situacao === AC_VENCE),
    acoes_dias_concluir: concl.length ? concl.reduce((s, a) => s + a.diasParaConcluir!, 0) / concl.length : null,
    acoes_por_af_sem_afs: ger.length ? ger.length / new Set(ger.map((a) => a.numeroAf)).size : null,
  };
}
