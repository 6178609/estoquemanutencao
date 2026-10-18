import type { Equipamento, Ordem } from "./preparo";
import { modaPor, type CadastroEquip, type LinhaSaude } from "./saude";
import { paraData, partes, type Dia } from "./util";

/**
 * Gestão de ativos : o inventário de equipamentos da planta num lugar só, no estilo
 * dos EAM do mercado (SAP EAM, IBM Maximo, Infor): cadastro, criticidade, situação, ciclo de vida, custo,
 * confiabilidade e cobertura de manutenção preventiva — e a recomendação do que fazer com cada ativo.
 *
 * Universo: equipamentos do IH08 + os cadastrados no site + os que aparecem nas ordens do IW38.
 *
 * Campos de ciclo de vida (cadastro do site, `cadastro_equipamentos.json`): situacao, fabricante, modelo, serie,
 * ano_instalacao, vida_util (anos), garantia_ate e valor_reposicao (R$).
 *
 * Recomendação (a primeira regra que vale):
 * 1. Desativado → "—";
 * 2. custo de manutenção em 12 meses ≥ 50% do valor de reposição, ou vida útil vencida com saúde crítica →
 *    "Avaliar substituição" (reparar ou substituir);
 * 3. criticidade Alta/Média sem plano de manutenção preventiva → "Criar plano preventivo";
 * 4. saúde crítica → "Atacar causa das falhas";
 * 5. sem criticidade → "Classificar criticidade";
 * 6. senão "Manter".
 *
 * Testado em testes/ativos.test.ts.
 */

export const SITUACOES = ["Em operação", "Parado", "Reserva", "Em reforma", "Desativado"];
export const OPERACAO = SITUACOES[0], DESATIVADO = SITUACOES[SITUACOES.length - 1];
/** custo de 12 meses ÷ valor de reposição que já pede a análise de substituição */
export const LIMITE_SUBSTITUICAO = 0.5;
export const AVISO_GARANTIA_DIAS = 90;
export const JANELA_DIAS = 365;

export const SUBSTITUIR = "Avaliar substituição", CRIAR_PLANO = "Criar plano preventivo",
  ATACAR = "Atacar causa das falhas", CLASSIFICAR = "Classificar criticidade", MANTER = "Manter";
export const RECOMENDACOES = [SUBSTITUIR, CRIAR_PLANO, ATACAR, CLASSIFICAR, MANTER];
export const SEM_RECOMENDACAO = "—";
export const GARANTIAS = ["Vigente", `Vence em ${AVISO_GARANTIA_DIAS} dias`, "Vencida", "Sem garantia cadastrada"];
export const ABC_PARA_CRITICIDADE: Record<string, string> = { A: "Alta", B: "Média", C: "Baixa" };
/** o mesmo de preparo.PENDENTES */
const PENDENTES = new Set(["Aberta", "Liberada", "Encerrada sem confirmação"]);
/** situação da chamada da IP19 que não conta como plano ativo (planos.classificar) */
export const CHAMADA_SALTADA = "Saltada/cancelada";

// ----------------------------------------------------------------------------
// Entradas
// ----------------------------------------------------------------------------
/** IH08 preparado. */
export type EquipAtivo = Pick<Equipamento, "equipamento" | "denominacao" | "localizacao" | "codigoAbc" | "local" | "desativado">;
/** IW38 preparado (todas as datas). */
export type OrdemAtivo = Pick<Ordem, "equipChave" | "situacao" | "objeto" | "localizacao" | "local" | "centroTrabalho" |
  "data" | "custoReal" | "comPlano" | "plano">;
/** Quebra (porta de indicadores.quebras): só o equipamento e a data. */
export interface QuebraAtivo { equipChave: string; data: Dia | null }
/** Chamada da IP19 classificada (planos.classificar): "Equipamento", "Plano" e "Situação". */
export interface ChamadaAtivo { equipamento: string; plano: string | null; situacao?: string }
/** Linha de saude.calcular (só o que o inventário usa). */
export type SaudeAtivo = Pick<LinhaSaude, "codigo" | "saude" | "faixa">;

