import "server-only";

import { catalogo, estoque } from "@/lib/dados/bases";
import { camposGerais } from "@/lib/wcm/campoGeral";
import type { Contexto } from "@/lib/wcm/contexto";

import { guardar } from "../saude/calculo";
import { comListasDosSubconjuntos, listasPorEquipamento, listasPorPlano, listasDiretasDaIp19, type ListaTarefas } from "./ia06";
import { listasTarefas } from "@/lib/dados/listasTarefas";
import { conferidaNoManual } from "@/lib/dados/regrasVinculo";
import { materiaisOperacoes } from "@/lib/dados/materiaisOperacoes";
import { distribuirPecas, opcaoLista, type Atribuicao, type OpcaoLista } from "@/lib/wcm/distribuicaoIa06";
import { aplicarLevantamento, faltantesDoLevantamento, indicePorCodigo } from "@/lib/wcm/materiaisOperacoes";
import { chaveLista, type ListaLT } from "@/lib/wcm/listasTarefas";
import { gruposDoAtivo } from "../equipamentos/gruposPecas";
import { DESATIVADO, type LinhaAtivo } from "@/lib/wcm/ativos";
import { hashTexto } from "@/lib/wcm/util";

import { sugerirAlocacoes, type AtivoTexto, type MaterialTexto, type Sugestao } from "./alocacao";
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

/** Listas de tarefas próprias de cada equipamento (sem as dos subconjuntos): IW38 × IP19 e a coluna Equipamento da IP19. */
async function listasProprias(c: Contexto): Promise<Map<string, ListaTarefas[]>> {
  const ordens = c.b.ordens.dados ?? [], ip19 = c.b.cruas.ip19;
  return guardar(`mro-listas-proprias|${c.b.ordens.atualizado}:${ordens.length}|${ip19.atualizado}:${ip19.dados?.length ?? -1}`,
    () => listasPorEquipamento(ordens, listasPorPlano(ip19.dados), listasDiretasDaIp19(ip19.dados)));
}

/** As listas de tarefas lidas do texto da IA03 (Fontes de dados), por grupo|numerador. */
async function operacoesDasListas(): Promise<Map<string, ListaLT>> {
  const b = await listasTarefas();
  return guardar(`mro-ia03|${b.atualizado}:${b.dados?.length ?? -1}`, () => new Map((b.dados ?? []).map((l) => [l.chave, l])));
}

export interface DistribuicaoAtivo { atribuicoes: Atribuicao[]; listas: Record<string, OpcaoLista>; comTextoIa03: boolean; nomes: Record<string, string> }

/**
 * As peças do ativo (dele e dos subconjuntos) distribuídas nas listas de tarefas e operações: a lista do subconjunto
 * onde a peça está vinculada e a operação que combina com ela (lib/wcm/distribuicaoIa06.ts).
 */
export async function distribuicaoDoAtivo(c: Contexto, tag: string, bm: BaseMateriais, grupos = gruposDoAtivo(c, tag, bm)): Promise<DistribuicaoAtivo> {
  const [proprias, ia03, lev] = await Promise.all([listasProprias(c), operacoesDasListas(), materiaisOperacoes()]);
  const eqs = c.b.equipamentos.dados ?? [];
  const porCodigo = new Map(eqs.map((e) => [e.equipamento, e]));
  const filhos = new Map<string, string[]>();
  // a mesma árvore da lista de peças (gruposPorSistema): subconjuntos ativos, em qualquer profundidade
  for (const e of eqs) if (e.superior && e.superior !== e.equipamento && !e.inativo && !e.desativado) {
    (filhos.get(e.superior) ?? filhos.set(e.superior, []).get(e.superior)!).push(e.equipamento);
  }
  const arvore: string[] = [tag];
  for (let i = 0, vistos = new Set([tag]); i < arvore.length; i++) {
    for (const f of filhos.get(arvore[i]) ?? []) if (!vistos.has(f)) { vistos.add(f); arvore.push(f); }
  }
  const naArvore = new Set(arvore);
  const listas: Record<string, OpcaoLista> = {};
  const listasDe = (e: string): OpcaoLista[] => (proprias.get(e) ?? []).map((l) => {
    const k = chaveLista(l.grupo, l.numerador);
    const lt = ia03.get(k);
    return (listas[k] ??= opcaoLista(l, e, porCodigo.get(e)?.denominacao ?? e,
      lt?.operacoes.map((o) => ({ operacao: o.operacao, texto: o.texto, textoLongo: o.textoLongo })), lt?.titulo));
  });
  const todas = arvore.flatMap(listasDe);
  const cadeia = (o: string) => {
    const out = [o];
    for (let s = porCodigo.get(o)?.superior, n = 0; s && n < 4 && naArvore.has(s) && !out.includes(s); n++) { out.push(s); s = porCodigo.get(s)?.superior; }
    return out;
  };
  // uma linha por peça: a origem mais específica (subconjunto) vence a do próprio ativo
  const pecas = new Map<string, { codigo: string; descricao: string; descrCompleta: string; um: string; origem: string; conferida: boolean }>();
  for (const g of grupos) for (const p of g.pecas) {
    const ja = pecas.get(p.codigo);
    if (ja && ja.origem !== tag) continue;
    pecas.set(p.codigo, { codigo: p.codigo, descricao: p.descricao, descrCompleta: p.descrCompleta, um: p.um, origem: p.origem || tag, conferida: conferidaNoManual(p.codigo) });
  }
  // o levantamento dos manuais decide a operação das peças que cita e traz as que faltam vincular
  const levantamento = lev.dados ?? [];
  const atribuicoes = [...aplicarLevantamento(distribuirPecas([...pecas.values()], listasDe, cadeia, todas), indicePorCodigo(levantamento)),
    ...faltantesDoLevantamento(levantamento, todas, new Set(pecas.keys()), (m) => pecaMro(m, bm, c.cad.materiais))];
  const nomes = Object.fromEntries([...new Set(atribuicoes.map((a) => a.origem))].map((o) => [o, porCodigo.get(o)?.denominacao ?? o]));
  return { atribuicoes, listas, comTextoIa03: ia03.size > 0, nomes };
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
