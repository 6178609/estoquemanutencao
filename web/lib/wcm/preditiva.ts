import { semAcento } from "../dados/texto";
import * as ex from "./execucao";
import type { Confirmacao, Nota, Operacao, Ordem, Pessoa } from "./preparo";
import { hoje as hojeLocal, inicioDoMes, mesBr, soma, type Dia } from "./util";

/**
 * Manutenção preditiva SEMEQ — anomalias apontadas (notas IW28) e a tratativa
 * (ordens IW38). As notas e ordens da preditiva trazem no texto o padrão "SEMEQ-<técnica>-<nº>-<achado>"
 * (ex.: SEMEQ-AVB-333-DESBALANCEAMENTO). Uma anomalia é identificada pela técnica + nº; a nota registra a detecção
 * e a ordem é a tratativa. A nota se liga à ordem pelo campo Ordem ou pelo mesmo código no texto.
 */

const PALAVRA = "SEMEQ";
// \W (Unicode) = nem letra, nem número, nem "_"
const RX = /SEMEQ[^\p{L}\p{N}_]*(?<tec>[A-Z]{2,4})[^\p{L}\p{N}_]*(?<num>\p{Nd}+)[^\p{L}\p{N}_]*(?<achado>.*)/u;
const TECNICAS: Record<string, string> = {
  AVB: "Análise de vibração", AOL: "Análise de óleo", TMP: "Termografia", TER: "Termografia", UTS: "Ultrassom",
  ULT: "Ultrassom", MCA: "Análise de circuito de motor", END: "Ensaio não destrutivo", INS: "Inspeção sensitiva",
};

export const TRATADA = "Tratada", SEM_CONF = "Encerrada sem confirmação", TRATATIVA = "Em tratativa", ATRASADA = "Atrasada",
  SEM_ORDEM = "Sem ordem", CANCELADA = "Cancelada";
export const SITUACOES = [TRATADA, SEM_CONF, TRATATIVA, ATRASADA, SEM_ORDEM, CANCELADA] as const;
export type SituacaoAnomalia = (typeof SITUACOES)[number];
const ABERTAS = new Set<SituacaoAnomalia>([SEM_CONF, TRATATIVA, ATRASADA, SEM_ORDEM]);

/** O texto tem SEMEQ? */
export const ehSemeq = (texto: unknown) => String(texto ?? "").toUpperCase().includes(PALAVRA);

/** Código (técnica-nº sem zeros à esquerda), sigla da técnica e achado do texto SEMEQ. */
export function partesSemeq(texto: unknown): { codigo: string; sigla: string; achado: string } {
  const m = RX.exec(semAcento(texto ?? "").toUpperCase());
  const g = m?.groups;
  const achado = (g?.achado ?? "").replace(/^[ \-_.]+|[ \-_.]+$/g, "").replace(/\s+/g, " ");
  return { codigo: g ? `${g.tec}-${g.num.replace(/^0+/, "")}` : "", sigla: g?.tec ?? "", achado };
}

/** 1ª letra maiúscula, o resto minúsculo. */
const capitalizar = (s: string) => (s ? s[0].toUpperCase() + s.slice(1).toLowerCase() : s);

export interface Anomalia {
  codigo: string; tecnica: string; sigla: string; achado: string; texto: string;
  equipamento: string; objeto: string; area: string; centroTrabalho: string;
  deteccao: Dia | null; dataNota: Dia | null; dataOrdem: Dia | null;
  nota: string; ordem: string; tipo: string; situacaoOrdem: string; fimPrevisto: Dia | null; custoReal: number;
  fimReal: Dia | null; hhApontadas: number | null; tratadoPor: string; statusSap: string;
  situacao: SituacaoAnomalia; diasParaTratar: number | null; diasEmAberto: number | null;
}

/** Uma linha da nota (detecção) e/ou da ordem (tratativa), antes de virar anomalia. */
interface Parte {
  codigo: string; sigla: string; achado: string; texto: string; equipChave: string; objeto: string; area: string;
  centroTrabalho: string;
  nota: string; ordemNota: string; dataNota: Dia | null;
  ordem: string; dataOrdem: Dia | null; tipo: string; situacaoOrdem: string; fimPrevisto: Dia | null; custoReal: number;
}

