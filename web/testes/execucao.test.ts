import { describe, expect, it } from "vitest";

import * as ex from "@/lib/wcm/execucao";
import type { Confirmacao, Operacao, Ordem, Pessoa } from "@/lib/wcm/preparo";
import { paraData, type Dia } from "@/lib/wcm/util";

// os mesmos dados fictícios de tests/test_execucao.py
const T = (s: string): Dia => paraData(s)!;
const HOJE = T("2026-06-30");

const operacao = (p: Partial<Operacao>): Operacao => ({
  ordem: "", operacao: "", tipo: "", centroTrabalho: "", equipamento: "", objeto: "", local: "", textoOperacao: "",
  unidade: "H", statusSistema: "", horas: 0, pessoas: 1, inicio: null, fimReal: null, concluida: false, cancelada: false,
  setor: "", ...p,
});
const ordem = (p: Partial<Ordem>): Ordem => ({
  ordem: "", tipo: "", prioridade: "", texto: "", equipamento: "", objeto: "", local: "", centroTrabalho: "", centroCusto: "",
  localizacao: "", centro: "", plano: "", statusSistema: "", statusUsuario: "", inicio: null, fim: null, entrada: null,
  criadoPor: "", custoReal: 0, custoPlanejado: 0, comPlano: false, natureza: "", situacao: "Aberta", data: null,
  atrasada: false, diasEmAberto: null, duracao: null, equipChave: "", setor: "", busca: "", ...p,
});
const confirmacao = (p: Partial<Confirmacao>): Confirmacao => ({
  np: "", nome: "", ordem: "", operacao: "", statusSistema: "", unidade: "H", centroTrabalho: "", atividade: "", tipo: "",
  equipamento: "", texto: "", causaDesvio: "", horas: 0, data: null, setor: "", ...p,
});

function oper(): Operacao[] {
  const ini = ["2026-06-01", "2026-06-01", "2026-06-10", "2026-06-15", "2026-06-20", "2026-07-10"];
  const fim = ["2026-06-02", "2026-06-03", "2026-06-12", null, null, null];
  return [["1", "0010", "Trocar", "MEC", 2], ["1", "0020", "Testar", "MEC", 1], ["2", "0010", "Lubrificar", "ELE", 4],
    ["3", "0010", "Inspecionar", "MEC", 3], ["4", "0010", "Ajustar", "ELE", 1], ["5", "0010", "Futura", "MEC", 5]]
    .map(([o, op, txt, ctr, h], i) => operacao({
      ordem: o as string, operacao: op as string, textoOperacao: txt as string, centroTrabalho: ctr as string,
      horas: h as number, inicio: T(ini[i]), fimReal: fim[i] ? T(fim[i]!) : null, concluida: i < 3, cancelada: i === 4,
      pessoas: i === 1 ? 2 : 1,
    }));
}

function ordens(): Ordem[] {
  const sit = ["Concluída", "Concluída", "Liberada", "Cancelada", "Aberta"] as const;
  const datas = ["2026-06-01", "2026-06-10", "2026-06-15", "2026-06-20", "2026-07-10"];
  return ["1", "2", "3", "4", "5"].map((o, i) => ordem({
    ordem: o, comPlano: i !== 1, situacao: sit[i], data: T(datas[i]), localizacao: "GAL1", texto: "abcde"[i], natureza: "",
  }));
}

function conf(): Confirmacao[] {
  return [["10", "1", "10", "2026-06-02", 1.5, "MEC"], ["20", "1", "0010", "2026-06-02", 1.0, "MEC"],
    ["10", "2", "0010", "2026-06-12", 3.0, "ELE"], ["30", "9", "0010", "2026-06-20", 2.0, "MEC"]]  // zeros à esquerda diferentes
    .map(([np, o, op, d, h, ctr]) => confirmacao({ np: np as string, ordem: o as string, operacao: op as string,
      data: T(d as string), horas: h as number, centroTrabalho: ctr as string }));
}

