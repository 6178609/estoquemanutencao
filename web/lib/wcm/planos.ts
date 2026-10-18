import { acharColuna, casaBusca, chave, normalizarBusca, paraNumero, texto } from "../dados/texto";
import type { Crua, Ordem } from "./preparo";
import { dia, foraDaVisao, hoje as hojeLocal, mediana, paraData, partes, setorDoCentro, type Dia } from "./util";

/**
 * Planos de manutenção. As chamadas da IP19 (programação dos planos) num calendário
 * semanal, cruzadas com as ordens do IW38 para saber o que foi executado.
 *
 * Sem IP19, monta a mesma visão a partir das ordens do IW38 que têm plano (só o que já virou ordem; as chamadas
 * futuras exigem a IP19). Testado em testes/planos.test.ts.
 */

// ----------------------------------------------------------------------------
// Situação de cada chamada
// ----------------------------------------------------------------------------
export const CONCLUIDA = "Concluída", ABERTA = "Em aberto", ATRASADA = "Atrasada", PROGRAMADA = "Programada",
  SALTADA = "Saltada/cancelada", SEM_STATUS = "Sem status";
export const SITUACOES = [CONCLUIDA, ABERTA, ATRASADA, PROGRAMADA, SALTADA, SEM_STATUS] as const;
export type SituacaoChamada = (typeof SITUACOES)[number];
/** O que aparece na célula quando há mais de uma chamada na mesma semana (a primeira da lista vence). */
export const PRIORIDADE: SituacaoChamada[] = [ATRASADA, ABERTA, PROGRAMADA, CONCLUIDA, SALTADA, SEM_STATUS];
export const SIMBOLO: Record<SituacaoChamada, string> = {
  [CONCLUIDA]: "✓", [ABERTA]: "●", [ATRASADA]: "!", [PROGRAMADA]: "○", [SALTADA]: "–", [SEM_STATUS]: "·",
};
/** [fundo, texto] de cada situação (verde/laranja/vermelho do tema; azul e cinzas neutros). */
export const COR: Record<SituacaoChamada, [string, string]> = {
  [CONCLUIDA]: ["#D3F0DE", "#0B7A36"],
  [ABERTA]: ["#D6E8F7", "#0A5A9C"],
  [ATRASADA]: ["#F9D4D5", "#B3161B"],
  [PROGRAMADA]: ["#FFFFFF", "#6B7370"],
  [SALTADA]: ["#ECEEED", "#8C9491"],
  [SEM_STATUS]: ["#F4F6F5", "#8C9491"],
};
const PRI = new Map<string, number>(PRIORIDADE.map((s, i) => [s, i]));

/** Uma chamada do plano (plano + item + data planejada), já com as operações juntadas. */
export interface Chamada {
  plano: string; item: string; texto: string; equipamento: string; objeto: string; local: string; centroTrabalho: string;
  grupoPlanejamento: string; ciclo: string; pacote: string; estrategia: string; tipoOrdem: string;
  dataPlanejada: Dia | null; dataChamada: Dia | null; dataConclusao: Dia | null; tipoProgramacao: string; ordem: string;
  atividade: string; horas: number; operacoes: number; setor: string;
  /** veio das ordens do IW38 (sem IP19) */
  doIw38: boolean;
}

/** A chamada depois de `classificar`: situação, data de referência e o cruzamento com o IW38. */
export interface ChamadaClassificada extends Chamada {
  situacaoIw38: string; custoReal: number; data: Dia | null; situacao: SituacaoChamada;
  ano: number | null; semana: number | null; chave: string;
}

