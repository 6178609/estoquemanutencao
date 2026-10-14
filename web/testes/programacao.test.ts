import { describe, expect, it } from "vitest";

import * as md from "@/lib/wcm/programacao";
import * as cal from "@/lib/wcm/calendario";
import { dia } from "@/lib/wcm/util";

/** Porta de tests/test_mudanca_datas.py (consultas, estimativa, lotes) — só dados fictícios. */
const D = (a: number, m: number, d: number) => dia(a, m, d)!;
const ordens = (): md.OrdemCampo[] => [
  ["1", "M1", "Liberada", D(2026, 10, 1), D(2026, 10, 3)], ["2", "M1", "Aberta", D(2026, 10, 20), D(2026, 10, 20)],
  ["3", "M1", "Concluída", D(2026, 10, 2), D(2026, 10, 2)], ["4", "M2", "Liberada", D(2026, 9, 25), D(2026, 9, 25)],
  ["5", "M2", "Liberada", D(2026, 10, 8), D(2026, 10, 9)], ["6", "M3", "Liberada", D(2026, 10, 6), D(2026, 10, 6)],
].map(([ordem, campo, situacao, inicio, fim]) => ({ ordem, campo, situacao, inicio, fim, texto: "t", tipo: "YM13" }) as md.OrdemCampo);

