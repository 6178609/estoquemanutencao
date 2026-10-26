/**
 * Regras de vínculo automático de peças a equipamentos — as regras e a conta são puras (testes/regrasVinculo.test.ts);
 * a gravação fica em regrasVinculoGravar.ts. A regra só ACRESCENTA peças ao cadastro do equipamento (o que foi
 * vinculado à mão fica) e só em equipamento ativo no SAP.
 *
 * Regras atuais (materiais aprovados no catálogo do Sysmat):
 * - injetoras KCLKA da EXP 12 em diante: os materiais com referência EK3 (modelo EK3-6E2/10E2);
 * - injetoras Golden Eagle 01 a 12 (UGB1): os materiais do modelo 180S (GEL 180/S, GEK 180/S, GEL/GEK 180/S…; não
 *   GEL 180, GEL 180L nem GEK 180/700/S);
 * - injetoras PVC (Golden Eagle): os materiais do modelo GEK 220 / GEKK (GEK 220W/S, GEK 220, GEK 220/S);
 * - injetoras Tien Kang (2 estações): os materiais com TIEN KANG no descritivo;
 * - Pan Stone (máquinas com o código JOB no nome): os materiais com PAN STONE e JOB no descritivo;
 * - Banbury Bonfanti (UGB1): os materiais Bonfanti do misturador BMI-80 (BMI-80T, MIXER BMI80, Banbury 80 L);
 * - prensa a vácuo: os materiais do modelo KCLKA EK76 (EK76A-10, EK76-10).
 */
import { chave } from "./texto";
import type { ItemCatalogo } from "./materiais";
import type { Equipamento } from "../wcm/preparo";

export interface RegraVinculo {
  id: string; descricao: string;
  equipamento: (e: Pick<Equipamento, "denominacao" | "inativo" | "desativado">) => boolean;
  material: (m: Pick<ItemCatalogo, "material" | "descricaoCurta" | "descrCompleta" | "status">) => boolean;
}

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
    id: "golden-pvc-gek220",
    descricao: "Injetoras PVC (Golden Eagle): materiais do modelo GEK 220 / GEKK aprovados no Sysmat",
    equipamento: (e) => !e.inativo && !e.desativado && /^INJETORA PVC GOLDEN EAGLE \d+$/.test(chave(e.denominacao)),
    material: (m) => !!m.material.trim() && chave(m.status) === "APROVADO" && modeloGek220(m.descricaoCurta, m.descrCompleta),
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
export function vinculosDasRegras(equips: Pick<Equipamento, "equipamento" | "denominacao" | "inativo" | "desativado">[],
  catalogo: Pick<ItemCatalogo, "material" | "descricaoCurta" | "descrCompleta" | "status">[], regras = REGRAS): Map<string, { nome: string; materiais: string[] }> {
  const out = new Map<string, { nome: string; materiais: string[] }>();
  for (const r of regras) {
    const mats = [...new Set(catalogo.filter(r.material).map((m) => m.material.trim()))].sort();
    if (!mats.length) continue;
    for (const e of equips) {
      if (!r.equipamento(e)) continue;
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