// ----------------------------------------------------------------------------
// Leitura da IP19
// ----------------------------------------------------------------------------
const COLUNAS: Record<string, string[]> = {
  plano: ["^PLANO( DE)? MANUT", "^PLANO MANUT", "^PLANO$", "PLANO DE MANUTENCAO"],
  item: ["^ITEM( DE)? MANUT", "^ITEM MANUT", "^ITEM$"],
  texto: ["TEXTO.*PLANO", "DENOMINACAO.*PLANO", "TEXTO.*ITEM", "TEXTO BREVE", "^TEXTO", "DESCRICAO"],
  equipamento: ["^EQUIPAMENTO$"],
  objeto: ["DENOMINACAO.*(OBJETO|EQUIP)", "OBJETO TECNICO", "DESCRICAO.*EQUIP"],
  local: ["DENOMINACAO.*LOC", "LOC.*INSTAL"],
  centroTrabalho: ["CENTRO TRAB", "CENTRO DE TRABALHO", "CEN TRAB"],
  grupoPlanejamento: ["GRUPO.*PLANEJ", "GRP.*PLAN", "GRP PLNJ"],
  ciclo: ["CICLO", "PERIODICIDADE", "FREQUENCIA", "INTERVALO"],
  pacote: ["PACOTES? VENCIDOS?", "^PACOTE"],
  estrategia: ["ESTRAT"],
  tipoOrdem: ["TIPO DE ORDEM"],
  trabalho: ["^TRABALHO$"],
  unidade: ["UNIDADE DO TRABALHO"],
  dataPlanejada: ["DATA PLAN", "DT PLAN", "PLANEJAD", "DATA PROGRAM"],
  dataChamada: ["DATA (DE )?CHAMADA", "DT CHAM", "CHAMADA EM"],
  dataConclusao: ["DATA (DE )?CONCL", "DATA (DE )?ENCERR", "DT CONCL", "CONCLUSAO"],
  tipoProgramacao: ["TIPO (DE )?PROGRAM", "^ST SOLICIT", "SOLICITACAO", "STATUS", "TIPO (DE )?CHAMADA", "AGENDAMENTO",
    "PROGRAMACAO"],
  ordem: ["^ORDEM$", "^ORDEM", "ORDEM"],
};
const EXCLUIR: Record<string, string> = {
  ordem: "TIPO|STATUS", texto: "OBJETO|EQUIP|LOC|OPERACAO", dataConclusao: "PLAN|CHAMADA",
  tipoProgramacao: "USUARIO|SISTEMA|ROTEIRO|ATIVIDAD", item: "GRUPO",
};
// unidade desconhecida conta como hora (na IP19; no IW38OP é minuto)
const HORAS_POR: Record<string, number> = { MIN: 1 / 60, H: 1, HR: 1, STD: 1 };

/** Data de célula: texto (dd/mm/aaaa, ISO), Date ou número serial do Excel. */
function dataDe(v: unknown): Dia | null {
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : dia(v.getUTCFullYear(), v.getUTCMonth() + 1, v.getUTCDate());
  if (typeof v === "number") return v > 20000 && v < 80000 ? Math.floor(v) - 25569 : null; // serial do Excel
  return paraData(v);
}

const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
/** Datas em ordem (decrescente se `desc`), sem data sempre no fim */
const cmpDia = (a: Dia | null, b: Dia | null, desc = false) =>
  a === b ? 0 : a == null ? 1 : b == null ? -1 : desc ? b - a : a - b;

/**
 * Uma linha por chamada (plano + item + data planejada). A IP19 costuma vir com uma linha por operação da lista de
 * tarefas; elas são juntadas na chamada, somando o trabalho (horas) e contando as operações. Saem as chamadas sem
 * plano ou sem data, e (por padrão) as da Fábrica Piloto/Matrizaria, também pelo texto do plano.
 */
