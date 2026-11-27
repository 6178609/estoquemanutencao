/**
 * Custo dos materiais (preço médio e standard do SAP, base "custo_material") — funções puras, testadas em
 * testes/custoMaterial.test.ts. O preço que vale é o médio (moving average); zerado ou vazio, o standard; os dois
 * zerados ou vazios: "sem preço" (null). Valores absurdos não são corrigidos: aparecem como vieram do SAP.
 */
import { semZerosCodigo } from "../leitura/custoMaterial";
import { doAlmox } from "./materiais";
import { acharColuna, paraNumero, texto } from "./texto";

export interface PrecoMaterial {
  /** o preço que o site usa (médio; zerado, o standard); null = sem preço */
  preco: number | null;
  precoMedio: number | null;
  precoStandard: number | null;
  um: string;
}

/** Preços por código do material (sem zeros à esquerda). */
export type Precos = Map<string, PrecoMaterial>;

const positivo = (v: unknown): number | null => {
  const n = paraNumero(v);
  return Number.isFinite(n) && n > 0 ? n : null;
};

/** As linhas do parquet (colunas fixas do recorte; também aceita o export cru) → preço por material. */
export function prepararCusto(cru: Record<string, unknown>[]): Precos {
  const cols = cru.length ? Object.keys(cru[0]) : [];
  const mat = acharColuna(cols, ["^MATERIAL$"]);
  const med = acharColuna(cols, ["^PRECO MEDIO$", "MOVING AVERAGE PRICE", "PRECO MEDIO", "PRC MEDIO"]);
  const std = acharColuna(cols, ["^PRECO STANDARD$", "^PRC STANDARD$", "^STANDARD PRICE$"]);
  const um = acharColuna(cols, ["^UM$", "BASE UNIT OF MEASURE", "UNIDADE (DE )?MEDIDA"]);
  const dep = acharColuna(cols, ["^DEPOSITO$", "^STORAGE LOCATION$"]);
  const out: Precos = new Map();
  if (!mat) return out;
  for (const r of cru) {
    if (dep && !doAlmox(texto(r[dep]))) continue; // só o depósito do almoxarifado (I26)
    const codigo = semZerosCodigo(texto(r[mat]).toUpperCase());
    if (!codigo) continue;
    const precoMedio = med ? positivo(r[med]) : null, precoStandard = std ? positivo(r[std]) : null;
    const atual = out.get(codigo);
    // o mesmo material em mais de um depósito/linha: fica o primeiro preço que existir
    if (atual && atual.preco != null) continue;
    out.set(codigo, { preco: precoMedio ?? precoStandard, precoMedio, precoStandard, um: um ? texto(r[um]).toUpperCase() : atual?.um ?? "" });
  }
  return out;
}

/** Preço do material (código com ou sem zeros); null sem preço ou sem a base. */
export function precoDe(precos: Precos | null | undefined, codigo: string): number | null {
  if (!precos) return null;
  return precos.get(semZerosCodigo(String(codigo ?? "").trim().toUpperCase()))?.preco ?? null;
}

/** UMs que o SAP trata como a mesma (peça/unidade). */
const PECA = new Set(["UN", "UND", "UNID", "PC", "PÇ", "PEC", "PECA", "ST"]);
const normUm = (u: string) => {
  const s = String(u ?? "").trim().toUpperCase();
  return PECA.has(s) ? "PC" : s;
};
/** A UM da quantidade é a do preço? Sem uma das duas, aceita. */
export const mesmaUm = (a: string, b: string) => !a || !b || normUm(a) === normUm(b);

/**
 * Quantidade × preço do material; null quando não há preço ou a UM da quantidade (ex.: kit da UBM) é outra que a UM
 * básica do SAP (o preço é por UM básica: multiplicar daria valor errado).
 */
export function valorDe(precos: Precos | null | undefined, codigo: string, quantidade: number, umQtd = ""): number | null {
  if (!precos || !Number.isFinite(quantidade)) return null;
  const p = precos.get(semZerosCodigo(String(codigo ?? "").trim().toUpperCase()));
  if (!p || p.preco == null || !mesmaUm(umQtd, p.um)) return null;
  return Math.round(quantidade * p.preco * 100) / 100;
}

/** Soma dos valores (os sem preço ficam de fora e são contados). */
export function somarValores(valores: (number | null)[]): { total: number; semPreco: number } {
  let total = 0, semPreco = 0;
  for (const v of valores) if (v == null) semPreco++; else total += v;
  return { total: Math.round(total * 100) / 100, semPreco };
}

/** Os preços como objeto simples (para mandar a um componente do navegador): só os códigos pedidos. */
export function precosDosCodigos(precos: Precos | null | undefined, codigos: Iterable<string>): Record<string, number> {
  const out: Record<string, number> = {};
  if (!precos) return out;
  for (const c of codigos) {
    const p = precoDe(precos, c);
    if (p != null) out[c] = p;
  }
  return out;
}
