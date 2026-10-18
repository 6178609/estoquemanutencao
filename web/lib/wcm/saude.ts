import type { Equipamento, Ordem } from "./preparo";
import type { Dia } from "./util";

/**
 * Saúde dos ativos : índice de 0 a 100 por equipamento, no estilo do IBM Maximo
 * Health / SAP APM. Cada contribuinte vira uma penalidade de 0 a 1 (1 = pior caso) com um peso;
 * saúde = 100 − Σ peso × penalidade. Os pesos somam 100.
 *
 * - Eventos (quebras, falhas do Gerenciador de AF, demanda corretiva, custo): últimos 12 meses até hoje.
 * - Pendências (backlog atrasado, preventivas atrasadas, anomalias preditivas abertas): retrato de hoje.
 * - Risco = (100 − saúde) × peso da criticidade (Alta 3, Média 2, Baixa 1, sem classe 1,5): é a fila de
 *   ataque — saúde ruim em equipamento crítico vem primeiro.
 *
 * Só entram equipamentos com alguma ordem, quebra ou chamada de plano no recorte (desativados no IH08 não).
 * Testado em testes/saude.test.ts.
 */

export type IdContribuinte = "quebras" | "falhas_af" | "corretivas" | "backlog" | "preventivas" | "preditiva" | "custo";

export interface Contribuinte {
  id: IdContribuinte;
  nome: string;
  peso: number;
  /** valor que já dá a penalidade cheia (null = relativo à planta) */
  cheio: number | null;
  regra: string;
}

export const CONTRIBUINTES: Contribuinte[] = [
  { id: "quebras", nome: "Quebras", peso: 20, cheio: 3,
    regra: "Quebras (nota Y1 → ordem YM11) nos últimos 12 meses; reincidência (até 30 dias da anterior) conta em " +
      "dobro. 3 ou mais = penalidade cheia." },
  { id: "falhas_af", nome: "Falhas registradas (AF)", peso: 20, cheio: 10,
    regra: "Falhas do Gerenciador de AF nos últimos 12 meses (pelo Código SAP do equipamento). 10 ou mais = cheia." },
  { id: "corretivas", nome: "Demanda corretiva", peso: 15, cheio: 12,
    regra: "Ordens sem plano de manutenção (backlog/corretivas) dos últimos 12 meses. 12 ou mais = cheia." },
  { id: "backlog", nome: "Backlog atrasado", peso: 15, cheio: 5,
    regra: "Ordens pendentes com o prazo (fim-base) vencido hoje. 5 ou mais = cheia." },
  { id: "preventivas", nome: "Preventivas atrasadas", peso: 10, cheio: 2,
    regra: "Chamadas dos planos de manutenção (IP19) atrasadas hoje. 2 ou mais = cheia." },
  { id: "preditiva", nome: "Anomalias preditivas abertas", peso: 10, cheio: 2,
    regra: "Anomalias SEMEQ em aberto hoje (atrasada conta 1, as demais 0,5). 2 ou mais = cheia." },
  { id: "custo", nome: "Custo de manutenção", peso: 10, cheio: null,
    regra: "Custo real das ordens dos últimos 12 meses ÷ custo do equipamento no percentil 95 da planta " +
      "(acima dele = cheia)." },
];
export const POR_ID = Object.fromEntries(CONTRIBUINTES.map((c) => [c.id, c])) as Record<IdContribuinte, Contribuinte>;

export const BOA = "Boa", ATENCAO = "Atenção", CRITICA = "Crítica";
export type Faixa = typeof BOA | typeof ATENCAO | typeof CRITICA;
export const FAIXAS: Faixa[] = [CRITICA, ATENCAO, BOA];
/** saúde ≥ 80 boa; 60 a 79 atenção; abaixo de 60 crítica */
export const LIMITES = { [BOA]: 80, [ATENCAO]: 60 } as const;
export const COR_FAIXA: Record<Faixa, string> = { [BOA]: "#0E9F46", [ATENCAO]: "#F2B705", [CRITICA]: "#E3262B" };
export const PESO_CRITICIDADE: Record<string, number> = { Alta: 3.0, "Média": 2.0, Baixa: 1.0, "": 1.5 };
export const SEM_CLASSE = "Sem classe";
export const CRITICIDADES = ["Alta", "Média", "Baixa", SEM_CLASSE];
export const JANELA_DIAS = 365;