export interface EntradasAtivos {
  equip?: EquipAtivo[] | null;
  ordens?: OrdemAtivo[] | null;
  cadEq?: CadastroEquip | null;
  quebras?: QuebraAtivo[] | null;
  chamadas?: ChamadaAtivo[] | null;
  saude?: SaudeAtivo[] | null;
}

// ----------------------------------------------------------------------------
// Saída: uma linha por ativo
// ----------------------------------------------------------------------------
export interface LinhaAtivo {
  codigo: string; equipamento: string; situacao: string; criticidade: string; abc: string; categoria: string;
  area: string; localInstalacao: string; centro: string; origem: "SAP + site" | "SAP" | "Site";
  fabricante: string; modelo: string; serie: string; anoInstalacao: number | null; idade: number | null;
  vidaUtil: number | null; vidaRestante: number | null; garantiaAte: Dia | null; garantia: string;
  valorReposicao: number | null; custo12Meses: number; custoPorReposicaoPct: number | null; custoTotal: number;
  ordensPendentes: number; quebras12Meses: number; mtbfDias: number | null; saude: number | null; faixa: string;
  planosPreventivos: number; cobertoPorPlano: boolean; pecasVinculadas: number; recomendacao: string;
}

/** Campo → rótulo das colunas (a ordem e os nomes da tabela/Excel). */
export const COLUNAS: [keyof LinhaAtivo, string][] = [
  ["codigo", "Código"], ["equipamento", "Equipamento"], ["situacao", "Situação"], ["criticidade", "Criticidade"],
  ["abc", "ABC"], ["categoria", "Categoria"], ["area", "Área"], ["localInstalacao", "Local de instalação"],
  ["centro", "Centro"], ["origem", "Origem"], ["fabricante", "Fabricante"], ["modelo", "Modelo"], ["serie", "Nº de série"],
  ["anoInstalacao", "Ano de instalação"], ["idade", "Idade (anos)"], ["vidaUtil", "Vida útil (anos)"],
  ["vidaRestante", "Vida restante (anos)"], ["garantiaAte", "Garantia até"], ["garantia", "Garantia"],
  ["valorReposicao", "Valor de reposição"], ["custo12Meses", "Custo 12 meses"], ["custoPorReposicaoPct", "Custo ÷ reposição %"],
  ["custoTotal", "Custo total"], ["ordensPendentes", "Ordens pendentes"], ["quebras12Meses", "Quebras 12 meses"],
  ["mtbfDias", "MTBF (dias)"], ["saude", "Saúde"], ["faixa", "Faixa"], ["planosPreventivos", "Planos preventivos"],
  ["cobertoPorPlano", "Coberto por plano"], ["pecasVinculadas", "Peças vinculadas"], ["recomendacao", "Recomendação"],
];

/** Arredonda como o pandas/numpy (metade para o par). */
function arred(x: number): number {
  const piso = Math.floor(x);
  return x - piso === 0.5 ? (piso % 2 === 0 ? piso : piso + 1) : Math.round(x);
}

/** Número positivo do cadastro (texto ou número); vazio, zero, negativo ou ilegível → null. */
function num(v: unknown): number | null {
  if (typeof v !== "number" && typeof v !== "string" && typeof v !== "boolean") return null;
  if (typeof v === "string" && !v.trim()) return null;
  const x = Number(v);
  return !Number.isNaN(x) && x > 0 ? x : null;
}

/** Campo de texto do cadastro (como `str(i.get(nome) or "").strip()`). */
function campoTexto(v: unknown): string {
  if (!v || (Array.isArray(v) && !v.length)) return "";
  return String(v).trim();
}

const ehDict = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const contar = (m: Map<string, number>, k: string, v = 1) => m.set(k, (m.get(k) ?? 0) + v);

