/**
 * Regras de vínculo automático de peças a equipamentos — as regras e a conta são puras (testes/regrasVinculo.test.ts);
 * a gravação fica em regrasVinculoGravar.ts. A regra só ACRESCENTA peças ao cadastro do equipamento (o que foi
 * vinculado à mão fica) e só em equipamento ativo no SAP.
 *
 * Regras atuais (materiais aprovados no catálogo do Sysmat):
 * - injetoras KCLKA da EXP 12 em diante: os materiais com referência EK3 (modelo EK3-6E2/10E2);
 * - injetoras Golden Eagle 01 a 12 (UGB1): os materiais do modelo 180S (GEL 180/S, GEK 180/S, GEL/GEK 180/S…; não
 *   GEL 180, GEL 180L nem GEK 180/700/S);
 * - injetoras PVC (Golden Eagle): os materiais dos modelos GEK 220 / GEKK e GES 270/S / GES 220W/S (porta-molde fica de
 *   fora), na máquina e no sistema certo dela (hidráulico, injeção, aquecimento…; ver sistemaGoldenPvc);
 * - injetoras Tien Kang (2 estações): os materiais com TIEN KANG no descritivo;
 * - Pan Stone (máquinas com o código JOB no nome): os materiais com PAN STONE e JOB no descritivo;
 * - Banbury Bonfanti (UGB1): os materiais Bonfanti do misturador BMI-80 (BMI-80T, MIXER BMI80, Banbury 80 L);
 * - prensa a vácuo: os materiais do modelo KCLKA EK76 (EK76A-10, EK76-10);
 * - prensa COPE: os materiais do modelo PHB 450 (também escrito PBH 450).
 */
import { chave } from "./texto";
import type { ItemCatalogo } from "./materiais";
import type { Equipamento } from "../wcm/preparo";

export interface RegraVinculo {
  id: string; descricao: string;
  equipamento: (e: Pick<Equipamento, "denominacao" | "inativo" | "desativado">) => boolean;
  material: (m: Pick<ItemCatalogo, "material" | "descricaoCurta" | "descrCompleta" | "status">) => boolean;
}

/** Sistemas das injetoras PVC: o nome do subconjunto no SAP ("INJ PVC 06 GOLDEN - SISTEMA HIDRAULICO"…). */
const SISTEMAS_PVC = {
  hidraulico: /SISTEMA HIDRAULICO$/, unidadeHidraulica: /UNIDADE HIDRAULICA$/, injecao: /INJECAO$/, aquecimento: /AQUECIMEN/,
  refrigeracao: /REFRIGERA/, comando: /COMAN/, controle: /CONTROLE$/, fechamento: /FECHAMENT/, seguranca: /SEGURANCA$/,
  estrutura: /ESTRUTURA$/, abastecimento: /ABASTECIMENT/, lubrificacao: /LUBRIFIC/,
} as const;
export type SistemaPvc = keyof typeof SISTEMAS_PVC;

/**
 * Peças da lista do manual da GEK 220W/S (componentes hidráulicos, elétricos e rolamentos) achadas no Sysmat pela referência,
 * com o sistema da máquina onde entram.
 */
const PECAS_MANUAL_GEK220: Record<string, SistemaPvc> = {
  // válvulas DSG-01-3C2 / DSG-01-2B2 / DSG-03-3C2 / DSHG-04-3C10 / DSHG-04-3C2 e retenção MPB-01-2-40
  1791702: "hidraulico", 1784172: "hidraulico", 1773829: "hidraulico", 1757607: "hidraulico", 1794791: "hidraulico", 1773828: "hidraulico",
  1791695: "hidraulico", 1791696: "hidraulico", 1698037: "hidraulico", 1784212: "hidraulico", 1773830: "hidraulico", 1773833: "hidraulico",
  // filtro de sucção WU-400x100-J e filtro de óleo B-32
  1793647: "unidadeHidraulica", 1673347: "unidadeHidraulica",
  // motor hidráulico de ajuste do molde (NHM6-500)
  1773553: "fechamento",
  // rolamento de rolos cônicos 30216 (7216E) do assento traseiro da injeção
  1736241: "injecao",
  // controlador AK668 e réguas lineares 175/450 mm
  1698010: "controle", 1784278: "controle", 1740159: "controle",
  // drive Delta VFD300, contator LC1-D09, relés de estado sólido 10/50 A, fontes S-150-24
  1780472: "comando", 1712803: "comando", 1668032: "comando", 1670820: "comando", 1669210: "comando", 1697608: "comando",
  // fim de curso XCKN2118
  1743394: "seguranca",
};

