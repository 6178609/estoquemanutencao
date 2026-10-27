import "server-only";

import { listasTarefas } from "@/lib/dados/listasTarefas";
import { conferidaNoManual } from "@/lib/dados/regrasVinculo";
import type { Contexto } from "@/lib/wcm/contexto";
import { origemManual, situacaoLista, tipoTecnico, type LinhaCruzamento } from "@/lib/wcm/cruzamentoMateriais";
import { distribuirPecas, opcaoLista, type OpcaoLista } from "@/lib/wcm/distribuicaoIa06";
import { chaveLista, type ListaLT } from "@/lib/wcm/listasTarefas";
import { hashTexto } from "@/lib/wcm/util";

import { infoCad, materiaisDe } from "../equipamentos/dados";
import { guardar } from "../saude/calculo";
import { listasDiretasDaIp19, listasPorEquipamento, listasPorPlano } from "./ia06";
import { pecaMro, semZeros, type BaseMateriais } from "./logica";

export interface Cruzamento {
  linhas: LinhaCruzamento[];
  /** as listas que aparecem no cruzamento (grupo|numerador → lista com operações) */
  listas: Record<string, OpcaoLista>;
  /** nome de cada equipamento citado */
  nomes: Record<string, string>;
  comTextoIa03: boolean;
}

/**
 * Todo material vinculado a equipamento (cadastro do site), cruzado com as listas de tarefas (distribuição automática
 * por subconjunto e operação, e os componentes já na lista pelo texto da IA03), com o manual (conferido ou pelo modelo)
 * e com o tipo técnico e o estoque. Refeito só quando um export, o texto da IA03 ou o cadastro muda.
 */
export async function cruzamentoMateriais(c: Contexto, bm: BaseMateriais): Promise<Cruzamento> {
  const base = await listasTarefas();
  const ordens = c.b.ordens.dados ?? [], ip19 = c.b.cruas.ip19, eqs = c.b.equipamentos.dados ?? [];
  const cad = hashTexto(JSON.stringify(c.cad.equipamentos)) + hashTexto(JSON.stringify(c.cad.materiais));
  // baseMateriais() devolve o mesmo objeto enquanto o MB52 e o Sysmat não mudam: a versão dele entra na chave
  const chaveCache = `cruz|${c.b.ordens.atualizado}:${ordens.length}|${ip19.atualizado}:${ip19.dados?.length ?? -1}|${c.b.equipamentos.atualizado}:${eqs.length}`
    + `|${base.atualizado}:${base.dados?.length ?? -1}|${versaoBm(bm)}|${cad}`;
  return guardar(chaveCache, () => montarCruzamento(c, bm, base.dados ?? []));
}

const versoesBm = new WeakMap<BaseMateriais, number>();
let proximaVersao = 0;
const versaoBm = (bm: BaseMateriais) => versoesBm.get(bm) ?? (versoesBm.set(bm, ++proximaVersao), proximaVersao);

