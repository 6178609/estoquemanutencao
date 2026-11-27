import { describe, expect, it } from "vitest";

import { iw13EstoqueDemo } from "@/lib/estoque/demo";
import {
  chaveOrdemMaterial, consumo12m, csvHistorico, indicePorMaterial, inicioJanela, type LinhaRetirada, linhasDoHistorico, mesesJanela,
  resumoHistorico, totalValor,
} from "@/lib/estoque/historicoIw13";
import { prepararConsumo } from "@/lib/wcm/consumo";
import { dia } from "@/lib/wcm/util";

// dados FICTÍCIOS (códigos 99xxx, ordens 41xxxxx)
const HOJE = dia(2026, 11, 27)!;
const l = (ordem: string, material: string, quantidade: number, d: [number, number, number] | null, equipamento = "10000001"): LinhaRetirada =>
  ({ ordem, material, quantidade, um: "PC", descricao: "", equipamento, data: d ? dia(...d) : null });

const LINHAS: LinhaRetirada[] = [
  l("4100001", "0000099001", 2, [2026, 11, 10]),
  l("4100002", "99001", 3, [2026, 6, 1]),
  l("4100002", "99001", -1, [2026, 6, 2]), // devolução: abate
  l("4100003", "99001", 5, [2025, 11, 30]), // fora da janela (dez/25 a nov/26)
  l("4100004", "99001", 1, [2025, 12, 1]), // 1º dia da janela
  l("4100005", "99002", 4, [2026, 1, 15]),
  l("4100006", "99002", 0, [2026, 1, 16]), // só reserva: fora
];

describe("janela de 12 meses (dia de Brasília)", () => {
  it("o mês atual e os 11 anteriores", () => {
    const m = mesesJanela(HOJE);
    expect(m).toHaveLength(12);
    expect(m[0]).toEqual({ chave: "2025-12", rotulo: "dez/25" });
    expect(m[11]).toEqual({ chave: "2026-11", rotulo: "nov/26" });
    expect(inicioJanela(HOJE)).toBe("2025-12-01");
    expect(mesesJanela(dia(2026, 1, 5)!)[0].chave).toBe("2025-02");
  });
});

describe("índice e consumo por material", () => {
  const idx = indicePorMaterial(LINHAS);
  it("agrupa pelo código sem zeros, do mais recente ao mais antigo, sem Tomados = 0", () => {
    expect([...idx.keys()].sort()).toEqual(["99001", "99002"]);
    expect(idx.get("99001")!.map((x) => x.ordem)).toEqual(["4100001", "4100002", "4100002", "4100004", "4100003"]);
    expect(idx.get("99002")).toHaveLength(1);
  });
  it("consumo líquido dos 12 meses (devolução abatida, fora da janela fica de fora)", () => {
    const c = consumo12m(idx, HOJE);
    expect(c.get("99001")).toBe(2 + 3 - 1 + 1);
    expect(c.get("99002")).toBe(4);
  });
});

describe("resumo do material", () => {
  it("total, retirado, devolvido, média, último consumo, ordens e barras", () => {
    const r = resumoHistorico(indicePorMaterial(LINHAS).get("99001")!, HOJE);
    expect(r).toMatchObject({ total: 5, retirado: 6, devolvido: 1, ultimo: "2026-11-10", ordens: 3, um: "PC" });
    expect(r.mediaMes).toBeCloseTo(5 / 12, 3);
    expect(r.meses.find((m) => m.chave === "2026-06")!.quantidade).toBe(2);
    expect(r.meses.find((m) => m.chave === "2025-12")!.quantidade).toBe(1);
    expect(r.meses.reduce((s, m) => s + m.quantidade, 0)).toBe(5);
  });
  it("último consumo é a última retirada de qualquer época (a devolução não conta)", () => {
    const r = resumoHistorico([l("1", "99003", -2, [2026, 10, 1]), l("2", "99003", 1, [2024, 3, 1])], HOJE);
    expect(r.ultimo).toBe("2024-03-01");
    expect(r.total).toBe(-2);
  });
});

