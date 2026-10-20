import type { OrdemCusto } from "@/app/(app)/custos/calculo";
import { GRUPOS_CLASSE, grupoDaClasse, maiores } from "@/app/(app)/confiabilidade/_comum/agregar";
import type { Cadastro } from "@/lib/dados/cadastros";

import type { Quebra } from "./indicadores";
import { ENCERRADA_SEM_CONF, type Equipamento, type Requisicao } from "./preparo";
import { familia } from "./roadmapSim";
import { dia, inicioDoMes, partes, type Dia } from "./util";

/**
 * Contas do Custo 360° (aba Custos), puras para testar (testes/custo360.test.ts).
 * Entram ordens já filtradas pelo recorte da barra de filtros (`ordensDoPeriodo`).
 */

/** Custo da parada e pares por hora do cadastro (_parametros, aba Metas); ausente ou ≤ 0 = null. */
export function custoParadaDe(cad: Cadastro | null | undefined): { custoPar: number | null; paresHora: number | null } {
  const p: Record<string, unknown> = cad?._parametros ?? {};
  const pos = (v: unknown) => {
    const n = Number(v);
    return v != null && v !== "" && Number.isFinite(n) && n > 0 ? n : null;
  };
  return { custoPar: pos(p.custo_par), paresHora: pos(p.pares_hora) };
}

/** Totais do topo: custo por ativo-mês (null sem ativos), médio por ordem com custo (null sem ordens). */
export function kpis360(o: OrdemCusto[], equipAtivos: number, meses: number) {
  let total = 0, ordensComCusto = 0;
  for (const x of o) {
    total += x.custoReal;
    if (x.custoReal !== 0) ordensComCusto++;
  }
  return {
    total,
    porAtivoMes: equipAtivos > 0 && meses > 0 ? total / equipAtivos / meses : null,
    medioOrdem: ordensComCusto ? total / ordensComCusto : null,
    ordensComCusto,
  };
}

/**
 * Iceberg: custo visível (ordens) e o que fica embaixo — horas paradas (`horasParado` das quebras com parada,
 * já filtradas pelo período pelo chamador), em R$ pelo custo do par; horas do IW47, requisições e estoque.
 * Sem quebras no recorte, não há linha de parada (null).
 */
export function iceberg(
  o: OrdemCusto[], quebras: Quebra[], horasIw47: number, reqPendentes: number | null, estoque: number | null,
  p: { custoPar: number | null; paresHora: number | null },
) {
  const visivel = o.reduce((s, x) => s + x.custoReal, 0);
  const paradaHoras = quebras.length ? quebras.reduce((s, q) => s + (q.comParada ? q.horasParado : 0), 0) : null;
  const paradaRs = paradaHoras != null && p.custoPar != null && p.paresHora != null ? paradaHoras * p.paresHora * p.custoPar : null;
  return { visivel, paradaHoras, "paradaR$": paradaRs, horasServico: horasIw47, requisicoes: reqPendentes, estoque };
}

/** Mês do termômetro ("AAAA-MM"); fora do intervalo [início do mês de ini, fim] ou inválido = mês do fim. */
export function mesDoTermometro(param: string, ini: Dia, fim: Dia): { ano: number; mes: number } {
  const p = partes(fim);
  const padrao = { ano: p.ano, mes: p.mes };
  const m = /^(\d{4})-(\d{1,2})$/.exec(param);
  if (!m) return padrao;
  const ano = Number(m[1]), mes = Number(m[2]);
  const d = dia(ano, mes, 1);
  if (d == null || d < inicioDoMes(ini) || d > fim) return padrao;
  return { ano, mes };
}

/** Custo de cada dia do mês (todos os dias; dia sem custo = 0). Estorno fica negativo: o componente aplica o mínimo. */
export function porDia(o: OrdemCusto[], ano: number, mes: number): { dia: number; valor: number }[] {
  const porData = new Map<Dia, number>();
  for (const x of o) if (x.data != null) porData.set(x.data, (porData.get(x.data) ?? 0) + x.custoReal);
  const out: { dia: number; valor: number }[] = [];
  for (let d = 1; ; d++) {
    const k = dia(ano, mes, d);
    if (k == null) break;
    out.push({ dia: d, valor: porData.get(k) ?? 0 });
  }
  return out;
}

