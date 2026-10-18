import { describe, expect, it } from "vitest";

import * as af from "@/lib/wcm/af";
import { identificar } from "@/lib/leitura/tipos";
import { marcarQuebras, type Nota } from "@/lib/wcm/preparo";
import { dia } from "@/lib/wcm/util";

/** Gerenciador de AF em miniatura, com dados fictícios. */
const HOJE = dia(2026, 6, 30)!;
const D = (a: number, m: number, d: number) => `${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}/${a}`;

const COLS_AF = ["Nº da análise", "Tipo de Análise", "Área", "Área da Falha", "Cod SAP", "Equipamento", "Conjunto",
  "Subconjunto", "Componente", "Pilar direcionador", "Causa Raiz", "Especial. da Causa", "Criticidade Equipamento",
  "Nº O.S Corretiva", "Resumo da Falha", "Duração da Parada", "Supervisor Responsável", "Turno", "Status da Análise",
  "Data da Falha", "Data Limite p/ Análise", "Ajuste", "Data da Análise", "Status das ações", "Link da AF",
  "Observações", "Id da Planilha", "Número"];
const COLS_ACAO = ["Nº da Análise", "Nº da Ação", "Tipo de Análise", "Localização Macro", "Área", "Área da Falha",
  "Cod SAP", "Equipamento", "Especialidade de Correção", "O.S de Correção / Plano Sistêmico / Lista", "Link", "Ação",
  "Causa Raiz", "TTR", "Padronização", "Expansão", "Supervisor Responsável", "Responsável", "Status",
  "Data de Início", "Data Limite p/ Ação", "Data Realizada", "Ordem da Quebra", "Observações"];

const linha = (cols: string[], vals: unknown[]) => Object.fromEntries(cols.map((c, i) => [c, vals[i]]));

function umaAf(n: number, crit: string, status: string | null, falha: string, limite: string, analise: string | null,
  { sup = "BETO", ajuste = null as string | null, sap = 41000001 } = {}) {
  return linha(COLS_AF, [n, "GATILHO", "INJ. EXPANSIVOS", "ALPA-A026-2-3-2", sap, "INJETORA 01", "***", null, null, "mp",
    "MANUTENÇÃO INSUFICIENTE", "Mecânica", crit, n, `AF - ${n} - FALHA`, "1.5", sup, "1º", status, falha, limite, ajuste,
    analise, 0.5, "https://exemplo/af", null, "/MP/", n]);
}

const afsCru = () => [
  umaAf(32000001, "A", "AP", D(2026, 6, 1), D(2026, 6, 8), D(2026, 6, 5), { sup: "Diego Santos" }), // no prazo
  umaAf(32000002, "A", "AFP", D(2026, 6, 2), D(2026, 6, 9), D(2026, 6, 12), { sup: "DIEGO SANTOS " }), // fora
  umaAf(32000003, "A", null, D(2026, 6, 20), D(2026, 6, 27), null), // atrasada
  umaAf(32000004, "B", "R", D(2026, 6, 26), D(2026, 7, 3), null), // risco
  umaAf(32000005, "C", "EA", D(2026, 6, 27), D(2026, 7, 4), null), // andamento
  umaAf(32000006, "A", "AP", D(2026, 6, 3), D(2026, 6, 10), D(2026, 6, 4), { ajuste: "Cancelada" }), // cancelada
  umaAf(32000007, "C", null, D(2026, 6, 4), D(2026, 6, 11), D(2026, 6, 10)), // sem código
];

function umaAcao(nAf: number, n: number, acao: string | null, status: string | null, ini: string, limite: string,
  feita: string | null, { resp = "jeferson silva", cr = true as unknown, ttr = false as unknown, pad = "x" as unknown,
    exp = "########" as unknown } = {}) {
  return linha(COLS_ACAO, [nAf, n, "GATILHO", null, null, null, null, null, null, null, null, acao, cr, ttr, pad, exp, "BETO",
    resp, status, ini, limite, feita, nAf, null]);
}