describe("linhas da tabela", () => {
  const ordens = new Map([["4100002", { tipo: "YM11", texto: "TROCA ROLAMENTO", equipamento: "10000001", denominacao: "PRENSA FICTICIA", quebra: true }]]);
  const val = new Map([[chaveOrdemMaterial("004100002", "99001"), { decisao: "ubm" as const, armario: "UBM-01" }]]);
  it("cruza a IW38 (tipo, denominação, quebra), a validação da UBM e o valor", () => {
    const t = linhasDoHistorico(indicePorMaterial(LINHAS).get("99001")!, ordens, val, 10);
    const r = t.find((x) => x.ordem === "4100002" && !x.devolucao)!;
    expect(r).toMatchObject({ tipo: "YM11", denominacao: "PRENSA FICTICIA", quebra: true, origem: "ubm", armario: "UBM-01", valor: 30 });
    const dev = t.find((x) => x.devolucao)!;
    expect(dev).toMatchObject({ quantidade: -1, valor: -10, origem: "" });
    expect(t.find((x) => x.ordem === "4100001")).toMatchObject({ tipo: "", quebra: false, origem: "" });
    expect(totalValor(t)).toBe(100);
  });
  it("sem preço: valor null; sem permissão: o campo nem existe", () => {
    expect(linhasDoHistorico([LINHAS[0]], null, new Map(), null)[0].valor).toBeNull();
    expect("valor" in linhasDoHistorico([LINHAS[0]], null, new Map())[0]).toBe(false);
  });
  it("CSV com ; e vírgula decimal; coluna Valor só com permissão", () => {
    const t = linhasDoHistorico([l("4100002", "99001", 1.5, [2026, 6, 1])], ordens, val, 2);
    const com = csvHistorico("99001", t, true).split("\r\n");
    expect(com[0]).toContain('"Valor (R$)"');
    expect(com[1]).toContain('"01/06/2026"');
    expect(com[1]).toContain('"1,5"');
    expect(com[1]).toContain('"Veio da UBM (UBM-01)"');
    expect(csvHistorico("99001", t, false)).not.toContain("Valor");
  });
});

describe("IW13 (export): devoluções", () => {
  it("prepararConsumo separa Tomados < 0 em devolucoes, sem mexer nas tomadas", () => {
    const c = prepararConsumo([
      { Ordem: "4100001", Material: "99001", Reservado: "1", UM: "PC", "Texto breve material": "X", Equipamento: "10000001", "Data de lançamento": "10/11/2026", Tomados: "2", "UM.1": "PC" },
      { Ordem: "4100001", Material: "99001", Reservado: "0", UM: "PC", "Texto breve material": "X", Equipamento: "", "Data de lançamento": "11/11/2026", Tomados: "1-", "UM.1": "PC" },
    ]);
    expect(c.tomadas).toHaveLength(1);
    expect(c.devolucoes).toEqual([expect.objectContaining({ ordem: "4100001", material: "99001", quantidade: -1, data: dia(2026, 11, 11) })]);
  });
});

describe("demonstração", () => {
  it("gera retiradas fictícias, uma devolução e as linhas das validações da UBM", () => {
    const ordens = Array.from({ length: 30 }, (_, k) => ({ ordem: String(4100100 + k), equipamento: "10000001", data: HOJE - k * 10 }));
    const r = iw13EstoqueDemo(["99001", "99002"], ordens, HOJE);
    expect(r.filter((x) => x.material === "99001").length).toBeGreaterThan(30);
    expect(r.some((x) => x.quantidade < 0)).toBe(true);
    expect(r.some((x) => x.ordem === "4199001")).toBe(true);
    expect(r.every((x) => x.data == null || x.data <= HOJE)).toBe(true);
  });
});
