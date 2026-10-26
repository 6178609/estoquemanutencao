import { describe, expect, it } from "vitest";

import * as m52 from "@/lib/wcm/mapa52";
import * as planos from "@/lib/wcm/planos";
import { prepararIw38, type Crua } from "@/lib/wcm/preparo";
import { dia } from "@/lib/wcm/util";

/** Só dados fictícios. */
const HOJE = dia(2026, 10, 15)!;
const COLS = ["Plano de manutenção", "Texto plano manut.", "Equipamento", "Denominação do objeto técnico", "Denominação do loc.instalação",
  "Centro trab.respons.", "Data planejada", "St.solicitação", "Ordem", "Pacotes vencidos", "Trabalho", "Unidade do trabalho"];
const tabela = (linhas: string[][]): Crua[] => linhas.map((l) => Object.fromEntries(COLS.map((c, i) => [c, l[i]])));
const A = ["100", "INSPECAO PRENSA", "41000001", "PRENSA X", "LINHA 1", "COMPONEN"];
const B = ["200", "LUBRIF COMPRESSOR", "41000002", "COMPRESSOR Y", "UTIL", "UTILIDAD"];
const ip19 = tabela([
  [...A, "05/10/2026", "Programado,concluído (Inspeção)", "900", "M", "30", "MIN"],
  [...A, "05/10/2026", "Programado,concluído (Inspeção)", "900", "M", "30", "MIN"], // 2ª operação da mesma chamada
  [...A, "02/11/2026", "Programado,solicitado (Inspeção)", "901", "M", "60", "MIN"],
  [...A, "30/11/2026", "Programado,espera (Inspeção)", "", "M", "60", "MIN"],
  [...B, "12/10/2026", "Programado,espera (Preventiva)", "", "4 7", "120", "MIN"],
  [...B, "07/12/2026", "Programado,ignorado (Preventiva)", "", "4 7", "120", "MIN"],
  [...B, "09/11/2026", "Programado,solicitado (Preventiva)", "902", "4 7", "120", "MIN"],
]);
const IW38_COLS = ["Ordem", "Plano de manutenção", "Status do sistema", "Data-base do início", "Centro trab.respons.", "Tipo de ordem"];
const iw38 = prepararIw38([
  ["900", "100", "ENTE CONF", "05/10/2026", "COMPONEN", "YM02"],
  ["901", "100", "LIB", "02/11/2026", "COMPONEN", "YM02"],
  ["902", "200", "ABER", "09/11/2026", "UTILIDAD", "YM02"],
].map((l) => Object.fromEntries(IW38_COLS.map((c, i) => [c, l[i]]))), HOJE).ordens;
const ch = planos.classificar(planos.prepararIp19(ip19), iw38, HOJE);
const per = m52.periodicidades(ch);