describe("programação do mês", () => {
  it("separa os campos, valida a programação e acha o nome do ativo", () => {
    expect(md.separarCampos(" m1, 41020389;M1\n41019661 ")).toEqual(["M1", "41020389", "41019661"]);
    expect(md.programacaoValida({ "2026-10-07": { campos: ["m1", " "], atualizado_em: "x" }, lixo: ["M2"], "2026-10-08": { campos: [] } }))
      .toEqual({ "2026-10-07": ["M1"] });
    const nomes = md.nomesDeAtivos([
      { equipamento: "E1", campo: "M1", objeto: "INJ 15" }, { equipamento: "E1", campo: "M1", objeto: "INJ 15" },
      { equipamento: "M2", campo: "M2", objeto: "PRENSA" }], [["M2", "PRENSA HIDRÁULICA"]]);
    expect(nomes.M1).toBe("INJ 15");
    expect(nomes.E1).toBe("INJ 15");
    expect(nomes.M2).toBe("PRENSA HIDRÁULICA");
  });

  it("as paradas dividem o mês entre as consultas", () => {
    const prog = { "2026-10-07": ["M1", "M2"], "2026-10-21": ["M1"], "2026-11-04": ["M1"] };
    expect(md.consultas(prog, D(2026, 10, 1), D(2026, 10, 31))).toEqual([
      { dia: "2026-10-07", campos: ["M1"], de: "2026-10-01", ate: "2026-10-07" },
      { dia: "2026-10-07", campos: ["M2"], de: "2026-10-01", ate: "2026-10-31" },
      { dia: "2026-10-21", campos: ["M1"], de: "2026-10-08", ate: "2026-10-31" },
    ]);
    const c = md.consultas(prog, D(2026, 10, 1), D(2026, 10, 10), true);
    expect(c.map((x) => [x.campos, x.de])).toEqual([[["M1"], "2000-01-01"], [["M2"], "2000-01-01"]]);
    expect(md.estimativa(ordens(), c, new Set(["9"]), { M1: "INJ 15" }).map((x) => x.ordem)).toEqual(["1", "4", "5"]);
    const c2 = md.consultas({ "2026-10-07": ["M1", "M2"] }, D(2026, 10, 1), D(2026, 10, 31));
    expect(new Set(md.estimativa(ordens(), c2, new Set(["5"])).map((x) => x.ordem))).toEqual(new Set(["1", "2"]));
  });

  it("lote, desfazer e as datas que o calendário de ordens usa", () => {
    const cons = md.consultas({ "2026-10-07": ["M1"] }, D(2026, 10, 1), D(2026, 10, 31));
    const [id, lote] = md.novoLote(cons, "ANA");
    expect(id).toMatch(/^\d{8}-\d{6}-[0-9a-f]{4}$/);
    expect(lote.status).toBe(md.SOLICITADA);
    expect(lote.consultas).toEqual(cons);
    expect(() => md.novoLote([], "ANA")).toThrow();
    const feito: md.Lote = { ...lote, status: md.COM_ERROS, executado_em: "2026-10-07T12:00:00+00:00", itens: [
      { ordem: "1", campo: "M1", dia: "2026-10-07", de_inicio: "2026-10-01", de_fim: "2026-10-03", para_inicio: "2026-10-07", para_fim: "2026-10-07", resultado: "ok" },
      { ordem: "2", campo: "M1", dia: "2026-10-07", para_inicio: "2026-10-07", para_fim: "2026-10-07", resultado: "erro" }] };
    const ajustes = md.datasAlteradas({ [id]: feito }, "2026-10-06T00:00:00+00:00");
    expect(ajustes).toEqual({ 1: ["2026-10-07", "2026-10-07"] });
    expect(md.datasAlteradas({ [id]: feito }, "2026-10-08T00:00:00+00:00")).toEqual({});
    const o = cal.comDatasAlteradas([{ ordem: "1", data: D(2026, 10, 1), inicio: D(2026, 10, 1), fim: D(2026, 10, 3) }], ajustes)!;
    expect(o[0]).toMatchObject({ data: D(2026, 10, 7), inicio: D(2026, 10, 7), fim: D(2026, 10, 7), ajustada: true });
    const [, volta] = md.loteDesfazer(feito, "ANA");
    expect(volta.itens).toEqual([{ ordem: "1", campo: "M1", dia: "2026-10-01", de_inicio: "2026-10-07", de_fim: "2026-10-07",
      para_inicio: "2026-10-01", para_fim: "2026-10-03", resultado: "", mensagem: "" }]);
    expect(md.tabelaLotes({ [id]: feito })[0]).toMatchObject({ ordens: 2, ok: 1, erros: 1, dias: "07/10", situacao: "Concluída com erros" });
  });

  it("situação do robô pelo sinal de vida", () => {
    const agora = Date.parse("2026-10-12T12:00:00Z");
    const s = md.situacaoRobo({
      PC1: { visto_em: "2026-10-12T11:58:00+00:00", recursos: md.RECURSOS_NECESSARIOS, robo_configurado: true, versao_codigo: "abc" },
      PC2: { visto_em: "2026-10-12T10:00:00+00:00", recursos: md.RECURSOS_NECESSARIOS, robo_configurado: true },
      PC3: { visto_em: "2026-10-12T11:59:00+00:00", recursos: [], robo_configurado: true },
    }, agora);
    expect(s.map((x) => [x.pc, x.estado])).toEqual([["PC3", "desatualizado"], ["PC1", "ok"], ["PC2", "offline"]]);
    expect(md.tempo(130)).toBe("2 h");
  });
});

describe("campo de ordenação geral do ativo (Calendário de ordens)", () => {
  it("um campo por equipamento: o mais usado nas ordens dele; os outros ficam nas ordens", () => {
    const campo = new Map([["1", "LINHA-A"], ["2", " linha-a "], ["3", "LINHA-A-MOTOR"], ["4", "X"]]);
    const g = md.campoGeralPorEquipamento([
      { ordem: "1", equipChave: "EQ1" }, { ordem: "2", equipChave: "EQ1" }, { ordem: "3", equipChave: "EQ1" },
      { ordem: "4", equipChave: "" }, { ordem: "5", equipChave: "EQ2" },
    ], campo);
    expect(g.get("EQ1")).toBe("LINHA-A");
    expect(g.has("EQ2")).toBe(false); // sem campo: o calendário mostra o equipamento
    expect(g.size).toBe(1);
  });
});