/** Situação da garantia na data de hoje. */
export function situacaoGarantia(ate: Dia | null, hoje: Dia): string {
  if (ate == null) return GARANTIAS[3];
  if (ate < hoje) return GARANTIAS[2];
  return ate <= hoje + AVISO_GARANTIA_DIAS ? GARANTIAS[1] : GARANTIAS[0];
}

/** Planos distintos por equipamento (vazio conta como um valor, como o nunique do pandas). */
function planosDistintos<T>(xs: T[], chaveDe: (x: T) => string, planoDe: (x: T) => string | null | undefined): Map<string, number> {
  const s = new Map<string, Set<string>>();
  for (const x of xs) {
    const p = planoDe(x);
    if (p == null) continue;
    const k = chaveDe(x);
    let g = s.get(k);
    if (!g) s.set(k, (g = new Set()));
    g.add(p);
  }
  return new Map([...s].map(([k, g]) => [k, g.size]));
}

/**
 * Uma linha por ativo com cadastro, ciclo de vida, custo, confiabilidade, plano e recomendação — ordenada pela
 * criticidade (Alta, Média, Baixa, sem) e, dentro dela, pelo custo de 12 meses (maior primeiro).
 */
export function inventario(hoje: Dia, e: EntradasAtivos = {}): LinhaAtivo[] {
  const desde = hoje - JANELA_DIAS;
  const anoHoje = partes(hoje).ano;
  const cadEq = new Map(Object.entries(e.cadEq ?? {}).filter(([, v]) => ehDict(v)) as [string, Record<string, unknown>][]);
  const equip = e.equip?.length ? e.equip : null;
  const o = e.ordens?.length ? e.ordens.filter((x) => x.equipChave !== "" && x.situacao !== "Cancelada") : null;

  const sap = new Set(equip?.map((x) => x.equipamento) ?? []);
  const dasOrdens = new Set(o?.map((x) => x.equipChave) ?? []);
  const universo = new Set([...sap, ...cadEq.keys(), ...dasOrdens]);
  universo.delete("");
  if (!universo.size) return [];
  const idx = [...universo].sort();

  const ref = new Map<string, EquipAtivo>();
  for (const x of equip ?? []) if (!ref.has(x.equipamento)) ref.set(x.equipamento, x);
  const nomeO = new Map<string, string>();
  for (const x of o ?? []) if (!nomeO.has(x.equipChave)) nomeO.set(x.equipChave, x.objeto);
  const valido = (v: string) => (v === "nan" ? "" : v);
  const areaO = modaPor(o ?? [], (x) => x.equipChave, (x) => valido(x.localizacao));
  const localO = modaPor(o ?? [], (x) => x.equipChave, (x) => valido(x.local));
  const centroO = modaPor(o ?? [], (x) => x.equipChave, (x) => valido(x.centroTrabalho));

  // custo e pendências (IW38)
  const custo12 = new Map<string, number>(), custoTot = new Map<string, number>(), pend = new Map<string, number>();
  for (const x of o ?? []) {
    const c = Number.isNaN(x.custoReal) ? 0 : x.custoReal;
    contar(custoTot, x.equipChave, c);
    if (x.data != null && x.data >= desde && x.data <= hoje) contar(custo12, x.equipChave, c);
    if (PENDENTES.has(x.situacao)) contar(pend, x.equipChave);
  }

  // confiabilidade: quebras de 12 meses
  const quebras = new Map<string, number>();
  for (const x of e.quebras ?? []) if (x.data != null && x.data >= desde && x.data <= hoje + 1) contar(quebras, x.equipChave);

  // saúde (índice 0–100 da Saúde dos ativos)
  const saude = new Map<string, SaudeAtivo>();
  for (const s of e.saude ?? []) if (!saude.has(s.codigo)) saude.set(s.codigo, s);

  // cobertura preventiva: planos de manutenção (IP19, ou as ordens de plano do IW38) do equipamento
  const chamadas = (e.chamadas ?? []).filter((c) => c.equipamento !== "" && c.situacao !== CHAMADA_SALTADA);
  const planosIp19 = planosDistintos(chamadas, (c) => c.equipamento, (c) => c.plano);
  const planosIw38 = planosDistintos((o ?? []).filter((x) => x.comPlano && x.plano !== "" && x.data != null && x.data >= desde),
    (x) => x.equipChave, (x) => x.plano);

  const out = idx.map((k): LinhaAtivo => {
    const info = cadEq.get(k) ?? {};
    const campo = (nome: string) => campoTexto(info[nome]);
    const eq = ref.get(k);
    // identificação: o nome digitado no site vale; sem ele, o do SAP (IH08, depois IW38)
    const equipamento = campo("nome") || eq?.denominacao || nomeO.get(k) || "";
    const noSap = sap.has(k), noSite = cadEq.has(k);
    const origem = noSap && noSite ? "SAP + site" : noSap || dasOrdens.has(k) ? "SAP" : "Site";
    // situação: a do cadastro do site; sem ela, desativado pelo IH08 ou em operação
    const sit = campo("situacao");
    const situacao = SITUACOES.includes(sit) ? sit : eq?.desativado ? DESATIVADO : OPERACAO;
    const abc = (eq?.codigoAbc ?? "").toUpperCase().trim();
    const criticidade = campo("criticidade") || ABC_PARA_CRITICIDADE[abc] || "";

    // ciclo de vida
    let ano = num(info.ano_instalacao);
    if (ano != null && (ano < 1900 || ano > anoHoje)) ano = null;
    const idade = ano != null ? anoHoje - ano : null;
    const vidaUtil = num(info.vida_util);
    const garantiaAte = info.garantia_ate ? paraData(info.garantia_ate) : null;
    const valorReposicao = num(info.valor_reposicao);
    const custo12Meses = custo12.get(k) ?? 0;
    const nQuebras = quebras.get(k) ?? 0;
    const p1 = planosIp19.get(k) ?? 0;
    const planosPreventivos = p1 > 0 ? p1 : planosIw38.get(k) ?? 0;
    const s = saude.get(k);
    const mats = Array.isArray(info.materiais) ? info.materiais : [];
    const linha: LinhaAtivo = {
      codigo: k, equipamento, situacao, criticidade, abc, categoria: campo("categoria"),
      area: eq?.localizacao || areaO.get(k) || "", localInstalacao: eq?.local || localO.get(k) || "",
      centro: centroO.get(k) ?? "", origem, fabricante: campo("fabricante"), modelo: campo("modelo"), serie: campo("serie"),
      anoInstalacao: ano, idade, vidaUtil, vidaRestante: vidaUtil != null && idade != null ? vidaUtil - idade : null,
      garantiaAte, garantia: situacaoGarantia(garantiaAte, hoje), valorReposicao, custo12Meses,
      custoPorReposicaoPct: valorReposicao != null ? arred((custo12Meses / valorReposicao) * 100) : null,
      custoTotal: custoTot.get(k) ?? 0, ordensPendentes: pend.get(k) ?? 0, quebras12Meses: nQuebras,
      // MTBF = dias da janela ÷ quebras
      mtbfDias: nQuebras > 0 ? arred(JANELA_DIAS / nQuebras) : null,
      saude: s && s.saude != null && !Number.isNaN(s.saude) ? s.saude : null, faixa: s?.faixa ?? "",
      planosPreventivos, cobertoPorPlano: planosPreventivos > 0, pecasVinculadas: new Set(mats).size, recomendacao: "",
    };
    linha.recomendacao = recomendar(linha);
    return linha;
  });
  const ordemCrit = (c: string) => ({ Alta: 0, "Média": 1, Baixa: 2 } as Record<string, number>)[c] ?? 3;
  return out.sort((a, b) => ordemCrit(a.criticidade) - ordemCrit(b.criticidade) || b.custo12Meses - a.custo12Meses);
}