const EQUIPE: Pessoa[] = [
  { np: "10", nome: "ANA", cargo: "MECANICO", centroTrabalho: "", area: "X", turma: "1ª", supervisor: "", especialidade: "", setor: "" },
  { np: "20", nome: "BRUNO", cargo: "ELETRICISTA", centroTrabalho: "", area: "X", turma: "2ª", supervisor: "", especialidade: "", setor: "" },
];

const linha = (ops: ex.Atividade[], o: string, op: string) => ops.find((x) => x.ordem === o && x.operacao === op)!;

describe("execução das atividades (IW38OP × IW38 × IW47)", () => {
  it("quem fez cada operação", () => {
    const ops = ex.operacoes(oper(), ordens(), conf(), EQUIPE, HOJE);
    const a = linha(ops, "1", "0010");
    expect(a.executadoPor).toBe("ANA, BRUNO");
    expect(a.hhReal).toBe(2.5);
    expect(a.situacao).toBe(ex.EXECUTADA);
    expect(a.executantes).toBe(2);
    expect(linha(ops, "1", "0020").situacao).toBe(ex.EXECUTADA);   // ordem CONF + ENTE, sem linha na IW47
    expect(linha(ops, "1", "0020").comApontamento).toBe(false);
    expect(linha(ops, "2", "0010").executadoPor).toBe("ANA");
    expect(linha(ops, "3", "0010").situacao).toBe(ex.ATRASADA);
    expect(linha(ops, "4", "0010").situacao).toBe(ex.CANCELADA);
    expect(linha(ops, "5", "0010").situacao).toBe(ex.PROGRAMADA);
    expect(linha(ops, "2", "0010").diasAposProgramacao).toBe(2);
    expect(linha(ops, "1", "0010").area).toBe("GAL1");
    expect(ops.map((o) => o.inicio)).toEqual([...ops.map((o) => o.inicio)].sort((x, y) => x! - y!));
  });

  it("indicadores de execução", () => {
    const ops = ex.operacoes(oper(), ordens(), conf(), EQUIPE, HOJE);
    const ap = ex.apontamentos(conf(), EQUIPE);
    const r = ex.indicadores(ops, ordens(), ap, T("2026-06-01"), T("2026-07-31"), HOJE);
    // programadas no período (sem a cancelada): 1/10, 1/20, 2/10, 3/10, 5/10 → devidas até hoje: 4; executadas: 3
    expect([r.programadas, r.devidas, r.executadas, r.atrasadas]).toEqual([5, 4, 3, 1]);
    expect(r.taxa_execucao).toBeCloseTo(75);
    expect(r.rastreadas).toBeCloseTo(200 / 3);                      // 1/20 sem apontamento
    expect(r.janela_iw47).toEqual([T("2026-06-02"), T("2026-06-20")]);
    expect([r.hh_programadas, r.hh_executadas_plan, r.hh_reais]).toEqual([10, 7, 5.5]);
    expect(r.aderencia_hh).toBeCloseTo((5.5 / 7) * 100);
    // ordens: devidas até hoje sem canceladas → 1, 2, 3; concluídas 1, 2
    expect(r.taxa_ordens).toBeCloseTo(200 / 3);
    expect(r.pessoas).toBe(3);
    expect(r.hh_apontadas).toBe(7.5);
  });

  it("semanal e por pessoa", () => {
    const ops = ex.operacoes(oper(), ordens(), conf(), EQUIPE, HOJE);
    const s = new Map(ex.semanal(ops, T("2026-06-01"), T("2026-07-31"), HOJE).map((x) => [x.semana, x]));
    expect(s.get(T("2026-06-01"))!.programadas).toBe(2);
    expect(s.get(T("2026-06-01"))!.taxa).toBe(100);
    expect(s.get(T("2026-06-15"))!.taxa).toBe(0);
    expect(s.get(T("2026-07-06"))!.taxa).toBeNull();                // semana futura não tem taxa
    const p = new Map(ex.porPessoa(ex.apontamentos(conf(), EQUIPE), ops, EQUIPE, T("2026-06-01"), T("2026-06-30"))
      .map((x) => [x.np, x]));
    expect(p.get("10")!.pessoa).toBe("ANA");
    expect(p.get("10")!.hhApontadas).toBe(4.5);
    expect(p.get("10")!.ordens).toBe(2);
    expect(p.get("10")!.cargo).toBe("MECANICO");
    expect(p.get("10")!.pctHhEmPlano).toBeCloseTo((1.5 / 4.5) * 100); // ordem 1 tem plano, 2 não
    expect(p.get("30")!.pessoa).toBe("30");                           // sem cadastro: a matrícula
    expect(p.get("30")!.pctHhEmPlano).toBeNull();                     // ordem fora do IW38OP
  });

  it("sem dados", () => {
    const vazio = ex.operacoes(null, null, null);
    expect(vazio).toEqual([]);
    const r = ex.indicadores(vazio, null, null, T("2026-06-01"), T("2026-06-30"), HOJE);
    expect(r.taxa_execucao).toBeNull();
    expect(r.taxa_ordens).toBeNull();
    expect(r.pessoas).toBeNull();
  });

  it("rastreabilidade só na janela da IW47", () => {
    // executada antes do primeiro apontamento da IW47 não conta como "sem apontamento"
    const o = oper();
    o[1].fimReal = T("2026-05-20");                                   // 1/20 terminou antes da IW47 começar
    const ops = ex.operacoes(o, ordens(), conf(), EQUIPE, HOJE);
    const r = ex.indicadores(ops, ordens(), ex.apontamentos(conf(), EQUIPE), T("2026-05-01"), T("2026-07-31"), HOJE);
    expect(r.rastreadas).toBeCloseTo(100);
    expect(r.hh_executadas_plan).toBe(6);
  });

  it("status da IW47 e CONF contam como executada", () => {
    // a IW47 exportada depois já traz CONF ENTE; CONF sem linha na IW47 é confirmada no SAP
    const o = oper();
    ["CONF ENTE", "CONF ENTE", "CONF ENTE", "LIB", "LIB", "ELIM ENTE"].forEach((s, i) => (o[i].statusSistema = s));
    o[5].concluida = true;
    const c = [...conf().map((x) => ({ ...x, statusSistema: "CONF LIB" })),
      confirmacao({ np: "20", ordem: "3", operacao: "0010", data: T("2026-06-25"), horas: 2, centroTrabalho: "MEC",
        statusSistema: "CONF ENTE" })];
    const ops = ex.operacoes(o, ordens(), c, EQUIPE, HOJE);
    expect(linha(ops, "1", "0020").situacao).toBe(ex.EXECUTADA);    // CONF no IW38OP, sem linha na IW47
    expect(linha(ops, "3", "0010").situacao).toBe(ex.EXECUTADA);    // LIB no IW38OP, CONF ENTE na IW47
    expect(linha(ops, "3", "0010").fimReal).toBe(T("2026-06-25"));  // fim real = último apontamento
    expect(linha(ops, "5", "0010").situacao).toBe(ex.CANCELADA);    // operação eliminada (ELIM)
    const r = ex.indicadores(ops, ordens(), ex.apontamentos(c, EQUIPE), T("2026-06-01"), T("2026-07-31"), HOJE);
    expect(r.taxa_ordens).toBeCloseTo(100);                          // ordem 3 encerrada pela IW47
  });

  it("encerrada sem confirmação pela ordem", () => {
    const os = ordens();
    os[2].situacao = "Encerrada sem confirmação";                     // ordem 3: ENTE sem CONF
    const ops = ex.operacoes(oper(), os, null, EQUIPE, HOJE);
    expect(linha(ops, "3", "0010").situacao).toBe(ex.SEM_APONTAMENTO);
    expect(ex.SEM_APONTAMENTO).toBe("Encerrada sem confirmação");
  });

  it("IW47: CONF e ENTE em linhas diferentes encerram a ordem", () => {
    const ops = ex.operacoes(oper(), ordens(), conf(), EQUIPE, HOJE);
    const ap = ex.apontamentos(conf(), EQUIPE);
    // ordem 3 (Liberada no IW38): CONF numa linha e ENTE noutra encerra; "PCNF ENTE" (parcial) não conta
    const extra = (st: string[]) => ex.apontamentos(st.map((s) => confirmacao({ np: "10", ordem: "3", data: T("2026-06-16"),
      statusSistema: s })), EQUIPE);
    let r = ex.indicadores(ops, ordens(), [...ap, ...extra(["CONF", "ENTE"])], T("2026-06-01"), T("2026-07-31"), HOJE);
    expect(r.ordens_concluidas).toBe(3);
    expect(r.taxa_ordens).toBeCloseTo(100);
    r = ex.indicadores(ops, ordens(), [...ap, ...extra(["PCNF ENTE", "CONFX"])], T("2026-06-01"), T("2026-07-31"), HOJE);
    expect(r.ordens_concluidas).toBe(2);
  });
});