const acoesCru = () => [
  umaAcao(32000001, 1, "Trocar rolamento", "AP", D(2026, 6, 5), D(2026, 6, 15), D(2026, 6, 10)),
  umaAcao(32000001, 2, "Incluir no plano", "AFP", D(2026, 6, 5), D(2026, 6, 15), D(2026, 6, 20), { cr: false }),
  umaAcao(32000002, 1, "Revisar procedimento", null, D(2026, 6, 12), D(2026, 6, 20), null), // atrasada
  umaAcao(32000002, 2, "Treinar equipe", null, D(2026, 6, 12), D(2026, 7, 3), null), // vence em 7 d
  umaAcao(32000003, 1, "Analisar desenho", "EA", D(2026, 6, 25), D(2026, 7, 30), null), // andamento
  umaAcao(32000003, 2, "Comprar peça", null, D(2026, 6, 25), D(2026, 8, 30), null), // não iniciada
  umaAcao(32000004, 1, "Cancelada", "CANCELADA", D(2026, 6, 26), D(2026, 6, 28), D(2026, 6, 28)),
  umaAcao(99999999, 1, "AF antiga fora da aba", null, D(2026, 6, 1), D(2026, 6, 5), D(2026, 6, 4)),
  umaAcao(32000005, 1, null, null, D(2026, 6, 1), D(2026, 6, 5), null), // sem ação: fora
];

const porChave = <T, K extends keyof T>(xs: T[], k: K) => new Map(xs.map((x) => [x[k] as unknown as string, x]));
const preparar = () => {
  const a = af.prepararAfs(afsCru(), HOJE);
  return { a, c: af.prepararAcoes(acoesCru(), HOJE, a) };
};

