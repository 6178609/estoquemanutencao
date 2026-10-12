import type { Confirmacao, Equipamento, Nota, Operacao, Ordem, Pessoa } from "./preparo";
import { criticidadeDoSite, type CadastroEquip } from "./saude";
import type { Dia } from "./util";

/**
 * Qualidade dos dados — porta de central/qualidade.py: o que nas bases do SAP distorce os indicadores e como
 * corrigir na origem. Cada checagem mede uma proporção de registros com problema (últimos 12 meses, salvo
 * indicação), aponta os indicadores afetados e a correção no SAP.
 * Farol: até 2% verde, até 10% amarelo, acima disso vermelho. Índice de qualidade = 100 − média dos %.
 * Testado em testes/qualidade.test.ts.
 */

export const JANELA_DIAS = 365;
export const VERDE = "verde", AMARELO = "amarelo", VERMELHO = "vermelho";
export type Farol = typeof VERDE | typeof AMARELO | typeof VERMELHO;

/** Valor de uma célula da lista de problemas (datas como `Dia`). */
export type Valor = string | number | boolean | null;
/** Linha da lista de problemas: rótulo da coluna (o mesmo do site atual) → valor. */
export type LinhaProblema = Record<string, Valor>;
/** Colunas de data nas listas de problemas (para formatar dd/mm/aaaa). */
export const COLUNAS_DATA = new Set(["Data", "Fim", "Início", "Último"]);

export interface Checagem {
  id: string; nome: string; base: string; afeta: string; corrigir: string;
  /** colunas da lista de problemas, na ordem de exibição */
  colunas: string[];
  problemas: LinhaProblema[];
  total: number;
  /** registros com problema */
  n: number;
  /** % com problema (null sem base) */
  pct: number | null;
  farol: Farol;
}

export function pctDe(n: number, total: number): number | null {
  return total ? (n / total) * 100 : null;
}

export function farolDe(pct: number | null): Farol {
  if (pct == null || pct <= 2) return VERDE;
  return pct <= 10 ? AMARELO : VERMELHO;
}

/** Monta a checagem com n, % e farol calculados. */
export function checagem(c: Omit<Checagem, "n" | "pct" | "farol">): Checagem {
  const n = c.problemas.length, pct = pctDe(n, c.total);
  return { ...c, n, pct, farol: farolDe(pct) };
}

// ----------------------------------------------------------------------------
// Entradas
// ----------------------------------------------------------------------------
export type OrdemQualidade = Pick<Ordem, "ordem" | "tipo" | "texto" | "situacao" | "data" | "inicio" | "fim" | "equipChave" |
  "objeto" | "centroTrabalho" | "localizacao">;
export type OperacaoQualidade = Pick<Operacao, "ordem" | "operacao" | "textoOperacao" | "inicio" | "centroTrabalho" | "objeto" |
  "horas" | "cancelada">;
export type NotaQualidade = Pick<Nota, "nota" | "tipoNota" | "data" | "dias" | "comOrdem" | "equipChave" | "objeto" | "descricao" |
  "centroTrabalho">;
export type ConfirmacaoQualidade = Pick<Confirmacao, "np" | "centroTrabalho" | "data" | "horas">;
export type PessoaQualidade = Pick<Pessoa, "np">;
export type EquipQualidade = Pick<Equipamento, "equipamento" | "codigoAbc">;
/**
 * Quebra (porta de indicadores.quebras): "Nota", "Data", "Ordem", "Equip. (chave)", "Objeto técnico", "Descrição",
 * "Centro de trabalho" e "Horas de reparo" (null = sem horas de reparo).
 */
export interface QuebraQualidade {
  nota: string; data: Dia | null; ordem?: string; equipChave: string; objeto?: string; descricao?: string;
  centroTrabalho?: string; horasReparo: number | null;
}