describe("Mapa 52 semanas", () => {
  it("status pela IP19 e pelo IW38", () => {
    const st = (d: string) => m52.status52(ch.find((c) => c.dataPlanejada === dia(2026, +d.slice(3, 5), +d.slice(0, 2)))!);
    expect(st("05/10")).toBe(m52.EXECUTADA);
    expect(st("02/11")).toBe(m52.GERADA);
    expect(st("30/11")).toBe(m52.A_GERAR);
    expect(st("09/11")).toBe(m52.PENDENTE); // ordem ainda ABER
    expect(st("07/12")).toBe(m52.SALTADA);
    expect(m52.disciplina(ch[0])).toBe("Inspeção");
  });

  it("periodicidade pelo pacote; sem código legível, pelo intervalo", () => {
    expect(per.get("100")).toEqual({ sigla: "M", nome: "Mensal" });
    expect(per.get("200")!.nome).toBe("Mensal"); // 12/10 → 09/11 → 07/12: 28 dias
  });

  it("ciclo escrito como intervalo", () => {
    const x = { ...ch[0], chave: "X", ciclo: "14 DIA" };
    expect(m52.periodicidades([x]).get("X")).toEqual({ sigla: "Q", nome: "Quinzenal" });
  });

  it("semanas ISO do ano", () => {
    const s26 = m52.semanasDoAno(2026);
    expect(s26).toHaveLength(53);
    expect(s26[0].segunda).toBe(dia(2025, 12, 29));
    expect(m52.semanasDoAno(2027)).toHaveLength(52);
    expect(s26[40].mes).toBe("Out");
  });

  it("mapa: uma linha por plano, células por semana, HH somado e atraso", () => {
    const linhas = m52.mapa(m52.filtrar(ch, { ano: 2026 }, per), per, HOJE, "plano");
    expect(linhas.map((l) => l.chave)).toEqual(["100", "200"]);
    const a = linhas[0];
    expect(a.chamadas).toBe(3);
    expect(a.hh).toBeCloseTo(3); // 1 + 1 + 1
    expect(a.celulas[41]).toMatchObject({ status: m52.EXECUTADA, atrasada: false });
    const b = linhas[1];
    expect(b.celulas[42]).toMatchObject({ status: m52.A_GERAR, atrasada: true }); // 12/10 já passou
  });

  it("filtros e carga semanal sem as saltadas", () => {
    expect(m52.filtrar(ch, { ano: 2026, disciplinas: ["Preventiva"] }, per)).toHaveLength(3);
    expect(m52.filtrar(ch, { ano: 2026, status: [m52.PENDENTE] }, per)).toHaveLength(1);
    expect(m52.filtrar(ch, { ano: 2026, busca: "compressor" }, per)).toHaveLength(3);
    expect(m52.filtrar(ch, { ano: 2027 }, per)).toHaveLength(0);
    const carga = m52.cargaSemanal(ch, m52.semanasDoAno(2026));
    expect(carga[49].hh).toBe(0); // 07/12 saltada
    expect(carga[45]).toMatchObject({ hh: 2, ordens: 1, semOrdem: 0 });
    expect(carga[45].porCentro.UTILIDAD.hh).toBe(2);
    const mes = m52.hhMensal(carga, m52.semanasDoAno(2026));
    expect(mes[10]).toEqual({ Inspeção: 1, Preventiva: 2 }); // 30/11 é da semana de quinta 03/12: dezembro
    expect(mes[11]).toEqual({ Inspeção: 1 });
  });

  it("capacidade: configurada, mesmo centro ou centros de mesmo final", () => {
    const disp: Record<string, [number, number]> = { MEC_COMP: [80, 2], ELE_COMP: [40, 1], ELMCCOMP: [20, 1], MEC_UTIL: [40, 1], GPM: [0, 0] };
    expect(m52.centrosDaEquipe("COMPONEN", Object.keys(disp))).toEqual(["ELE_COMP", "ELMCCOMP", "MEC_COMP"]);
    expect(m52.capacidadeDoCentro("COMPONEN", disp)).toMatchObject({ horas: 140 });
    expect(m52.capacidadeDoCentro("MEC_COMP", disp)).toMatchObject({ horas: 80 });
    expect(m52.capacidadeDoCentro("CORTE", disp).horas).toBeNull();
    expect(m52.capacidadeDoCentro("CORTE", disp, { CORTE: 30 }).horas).toBe(30);
    expect(m52.capacidadeDosCentros(["COMPONEN", "MEC_COMP", "UTILIDAD"], disp)).toBe(180);
    expect(m52.capacidadeTotal(disp)).toBe(180);
    // prefixo só com sublinhado (ou ELMC): MECANICA não vira "ANICA"
    expect(m52.centrosDaEquipe("ANIC", ["MECANICA", "TECELAGE"])).toEqual([]);
    // capacidade configurada em Metas para o centro da equipe vale no lugar do Gerenciador de HH
    expect(m52.capacidadeDoCentro("COMPONEN", disp, { MEC_COMP: 10 }).horas).toBe(70);
    expect(m52.capacidadeDosCentros(["COMPONEN", "MEC_COMP"], disp, { MEC_COMP: 10 })).toBe(70);
    expect(m52.faixa(m52.utilizacao(96, 100))).toBe("Sobrecarga");
    expect(m52.faixa(m52.utilizacao(50, 100))).toBe("Disponível");
    expect(m52.utilizacao(10, null)).toBeNull();
  });
});

describe("Mapa 52 · planejamento executivo", () => {
  const ch26 = m52.filtrar(ch, { ano: 2026 }, per);
  const semanas = m52.semanasDoAno(2026);

  it("curva S pondera pelo HH, sem as saltadas, e o realizado para em hoje", () => {
    const c = m52.curvaS(ch26, semanas, HOJE);
    // HH do ano sem a saltada: 1 + 1 + 1 (plano 100) + 2 + 2 (plano 200) = 7; executada só a de 05/10 (1 HH)
    expect(c[40].previsto).toBeCloseTo((1 / 7) * 100); // semana 41 (05/10)
    expect(c[40].realizado).toBeCloseTo((1 / 7) * 100);
    expect(c[52].previsto).toBeCloseTo(100);
    expect(c[45].realizado).toBeNull(); // semana 46 é depois de hoje (15/10)
  });

  it("avanço por disciplina com desvio e situação", () => {
    const a = m52.avancoPor(ch26, m52.disciplina, HOJE);
    const insp = a.find((x) => x.grupo === "Inspeção")!;
    expect(insp).toMatchObject({ chamadas: 3, previsto: (1 / 3) * 100, realizado: (1 / 3) * 100, situacao: m52.NO_PRAZO, pendentes: 0 });
    const prev = a.find((x) => x.grupo === "Preventiva")!; // 12/10 vencida, não executada; saltada fora
    expect(prev).toMatchObject({ chamadas: 2, previsto: 50, realizado: 0, desvio: -50, situacao: m52.ATRASADA, pendentes: 1 });
    expect(m52.situacaoDesvio(-10)).toBe(m52.ATENCAO);
  });
});
