import { describe, expect, it } from "vitest";

import * as ct from "@/lib/wcm/confiabilidadeTipos";
import type { Ordem } from "@/lib/wcm/preparo";
import { dia } from "@/lib/wcm/util";

/** MTBF e MTTR por tipo de ordem (dados fictícios). */
const D = (m: number, d: number) => dia(2026, m, d)!;
const ordem = (p: Partial<Ordem>): Ordem => ({ campo: "",
  ordem: "", tipo: "", prioridade: "", texto: "", equipamento: "", objeto: "", local: "", centroTrabalho: "", centroCusto: "",
  localizacao: "", centro: "", plano: "", statusSistema: "", statusUsuario: "", inicio: null, fim: null, entrada: null, criadoPor: "",
  custoReal: 0, custoPlanejado: 0, comPlano: false, natureza: "", situacao: "Aberta", data: null, atrasada: false, diasEmAberto: null,
  duracao: null, equipChave: "", setor: "", busca: "", ...p,
} as Ordem);

const ordens = [
  ordem({ ordem: "1", tipo: "YM01", situacao: "Concluída", equipChave: "EQ1", objeto: "PRENSA", inicio: D(9, 2), custoReal: 100 }),
  ordem({ ordem: "2", tipo: "YM01", situacao: "Liberada", equipChave: "EQ1", entrada: D(9, 10), custoReal: 50 }),
  ordem({ ordem: "3", tipo: "YM02", situacao: "Concluída", equipChave: "EQ2", inicio: D(9, 15) }),
  ordem({ ordem: "4", tipo: "YM01", situacao: "Cancelada", equipChave: "EQ2", inicio: D(9, 15) }),
  ordem({ ordem: "5", tipo: "YM11", situacao: "Concluída", equipChave: "EQ3", inicio: D(9, 20) }),
  ordem({ ordem: "6", tipo: "YM01", situacao: "Aberta", equipChave: "", inicio: D(9, 20) }),
];

describe("MTBF e MTTR por tipo de ordem", () => {
  it("tipos: sem escolha, todos menos a quebra YM11", () => {
    const disp = ct.tiposDisponiveis(ordens).map((t) => t.tipo);
    expect(disp).toEqual(["YM01", "YM02", "YM11"]);
    expect(ct.tiposEscolhidos([], disp)).toEqual(["YM01", "YM02"]);
    expect(ct.tiposEscolhidos(["YM11", "XX"], disp)).toEqual(["YM11"]);
  });

  it("MTBF = dias × equipamentos ÷ ordens; MTTR = média das horas das ordens com horas", () => {
    const ev = ct.eventos(ordens, new Set(["YM01", "YM02"]), new Map([["1", 2], ["3", 4]]));
    expect(ev.map((e) => e.ordem)).toEqual(["1", "2", "3"]); // sem cancelada, sem equipamento vazio, sem YM11
    const r = ct.resumir(ev, 30);
    expect([r.ordens, r.equipamentos, r.mtbf, r.mttr, r.custo]).toEqual([3, 2, 20, 3, 150]);
    expect(r.disponibilidade).toBeCloseTo((480 / 483) * 100, 6);
    expect(ct.porTipo(ev, 30).map((t) => [t.tipo, t.ordens])).toEqual([["YM01", 2], ["YM02", 1]]);
    const e = ct.porEquipamento(ev, 30);
    expect(e.map((x) => [x.equip, x.mtbf, x.mttr, x.nome, x.tipos])).toEqual([["EQ1", 15, 2, "PRENSA", "YM01"], ["EQ2", 30, 4, "", "YM02"]]);
  });

  it("série mensal de 12 meses, o mês corrente só até hoje", () => {
    const ev = ct.eventos(ordens, new Set(["YM01"]), new Map());
    const s = ct.mensal(ev, D(9, 30), D(9, 20));
    expect(s).toHaveLength(12);
    expect(s[11].resumo.ordens).toBe(2);
    expect(s[11].resumo.mtbf).toBe(10); // 20 dias até hoje × 1 equipamento ÷ 2 ordens
    expect(s[0].resumo.ordens).toBe(0);
  });
});
