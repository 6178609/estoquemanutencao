import { dia } from "@/lib/wcm/util";

import type { CapTurno, ClasseAtivo, GrupoCritico, HH, Parametros } from "./tipos";

/**
 * Parâmetros da programação de paradas: os padrões (regras da planilha do planejador, sem dado da empresa) e a leitura
 * do cadastro `programacao_paradas.json` → `parametros` (só o que difere do padrão), validada campo a campo.
 */

const FERIADOS_NACIONAIS: [string, string][] = [
  ["01-01", "Confraternização Universal"], ["04-21", "Tiradentes"], ["05-01", "Dia do Trabalho"],
  ["09-07", "Independência"], ["10-12", "Nossa Senhora Aparecida"], ["11-02", "Finados"],
  ["11-15", "Proclamação da República"], ["11-20", "Consciência Negra"], ["12-25", "Natal"],
];

const CLASSES_PADRAO: ClasseAtivo[] = [
  { padrao: "\\(PELLET\\s*-?\\s*0?([1-9])\\)", nome: "PELLET $1", tipo: "PELLET", grupo: "PELLET", so1Turno: true },
  { padrao: "^LINHA PELLET\\s*-?\\s*0?([1-9])", nome: "PELLET $1", tipo: "PELLET", grupo: "PELLET", so1Turno: true },
  { padrao: "^DRY BLEND", nome: "DRY BLEND", tipo: "DRY BLEND", grupo: "DRY BLEND", so1Turno: true, exclusivoT1: true },
  { padrao: "^BANBURY", nome: "BANBURY", tipo: "BANBURY", grupo: "BANBURY", so1Turno: true },
  { padrao: "^INJETORA EXP\\s*(\\d+)", nome: "INJETORA $1", tipo: "INJETORA", grupo: "INJ EXP", so1Turno: true },
  { padrao: "^PRENSA A VACUO", nome: "PRENSA A VÁCUO", tipo: "PRENSA", grupo: "PRENSA/MOINHO SF", papel: "prensa", so1Turno: true },
  { padrao: "^PRENSA COPE", nome: "PRENSA COPE", tipo: "PRENSA", grupo: "PRENSA/MOINHO SF", papel: "prensa", so1Turno: true },
  { padrao: "^PRENSA PAN ?STONE", nome: "PRENSA PANSTONE", tipo: "PRENSA", grupo: "PRENSA/MOINHO SF", papel: "prensa", so1Turno: true },
  // o grupo só vale para os moinhos do rodízio (parâmetro rodizioMoinhos); os outros ficam sem grupo
  { padrao: "^MOINHO LAMIN(?:ADOR)?\\.?\\s*SF\\s*0?(\\d+)", nome: "MOINHO $1", tipo: "MOINHO", grupo: "PRENSA/MOINHO SF", papel: "moinho", so1Turno: true },
  { padrao: "^INJETORA PVC.*?0*(\\d+)$", nome: "PVC $1", tipo: "PVC" },
  { padrao: "^INJETORA 0?(\\d+) .*GOLDEN EAGLE", nome: "GOLDEN $1", tipo: "GOLDEN" },
  { padrao: "^INJETORA TIEN KANG\\s*0?(\\d+)", nome: "TIEN KANG $1", tipo: "TIEN KANG" },
  { padrao: "^PAN ?STONE\\s*0?(\\d+)", nome: "PANSTONE $1", tipo: "PANSTONE", preferenciaT1: true },
  { padrao: "^CALANDRA", nome: "CALANDRA", tipo: "CALANDRA", soSabado: true },
  { padrao: "^STABIL\\s*0?(\\d+)", nome: "STABIL $1", tipo: "STABIL", soSabado: true },
  { padrao: "^MICRONIZADOR\\s*0?(\\d+)", nome: "MICRONIZADOR $1", tipo: "MICRONIZADOR" },
  { padrao: "^MOINHO GK", nome: "MOINHO GK", tipo: "MOINHO GK" },
  { padrao: "^MOINHO TRITURADOR SEIBT\\s*0*(\\d+)", nome: "TRITURADOR SEIBT $1", tipo: "TRITURADOR SEIBT" },
  { padrao: "^PINHEIRO\\s*(\\d+)", nome: "PINHEIRO $1", tipo: "PINHEIRO" },
  { padrao: "^CRISTALIZADORA\\s*(\\d+)", nome: "CRISTALIZADORA $1", tipo: "CRISTALIZADORA" },
  { padrao: "^FORNO TUNEL", nome: "FORNO TÚNEL", tipo: "FORNO TÚNEL" },
];