/** Situações da preditiva (ABERTAS e ATRASADA). */
export const PREDITIVA_ATRASADA = "Atrasada";
export const PREDITIVA_ABERTAS = new Set(["Encerrada sem confirmação", "Em tratativa", PREDITIVA_ATRASADA, "Sem ordem"]);

export function faixa(saude: number): Faixa {
  return saude >= LIMITES[BOA] ? BOA : saude >= LIMITES[ATENCAO] ? ATENCAO : CRITICA;
}

// ----------------------------------------------------------------------------
// Entradas
// ----------------------------------------------------------------------------
/** IW38 preparado (já no recorte de área/centro/tipo, todas as datas). */
export type OrdemSaude = Pick<Ordem, "situacao" | "equipChave" | "data" | "comPlano" | "custoReal" | "atrasada" |
  "objeto" | "localizacao" | "centroTrabalho" | "setor">;

/** Quebra: equipamento, data da nota e reincidência (≤ 30 dias da anterior). */
export interface QuebraSaude { equipChave: string; data: Dia | null; reincidente: boolean }

/** Falha do Gerenciador de AF: "Código SAP", "Situação", "Data da falha", "Duração da parada (h)". */
export interface FalhaAfSaude { codigoSap: string; situacao: string; dataFalha: Dia | null; duracaoParada?: number | null }

/** Chamada da IP19 classificada (planos.classificar): "Equipamento" e "Situação" (Atrasada, Programada…). */
export interface ChamadaSaude { equipamento: string; situacao: string }

/** Anomalia da preditiva (preditiva.anomalias): "Equipamento" e "Situação". */
export interface AnomaliaSaude { equipamento: string; situacao: string }

/** IH08 preparado: nome, ABC e desativado. */
export type EquipSaude = Pick<Equipamento, "equipamento" | "denominacao" | "codigoAbc" | "desativado">;

/** Cadastro de equipamentos do site (`cadastro_equipamentos.json`): código → {criticidade, nome, …}. */
export type CadastroEquip = Record<string, unknown>;

export interface EntradasSaude {
  quebras?: QuebraSaude[] | null;
  afs?: FalhaAfSaude[] | null;
  chamadas?: ChamadaSaude[] | null;
  anomalias?: AnomaliaSaude[] | null;
  equip?: EquipSaude[] | null;
  cadEq?: CadastroEquip | null;
  pesos?: Partial<Record<IdContribuinte, number>> | null;
}

// ----------------------------------------------------------------------------
// Saída: uma linha por equipamento
// ----------------------------------------------------------------------------
export interface LinhaSaude {
  codigo: string; equipamento: string; criticidade: string; abc: string; saude: number; faixa: Faixa; risco: number;
  principalCausa: string; quebras: number; reincidencias: number; falhasAf: number; horasParadasAf: number;
  corretivas: number; backlogAtrasado: number; preventivasAtrasadas: number; anomaliasAbertas: number;
  custo12Meses: number; ultimaFalha: Dia | null; area: string; centro: string; setor: string;
  /** pontos que cada contribuinte tirou da saúde (1 casa) — as colunas pts_* */
  pts: Record<IdContribuinte, number>;
}

/** Campo → rótulo das colunas (a ordem e os nomes da tabela/Excel). */
export const COLUNAS: [keyof LinhaSaude, string][] = [
  ["codigo", "Código"], ["equipamento", "Equipamento"], ["criticidade", "Criticidade"], ["abc", "ABC"],
  ["saude", "Saúde"], ["faixa", "Faixa"], ["risco", "Risco"], ["principalCausa", "Principal causa"],
  ["quebras", "Quebras"], ["reincidencias", "Reincidências"], ["falhasAf", "Falhas AF"],
  ["horasParadasAf", "Horas paradas (AF)"], ["corretivas", "Corretivas"], ["backlogAtrasado", "Backlog atrasado"],
  ["preventivasAtrasadas", "Preventivas atrasadas"], ["anomaliasAbertas", "Anomalias abertas"],
  ["custo12Meses", "Custo 12 meses"], ["ultimaFalha", "Última falha"], ["area", "Área"], ["centro", "Centro"],
  ["setor", "Setor"],
];

