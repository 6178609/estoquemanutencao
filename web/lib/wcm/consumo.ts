import { chave, paraNumero, texto } from "../dados/texto";
import { paraData, type Dia } from "./util";

/**
 * Consumo real de materiais nas ordens (export IW13 do SAP: Ordem, Material, Reservado, Tomados, Texto breve material,
 * Equipamento, Data de lançamento…). É a única base que liga material × ordem × equipamento: o que de fato saiu do
 * almoxarifado para cada equipamento. Consumo = quantidade "Tomados" > 0; reserva sem retirada conta à parte.
 * Testado em testes/consumo.test.ts.
 */
export interface ItemConsumo {
  material: string;
  descricao: string;
  um: string;
  /** ordens distintas com retirada (Tomados > 0) */
  ordens: number;
  /** quantidade total retirada */
  quantidade: number;
  /** data da última retirada (lançamento) */
  ultima: Dia | null;
  /** ordens só com reserva (sem retirada) */
  reservas: number;
}

/** Item do consumo com o vínculo atual, o saldo da MB52 e o cadastro do Sysmat (tela do ativo). */
export interface LinhaConsumo extends ItemConsumo {
  /** já vinculado ao ativo na Gestão de MRO */
  vinculado: boolean;
  /** saldo livre na MB52 (null = fora do almoxarifado) e a UM dela */
  saldo: number | null;
  umSaldo: string;
  /** situação do cadastro no Sysmat (Ativo, Bloqueado…) */
  cadastro: string;
}

export interface Consumo {
  /** equipamento (sem zeros à esquerda) → materiais consumidos, do mais usado para o menos */
  porEquipamento: Map<string, ItemConsumo[]>;
  /** material → quantos equipamentos diferentes tiveram retirada dele (material de uso geral aparece em muitos) */
  ativosPorMaterial: Map<string, number>;
  linhas: number;
  de: Dia | null;
  ate: Dia | null;
}

const semZeros = (c: string) => c.replace(/^0+/, "") || c;

/** Índice da 1ª coluna cujo nome (normalizado) casa com o padrão. */
function coluna(cols: string[], rx: RegExp): string | null {
  return cols.find((c) => rx.test(chave(c))) ?? null;
}

export function prepararConsumo(linhas: Record<string, unknown>[]): Consumo {
  const cols = linhas.length ? Object.keys(linhas[0]) : [];
  const cOrdem = coluna(cols, /^ORDEM$/), cMat = coluna(cols, /^MATERIAL$/), cRes = coluna(cols, /^RESERVADO$/);
  const cTom = coluna(cols, /^TOMADOS$/), cTxt = coluna(cols, /^TEXTO BREVE MATERIAL$/), cEq = coluna(cols, /^EQUIPAMENTO$/);
  const cData = coluna(cols, /^DATA DE LANCAMENTO$|^DATA LANCAMENTO$/);
  // a IW13 tem duas colunas UM (a da reserva e a da retirada); a da retirada vem depois de Tomados
  const ums = cols.filter((c) => /^UM(\.\d+)?$/.test(chave(c).replace(/\s/g, "")) || /^UM( \d+)?$/.test(chave(c)));
  const cUm = ums[0] ?? null, cUm2 = ums[1] ?? null;
  type Acc = ItemConsumo & { ordensSet: Set<string>; reservaSet: Set<string> };
  const por = new Map<string, Map<string, Acc>>();
  let de: Dia | null = null, ate: Dia | null = null, n = 0;
  for (const l of linhas) {
    const mat = semZeros(texto(cMat ? l[cMat] : ""));
    const eq = semZeros(texto(cEq ? l[cEq] : ""));
    const ordem = semZeros(texto(cOrdem ? l[cOrdem] : ""));
    if (!mat || !eq || !ordem) continue;
    n++;
    const tom = paraNumero(cTom ? l[cTom] : ""), res = paraNumero(cRes ? l[cRes] : "");
    const d = cData ? paraData(l[cData]) : null;
    let m = por.get(eq);
    if (!m) por.set(eq, (m = new Map()));
    let a = m.get(mat);
    if (!a) {
      a = { material: mat, descricao: texto(cTxt ? l[cTxt] : ""), um: texto(cUm2 ? l[cUm2] : "") || texto(cUm ? l[cUm] : ""),
        ordens: 0, quantidade: 0, ultima: null, reservas: 0, ordensSet: new Set(), reservaSet: new Set() };
      m.set(mat, a);
    }
    if (!a.descricao) a.descricao = texto(cTxt ? l[cTxt] : "");
    if (!a.um) a.um = texto(cUm2 ? l[cUm2] : "") || texto(cUm ? l[cUm] : "");
    if (Number.isFinite(tom) && tom > 0) {
      a.ordensSet.add(ordem);
      a.quantidade += tom;
      if (d != null) {
        if (a.ultima == null || d > a.ultima) a.ultima = d;
        if (de == null || d < de) de = d;
        if (ate == null || d > ate) ate = d;
      }
    } else if (Number.isFinite(res) && res > 0) a.reservaSet.add(ordem);
  }
  const porEquipamento = new Map<string, ItemConsumo[]>();
  const ativosPorMaterial = new Map<string, number>();
  for (const [eq, m] of por) {
    const itens: ItemConsumo[] = [];
    for (const a of m.values()) {
      const reservas = [...a.reservaSet].filter((o) => !a.ordensSet.has(o)).length;
      if (!a.ordensSet.size && !reservas) continue;
      if (a.ordensSet.size) ativosPorMaterial.set(a.material, (ativosPorMaterial.get(a.material) ?? 0) + 1);
      itens.push({ material: a.material, descricao: a.descricao, um: a.um, ordens: a.ordensSet.size,
        quantidade: Math.round(a.quantidade * 1000) / 1000, ultima: a.ultima, reservas });
    }
    if (itens.length) porEquipamento.set(eq, ordenar(itens));
  }
  return { porEquipamento, ativosPorMaterial, linhas: n, de, ate };
}

function ordenar(itens: ItemConsumo[]): ItemConsumo[] {
  return itens.sort((a, b) => b.ordens - a.ordens || (b.ultima ?? 0) - (a.ultima ?? 0) || a.material.localeCompare(b.material));
}

/** O consumo de vários equipamentos somado (a máquina + os subconjuntos dela), por material. */
export function consumoDe(c: Consumo | null, equipamentos: string[]): ItemConsumo[] {
  if (!c) return [];
  const acc = new Map<string, ItemConsumo>();
  for (const e of new Set(equipamentos.map(semZeros))) {
    for (const it of c.porEquipamento.get(e) ?? []) {
      const a = acc.get(it.material);
      if (!a) { acc.set(it.material, { ...it }); continue; }
      // ordens de equipamentos diferentes são ordens diferentes
      a.ordens += it.ordens;
      a.reservas += it.reservas;
      a.quantidade = Math.round((a.quantidade + it.quantidade) * 1000) / 1000;
      if (it.ultima != null && (a.ultima == null || it.ultima > a.ultima)) a.ultima = it.ultima;
      if (!a.descricao) a.descricao = it.descricao;
      if (!a.um) a.um = it.um;
    }
  }
  return ordenar([...acc.values()]);
}