/** Custo dos 12 meses do ano (janeiro = índice 0). */
export function porMesAno(o: OrdemCusto[], ano: number): number[] {
  const out = Array.from({ length: 12 }, () => 0);
  for (const x of o) {
    if (x.data == null) continue;
    const p = partes(x.data);
    if (p.ano === ano) out[p.mes - 1] += x.custoReal;
  }
  return out;
}

export type Grupo = "Planejada" | "Corretiva" | "Emergencial" | "Outras";

/** Custo por grupo de classe (só grupos com ordem), com % do total e custo médio por ordem. */
export function porGrupo(o: OrdemCusto[]): { grupo: Grupo; valor: number; pct: number; ordens: number; porOrdem: number }[] {
  const acc = new Map<Grupo, { valor: number; ordens: number }>();
  for (const x of o) {
    const g = grupoDaClasse(x.classe) as Grupo;
    const e = acc.get(g) ?? { valor: 0, ordens: 0 };
    e.valor += x.custoReal;
    e.ordens++;
    acc.set(g, e);
  }
  const total = [...acc.values()].reduce((s, e) => s + e.valor, 0);
  return GRUPOS_CLASSE.map((g) => g.nome as Grupo).filter((g) => acc.has(g)).map((g) => {
    const e = acc.get(g)!;
    return { grupo: g, valor: e.valor, pct: total ? (e.valor / total) * 100 : 0, ordens: e.ordens, porOrdem: e.valor / e.ordens };
  });
}

/**
 * Custo por família de máquina (`familia` do nome: "PRENSA 01" e "PRENSA 02" → PRENSA). Só ordens com código de
 * equipamento; o nome vem do cadastro (`nomeEq`) ou do objeto da ordem. Além de `n` famílias, o resto vai em "Demais".
 */
export function dnaPorFamilia(o: OrdemCusto[], nomeEq: Map<string, string>, n = 5): { familia: string; valor: number; pct: number }[] {
  const acc = new Map<string, number>();
  for (const x of o) {
    if (!x.equipamento) continue;
    const nome = nomeEq.get(x.equipamento) || x.objeto;
    if (!nome) continue;
    const f = familia(nome);
    acc.set(f, (acc.get(f) ?? 0) + x.custoReal);
  }
  const ord = maiores(acc);
  const total = ord.reduce((s, [, v]) => s + v, 0);
  const out = ord.slice(0, n).map(([f, v]) => ({ familia: f, valor: v, pct: total ? (v / total) * 100 : 0 }));
  if (ord.length > n) {
    const resto = ord.slice(n).reduce((s, [, v]) => s + v, 0);
    out.push({ familia: "Demais", valor: resto, pct: total ? (resto / total) * 100 : 0 });
  }
  return out;
}

export type ClasseAbc = "A" | "B" | "C" | "Sem classe";

/**
 * Custo por classe de criticidade (A/B/C do cadastro de equipamentos ativos): médio por ativo da classe.
 * "Sem classe" = ordens de equipamento fora do cadastro ou sem código; seus ativos são os códigos distintos.
 * `mediaGeral` = custo ÷ ativos de todas as linhas com ativo. Linha sem dado some.
 */