const VAZIA = { nota: "", ordemNota: "", dataNota: null, ordem: "", dataOrdem: null, tipo: "", situacaoOrdem: "",
  fimPrevisto: null, custoReal: 0 } as const;

function daNota(n: Nota): Parte {
  const p = partesSemeq(n.descricao);
  return { ...VAZIA, ...p, texto: n.descricao, nota: n.nota, ordemNota: n.ordem, dataNota: n.data, equipChave: n.equipChave,
    objeto: n.objeto, area: n.localizacao, centroTrabalho: n.centroTrabalho };
}

function daOrdem(o: Ordem): Parte {
  const p = partesSemeq(o.texto);
  return { ...VAZIA, ...p, texto: o.texto, ordem: o.ordem, dataOrdem: o.data, equipChave: o.equipChave, objeto: o.objeto,
    area: o.localizacao, centroTrabalho: o.centroTrabalho, tipo: o.tipo, situacaoOrdem: o.situacao, fimPrevisto: o.fim,
    custoReal: o.custoReal };
}

/** Nota + ordem: os campos da nota valem; vazios, completa com os da ordem. */
function juntar(n: Parte, o: Parte | undefined): Parte {
  if (!o) return n;
  const ou = (a: string, b: string) => a || b;
  return { ...n, codigo: ou(n.codigo, o.codigo), sigla: ou(n.sigla, o.sigla), achado: ou(n.achado, o.achado),
    texto: ou(n.texto, o.texto), equipChave: ou(n.equipChave, o.equipChave), objeto: ou(n.objeto, o.objeto),
    area: ou(n.area, o.area), centroTrabalho: ou(n.centroTrabalho, o.centroTrabalho), ordem: o.ordem, dataOrdem: o.dataOrdem,
    tipo: o.tipo, situacaoOrdem: o.situacaoOrdem, fimPrevisto: o.fimPrevisto, custoReal: o.custoReal };
}

function maxPor<T>(xs: T[], k: (x: T) => string, v: (x: T) => Dia | null): Map<string, Dia> {
  const m = new Map<string, Dia>();
  for (const x of xs) {
    const d = v(x);
    if (d == null) continue;
    const c = k(x), a = m.get(c);
    if (a == null || d > a) m.set(c, d);
  }
  return m;
}

/**
 * Uma linha por anomalia SEMEQ, juntando a nota (detecção) e a ordem (tratativa).
 *
 * Tratada = ordem encerrada (ENTE) ou com todas as operações executadas, e confirmada (CONF) ou com apontamento na
 * IW47 — o status vale pelo IW38, IW38OP ou IW47 (a mais recente).
 */
