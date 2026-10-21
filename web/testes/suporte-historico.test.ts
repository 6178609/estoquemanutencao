import { describe, expect, it } from "vitest";

import { historicoDoEquipamento, type OrdemDoHistorico } from "@/lib/suporte/historico";
import type { Quebra } from "@/lib/wcm/indicadores";
import type { Confirmacao } from "@/lib/wcm/preparo";

// dados fictícios: equipamentos EQ-A e EQ-B, ordens e textos de exemplo
const quebra = (equipChave: string, data: number, nota: string): Quebra =>
  ({ equipChave, data, nota, descricao: `Quebra ${nota}`, ordem: "" }) as unknown as Quebra;
const ordem = (ordem: string, tipo: string, equipChave: string): OrdemDoHistorico => ({ ordem, tipo, equipChave });
const conf = (ordem: string, texto: string, tipo = ""): Confirmacao =>
  ({ ordem, texto, tipo, data: 46000 }) as unknown as Confirmacao;

describe("histórico do equipamento", () => {
  it("devolve só as 5 quebras mais recentes do equipamento, da mais nova para a mais antiga", () => {
    const qs = [
      quebra("EQ-A", 46010, "1"), quebra("EQ-A", 46050, "2"), quebra("EQ-B", 46060, "x"),
      quebra("EQ-A", 46020, "3"), quebra("EQ-A", 46080, "4"), quebra("EQ-A", 46030, "5"),
      quebra("EQ-A", 46040, "6"), quebra("EQ-A", 46000, "7"),
    ];
    const r = historicoDoEquipamento("EQ-A", qs, [], []);
    expect(r.quebras.map((q) => q.nota)).toEqual(["4", "2", "6", "5", "3"]);
    expect(r.quebras.every((q) => q.equipChave === "EQ-A")).toBe(true);
  });

  it("sem quebras e sem ordens, o histórico fica vazio", () => {
    expect(historicoDoEquipamento("EQ-C", [quebra("EQ-A", 46000, "1")], [], [])).toEqual({ quebras: [], modos: [] });
  });

  it("os modos contam só as ordens YM11 do equipamento (não as de outro equipamento nem de outro tipo)", () => {
    const ordens = [
      ordem("1001", "YM11", "EQ-A"), ordem("1002", "YM11", "EQ-A"), ordem("1003", "YM01", "EQ-A"),
      ordem("2001", "YM11", "EQ-B"),
    ];
    const conferencias = [
      conf("1001", "Correia rompida no tensor"),
      conf("1002", "Rolamento travado, troca do mancal"),
      conf("1003", "Correia rompida (preventiva)"),
      conf("2001", "Correia rompida também"),
    ];
    const r = historicoDoEquipamento("EQ-A", [], ordens, conferencias);
    const porModo = Object.fromEntries(r.modos.map((m) => [m.modo, m.ordens]));
    // uma ordem pode cair em mais de um modo: 1001 = transmissão + desgaste; 1002 = rolamentos + desgaste
    expect(porModo["Transmissão (correia, corrente, engrenagem)"]).toBe(1); // 1003 (YM01) e 2001 (outro equipamento) fora
    expect(porModo["Rolamentos e mancais"]).toBe(1);
    expect(porModo["Desgaste e ruptura"]).toBe(2);
  });

  it("limita os modos a 5", () => {
    const termos = ["Correia rompida", "Rolamento travado", "Motor queimado", "Vazamento de ar", "Sensor sujo",
      "Graxa seca", "Parafuso solto", "Mangueira furada", "Aquecimento excessivo"];
    const ordens = termos.map((_, i) => ordem(`30${i}`, "YM11", "EQ-A"));
    const conferencias = termos.map((t, i) => conf(`30${i}`, t));
    expect(historicoDoEquipamento("EQ-A", [], ordens, conferencias).modos.length).toBeLessThanOrEqual(5);
  });
});