export interface EntradasQualidade {
  ordens?: OrdemQualidade[] | null;
  oper?: OperacaoQualidade[] | null;
  notas?: NotaQualidade[] | null;
  /** IW47 de todos (não só da equipe) */
  conf?: ConfirmacaoQualidade[] | null;
  equipe?: PessoaQualidade[] | null;
  equip?: EquipQualidade[] | null;
  cadEq?: CadastroEquip | null;
  quebras?: QuebraQualidade[] | null;
  /** ordem → data do fim real (indicadores.fim_real_por_ordem); sem ela a checagem de fim real não roda */
  fimReal?: Map<string, Dia | null> | null;
}

const recente = (d: Dia | null, hoje: Dia) => d != null && d >= hoje - JANELA_DIAS && d <= hoje;

const COLS_O = ["Ordem", "Tipo", "Texto", "Situação", "Data", "Fim", "Equip. (chave)", "Objeto técnico", "Centro de trabalho",
  "Localização"];
const linhaOrdem = (o: OrdemQualidade): LinhaProblema => ({
  Ordem: o.ordem, Tipo: o.tipo, Texto: o.texto, "Situação": o.situacao, Data: o.data, Fim: o.fim,
  "Equip. (chave)": o.equipChave, "Objeto técnico": o.objeto, "Centro de trabalho": o.centroTrabalho, "Localização": o.localizacao,
});

