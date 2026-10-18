import { especialidade, type Pessoa } from "./preparo";
import { foraDaVisao, paraData, setorDoCentro, type Dia } from "./util";

/**
 * Gerenciador de HH: disponibilidade de cada pessoa da equipe (planilha de Gestão de HH) para a manutenção.
 * Só as regras; ler/gravar o cadastro fica com lib/dados/cadastros.ts
 * (lerCadastro(ARQ) / gravarCadastroLote(ARQ, …, mesclar)).
 *
 * O que fica gravado (cadastro `hh_disponibilidade.json` na pasta do app), por matrícula:
 * - jornada: horas por semana (vazio = a jornada padrão de Metas e parâmetros);
 * - percentual: % da jornada disponível para manutenção (vazio = 100%);
 * - capacidade: se a pessoa conta na capacidade da equipe (vazio = regra pelo cargo: técnicos de execução sim,
 *   apoio/gestão e planejamento não);
 * - obs: observação livre;
 * - ausencias: [{id, tipo, de, ate, obs}] — férias, afastamento, treinamento… (datas inclusivas, aaaa-mm-dd);
 *   treinamento também guarda titulo, horas (carga horária), entidade e validade (vencimento da reciclagem);
 * - a própria pessoa (cadastro manual, sem planilha): nome, cargo, centro, area, turma, supervisor e ativo
 *   (ativo:false = desligada: sai da equipe e o histórico fica). Enquanto ninguém foi cadastrado, a equipe vem da
 *   última planilha de Gestão de HH enviada (só leitura) — "Passar a equipe para o cadastro" grava todos.
 *
 * Horas disponíveis no período = (jornada × dias ÷ 7 − horas das ausências) × percentual, nunca negativo; cada dia
 * corrido de ausência dentro do período tira jornada ÷ 7 (a mesma conta de dias corridos da jornada).
 * Testado em testes/hh.test.ts.
 */
export const ARQ = "hh_disponibilidade.json";
export const TIPOS_AUSENCIA = ["Férias", "Afastamento (atestado / INSS)", "Treinamento", "Folga / compensação", "Licença",
  "Cedido a outra área", "Outro"];
/** Especialidades que, por padrão, não contam na capacidade. */
export const SEM_CAPACIDADE = ["Apoio / gestão", "Planejamento (GPM)"];

export interface AusenciaGravada {
  id?: string; tipo?: string; de?: string; ate?: string; obs?: string;
  /** treinamento: nome, carga horária (h), entidade/instrutor e vencimento da reciclagem (aaaa-mm-dd) */
  titulo?: string; horas?: number | null; entidade?: string; validade?: string;
}
/** Dados da pessoa no cadastro manual da equipe. */
export interface PessoaGravada {
  nome?: string; cargo?: string; centro?: string; area?: string; turma?: string; supervisor?: string; ativo?: boolean | null;
}
export interface ItemHh extends PessoaGravada {
  jornada?: number | null; percentual?: number | null; capacidade?: boolean | null; obs?: string | null;
  ausencias?: AusenciaGravada[] | null;
}
/** O cadastro como vem do JSON: {matrícula: ItemHh}. */
export type CadastroHh = Record<string, unknown>;

/** A equipe da planilha (só os campos usados aqui). */
export type PessoaEquipe = Pick<Pessoa, "np"> & Partial<Pick<Pessoa, "nome" | "cargo" | "especialidade" | "centroTrabalho" | "area" | "turma">>;

export interface PessoaHh {
  np: string; nome: string; cargo: string; especialidade: string; centroTrabalho: string; area: string; turma: string;
  /** h/semana */
  jornada: number;
  /** % disponível para manutenção, 0–100 */
  disponivel: number;
  contaNaCapacidade: boolean;
  observacao: string;
}

/** Colunas da tabela/planilha baixada (campo → rótulo). */
export const COLUNAS: [keyof PessoaHh, string][] = [
  ["np", "Nº pessoal"], ["nome", "Nome"], ["cargo", "Cargo"], ["especialidade", "Especialidade"],
  ["centroTrabalho", "Centro de trabalho"], ["area", "Área"], ["turma", "Turma"], ["jornada", "Jornada (h/sem)"],
  ["disponivel", "Disponível %"], ["contaNaCapacidade", "Conta na capacidade"], ["observacao", "Observação"],
];