export const REGRAS: RegraVinculo[] = [
  {
    id: "kclka-exp12-ek3",
    descricao: "Injetoras KCLKA da EXP 12 em diante: materiais EK3 aprovados no Sysmat",
    equipamento: (e) => {
      if (e.inativo || e.desativado) return false;
      const m = /^INJETORA EXP\s*(\d+)\b.*KCLKA/.exec(chave(e.denominacao));
      return !!m && Number(m[1]) >= 12;
    },
    material: (m) => !!m.material.trim() && chave(m.status) === "APROVADO"
      && /\bEK3\b/.test(chave(`${m.descricaoCurta} ${m.descrCompleta}`)),
  },
  {
    id: "golden-01a12-180s",
    descricao: "Injetoras Golden Eagle 01 a 12 (UGB1): materiais do modelo 180S aprovados no Sysmat",
    equipamento: (e) => {
      if (e.inativo || e.desativado) return false;
      const m = /^INJETORA (\d+) UGB1 GOLDEN EAGLE\b/.exec(chave(e.denominacao));
      return !!m && Number(m[1]) >= 1 && Number(m[1]) <= 12;
    },
    material: (m) => !!m.material.trim() && chave(m.status) === "APROVADO" && modelo180S(m.descrCompleta),
  },
  {
    id: "golden-pvc",
    descricao: "Injetoras PVC (Golden Eagle): materiais GEK 220 / GEKK e GES 270/S aprovados no Sysmat",
    equipamento: (e) => !e.inativo && !e.desativado && /^INJETORA PVC GOLDEN EAGLE \d+$/.test(chave(e.denominacao)),
    material: (m) => !!m.material.trim() && chave(m.status) === "APROVADO" && materialGoldenPvc(m.descricaoCurta, m.descrCompleta, m.material),
  },
  ...regrasDosSistemasPvc(),
  {
    id: "golden-pvc-robo",
    descricao: "Robôs Golden Eagle das injetoras PVC: garras e peças do robô (GES 270/S)",
    equipamento: (e) => !e.inativo && !e.desativado && /^ROBO ZHE[JIU]+ANG GOLDEN EAGLE \d+$/.test(chave(e.denominacao)),
    material: (m) => !!m.material.trim() && chave(m.status) === "APROVADO" && materialGoldenPvc(m.descricaoCurta, m.descrCompleta, m.material)
      && pecaDeRoboPvc(m.descricaoCurta),
  },
  {
    id: "tienkang",
    descricao: "Injetoras Tien Kang: materiais com TIEN KANG no descritivo, aprovados no Sysmat",
    equipamento: (e) => !e.inativo && !e.desativado && /^INJETORA TIEN ?KANG \d+ 2 ESTACOES$/.test(chave(e.denominacao)),
    material: (m) => !!m.material.trim() && chave(m.status) === "APROVADO" && /\bTIEN ?KANG\b/.test(chave(`${m.descricaoCurta} ${m.descrCompleta}`)),
  },
  {
    id: "panstone-job",
    descricao: "Pan Stone (código JOB): materiais com PAN STONE e JOB no descritivo, aprovados no Sysmat",
    equipamento: (e) => !e.inativo && !e.desativado && /\bPAN ?STONE \d+ JOB\b/.test(chave(e.denominacao)),
    material: (m) => {
      const t = chave(`${m.descricaoCurta} ${m.descrCompleta}`);
      return !!m.material.trim() && chave(m.status) === "APROVADO" && /\bPAN ?STONE\b/.test(t) && /\bJOB/.test(t);
    },
  },
  {
    id: "banbury-bonfanti-bmi80",
    descricao: "Banbury Bonfanti (UGB1): materiais Bonfanti do misturador BMI-80, aprovados no Sysmat",
    equipamento: (e) => !e.inativo && !e.desativado && /^BANBURY SF \d+ UGB1 BONFANTI$/.test(chave(e.denominacao)),
    material: (m) => !!m.material.trim() && chave(m.status) === "APROVADO" && bonfantiBmi80(m.descricaoCurta, m.descrCompleta),
  },
  {
    id: "prensa-vacuo-ek76",
    descricao: "Prensa a vácuo: materiais do modelo KCLKA EK76, aprovados no Sysmat",
    equipamento: (e) => !e.inativo && !e.desativado && /^PRENSA (A )?VACUO \d+$/.test(chave(e.denominacao)),
    material: (m) => !!m.material.trim() && chave(m.status) === "APROVADO" && /\bEK ?76/.test(chave(`${m.descricaoCurta} ${m.descrCompleta}`)),
  },
  {
    id: "prensa-cope-phb450",
    descricao: "Prensa COPE: materiais do modelo PHB 450, aprovados no Sysmat",
    equipamento: (e) => !e.inativo && !e.desativado && /^PRENSA COPE \d+ P[HB][HB] ?450$/.test(chave(e.denominacao)),
    material: (m) => !!m.material.trim() && chave(m.status) === "APROVADO" && /\bP(HB|BH) ?450(?!\d)/.test(chave(`${m.descricaoCurta} ${m.descrCompleta}`)),
  },
];