export const PARAMETROS_PADRAO: Parametros = {
  versao: 1,
  localizacoes: ["GAL1"], gruposPlanejamento: [], centrosEliminados: ["ELMC_MTZ", "OPER_MTZ"],
  unidadePadraoIp19: "MIN",
  turnos: {
    t1: { pessoasMec: 6, pessoasEle: 2, horasPorPessoa: 6.5, inicio: "05:30", fim: "14:00" },
    t2: { pessoasMec: 5, pessoasEle: 1, horasPorPessoa: 3, inicio: "14:00", fim: "17:00" },
    sabado: { pessoasMec: 6, pessoasEle: 2, horasPorPessoa: 6.5, inicio: "05:30", fim: "11:30" },
  },
  feriados: [2026, 2027].flatMap((a) => FERIADOS_NACIONAIS.map(([md, nome]) => ({ data: `${a}-${md}`, nome }))),
  inicio: null,
  meses: 3,
  maxAtivosDia: 7,
  maxParadasMes: 2,
  estouro: { mec: 4, ele: 4 },
  antecipacaoDias: 3,
  padraoSemanal: { 1: ["DRY BLEND", "BANBURY"], 2: ["PELLET"], 3: ["PRENSA/MOINHO SF"], 4: ["INJ EXP"], 5: ["INJ EXP"] },
  ordemCriticos: ["DRY BLEND", "BANBURY", "PRENSA/MOINHO SF", "PELLET", "INJ EXP"],
  rodizioMoinhos: ["MOINHO 02", "MOINHO 05", "MOINHO 07"],
  juntos: [{ ativo: "MOINHO 04", com: "BANBURY" }],
  tiposPrimeiroT2: ["GOLDEN", "TIEN KANG", "PVC"],
  tiposPreferenciaT1: ["PANSTONE"],
  tiposSabadoPreenchimento: ["GOLDEN", "PVC", "TIEN KANG", "PANSTONE"],
  hhIrrelevante: { tipos: ["INJETORA"], limite: 0.2 },
  agrupamentos: [
    { ativo: "PELLET $1", padrao: "\\(PELLET\\s*-?\\s*0?([1-9])\\)" },
    { ativo: "PELLET $1", padrao: "^LINHA PELLET\\s*-?\\s*0?([1-9])" },
  ],
  classes: CLASSES_PADRAO,
  sinonimosTipo: { INJ: "INJETORA", MOI: "MOINHO", MICRO: "MICROINJ", "SIST AQUECMENTO": "SIST AQUECIMENTO" },
};

export const GRUPOS_CRITICOS: GrupoCritico[] = ["DRY BLEND", "BANBURY", "PELLET", "PRENSA/MOINHO SF", "INJ EXP"];

export function capTurno(t: CapTurno): HH {
  return { mec: t.pessoasMec * t.horasPorPessoa, ele: t.pessoasEle * t.horasPorPessoa };
}

// ----------------------------------------------------------------------------
// Validação
// ----------------------------------------------------------------------------
type Obj = Record<string, unknown>;
const ehObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const numero = (v: unknown, min = 0, inteiro = false) =>
  typeof v === "number" && Number.isFinite(v) && v >= min && (!inteiro || Number.isInteger(v));
const textos = (v: unknown): v is string[] => Array.isArray(v) && v.every((x) => typeof x === "string");
const regexOk = (s: unknown) => {
  if (typeof s !== "string" || !s) return false;
  try { new RegExp(s); return true; } catch { return false; }
};
const RX_ISO = /^(\d{4})-(\d{2})-(\d{2})$/;
export const isoValido = (s: unknown): s is string => {
  if (typeof s !== "string") return false;
  const m = RX_ISO.exec(s);
  return !!m && dia(Number(m[1]), Number(m[2]), Number(m[3])) != null;
};
const grupoOk = (g: unknown): g is GrupoCritico => GRUPOS_CRITICOS.includes(g as GrupoCritico);

function turnoDe(v: unknown, padrao: CapTurno): CapTurno | null {
  if (!ehObj(v)) return null;
  const t = { ...padrao, ...v } as CapTurno;
  if (!numero(t.pessoasMec, 0, true) || !numero(t.pessoasEle, 0, true) || !numero(t.horasPorPessoa)) return null;
  if (typeof t.inicio !== "string" || typeof t.fim !== "string") return null;
  return { pessoasMec: t.pessoasMec, pessoasEle: t.pessoasEle, horasPorPessoa: t.horasPorPessoa, inicio: t.inicio, fim: t.fim };
}