function itemDe(cad: CadastroHh | null | undefined, np: string): ItemHh {
  const i = cad?.[np];
  return i && typeof i === "object" && !Array.isArray(i) ? (i as ItemHh) : {};
}

/** Número do cadastro ou o padrão (vazio/ilegível/NaN → padrão), como o float() do Python. */
function num(v: unknown, padrao: number): number {
  if (v == null) return padrao;
  if (typeof v === "boolean") return Number(v);
  if (typeof v !== "number") {
    const s = String(v).trim();
    if (!s) return padrao;
    v = Number(s);
  }
  return Number.isNaN(v as number) ? padrao : (v as number);
}

/** Quem conta na capacidade quando o cadastro não diz: pela especialidade (sem apoio/gestão e planejamento). */
export const contaPorPadrao = (especialidade: string) => !SEM_CAPACIDADE.includes(especialidade);

/** A equipe da planilha com a disponibilidade cadastrada (ou os padrões). */
export function pessoas(equipe: PessoaEquipe[] | null | undefined, cad: CadastroHh | null | undefined,
  horasSemana: number): PessoaHh[] {
  return (equipe ?? []).map((p) => {
    const i = itemDe(cad, p.np);
    const especialidade = p.especialidade ?? "";
    return {
      np: p.np, nome: p.nome ?? "", cargo: p.cargo ?? "", especialidade, centroTrabalho: p.centroTrabalho ?? "",
      area: p.area ?? "", turma: p.turma ?? "",
      jornada: num(i.jornada, horasSemana),
      disponivel: Math.min(Math.max(num(i.percentual, 100), 0), 100),
      contaNaCapacidade: typeof i.capacidade === "boolean" ? i.capacidade : contaPorPadrao(especialidade),
      observacao: i.obs ? String(i.obs) : "",
    };
  });
}

// ----------------------------------------------------------------------------
// Equipe por cadastro manual (no lugar da planilha de Gestão de HH)
// ----------------------------------------------------------------------------
const txt = (v: unknown) => (v == null ? "" : String(v).trim());

/** Alguém já foi cadastrado (com nome)? Até lá, a equipe vem da última planilha. */
export function temEquipeCadastrada(cad: CadastroHh | null | undefined): boolean {
  return Object.keys(cad ?? {}).some((np) => txt(itemDe(cad, np).nome) !== "");
}

/** A equipe do cadastro (só quem tem nome e não foi desligado), com especialidade e setor deduzidos. */
export function equipeDoCadastro(cad: CadastroHh | null | undefined,
  { comDesligados = false, excluirForaDaVisao = false }: { comDesligados?: boolean; excluirForaDaVisao?: boolean } = {}):
  (Pessoa & { ativo: boolean })[] {
  const out: (Pessoa & { ativo: boolean })[] = [];
  for (const np of Object.keys(cad ?? {}).sort()) {
    const i = itemDe(cad, np), nome = txt(i.nome);
    const ativo = i.ativo !== false;
    if (!nome || (!ativo && !comDesligados)) continue;
    const cargo = txt(i.cargo), centroTrabalho = txt(i.centro);
    // a mesma regra da planilha: Fábrica Piloto / matrizaria fora da visão de manutenção
    if (excluirForaDaVisao && foraDaVisao({ "Centro de trabalho": centroTrabalho })) continue;
    out.push({ np, nome, cargo, centroTrabalho, area: txt(i.area), turma: txt(i.turma), supervisor: txt(i.supervisor),
      especialidade: especialidade(cargo), setor: setorDoCentro(centroTrabalho), ativo });
  }
  return out;
}

/** Pacote de migração: as pessoas da planilha como itens do cadastro (mesclar=true não mexe na disponibilidade). */
export function itensDaEquipe(equipe: Pessoa[]): Record<string, PessoaGravada> {
  const out: Record<string, PessoaGravada> = {};
  for (const p of equipe) {
    if (!p.np || !p.nome) continue;
    out[p.np] = { nome: p.nome, cargo: p.cargo || "", centro: p.centroTrabalho || "", area: p.area || "", turma: p.turma || "",
      supervisor: p.supervisor || "", ativo: true };
  }
  return out;
}

export interface Ausencia {
  np: string; id: string; tipo: string; de: Dia; ate: Dia; obs: string;
  titulo: string; horas: number | null; entidade: string; validade: Dia | null;
  /** carga horária 0: EAD ou fora do horário — não tira HH */
  semHh: boolean;
}