export function porCriticidade(o: OrdemCusto[], eqs: Equipamento[]): {
  linhas: { classe: ClasseAbc; medio: number | null; ativos: number; acimaDaMedia: boolean }[];
  mediaGeral: number | null;
} {
  const abc = new Map<string, "A" | "B" | "C">();
  const ativos: Record<ClasseAbc, number> = { A: 0, B: 0, C: 0, "Sem classe": 0 };
  for (const e of eqs) {
    if (e.desativado) continue;
    const c = e.codigoAbc.trim().toUpperCase();
    if (c === "A" || c === "B" || c === "C") { abc.set(e.equipamento, c); ativos[c]++; }
  }
  const custo: Record<ClasseAbc, number> = { A: 0, B: 0, C: 0, "Sem classe": 0 };
  const semClasse = new Set<string>();
  for (const x of o) {
    const c = x.equipamento ? abc.get(x.equipamento) : undefined;
    if (c) custo[c] += x.custoReal;
    else {
      custo["Sem classe"] += x.custoReal;
      if (x.equipamento) semClasse.add(x.equipamento);
    }
  }
  ativos["Sem classe"] = semClasse.size;
  const classes: ClasseAbc[] = ["A", "B", "C", "Sem classe"];
  const visiveis = classes.filter((c) => ativos[c] > 0 || custo[c] !== 0);
  const comAtivo = visiveis.filter((c) => ativos[c] > 0);
  const somaAtivos = comAtivo.reduce((s, c) => s + ativos[c], 0);
  const mediaGeral = somaAtivos ? comAtivo.reduce((s, c) => s + custo[c], 0) / somaAtivos : null;
  const linhas = visiveis.map((c) => {
    const medio = ativos[c] ? custo[c] / ativos[c] : null;
    return { classe: c, medio, ativos: ativos[c], acimaDaMedia: medio != null && mediaGeral != null && medio > mediaGeral };
  });
  return { linhas, mediaGeral };
}

/**
 * Concentração do custo: os 10% dos equipamentos com custo (mínimo 1; com 1–9, o de maior custo) e a parte deles
 * no custo dos equipamentos com código. Ordem sem código de equipamento fica de fora. Sem custo = null.
 */
export function concentracao(o: OrdemCusto[]): {
  pctCusto10: number; nAtivos: number; top: { equip: string; custo: number; porOrdem: number }[];
} | null {
  const porEq = new Map<string, { custo: number; ordens: number }>();
  let base = 0;
  for (const x of o) {
    if (!x.equipamento) continue;
    const e = porEq.get(x.equipamento) ?? { custo: 0, ordens: 0 };
    e.custo += x.custoReal;
    e.ordens++;
    porEq.set(x.equipamento, e);
    base += x.custoReal;
  }
  const com = [...porEq].filter(([, e]) => e.custo > 0)
    .sort((a, b) => b[1].custo - a[1].custo || a[0].localeCompare(b[0], "pt-BR"));
  if (!com.length || base <= 0) return null;
  const k = Math.max(1, Math.ceil(com.length * 0.1));
  const top = com.slice(0, k).map(([equip, e]) => ({ equip, custo: e.custo, porOrdem: e.custo / e.ordens }));
  const soma = top.reduce((s, t) => s + t.custo, 0);
  return { pctCusto10: (soma / base) * 100, nAtivos: com.length, top };
}

/**
 * Onde o custo está travado, por etapa: 1 requisições pendentes (só se houver requisições); 2 abertas ou liberadas
 * com custo; 3 encerradas sem confirmação com custo; 4 concluídas sem custo lançado (sem valor).
 */
export function travado(o: OrdemCusto[], req: Requisicao[] | null): {
  etapa: 1 | 2 | 3 | 4; rotulo: string; qtd: number; valor: number | null;
}[] {
  const out: { etapa: 1 | 2 | 3 | 4; rotulo: string; qtd: number; valor: number | null }[] = [];
  if (req) {
    const pend = req.filter((r) => r.pendente);
    out.push({ etapa: 1, rotulo: "Requisições pendentes", qtd: pend.length, valor: pend.reduce((s, r) => s + r.total, 0) });
  }
  if (o.length) {
    const soma = (f: (x: OrdemCusto) => boolean) => {
      const xs = o.filter(f);
      return { qtd: xs.length, valor: xs.reduce((s, x) => s + x.custoReal, 0) };
    };
    const e2 = soma((x) => (x.situacao === "Aberta" || x.situacao === "Liberada") && x.custoReal > 0);
    out.push({ etapa: 2, rotulo: "Abertas ou liberadas com custo", ...e2 });
    const e3 = soma((x) => x.situacao === ENCERRADA_SEM_CONF && x.custoReal > 0);
    out.push({ etapa: 3, rotulo: "Encerradas sem confirmação com custo", ...e3 });
    const qtd4 = o.filter((x) => x.situacao === "Concluída" && x.custoReal === 0).length;
    out.push({ etapa: 4, rotulo: "Concluídas sem custo lançado", qtd: qtd4, valor: null });
  }
  return out;
}