export function montarCruzamento(c: Contexto, bm: BaseMateriais, ia03Lista: ListaLT[]): Cruzamento {
  const ordens = c.b.ordens.dados ?? [], ip19 = c.b.cruas.ip19.dados, eqs = c.b.equipamentos.dados ?? [];
  const ia03 = new Map(ia03Lista.map((l) => [l.chave, l]));
  // componentes já nas listas do SAP: lista → material → operação
  const componentes = new Map<string, Map<string, string>>();
  for (const l of ia03Lista) for (const o of l.operacoes) for (const x of o.componentes) {
    (componentes.get(l.chave) ?? componentes.set(l.chave, new Map()).get(l.chave)!).set(semZeros(x.material), o.operacao);
  }
  const proprias = listasPorEquipamento(ordens, listasPorPlano(ip19), listasDiretasDaIp19(ip19));
  const porCodigo = new Map(eqs.map((e) => [e.equipamento, e]));
  const ativo = (t: string) => { const e = porCodigo.get(t); return !e || (!e.inativo && !e.desativado); };
  const filhos = new Map<string, string[]>();
  for (const e of eqs) if (e.superior && e.superior !== e.equipamento && !e.inativo && !e.desativado) {
    (filhos.get(e.superior) ?? filhos.set(e.superior, []).get(e.superior)!).push(e.equipamento);
  }
  // sobe só por superiores ativos (a árvore abaixo também só tem os ativos)
  const raizDe = (t: string) => {
    let r = t;
    for (let s = porCodigo.get(t)?.superior, n = 0, vistos = new Set([t]); s && porCodigo.has(s) && ativo(s) && !vistos.has(s) && n < 8; n++) {
      vistos.add(s); r = s; s = porCodigo.get(s)?.superior;
    }
    return r;
  };
  const listas: Record<string, OpcaoLista> = {};
  const listasDe = (e: string): OpcaoLista[] => (proprias.get(e) ?? []).map((l) => {
    const k = chaveLista(l.grupo, l.numerador);
    const lt = ia03.get(k);
    return (listas[k] ??= opcaoLista(l, e, porCodigo.get(e)?.denominacao ?? e,
      lt?.operacoes.map((o) => ({ operacao: o.operacao, texto: o.texto, textoLongo: o.textoLongo })), lt?.titulo));
  });
  // equipamentos com material vinculado, agrupados pela máquina (raiz)
  const comMaterial = Object.keys(c.cad.equipamentos).filter((t) => ativo(t) && materiaisDe(infoCad(c, t)).length);
  const porRaiz = new Map<string, string[]>();
  for (const t of comMaterial) { const r = raizDe(t); (porRaiz.get(r) ?? porRaiz.set(r, []).get(r)!).push(t); }
  const pecaCache = new Map<string, ReturnType<typeof pecaMro>>();
  const peca = (m: string) => pecaCache.get(m) ?? pecaCache.set(m, pecaMro(m, bm, c.cad.materiais)).get(m)!;
  const linhas: LinhaCruzamento[] = [];
  const nomes: Record<string, string> = {};
  for (const [raiz, tags] of porRaiz) {
    const arvore = [raiz];
    for (let i = 0, vistos = new Set([raiz]); i < arvore.length; i++) for (const f of filhos.get(arvore[i]) ?? []) if (!vistos.has(f)) { vistos.add(f); arvore.push(f); }
    const naArvore = new Set(arvore);
    const todas = arvore.flatMap(listasDe);
    const cadeia = (o: string) => {
      const out = [o];
      for (let s = porCodigo.get(o)?.superior, n = 0; s && n < 8 && naArvore.has(s) && !out.includes(s); n++) { out.push(s); s = porCodigo.get(s)?.superior; }
      return out;
    };
    const pecas = tags.flatMap((t) => materiaisDe(infoCad(c, t)).map((m) => {
      const p = peca(m);
      return { codigo: m, descricao: p.descricao, descrCompleta: p.descrCompleta, um: p.um, origem: t, conferida: conferidaNoManual(m) };
    }));
    const atribs = distribuirPecas(pecas, listasDe, cadeia, todas);
    atribs.forEach((a, i) => {
      const p = peca(a.codigo);
      // já é componente no SAP: da lista escolhida, de uma lista da cadeia ou de outra lista da máquina?
      const cod = semZeros(a.codigo);
      let naLista: [string, string] | null = null;
      for (const k of [a.lista, ...cadeia(a.origem).flatMap((e) => listasDe(e).map((l) => l.chave)), ...todas.map((l) => l.chave)]) {
        const op = k ? componentes.get(k)?.get(cod) : undefined;
        if (op) { naLista = [k!, op]; break; }
      }
      const sit = situacaoLista(a, (k) => !!listas[k]?.operacoes.length, naLista ? naLista[0] : null);
      linhas.push({ codigo: a.codigo, descricao: a.descricao, tipo: tipoTecnico(a.descricao, p.categoria, p.descrCompleta),
        manual: origemManual(pecas[i].conferida, p.descrCompleta), equipamento: a.origem, raiz,
        lista: naLista ? naLista[0] : a.lista, operacao: naLista ? naLista[1] : a.operacao, situacao: sit, nivel: a.nivel, motivo: naLista ? "componente da lista no SAP" : a.motivo,
        estoque: p.estoque, statusEstoque: p.status, um: p.um });
      nomes[a.origem] ??= porCodigo.get(a.origem)?.denominacao ?? a.origem;
      nomes[raiz] ??= porCodigo.get(raiz)?.denominacao ?? raiz;
    });
  }
  return { linhas, listas, nomes, comTextoIa03: ia03.size > 0 };
}