export function prepararIp19(cru: Crua[], excluirPilotoMatriz = true): Chamada[] {
  const colunas = cru.length ? Object.keys(cru[0]) : [];
  const usadas = new Set<string>();
  const col: Record<string, string | null> = {};
  for (const [nome, padroes] of Object.entries(COLUNAS)) {
    const c = acharColuna(colunas.filter((x) => !usadas.has(x)), padroes, EXCLUIR[nome]);
    if (c) usadas.add(c);
    col[nome] = c;
  }
  const t = (l: Crua, nome: string) => (col[nome] ? texto(l[col[nome]!]) : "");
  const d = (l: Crua, nome: string) => (col[nome] ? dataDe(l[col[nome]!]) : null);

  type Op = Omit<Chamada, "operacoes" | "setor">;
  const ops: Op[] = [];
  for (const l of cru) {
    const plano = t(l, "plano");
    const dataPlanejada = d(l, "dataPlanejada"), dataChamada = d(l, "dataChamada");
    if (!plano || (dataPlanejada == null && dataChamada == null)) continue;
    const textoPlano = t(l, "texto"), centroTrabalho = t(l, "centroTrabalho"), objeto = t(l, "objeto"), local = t(l, "local");
    if (excluirPilotoMatriz && (foraDaVisao({ "Centro de trabalho": centroTrabalho, "Local de instalação": local,
      "Objeto técnico": objeto, Texto: textoPlano }, ["Texto"]) || chave(textoPlano).includes("MATRIZARIA"))) continue;
    const tipoProgramacao = t(l, "tipoProgramacao");
    // "Programado,espera (Inspeção)" → atividade "Inspeção" (a simulação não é atividade)
    let atividade = /\(([^)]+)\)\s*$/.exec(tipoProgramacao)?.[1] ?? "";
    if (chave(atividade).includes("SIMULA")) atividade = "";
    const trabalho = paraNumero(col.trabalho ? l[col.trabalho] : "");
    ops.push({
      plano, item: t(l, "item"), texto: textoPlano, equipamento: t(l, "equipamento"), objeto, local, centroTrabalho,
      grupoPlanejamento: t(l, "grupoPlanejamento"), ciclo: t(l, "ciclo"), pacote: t(l, "pacote"),
      estrategia: t(l, "estrategia"), tipoOrdem: t(l, "tipoOrdem"), dataPlanejada, dataChamada,
      dataConclusao: d(l, "dataConclusao"), tipoProgramacao, ordem: t(l, "ordem"), atividade,
      horas: (Number.isNaN(trabalho) ? 0 : trabalho) * (HORAS_POR[t(l, "unidade").toUpperCase()] ?? 1), doIw38: false,
    });
  }

  // ordena por plano, item e data planejada (estável) e junta as operações de cada chamada: vale o primeiro valor;
  // nas datas de chamada/conclusão, a primeira preenchida (pula vazio)
  const idx = ops.map((_, i) => i).sort((a, b) =>
    cmp(ops[a].plano, ops[b].plano) || cmp(ops[a].item, ops[b].item) || cmpDia(ops[a].dataPlanejada, ops[b].dataPlanejada) || a - b);
  const grupos = new Map<string, Chamada>();
  for (const i of idx) {
    const o = ops[i];
    const k = `${o.plano}\x1f${o.item}\x1f${o.dataPlanejada ?? ""}`;
    const g = grupos.get(k);
    if (!g) grupos.set(k, { ...o, operacoes: 1, setor: setorDoCentro(o.centroTrabalho) });
    else {
      g.horas += o.horas;
      g.operacoes++;
      if (g.dataChamada == null) g.dataChamada = o.dataChamada;
      if (g.dataConclusao == null) g.dataConclusao = o.dataConclusao;
    }
  }
  return [...grupos.values()];
}

/** Chamadas aproximadas a partir das ordens do IW38 que têm plano (sem a IP19). */
export function deIw38(iw38: Ordem[]): Chamada[] {
  return iw38.filter((o) => o.comPlano).map((o) => ({
    plano: o.plano, item: "", texto: o.texto, equipamento: o.equipamento, objeto: o.objeto, local: o.local,
    centroTrabalho: o.centroTrabalho, grupoPlanejamento: "", ciclo: "", pacote: "", estrategia: "", tipoOrdem: o.tipo,
    dataPlanejada: o.inicio, dataChamada: o.entrada, dataConclusao: null, tipoProgramacao: "", ordem: o.ordem,
    atividade: "", horas: 0, operacoes: 0, setor: setorDoCentro(o.centroTrabalho), doIw38: true,
  }));
}

// ----------------------------------------------------------------------------
// Cruzamento com o IW38 e classificação
// ----------------------------------------------------------------------------
type OrdemPlano = Pick<Ordem, "ordem" | "plano" | "comPlano" | "inicio" | "situacao" | "custoReal" | "centroTrabalho" | "equipamento" | "objeto">;

/** Semana ISO (ano e número) do dia — a semana pertence ao ano da sua quinta-feira. */
export function semanaIso(d: Dia): { ano: number; semana: number } {
  const quinta = d - ((partes(d).semana + 6) % 7) + 3;
  const ano = partes(quinta).ano;
  return { ano, semana: Math.floor((quinta - dia(ano, 1, 1)!) / 7) + 1 };
}

/**
 * Acrescenta a situação da chamada, a data de referência da semana (planejada, ou a de chamada) e a situação/custo
 * da ordem no IW38. Centro de trabalho, equipamento e objeto vazios na IP19 são completados pela ordem.
 */
