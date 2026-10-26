import "server-only";

import { catalogo, estoque } from "@/lib/dados/bases";
import { camposGerais } from "@/lib/wcm/campoGeral";
import type { Contexto } from "@/lib/wcm/contexto";

import { guardar } from "../saude/calculo";
import { comListasDosSubconjuntos, listasPorEquipamento, listasPorPlano, listasDiretasDaIp19, type ListaTarefas } from "./ia06";
import { DESATIVADO, type LinhaAtivo } from "@/lib/wcm/ativos";
import { hashTexto } from "@/lib/wcm/util";

import { sugerirAlocacoes, type AtivoTexto, type MaterialTexto, type Sugestao } from "./alocacao";
import { indexarMateriais, semZeros, type BaseMateriais } from "./logica";

const INATIVOS_SYSMAT = new Set(["BLOQUEADO", "CANCELADO", "DUPLICADO"]);

/** MB52 + catálogo Sysmat indexados por código (refeito só quando um dos dois exports muda). */
export async function baseMateriais(): Promise<BaseMateriais> {
  const [e, c] = await Promise.all([estoque(), catalogo()]);
  const chave = `mro|${e.atualizado}:${e.dados?.length ?? -1}:${e.erro ?? ""}|${c.atualizado}:${c.dados?.length ?? -1}:${c.erro ?? ""}`;
  return guardar(chave, () => indexarMateriais(e.dados, c.dados));
}

/** Campo de ordenação de cada equipamento (o geral, o mesmo de todas as abas). */
export async function camposDosAtivos(c: Contexto): Promise<Map<string, string>> {
  return camposGerais(c);
}

/**
 * Listas de tarefas (grupo + numerador) de cada equipamento: os planos dele pelas ordens do IW38 e pela coluna Equipamento
 * da IP19, × grupo/numerador da IP19; a máquina recebe também as listas dos subconjuntos dela.
 */
export async function listasDosAtivos(c: Contexto): Promise<Map<string, ListaTarefas[]>> {
  const ordens = c.b.ordens.dados ?? [], ip19 = c.b.cruas.ip19, eqs = c.b.equipamentos;
  return guardar(`mro-listas|${c.b.ordens.atualizado}:${ordens.length}|${ip19.atualizado}:${ip19.dados?.length ?? -1}|${eqs.atualizado}:${eqs.dados?.length ?? -1}`,
    () => comListasDosSubconjuntos(listasPorEquipamento(ordens, listasPorPlano(ip19.dados), listasDiretasDaIp19(ip19.dados)), eqs.dados ?? []));
}

/** Ativos e materiais (MB52 + catálogo Sysmat) no formato da alocação automática. */
function textosParaAlocacao(inv: LinhaAtivo[], bm: BaseMateriais, campos: Map<string, string>): { ativos: AtivoTexto[]; materiais: MaterialTexto[] } {
  const ativos: AtivoTexto[] = inv.map((a) => ({ codigo: a.codigo, nome: a.equipamento, campo: campos.get(a.codigo) ?? "", fabricante: a.fabricante,
    modelo: a.modelo, desativado: a.situacao === DESATIVADO }));
  const materiais = new Map<string, MaterialTexto>();
  // o catálogo inteiro (só cadastros ativos) e o que está no MB52 sem catálogo
  for (const c of bm.cat?.values() ?? []) if (c.material && !INATIVOS_SYSMAT.has(c.status))
    materiais.set(semZeros(c.material), { codigo: semZeros(c.material), descricao: c.descricaoCurta, descrCompleta: c.descrCompleta });
  for (const [cod, e] of bm.est ?? []) if (cod === e.material && !materiais.has(semZeros(cod)))
    materiais.set(semZeros(cod), { codigo: semZeros(cod), descricao: e.descricao, descrCompleta: "" });
  return { ativos, materiais: [...materiais.values()] };
}

/** Sugestões da alocação automática (refeitas só quando um export do SAP ou o cadastro de equipamentos muda). */
export async function sugestoesAlocacao(c: Contexto, inv: LinhaAtivo[], bm: BaseMateriais, campos: Map<string, string>,
  jaVinculados: (ativo: string) => Set<string>): Promise<Sugestao[]> {
  const [e, cat] = await Promise.all([estoque(), catalogo()]);
  const cad = hashTexto(JSON.stringify(c.cad.equipamentos)); // nomes, modelos e peças vinculadas
  return guardar(`aloc|${e.atualizado}|${cat.atualizado}|${c.b.equipamentos.atualizado}|${c.b.ordens.atualizado}|${inv.length}|${cad}`, () => {
    const { ativos, materiais } = textosParaAlocacao(inv, bm, campos);
    return sugerirAlocacoes(ativos, materiais, jaVinculados);
  });
}