/** Lista de checagens (só as que têm base carregada), na mesma ordem do site atual. */
export function verificar(hoje: Dia, e: EntradasQualidade = {}): Checagem[] {
  const cadEq = e.cadEq ?? {};
  const out: Checagem[] = [];

  if (e.quebras?.length) {
    const q = e.quebras.filter((x) => recente(x.data, hoje));
    out.push(checagem({
      id: "quebras_sem_reparo", nome: "Quebras sem horas de reparo", base: "IW28 / IW47 / IW38OP", afeta: "MTTR, disponibilidade",
      corrigir: "Preencher a duração da parada na nota Y1 (IW22) ou apontar as horas na ordem YM11 (IW41).",
      colunas: ["Nota", "Data", "Ordem", "Equip. (chave)", "Objeto técnico", "Descrição", "Centro de trabalho"],
      problemas: q.filter((x) => x.horasReparo == null || Number.isNaN(x.horasReparo)).map((x) => ({
        Nota: x.nota, Data: x.data, Ordem: x.ordem ?? "", "Equip. (chave)": x.equipChave, "Objeto técnico": x.objeto ?? "",
        "Descrição": x.descricao ?? "", "Centro de trabalho": x.centroTrabalho ?? "" })),
      total: q.length,
    }));
  }

  if (e.notas?.length) {
    const n = e.notas.filter((x) => recente(x.data, hoje));
    const y1 = n.filter((x) => x.tipoNota === "Y1" && x.dias != null && x.dias > 2);
    out.push(checagem({
      id: "y1_sem_ordem", nome: "Notas de quebra (Y1) sem ordem há mais de 2 dias", base: "IW28", afeta: "Quebras, MTBF, MTTR",
      corrigir: "Converter a nota Y1 em ordem YM11 (IW22) — sem a ordem a quebra não entra nos indicadores.",
      colunas: ["Nota", "Data", "Dias", "Equip. (chave)", "Objeto técnico", "Descrição", "Centro de trabalho"],
      problemas: y1.filter((x) => !x.comOrdem).map((x) => ({
        Nota: x.nota, Data: x.data, Dias: x.dias, "Equip. (chave)": x.equipChave, "Objeto técnico": x.objeto,
        "Descrição": x.descricao, "Centro de trabalho": x.centroTrabalho })),
      total: y1.length,
    }));
    const velhas = n.filter((x) => x.tipoNota !== "Y1" && x.dias != null && x.dias > 30);
    out.push(checagem({
      id: "notas_sem_ordem", nome: "Notas sem ordem há mais de 30 dias", base: "IW28", afeta: "Notas sem ordem, backlog real",
      corrigir: "Avaliar cada nota: gerar a ordem ou encerrar a nota (IW22).",
      colunas: ["Nota", "Tipo de nota", "Data", "Dias", "Equip. (chave)", "Descrição", "Centro de trabalho"],
      problemas: velhas.filter((x) => !x.comOrdem).map((x) => ({
        Nota: x.nota, "Tipo de nota": x.tipoNota, Data: x.data, Dias: x.dias, "Equip. (chave)": x.equipChave,
        "Descrição": x.descricao, "Centro de trabalho": x.centroTrabalho })),
      total: velhas.length,
    }));
  }

  if (e.ordens?.length) {
    const ordens = e.ordens;
    const o = ordens.filter((x) => x.situacao !== "Cancelada" && recente(x.data, hoje));
    out.push(checagem({
      id: "ordens_sem_equip", nome: "Ordens sem equipamento", base: "IW38",
      afeta: "Pareto de quebras, saúde dos ativos, custo por equipamento",
      corrigir: "Informar o equipamento (ou o local de instalação) na ordem (IW32).",
      colunas: COLS_O, problemas: o.filter((x) => x.equipChave === "").map(linhaOrdem), total: o.length,
    }));
    const datas = o.filter((x) => x.inicio != null && x.fim != null);
    out.push(checagem({
      id: "prazo_antes_inicio", nome: "Ordens com fim-base antes do início", base: "IW38", afeta: "Ordens no prazo, calendário",
      corrigir: "Corrigir as datas-base da ordem (IW32).", colunas: [...COLS_O, "Início"],
      problemas: datas.filter((x) => x.fim! < x.inicio!).map((x) => ({ ...linhaOrdem(x), "Início": x.inicio })),
      total: datas.length,
    }));
    const ente = o.filter((x) => x.situacao === "Encerrada sem confirmação");
    const concl = o.filter((x) => x.situacao === "Concluída" || x.situacao === "Encerrada sem confirmação");
    out.push(checagem({
      id: "ente_sem_conf", nome: "Ordens encerradas sem confirmação", base: "IW38", afeta: "HH reais, execução das atividades, MTTR",
      corrigir: "Confirmar as operações (IW41) antes do encerramento técnico da ordem.",
      colunas: COLS_O, problemas: ente.map(linhaOrdem), total: concl.length,
    }));
    if (e.fimReal) {
      const comFim = new Set([...e.fimReal].filter(([, d]) => d != null).map(([k]) => k));
      const c = o.filter((x) => x.situacao === "Concluída");
      out.push(checagem({
        id: "concluidas_sem_fim", nome: "Ordens concluídas sem data de fim real", base: "IW38 / IW38OP",
        afeta: "Ordens no prazo, lead time, dias para tratar (preditiva)",
        corrigir: "Confirmar as operações com a data real (IW41) e exportar o IW38OP com a coluna Data do fim real.",
        colunas: COLS_O, problemas: c.filter((x) => !comFim.has(x.ordem)).map(linhaOrdem), total: c.length,
      }));
    }
    const pend = ordens.filter((x) => (x.situacao === "Aberta" || x.situacao === "Liberada" ||
      x.situacao === "Encerrada sem confirmação") && x.data != null && x.data <= hoje);
    out.push(checagem({
      id: "backlog_velho", nome: "Ordens em aberto há mais de 180 dias", base: "IW38", afeta: "Backlog, idade do backlog, saúde",
      corrigir: "Revisar com o planejamento: executar, reprogramar ou encerrar/cancelar a ordem (IW32).",
      colunas: COLS_O, problemas: pend.filter((x) => hoje - x.data! > 180).map(linhaOrdem), total: pend.length,
    }));
    const nomes = new Map<string, string>();
    for (const x of o) if (!nomes.has(x.equipChave)) nomes.set(x.equipChave, x.objeto);
    const eqs = [...nomes.keys()].filter((k) => k !== "");
    const abc = new Map((e.equip ?? []).map((x) => [x.equipamento, x.codigoAbc] as const)); // vale a última, como dict(zip())
    const semCrit = eqs.filter((k) => !abc.get(k) && !criticidadeDoSite(cadEq, k));
    out.push(checagem({
      id: "equip_sem_criticidade", nome: "Equipamentos com ordens e sem criticidade", base: "IH08 / cadastro do site",
      afeta: "Saúde dos ativos (risco), quebras em classe A, peças críticas",
      corrigir: "Definir o código ABC no equipamento (IE02) ou a criticidade no cadastro de equipamentos do site.",
      colunas: ["Equipamento", "Objeto técnico"],
      problemas: semCrit.map((k) => ({ Equipamento: k, "Objeto técnico": nomes.get(k) ?? "" })), total: eqs.length,
    }));
  }

  if (e.oper?.length) {
    const op = e.oper.filter((x) => !x.cancelada && x.inicio != null && recente(x.inicio, hoje));
    out.push(checagem({
      id: "ops_sem_trabalho", nome: "Operações sem trabalho planejado (0 h)", base: "IW38OP",
      afeta: "Backlog em semanas, carga × capacidade da programação semanal",
      corrigir: "Planejar o trabalho (horas) e o nº de pessoas das operações da ordem (IW32, aba Operações).",
      colunas: ["Ordem", "Operação", "Texto da operação", "Início", "Centro de trabalho", "Objeto técnico"],
      problemas: op.filter((x) => x.horas <= 0).map((x) => ({
        Ordem: x.ordem, "Operação": x.operacao, "Texto da operação": x.textoOperacao, "Início": x.inicio,
        "Centro de trabalho": x.centroTrabalho, "Objeto técnico": x.objeto })),
      total: op.length,
    }));
  }

  if (e.conf?.length && e.equipe?.length) {
    const c = e.conf.filter((x) => recente(x.data, hoje));
    const daEquipe = new Set(e.equipe.map((x) => x.np));
    const grupos = new Map<string, { np: string; centro: string; n: number; hh: number; ultimo: Dia | null }>();
    const todos = new Set<string>();
    for (const x of c) {
      const k = `${x.np}\x1f${x.centroTrabalho}`;
      todos.add(k);
      if (daEquipe.has(x.np)) continue;
      let g = grupos.get(k);
      if (!g) grupos.set(k, (g = { np: x.np, centro: x.centroTrabalho, n: 0, hh: 0, ultimo: null }));
      g.n++;
      if (!Number.isNaN(x.horas)) g.hh += x.horas;
      if (x.data != null && (g.ultimo == null || x.data > g.ultimo)) g.ultimo = x.data;
    }
    // como o groupby: por matrícula e centro; depois o maior HH primeiro
    const resumo = [...grupos.values()]
      .sort((a, b) => (a.np < b.np ? -1 : a.np > b.np ? 1 : a.centro < b.centro ? -1 : a.centro > b.centro ? 1 : 0))
      .sort((a, b) => b.hh - a.hh);
    out.push(checagem({
      id: "apont_fora_equipe", nome: "Apontamentos de pessoas fora da Gestão de HH", base: "IW47 / Gestão de HH",
      afeta: "Utilização da mão de obra, quem fez o quê",
      corrigir: "Incluir a pessoa (matrícula) na planilha de Gestão de HH ou corrigir a matrícula no apontamento.",
      colunas: ["Nº pessoal", "Centro de trabalho", "Apontamentos", "HH", "Último"],
      problemas: resumo.map((g) => ({ "Nº pessoal": g.np, "Centro de trabalho": g.centro, Apontamentos: g.n, HH: g.hh, "Último": g.ultimo })),
      total: todos.size,
    }));
  }
  return out;
}

/** 100 − média dos % de problemas das checagens com base (null se nenhuma tem base). */
export function indice(checagens: Pick<Checagem, "pct">[]): number | null {
  const ps = checagens.map((c) => c.pct).filter((p): p is number => p != null);
  return ps.length ? Math.max(0, 100 - ps.reduce((a, b) => a + b, 0) / ps.length) : null;
}

/** Quantas checagens em cada cor do farol (os cartões do topo da página). */
export function contarFarois(checagens: Pick<Checagem, "farol">[]): Record<Farol, number> {
  const r = { [VERDE]: 0, [AMARELO]: 0, [VERMELHO]: 0 } as Record<Farol, number>;
  for (const c of checagens) r[c.farol]++;
  return r;
}

/** Ordem da tabela da página: o maior % com problema primeiro. */
export function ordenarPorPct<T extends Pick<Checagem, "pct">>(checagens: T[]): T[] {
  return [...checagens].sort((a, b) => (b.pct ?? 0) - (a.pct ?? 0));
}