export function classificar(ch: Chamada[], iw38: OrdemPlano[] | null, hoje: Dia = hojeLocal()): ChamadaClassificada[] {
  let base = ch.map((c) => ({ ...c }));
  const temIw38 = iw38 != null && iw38.length > 0;
  if (temIw38 && !base.some((c) => c.doIw38) && base.every((c) => c.ordem === "")) base = ordemPorPlanoEData(base, iw38!);
  const ref = new Map<string, OrdemPlano>();
  if (temIw38) for (const o of iw38!) if (o.ordem !== "" && !ref.has(o.ordem)) ref.set(o.ordem, o);

  return base.map((c) => {
    const o = c.ordem !== "" ? ref.get(c.ordem) : undefined; // chamada sem ordem não cruza com nada
    const situacaoIw38 = o ? String(o.situacao) : "";
    const custoReal = o && !Number.isNaN(o.custoReal) ? o.custoReal : 0;
    if (o) {
      if (c.centroTrabalho === "") c.centroTrabalho = o.centroTrabalho;
      if (c.equipamento === "") c.equipamento = o.equipamento;
      if (c.objeto === "") c.objeto = o.objeto;
    }
    const tp = chave(c.tipoProgramacao);
    const data = c.dataPlanejada ?? c.dataChamada;
    const vencida = data != null && data < hoje;
    // "solicitado"/"chamado" = a ordem já foi gerada; "espera" = ainda não
    const chamada = c.ordem !== "" || /CHAMAD|SOLICITAD/.test(tp);
    let situacao: SituacaoChamada;
    if (/SALT|PULAD|SKIP|IGNORAD/.test(tp) || situacaoIw38 === "Cancelada") situacao = SALTADA;
    else if (c.dataConclusao != null || /CONCLU|ENCERR/.test(tp) || situacaoIw38 === "Concluída") situacao = CONCLUIDA;
    // ordem antiga sem status no export do IW38: só vale quando o calendário vem do próprio IW38;
    // com a IP19, quem decide é a programação do plano
    else if (situacaoIw38 === "Sem status" && c.doIw38) situacao = SEM_STATUS;
    else if (chamada) situacao = vencida ? ATRASADA : ABERTA;
    else situacao = vencida ? ATRASADA : PROGRAMADA;
    const iso = data != null ? semanaIso(data) : null;
    return { ...c, situacaoIw38, custoReal, data, situacao, ano: iso?.ano ?? null, semana: iso?.semana ?? null,
      chave: c.item !== "" ? `${c.plano} / ${c.item}` : c.plano };
  });
}

export const JANELA_DIAS = 10;

/**
 * A IP19 sem coluna de ordem: liga cada chamada à ordem do IW38 do mesmo plano com data-base de início mais próxima
 * da data planejada (até JANELA_DIAS de diferença; no empate, a de antes). Cada ordem fica com uma chamada só (a mais
 * próxima). Só entram chamadas que já geraram ordem ("solicitado", "chamado", "concluído") ou sem status nenhum —
 * "espera" e "ignorado" ainda não têm ordem e não podem roubar a de outra chamada.
 */
function ordemPorPlanoEData<T extends Chamada>(ch: T[], iw38: OrdemPlano[]): T[] {
  const porPlano = new Map<string, { inicio: Dia; ordem: string }[]>();
  for (const o of iw38) {
    if (!o.comPlano || o.inicio == null) continue;
    const l = porPlano.get(o.plano);
    if (l) l.push({ inicio: o.inicio, ordem: o.ordem });
    else porPlano.set(o.plano, [{ inicio: o.inicio, ordem: o.ordem }]);
  }
  if (!porPlano.size) return ch;
  for (const l of porPlano.values()) l.sort((a, b) => a.inicio - b.inicio);

  const cand = ch.map((c, i) => ({ c, i })).filter(({ c }) => {
    const tp = chave(c.tipoProgramacao);
    return c.dataPlanejada != null && (/SOLICITAD|CHAMAD|CONCLU/.test(tp) || tp === "");
  }).sort((a, b) => a.c.dataPlanejada! - b.c.dataPlanejada! || a.i - b.i);
  const pares: { i: number; ordem: string; dist: number }[] = [];
  for (const { c, i } of cand) {
    const l = porPlano.get(c.plano);
    if (!l) continue;
    const dp = c.dataPlanejada!;
    let tras: (typeof l)[number] | undefined, frente: (typeof l)[number] | undefined;
    for (const o of l) if (o.inicio <= dp) tras = o; // a última com início ≤ data
    for (const o of l) if (o.inicio >= dp) { frente = o; break; } // a primeira com início ≥ data
    if (tras && dp - tras.inicio > JANELA_DIAS) tras = undefined;
    if (frente && frente.inicio - dp > JANELA_DIAS) frente = undefined;
    const esc = tras && frente ? (dp - tras.inicio <= frente.inicio - dp ? tras : frente) : tras ?? frente;
    if (esc) pares.push({ i, ordem: esc.ordem, dist: Math.abs(dp - esc.inicio) });
  }
  pares.sort((a, b) => a.dist - b.dist);
  const usadas = new Set<string>();
  const out = ch.slice();
  for (const p of pares) {
    if (usadas.has(p.ordem)) continue;
    usadas.add(p.ordem);
    out[p.i] = { ...out[p.i], ordem: p.ordem };
  }
  return out;
}