/** Arredonda com metade para o par. */
function arred(x: number, casas = 0): number {
  const f = 10 ** casas;
  const y = x * f;
  const piso = Math.floor(y);
  const r = y - piso === 0.5 ? (piso % 2 === 0 ? piso : piso + 1) : Math.round(y);
  return r / f;
}

/** Percentil com interpolação linear. */
function quantil(xs: number[], q: number): number {
  const v = [...xs].sort((a, b) => a - b);
  const pos = (v.length - 1) * q;
  const lo = Math.floor(pos), hi = Math.ceil(pos);
  return v[lo] + (v[hi] - v[lo]) * (pos - lo);
}

const contar = (m: Map<string, number>, k: string, v = 1) => m.set(k, (m.get(k) ?? 0) + v);

/** Valor mais frequente de `valor` para cada chave (vazios não contam; empate = o menor em ordem alfabética). */
export function modaPor<T>(linhas: T[], chaveDe: (x: T) => string, valorDe: (x: T) => string): Map<string, string> {
  const cont = new Map<string, Map<string, number>>();
  for (const l of linhas) {
    const v = valorDe(l);
    if (v === "" || v == null) continue;
    const k = chaveDe(l);
    let m = cont.get(k);
    if (!m) cont.set(k, (m = new Map()));
    contar(m, v);
  }
  const out = new Map<string, string>();
  for (const [k, m] of cont) {
    let melhor = "", n = -1;
    for (const [v, c] of m) if (c > n || (c === n && v < melhor)) { melhor = v; n = c; }
    out.set(k, melhor);
  }
  return out;
}

/** Criticidade do cadastro do site (texto vazio se não houver). */
export function criticidadeDoSite(cadEq: CadastroEquip | null | undefined, codigo: string): string {
  const i = cadEq?.[codigo];
  if (!i || typeof i !== "object" || Array.isArray(i)) return "";
  const c = (i as Record<string, unknown>).criticidade;
  return c ? String(c) : "";
}

const ABC_CRIT: Record<string, string> = { A: "Alta", B: "Média", C: "Baixa" };

/**
 * Uma linha por equipamento com a saúde, a faixa, o risco e o valor de cada contribuinte — ordenada pelo
 * risco (maior primeiro) e, no empate, pela pior saúde.
 */
