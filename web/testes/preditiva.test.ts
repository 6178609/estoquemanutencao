import { describe, expect, it } from "vitest";

import * as pr from "@/lib/wcm/preditiva";
import type { Confirmacao, Nota, Operacao, Ordem, Pessoa } from "@/lib/wcm/preparo";
import { paraData, type Dia } from "@/lib/wcm/util";

// os mesmos dados fictícios de tests/test_preditiva.py
const T = (s: string): Dia => paraData(s)!;
const HOJE = T("2026-09-30");

const nota = (p: Partial<Nota>): Nota => ({
  nota: "", ordem: "", tipoNota: "", descricao: "", equipamento: "", objeto: "", local: "", centroTrabalho: "MEC",
  localizacao: "GAL1", notificador: "", criadoPor: "", codigoAbc: "", plano: "", inicioAvaria: null, fimAvaria: null,
  dataNota: null, comParada: false, horasParado: 0, comOrdem: false, data: null, dias: null, equipChave: "", setor: "",
  tipoOrdem: "", quebra: false, ...p,
});
const ordem = (p: Partial<Ordem>): Ordem => ({ campo: "",
  ordem: "", tipo: "", prioridade: "", texto: "", equipamento: "", objeto: "", local: "", centroTrabalho: "MEC", centroCusto: "",
  localizacao: "GAL1", centro: "", plano: "", statusSistema: "", statusUsuario: "", inicio: null, fim: null, entrada: null,
  criadoPor: "", custoReal: 0, custoPlanejado: 0, comPlano: false, natureza: "", situacao: "Aberta", data: null,
  atrasada: false, diasEmAberto: null, duracao: null, equipChave: "", setor: "", busca: "", ...p,
});
const operacao = (p: Partial<Operacao>): Operacao => ({
  ordem: "", operacao: "0010", tipo: "", centroTrabalho: "", equipamento: "", objeto: "", local: "", textoOperacao: "",
  unidade: "H", statusSistema: "", horas: 0, pessoas: 1, inicio: null, fimReal: null, concluida: false, cancelada: false,
  setor: "", ...p,
});
const confirmacao = (p: Partial<Confirmacao>): Confirmacao => ({
  np: "", nome: "", ordem: "", operacao: "", statusSistema: "", unidade: "H", centroTrabalho: "", atividade: "", tipo: "",
  equipamento: "", texto: "", causaDesvio: "", horas: 0, data: null, setor: "", ...p,
});

const notas = () => [
  nota({ nota: "n1", descricao: "SEMEQ-AVB-333-DESBALANCEAMENTO", ordem: "100", data: T("2026-08-01"), equipChave: "E1", objeto: "MOTOR 1" }),
  nota({ nota: "n2", descricao: "SEMEQ-AOL-118-CONTAMINAÇÃO", data: T("2026-08-10"), equipChave: "E2", objeto: "REDUTOR 2" }),
  nota({ nota: "n3", descricao: "SEMEQ-TMP-70-TEMPERATURA ELEVADA", data: T("2026-09-20"), equipChave: "E1", objeto: "MOTOR 1" }),
  nota({ nota: "n4", descricao: "TROCA DE CORREIA", data: T("2026-09-01"), equipChave: "E3", objeto: "X" }),
];
const ordens = () => [
  ordem({ ordem: "100", texto: "SEMEQ-AVB-333-DESBALANCEAMENTO", data: T("2026-08-02"), fim: T("2026-08-20"),
    situacao: "Concluída", tipo: "YM14", custoReal: 500, equipChave: "E1", objeto: "MOTOR 1" }),
  ordem({ ordem: "200", texto: "SEMEQ-AOL-118-CONTAMINACAO", data: T("2026-08-12"), fim: T("2026-10-10"),
    situacao: "Liberada", tipo: "YM18", equipChave: "E2", objeto: "REDUTOR 2" }),
  ordem({ ordem: "300", texto: "SEMEQ AVB 0050 FOLGA ROTATIVA", data: T("2026-09-01"), fim: T("2026-10-30"),
    situacao: "Aberta", tipo: "YM14", equipChave: "E4", objeto: "BOMBA 4" }),
  ordem({ ordem: "400", texto: "PREVENTIVA MOTOR", data: T("2026-09-01"), fim: T("2026-09-05"), situacao: "Concluída",
    tipo: "YM15", custoReal: 10, equipChave: "E3", objeto: "X" }),
];
const oper = () => [operacao({ ordem: "100", concluida: true, fimReal: T("2026-08-15") })];
const conf = () => [confirmacao({ ordem: "100", np: "10", horas: 2 }), confirmacao({ ordem: "100", np: "20", horas: 1 })];
const EQUIPE: Pessoa[] = [{ np: "10", nome: "ANA", cargo: "", centroTrabalho: "", area: "", turma: "", supervisor: "",
  especialidade: "", setor: "" }];