export function anomalias(notas: Nota[] | null | undefined, ordens: Ordem[] | null | undefined,
  oper: Operacao[] | null = null, conf: Confirmacao[] | null = null, equipe: Pessoa[] | null = null,
  hoje: Dia = hojeLocal()): Anomalia[] {
  const ns = (notas ?? []).filter((n) => ehSemeq(n.descricao)).map(daNota);
  const os = (ordens ?? []).filter((o) => ehSemeq(o.texto)).map(daOrdem);
  if (!ns.length && !os.length) return [];

  let linhas: Parte[];
  if (ns.length && os.length) {
    // liga pela ordem da nota; sem ela, pelo mesmo código SEMEQ no texto
    const porOrdem = new Map<string, Parte[]>();
    for (const o of os) (porOrdem.get(o.ordem) ?? porOrdem.set(o.ordem, []).get(o.ordem)!).push(o);
    const porCodigo = new Map<string, Parte>();
    for (const o of os) if (o.codigo && !porCodigo.has(o.codigo)) porCodigo.set(o.codigo, o);
    const a: Parte[] = [], b: Parte[] = [], semCod: Parte[] = [];
    for (const n of ns) {
      const pelaOrdem = porOrdem.get(n.ordemNota);
      if (pelaOrdem) for (const o of pelaOrdem) a.push(juntar(n, o));
      else if (n.codigo) b.push(juntar(n, porCodigo.get(n.codigo)));
      else semCod.push(n);
    }
    const juntas = [...a, ...b, ...semCod];
    const usadas = new Set(juntas.map((x) => x.ordem).filter(Boolean));
    linhas = [...juntas, ...os.filter((o) => !usadas.has(o.ordem))];
  } else linhas = ns.length ? ns : os;

  const base = linhas.map((p) => ({ ...p, ordem: p.ordem || p.ordemNota }));
  const ordensSemeq = new Set(base.map((x) => x.ordem).filter(Boolean));

  // fim real (IW38OP) e quem tratou (IW47)
  const fimOper = maxPor((oper ?? []).filter((o) => o.concluida && o.fimReal != null), (o) => o.ordem, (o) => o.fimReal);
  const c = (conf ?? []).filter((x) => ordensSemeq.has(x.ordem));
  const nm = new Map((equipe ?? []).map((p) => [p.np, p.nome]));
  const hh = new Map<string, number>(), quem = new Map<string, string[]>();
  for (const x of c) {
    hh.set(x.ordem, (hh.get(x.ordem) ?? 0) + x.horas);
    (quem.get(x.ordem) ?? quem.set(x.ordem, []).get(x.ordem)!).push(nm.has(x.np) ? nm.get(x.np)! : x.np);
  }
  const ultimo = maxPor(c, (x) => x.ordem, (x) => x.data);

  // status do SAP como na execução das atividades: IW38 + IW38OP + IW47 (a IW47 costuma ser a mais recente)
  const toks = new Map<string, Set<string>>();
  const juntarStatus = (xs: { ordem: string; statusSistema: string }[]) => {
    for (const x of xs) {
      if (!ordensSemeq.has(x.ordem)) continue;
      const s = toks.get(x.ordem) ?? toks.set(x.ordem, new Set()).get(x.ordem)!;
      for (const t of x.statusSistema.split(/\s+/)) if (t) s.add(t);
    }
  };
  juntarStatus(ordens ?? []);
  juntarStatus(oper ?? []);
  juntarStatus(c);
  // todas as operações da ordem executadas (CONF/ENTE no IW38OP ou na IW47)?
  const tudo = new Map<string, boolean>();
  const op = (oper ?? []).filter((o) => ordensSemeq.has(o.ordem));
  if (op.length)
    for (const o of ex.operacoes(op, null, c, equipe, hoje))
      if (o.situacao !== ex.CANCELADA) tudo.set(o.ordem, (tudo.get(o.ordem) ?? true) && o.concluida);

  const out = base.map((p): Anomalia => {
    const t = toks.get(p.ordem) ?? new Set<string>();
    const sit = p.situacaoOrdem;
    const tratadoPor = quem.has(p.ordem) ? [...new Set(quem.get(p.ordem))].join(", ") : "";
    const encerrada = sit === "Concluída" || sit === "Encerrada sem confirmação" || t.has("ENTE") || t.has("ENCE");
    const confirmada = sit === "Concluída" || t.has("CONF") || tratadoPor !== "";
    const cancelada = sit === "Cancelada" || t.has("DLFL") || t.has("MREL") || t.has("MEEL");
    const pendente = !encerrada && !cancelada;
    const feitas = tudo.get(p.ordem) ?? false;
    const situacao: SituacaoAnomalia = p.ordem === "" ? SEM_ORDEM : cancelada ? CANCELADA
      : (encerrada || feitas) && confirmada ? TRATADA : encerrada ? SEM_CONF
      : pendente && p.fimPrevisto != null && p.fimPrevisto < hoje ? ATRASADA : TRATATIVA;
    const deteccao = p.dataNota ?? p.dataOrdem;
    const tratada = situacao === TRATADA;
    const fimReal = fimOper.get(p.ordem) ?? (tratada ? ultimo.get(p.ordem) ?? null : null);
    const fim = fimReal ?? (tratada ? p.fimPrevisto : null);
    const dias = tratada && fim != null && deteccao != null ? fim - deteccao : null;
    return {
      codigo: p.codigo, tecnica: TECNICAS[p.sigla] ?? p.sigla, sigla: p.sigla, achado: capitalizar(p.achado), texto: p.texto,
      equipamento: p.equipChave, objeto: p.objeto, area: p.area, centroTrabalho: p.centroTrabalho, deteccao,
      dataNota: p.dataNota, dataOrdem: p.dataOrdem, nota: p.nota, ordem: p.ordem, tipo: p.tipo, situacaoOrdem: sit,
      fimPrevisto: p.fimPrevisto, custoReal: p.custoReal, fimReal, hhApontadas: hh.get(p.ordem) ?? null, tratadoPor,
      statusSap: [...t].sort().join(" "), situacao, diasParaTratar: dias != null && dias >= 0 ? dias : null,
      diasEmAberto: ABERTAS.has(situacao) && deteccao != null ? hoje - deteccao : null,
    };
  });
  // mais recentes primeiro; sem data no fim
  return out.map((x, i) => [x, i] as const).sort(([a, i], [b, j]) => {
    if (a.deteccao == null || b.deteccao == null)
      return a.deteccao == null && b.deteccao == null ? i - j : a.deteccao == null ? 1 : -1;
    return b.deteccao - a.deteccao || i - j;
  }).map(([x]) => x);
}