/**
 * Material Bonfanti do misturador BMI-80: BMI-80/80T/MIXER BMI80 no texto ou Banbury/misturador com MODELO 80 L. O próprio
 * misturador cadastrado como material (descrição curta "MISTURADOR …") não é peça e fica de fora.
 */
export function bonfantiBmi80(curta: string, completa: string): boolean {
  const t = chave(`${curta} ${completa}`);
  if (!/\bBONFANTI\b/.test(t) || /^MISTURADOR\b/.test(chave(curta))) return false;
  const mo = chave(/MODELO:\s*([^;]+)/i.exec(completa)?.[1] ?? "");
  return /\bBMI ?80(?!\d)/.test(t) || (/^80 ?L$/.test(mo) && /BANBURY|MISTURADOR/.test(t));
}

/** Material das injetoras PVC Golden Eagle: modelo GEK 220 / GEKK ou GES 270/S, GES 220W/S; porta-molde (ferramental) não. */
export function materialGoldenPvc(curta: string, completa: string, codigo = ""): boolean {
  if (PECAS_MANUAL_GEK220[codigo.trim()]) return true;
  if (/^PORTA MOLDE\b/.test(chave(curta))) return false;
  const mo = chave(/MODELO:\s*([^;]+)/i.exec(completa)?.[1] ?? "").replace(/\s/g, "");
  return modeloGek220(curta, completa) || /GES(270|220)/.test(mo);
}

/** Em que sistema da injetora PVC a peça entra, pela descrição curta (null = só na máquina: robô, pneumática, avulsos). */
export function sistemaGoldenPvc(curta: string, codigo = ""): SistemaPvc | null {
  if (PECAS_MANUAL_GEK220[codigo.trim()]) return PECAS_MANUAL_GEK220[codigo.trim()];
  const c = chave(curta);
  if (pecaDeRoboPvc(curta)) return null;
  if (/^(RESERV OLEO|FILTRO RETORN|ACOPLAMENTO EIXO MOT|TERMOPAR K OLEO)/.test(c)) return "unidadeHidraulica";
  if (/^(VALVULA (HIDR|ALIV|YUKEN)|MANGUEIRA HIDR|CILINDRO? FREIO HIDR|CJ VED FREIO)/.test(c)) return "hidraulico";
  if (/^(RESISTENCIA|TERMOPAR|MODULO CONTROL POLIMOLD|CONECTOR POTENCIA POLIMOLD|FONTE COMUNICACAO POLIMOLD|GUIA GABINETE POLIMOLD|MODULO PAINEL CEGO)/.test(c)) return "aquecimento";
  if (/^(BICO INJETOR|CILINDR CJ PLASTIF|FILTRO CIL BICO|CJ FILT BICO|PONTEIRA CJ PLAST|ANEL POLIMOLD|ENCOSTO POLIMOLD)/.test(c)) return "injecao";
  if (/^DISTRIBUIDOR AGUA/.test(c)) return "refrigeracao";
  if (/^GRADE MAGNETICA/.test(c)) return "abastecimento";
  if (/^(PLACA CONTR|CABO COMUN IHM|SENSOR VACUO)/.test(c)) return "controle";
  if (/^(CABO COMUN|DRIVE|SERVO|PLACA|CONECTOR ELETRON|FILTRO RUIDO|RESISTOR FRENAGEM|SINALEIRO)/.test(c)) return "comando";
  if (/^(COLUNA|PORCA FIX COL|REDUTOR RSF|CORREIA)/.test(c)) return "fechamento";
  if (/^(TRAVA PORTA|SUPORTE FIX PROT)/.test(c)) return "seguranca";
  if (/^PROTECAO PORTA CABOS/.test(c)) return "estrutura";
  return null;
}

