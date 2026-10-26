/**
 * Regras de vínculo automático de peças a equipamentos — as regras e a conta são puras (testes/regrasVinculo.test.ts);
 * a gravação fica em regrasVinculoGravar.ts. A regra só ACRESCENTA peças ao cadastro do equipamento (o que foi
 * vinculado à mão fica) e só em equipamento ativo no SAP.
 *
 * Regra atual: injetoras KCLKA da EXP 12 em diante recebem todos os materiais com referência EK3 (modelo
 * EK3-6E2/10E2) aprovados no catálogo do Sysmat.
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
];

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