export function calcular(ordens: OrdemSaude[], hoje: Dia, e: EntradasSaude = {}): LinhaSaude[] {
  const desde = hoje - JANELA_DIAS;
  const pesos = Object.fromEntries(CONTRIBUINTES.map((c) => [c.id, Number(e.pesos?.[c.id] ?? c.peso)])) as Record<IdContribuinte, number>;
  const cadEq = e.cadEq ?? {};
  const validas = ordens.filter((o) => o.situacao !== "Cancelada" && o.equipChave !== "");

  // universo: equipamentos com ordem (qualquer data), quebra ou chamada de plano no recorte
  const universo = new Set(validas.map((o) => o.equipChave));
  const q = e.quebras?.length
    ? e.quebras.filter((x) => x.equipChave !== "" && x.data != null && x.data >= desde && x.data <= hoje + 1) : null;
  if (q) for (const x of q) universo.add(x.equipChave);
  const ch = e.chamadas?.length ? e.chamadas : null;
  if (ch) for (const x of ch) if (x.equipamento !== "") universo.add(x.equipamento);
  if (e.equip?.length) for (const x of e.equip) if (x.desativado) universo.delete(x.equipamento);
  universo.delete("");
  if (!universo.size) return [];
  const idx = [...universo].sort();

  // eventos dos últimos 12 meses
  const corretivas = new Map<string, number>(), custo = new Map<string, number>();
  for (const o of validas) {
    if (o.data == null || o.data < desde || o.data > hoje) continue;
    if (!o.comPlano) contar(corretivas, o.equipChave);
    if (!Number.isNaN(o.custoReal)) contar(custo, o.equipChave, o.custoReal);
  }
  const nQuebras = new Map<string, number>(), reinc = new Map<string, number>(), ultQ = new Map<string, Dia>();
  for (const x of q ?? []) {
    contar(nQuebras, x.equipChave);
    if (x.reincidente) contar(reinc, x.equipChave);
    if (x.data! > (ultQ.get(x.equipChave) ?? -Infinity)) ultQ.set(x.equipChave, x.data!);
  }
  const falhas = new Map<string, number>(), horasAf = new Map<string, number>(), ultA = new Map<string, Dia>();
  for (const a of e.afs ?? []) {
    if (a.situacao === "Cancelada" || a.codigoSap === "" || a.dataFalha == null || a.dataFalha < desde || a.dataFalha > hoje) continue;
    contar(falhas, a.codigoSap);
    const h = a.duracaoParada;
    if (h != null && !Number.isNaN(h)) contar(horasAf, a.codigoSap, h);
    if (a.dataFalha > (ultA.get(a.codigoSap) ?? -Infinity)) ultA.set(a.codigoSap, a.dataFalha);
  }

  // pendências de hoje
  const backlog = new Map<string, number>();
  for (const o of validas) if (o.atrasada) contar(backlog, o.equipChave);
  const prevAtr = new Map<string, number>();
  for (const x of ch ?? []) if (x.situacao === "Atrasada") contar(prevAtr, x.equipamento);
  const anomalias = new Map<string, number>(), cargaPred = new Map<string, number>();
  for (const x of e.anomalias ?? []) {
    if (!PREDITIVA_ABERTAS.has(x.situacao) || x.equipamento === "") continue;
    contar(anomalias, x.equipamento);
    contar(cargaPred, x.equipamento, x.situacao === PREDITIVA_ATRASADA ? 1.0 : 0.5);
  }

  // penalidades (0 a 1) e pontos perdidos
  const custosPos = idx.map((k) => custo.get(k) ?? 0).filter((v) => v > 0);
  const refCusto = Math.max(custosPos.length ? quantil(custosPos, 0.95) : 0, 1000);
  const totalPesos = Object.values(pesos).reduce((a, b) => a + b, 0) || 100;

  // cadastro: nome, criticidade, área e centro
  const ref = new Map<string, EquipSaude>();
  for (const x of e.equip ?? []) if (!ref.has(x.equipamento)) ref.set(x.equipamento, x);
  const nomeO = new Map<string, string>();
  for (const o of validas) if (!nomeO.has(o.equipChave)) nomeO.set(o.equipChave, o.objeto);
  const area = modaPor(validas, (o) => o.equipChave, (o) => o.localizacao);
  const centro = modaPor(validas, (o) => o.equipChave, (o) => o.centroTrabalho);
  const setor = modaPor(validas, (o) => o.equipChave, (o) => o.setor);

  const out: LinhaSaude[] = idx.map((k) => {
    const l = {
      quebras: nQuebras.get(k) ?? 0, reincidencias: reinc.get(k) ?? 0, falhasAf: falhas.get(k) ?? 0,
      horasParadasAf: horasAf.get(k) ?? 0, corretivas: corretivas.get(k) ?? 0, backlogAtrasado: backlog.get(k) ?? 0,
      preventivasAtrasadas: prevAtr.get(k) ?? 0, anomaliasAbertas: anomalias.get(k) ?? 0, custo12Meses: custo.get(k) ?? 0,
    };
    const brutos: Record<IdContribuinte, number> = {
      quebras: l.quebras + l.reincidencias, falhas_af: l.falhasAf, corretivas: l.corretivas, backlog: l.backlogAtrasado,
      preventivas: l.preventivasAtrasadas, preditiva: cargaPred.get(k) ?? 0, custo: Math.max(l.custo12Meses, 0),
    };
    const perdidos = {} as Record<IdContribuinte, number>;
    let somaPerdidos = 0, maior = -Infinity, principal = "—";
    for (const c of CONTRIBUINTES) {
      const p = Math.min(Math.max(brutos[c.id] / (c.cheio ?? refCusto), 0), 1) * pesos[c.id];
      perdidos[c.id] = p;
      somaPerdidos += p;
      if (p > maior) { maior = p; principal = c.nome; }
    }
    const saude = Math.min(Math.max(arred(100 - (somaPerdidos * 100) / totalPesos), 0), 100);
    const eq = ref.get(k);
    const abc = eq?.codigoAbc ?? "";
    const crit = criticidadeDoSite(cadEq, k) || ABC_CRIT[abc] || "";
    const ua = ultA.get(k), uq = ultQ.get(k);
    return {
      codigo: k, equipamento: eq?.denominacao || nomeO.get(k) || "", criticidade: crit, abc, saude, faixa: faixa(saude),
      risco: arred((100 - saude) * (PESO_CRITICIDADE[crit] ?? 1.5)), principalCausa: maior > 0 ? principal : "—", ...l,
      ultimaFalha: ua == null ? uq ?? null : uq == null ? ua : Math.max(ua, uq),
      area: area.get(k) ?? "", centro: centro.get(k) ?? "", setor: setor.get(k) ?? "",
      pts: Object.fromEntries(CONTRIBUINTES.map((c) => [c.id, arred(perdidos[c.id], 1)])) as Record<IdContribuinte, number>,
    };
  });
  // maior risco primeiro; no empate, a pior saúde (e o código)
  return out.sort((a, b) => b.risco - a.risco || a.saude - b.saude);
}