describe("Gerenciador de AF", () => {
  it("as abas são reconhecidas pelo cabeçalho", () => {
    expect(identificar(COLS_AF)).toBe("af");
    expect(identificar(COLS_ACAO)).toBe("acoes_af");
    expect(identificar(["Equipamento", "Denominação", "Código ABC"])).toBe("ih08"); // o IH08 continua IH08
  });

  it("situação das AFs", () => {
    const a = porChave(af.prepararAfs(afsCru(), HOJE), "numero");
    expect(a.get("32000001")!.situacao).toBe(af.AF_NO_PRAZO);
    expect(a.get("32000002")!.situacao).toBe(af.AF_FORA_PRAZO);
    expect(a.get("32000002")!.diasDeAtraso).toBe(3);
    expect(a.get("32000003")!.situacao).toBe(af.AF_ATRASADA);
    expect(a.get("32000003")!.diasDeAtraso).toBe(3);
    expect(a.get("32000004")!.situacao).toBe(af.AF_RISCO);
    expect(a.get("32000005")!.situacao).toBe(af.AF_ANDAMENTO);
    expect(a.get("32000006")!.situacao).toBe(af.AF_CANCELADA);
    expect(a.get("32000007")!.situacao).toBe(af.AF_NO_PRAZO); // sem código: decide pela data
    expect(a.get("32000001")!.supervisor).toBe("DIEGO SANTOS");
    expect(a.get("32000002")!.supervisor).toBe("DIEGO SANTOS");
    expect(a.get("32000001")!.pilar).toBe("MP");
    expect(a.get("32000001")!.conjunto).toBe(""); // "***" vira vazio
    expect(a.get("32000001")!.pctAcoesConcluidas).toBe(50);
    expect(a.get("32000001")!.diasParaAnalise).toBe(4);
    expect(a.get("32000001")!.codigoSap).toBe("41000001");
    expect(a.get("32000001")!.duracaoParada).toBe(1.5);
    expect(a.get("32000001")!.criticidade).toBe("A");
  });

  it("datas como Date, serial do Excel ou texto", () => {
    expect(af.paraDia(new Date(2026, 5, 1))).toBe(dia(2026, 6, 1));
    expect(af.paraDia(46174)).toBe(dia(2026, 6, 1));
    expect(af.paraDia("46174")).toBe(dia(2026, 6, 1));
    expect(af.paraDia("2026-06-01")).toBe(dia(2026, 6, 1));
    expect(af.paraDia("")).toBeNull();
    expect(af.paraDia(12)).toBeNull();
  });

  it("situação das ações", () => {
    const { c: lista } = preparar();
    expect(lista).toHaveLength(8); // linha sem texto da ação fica fora
    const c = porChave(lista, "id");
    expect(c.get("32000001-1")!.situacao).toBe(af.AC_NO_PRAZO);
    expect(c.get("32000001-2")!.situacao).toBe(af.AC_FORA_PRAZO);
    expect(c.get("32000001-2")!.diasDeAtraso).toBe(5);
    expect(c.get("32000002-1")!.situacao).toBe(af.AC_ATRASADA);
    expect(c.get("32000002-1")!.diasDeAtraso).toBe(10);
    expect(c.get("32000002-2")!.situacao).toBe(af.AC_VENCE);
    expect(c.get("32000003-1")!.situacao).toBe(af.AC_ANDAMENTO);
    expect(c.get("32000003-2")!.situacao).toBe(af.AC_NAO_INICIADA);
    expect(c.get("32000004-1")!.situacao).toBe(af.AC_CANCELADA);
    expect(c.get("32000001-1")!.responsavel).toBe("JEFERSON SILVA");
    // marcações: true / "x" = marcado; false / "########" = não
    expect(c.get("32000001-1")!.tipoDaAcao).toBe("Causa raiz, Padronização");
    expect(af.tiposDaAcao(c.get("32000001-1")!)).toEqual(["Causa raiz", "Padronização"]);
    expect(c.get("32000001-1")!.expansao).toBe(false);
    expect(c.get("32000001-1")!.ttr).toBe(false);
    // dados da AF completam a ação
    expect(c.get("32000002-1")!.criticidade).toBe("A");
    expect(c.get("32000002-1")!.equipamento).toBe("INJETORA 01");
    expect(c.get("32000002-1")!.afCadastrada).toBe(true);
    expect(c.get("99999999-1")!.afCadastrada).toBe(false);
    expect(c.get("32000001-1")!.diasParaConcluir).toBe(5);
    // sem a aba de análises
    const sem = af.prepararAcoes(acoesCru(), HOJE);
    expect(sem.every((x) => !x.afCadastrada && x.criticidade === "" && x.dataFalha == null)).toBe(true);
  });

  it("marcações como vêm do export (texto) também valem", () => {
    expect(["True", "x", "SIM", "1", "verdadeiro"].map(af.marcado)).toEqual([true, true, true, true, true]);
    expect(["False", "", "########", "0"].map(af.marcado)).toEqual([false, false, false, false]);
    expect(af.marcado(1)).toBe(true);
    expect(af.marcado(null)).toBe(false);
  });

  it("indicadores corporativos", () => {
    const { a, c } = preparar();
    const r = af.indicadores(a, c, dia(2026, 6, 1)!, dia(2026, 6, 30)!, HOJE);
    expect(r.af_geradas).toBe(6); // cancelada não conta
    expect(r.af_geradas_a).toBe(3);
    // taxa de quebra crítica A: AFs A com falha no período analisadas (1, 2) ÷ AFs A (1, 2, 3)
    expect(r.taxa_quebra_a).toBeCloseTo(200 / 3);
    expect(r.af_a_no_prazo).toBeCloseTo(100 / 3);
    // execução: data limite no período até hoje → 1, 2, 3, 7; analisadas 1, 2, 7; no prazo 1, 7
    expect(r.af_execucao).toBeCloseTo(75);
    expect(r.af_no_prazo).toBeCloseTo(50);
    expect(r.af_atrasadas).toBe(1);
    expect(r.af_abertas).toBe(3);
    // ações com data limite em junho até hoje (canceladas fora): 1-1, 1-2, 2-1, 9999-1 → 3 realizadas, 2 no prazo
    expect(r.acoes_execucao).toBeCloseTo(75);
    expect(r.acoes_no_prazo).toBeCloseTo(50);
    expect(r.acoes_atrasadas).toBe(1);
    expect(r.acoes_abertas).toBe(4);
    expect(r.quebras_a_iw28).toBeNull();
    // dias para análise: 1 (4 d), 2 (10 d), 7 (6 d)
    expect(r.dias_para_analise).toBeCloseTo(20 / 3);
    expect(r.acoes_por_af).toBeCloseTo(7 / 6); // 7 ações iniciadas (sem a cancelada) ÷ 6 AFs
  });

  it("semanal e mensal", () => {
    const { a, c } = preparar();
    const s = af.semanal(a, c, dia(2026, 6, 1)!, dia(2026, 6, 30)!, HOJE);
    const sem = new Map(s.filter((x) => x.semana === dia(2026, 6, 8)).map((x) => [x.indicador, x]));
    // semana de 08/06: AFs com limite 08, 09 e 11/06 (1, 2, 7) → todas analisadas
    expect(sem.get(af.IND_EXECUCAO_AF)!.gerado).toBe(3);
    expect(sem.get(af.IND_EXECUCAO_AF)!.percentual).toBe(100);
    expect(new Set(s.map((x) => x.indicador))).toEqual(new Set(["Taxa de análise de quebra crítica (A)",
      "Execução de AFs", "Ações de AFs"]));
    // começa na segunda (o 1º/06/2026 é segunda) e vai até a semana do fim
    expect([...new Set(s.map((x) => x.semana))]).toEqual([1, 8, 15, 22, 29].map((d) => dia(2026, 6, d)));
    const m = af.mensal(a, c, dia(2026, 5, 1)!, dia(2026, 6, 30)!, HOJE);
    expect(m.map((x) => x.mes)).toEqual([dia(2026, 5, 1), dia(2026, 6, 1)]);
    expect(m[1].af_geradas).toBe(6);
    expect(m[0].af_geradas).toBe(0);
    // semana que começa num domingo volta para a segunda anterior
    expect(af.semanal(a, c, dia(2026, 6, 7)!, dia(2026, 6, 7)!, HOJE)[0].semana).toBe(dia(2026, 6, 1));
  });

  it("quebras A da IW28 como referência e ações de uma AF", () => {
    const base = { ordem: "", descricao: "", equipamento: "", objeto: "", local: "", centroTrabalho: "", localizacao: "",
      notificador: "", criadoPor: "", plano: "", inicioAvaria: null, fimAvaria: null, dataNota: null, comParada: false,
      horasParado: 0, comOrdem: true, dias: 0, setor: "", tipoOrdem: "", quebra: false };
    const nota = (n: string, tipoNota: string, ordem: string, codigoAbc: string, equipChave: string): Nota =>
      ({ ...base, nota: n, tipoNota, ordem, codigoAbc, data: dia(2026, 6, 2), equipChave });
    const notas = marcarQuebras([nota("1", "Y1", "9", "A", "E1"), nota("2", "Y1", "8", "B", "E2"), nota("3", "Y2", "7", "A", "E3")],
      new Map());
    const { a, c } = preparar();
    expect(af.indicadores(a, c, dia(2026, 6, 1)!, dia(2026, 6, 30)!, HOJE, notas).quebras_a_iw28).toBe(1);
    expect(af.acoesDaAf(c, "32000001").map((x) => x.numeroAcao)).toEqual(["1", "2"]);
  });

  it("filas e cartões das telas", () => {
    const { a, c } = preparar();
    // atrasada (3), risco (4) e em andamento com limite em até 3 dias (5 vence 04/07: fora)
    expect(af.afsEmRisco(a, HOJE).map((x) => x.numero)).toEqual(["32000003", "32000004"]);
    const fila = af.filaDeAcoes(c, HOJE);
    expect(fila.map((x) => x.id)).toEqual(["32000002-1", "32000002-2"]);
    expect(fila[1].venceEmDias).toBe(3);
    expect(fila[0].venceEmDias).toBeNull();
    const ex = af.extrasDasAcoes(c, dia(2026, 6, 1)!, dia(2026, 6, 30)!);
    expect(ex.acoes_vencem_7d).toBe(1);
    // realizadas em junho (sem a cancelada): 1-1 (5 d), 1-2 (15 d), 9999-1 (3 d)
    expect(ex.acoes_dias_concluir).toBeCloseTo(23 / 3);
    expect(ex.acoes_por_af_sem_afs).toBeCloseTo(7 / 4);
    expect(af.COR[af.AF_ATRASADA]).toBe("#E3262B");
    expect(af.SITUACOES_AF).toHaveLength(6);
    expect(af.SITUACOES_ACAO).toHaveLength(7);
  });
});