/** Garra, robô ou placa de entrada/saída do robô (vão no robô, não num sistema da injetora). */
export function pecaDeRoboPvc(curta: string): boolean {
  return /GARRA|\bROBO\b|\bROB\b/.test(chave(curta));
}

/** Uma regra por sistema: o subconjunto ativo recebe as peças dele (a unidade hidráulica também entra no sistema hidráulico). */
function regrasDosSistemasPvc(): RegraVinculo[] {
  return (Object.keys(SISTEMAS_PVC) as SistemaPvc[]).map((s) => ({
    id: `golden-pvc-${s}`,
    descricao: `Injetoras PVC (Golden Eagle), ${s}: peças desse sistema`,
    equipamento: (e) => {
      const n = chave(e.denominacao);
      return !e.inativo && !e.desativado && /^INJ PVC \d+ GOLDEN /.test(n) && SISTEMAS_PVC[s].test(n);
    },
    material: (m) => {
      if (!m.material.trim() || chave(m.status) !== "APROVADO" || !materialGoldenPvc(m.descricaoCurta, m.descrCompleta, m.material)) return false;
      const q = sistemaGoldenPvc(m.descricaoCurta, m.material);
      return q === s || (s === "hidraulico" && q === "unidadeHidraulica");
    },
  }));
}

/** Modelo GEK 220 (220W/S, 220/S…) ou a sigla GEKK na descrição. */
export function modeloGek220(curta: string, completa: string): boolean {
  const mo = chave(/MODELO:\s*([^;]+)/i.exec(completa)?.[1] ?? "").replace(/\s/g, "");
  return /GEK220(?!\d)/.test(mo) || /\bGEKK\b|\bGEK ?220(?!\d)/.test(chave(`${curta} ${completa}`));
}

/** O campo MODELO da descrição completa é da família 180S da Golden Eagle (GEL/GEK, com ou sem barras e espaços). */
export function modelo180S(descrCompleta: string): boolean {
  const mo = chave(/MODELO:\s*([^;]+)/i.exec(descrCompleta)?.[1] ?? "").replace(/\s/g, "");
  return /(GEL|GEK|GOLDENEAGLE)(GEK)?180S(?!\d)/.test(mo);
}

/** {código do equipamento: {nome, materiais}} que as regras pedem (materiais sem repetição, em ordem). */
export function vinculosDasRegras(equips: (Pick<Equipamento, "equipamento" | "denominacao" | "inativo" | "desativado"> & { superior?: string })[],
  catalogo: Pick<ItemCatalogo, "material" | "descricaoCurta" | "descrCompleta" | "status">[], regras = REGRAS): Map<string, { nome: string; materiais: string[] }> {
  const out = new Map<string, { nome: string; materiais: string[] }>();
  // subconjunto de máquina inativa (em qualquer nível acima) também fica de fora
  const porCodigo = new Map(equips.map((e) => [e.equipamento, e]));
  const acimaInativo = (e: { superior?: string }) => {
    for (let s = e.superior, n = 0; s && n < 10; n++) {
      const p = porCodigo.get(s);
      if (!p) return false;
      if (p.inativo || p.desativado) return true;
      s = p.superior;
    }
    return false;
  };
  for (const r of regras) {
    const mats = [...new Set(catalogo.filter(r.material).map((m) => m.material.trim()))].sort();
    if (!mats.length) continue;
    for (const e of equips) {
      if (!r.equipamento(e) || acimaInativo(e)) continue;
      const x = out.get(e.equipamento) ?? { nome: e.denominacao, materiais: [] };
      x.materiais = [...new Set([...x.materiais, ...mats])].sort();
      out.set(e.equipamento, x);
    }
  }
  return out;
}

/** O item do cadastro com as peças da regra somadas (null = nada a acrescentar). */
export function comPecasDaRegra(atual: Record<string, unknown> | undefined, nome: string, materiais: string[]): Record<string, unknown> | null {
  const tem = new Set(Array.isArray(atual?.materiais) ? (atual!.materiais as unknown[]).map(String) : []);
  const novos = materiais.filter((m) => !tem.has(m));
  if (!novos.length) return null;
  const base = atual ?? { nome, categoria: "Mecânico", criticidade: "", observacoes: "", situacao: "Em operação" };
  return { ...base, materiais: [...tem, ...novos].sort() };
}
