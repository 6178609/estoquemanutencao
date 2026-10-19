import { zipSync } from "fflate";
import { describe, expect, it } from "vitest";

import { recortarPilarMp, recortarRoadmap } from "@/lib/leitura/indicadoresSim";
import { identificar } from "@/lib/leitura/tipos";
import { ehPercentual, semPrefixo, Xlsx } from "@/lib/leitura/xlsx";
import { kpisMp, linhasSap } from "@/lib/wcm/simSap";
import { evolucao, pct, pontosAtencao, porArea, porIndicador, resumoSim } from "@/lib/wcm/visaoGeralSim";
import { aplicarComentarios, chaveMaquina, chaveValida, familia, limparComentario, prepararRoadmap, resumir, situacao, ultimoMesComReal } from "@/lib/wcm/roadmapSim";
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

describe("Roadmap SIM (passos por máquina)", () => {
  const MES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
  const CAB = ["FABRICA", "Máquina", ...MES.flatMap((m) => [`Prev ${m}`, `Rel ${m}`]), "COMENTARIO"];

  it("lê o export do Power BI (tags com prefixo x:) e reconhece o roadmap", () => {
    const tag = (t: string) => `<x:c t="inlineStr"><x:is><x:t>${t}</x:t></x:is></x:c>`;
    const num = (n: number) => `<x:c><x:v>${n}</x:v></x:c>`;
    const ns = 'xmlns:x="http://schemas.openxmlformats.org/spreadsheetml/2006/main"';
    const enc = (s: string) => new TextEncoder().encode(s);
    const zip = zipSync({
      "xl/workbook.xml": enc(`<?xml version="1.0"?><x:workbook ${ns}><x:sheets><x:sheet name="Export" sheetId="1" r:id="R1" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" /></x:sheets></x:workbook>`),
      "xl/_rels/workbook.xml.rels": enc(`<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Type="worksheet" Target="/xl/worksheets/sheet1.xml" Id="R1" /></Relationships>`),
      "xl/worksheets/sheet1.xml": enc(`<?xml version="1.0"?><x:worksheet ${ns}><x:sheetData><x:row>${CAB.map(tag).join("")}</x:row><x:row>${tag("F00")}${tag("MAQUINA TESTE 01")}${num(3)}${num(2)}</x:row></x:sheetData></x:worksheet>`),
    });
    const x = new Xlsx(zip);
    const l = x.linhas(x.abas[0]);
    expect(x.abas[0].nome).toBe("Export");
    expect(identificar(l[0] as string[])).toBe("roadmap_sim");
    expect(l[1].slice(0, 4)).toEqual(["F00", "MAQUINA TESTE 01", 3, 2]);
    expect(semPrefixo("<a><b/></a>")).toBe("<a><b/></a>");
  });

  it("recorta (sem o rodapé de filtros), prepara e resume o mês", () => {
    const vazio = () => CAB.map(() => "");
    const linha = (maq: string, prev: (number | "")[], rel: (number | "")[], com = "") => {
      const l = vazio();
      l[0] = "F00"; l[1] = maq; l[CAB.length - 1] = com;
      prev.forEach((v, i) => { l[2 + i * 2] = String(v); });
      rel.forEach((v, i) => { l[3 + i * 2] = String(v); });
      return l;
    };
    const t = recortarRoadmap({ colunas: [...CAB, "Column28"], linhas: [
      [...linha("MAQUINA X 01", [1, 2, 3], [1, 2, 2], "ATRASO DE TESTE"), "x"],
      [...linha("MAQUINA X 02", [1, 2, 3], [1, 2, 3]), "x"],
      [...linha("LINHA Y 1 (TESTE)", [0, 1], [0, 1]), ""],
      [...vazio(), ""],
      ["", "Filtros aplicados:\nAlgo é X", ...vazio().slice(2), ""],
    ] });
    expect(t.colunas).not.toContain("Column28");
    expect(t.linhas).toHaveLength(3);
    const ms = prepararRoadmap(t.linhas.map((r) => Object.fromEntries(t.colunas.map((c, i) => [c, r[i]]))));
    expect(ms[0].previsto.slice(0, 4)).toEqual([1, 2, 3, null]);
    expect(ms[0].comentario).toBe("ATRASO DE TESTE");
    expect(ultimoMesComReal(ms)).toBe(2);
    expect(situacao(3, 2)).toBe("atrasada");
    expect(situacao(3, 3)).toBe("ok");
    expect(situacao(3, null)).toBe("sem");
    expect(resumir(ms, 2)).toMatchObject({ total: 3, ok: 1, atrasadas: 1, semDado: 1 });
    expect(familia("MAQUINA X 02")).toBe("MAQUINA X");
    expect(familia("LINHA Y 1 (TESTE)")).toBe("LINHA Y");
  });
});