/** Recomendação de um ativo (uma linha do inventário). */
export function recomendar(g: Pick<LinhaAtivo, "situacao" | "custoPorReposicaoPct" | "vidaRestante" | "faixa" |
  "criticidade" | "cobertoPorPlano">): string {
  if (g.situacao === DESATIVADO) return SEM_RECOMENDACAO;
  const pct = g.custoPorReposicaoPct, resto = g.vidaRestante;
  const critica = g.faixa === "Crítica";
  if ((pct != null && pct >= LIMITE_SUBSTITUICAO * 100) || (resto != null && resto <= 0 && critica)) return SUBSTITUIR;
  if ((g.criticidade === "Alta" || g.criticidade === "Média") && !g.cobertoPorPlano) return CRIAR_PLANO;
  if (critica) return ATACAR;
  if (!g.criticidade) return CLASSIFICAR;
  return MANTER;
}

export interface ResumoAtivos {
  ativos: number; desativados: number; alta: number; semCriticidade: number; parados: number;
  coberturaCriticos: number | null; coberturaAlta: number | null; custo12m: number; substituir: number;
  garantiaVencendo: number;
}

const pctCoberto = (xs: LinhaAtivo[]) => (xs.length ? (xs.filter((x) => x.cobertoPorPlano).length / xs.length) * 100 : null);

