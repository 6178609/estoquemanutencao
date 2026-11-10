import { partes, type Dia } from "@/lib/wcm/util";

import { chaveMes, segunda, segundaDaChave, type DiaTrabalho } from "../calendario";
import type { Ativo, EntradaMotor, GrupoCritico, HH, ItemPlano, LinhaProgramacao, Marca, Parametros, Turno } from "../tipos";

/**
 * Estado do motor (spec §5.1) e a validação de um encaixe (regras R1–R15 da §5.2). Só dados e funções puras.
 */

export const CODIGOS = ["CALENDARIO", "SO_T1", "SABADO", "DOIS_CRITICOS", "MOINHO_SEM_PRENSA", "MESMO_TIPO", "SEMANA_REPETIDA",
  "PRENSA_SEMANA", "PRENSA_SEGUIDA", "PELLET_SEMANA", "PELLET_SEGUIDA", "DRY_BLEND_SOZINHA", "MAX_DIA", "T1_CHEIO", "JUNTO_FORA",
  "CAPACIDADE", "PARADAS_MES", "SEGUNDA_MESMA_SEMANA", "FORA_DO_MES"] as const;
export type Codigo = (typeof CODIGOS)[number];
export type ModoTurno = "T1" | "T2" | "T2+T1";

export const TOL = 1e-6;
export const turnosDo = (m: ModoTurno): Turno[] => (m === "T1" ? [1] : m === "T2" ? [2] : [2, 1]);

export interface OpcoesFalhas {
  ignorarCapacidade?: boolean; extra?: boolean; segundaParada?: boolean; hh?: HH;
  /** linhas que não contam (a própria linha sendo movida ou conferida) */
  ignorar?: Set<string>;
}

const somar = (a: HH, b: HH): HH => ({ mec: a.mec + b.mec, ele: a.ele + b.ele });

export function hhDe(itens: { disciplina: "MEC" | "ELE"; hh: number }[]): HH {
  const r = { mec: 0, ele: 0 };
  for (const i of itens) if (i.disciplina === "MEC") r.mec += i.hh; else r.ele += i.hh;
  return r;
}

const ehExtra = (l: LinhaProgramacao) => l.marcas.includes("parada extra");

export class Estado {
  readonly dias: Map<Dia, DiaTrabalho>;
  readonly linhas = new Map<string, LinhaProgramacao>();
  private readonly porDia = new Map<Dia, LinhaProgramacao[]>();
  private readonly porAtivo = new Map<string, LinhaProgramacao[]>();
  readonly comDemanda: Set<string>;
  readonly anterior: { seg: Dia; ativo: string; grupo: GrupoCritico | null }[];

  constructor(dias: DiaTrabalho[], readonly ativos: Record<string, Ativo>, readonly p: Parametros,
    anterior?: EntradaMotor["ocupacaoAnterior"], comDemanda: Iterable<string> = []) {
    this.dias = new Map(dias.map((d) => [d.data, d]));
    this.comDemanda = new Set(comDemanda);
    this.anterior = (anterior ?? []).flatMap((a) => {
      const seg = segundaDaChave(a.semana);
      return seg == null ? [] : [{ seg, ativo: a.ativo, grupo: a.grupo }];
    });
  }

  cap(d: Dia, t: Turno): HH {
    const x = this.dias.get(d);
    return x ? (t === 1 ? x.cap.t1 : x.cap.t2) : { mec: 0, ele: 0 };
  }

  linhasDoDia(d: Dia): LinhaProgramacao[] {
    return this.porDia.get(d) ?? [];
  }

  usado(d: Dia, t: Turno, ignorar?: Set<string>): HH {
    const r = { mec: 0, ele: 0 };
    for (const l of this.linhasDoDia(d)) if (l.turno === t && !ignorar?.has(l.id)) { r.mec += l.hh.mec; r.ele += l.hh.ele; }
    return r;
  }

  livre(d: Dia, t: Turno, ignorar?: Set<string>): HH {
    const c = this.cap(d, t), u = this.usado(d, t, ignorar);
    return { mec: c.mec - u.mec, ele: c.ele - u.ele };
  }

  ativosNoDia(d: Dia): string[] {
    return [...new Set(this.linhasDoDia(d).map((l) => l.ativo))].sort();
  }

  ativosNoTurno(d: Dia, t: Turno): string[] {
    return [...new Set(this.linhasDoDia(d).filter((l) => l.turno === t).map((l) => l.ativo))].sort();
  }

  grupoDoDia(d: Dia): GrupoCritico | null {
    return this.linhasDoDia(d).find((l) => l.grupo != null)?.grupo ?? null;
  }