describe("Visão geral do SIM", () => {
  const L = (area: string, kpi: string, tipo: "A" | "B", mes: string, meta: number, real: number | null, ytdMeta: number | null = null, ytdReal: number | null = null) =>
    ({ area, kpi, tipo, mes, metaMes: meta, fcstMes: null, realMes: real, ytdMeta, ytdReal, fyMeta: null, fyEstimativa: null, fyAnterior: null, semanas: [] });
  const linhas = [
    L("Area 1", "MTTR", "B", "2026-01", 1, 1.5), L("Area 1", "MTTR", "B", "2026-02", 1, 0.9, 1, 1.2),
    L("Area 1", "MTBF", "A", "2026-02", 100, 120, 100, 90),
    L("Area 2", "MTTR", "B", "2026-02", 1, 2, 1, 1.1),
  ];
  const M = (maquina: string, prev: number[], real: (number | null)[], comentario = "") =>
    ({ fabrica: "F00", maquina, previsto: [...prev, ...Array(12 - prev.length).fill(null)], realizado: [...real, ...Array(12 - real.length).fill(null)], comentario });
  const maquinas = [M("MAQ 1", [1, 2], [1, 1], "ATRASO"), M("MAQ 2", [1, 2], [1, 2]), M("MAQ 3", [0, 1], [0, 1])];

  it("resume o mês juntando indicadores e roadmap", () => {
    const r = resumoSim(linhas, maquinas, "2026-02");
    expect(r.deck).toEqual({ na: 2, de: 3 });
    expect(r.ytd).toEqual({ na: 0, de: 3 });
    expect(r.roadmap).toEqual({ na: 2, de: 3 });
    expect(r.geral).toEqual({ na: 4, de: 6 });
    expect(r.melhoraram).toBe(1); // MTTR da Area 1: 1,5 → 0,9 (tipo B)
    expect(pct(r.geral)).toBeCloseTo(66.67, 1);
    expect(resumoSim(linhas, maquinas, "2026-02", "2025").roadmap).toEqual({ na: 0, de: 0 }); // roadmap de outro ano não entra
  });
  it("evolução, por indicador, por área e pontos de atenção", () => {
    const ev = evolucao(linhas, maquinas, "2026-02");
    expect(ev.map((p) => [p.mes, p.deck, p.roadmap])).toEqual([
      ["2026-01", { na: 0, de: 1 }, { na: 3, de: 3 }], ["2026-02", { na: 2, de: 3 }, { na: 2, de: 3 }]]);
    const ind = porIndicador(linhas, "2026-02");
    expect(ind.map((x) => [x.kpi, x.mes, x.foraDaMeta])).toEqual([["MTTR", { na: 1, de: 2 }, ["Area 2"]], ["MTBF", { na: 1, de: 1 }, []]]);
    expect(ind[0].serie).toEqual([0, 50]);
    expect(porArea(linhas, "2026-02").map((a) => a.area)).toEqual(["Area 2", "Area 1"]); // a pior primeiro
    const at = pontosAtencao(linhas, maquinas, "2026-02");
    expect(at.indicadores.map((x) => `${x.area}|${x.kpi}`)).toEqual(["Area 2|MTTR"]);
    expect(at.maquinas.map((m) => m.maquina)).toEqual(["MAQ 1"]);
  });
});