/** Números do topo da Gestão de ativos (desativados ficam fora, exceto na própria contagem). */
export function resumo(t: LinhaAtivo[]): ResumoAtivos {
  const ativos = t.filter((x) => x.situacao !== DESATIVADO);
  const crit = ativos.filter((x) => x.criticidade === "Alta" || x.criticidade === "Média");
  const alta = ativos.filter((x) => x.criticidade === "Alta");
  const n = (f: (x: LinhaAtivo) => boolean) => ativos.filter(f).length;
  return {
    ativos: ativos.length, desativados: t.length - ativos.length, alta: alta.length,
    semCriticidade: n((x) => x.criticidade === ""), parados: n((x) => x.situacao === "Parado"),
    coberturaCriticos: pctCoberto(crit), coberturaAlta: pctCoberto(alta),
    custo12m: ativos.reduce((s, x) => s + x.custo12Meses, 0), substituir: n((x) => x.recomendacao === SUBSTITUIR),
    garantiaVencendo: n((x) => x.garantia === GARANTIAS[1]),
  };
}

export interface LinhaPareto { codigo: string; equipamento: string; criticidade: string; custo12Meses: number; pctAcumulado: number }

/** Os `n` ativos que mais custaram em 12 meses (bad actors) com o % acumulado do custo da planta. */
export function paretoCusto(t: LinhaAtivo[], n = 15): LinhaPareto[] {
  const a = t.filter((x) => x.situacao !== DESATIVADO && x.custo12Meses > 0).sort((x, y) => y.custo12Meses - x.custo12Meses);
  const total = a.reduce((s, x) => s + x.custo12Meses, 0);
  if (!total) return [];
  let acum = 0;
  return a.slice(0, n).map((x) => {
    acum += x.custo12Meses;
    return { codigo: x.codigo, equipamento: x.equipamento, criticidade: x.criticidade, custo12Meses: x.custo12Meses,
      pctAcumulado: (acum / total) * 100 };
  });
}

export interface LinhaCompletude { informacao: string; preenchidoPct: number; faltando: number }

