import type { Fixacao, ItemPlano, Marca } from "../tipos";
import { deixar, pendentes, type Ctx } from "./comum";
import { encaixarT2T1 } from "./estado";

/**
 * Passo 1 — fixações do planejador (spec §5.5). A parada fixada leva exatamente os itens que ela tinha na passada sem
 * fixações (A); não é barrada por regra nem capacidade (o que ela quebrar vira alerta). Fixação de parada que não
 * existe mais vai para `fixacoesOrfas`.
 */
export function aplicarFixacoes(c: Ctx, fixacoes: Fixacao[], itensDaParada: Map<string, string[]>, orfas: Fixacao[]): void {
  const lista = fixacoes.filter((f) => f.mes === c.mes)
    .sort((a, b) => a.data - b.data || (a.ativo < b.ativo ? -1 : a.ativo > b.ativo ? 1 : 0) || a.parada - b.parada);
  for (const f of lista) {
    const chaves = itensDaParada.get(`${f.mes}|${f.ativo}|${f.parada}`);
    if (!c.ativos[f.ativo] || (!chaves && !f.extra)) { orfas.push(f); continue; }
    const set = new Set(chaves ?? []);
    const todos = pendentes(c, f.ativo);
    const its: ItemPlano[] = todos.filter((i) => set.has(i.chave));
    deixar(c, f.ativo, todos.filter((i) => !set.has(i.chave)));
    const marcas: Marca[] = ["fixada"];
    if (f.extra) marcas.push("parada extra");
    if (!its.length) marcas.push("sem itens IP19");
    if (f.turno !== "1+2") { c.est.colocar(f.ativo, c.mes, f.data, f.turno, its, f.parada, marcas); continue; }
    const r = encaixarT2T1(its, c.est.livre(f.data, 2), c.est.livre(f.data, 1));
    const t1 = [...r.t1, ...r.fora]; // sem capacidade, o resto vai no 1º turno (nunca some)
    const m: Marca[] = r.t2.length && t1.length ? [...marcas, "1º+2º turno"] : marcas;
    if (r.t2.length) c.est.colocar(f.ativo, c.mes, f.data, 2, r.t2, f.parada, m);
    if (t1.length || !r.t2.length) c.est.colocar(f.ativo, c.mes, f.data, 1, t1, f.parada, m);
  }
}
