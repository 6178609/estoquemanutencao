/**
 * Estoque (MB52) e catálogo de materiais (Sysmat) — funções puras, testadas em testes/materiais.test.ts.
 */
import { fotosDoCadastro } from "../fotoMaterial";
import { acharColuna, paraNumero, texto } from "./texto";

export type Linha = Record<string, unknown>;

export interface ItemEstoque {
  material: string;
  descricao: string;
  um: string;
  estoque: number;
  valor: number;
  depositos: string;
}

export interface ItemCatalogo {
  material: string; // código Alpargatas (= código do material no SAP)
  sysmat: string;
  substituto: string;
  ncm: string;
  um: string;
  categoria: string;
  subcategoria: string;
  pdm: string;
  descricaoCurta: string;
  descrCompleta: string; // a informação técnica
  fabricanteRef: string;
  status: string;
}

export const ATIVOS = ["APROVADO", "INVENTARIO", "CONTROLADORIA", "INCLUSAO", "APR CADASTRO", "SOLIC CADASTRO",
  "VALIDACAO", "COMPLETO"];
export const INATIVOS = ["BLOQUEADO", "CANCELADO", "DUPLICADO"];
const VAZIOS = new Set(["(SEM CATEGORIA)", "(SEM SUBCATEGORIA)"]);

function colunasDe(linhas: Linha[]): string[] {
  return linhas.length ? Object.keys(linhas[0]) : [];
}

export function prepararMb52(cru: Linha[]): { resumo: ItemEstoque[]; detalhe: (ItemEstoque & { deposito: string })[] } {
  const cols = colunasDe(cru);
  const mat = acharColuna(cols, ["^MATERIAL$", "CODIGO", "MATERIAL"], "TEXTO|DESCR|TIPO|GRUPO");
  if (!mat) throw new Error("coluna de código do material não encontrada no MB52");
  const desc = acharColuna(cols, ["TEXTO BREVE", "DESCRICAO", "TEXTO"]);
  const dep = acharColuna(cols, ["^DEPOSITO$", "DEPOSITO"], "DENOMINACAO|DESCR");
  const um = acharColuna(cols, ["UNIDADE MEDIDA", "^UMB$", "^UM$", "UNID"]);
  const qtd = acharColuna(cols, ["UTILIZACAO LIVRE", "UTILIZ LIVRE", "LIVRE UTILIZ", "^ESTOQUE$", "ESTOQUE",
    "QUANTIDADE", "DISPONIVEL"], "VALOR|MOEDA");
  const val = acharColuna(cols, ["VALOR UTILIZ", "VALOR.*LIVRE", "^VALOR$", "VALOR"]);

  const detalhe = [];
  for (const r of cru) {
    const material = texto(r[mat]);
    if (!material) continue;
    const q = qtd ? paraNumero(r[qtd]) : 0;
    const v = val ? paraNumero(r[val]) : 0;
    detalhe.push({
      material, descricao: desc ? texto(r[desc]) : "", deposito: dep ? texto(r[dep]) : "", um: um ? texto(r[um]) : "",
      estoque: Number.isNaN(q) ? 0 : q, valor: Number.isNaN(v) ? 0 : v, depositos: "",
    });
  }
  const porMat = new Map<string, ItemEstoque & { _deps: Set<string> }>();
  for (const d of detalhe) {
    const a = porMat.get(d.material);
    if (!a) porMat.set(d.material, { ...d, _deps: new Set(d.deposito ? [d.deposito] : []) });
    else {
      a.estoque += d.estoque;
      a.valor += d.valor;
      if (d.deposito) a._deps.add(d.deposito);
    }
  }
  const resumo = [...porMat.values()].map(({ _deps, ...r }) => ({ ...r, depositos: [..._deps].sort().join(", ") }));
  return { resumo, detalhe };
}

const ORIGEM: Record<keyof Omit<ItemCatalogo, "fabricanteRef">, string[]> = {
  material: ["^CODIGO ?ALPARGATAS$"], sysmat: ["^CODIGO ?SYSMAT$"], substituto: ["^CODIGO ?ALPARGATAS ?PARA$"],
  ncm: ["^NCM$"], um: ["^UN BASICA$", "^UN$", "UNIDADE"], categoria: ["^CATEGORIA$"],
  subcategoria: ["^SUB ?CATEGORIA$"], pdm: ["^PDM$"], descricaoCurta: ["^DESCR(ICAO)? CURTA$"],
  descrCompleta: ["^DESCR(ICAO)? COMPLETA$"], status: ["^STATUS$"],
};

const FAB = /FAB:\s*([^;]*?)\s*-\s*REF:\s*([^;]*?)\s*(?:;|\.?$)/gi;

/** "…; FAB: SKF - REF: 6205-2Z." → "SKF 6205-2Z" (vários fabricantes separados por " | "). */
export function fabricanteRef(info: string): string {
  const pares: string[] = [];
  for (const m of (info || "").matchAll(FAB)) {
    const limpar = (s: string) => s.trim().replace(/^[ .*]+|[ .*]+$/g, "");
    const par = [limpar(m[1]), limpar(m[2])].filter(Boolean).join(" ");
    if (par && !pares.includes(par)) pares.push(par);
  }
  return pares.join(" | ");
}