describe("comentário do Roadmap: planilha ou manual", () => {
  const maq = (maquina: string, comentario: string) => ({ fabrica: "F00", maquina, previsto: [], realizado: [], comentario });
  it("vale o manual quando existe; senão, o da planilha", () => {
    const ms = aplicarComentarios([maq("MAQ 1", "DA PLANILHA"), maq("MAQ 2", "OUTRO")], {
      [chaveMaquina("F00", "MAQ 1")]: { comentario: "  ajustado\nà mão ", atualizado_por: "Pessoa Teste", atualizado_em: "2026-01-02T10:00:00+00:00" },
    });
    expect(ms[0]).toMatchObject({ comentario: "ajustado à mão", comentarioPlanilha: "DA PLANILHA", manual: { texto: "ajustado à mão", por: "Pessoa Teste" } });
    expect(ms[1]).toMatchObject({ comentario: "OUTRO", manual: null });
    // manual vazio apaga o da planilha na tela
    expect(aplicarComentarios([maq("MAQ 1", "X")], { [chaveMaquina("F00", "MAQ 1")]: { comentario: "" } })[0].comentario).toBe("");
  });
  it("limpa o texto e recusa chaves perigosas", () => {
    expect(limparComentario("a​ b".repeat(300)).length).toBe(500);
    expect(chaveValida("__proto__")).toBe(false);
    expect(chaveValida("|")).toBe(false);
    expect(chaveValida(chaveMaquina("F00", "MAQ 1"))).toBe(true);
  });
});

describe("indicadores do SAP no formato do SIM", () => {
  it("KPIs do pilar MP: converte do SAP e compara com a meta da planilha", () => {
    const deck = [
      { area: "A1", kpi: "MTTR", tipo: "B" as const, mes: "2026-02", metaMes: 1, fcstMes: null, realMes: 1.2, ytdMeta: null, ytdReal: null, fyMeta: null, fyEstimativa: null, fyAnterior: null, semanas: [] },
      { area: "A2", kpi: "MTTR", tipo: "B" as const, mes: "2026-02", metaMes: 2, fcstMes: null, realMes: 1, ytdMeta: null, ytdReal: null, fyMeta: null, fyEstimativa: null, fyAnterior: null, semanas: [] },
      { area: "A1", kpi: "Número de quebras totais", tipo: "B" as const, mes: "2026-02", metaMes: 5, fcstMes: null, realMes: 4, ytdMeta: null, ytdReal: null, fyMeta: null, fyEstimativa: null, fyAnterior: null, semanas: [] },
      { area: "A2", kpi: "Número de quebras totais", tipo: "B" as const, mes: "2026-02", metaMes: 3, fcstMes: null, realMes: 2, ytdMeta: null, ytdReal: null, fyMeta: null, fyEstimativa: null, fyAnterior: null, semanas: [] },
    ];
    const mp = kpisMp({ disponibilidade: 97, mttr: 1.4, mtbf: 10, quebras: 9, aderencia: 90 }, { quebras: 30 }, deck, "2026-02");
    const por = Object.fromEntries(mp.map((x) => [x.kpi, x]));
    expect(por.Indisponibilidade.sap).toBe(3);
    expect(por.MTBF.sap).toBe(240); // dias → horas
    expect(por.MTTR).toMatchObject({ sap: 1.4, metaPlanilha: 1.5, realPlanilha: 1.1, ok: true }); // média das áreas
    expect(por["Número de quebras totais"]).toMatchObject({ sap: 9, metaPlanilha: 8, realPlanilha: 6, sapYtd: 30, ok: false }); // soma
    expect(por["Número de quebras MP"].sap).toBeNull(); // não há no SAP
    expect(por["Plano de Manutenção"].sap).toBe(90);
  });
  it("demais indicadores: tipo pelo sentido e farol pela meta", () => {
    const ls = linhasSap({ mttr: 5, quebras: 3 }, { mttr: 3 }, { mttr: 4 }, {});
    const mttr = ls.find((l) => l.kpi.id === "mttr")!;
    expect(mttr).toMatchObject({ tipo: "B", meta: 4, real: 5, anterior: 3, ytd: 4, farol: "vermelho", farolYtd: "verde" });
    expect(ls.find((l) => l.kpi.id === "mtbf")!.tipo).toBe("A");
    expect(ls).toHaveLength(35);
  });
});