// ----------------------------------------------------------------------------
// Calendário semanal entre duas datas (52 colunas para um ano)
// ----------------------------------------------------------------------------
export const MESES_CURTOS = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
const p2 = (n: number) => String(n).padStart(2, "0");
const ddmm = (d: Dia) => { const p = partes(d); return `${p2(p.dia)}/${p2(p.mes)}`; };
const ddmmaaaa = (d: Dia) => `${ddmm(d)}/${partes(d).ano}`;

/** Segunda-feira da semana do dia. */
export function segunda(d: Dia): Dia {
  return d - ((partes(d).semana + 6) % 7);
}

/** Segundas-feiras de todas as semanas que tocam o intervalo. */
export function semanasEntre(inicio: Dia, fim: Dia): Dia[] {
  const out: Dia[] = [];
  for (let s = segunda(inicio), ult = segunda(fim); s <= ult; s += 7) out.push(s);
  return out;
}

/** S01, S02… (semana ISO); quando o intervalo passa de um ano, S01/27 etc. */
export function rotulosSemanas(segundas: Dia[]): string[] {
  const isos = segundas.map(semanaIso);
  if (new Set(isos.map((x) => x.ano)).size <= 1) return isos.map((x) => `S${p2(x.semana)}`);
  return isos.map((x) => `S${p2(x.semana)}/${p2(x.ano % 100)}`);
}

/**
 * {rótulo da 1ª semana de cada mês: "Jan" (ou "Jan/27" se o intervalo passa de ano)}. A semana pertence ao mês da
 * sua quinta-feira, como na numeração ISO.
 */
export function marcasDosMeses(segundas: Dia[]): Record<string, string> {
  const quintas = segundas.map((d) => partes(d + 3));
  const variosAnos = new Set(quintas.map((q) => q.ano)).size > 1;
  const marcas: Record<string, string> = {};
  const vistos = new Set<string>();
  rotulosSemanas(segundas).forEach((r, i) => {
    const q = quintas[i];
    const k = `${q.ano}-${q.mes}`;
    if (vistos.has(k)) return;
    vistos.add(k);
    marcas[r] = MESES_CURTOS[q.mes - 1] + (variosAnos ? `/${p2(q.ano % 100)}` : "");
  });
  return marcas;
}

/** Rótulo da coluna da semana de `d`, se ela estiver no calendário. */
export function colunaDaSemana(d: Dia, inicio: Dia, fim: Dia): string | null {
  const segundas = semanasEntre(inicio, fim);
  const i = segundas.indexOf(segunda(d));
  return i < 0 ? null : rotulosSemanas(segundas)[i];
}

/** Chamadas com data entre `inicio` e `fim` (os dois inclusos). */
export function noIntervalo<T extends { data: Dia | null }>(ch: T[], inicio: Dia, fim: Dia): T[] {
  return ch.filter((c) => c.data != null && c.data >= inicio && c.data <= fim);
}

/** Valor (não vazio) mais frequente de cada plano; no empate, o menor (como Series.mode().iat[0]). */
function modaPor(ch: ChamadaClassificada[], campo: (c: ChamadaClassificada) => string): Map<string, string> {
  const cont = new Map<string, Map<string, number>>();
  for (const c of ch) {
    const v = campo(c);
    if (v === "") continue;
    let m = cont.get(c.chave);
    if (!m) cont.set(c.chave, (m = new Map()));
    m.set(v, (m.get(v) ?? 0) + 1);
  }
  const out = new Map<string, string>();
  for (const [k, m] of cont) {
    let melhor = "", n = -1;
    for (const [v, q] of m) if (q > n || (q === n && v < melhor)) { melhor = v; n = q; }
    out.set(k, melhor);
  }
  return out;
}

