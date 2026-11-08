import "server-only";

import { catalogo, estoque } from "@/lib/dados/bases";
import { camposGerais } from "@/lib/wcm/campoGeral";
import type { Contexto } from "@/lib/wcm/contexto";

import { guardar } from "../saude/calculo";
import { comListasDosSubconjuntos, listasPorEquipamento, listasPorPlano, listasDiretasDaIp19, type ListaTarefas } from "./ia06";
import { DESATIVADO, type LinhaAtivo } from "@/lib/wcm/ativos";
import { hashTexto } from "@/lib/wcm/util";

import { consumoMateriais } from "@/lib/dados/consumo";
import { consumoDe, type LinhaConsumo } from "@/lib/wcm/consumo";
import { dataBr } from "@/lib/wcm/util";

import { juntarSugestoes, sugerirAlocacoes, sugestoesPorConsumo, type AtivoTexto, type MaterialTexto, type Sugestao } from "./alocacao";
import { indexarMateriais, pecaMro, semZeros, type BaseMateriais } from "./logica";

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

/**
 * Sugestões da alocação automática (refeitas só quando um export do SAP ou o cadastro de equipamentos muda): primeiro as
 * do consumo real nas ordens (IW13), depois as do texto; o mesmo par ativo × material fica só com a de nível mais forte.
 */
export async function sugestoesAlocacao(c: Contexto, inv: LinhaAtivo[], bm: BaseMateriais, campos: Map<string, string>,
  jaVinculados: (ativo: string) => Set<string>): Promise<Sugestao[]> {
  const [e, cat, iw13] = await Promise.all([estoque(), catalogo(), consumoMateriais()]);
  const cad = hashTexto(JSON.stringify(c.cad.equipamentos)); // nomes, modelos e peças vinculadas
  return guardar(`aloc|${e.atualizado}|${cat.atualizado}|${iw13.atualizado}:${iw13.dados?.linhas ?? -1}|${c.b.equipamentos.atualizado}|${c.b.ordens.atualizado}|${inv.length}|${cad}`, () => {
    const { ativos, materiais } = textosParaAlocacao(inv, bm, campos);
    const vivos = new Set(inv.filter((a) => a.situacao !== DESATIVADO).map((a) => semZeros(a.codigo)));
    // o consumo vem com códigos sem zeros: volta ao código da lista (ativo) e ao da MB52/Sysmat (material)
    const codigo = new Map(inv.map((a) => [semZeros(a.codigo), a.codigo]));
    const codAtivo = (k: string) => codigo.get(semZeros(k)) ?? k;
    const codMat = (m: string) => codigoDaBase(m, bm);
    const conhecido = (m: string) => {
      const k = semZeros(m), ct = bm.cat?.get(k);
      if (ct) return !INATIVOS_SYSMAT.has(ct.status);
      return !!(bm.est?.get(m) ?? bm.est?.get(k));
    };
    const porConsumo = iw13.dados ? sugestoesPorConsumo(iw13.dados, (k) => vivos.has(semZeros(k)), conhecido, (k) => jaVinculados(codAtivo(k)), dataBr) : [];
    return juntarSugestoes(porConsumo, sugerirAlocacoes(ativos, materiais, jaVinculados), codAtivo, codMat);
  });
}

/**
 * Peças retiradas para ordens do ativo e dos subconjuntos dele (IW13), com o vínculo atual, o saldo da MB52 e o cadastro
 * do Sysmat. null = a base IW13 ainda não foi enviada.
 */
export async function consumoDoAtivo(c: Contexto, codigo: string, bm: BaseMateriais, vinculados: string[]):
  Promise<{ linhas: LinhaConsumo[] | null; periodo: string }> {
  const iw13 = await consumoMateriais();
  if (!iw13.dados) return { linhas: null, periodo: "" };
  // o ativo, os subconjuntos e os subconjuntos deles (dois níveis do IH08, nível a nível)
  const filhos = new Map<string, string[]>();
  for (const e of c.b.equipamentos.dados ?? []) if (e.superior) {
    const k = semZeros(e.superior);
    filhos.set(k, [...(filhos.get(k) ?? []), semZeros(e.equipamento)]);
  }
  const alvo = new Set([semZeros(codigo)]);
  let nivel = [semZeros(codigo)];
  for (let n = 0; n < 2 && nivel.length; n++) {
    nivel = nivel.flatMap((k) => filhos.get(k) ?? []).filter((k) => !alvo.has(k));
    for (const k of nivel) alvo.add(k);
  }
  const vinc = new Set(vinculados.map(semZeros));
  const linhas = consumoDe(iw13.dados, [...alvo]).map((it) => {
    const p = pecaMro(it.material, bm, c.cad.materiais as Record<string, unknown>);
    return { ...it, material: codigoDaBase(it.material, bm), descricao: it.descricao || p.descricao, um: it.um || p.um,
      vinculado: vinc.has(semZeros(it.material)), saldo: p.noMb52 ? p.estoque : null, umSaldo: p.um, cadastro: p.noSysmat ? p.cadastro : "" };
  });
  const { de, ate } = iw13.dados;
  return { linhas, periodo: de != null && ate != null ? `${dataBr(de)} a ${dataBr(ate)}` : "" };
}

/** O código do material como está na MB52 ou no catálogo (com os zeros que a base usa); senão, o próprio. */
function codigoDaBase(m: string, bm: BaseMateriais): string {
  const k = semZeros(m);
  return bm.est?.get(m)?.material ?? bm.est?.get(k)?.material ?? bm.cat?.get(k)?.material ?? m;
}
