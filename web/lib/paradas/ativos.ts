import { chave, semAcento } from "@/lib/dados/texto";
import type { Equipamento } from "@/lib/wcm/preparo";

import type { Ativo, ClasseAtivo, Demanda, ItemPlano, Parametros } from "./tipos";

/**
 * Ativos (spec §2.6): equipamentos agrupados na máquina-mãe pelo campo de ordenação (ou por um agrupamento dos
 * parâmetros) e classificados pela denominação (nome do calendário, tipo, grupo crítico).
 */

/** Denominação sem acento, em maiúsculas e com espaços simples (os parênteses ficam: "(PELLET 02)"). */
export const normalizarDenominacao = (s: string) => semAcento(s).toUpperCase().replace(/\s+/g, " ").trim();

const cacheRx = new Map<string, RegExp | null>();
function rx(padrao: string): RegExp | null {
  if (!cacheRx.has(padrao)) {
    try { cacheRx.set(padrao, new RegExp(padrao)); } catch { cacheRx.set(padrao, null); }
  }
  return cacheRx.get(padrao)!;
}

/** "$1" do nome com 2 dígitos ("7" → "07"). */
const substituir = (modelo: string, m: RegExpExecArray) =>
  modelo.replace(/\$(\d)/g, (_, n) => { const v = m[Number(n)] ?? ""; return /^\d+$/.test(v) ? v.padStart(2, "0") : v; });

export function classeDe(denominacao: string, p: Parametros): { classe: ClasseAtivo; nome: string } | null {
  const k = normalizarDenominacao(denominacao);
  for (const c of p.classes) {
    const m = rx(c.padrao)?.exec(k);
    if (m) return { classe: c, nome: substituir(c.nome, m) };
  }
  return null;
}

/** Tipo de um ativo sem classe: o sinônimo do parâmetro que abre a denominação; senão a 1ª palavra sem pontuação. */
export function tipoSemClasse(denominacao: string, p: Parametros): string {
  const k = chave(denominacao);
  const sin = Object.keys(p.sinonimosTipo).sort((a, b) => b.length - a.length).find((s) => k === s || k.startsWith(`${s} `));
  return sin ? p.sinonimosTipo[sin] : k.split(" ")[0] ?? "";
}

export function classificar(denominacao: string, p: Parametros): Omit<Ativo, "campos" | "equipamentos" | "denominacao" | "juntoCom"> {
  const achou = classeDe(denominacao, p);
  if (!achou) {
    const k = normalizarDenominacao(denominacao);
    const tipo = tipoSemClasse(denominacao, p);
    return { id: k.slice(0, 30).trim(), tipo, grupo: null, so1Turno: false, soSabado: false, exclusivoT1: false,
      preferenciaT1: p.tiposPreferenciaT1.includes(tipo) };
  }
  const { classe: c, nome } = achou;
  // moinho fora do rodízio não é crítico (segue com o Banbury, se estiver nos "juntos", ou como ativo comum)
  const grupo = c.papel === "moinho" && !p.rodizioMoinhos.includes(nome) ? null : c.grupo ?? null;
  return {
    id: nome, tipo: c.tipo, grupo, ...(c.papel ? { papel: c.papel } : {}), so1Turno: !!c.so1Turno, soSabado: !!c.soSabado,
    exclusivoT1: !!c.exclusivoT1, preferenciaT1: !!c.preferenciaT1 || p.tiposPreferenciaT1.includes(c.tipo),
  };
}

const ordenar = (xs: Iterable<string>) => [...new Set(xs)].filter(Boolean).sort();