/** Todas as ausências cadastradas, uma por linha (sem data de início válida fica fora; até < de vira um dia só). */
export function ausencias(cad: CadastroHh | null | undefined): Ausencia[] {
  const out: Ausencia[] = [];
  for (const [np, info] of Object.entries(cad ?? {})) {
    if (!info || typeof info !== "object" || Array.isArray(info)) continue;
    for (const a of (info as ItemHh).ausencias ?? []) {
      const de = paraData(a?.de), ate = paraData(a?.ate);
      if (de == null) continue;
      const h = a.horas == null || a.horas === ("" as unknown) ? null : Number(a.horas);
      out.push({ np, id: a.id ?? "", tipo: a.tipo ?? "Outro", de, ate: ate != null && ate >= de ? ate : de, obs: a.obs ?? "",
        titulo: a.titulo ?? "", horas: h != null && Number.isFinite(h) && h >= 0 ? h : null, entidade: a.entidade ?? "",
        validade: paraData(a.validade), semHh: h === 0 });
    }
  }
  return out;
}

/** {matrícula: dias corridos de ausência dentro de [ini, fim]} — ausências sobrepostas não contam em dobro. Ausência
 * com carga horária (treinamento parcial) não tira o dia inteiro: conta em horasParciais. */
export function diasAusente(cad: CadastroHh | null | undefined, ini: Dia, fim: Dia): Record<string, number> {
  const cobertos = new Map<string, Set<Dia>>();
  for (const a of ausencias(cad)) {
    if (a.ate < ini || a.de > fim || a.horas != null || a.semHh) continue;
    let s = cobertos.get(a.np);
    if (!s) cobertos.set(a.np, (s = new Set()));
    for (let d = Math.max(a.de, ini); d <= Math.min(a.ate, fim); d++) s.add(d);
  }
  const out: Record<string, number> = {};
  for (const np of [...cobertos.keys()].sort()) out[np] = cobertos.get(np)!.size;
  return out;
}

/** {matrícula: horas das ausências com carga horária dentro de [ini, fim]} — proporcional aos dias da ausência no
 * período (um curso de 16 h em 2 dias tira 8 h de cada dia). */
export function horasParciais(cad: CadastroHh | null | undefined, ini: Dia, fim: Dia): Record<string, number> {
  const out: Record<string, number> = {};
  for (const a of ausencias(cad)) {
    if (a.horas == null || a.semHh || a.ate < ini || a.de > fim) continue;
    const dentro = Math.min(a.ate, fim) - Math.max(a.de, ini) + 1;
    out[a.np] = (out[a.np] ?? 0) + (a.horas * dentro) / diasDaAusencia(a);
  }
  return out;
}

export interface DisponibilidadeHh extends PessoaHh {
  horasBrutas: number; diasAusente: number; horasAusente: number; horasDisponiveis: number;
}

/** Horas por pessoa no período [ini, fim] (inclusivo): da jornada, de ausência e disponíveis. */
export function disponibilidade(pes: PessoaHh[], cad: CadastroHh | null | undefined, ini: Dia, fim: Dia): DisponibilidadeHh[] {
  const dias = fim - ini + 1;
  if (!pes.length || dias <= 0)
    return pes.map((p) => ({ ...p, horasBrutas: 0, diasAusente: 0, horasAusente: 0, horasDisponiveis: 0 }));
  const aus = diasAusente(cad, ini, fim), parc = horasParciais(cad, ini, fim);
  return pes.map((p) => {
    const horasBrutas = (p.jornada * dias) / 7;
    const da = aus[p.np] ?? 0;
    const horasAusente = Math.min((p.jornada * da) / 7 + (parc[p.np] ?? 0), horasBrutas);
    return { ...p, horasBrutas, diasAusente: da, horasAusente,
      horasDisponiveis: (Math.max(horasBrutas - horasAusente, 0) * p.disponivel) / 100 };
  });
}

/** Soma das horas disponíveis de quem conta na capacidade. */
export function horasDisponiveis(pes: PessoaHh[], cad: CadastroHh | null | undefined, ini: Dia, fim: Dia): number {
  return disponibilidade(pes.filter((p) => p.contaNaCapacidade), cad, ini, fim).reduce((s, p) => s + p.horasDisponiveis, 0);
}