const LIMITES_CICLO: [number, string][] = [[2, "Diário"], [10, "Semanal"], [20, "Quinzenal"], [45, "Mensal"],
  [75, "Bimestral"], [120, "Trimestral"], [270, "Semestral"], [500, "Anual"]];
/** Arredondamento sem casas (meio para o par). */
const arredPar = (x: number) => { const r = Math.round(x); return r - x === 0.5 && r % 2 ? r - 1 : r; };

/** Nome do ciclo estimado pelo intervalo (dias) entre as chamadas; o "*" marca que foi estimado. */
export function nomeDoCiclo(dias: number): string {
  for (const [limite, rot] of LIMITES_CICLO) if (dias <= limite) return rot + "*";
  return `${arredPar(dias / 365)} anos*`;
}

/** Ciclo estimado de cada plano (sem ciclo na IP19): mediana do intervalo entre as datas distintas dele. */
function ciclosEstimados(ch: ChamadaClassificada[]): Map<string, string> {
  const datas = new Map<string, Set<Dia>>();
  for (const c of ch) {
    if (c.data == null) continue;
    let s = datas.get(c.chave);
    if (!s) datas.set(c.chave, (s = new Set()));
    s.add(c.data);
  }
  const out = new Map<string, string>();
  for (const [k, s] of datas) {
    const v = [...s].sort((a, b) => a - b);
    const med = mediana(v.slice(1).map((d, i) => d - v[i]));
    if (!Number.isNaN(med)) out.set(k, nomeDoCiclo(med));
  }
  return out;
}

export interface LinhaCalendario {
  /** chave do plano ("20976 / 1" quando a IP19 traz item) */
  plano: string; descricao: string; equipamento: string;
  /** código do equipamento (o mais frequente nas chamadas do plano) — para achar o campo de ordenação */
  codigoEquip: string; centro: string; ciclo: string; chamadas: number; atrasadas: number;
  /** texto de cada semana (rótulo → "✓", "○2"…; "" sem chamada) */
  texto: Record<string, string>;
  /** situação de cada semana (a pior das chamadas dela; "" sem chamada) */
  situacao: Record<string, SituacaoChamada | "">;
}

export interface Calendario { semanas: string[]; segundas: Dia[]; linhas: LinhaCalendario[] }

/**
 * Uma linha por plano (e item, quando a IP19 traz item), em ordem de chave; uma coluna por semana entre `inicio` e
 * `fim` com a pior situação da semana e quantas chamadas caíram nela. O ciclo olha o histórico inteiro do plano (todas
 * as chamadas recebidas: sem ciclo na IP19, estimado; sem estimativa, o pacote); o resto, só o período.
 */
export function montarCalendario(ch: ChamadaClassificada[], inicio: Dia, fim: Dia): Calendario {
  const segundas = semanasEntre(inicio, fim);
  const semanas = rotulosSemanas(segundas);
  const g = noIntervalo(ch, inicio, fim);
  if (!g.length) return { semanas, segundas, linhas: [] };
  const planos = [...new Set(g.map((c) => c.chave))].sort(cmp);

  const ciclo = modaPor(ch, (c) => c.ciclo);
  const falta = new Set(planos.filter((p) => !ciclo.get(p)));
  if (falta.size) {
    for (const [k, v] of ciclosEstimados(ch.filter((c) => falta.has(c.chave)))) if (falta.has(k)) { ciclo.set(k, v); falta.delete(k); }
    if (falta.size) {
      const pac = modaPor(ch, (c) => c.pacote);
      for (const k of falta) if (pac.has(k)) ciclo.set(k, `pacote ${pac.get(k)}`);
    }
  }
  const objeto = modaPor(g, (c) => c.objeto), equip = modaPor(g, (c) => c.equipamento);
  const desc = modaPor(g, (c) => c.texto), centro = modaPor(g, (c) => c.centroTrabalho);
  const colDe = new Map(segundas.map((s, i) => [s, semanas[i]]));

  const linhas = new Map<string, LinhaCalendario>();
  const pior = new Map<string, Map<string, { pri: number; n: number }>>();
  for (const p of planos) {
    linhas.set(p, {
      plano: p, descricao: desc.get(p) ?? "", equipamento: objeto.get(p) ?? equip.get(p) ?? "", codigoEquip: equip.get(p) ?? "", centro: centro.get(p) ?? "",
      ciclo: ciclo.get(p) ?? "", chamadas: 0, atrasadas: 0,
      texto: Object.fromEntries(semanas.map((s) => [s, ""])), situacao: Object.fromEntries(semanas.map((s) => [s, ""])),
    });
    pior.set(p, new Map());
  }
  for (const c of g) {
    const l = linhas.get(c.chave)!;
    l.chamadas++;
    if (c.situacao === ATRASADA) l.atrasadas++;
    const col = colDe.get(segunda(c.data!))!;
    const w = pior.get(c.chave)!;
    const x = w.get(col), pri = PRI.get(c.situacao)!;
    if (x) { x.n++; x.pri = Math.min(x.pri, pri); } else w.set(col, { pri, n: 1 });
  }
  for (const [p, w] of pior) {
    const l = linhas.get(p)!;
    for (const [col, { pri, n }] of w) {
      const s = PRIORIDADE[pri];
      l.situacao[col] = s;
      l.texto[col] = SIMBOLO[s] + (n > 1 ? String(n) : "");
    }
  }
  return { semanas, segundas, linhas: [...linhas.values()] };
}