  linhasDoAtivo(mes: string, ativo: string): LinhaProgramacao[] {
    return (this.porAtivo.get(ativo) ?? []).filter((l) => l.mes === mes);
  }

  linhasDoAtivoDoMes(mes: string): LinhaProgramacao[] {
    return [...this.linhas.values()].filter((l) => l.mes === mes);
  }

  paradasDoAtivo(mes: string, ativo: string): Dia[] {
    return [...new Set(this.linhasDoAtivo(mes, ativo).map((l) => l.data))].sort((a, b) => a - b);
  }

  /** Números de parada já usados pelo ativo no mês. */
  numerosDeParada(mes: string, ativo: string): number[] {
    return [...new Set(this.linhasDoAtivo(mes, ativo).map((l) => l.parada))].sort();
  }

  colocar(ativo: string, mes: string, d: Dia, t: Turno, itens: ItemPlano[], parada: 1 | 2, marcas: Marca[], acima?: HH): LinhaProgramacao {
    const a = this.ativos[ativo];
    const l: LinhaProgramacao = {
      id: `${mes}|${ativo}|${parada}|${t}`, data: d, turno: t, ativo, mes, parada, paradasNoMes: 0, hh: hhDe(itens),
      acima: acima ? { ...acima } : { mec: 0, ele: 0 }, itens: itens.map((i) => i.chave), marcas: [...new Set(marcas)],
      tipo: a?.tipo ?? "", grupo: a?.grupo ?? null, campos: a?.campos ?? [],
    };
    if (this.linhas.has(l.id)) this.remover(l.id);
    this.inserir(l);
    return l;
  }

  /** Insere uma linha pronta (alertas, fixações). */
  inserir(l: LinhaProgramacao): void {
    this.linhas.set(l.id, l);
    this.porDia.set(l.data, [...this.linhasDoDia(l.data), l]);
    this.porAtivo.set(l.ativo, [...(this.porAtivo.get(l.ativo) ?? []), l]);
  }

  /** Junta itens a uma linha existente (estouro ≤ 4 h). */
  acrescentar(id: string, itens: ItemPlano[], acima: HH, marca?: Marca): void {
    const l = this.linhas.get(id);
    if (!l) return;
    l.hh = somar(l.hh, hhDe(itens));
    l.acima = somar(l.acima, acima);
    l.itens.push(...itens.map((i) => i.chave));
    if (marca && !l.marcas.includes(marca)) l.marcas.push(marca);
  }

  /** Muda a linha de dia/turno (mesmos itens e HH). */
  mover(id: string, d: Dia, t: Turno, marca?: Marca): LinhaProgramacao | null {
    const l = this.linhas.get(id);
    if (!l) return null;
    this.remover(id);
    const novo: LinhaProgramacao = { ...l, id: `${l.mes}|${l.ativo}|${l.parada}|${t}`, data: d, turno: t,
      marcas: marca && !l.marcas.includes(marca) ? [...l.marcas, marca] : [...l.marcas], itens: [...l.itens] };
    if (this.linhas.has(novo.id)) this.remover(novo.id);
    this.inserir(novo);
    return novo;
  }

  remover(id: string): void {
    const l = this.linhas.get(id);
    if (!l) return;
    this.linhas.delete(id);
    this.porDia.set(l.data, this.linhasDoDia(l.data).filter((x) => x.id !== id));
    this.porAtivo.set(l.ativo, (this.porAtivo.get(l.ativo) ?? []).filter((x) => x.id !== id));
  }

  private ehPrensa(n: string): boolean {
    const a = this.ativos[n];
    return a ? a.papel === "prensa" : n.startsWith("PRENSA");
  }

