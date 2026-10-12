import { describe, expect, it } from "vitest";

import * as ql from "@/lib/wcm/qualidade";
import type { OrdemQualidade } from "@/lib/wcm/qualidade";
import { dia } from "@/lib/wcm/util";

/** Qualidade dos dados: cada checagem conta o problema certo sobre a base certa (dados fictícios). */
const HOJE = dia(2026, 10, 7)!;

describe("qualidade.verificar", () => {
  it("checagens principais", () => {
    const sit: OrdemQualidade["situacao"][] = ["Concluída", "Aberta", "Encerrada sem confirmação", "Concluída", "Cancelada"];
    const ini = [10, 200, 20, 30, 5], fim = [9, 201, 19, 29, 4];
    const equipChave = ["E1", "", "E2", "E9", "E1"], objeto = ["A", "", "B", "Z", "A"];
    const ordens: OrdemQualidade[] = sit.map((situacao, i) => ({
      ordem: String(i + 1), situacao, data: HOJE - ini[i], inicio: HOJE - ini[i], fim: HOJE - fim[i], equipChave: equipChave[i],
      objeto: objeto[i], tipo: "YM13", texto: "", centroTrabalho: "MEC", localizacao: "GAL1" }));
    const notas = [["n1", "Y1", 5], ["n2", "Y1", 1], ["n3", "Y2", 40], ["n4", "Y2", 10]].map(([nota, tipoNota, dias]) => ({
      nota: nota as string, tipoNota: tipoNota as string, data: HOJE - (dias as number), dias: dias as number, comOrdem: false,
      equipChave: "E1", objeto: "A", descricao: "", centroTrabalho: "MEC" }));
    const oper = [["1", "10", false, 0], ["1", "20", false, 2], ["2", "10", true, 0]].map(([ordem, operacao, cancelada, horas]) => ({
      ordem: ordem as string, operacao: operacao as string, cancelada: cancelada as boolean, inicio: HOJE - 3, horas: horas as number,
      textoOperacao: "", centroTrabalho: "MEC", objeto: "" }));
    const conf = [["100", 1], ["200", 2], ["200", 3]].map(([np, horas]) => ({ np: np as string, centroTrabalho: "MEC", data: HOJE - 2,
      horas: horas as number }));
    const equipe = [{ np: "100" }];
    const equip = [{ equipamento: "E1", codigoAbc: "A" }, { equipamento: "E2", codigoAbc: "" }];
    const quebras = [{ nota: "q1", data: HOJE - 3, horasReparo: 1.5, equipChave: "E1" },
      { nota: "q2", data: HOJE - 3, horasReparo: null, equipChave: "E1" }];
    const fimReal = new Map([["1", HOJE - 9]]);
    const lista = ql.verificar(HOJE, { ordens, oper, notas, conf, equipe, equip, cadEq: { E9: { criticidade: "Baixa" } }, quebras, fimReal });
    const ch = Object.fromEntries(lista.map((c) => [c.id, c]));
    expect([ch.quebras_sem_reparo.n, ch.quebras_sem_reparo.total]).toEqual([1, 2]);
    expect([ch.y1_sem_ordem.n, ch.y1_sem_ordem.total]).toEqual([1, 1]); // a Y1 de 1 dia ainda não conta
    expect([ch.notas_sem_ordem.n, ch.notas_sem_ordem.total]).toEqual([1, 1]);
    expect([ch.ordens_sem_equip.n, ch.ordens_sem_equip.total]).toEqual([1, 4]); // cancelada fora
    expect(ch.prazo_antes_inicio.n).toBe(1); // a ordem 2 (fim antes do início)
    expect(ch.prazo_antes_inicio.problemas[0].Ordem).toBe("2");
    expect([ch.ente_sem_conf.n, ch.ente_sem_conf.total]).toEqual([1, 3]);
    expect(ch.concluidas_sem_fim.problemas.map((p) => p.Ordem)).toEqual(["4"]);
    expect(ch.backlog_velho.problemas.map((p) => p.Ordem)).toEqual(["2"]);
    expect(ch.equip_sem_criticidade.problemas.map((p) => p.Equipamento)).toEqual(["E2"]); // E9 tem criticidade no site
    expect(ch.equip_sem_criticidade.problemas[0]["Objeto técnico"]).toBe("B");
    expect([ch.ops_sem_trabalho.n, ch.ops_sem_trabalho.total]).toEqual([1, 2]); // a cancelada não conta
    expect(ch.apont_fora_equipe.problemas.map((p) => p["Nº pessoal"])).toEqual(["200"]);
    expect(ch.apont_fora_equipe.problemas[0].HH).toBe(5);
    expect(ch.apont_fora_equipe.problemas[0].Apontamentos).toBe(2);
    expect(ch.apont_fora_equipe.total).toBe(2);
    expect(ch.quebras_sem_reparo.farol).toBe(ql.VERMELHO);
    expect(ch.ordens_sem_equip.farol).toBe(ql.VERMELHO);
    const i = ql.indice(lista)!;
    expect(i).toBeGreaterThanOrEqual(0);
    expect(i).toBeLessThan(100);
    // mesma ordem do site atual
    expect(lista.map((c) => c.id)).toEqual(["quebras_sem_reparo", "y1_sem_ordem", "notas_sem_ordem", "ordens_sem_equip",
      "prazo_antes_inicio", "ente_sem_conf", "concluidas_sem_fim", "backlog_velho", "equip_sem_criticidade", "ops_sem_trabalho",
      "apont_fora_equipe"]);
    // cada linha de problema tem as colunas anunciadas
    for (const c of lista) for (const p of c.problemas) expect(Object.keys(p).sort()).toEqual([...c.colunas].sort());
    const f = ql.contarFarois(lista);
    expect(f.verde + f.amarelo + f.vermelho).toBe(lista.length);
    expect(ql.ordenarPorPct(lista)[0].pct).toBe(Math.max(...lista.map((c) => c.pct ?? 0)));
  });

  it("sem bases não há checagem e farol dos limites", () => {
    expect(ql.verificar(HOJE)).toEqual([]);
    expect(ql.indice([])).toBeNull();
    const c = ql.checagem({ id: "x", nome: "x", base: "x", afeta: "x", corrigir: "x", colunas: ["a"], problemas: [{ a: 1 }, { a: 2 }], total: 100 });
    expect(c.farol).toBe(ql.VERDE);
    expect(c.pct).toBe(2);
    expect(ql.farolDe(ql.pctDe(2, 20))).toBe(ql.AMARELO);
    expect(ql.farolDe(ql.pctDe(2, 10))).toBe(ql.VERMELHO);
    expect(ql.farolDe(ql.pctDe(0, 0))).toBe(ql.VERDE); // sem base: verde
    // sem fim real, a checagem de fim real não roda
    const o = [{ ordem: "1", situacao: "Concluída" as const, data: HOJE, inicio: HOJE, fim: HOJE, equipChave: "E1", objeto: "",
      tipo: "", texto: "", centroTrabalho: "", localizacao: "" }];
    expect(ql.verificar(HOJE, { ordens: o }).some((c) => c.id === "concluidas_sem_fim")).toBe(false);
  });
});