export interface ResumoSaude {
  ativos: number; media: number | null; criticos: number; criticosAlta: number; atencao: number; boaPct: number | null;
}

/** Números do topo da página e do Painel. */
export function resumo(t: LinhaSaude[]): ResumoSaude {
  if (!t.length) return { ativos: 0, media: null, criticos: 0, criticosAlta: 0, atencao: 0, boaPct: null };
  const n = (f: (l: LinhaSaude) => boolean) => t.filter(f).length;
  return {
    ativos: t.length, media: t.reduce((s, l) => s + l.saude, 0) / t.length, criticos: n((l) => l.faixa === CRITICA),
    criticosAlta: n((l) => l.faixa === CRITICA && l.criticidade === "Alta"), atencao: n((l) => l.faixa === ATENCAO),
    boaPct: (n((l) => l.faixa === BOA) / t.length) * 100,
  };
}

export interface CelulaMatriz { criticidade: string; faixa: Faixa; equipamentos: number }

/** Criticidade × faixa de saúde (quantidade de equipamentos), com todas as combinações. */
export function matriz(t: LinhaSaude[]): CelulaMatriz[] {
  const cont = new Map<string, number>();
  for (const l of t) contar(cont, `${l.criticidade || SEM_CLASSE}|${l.faixa}`);
  return CRITICIDADES.flatMap((criticidade) =>
    FAIXAS.map((f) => ({ criticidade, faixa: f, equipamentos: cont.get(`${criticidade}|${f}`) ?? 0 })));
}

export interface PontoContribuinte { contribuinte: string; pontosPerdidos: number; peso: number }

/** Pontos que cada contribuinte tirou da saúde de um equipamento (para o gráfico da ficha). */
export function contribuicao(linha: Pick<LinhaSaude, "pts">): PontoContribuinte[] {
  return CONTRIBUINTES.map((c) => ({ contribuinte: c.nome, pontosPerdidos: Number(linha.pts?.[c.id] ?? 0) || 0, peso: c.peso }));
}

/** "O que mais derruba a saúde": soma dos pontos perdidos nos equipamentos fora da faixa Boa (só os > 0). */
export function pontosForaDaFaixaBoa(t: LinhaSaude[]): { contribuinte: string; pontos: number }[] {
  const ruins = t.filter((l) => l.faixa !== BOA);
  return CONTRIBUINTES.map((c) => ({ contribuinte: c.nome, pontos: ruins.reduce((s, l) => s + l.pts[c.id], 0) }))
    .filter((x) => x.pontos > 0);
}