/** % dos ativos (não desativados) com cada informação preenchida — as lacunas do cadastro. */
export function completude(t: LinhaAtivo[]): LinhaCompletude[] {
  const a = t.filter((x) => x.situacao !== DESATIVADO);
  if (!a.length) return [];
  const crit = a.filter((x) => x.criticidade === "Alta" || x.criticidade === "Média");
  const campos: [string, LinhaAtivo[], (x: LinhaAtivo) => boolean][] = [
    ["Criticidade", a, (x) => x.criticidade !== ""],
    ["Plano preventivo (Alta/Média)", crit, (x) => x.cobertoPorPlano],
    ["Local de instalação", a, (x) => x.localInstalacao !== ""],
    ["Fabricante / modelo", a, (x) => x.fabricante !== "" || x.modelo !== ""],
    ["Ano de instalação", a, (x) => x.anoInstalacao != null],
    ["Valor de reposição", a, (x) => x.valorReposicao != null],
    ["Peças vinculadas", a, (x) => x.pecasVinculadas > 0],
  ];
  return campos.map(([informacao, xs, ok]) => {
    const sim = xs.filter(ok).length;
    return { informacao, preenchidoPct: xs.length ? (sim / xs.length) * 100 : 100, faltando: xs.length - sim };
  });
}

// ----------------------------------------------------------------------------
// Agregados das telas
// ----------------------------------------------------------------------------
/** Quantos ativos (não desativados) em cada recomendação, na ordem de RECOMENDACOES. */
export function contarRecomendacoes(t: LinhaAtivo[]): { recomendacao: string; ativos: number }[] {
  const a = t.filter((x) => x.situacao !== DESATIVADO);
  return RECOMENDACOES.map((r) => ({ recomendacao: r, ativos: a.filter((x) => x.recomendacao === r).length }));
}

export const SEM_AREA = "(sem área)";

/** Ativos (não desativados) por área e criticidade — as `n` áreas com mais ativos. */
export function porArea(t: LinhaAtivo[], n = 15): { areas: string[]; linhas: { area: string; criticidade: string; ativos: number }[] } {
  const a = t.filter((x) => x.situacao !== DESATIVADO);
  const porA = new Map<string, number>(), cont = new Map<string, number>();
  for (const x of a) {
    const area = x.area || SEM_AREA, crit = x.criticidade || "Sem classe";
    contar(porA, area);
    contar(cont, `${area}\x1f${crit}`);
  }
  const areas = [...porA].sort((x, y) => y[1] - x[1]).slice(0, n).map(([k]) => k);
  const dentro = new Set(areas);
  const linhas = [...cont].map(([k, ativos]) => { const [area, criticidade] = k.split("\x1f"); return { area, criticidade, ativos }; })
    .filter((l) => dentro.has(l.area)).sort((x, y) => (x.area < y.area ? -1 : x.area > y.area ? 1 : x.criticidade < y.criticidade ? -1 : 1));
  return { areas, linhas };
}

export interface CicloDeVida {
  ativos: number; comAno: number; idadeMedia: number | null; vidaVencida: number; emGarantia: number;
  garantiaVencendo: number; temCicloCadastrado: boolean;
  /** substituição a avaliar, garantia vencendo ou ≤ 1 ano de vida útil */
  alerta: LinhaAtivo[];
}

/** Números e alertas da aba "Ciclo de vida". */
export function cicloDeVida(t: LinhaAtivo[]): CicloDeVida {
  const a = t.filter((x) => x.situacao !== DESATIVADO);
  const comAno = a.filter((x) => x.idade != null);
  const garantia = a.filter((x) => x.garantia === GARANTIAS[0] || x.garantia === GARANTIAS[1]);
  return {
    ativos: a.length, comAno: comAno.length,
    idadeMedia: comAno.length ? comAno.reduce((s, x) => s + x.idade!, 0) / comAno.length : null,
    vidaVencida: a.filter((x) => x.vidaRestante != null && x.vidaRestante <= 0).length, emGarantia: garantia.length,
    garantiaVencendo: garantia.filter((x) => x.garantia === GARANTIAS[1]).length,
    temCicloCadastrado: comAno.length > 0 || a.some((x) => x.valorReposicao != null) || garantia.length > 0,
    alerta: a.filter((x) => x.recomendacao === SUBSTITUIR || x.garantia === GARANTIAS[1] ||
      (x.vidaRestante != null && x.vidaRestante <= 1)),
  };
}