/** A Descr Completa quebrada nos atributos (um por linha), sem os "*****" de campo vazio. */
export function linhasTecnicas(info: string): string[] {
  return String(info || "")
    .trim()
    .split(/\s*;\s*/)
    .map((p) => p.trim().replace(/^[ .]+|[ .]+$/g, ""))
    .filter((p) => p && !/^[A-Z ]+:\s*\**$/.test(p));
}

export function prepararCatalogo(cru: Linha[]): ItemCatalogo[] {
  const cols = colunasDe(cru);
  const de = Object.fromEntries(Object.entries(ORIGEM).map(([k, p]) => [k, acharColuna(cols, p)])) as Record<
    string, string | null>;
  const todos: ItemCatalogo[] = [];
  for (const r of cru) {
    const it = Object.fromEntries(Object.keys(ORIGEM).map((k) => [k, de[k] ? texto(r[de[k]!]) : ""])) as unknown as
      ItemCatalogo;
    if (VAZIOS.has(it.categoria)) it.categoria = "";
    if (VAZIOS.has(it.subcategoria)) it.subcategoria = "";
    it.status = it.status.toUpperCase().trim();
    it.fabricanteRef = fabricanteRef(it.descrCompleta);
    if (it.material || it.sysmat) todos.push(it);
  }
  // código Alpargatas repetido: vale a linha ativa (aprovado antes de bloqueado/cancelado)
  const escolhido = new Map<string, number>();
  todos.forEach((it, i) => {
    if (!it.material) return;
    const j = escolhido.get(it.material);
    if (j === undefined || (!ATIVOS.includes(todos[j].status) && ATIVOS.includes(it.status))) escolhido.set(it.material, i);
  });
  return todos.filter((it, i) => !it.material || escolhido.get(it.material) === i);
}

export type SituacaoCadastro = "Ativo" | "Bloqueado" | "Cancelado" | "Duplicado" | "Não encontrado no Sysmat" | "Sem catálogo";

export interface ItemAlmox extends ItemEstoque {
  minimo: number | null;
  situacao: "Zerado" | "Abaixo do mínimo" | "OK";
  cadastro: SituacaoCadastro;
  sysmat: string;
  categoria: string;
  subcategoria: string;
  ncm: string;
  descrCompleta: string;
  fabricanteRef: string;
  status: string;
  substituto: string;
  /** A foto principal (a 1ª de `fotos`). */
  foto: string | null;
  /** Todas as fotos do material, na ordem (a 1ª é a principal; até 8). */
  fotos: string[];
  usadoEm: string;
}

const semZeros = (c: string) => c.replace(/^0+/, "");

function situacaoCadastro(achou: boolean, status: string): SituacaoCadastro {
  if (!achou) return "Não encontrado no Sysmat";
  if (!INATIVOS.includes(status)) return "Ativo";
  return (status.charAt(0) + status.slice(1).toLowerCase()) as SituacaoCadastro;
}

/** MB52 com o catálogo (pelo código Alpargatas, sem zeros à esquerda), o mínimo e as fotos do cadastro. */
export function montarAlmox(
  estoque: ItemEstoque[],
  catalogo: ItemCatalogo[] | null,
  cadMat: Record<string, Record<string, unknown>>,
  usoPorMaterial: Map<string, string[]> = new Map(),
): ItemAlmox[] {
  const ref = new Map<string, ItemCatalogo>();
  for (const c of catalogo || []) if (c.material && !ref.has(semZeros(c.material))) ref.set(semZeros(c.material), c);
  return estoque.map((e) => {
    const c = ref.get(semZeros(e.material));
    const info = cadMat[e.material] || {};
    const minimoBruto = info.minimo;
    const minimo = typeof minimoBruto === "number" && Number.isFinite(minimoBruto) ? minimoBruto : null;
    const fotos = fotosDoCadastro(info);
    const situacao = e.estoque <= 0 ? "Zerado" : minimo !== null && e.estoque < minimo ? "Abaixo do mínimo" : "OK";
    return {
      ...e, minimo, situacao,
      cadastro: catalogo ? situacaoCadastro(!!c, c?.status || "") : "Sem catálogo",
      sysmat: c?.sysmat || "", categoria: c?.categoria || "", subcategoria: c?.subcategoria || "", ncm: c?.ncm || "",
      descrCompleta: c?.descrCompleta || "", fabricanteRef: c?.fabricanteRef || "", status: c?.status || "",
      substituto: c?.substituto || "", foto: fotos[0] ?? null, fotos,
      usadoEm: (usoPorMaterial.get(e.material) || []).join(", "),
    };
  });
}

/** Quanto do mínimo o estoque cobre, de 0 a 100%. Sem mínimo (ausente ou zero), não há cobertura: null. */
export function cobertura(estoque: number, minimo: number | null): number | null {
  if (minimo == null || minimo <= 0) return null;
  return Math.round(Math.min(1, Math.max(0, estoque / minimo)) * 100);
}

/** Quais equipamentos (cadastro do site) usam cada material: "TAG (criticidade)". */
export function usoDosMateriais(cadEq: Record<string, Record<string, unknown>>): Map<string, string[]> {
  const uso = new Map<string, string[]>();
  for (const [tag, v] of Object.entries(cadEq)) {
    const mats = Array.isArray(v?.materiais) ? (v.materiais as unknown[]) : [];
    for (const m of new Set(mats.map(String))) {
      if (!uso.has(m)) uso.set(m, []);
      uso.get(m)!.push(`${tag} (${(v.criticidade as string) || "?"})`);
    }
  }
  return uso;
}