/** Planos com atraso primeiro; depois pela chave (a ordem da página). */
export function atrasadosPrimeiro(linhas: LinhaCalendario[]): LinhaCalendario[] {
  return linhas.slice().sort((a, b) => b.atrasadas - a.atrasadas || cmp(a.plano, b.plano));
}

export interface CargaSemana { segunda: Dia; semana: string; situacao: SituacaoChamada; chamadas: number }

/** Chamadas por semana e situação no período (a carga de trabalho dos planos). */
export function cargaSemanal(ch: ChamadaClassificada[], inicio: Dia, fim: Dia): CargaSemana[] {
  const segundas = semanasEntre(inicio, fim);
  const rot = rotulosSemanas(segundas);
  const colDe = new Map(segundas.map((s, i) => [s, rot[i]]));
  const m = new Map<string, CargaSemana>();
  for (const c of noIntervalo(ch, inicio, fim)) {
    const seg = segunda(c.data!);
    const k = `${seg}|${c.situacao}`;
    const x = m.get(k);
    if (x) x.chamadas++;
    else m.set(k, { segunda: seg, semana: colDe.get(seg)!, situacao: c.situacao, chamadas: 1 });
  }
  return [...m.values()].sort((a, b) => a.segunda - b.segunda || cmp(a.situacao, b.situacao));
}

export interface Celula {
  chave: string; plano: string; semana: string; situacao: SituacaoChamada; chamadas: number; simbolo: string;
  periodo: string; datas: string; ordens: string;
}

/** Formato longo para o mapa de calor: uma linha por plano × semana com chamada (com o texto da dica). */
export function celulas(ch: ChamadaClassificada[], inicio: Dia, fim: Dia, ordemPlanos: string[],
  descricoes: Record<string, string>): Celula[] {
  const segundas = semanasEntre(inicio, fim);
  const rot = rotulosSemanas(segundas);
  const colDe = new Map(segundas.map((s, i) => [s, rot[i]]));
  const planos = new Set(ordemPlanos);
  const grupos = new Map<string, { chave: string; seg: Dia; g: ChamadaClassificada[] }>();
  for (const c of noIntervalo(ch, inicio, fim)) {
    if (!planos.has(c.chave)) continue;
    const seg = segunda(c.data!);
    const k = `${c.chave}\x1f${seg}`;
    const x = grupos.get(k);
    if (x) x.g.push(c);
    else grupos.set(k, { chave: c.chave, seg, g: [c] });
  }
  return [...grupos.values()].map(({ chave: k, seg, g }) => {
    let pior = g[0].situacao;
    for (const c of g) if (PRI.get(c.situacao)! < PRI.get(pior)!) pior = c.situacao;
    const ordens = g.map((c) => c.ordem).filter(Boolean).join(", ");
    return {
      chave: k, plano: `${k} · ${[...(descricoes[k] ?? "")].slice(0, 34).join("")}`, semana: colDe.get(seg)!,
      situacao: pior, chamadas: g.length, simbolo: SIMBOLO[pior] + (g.length > 1 ? String(g.length) : ""),
      periodo: `${ddmm(seg)} a ${ddmmaaaa(seg + 6)}`,
      datas: [...new Set(g.map((c) => ddmm(c.data!)))].sort(cmp).join(", "), ordens: ordens || "—",
    };
  });
}

