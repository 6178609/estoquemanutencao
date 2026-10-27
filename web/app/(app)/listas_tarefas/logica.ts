/**
 * Aba Listas de tarefas: as linhas da tabela (uma por lista, com os vínculos), os filtros e o resumo. Funções puras,
 * testadas em testes/listasTarefas.test.ts.
 */
import { chave } from "@/lib/dados/texto";
import { ehTroca, rotuloCiclo, temasDoTexto, type EquipLista, type ListaLT } from "@/lib/wcm/listasTarefas";

export type Params = Record<string, string | string[] | undefined>;
export const um = (p: Params, k: string): string => { const v = p[k]; return (Array.isArray(v) ? v[0] : v ?? "").trim(); };
export const varios = (p: Params, k: string): string[] => um(p, k).split(",").map((x) => x.trim()).filter((x) => x && x !== "-");

export const V_GERAL = "geral", V_QUALIDADE = "qualidade";

export interface LinhaLista {
  lt: ListaLT;
  equipamentos: EquipLista[];
  /** documentos da biblioteca dos equipamentos (e dos superiores) da lista */
  manuais: number;
  temas: string[];
  trocas: number;
  frequencia: string;
  busca: string;
}

export function montarLinhas(listas: ListaLT[], equipamentos: (k: string) => EquipLista[], manuais: (eqs: EquipLista[]) => number,
  nome: (tag: string) => string): LinhaLista[] {
  return listas.map((lt) => {
    const eqs = equipamentos(lt.chave);
    const textos = lt.operacoes.map((o) => `${o.texto}\n${o.textoLongo}`);
    const temas = [...new Set(textos.flatMap((t) => temasDoTexto(t).map((x) => x.rotulo)))];
    return {
      lt, equipamentos: eqs, manuais: eqs.length ? manuais(eqs) : 0, temas, trocas: textos.filter(ehTroca).length,
      frequencia: rotuloCiclo(lt.cicloDias),
      busca: chave([lt.grupo, lt.titulo, ...textos, ...lt.centrosTrabalho, ...eqs.flatMap((e) => [e.equipamento, nome(e.equipamento), ...e.planos])].join(" ")),
    };
  });
}

export interface FiltroListas { q: string; centros: string[]; frequencias: string[]; gerais: boolean; semEquip: boolean; comTroca: boolean }

export function lerFiltro(p: Params): FiltroListas {
  return { q: um(p, "iq"), centros: varios(p, "ictr"), frequencias: varios(p, "ifreq"), gerais: um(p, "igeral") === "1",
    semEquip: um(p, "isem") === "1", comTroca: um(p, "itroca") === "1" };
}

export function filtrar(t: LinhaLista[], f: FiltroListas): LinhaLista[] {
  const termos = chave(f.q).split(/\s+/).filter(Boolean);
  return t.filter((x) => (!termos.length || termos.every((q) => x.busca.includes(q)))
    && (!f.centros.length || x.lt.centrosTrabalho.some((c) => f.centros.includes(c)))
    && (!f.frequencias.length || f.frequencias.includes(x.frequencia))
    && (!f.gerais || x.equipamentos.length > 1)
    && (!f.semEquip || !x.equipamentos.length)
    && (!f.comTroca || x.trocas > 0));
}

export interface ResumoListas {
  listas: number; operacoes: number; suboperacoes: number; horasAno: number; semEquipamento: number; gerais: number; trocas: number;
  comManual: number; horasPorCentro: { centro: string; horas: number; operacoes: number }[];
}

