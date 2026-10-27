/**
 * Listas de tarefas do SAP (texto da IA03/IA06, ver lib/leitura/listasTarefas.ts): preparo, ciclos, horas por ano,
 * equipamentos de cada lista (IP19 + ordens do IW38), temas da operação (para achar manual, guia e peça) e as peças do
 * equipamento sugeridas para as operações de troca. Funções puras, testadas em testes/listasTarefas.test.ts.
 */
import { chave } from "../dados/texto";

export interface ComponenteLT { material: string; texto: string; quantidade: number | null; um: string }
export interface OperacaoLT {
  operacao: string; sub: string; texto: string; textoLongo: string; centroTrabalho: string; chaveControle: string;
  pessoas: number | null; trabalhoH: number | null; duracaoH: number | null; pacotes: string; ciclos: string;
  /** o ciclo mais curto dos pacotes da operação, em dias (null = sem pacote) */
  cicloDias: number | null;
  /** trabalho × execuções por ano (null = sem trabalho ou sem ciclo) */
  horasAno: number | null;
  componentes: ComponenteLT[];
}
export interface ListaLT {
  chave: string; grupo: string; numerador: string; titulo: string; estrategia: string; status: string; centro: string;
  operacoes: OperacaoLT[]; suboperacoes: OperacaoLT[];
  trabalhoH: number; horasAno: number; cicloDias: number | null; centrosTrabalho: string[];
}

export const chaveLista = (grupo: string, numerador: string) => `${String(grupo).trim().toUpperCase()}|${String(numerador).trim().replace(/^0+(?=\d)/, "")}`;

