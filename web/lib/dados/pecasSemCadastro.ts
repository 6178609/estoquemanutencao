/**
 * Peças sem cadastro no Sysmat: itens do equipamento que ainda não têm código de material (achados no manual, num
 * desenho do fabricante ou na manutenção). Ficam no item do cadastro de equipamentos, em `pecas_sem_cadastro`, e servem
 * de lista para pedir o cadastro. Funções puras (testes/pecasSemCadastro.test.ts).
 */
export interface PecaSemCadastro {
  id: string; descricao: string; referencia: string; fabricante: string; quantidade: string; origem: string; em: string; por: string;
}

export const MAX_SEM_CADASTRO = 300;
const LIMITES = { descricao: 120, referencia: 80, fabricante: 60, quantidade: 20, origem: 120 } as const;

const limpar = (v: unknown, max: number) => String(v ?? "").replace(/[\u0000-\u001f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);

/** A lista gravada no item (tolerante a lixo: só entradas com id e descrição). */
export function pecasSemCadastroDe(item: Record<string, unknown> | undefined): PecaSemCadastro[] {
  const l = item?.pecas_sem_cadastro;
  if (!Array.isArray(l)) return [];
  return l.filter((x): x is Record<string, unknown> => !!x && typeof x === "object")
    .map((x) => ({ id: String(x.id ?? ""), descricao: String(x.descricao ?? ""), referencia: String(x.referencia ?? ""), fabricante: String(x.fabricante ?? ""),
      quantidade: String(x.quantidade ?? ""), origem: String(x.origem ?? ""), em: String(x.em ?? ""), por: String(x.por ?? "") }))
    .filter((x) => x.id && x.descricao);
}

/** Valida o que veio do formulário; devolve a peça limpa (sem id/em/por) ou o erro em português. */
export function validarPecaSemCadastro(f: Record<string, unknown>): { erro: string } | Omit<PecaSemCadastro, "id" | "em" | "por"> {
  const p = {
    descricao: limpar(f.descricao, LIMITES.descricao), referencia: limpar(f.referencia, LIMITES.referencia),
    fabricante: limpar(f.fabricante, LIMITES.fabricante), quantidade: limpar(f.quantidade, LIMITES.quantidade), origem: limpar(f.origem, LIMITES.origem),
  };
  if (p.descricao.length < 3) return { erro: "Descreva a peça (pelo menos 3 letras)." };
  return p;
}

/** O item com a peça somada (null = já existe a mesma descrição + referência, ou a lista está cheia). */
export function comPecaSemCadastro(item: Record<string, unknown> | undefined, nome: string, p: Omit<PecaSemCadastro, "id" | "em" | "por">,
  id: string, em: string, por: string): Record<string, unknown> | null {
  const atual = pecasSemCadastroDe(item);
  const chave = (x: { descricao: string; referencia: string }) => `${x.descricao}|${x.referencia}`.toUpperCase();
  if (atual.length >= MAX_SEM_CADASTRO || atual.some((x) => chave(x) === chave(p))) return null;
  const base = item ?? { nome, categoria: "Mecânico", criticidade: "", observacoes: "", situacao: "Em operação" };
  return { ...base, pecas_sem_cadastro: [...atual, { id, ...p, em, por }] };
}

/** O item sem a peça (null = não estava lá). */
export function semPecaSemCadastro(item: Record<string, unknown> | undefined, id: string): Record<string, unknown> | null {
  const atual = pecasSemCadastroDe(item);
  if (!item || !atual.some((x) => x.id === id)) return null;
  const resto = atual.filter((x) => x.id !== id);
  const { pecas_sem_cadastro: _, ...semLista } = item;
  void _;
  return resto.length ? { ...item, pecas_sem_cadastro: resto } : semLista;
}