/** Valida um campo; devolve o valor aceito ou `undefined` (inválido). */
function validar(campo: keyof Parametros, v: unknown): unknown {
  switch (campo) {
    case "localizacoes": case "gruposPlanejamento": case "centrosEliminados": case "rodizioMoinhos":
    case "tiposPrimeiroT2": case "tiposPreferenciaT1": case "tiposSabadoPreenchimento":
      return textos(v) ? v.map((x) => x.trim().toUpperCase()).filter(Boolean) : undefined;
    case "ordemCriticos":
      return Array.isArray(v) && v.every(grupoOk) ? v : undefined;
    case "unidadePadraoIp19":
      return v === "MIN" || v === "H" ? v : undefined;
    case "feriados":
      return Array.isArray(v) && v.every((f) => ehObj(f) && isoValido(f.data) && typeof f.nome === "string")
        ? v.map((f) => ({ data: (f as Obj).data as string, nome: (f as Obj).nome as string })) : undefined;
    case "inicio":
      return v === null || isoValido(v) ? v : undefined;
    case "meses":
      return numero(v, 1, true) && (v as number) <= 12 ? v : undefined;
    case "maxAtivosDia":
      return numero(v, 1, true) ? v : undefined;
    case "maxParadasMes":
      return v === 1 || v === 2 ? v : undefined;
    case "antecipacaoDias":
      return numero(v, 0, true) ? v : undefined;
    case "estouro":
      return ehObj(v) && numero(v.mec ?? PARAMETROS_PADRAO.estouro.mec) && numero(v.ele ?? PARAMETROS_PADRAO.estouro.ele)
        ? { ...PARAMETROS_PADRAO.estouro, ...v } : undefined;
    case "padraoSemanal": {
      if (!ehObj(v)) return undefined;
      const r = { ...PARAMETROS_PADRAO.padraoSemanal };
      for (const [k, gs] of Object.entries(v)) {
        if (!["1", "2", "3", "4", "5"].includes(k) || !Array.isArray(gs) || !gs.every(grupoOk)) return undefined;
        r[Number(k) as 1] = gs;
      }
      return r;
    }
    case "juntos":
      return Array.isArray(v) && v.every((j) => ehObj(j) && typeof j.ativo === "string" && typeof j.com === "string")
        ? v.map((j) => ({ ativo: String((j as Obj).ativo), com: String((j as Obj).com) })) : undefined;
    case "hhIrrelevante":
      return ehObj(v) && textos(v.tipos ?? []) && numero(v.limite ?? 0) ? { ...PARAMETROS_PADRAO.hhIrrelevante, ...v } : undefined;
    case "agrupamentos":
      return Array.isArray(v) && v.every((a) => ehObj(a) && typeof a.ativo === "string" && a.ativo && regexOk(a.padrao))
        ? v : undefined;
    case "classes":
      return Array.isArray(v) && v.every((c) => ehObj(c) && regexOk(c.padrao) && typeof c.nome === "string" && c.nome
        && typeof c.tipo === "string" && c.tipo && (c.grupo == null || grupoOk(c.grupo))) ? v : undefined;
    case "sinonimosTipo":
      return ehObj(v) && Object.entries(v).every(([k, x]) => k.trim() && typeof x === "string" && x.trim())
        ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k.trim().toUpperCase(), String(x).trim().toUpperCase()])) : undefined;
    default:
      return undefined;
  }
}

/** Parâmetros do cadastro mesclados sobre o padrão; o que for inválido fica no padrão, com aviso. */
export function parametrosDe(cad: Record<string, Record<string, unknown>> | null | undefined): { p: Parametros; avisos: string[] } {
  const p: Parametros = structuredClone(PARAMETROS_PADRAO);
  const avisos: string[] = [];
  const aviso = (campo: string) => avisos.push(`Parâmetro ${campo} inválido; usado o padrão.`);
  const salvos = cad?.parametros;
  if (!ehObj(salvos)) return { p, avisos };
  for (const [campo, v] of Object.entries(salvos)) {
    if (campo === "versao" || !(campo in PARAMETROS_PADRAO)) continue;
    if (campo === "turnos") {
      if (!ehObj(v)) { aviso("turnos"); continue; }
      for (const t of ["t1", "t2", "sabado"] as const) {
        if (v[t] === undefined) continue;
        const ok = turnoDe(v[t], PARAMETROS_PADRAO.turnos[t]);
        if (ok) p.turnos[t] = ok;
        else aviso(`turnos.${t}`);
      }
      continue;
    }
    const ok = validar(campo as keyof Parametros, v);
    if (ok === undefined) aviso(campo);
    else (p as unknown as Obj)[campo] = structuredClone(ok);
  }
  return { p, avisos };
}