/** "1,5" → 1.5; vazio → null. */
export function numBr(v: unknown): number | null {
  const s = String(v ?? "").trim().replace(/\./g, "").replace(",", ".");
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** Valor + unidade do SAP em horas ("30,0" "MIN" → 0,5). Sem unidade vale hora. */
export function emHoras(valor: unknown, unidade: unknown): number | null {
  const n = numBr(valor);
  if (n == null) return null;
  const u = chave(unidade);
  if (/^MIN/.test(u)) return n / 60;
  if (/^(DIA|D)$/.test(u)) return n * 24;
  return n;
}

/** "1 Mês", "2 Meses", "1,5 Anos", "Semanal", "Quinzenal", "0,5 Mês" → dias (null = não é ciclo). */
export function cicloEmDias(texto: string): number | null {
  const t = chave(texto);
  if (!t) return null;
  if (/SEMANAL/.test(t)) return 7;
  if (/QUINZENAL/.test(t)) return 15;
  if (/DIARI/.test(t)) return 1;
  const m = /^(\d+(?:[ ,.]\d+)?)\s*(DIAS?|SEMANAS?|MES|MESES|ANOS?)\b/.exec(t);
  if (!m) return null;
  const n = Number(m[1].replace(/[ ,]/, "."));
  if (!Number.isFinite(n) || n <= 0) return null;
  const u = m[2];
  const dias = u.startsWith("DIA") ? n : u.startsWith("SEMANA") ? n * 7 : u.startsWith("MES") ? n * 30.4375 : n * 365.25;
  return Math.round(dias * 100) / 100;
}

const txt = (v: unknown) => String(v ?? "").trim();

/** As linhas da base (uma por operação, suboperação ou componente) → uma entrada por lista, na ordem do arquivo. */
export function prepararListas(linhas: Record<string, unknown>[] | null | undefined): ListaLT[] {
  const out = new Map<string, ListaLT>();
  for (const l of linhas ?? []) {
    const grupo = txt(l["Grupo lista tarefas"]), num = txt(l["Numerador"]);
    if (!grupo) continue;
    const k = chaveLista(grupo, num);
    let lt = out.get(k);
    if (!lt) {
      lt = { chave: k, grupo, numerador: num, titulo: txt(l["Título da lista"]), estrategia: txt(l["Estratégia"]), status: txt(l["Status"]),
        centro: txt(l["Centro"]), operacoes: [], suboperacoes: [], trabalhoH: 0, horasAno: 0, cicloDias: null, centrosTrabalho: [] };
      out.set(k, lt);
    }
    const reg = txt(l["Registro"]);
    if (reg === "Componente") {
      const op = [...lt.operacoes].reverse().find((o) => o.operacao === txt(l["Operação"])) ?? lt.operacoes[lt.operacoes.length - 1];
      if (op) op.componentes.push({ material: txt(l["Material"]).replace(/^0+(?=\d)/, ""), texto: txt(l["Texto do material"]),
        quantidade: numBr(l["Quantidade"]), um: txt(l["UM"]) });
      continue;
    }
    if (reg !== "Operação" && reg !== "Suboperação") continue;
    const ciclos = txt(l["Ciclos"]);
    const dias = ciclos.split("+").map((c) => cicloEmDias(c)).filter((d): d is number => d != null);
    const cicloDias = dias.length ? Math.min(...dias) : null;
    const trabalhoH = emHoras(l["Trabalho"], l["Unid. trabalho"]);
    const op: OperacaoLT = {
      operacao: txt(l["Operação"]), sub: txt(l["Suboperação"]), texto: txt(l["Texto da operação"]), textoLongo: String(l["Texto longo"] ?? "").trim(),
      centroTrabalho: txt(l["Centro de trabalho"]), chaveControle: txt(l["Chave de controle"]), pessoas: numBr(l["Pessoas"]),
      trabalhoH, duracaoH: emHoras(l["Duração"], l["Unid. duração"]), pacotes: txt(l["Pacotes"]), ciclos, cicloDias,
      horasAno: trabalhoH != null && cicloDias ? Math.round((trabalhoH * 365.25 / cicloDias) * 100) / 100 : null, componentes: [],
    };
    (reg === "Operação" ? lt.operacoes : lt.suboperacoes).push(op);
  }
  for (const lt of out.values()) {
    lt.trabalhoH = Math.round(lt.operacoes.reduce((s, o) => s + (o.trabalhoH ?? 0), 0) * 100) / 100;
    lt.horasAno = Math.round(lt.operacoes.reduce((s, o) => s + (o.horasAno ?? 0), 0) * 100) / 100;
    const ds = lt.operacoes.map((o) => o.cicloDias).filter((d): d is number => d != null);
    lt.cicloDias = ds.length ? Math.min(...ds) : null;
    lt.centrosTrabalho = [...new Set(lt.operacoes.map((o) => o.centroTrabalho).filter(Boolean))].sort();
  }
  return [...out.values()];
}

/** Nome curto do ciclo ("30,44 dias" → "1 mês"). */
export function rotuloCiclo(dias: number | null): string {
  if (dias == null) return "Sem ciclo";
  if (dias <= 1) return "Diário";
  if (dias <= 7) return "Semanal";
  if (dias <= 15) return "Quinzenal";
  const meses = Math.round(dias / 30.4375 * 10) / 10;
  // sem vírgula no rótulo: ele vai para o filtro do endereço, que separa os valores por vírgula
  if (!Number.isInteger(meses)) return `${Math.round(dias)} dias`;
  if (meses < 12 || meses % 12) return meses === 1 ? "1 mês" : `${meses} meses`;
  const anos = meses / 12;
  return anos === 1 ? "1 ano" : `${anos} anos`;
}

// ---------------------------------------------------------------------------------------- equipamentos de cada lista

type Linha = Record<string, unknown>;
const col = (cols: string[], rx: RegExp, fora?: RegExp) => cols.find((c) => rx.test(chave(c)) && !(fora && fora.test(chave(c))));

export interface EquipLista { equipamento: string; planos: string[]; textoPlano: string; pelaOrdem: boolean }

/**
 * Lista → equipamentos que a usam: as linhas da IP19 com equipamento (o plano liga a lista ao equipamento) e as ordens
 * do IW38 com plano (todas as listas do plano). Lista geral = mais de um equipamento.
 */
export function equipamentosPorLista(ip19: Linha[] | null | undefined, ordens: { equipChave: string; plano: string }[] = []):
  Map<string, EquipLista[]> {
  const out = new Map<string, Map<string, EquipLista>>();
  const porPlano = new Map<string, Set<string>>();
  const textoPlano = new Map<string, string>();
  const add = (k: string, eq: string, plano: string, pelaOrdem: boolean) => {
    const m = out.get(k) ?? out.set(k, new Map()).get(k)!;
    const e = m.get(eq) ?? m.set(eq, { equipamento: eq, planos: [], textoPlano: "", pelaOrdem }).get(eq)!;
    if (plano && !e.planos.includes(plano)) e.planos.push(plano);
    if (!e.textoPlano && plano) e.textoPlano = textoPlano.get(plano) ?? "";
    if (!pelaOrdem) e.pelaOrdem = false;
  };
  if (ip19?.length) {
    const cols = Object.keys(ip19[0]);
    const cPlano = col(cols, /^PLANO( DE)? MANUT|^PLANO$/), cEq = col(cols, /^EQUIPAMENTO$/);
    const cGrupo = col(cols, /GRUPO LISTAS? (DE )?TAREFAS?|GRUPO.*LISTA|^GRUPO$/, /PLANEJ|PLNJ/);
    const cNum = col(cols, /NUMERADOR DE GRUPOS?|^NUMERADOR$|^CONTADOR( DE GRUPOS?)?$/);
    const cTexto = col(cols, /TEXTO.*PLANO/);
    if (cGrupo) {
      for (const l of ip19) {
        const g = txt(l[cGrupo]);
        if (!g) continue;
        const k = chaveLista(g, cNum ? txt(l[cNum]) : "");
        const plano = cPlano ? txt(l[cPlano]) : "";
        if (plano) {
          (porPlano.get(plano) ?? porPlano.set(plano, new Set()).get(plano)!).add(k);
          if (cTexto && !textoPlano.has(plano)) textoPlano.set(plano, txt(l[cTexto]));
        }
        const eq = cEq ? txt(l[cEq]) : "";
        if (eq) add(k, eq, plano, false);
      }
    }
  }
  for (const o of ordens) {
    if (!o.equipChave || !o.plano) continue;
    for (const k of porPlano.get(o.plano) ?? []) add(k, o.equipChave, o.plano, true);
  }
  return new Map([...out].map(([k, m]) => [k, [...m.values()].sort((a, b) => a.equipamento.localeCompare(b.equipamento))]));
}

// ---------------------------------------------------------------------------------------- temas (manual, guia, peça)

export interface Tema { id: string; rotulo: string; texto: RegExp; documento: RegExp; guias: string[] }

/** Assuntos de manutenção reconhecidos no texto da operação; o mesmo assunto acha o capítulo do manual e o guia. */
export const TEMAS: Tema[] = [
  { id: "lubrificacao", rotulo: "Lubrificação", texto: /LUBRIF|GRAXA|ENGRAX|\bOLEO\b|NIVEL DE OLEO/, documento: /LUBRIF|OLEO|GRAXA/, guias: ["graxas", "oleos", "intervalos_quantidade"] },
  { id: "hidraulico", rotulo: "Hidráulica", texto: /HIDRAUL|UNIDADE HIDR|CILINDRO HIDR|VALVULA DIREC/, documento: /HIDRAUL|OLEO DE PROCESSO|ATUADOR/, guias: ["unidade_hidraulica", "valvulas_direcionais"] },
  { id: "pneumatico", rotulo: "Pneumática", texto: /PNEUMAT|AR COMPRIMIDO|\bFRL\b|LUBRIFIL|CILINDRO PNEU/, documento: /PNEUMAT/, guias: ["frl", "cilindros_pneumaticos", "vazamentos_ar"] },
  { id: "rolamento", rotulo: "Rolamentos e mancais", texto: /ROLAMENT|MANCA[IL]/, documento: /ROLAMENT|MANCA[IL]|ROTOR/, guias: ["rolamentos"] },
  { id: "correia", rotulo: "Correias e polias", texto: /CORREIA|POLIA/, documento: /CORREIA|POLIA|ACIONAMENTO/, guias: ["correias_polias"] },
  { id: "acoplamento", rotulo: "Acoplamentos e alinhamento", texto: /ACOPLAMENT|ALINHAMENT/, documento: /ACOPLAMENT|ACIONAMENTO/, guias: ["acoplamentos", "alinhamento_eixos"] },
  { id: "redutor", rotulo: "Redutor", texto: /REDUTOR|ENGRENAG/, documento: /REDUTOR|ACIONAMENTO|ENGRENAG/, guias: ["redutores"] },
  { id: "vibracao", rotulo: "Vibração", texto: /VIBRA/, documento: /VIBRA/, guias: ["analise_vibracao"] },
  { id: "motor", rotulo: "Motores e acionamentos", texto: /\bMOTOR|INVERSOR|SERVO/, documento: /MOTOR|ELETRIC|ACIONAMENTO/, guias: ["motores_inducao", "inversores"] },
  { id: "eletrico", rotulo: "Elétrica e painéis", texto: /ELETRIC|PAINEL|CONTATOR|DISJUNTOR|BORNE|TERMINA[IL]|CABOS? ELET|ATERRAMENT|ISOLAMENT/, documento: /ELETRIC|PAINEL|ESQUEMA/, guias: ["contatores_rele_termico", "aterramento", "medicoes_isolamento"] },
  { id: "aquecimento", rotulo: "Aquecimento", texto: /RESISTENC|AQUECIM|TERMOPAR|TEMPERATUR/, documento: /AQUECIM|RESIST|TEMPERAT/, guias: [] },
  { id: "refrigeracao", rotulo: "Refrigeração e água", texto: /REFRIGER|TROCADOR|AGUA GELADA|TORRE|CHILLER|RADIADOR/, documento: /REFRIGER|AGUA|CIRCULACAO/, guias: [] },
  { id: "vedacao", rotulo: "Vedações", texto: /VEDA[CÇ]|RETENTOR|GAXETA|O RING|ORING|JUNTA/, documento: /VEDA[CÇ]|ANEIS/, guias: [] },
  { id: "filtro", rotulo: "Filtros", texto: /FILTRO|ELEMENTO FILTR/, documento: /FILTR|HIDRAUL|COMPONENTES/, guias: [] },
  { id: "seguranca", rotulo: "Segurança", texto: /SEGURAN|EMERGENC|NR ?12|INTERTRAV|CORTINA|ENCLAVAMENT/, documento: /SEGURAN|NR ?12|LAUDO/, guias: ["nr12", "loto"] },
];

/** Temas do texto da operação (curto + longo). */
export function temasDoTexto(texto: string): Tema[] {
  const t = chave(texto);
  return TEMAS.filter((x) => x.texto.test(t));
}

/** O documento (pelo título) trata de algum destes temas? */
export function documentoDoTema(titulo: string, temas: Tema[]): boolean {
  const t = chave(titulo);
  return temas.some((x) => x.documento.test(t));
}

// ---------------------------------------------------------------------------------------- peças sugeridas (MRO)

/** A operação troca, repõe ou completa alguma coisa? */
export function ehTroca(texto: string): boolean {
  return /SUBSTITU|\bTROCA|\bTROCAR|REPOR|REPOSIC|COMPLETAR|ENGRAX|LUBRIFICAR/.test(chave(texto));
}

/** Palavras do tipo de peça na descrição curta (FILTRO, ROLAMENTO…) — a primeira palavra, com sinônimos. */
const SINONIMOS: [RegExp, string][] = [
  [/^ELEMENTO FILT|^FILTRO|^CARTUCHO FILT/, "FILTRO"], [/^ROLAMENTO/, "ROLAMENT"], [/^CORREIA/, "CORREIA"], [/^OLEO/, "OLEO"],
  [/^GRAXA/, "GRAXA"], [/^RETENTOR/, "RETENTOR"], [/^ANEL O|^CORDAO VED|^O ?RING/, "ANEL"], [/^GAXETA/, "GAXETA"], [/^MANGUEIRA/, "MANGUEIRA"],
  [/^LAMPADA/, "LAMPADA"], [/^ESCOVA/, "ESCOVA"], [/^RESISTENCIA/, "RESISTENC"], [/^VALVULA/, "VALVULA"], [/^SENSOR/, "SENSOR"],
  [/^CONTATOR/, "CONTATOR"], [/^FUSIVEL/, "FUSIVEL"], [/^REPARO|^KIT REP/, "REPARO"], [/^RELE/, "RELE"], [/^TERMOPAR/, "TERMOPAR"],
  [/^LONA|^PASTILHA/, "LONA"], [/^CABO ACO/, "CABO"], [/^ACOPLAMENTO/, "ACOPLAMENT"], [/^POLIA/, "POLIA"], [/^BUCHA/, "BUCHA"],
];

export function tipoDaPeca(descricaoCurta: string): string | null {
  const t = chave(descricaoCurta);
  for (const [rx, k] of SINONIMOS) if (rx.test(t)) return k;
  return null;
}

/** Peça sugerida para a operação: a operação é de troca e cita o tipo da peça. */
export function pecaCombina(textoOperacao: string, descricaoCurta: string): boolean {
  const tipo = tipoDaPeca(descricaoCurta);
  if (!tipo) return false;
  const t = chave(textoOperacao);
  if (!ehTroca(t)) return false;
  if (tipo === "ANEL") return /\bANE(L|IS)\b|O ?RING|VEDA/.test(t);
  if (tipo === "REPARO") return /REPARO|KIT/.test(t);
  if (tipo === "GRAXA") return /GRAXA|ENGRAX|LUBRIF/.test(t);
  if (tipo === "OLEO") return /\bOLEO|LUBRIF/.test(t);
  return t.includes(tipo);
}