// ----------------------------------------------------------------------------
// Indicadores e quadros da página
// ----------------------------------------------------------------------------
const entre = ex.entre;

interface IndicadoresPreditiva {
  semeq_detectadas: number; semeq_com_ordem: number | null; semeq_tratadas: number | null; semeq_dias: number | null;
  semeq_abertas: number; semeq_atrasadas: number; semeq_equipamentos: number; semeq_reincidentes: number;
  semeq_custo: number;
}

/** Contagem por equipamento (sem equipamento fica de fora). */
function porEquipamento(xs: Anomalia[]): Map<string, Anomalia[]> {
  const m = new Map<string, Anomalia[]>();
  for (const a of xs) if (a.equipamento !== "") (m.get(a.equipamento) ?? m.set(a.equipamento, []).get(a.equipamento)!).push(a);
  return m;
}

/** Anomalias não canceladas detectadas no período. */
export const noPeriodo = (an: Anomalia[], ini: Dia, fim: Dia) =>
  an.filter((a) => a.situacao !== CANCELADA && entre(a.deteccao, ini, fim));

/** Indicadores da preditiva no período (pela data de detecção); abertas e atrasadas são de hoje. */
export function indicadores(an: Anomalia[], ini: Dia, fim: Dia): IndicadoresPreditiva {
  const vivas = an.filter((a) => a.situacao !== CANCELADA);
  const per = noPeriodo(an, ini, fim);
  const dias = per.map((a) => a.diasParaTratar).filter((d): d is number => d != null);
  const eq = porEquipamento(per);
  return {
    semeq_detectadas: per.length,
    semeq_com_ordem: per.length ? (per.filter((a) => a.situacao !== SEM_ORDEM).length / per.length) * 100 : null,
    semeq_tratadas: per.length ? (per.filter((a) => a.situacao === TRATADA).length / per.length) * 100 : null,
    semeq_dias: dias.length ? soma(dias) / dias.length : null,
    semeq_abertas: vivas.filter((a) => ABERTAS.has(a.situacao)).length,
    semeq_atrasadas: vivas.filter((a) => a.situacao === ATRASADA).length,
    semeq_equipamentos: eq.size,
    semeq_reincidentes: [...eq.values()].filter((x) => x.length > 1).length,
    semeq_custo: soma(per.map((a) => a.custoReal)),
  };
}

/** HH apontadas (IW47) nas ordens das anomalias. */
export const hhApontadas = (xs: Anomalia[]) => soma(xs.map((a) => a.hhApontadas ?? 0));

/** A fila de abertas (não canceladas), as mais antigas primeiro. */
export function filaAbertas(an: Anomalia[]): Anomalia[] {
  return an.filter((a) => ABERTAS.has(a.situacao))
    .map((x, i) => [x, i] as const)
    .sort(([a, i], [b, j]) => {
      if (a.diasEmAberto == null || b.diasEmAberto == null)
        return a.diasEmAberto == null && b.diasEmAberto == null ? i - j : a.diasEmAberto == null ? 1 : -1;
      return b.diasEmAberto - a.diasEmAberto || i - j;
    }).map(([x]) => x);
}

