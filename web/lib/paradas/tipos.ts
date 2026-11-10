import type { Dia } from "@/lib/wcm/util";

/**
 * Tipos da Programação de paradas (spec §3). Lógica pura: nada aqui importa servidor nem faz I/O.
 */

export type Disciplina = "MEC" | "ELE";
export type Turno = 1 | 2;
export interface HH { mec: number; ele: number }
export type GrupoCritico = "DRY BLEND" | "BANBURY" | "PELLET" | "PRENSA/MOINHO SF" | "INJ EXP";
export type OrigemHh = "ip19" | "iw38op-ordem" | "iw38op-plano" | "ip19-mesmo-plano" | "sem-hh";

/** Uma operação da IP19 (ou completada) — a menor unidade que o motor move; nunca é dividida. */
export interface ItemPlano {
  chave: string;          // plano|item|dataIp19|seq
  plano: string; item: string; ordem: string; texto: string;
  equipamento: string; campo: string; ativo: string;
  mes: string;            // "AAAA-MM"
  dataIp19: Dia;
  disciplina: Disciplina; centro: string; hh: number;
  situacao: string;       // "Programado,espera (Inspeção)"…
  origemHh: OrigemHh; centroAssumido?: boolean;
  /** equipamento superior informado na própria IP19 (quando há a coluna) */
  superior?: string;
}

export interface Ativo {
  id: string;             // nome do calendário ("INJETORA 21")
  campos: string[]; equipamentos: string[]; denominacao: string;
  tipo: string; grupo: GrupoCritico | null; papel?: "prensa" | "moinho";
  so1Turno: boolean; soSabado: boolean; exclusivoT1: boolean; preferenciaT1: boolean;
  juntoCom?: string;      // "BANBURY" para o MOINHO 04
}

export interface Demanda { mes: string; ativo: string; itens: ItemPlano[]; hh: HH; primeiraData: Dia; datas: Dia[] }

export type Marca = "antecipado" | "estouro ≤4h" | "fixada" | "parada extra" | "1º+2º turno" | "fora do dia padrão"
  | "semana da prensa" | "preenchimento" | "sem itens IP19";

/** Uma linha da Programação: um ativo num dia e turno (a mesma parada pode ter 2 linhas: T2 e T1 do mesmo dia). */
export interface LinhaProgramacao {
  id: string;             // `${mes}|${ativo}|${parada}|${turno}`
  data: Dia; turno: Turno; ativo: string; mes: string;
  parada: 1 | 2; paradasNoMes: number;
  hh: HH; acima: HH;      // acima = HH além da capacidade por saldo ≤ 4 h
  itens: string[];        // chaves dos ItemPlano
  marcas: Marca[];
  tipo: string; grupo: GrupoCritico | null; campos: string[];
}

export interface SemHh { mes: string; ativo: string; hh: HH; itens: string[]; primeiraData: Dia; motivo: string }
export interface Retirado { mes: string; ativo: string; hh: HH; motivo: string }   // ex.: injetora ≤ 0,2 h

export interface Fixacao {
  id: string; mes: string; ativo: string; parada: 1 | 2;
  data: Dia; turno: Turno | "1+2"; extra?: boolean; motivo?: string; por?: string; em?: string;
}

export interface EntradaMotor {
  demandas: Demanda[]; ativos: Record<string, Ativo>; parametros: Parametros;
  inicio: Dia; fim: Dia;             // horizonte (inclusive)
  fixacoes?: Fixacao[];
  ocupacaoAnterior?: { semana: string; ativo: string; grupo: GrupoCritico | null }[]; // prensas/pellets da semana anterior ao início
}

export interface ResultadoMotor {
  linhas: LinhaProgramacao[]; semHh: SemHh[]; retirados: Retirado[];
  fixacoesOrfas: Fixacao[]; avisos: string[];
}

export interface CapTurno { pessoasMec: number; pessoasEle: number; horasPorPessoa: number; inicio: string; fim: string }
export interface Parametros {
  versao: 1;
  localizacoes: string[]; gruposPlanejamento: string[]; centrosEliminados: string[];
  unidadePadraoIp19: "MIN" | "H";
  turnos: { t1: CapTurno; t2: CapTurno; sabado: CapTurno };
  feriados: { data: string /* AAAA-MM-DD */; nome: string }[];
  inicio: string | null;          // AAAA-MM-DD; null = hoje
  meses: number;                  // horizonte: mês do início + (meses-1); padrão 3
  maxAtivosDia: number;           // 7
  maxParadasMes: number;          // 2
  estouro: HH;                    // {mec:4, ele:4}
  antecipacaoDias: number;        // 3
  padraoSemanal: Record<1 | 2 | 3 | 4 | 5, GrupoCritico[]>;
  ordemCriticos: GrupoCritico[];
  rodizioMoinhos: string[];
  juntos: { ativo: string; com: string }[];
  tiposPrimeiroT2: string[];
  tiposPreferenciaT1: string[];
  tiposSabadoPreenchimento: string[];
  hhIrrelevante: { tipos: string[]; limite: number };
  agrupamentos: { ativo: string; padrao: string }[];
  classes: ClasseAtivo[];
  /** tipo do ativo sem classe: início da denominação → tipo ("INJ" → "INJETORA") */
  sinonimosTipo: Record<string, string>;
}
export interface ClasseAtivo {
  padrao: string; nome: string; tipo: string; grupo?: GrupoCritico; papel?: "prensa" | "moinho";
  so1Turno?: boolean; soSabado?: boolean; exclusivoT1?: boolean; preferenciaT1?: boolean;
}

/** Parte 4 (backlog da IW38): só o mínimo que as conferências C10/C11 usam. */
export interface AlocacaoBacklog { porDia: Record<string /* Dia */, { t1: HH; t2: HH }> }
export interface ResumoBacklog { pendente: HH; noCalendario: HH; alocado: HH; semSaldo: HH }