export function resumir(t: LinhaLista[]): ResumoListas {
  const porCentro = new Map<string, { horas: number; operacoes: number }>();
  for (const x of t) for (const o of x.lt.operacoes) {
    const c = o.centroTrabalho || "(sem centro)";
    const v = porCentro.get(c) ?? porCentro.set(c, { horas: 0, operacoes: 0 }).get(c)!;
    v.horas += o.horasAno ?? 0;
    v.operacoes++;
  }
  return {
    listas: t.length, operacoes: t.reduce((s, x) => s + x.lt.operacoes.length, 0), suboperacoes: t.reduce((s, x) => s + x.lt.suboperacoes.length, 0),
    horasAno: Math.round(t.reduce((s, x) => s + x.lt.horasAno, 0)), semEquipamento: t.filter((x) => !x.equipamentos.length).length,
    gerais: t.filter((x) => x.equipamentos.length > 1).length, trocas: t.reduce((s, x) => s + x.trocas, 0),
    comManual: t.filter((x) => x.manuais > 0).length,
    horasPorCentro: [...porCentro].map(([centro, v]) => ({ centro, horas: Math.round(v.horas * 10) / 10, operacoes: v.operacoes }))
      .sort((a, b) => b.horas - a.horas),
  };
}

/** Contagem para as opções dos filtros (valor → quantas listas). */
export function contar(valores: string[][]): { valor: string; n: number }[] {
  const m = new Map<string, number>();
  for (const vs of valores) for (const v of new Set(vs)) if (v) m.set(v, (m.get(v) ?? 0) + 1);
  return [...m].map(([valor, n]) => ({ valor, n })).sort((a, b) => b.n - a.n || a.valor.localeCompare(b.valor));
}

/** Endereço da ficha da lista. */
export const hrefFicha = (lt: { grupo: string; numerador: string }) => `/listas_tarefas/lista?${new URLSearchParams({ g: lt.grupo, n: lt.numerador })}`;

// ---------------------------------------------------------------------------------------- materiais × listas

export const V_MATERIAIS = "materiais";

export interface FiltroMateriais { q: string; tipos: string[]; situacoes: string[]; manual: string[]; faltaIncluir: boolean; semEstoque: boolean }

export function lerFiltroMateriais(p: Params): FiltroMateriais {
  return { q: um(p, "mq"), tipos: varios(p, "mtipo"), situacoes: varios(p, "msit"), manual: varios(p, "mman"),
    faltaIncluir: um(p, "mfalta") === "1", semEstoque: um(p, "mest") === "1" };
}

/** Linhas do cruzamento que passam nos filtros (busca em código, descrição, equipamento, lista e operação). */
export function filtrarMateriais<T extends { codigo: string; descricao: string; tipo: string; situacao: string; manual: string;
  statusEstoque: string; equipamento: string; raiz: string; lista: string | null; operacao: string }>(t: T[], f: FiltroMateriais, nome: (tag: string) => string): T[] {
  const termos = chave(f.q).split(/\s+/).filter(Boolean);
  return t.filter((x) => (!termos.length || termos.every((q) => chave(`${x.codigo} ${x.descricao} ${x.equipamento} ${nome(x.equipamento)} ${nome(x.raiz)} ${x.lista ?? ""} ${x.operacao}`).includes(q)))
    && (!f.tipos.length || f.tipos.includes(x.tipo)) && (!f.situacoes.length || f.situacoes.includes(x.situacao))
    && (!f.manual.length || f.manual.includes(x.manual))
    && (!f.faltaIncluir || x.situacao === "sugerida")
    && (!f.semEstoque || x.statusEstoque === "zerado" || x.statusEstoque === "ausente"));
}

/** Quantos materiais (vínculos material × equipamento) cada lista tem: já no SAP + sugeridos. */
export function materiaisPorLista(t: { lista: string | null; situacao: string }[]): Map<string, { naLista: number; sugeridos: number }> {
  const m = new Map<string, { naLista: number; sugeridos: number }>();
  for (const x of t) {
    if (!x.lista || (x.situacao !== "na-lista" && x.situacao !== "sugerida")) continue;
    const v = m.get(x.lista) ?? m.set(x.lista, { naLista: 0, sugeridos: 0 }).get(x.lista)!;
    if (x.situacao === "na-lista") v.naLista++; else v.sugeridos++;
  }
  return m;
}