// ----------------------------------------------------------------------------
// O que a página mostra (filtros, indicadores e detalhe do plano)
// ----------------------------------------------------------------------------
export interface FiltroPlanos {
  inicio: Dia; fim: Dia;
  /** filtros globais: centro de trabalho e tipo de ordem (chamada sem tipo passa) */
  centrosGlobais?: string[]; tiposGlobais?: string[];
  busca?: string; centros?: string[]; atividades?: string[];
  /** só os planos com alguma chamada nessa situação no período (o plano entra com todas as chamadas) */
  situacoes?: string[];
}

/** Aplica os filtros da página; devolve as chamadas de todas as datas (o calendário recorta o período). */
export function filtrarChamadas(ch: ChamadaClassificada[], f: FiltroPlanos): ChamadaClassificada[] {
  let x = ch;
  if (f.centrosGlobais?.length) { const s = new Set(f.centrosGlobais); x = x.filter((c) => s.has(c.centroTrabalho)); }
  if (f.tiposGlobais?.length) { const s = new Set(f.tiposGlobais); x = x.filter((c) => s.has(c.tipoOrdem) || c.tipoOrdem === ""); }
  if (f.atividades?.length) { const s = new Set(f.atividades); x = x.filter((c) => s.has(c.atividade)); }
  if (f.centros?.length) { const s = new Set(f.centros); x = x.filter((c) => s.has(c.centroTrabalho)); }
  if (f.busca?.trim()) {
    const b = f.busca;
    x = x.filter((c) => casaBusca(normalizarBusca(`${c.chave} ${c.texto} ${c.equipamento} ${c.objeto}`), b));
  }
  if (f.situacoes?.length) {
    const s = new Set(f.situacoes);
    const chaves = new Set(noIntervalo(x, f.inicio, f.fim).filter((c) => s.has(c.situacao)).map((c) => c.chave));
    x = x.filter((c) => chaves.has(c.chave));
  }
  return x;
}

export interface Aderencia {
  /** chamadas com data até hoje, fora as saltadas/canceladas */
  vencidas: number; concluidas: number;
  /** concluídas ÷ vencidas (null sem vencidas — "—" na tela) */
  taxa: number | null;
}

/** Aderência até hoje: chamadas com data até hoje que foram concluídas (saltadas e canceladas não contam). */
export function aderencia(ch: ChamadaClassificada[], hoje: Dia): Aderencia {
  const venc = ch.filter((c) => c.data != null && c.data <= hoje && c.situacao !== SALTADA);
  const concluidas = venc.filter((c) => c.situacao === CONCLUIDA).length;
  return { vencidas: venc.length, concluidas, taxa: venc.length ? concluidas / venc.length : null };
}

export interface ResumoPlanos {
  planos: number; chamadas: number; programadas: number; atrasadas: number; custoReal: number; aderencia: Aderencia;
}

/** Indicadores do período (as chamadas já recortadas por `noIntervalo`). */
export function resumoPeriodo(noPeriodo: ChamadaClassificada[], hoje: Dia): ResumoPlanos {
  return {
    planos: new Set(noPeriodo.map((c) => c.chave)).size, chamadas: noPeriodo.length,
    programadas: noPeriodo.filter((c) => c.situacao === PROGRAMADA).length,
    atrasadas: noPeriodo.filter((c) => c.situacao === ATRASADA).length,
    custoReal: noPeriodo.reduce((s, c) => s + c.custoReal, 0), aderencia: aderencia(noPeriodo, hoje),
  };
}

export interface DetalhePlano {
  chamadas: ChamadaClassificada[]; aderencia: Aderencia; proxima: Dia | null; custoReal: number;
}

/** Detalhe de um plano (todas as datas): chamadas da mais recente para a mais antiga, aderência, próxima chamada e custo. */
export function detalhePlano(ch: ChamadaClassificada[], chavePlano: string, hoje: Dia): DetalhePlano {
  const d = ch.filter((c) => c.chave === chavePlano);
  const futuras = d.filter((c) => c.data != null && c.data > hoje).map((c) => c.data!);
  return {
    chamadas: d.slice().sort((a, b) => cmpDia(a.dataPlanejada, b.dataPlanejada, true)),
    aderencia: aderencia(d, hoje), proxima: futuras.length ? Math.min(...futuras) : null,
    custoReal: d.reduce((s, c) => s + c.custoReal, 0),
  };
}