const porCodigo = (an: pr.Anomalia[]) => new Map(an.map((a) => [a.codigo, a]));

describe("preditiva SEMEQ (notas × ordens)", () => {
  it("o código SEMEQ no texto", () => {
    expect(pr.partesSemeq("SEMEQ AVB 0050 FOLGA ROTATIVA")).toEqual({ codigo: "AVB-50", sigla: "AVB", achado: "FOLGA ROTATIVA" });
    expect(pr.partesSemeq("semeq-aol-118-contaminação -")).toEqual({ codigo: "AOL-118", sigla: "AOL", achado: "CONTAMINACAO" });
    expect(pr.partesSemeq("SEMEQ sem código").codigo).toBe("");
    expect(pr.ehSemeq("Semeq-x")).toBe(true);
  });

  it("anomalias juntam nota e ordem", () => {
    const a = porCodigo(pr.anomalias(notas(), ordens(), oper(), conf(), EQUIPE, HOJE));
    expect(new Set(a.keys())).toEqual(new Set(["AVB-333", "AOL-118", "TMP-70", "AVB-50"])); // "TROCA DE CORREIA" não é SEMEQ
    // n1 → ordem 100 pelo campo Ordem; tratada; fim real do IW38OP; quem tratou pela IW47
    const x = a.get("AVB-333")!;
    expect([x.nota, x.ordem, x.situacao, x.diasParaTratar]).toEqual(["n1", "100", pr.TRATADA, 14]);
    expect(x.tratadoPor).toBe("ANA, 20");
    expect(x.hhApontadas).toBe(3);
    expect(x.tecnica).toBe("Análise de vibração");
    // n2 → ordem 200 pelo código no texto (acento diferente no achado não atrapalha)
    expect(a.get("AOL-118")!.ordem).toBe("200");
    expect(a.get("AOL-118")!.situacao).toBe(pr.TRATATIVA);
    expect(a.get("AOL-118")!.achado).toBe("Contaminacao");
    expect(a.get("TMP-70")!.situacao).toBe(pr.SEM_ORDEM);
    expect(a.get("TMP-70")!.diasEmAberto).toBe(10);
    expect(a.get("AVB-50")!.nota).toBe("");                           // só a ordem
    expect(a.get("AVB-50")!.equipamento).toBe("E4");
  });

  it("atrasada e indicadores", () => {
    const os = ordens();
    os[1].fim = T("2026-09-01");                                       // ordem 200 vencida e não concluída
    const a = pr.anomalias(notas(), os, oper(), conf(), EQUIPE, HOJE);
    expect(porCodigo(a).get("AOL-118")!.situacao).toBe(pr.ATRASADA);
    const r = pr.indicadores(a, T("2026-08-01"), T("2026-09-30"));
    expect(r.semeq_detectadas).toBe(4);
    expect(r.semeq_com_ordem).toBeCloseTo(75);
    expect(r.semeq_tratadas).toBeCloseTo(25);
    expect([r.semeq_abertas, r.semeq_atrasadas, r.semeq_dias]).toEqual([3, 1, 14]);
    expect([r.semeq_equipamentos, r.semeq_reincidentes]).toEqual([3, 1]); // E1 com 2 anomalias
    expect(r.semeq_custo).toBe(500);
  });

  it("sem dados", () => {
    const vazio = pr.anomalias(null, null);
    expect(vazio).toHaveLength(0);
    const r = pr.indicadores(vazio, T("2026-08-01"), T("2026-09-30"));
    expect(r.semeq_detectadas).toBe(0);
    expect(r.semeq_tratadas).toBeNull();
  });

  it("status CONF ENTE do IW38OP e da IW47", () => {
    // IW38 desatualizado: a IW47/IW38OP já trazem CONF ENTE → tratada; só ENTE sem CONF nem IW47 → sem confirmação
    const os = ordens();
    (["CONF ENTE", "LIB", "ENTE", "CONF ENTE"]).forEach((s, i) => (os[i].statusSistema = s));
    (["Concluída", "Liberada", "Encerrada sem confirmação", "Concluída"] as const).forEach((s, i) => (os[i].situacao = s));
    const c = [confirmacao({ ordem: "200", np: "10", horas: 1, operacao: "0010", data: T("2026-09-10"), statusSistema: "CONF ENTE" })];
    const a = porCodigo(pr.anomalias(notas(), os, oper(), c, EQUIPE, HOJE));
    expect(a.get("AOL-118")!.situacao).toBe(pr.TRATADA);              // LIB no IW38, CONF ENTE na IW47
    expect(a.get("AOL-118")!.fimReal).toBe(T("2026-09-10"));          // fim = último apontamento
    expect(a.get("AOL-118")!.statusSap).toBe("CONF ENTE LIB");
    expect(a.get("AVB-50")!.situacao).toBe(pr.SEM_CONF);              // só ENTE, sem apontamento
    const op = [operacao({ ordem: "300", concluida: true, fimReal: T("2026-09-05"), statusSistema: "CONF ENTE" })];
    const b = porCodigo(pr.anomalias(notas(), os, op, c, EQUIPE, HOJE));
    expect(b.get("AVB-50")!.situacao).toBe(pr.TRATADA);               // CONF ENTE na operação (IW38OP)
  });
});