describe("quadros da tela de execução", () => {
  const ops = ex.operacoes(oper(), ordens(), conf(), EQUIPE, HOJE);

  it("taxa por centro e por área (devidas no período, sem canceladas)", () => {
    const c = ex.execucaoPor(ops, "centroTrabalho", T("2026-06-01"), T("2026-07-31"), HOJE);
    expect(c.map((g) => [g.grupo, g.programadas, g.executadas, g.atrasadas, g.hhProgramadas])).toEqual([
      ["MEC", 3, 2, 1, 6], ["ELE", 1, 1, 0, 4]]);
    expect(c[0].taxa).toBeCloseTo(200 / 3);
    expect(ex.execucaoPor(ops, "natureza", T("2026-06-01"), T("2026-07-31"), HOJE)[0].grupo).toBe("—");
    expect(ex.execucaoPor(ops, "area", T("2026-06-01"), T("2026-07-31"), HOJE)[0].grupo).toBe("GAL1");
  });

  it("período anterior, recorte por centro e lista filtrada", () => {
    expect(ex.periodoAnterior(T("2026-06-01"), T("2026-06-30"))).toEqual([T("2026-05-02"), T("2026-05-31")]);
    const ap = ex.apontamentos(conf(), EQUIPE);
    const r = ex.recortarPorCentros(ops, ap, ordens(), ["ELE"]);
    expect(r.ops.map((o) => o.ordem)).toEqual(["2", "4"]);
    expect(r.ap.map((a) => a.ordem)).toEqual(["2"]);
    expect(r.ordens!.map((o) => o.ordem)).toEqual(["2", "4"]);
    expect(ex.centrosDasAtividades(ops)).toEqual(["ELE", "MEC"]);
    expect(ex.pessoasDasAtividades(ops)).toEqual(["ANA", "BRUNO"]);
    const ini = T("2026-06-01"), fim = T("2026-06-30");
    expect(ex.filtrarAtividades(ops, ini, fim, { busca: "lubrif" }).map((o) => o.ordem)).toEqual(["2"]);
    expect(ex.filtrarAtividades(ops, ini, fim, { pessoas: ["BRUNO"] }).map((o) => o.ordem)).toEqual(["1"]);
    expect(ex.filtrarAtividades(ops, ini, fim, { situacoes: [ex.ATRASADA] }).map((o) => o.ordem)).toEqual(["3"]);
    expect(ex.contarSituacoes(ex.filtrarAtividades(ops, ini, fim))).toEqual([
      { situacao: ex.EXECUTADA, n: 3 }, { situacao: ex.ATRASADA, n: 1 }, { situacao: ex.CANCELADA, n: 1 }]);
    const da = ex.atividadesDaPessoa(ap, ops, "10", ini, fim);
    expect(da.map((a) => [a.ordem, a.textoOperacao, a.situacao])).toEqual([["2", "Lubrificar", ex.EXECUTADA],
      ["1", "Trocar", ex.EXECUTADA]]);
  });
});