/** {centro: [horas disponíveis, técnicos]} de quem conta na capacidade (centros em ordem alfabética). */
export function porCentro(pes: PessoaHh[], cad: CadastroHh | null | undefined, ini: Dia, fim: Dia): Record<string, [number, number]> {
  const soma = new Map<string, [number, number]>();
  for (const p of disponibilidade(pes.filter((x) => x.contaNaCapacidade), cad, ini, fim)) {
    const g = soma.get(p.centroTrabalho) ?? [0, 0];
    soma.set(p.centroTrabalho, [g[0] + p.horasDisponiveis, g[1] + 1]);
  }
  const out: Record<string, [number, number]> = {};
  for (const c of [...soma.keys()].sort()) out[c] = soma.get(c)!;
  return out;
}

/** Ausências que cobrem o dia, de quem está em `pes` (com nome e centro). */
export function ausentesEm(pes: PessoaHh[], cad: CadastroHh | null | undefined, dia: Dia):
  (Ausencia & { nome: string; centroTrabalho: string })[] {
  const porNp = new Map<string, PessoaHh[]>();
  for (const p of pes) porNp.set(p.np, [...(porNp.get(p.np) ?? []), p]);
  return ausencias(cad).filter((a) => a.de <= dia && a.ate >= dia)
    .flatMap((a) => (porNp.get(a.np) ?? []).map((p) => ({ ...a, nome: p.nome, centroTrabalho: p.centroTrabalho })));
}

// ----------------------------------------------------------------------------
// Apoio à tela
// ----------------------------------------------------------------------------
/** Dias corridos da ausência (inclusivo). */
export const diasDaAusencia = (a: Pick<Ausencia, "de" | "ate">) => a.ate - a.de + 1;

export function situacaoAusencia(a: Pick<Ausencia, "de" | "ate">, hoje: Dia): "Em andamento" | "Futura" | "Encerrada" {
  return a.de <= hoje && hoje <= a.ate ? "Em andamento" : a.de > hoje ? "Futura" : "Encerrada";
}

const iso = (d: Dia) => new Date(d * 86_400_000).toISOString().slice(0, 10);

/** Ausência nova para gravar (id = "<matrícula>-<aaaammdd de>-<aaaammdd até>-<nº>", datas ISO). Treinamento leva também
 * nome, carga horária, entidade e validade (só os informados entram). */
export function novaAusencia(np: string, tipo: string, de: Dia, ate: Dia, obs: string, existentes: number,
  extra: { titulo?: string; horas?: number | null; entidade?: string; validade?: Dia | null } = {}):
  AusenciaGravada & { id: string; tipo: string; de: string; ate: string; obs: string } {
  const titulo = (extra.titulo ?? "").trim(), entidade = (extra.entidade ?? "").trim();
  const horas = extra.horas != null && Number.isFinite(extra.horas) && extra.horas >= 0 ? Math.round(extra.horas * 10) / 10 : null;
  return { id: `${np}-${iso(de).replace(/-/g, "")}-${iso(ate).replace(/-/g, "")}-${existentes + 1}`, tipo,
    de: iso(de), ate: iso(ate), obs: obs.trim(),
    ...(titulo ? { titulo } : {}), ...(horas != null ? { horas } : {}), ...(entidade ? { entidade } : {}),
    ...(extra.validade != null ? { validade: iso(extra.validade) } : {}) };
}

/**
 * Item do cadastro a gravar (mesclar=true) depois de editar a pessoa: o que fica igual ao padrão vai como null
 * (é apagado), para o padrão continuar valendo se mudar.
 */
export function itemDisponibilidade(e: { jornada: number | null; disponivel: number | null; contaNaCapacidade: boolean;
  observacao: string | null }, horasSemana: number, especialidade: string): ItemHh {
  const vazio = (v: number | null) => v == null || Number.isNaN(v);
  return {
    jornada: vazio(e.jornada) || e.jornada === horasSemana ? null : e.jornada,
    percentual: vazio(e.disponivel) || e.disponivel === 100 ? null : e.disponivel,
    capacidade: e.contaNaCapacidade === contaPorPadrao(especialidade) ? null : e.contaNaCapacidade,
    obs: (e.observacao ?? "").trim() || null,
  };
}
