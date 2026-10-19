import { describe, expect, it } from "vitest";

import { recortarPilarMp } from "@/lib/leitura/indicadoresSim";
import { identificar } from "@/lib/leitura/tipos";
import { ehPercentual } from "@/lib/leitura/xlsx";
import { atinge, mesAnterior, mesesComReal, montarDeck, prepararIndicadoresSim } from "@/lib/wcm/indicadoresSim";

// dados fictícios, no formato da aba BASE MENSAL do Dashboard
const COLUNAS = ["RESPONSÁVEL", "BACKUP", "Pilar", "Fábrica", "ÁREA", "TIPO", "KPIS Industrial", "MÊS/ANO", "Data de atualização", "META SEMANA",
  "SEMANA 1", "SEMANA 2", "SEMANA 3", "SEMANA 4", "SEMANA 5", "META MÊS", "FCST MÊS", "REAL MÊS ", "YTD META", "YTD REAL", "FY META",
  "FY ESTIMATIVA", "FY 2025", "MÊS FÁBRICA", "YTD FÁBRICA", "CRITICO", "CHECK"];
const linha = (pilar: string, area: string, tipo: string, kpi: string, mes: string, meta: string, real: string, extra: Partial<Record<string, string>> = {}) =>
  COLUNAS.map((c) => ({ RESPONSÁVEL: "Pessoa A", BACKUP: "Pessoa B", Pilar: pilar, Fábrica: "F00", ÁREA: area, TIPO: tipo, "KPIS Industrial": kpi,
    "MÊS/ANO": mes, "META MÊS": meta, "REAL MÊS ": real, CRITICO: "NÃO", CHECK: "VERIFICAR", ...extra } as Record<string, string>)[c] ?? "");

describe("Indicadores SIM (pilar MP)", () => {
  it("reconhece a base mensal pelos cabeçalhos", () => {
    expect(identificar(COLUNAS)).toBe("indicadores_sim");
  });
  it("recorta só o pilar MP e tira as colunas de pessoas", () => {
    const t = recortarPilarMp({ colunas: COLUNAS, linhas: [
      linha("MP", "Linha 1", "B", "MTTR", "01/01/2026", "1", "0.8"),
      linha("DC", "Geral", "B", "Custo", "01/01/2026", "10", "9"),
      linha("MP", "Linha 1", "B", "", "01/01/2026", "", ""),
    ] });
    expect(t.linhas).toHaveLength(1);
    expect(t.colunas).not.toContain("RESPONSÁVEL");
    expect(t.colunas).not.toContain("BACKUP");
    expect(t.colunas).not.toContain("CHECK");
    expect(t.colunas).not.toContain("CRITICO");
    expect(t.linhas[0].join("|")).not.toMatch(/Pessoa/);
  });
  it("monta o deck: meta × real, YTD, seta pelo tipo, próximo mês e ano", () => {
    const t = recortarPilarMp({ colunas: COLUNAS, linhas: [
      linha("MP", "Prensas", "B", "MTTR", "01/01/2026", "1", "1.2", { "YTD META": "1", "YTD REAL": "1.2" }),
      linha("MP", "Prensas", "B", "MTTR", "01/02/2026", "1", "0.8", { "YTD META": "1", "YTD REAL": "1", "FY META": "1", "FY ESTIMATIVA": "0.9" }),
      linha("MP", "Prensas", "B", "MTTR", "01/03/2026", "0.9", "", { "FCST MÊS": "0.85" }),
      linha("MP", "Prensas", "A", "MTBF", "01/02/2026", "100", "90"),
      linha("MP", "Area nova", "B", "Indisponibilidade", "01/02/2026", "5", "4"),
    ] });
    const l = prepararIndicadoresSim(t.linhas.map((r) => Object.fromEntries(t.colunas.map((c, i) => [c, r[i]]))));
    expect(mesesComReal(l)).toEqual(["2026-02", "2026-01"]);
    const deck = montarDeck(l, "2026-02");
    expect(deck.map((a) => a.area)).toEqual(["Prensas", "Area nova"]); // a ordem da planilha
    const mttr = deck[0].linhas.find((x) => x.kpi === "MTTR")!;
    expect(deck[0].linhas.map((x) => x.kpi)).toEqual(["MTTR", "MTBF"]);
    expect(mttr.anterior).toEqual({ meta: 1, real: 1.2, ok: false });
    expect(mttr.atual).toMatchObject({ meta: 1, real: 0.8, ok: true, tendencia: "desce", melhorou: true });
    expect(mttr.ytd).toEqual({ meta: 1, real: 1, ok: true });
    expect(mttr.proximo).toEqual({ meta: 0.9, previsao: 0.85 });
    expect(mttr.ano).toEqual({ meta: 1, estimativa: 0.9, ok: true });
    expect(mttr.serie).toEqual([1.2, 0.8]);
    expect(deck[0].linhas[1].atual.ok).toBe(false); // MTBF é tipo A: 90 < 100
  });
  it("regras soltas: atinge, mês anterior e formato de porcentagem", () => {
    expect(atinge("A", 10, 10)).toBe(true);
    expect(atinge("B", 11, 10)).toBe(false);
    expect(atinge("B", null, 10)).toBeNull();
    expect(mesAnterior("2026-01")).toBe("2025-12");
    expect(mesAnterior("2026-12", 1)).toBe("2027-01");
    expect(ehPercentual("0.00%")).toBe(true);
    expect(ehPercentual('0.00" %"')).toBe(false);
    expect(ehPercentual("#,##0.00")).toBe(false);
  });
});