export function montarAtivos(itens: ItemPlano[], eqs: Map<string, Equipamento>, campoGeral: (eq: string) => string, p: Parametros): {
  itens: ItemPlano[]; ativos: Record<string, Ativo>; avisos: string[];
} {
  const campoDe = (codigo: string, superiorIp19 = ""): string => {
    const e = eqs.get(codigo);
    const proprio = (e?.campo ?? "").trim().toUpperCase();
    if (proprio) return proprio;
    const sup = e?.superior || superiorIp19;
    const doSuperior = sup ? (eqs.get(sup)?.campo ?? "").trim().toUpperCase() : "";
    if (doSuperior) return doSuperior;
    return (campoGeral(codigo) ?? "").trim().toUpperCase() || codigo;
  };
  const agrupamentoDe = (denominacao: string): string | null => {
    const k = normalizarDenominacao(denominacao);
    for (const a of p.agrupamentos) {
      const m = rx(a.padrao)?.exec(k);
      if (m) return substituir(a.ativo, m);
    }
    return null;
  };

  // IH08 por campo de ordenação (a máquina-mãe pode não ter item na IP19)
  const porCampo = new Map<string, string[]>();
  for (const e of eqs.values()) {
    const c = (e.campo ?? "").trim().toUpperCase();
    if (c) porCampo.set(c, [...(porCampo.get(c) ?? []), e.equipamento]);
  }
  /**
   * Máquina-mãe: o equipamento do IH08 cujo código é o campo; senão (entre os do grupo e os do IH08 com o mesmo campo)
   * o que cai numa classe com grupo crítico, depois o que cai numa classe; só no fim o primeiro.
   */
  const maquinaMae = (doGrupo: string[], cs: string[]): string => {
    for (const c of cs) if (eqs.has(c)) return c;
    const cands = [...new Set([...doGrupo, ...cs.flatMap((c) => porCampo.get(c) ?? []).sort()])];
    const cl = (e: string) => classeDe(eqs.get(e)?.denominacao ?? "", p)?.classe;
    return cands.find((e) => cl(e)?.grupo) ?? cands.find((e) => cl(e)) ?? doGrupo[0];
  };

  // grupo de cada item: agrupamento por parâmetro ou o campo de ordenação
  const grupos = new Map<string, { campos: Set<string>; eqs: Set<string>; agrupado: string | null }>();
  const chaveItem: string[] = [];
  const campos: string[] = [];
  for (const i of itens) {
    const campo = campoDe(i.equipamento, i.superior);
    const ag = agrupamentoDe(eqs.get(i.equipamento)?.denominacao ?? "");
    const k = ag ? `A|${ag}` : `C|${campo}`;
    const g = grupos.get(k) ?? { campos: new Set<string>(), eqs: new Set<string>(), agrupado: ag };
    g.campos.add(campo);
    g.eqs.add(i.equipamento);
    grupos.set(k, g);
    chaveItem.push(k);
    campos.push(campo);
  }

  const ativos: Record<string, Ativo> = {};
  const idDoGrupo = new Map<string, string>();
  const avisos: string[] = [];
  for (const k of [...grupos.keys()].sort()) {
    const g = grupos.get(k)!;
    const equipamentos = ordenar(g.eqs), cs = ordenar(g.campos);
    const denom = (e: string) => eqs.get(e)?.denominacao ?? "";
    const mae = maquinaMae(equipamentos, g.agrupado ? [] : cs);
    const denominacao = denom(mae);
    const c = classificar(denominacao, p);
    const classificado = g.agrupado != null || classeDe(denominacao, p) != null;
    let id = g.agrupado ?? (c.id || cs[0]);
    const ja = ativos[id];
    if (ja && classificado && !ja.semClasse) {
      // a mesma classe (o mesmo nome do calendário) em outro campo: é o mesmo ativo
      avisos.push(`Campos de ordenação ${[...ja.campos, ...cs].join(", ")} viraram um ativo só ("${id}").`);
      ja.campos = ordenar([...ja.campos, ...cs]);
      ja.equipamentos = ordenar([...ja.equipamentos, ...equipamentos]);
      idDoGrupo.set(k, id);
      continue;
    }
    if (ja) {
      let n = 2;
      while (ativos[`${id} (${n})`]) n++;
      const novo = `${id} (${n})`;
      avisos.push(`Ativo "${id}" aparece em mais de um campo de ordenação (${[...ja.campos, ...cs].join(", ")}); o outro virou "${novo}".`);
      id = novo;
    }
    const junto = p.juntos.find((j) => j.ativo === id);
    ativos[id] = { ...c, id, campos: cs, equipamentos, denominacao, ...(junto ? { juntoCom: junto.com } : {}),
      ...(classificado ? {} : { semClasse: true }) };
    idDoGrupo.set(k, id);
  }
  return { itens: itens.map((i, n) => ({ ...i, campo: campos[n], ativo: idDoGrupo.get(chaveItem[n])! })), ativos, avisos };
}

const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

export function ordenarItens(xs: ItemPlano[]): ItemPlano[] {
  return xs.slice().sort((a, b) => a.dataIp19 - b.dataIp19 || cmp(a.plano, b.plano) || cmp(a.item, b.item) || cmp(a.chave, b.chave));
}

export function somaHh(xs: { disciplina: "MEC" | "ELE"; hh: number }[]) {
  const r = { mec: 0, ele: 0 };
  for (const i of xs) if (i.disciplina === "MEC") r.mec += i.hh; else r.ele += i.hh;
  return r;
}

export function demandas(itens: ItemPlano[]): Demanda[] {
  const m = new Map<string, ItemPlano[]>();
  for (const i of itens) {
    const k = `${i.mes}\x1f${i.ativo}`;
    m.set(k, [...(m.get(k) ?? []), i]);
  }
  return [...m.keys()].sort().map((k) => {
    const its = ordenarItens(m.get(k)!);
    const datas = [...new Set(its.map((i) => i.dataIp19))].sort((a, b) => a - b);
    return { mes: its[0].mes, ativo: its[0].ativo, itens: its, hh: somaHh(its), primeiraData: datas[0], datas };
  });
}
