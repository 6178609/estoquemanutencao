import type { ItemEstoque } from "../dados/materiais";
import { semAcento } from "../dados/texto";
import type { Equipamento, Nota, Ordem } from "./preparo";
import type { CadastroEquip } from "./saude";
import type { Dia } from "./util";

/**
 * Busca global : um termo procurado de uma vez em ordens, notas, equipamentos,
 * materiais, planos e AFs. Todas as palavras do termo precisam aparecer (sem acento, maiúsculas); número igual
 * ao da ordem/nota/equipamento/material/campo de ordenação vem primeiro. Testado em testes/busca.test.ts.
 */

export const CATEGORIAS = ["Ordens", "Notas", "Equipamentos", "Materiais", "Planos", "Análises de falha"] as const;
export type Categoria = (typeof CATEGORIAS)[number];
export const LIMITE = 200;

export function normalizar(texto: unknown): string {
  return semAcento(texto == null ? "" : String(texto)).toUpperCase().trim();
}

// ----------------------------------------------------------------------------
// Entradas
// ----------------------------------------------------------------------------
/**
 * IW38 preparado + o "Campo de ordenação" do export (coluna extra que o preparo.ts não mapeia; o integrador
 * copia da linha crua — sem ele a busca pelo campo de ordenação não acha nada).
 */
export type OrdemBusca = Pick<Ordem, "ordem" | "tipo" | "texto" | "situacao" | "data" | "fim" | "equipamento" | "equipChave" |
  "objeto" | "local" | "plano" | "criadoPor" | "statusUsuario" | "centroTrabalho" | "localizacao" | "custoReal" | "natureza"> &
  { campoOrdenacao?: string };
export type NotaBusca = Pick<Nota, "nota" | "tipoNota" | "descricao" | "data" | "ordem" | "equipChave" | "objeto" | "local" |
  "centroTrabalho" | "localizacao" | "quebra">;
export type EquipBusca = Pick<Equipamento, "equipamento" | "denominacao" | "local" | "localizacao" | "codigoAbc">;
/** Chamada da IP19 classificada (planos.classificar). */
export interface ChamadaBusca {
  plano: string; texto: string; data: Dia | null; situacao: string; ordem: string; equipamento: string; objeto: string;
  centroTrabalho: string;
}
/** Análise de falha do Gerenciador de AF (af.preparar_afs): "Nº AF", "Data da falha", "Código SAP"… */
export interface AfBusca {
  numero: string; dataFalha: Dia | null; codigoSap: string; equipamento: string; resumo: string; situacao: string;
  criticidade: string; causaRaiz: string; area: string; osCorretiva: string;
}

export interface BasesBusca {
  ordens?: OrdemBusca[] | null;
  notas?: NotaBusca[] | null;
  equip?: EquipBusca[] | null;
  cadEq?: CadastroEquip | null;
  estoque?: ItemEstoque[] | null;
  chamadas?: ChamadaBusca[] | null;
  afs?: AfBusca[] | null;
}

/** Equipamento achado: IH08 ou só no cadastro do site, com a criticidade do site (vazia sem cadastro). */
export interface EquipAchado extends EquipBusca { criticidade: string }

export interface ResultadoBusca {
  Ordens: OrdemBusca[];
  Notas: NotaBusca[];
  Equipamentos: EquipAchado[];
  Materiais: ItemEstoque[];
  Planos: ChamadaBusca[];
  "Análises de falha": AfBusca[];
}

/** Campo → rótulo das colunas que a página mostra em cada categoria. */
export const COLUNAS: { [C in Categoria]: [keyof ResultadoBusca[C][number] & string, string][] } = {
  Ordens: [["ordem", "Ordem"], ["tipo", "Tipo"], ["texto", "Texto"], ["situacao", "Situação"], ["data", "Data"], ["fim", "Fim"],
    ["equipChave", "Equip. (chave)"], ["objeto", "Objeto técnico"], ["campoOrdenacao", "Campo de ordenação"],
    ["centroTrabalho", "Centro de trabalho"], ["localizacao", "Localização"], ["custoReal", "Custo real"], ["natureza", "Natureza"]],
  Notas: [["nota", "Nota"], ["tipoNota", "Tipo de nota"], ["descricao", "Descrição"], ["data", "Data"], ["ordem", "Ordem"],
    ["equipChave", "Equip. (chave)"], ["objeto", "Objeto técnico"], ["centroTrabalho", "Centro de trabalho"],
    ["localizacao", "Localização"], ["quebra", "Quebra"]],
  Equipamentos: [["equipamento", "Equipamento"], ["denominacao", "Denominação"], ["local", "Local de instalação"],
    ["localizacao", "Localização"], ["codigoAbc", "Código ABC"], ["criticidade", "Criticidade"]],
  Materiais: [["material", "Material"], ["descricao", "Descrição"], ["estoque", "Estoque"], ["um", "Unidade"], ["valor", "Valor"]],
  Planos: [["plano", "Plano"], ["texto", "Texto"], ["data", "Data"], ["situacao", "Situação"], ["ordem", "Ordem"],
    ["equipamento", "Equipamento"], ["objeto", "Objeto técnico"], ["centroTrabalho", "Centro de trabalho"]],
  "Análises de falha": [["numero", "Nº AF"], ["dataFalha", "Data da falha"], ["codigoSap", "Código SAP"],
    ["equipamento", "Equipamento"], ["resumo", "Resumo"], ["situacao", "Situação"], ["criticidade", "Criticidade"],
    ["causaRaiz", "Causa raiz"], ["osCorretiva", "OS corretiva"]],
};