  falhas(ativo: string, mes: string, d: Dia, modo: ModoTurno, o: OpcoesFalhas = {}): Codigo[] {
    const A = this.ativos[ativo];
    const out = new Set<Codigo>();
    if (!A) return [];
    const dt = this.dias.get(d);
    const turnos = turnosDo(modo);
    const ign = o.ignorar ?? new Set<string>();
    const ds = partes(d).semana;
    const outros = this.linhasDoDia(d).filter((l) => l.ativo !== ativo && !ign.has(l.id));
    const outrosT1 = outros.filter((l) => l.turno === 1);
    const seg = segunda(d);
    // R1
    if (!dt || (dt.condicao !== "util" && dt.condicao !== "sabado") || (dt.condicao === "sabado" && turnos.includes(2))) out.add("CALENDARIO");
    // R2
    if (A.so1Turno && turnos.includes(2)) out.add("SO_T1");
    // R3
    if (A.soSabado ? ds !== 6 : A.grupo != null && ds === 6) out.add("SABADO");
    // R4
    if (A.grupo && outros.some((l) => l.grupo && l.grupo !== A.grupo)) out.add("DOIS_CRITICOS");
    // R5
    if (A.papel === "moinho" && A.grupo && !outrosT1.some((l) => this.ehPrensa(l.ativo))) out.add("MOINHO_SEM_PRENSA");
    // R6
    if (outros.some((l) => l.tipo === A.tipo)) out.add("MESMO_TIPO");
    // R7
    const doAtivo = (this.porAtivo.get(ativo) ?? []).filter((l) => !ign.has(l.id) && l.data !== d);
    if (doAtivo.some((l) => segunda(l.data) === seg) || this.anterior.some((a) => a.ativo === ativo && a.seg === seg)) out.add("SEMANA_REPETIDA");
    // R8
    if (!o.extra) {
      const ocupacao = [
        ...[...this.linhas.values()].filter((l) => !ign.has(l.id) && !ehExtra(l) && !(l.ativo === ativo && l.data === d))
          .map((l) => ({ seg: segunda(l.data), ativo: l.ativo, grupo: l.grupo })),
        ...this.anterior,
      ];
      const conferir = (eh: (x: { ativo: string; grupo: GrupoCritico | null }) => boolean, semana: Codigo, seguida: Codigo) => {
        for (const x of ocupacao) {
          if (!eh(x)) continue;
          if (x.seg === seg) out.add(semana);
          if (Math.abs(x.seg - seg) === 7 && x.ativo === ativo) out.add(seguida);
        }
      };
      if (A.papel === "prensa") conferir((x) => this.ehPrensa(x.ativo), "PRENSA_SEMANA", "PRENSA_SEGUIDA");
      if (A.grupo === "PELLET") conferir((x) => (this.ativos[x.ativo]?.grupo ?? x.grupo) === "PELLET", "PELLET_SEMANA", "PELLET_SEGUIDA");
    }
    // R9
    if (turnos.includes(1) && ((A.exclusivoT1 && outrosT1.length) || outrosT1.some((l) => this.ativos[l.ativo]?.exclusivoT1))) {
      out.add("DRY_BLEND_SOZINHA");
    }
    // R10
    if (new Set(outros.map((l) => l.ativo)).size >= this.p.maxAtivosDia) out.add("MAX_DIA");
    // R11
    if (turnos.includes(1) && (A.grupo != null || outros.some((l) => l.grupo != null))) {
      const naoCriticos = new Set(outrosT1.filter((l) => l.grupo == null).map((l) => l.ativo)).size;
      if (naoCriticos >= (A.grupo == null ? 1 : 2)) out.add("T1_CHEIO");
    }
    // R12
    if (A.juntoCom && this.comDemanda.has(`${mes}|${A.juntoCom}`) && !outros.some((l) => l.ativo === A.juntoCom)) out.add("JUNTO_FORA");
    // R13
    if (o.hh && !o.ignorarCapacidade) {
      const livre = turnos.map((t) => this.livre(d, t, ign)).reduce(somar, { mec: 0, ele: 0 });
      if (o.hh.mec > livre.mec + TOL || o.hh.ele > livre.ele + TOL) out.add("CAPACIDADE");
    }
    // R14
    const paradas = [...new Set(doAtivo.filter((l) => l.mes === mes && !ehExtra(l)).map((l) => l.data))];
    if (!o.extra && paradas.length >= this.p.maxParadasMes) out.add("PARADAS_MES");
    if (paradas.some((x) => segunda(x) === seg)) out.add("SEGUNDA_MESMA_SEMANA");
    // R15
    if (chaveMes(d) !== mes) out.add("FORA_DO_MES");
    return CODIGOS.filter((c) => out.has(c));
  }
}

/** First-fit por disciplina, na ordem dos itens; item de 0 h sempre entra (spec §5.4). */
export function encaixar(itens: ItemPlano[], livre: HH): { dentro: ItemPlano[]; fora: ItemPlano[] } {
  const l = { ...livre };
  const dentro: ItemPlano[] = [], fora: ItemPlano[] = [];
  for (const i of itens) {
    const k = i.disciplina === "MEC" ? "mec" : "ele";
    if (i.hh <= TOL || i.hh <= l[k] + TOL) { dentro.push(i); l[k] -= i.hh; } else fora.push(i);
  }
  return { dentro, fora };
}

export function encaixarT2T1(itens: ItemPlano[], livreT2: HH, livreT1: HH): { t2: ItemPlano[]; t1: ItemPlano[]; fora: ItemPlano[] } {
  const a = encaixar(itens, livreT2);
  const b = encaixar(a.fora, livreT1);
  return { t2: a.dentro, t1: b.dentro, fora: b.fora };
}