describe("quadros da tela da preditiva", () => {
  const os = ordens();
  os[1].fim = T("2026-09-01");
  const an = pr.anomalias(notas(), os, oper(), conf(), EQUIPE, HOJE);
  const per = pr.noPeriodo(an, T("2026-08-01"), T("2026-09-30"));

  it("fila, gráficos e reincidência", () => {
    expect(an.map((a) => a.codigo)).toEqual(["TMP-70", "AVB-50", "AOL-118", "AVB-333"]); // mais recentes primeiro
    expect(pr.filaAbertas(an).map((a) => a.codigo)).toEqual(["AOL-118", "AVB-50", "TMP-70"]);
    expect(pr.porMesTecnica(per).map((x) => [x.mesTxt, x.tecnica, x.anomalias])).toEqual([
      ["Ago/26", "Análise de vibração", 1], ["Ago/26", "Análise de óleo", 1], ["Set/26", "Análise de vibração", 1],
      ["Set/26", "Termografia", 1]]);
    expect(pr.situacaoPorTecnica(per).find((x) => x.tecnica === "Análise de vibração" && x.situacao === pr.TRATADA)!
      .anomalias).toBe(1);
    expect(pr.paretoAchados(per, 1)).toHaveLength(1);
    expect(pr.equipamentosMaisAnomalias(per)[0]).toEqual({ equipamento: "E1", nome: "MOTOR 1", anomalias: 2, abertas: 1 });
    expect(pr.hhApontadas(per)).toBe(3);
  });

  it("filtro da tabela", () => {
    const ini = T("2026-09-01"), fim = T("2026-09-30");
    expect(pr.filtrarAnomalias(an, ini, fim).map((a) => a.codigo)).toEqual(["TMP-70", "AVB-50"]);
    expect(pr.filtrarAnomalias(an, ini, fim, { todasAsDatas: true, busca: "ana" }).map((a) => a.codigo)).toEqual(["AVB-333"]);
    expect(pr.filtrarAnomalias(an, ini, fim, { todasAsDatas: true, situacoes: [pr.ATRASADA] }).map((a) => a.codigo))
      .toEqual(["AOL-118"]);
    expect(pr.filtrarAnomalias(an, ini, fim, { tecnicas: ["Termografia"] }).map((a) => a.codigo)).toEqual(["TMP-70"]);
    expect(pr.tecnicasDe(an)).toEqual(["Análise de vibração", "Análise de óleo", "Termografia"]);
  });
});