/** Anomalias por mês de detecção e técnica (para o gráfico de barras empilhadas). */
export function porMesTecnica(per: Anomalia[]): { mes: Dia; mesTxt: string; tecnica: string; anomalias: number }[] {
  const m = new Map<string, { mes: Dia; mesTxt: string; tecnica: string; anomalias: number }>();
  for (const a of per) {
    if (a.deteccao == null) continue;
    const mes = inicioDoMes(a.deteccao);
    const k = `${mes}\u0000${a.tecnica}`;
    const g = m.get(k) ?? m.set(k, { mes, mesTxt: mesBr(mes), tecnica: a.tecnica, anomalias: 0 }).get(k)!;
    g.anomalias++;
  }
  return [...m.values()].sort((a, b) => a.mes - b.mes || (a.tecnica < b.tecnica ? -1 : a.tecnica > b.tecnica ? 1 : 0));
}

/** Quantas anomalias de cada técnica em cada situação. */
export function situacaoPorTecnica(per: Anomalia[]): { tecnica: string; situacao: SituacaoAnomalia; anomalias: number }[] {
  const m = new Map<string, { tecnica: string; situacao: SituacaoAnomalia; anomalias: number }>();
  for (const a of per) {
    const k = `${a.tecnica}\u0000${a.situacao}`;
    (m.get(k) ?? m.set(k, { tecnica: a.tecnica, situacao: a.situacao, anomalias: 0 }).get(k)!).anomalias++;
  }
  return [...m.values()].sort((a, b) => (a.tecnica < b.tecnica ? -1 : a.tecnica > b.tecnica ? 1 : 0)
    || SITUACOES.indexOf(a.situacao) - SITUACOES.indexOf(b.situacao));
}

/** Pareto dos achados (modos de falha mais apontados). */
export function paretoAchados(per: Anomalia[], n = 12): { achado: string; anomalias: number }[] {
  const m = new Map<string, number>();
  for (const a of per) { const k = a.achado || "(não informado)"; m.set(k, (m.get(k) ?? 0) + 1); }
  return [...m.entries()].map(([achado, anomalias]) => ({ achado, anomalias }))
    .sort((a, b) => b.anomalias - a.anomalias).slice(0, n);
}

/** Equipamentos com mais anomalias (reincidência), com quantas ainda abertas. */
export function equipamentosMaisAnomalias(per: Anomalia[], n = 12):
  { equipamento: string; nome: string; anomalias: number; abertas: number }[] {
  return [...porEquipamento(per).entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([equipamento, xs]) => ({ equipamento, nome: xs[0].objeto, anomalias: xs.length,
      abertas: xs.filter((a) => ABERTAS.has(a.situacao)).length }))
    .sort((a, b) => b.anomalias - a.anomalias || b.abertas - a.abertas).slice(0, n);
}

interface FiltroAnomalias { busca?: string; tecnicas?: string[]; situacoes?: string[]; todasAsDatas?: boolean }

/** A tabela: período (ou todas as datas), busca (código, achado, equipamento, nota, ordem, quem tratou), técnica e situação. */
export function filtrarAnomalias(an: Anomalia[], ini: Dia, fim: Dia, f: FiltroAnomalias = {}): Anomalia[] {
  const termos = semAcento(f.busca ?? "").toUpperCase().split(/\s+/).filter(Boolean);
  const tecs = f.tecnicas?.length ? new Set(f.tecnicas) : null;
  const sits = f.situacoes?.length ? new Set(f.situacoes) : null;
  return an.filter((a) => {
    if (!f.todasAsDatas && !entre(a.deteccao, ini, fim)) return false;
    if (tecs && !tecs.has(a.tecnica)) return false;
    if (sits && !sits.has(a.situacao)) return false;
    if (termos.length) {
      const hay = semAcento(`${a.codigo} ${a.achado} ${a.equipamento} ${a.objeto} ${a.nota} ${a.ordem} ${a.tratadoPor}`).toUpperCase();
      if (!termos.every((t) => hay.includes(t))) return false;
    }
    return true;
  });
}

/** Técnicas que aparecem (para o filtro). */
export const tecnicasDe = (an: Anomalia[]) => [...new Set(an.map((a) => a.tecnica))].sort();