const vazio = (): ResultadoBusca => ({ Ordens: [], Notas: [], Equipamentos: [], Materiais: [], Planos: [], "Análises de falha": [] });

/** Mais recente primeiro (sem data no fim). */
function porDataDesc<T>(xs: T[], dataDe: (x: T) => Dia | null): T[] {
  return [...xs].sort((a, b) => {
    const da = dataDe(a), db = dataDe(b);
    return da == null ? (db == null ? 0 : 1) : db == null ? -1 : db - da;
  });
}

const semZeros = (s: string) => s.replace(/^0+/, "");

/**
 * Registros em que todas as palavras do termo aparecem no texto de busca; os de número exato (campos `exatas`)
 * primeiro, mantendo a ordem de chegada; no máximo LIMITE.
 */
function filtrar<T>(xs: T[] | null | undefined, palheiro: (x: T) => (string | null | undefined)[], termo: string,
  exatas: (x: T) => (string | null | undefined)[]): T[] {
  if (!xs?.length || !termo) return [];
  const palavras = termo.split(/\s+/).filter(Boolean);
  const alvo = semZeros(termo.replace(/ /g, ""));
  const exatos: T[] = [], outros: T[] = [];
  for (const x of xs) {
    const h = normalizar(palheiro(x).map((v) => v ?? "").join(" "));
    if (!palavras.every((p) => h.includes(p))) continue;
    const exato = exatas(x).some((v) => semZeros(String(v ?? "")).toUpperCase() === alvo);
    (exato ? exatos : outros).push(x);
  }
  return [...exatos, ...outros].slice(0, LIMITE);
}

/** {categoria: resultados} — cada um com até LIMITE registros, os de número exato primeiro. */
export function buscar(termo: string, b: BasesBusca = {}): ResultadoBusca {
  const t = normalizar(termo);
  const r = vazio();
  if (t.replace(/ /g, "").length < 2) return r;

  // ordens: o texto de busca do IW38 (ordem, texto, equipamento, objeto, local, plano, criado por, status usuário)
  // completado com o campo de ordenação, o centro e o tipo
  if (b.ordens?.length)
    r.Ordens = filtrar(porDataDesc(b.ordens, (o) => o.data), (o) => [o.ordem, o.texto, o.equipamento, o.objeto, o.local,
      o.plano, o.criadoPor, o.statusUsuario, o.campoOrdenacao, o.centroTrabalho, o.tipo], t,
    (o) => [o.ordem, o.equipChave, o.campoOrdenacao]);

  if (b.notas?.length)
    r.Notas = filtrar(porDataDesc(b.notas, (n) => n.data), (n) => [n.nota, n.ordem, n.descricao, n.equipChave, n.objeto, n.local,
      n.tipoNota, n.centroTrabalho], t, (n) => [n.nota, n.ordem, n.equipChave]);

  // equipamentos do IH08 + os cadastrados no site que não estão nele
  const cadEq = b.cadEq ?? {};
  const doSite = (k: string) => {
    const i = cadEq[k];
    return i && typeof i === "object" && !Array.isArray(i) ? (i as Record<string, unknown>) : {};
  };
  const eq: EquipAchado[] = (b.equip ?? []).map((x) => ({ ...x, criticidade: String(doSite(x.equipamento).criticidade || "") }));
  const noSap = new Set(eq.map((x) => x.equipamento));
  for (const k of Object.keys(cadEq))
    if (!noSap.has(k))
      eq.push({ equipamento: k, denominacao: String(doSite(k).nome || ""), local: "", localizacao: "", codigoAbc: "",
        criticidade: String(doSite(k).criticidade || "") });
  r.Equipamentos = filtrar(eq, (x) => [x.equipamento, x.denominacao, x.local, x.localizacao], t, (x) => [x.equipamento]);

  r.Materiais = filtrar(b.estoque, (m) => [m.material, m.descricao], t, (m) => [m.material]);
  if (b.chamadas?.length)
    r.Planos = filtrar(porDataDesc(b.chamadas, (c) => c.data), (c) => [c.plano, c.texto, c.equipamento, c.objeto, c.ordem,
      c.centroTrabalho], t, (c) => [c.plano, c.ordem, c.equipamento]);
  if (b.afs?.length)
    r["Análises de falha"] = filtrar(porDataDesc(b.afs, (a) => a.dataFalha), (a) => [a.numero, a.codigoSap, a.equipamento,
      a.resumo, a.causaRaiz, a.area, a.osCorretiva], t, (a) => [a.numero, a.codigoSap, a.osCorretiva]);
  return r;
}

/** Total de resultados (o "N resultado(s)" da página). */
export function totalDeResultados(r: ResultadoBusca): number {
  return CATEGORIAS.reduce((s, c) => s + r[c].length, 0);
}
