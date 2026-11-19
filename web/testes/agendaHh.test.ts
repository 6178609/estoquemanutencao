import { afterEach, describe, expect, it, vi } from "vitest";

import {
  calendario, comparativo, contarDiasUteis, dataDaCelula, disponibilidade, hojeIso, lerBackup, periodoDaVisao,
  prepararImportacao, prepararRestauracao, situacao, sobreposicaoDiasUteis, tecnicosVisiveis, validarProgramacao, validarTecnico,
  type AusenciaExterna, type Periodo, type Programacao, type Tecnico,
} from "@/lib/agendaHh/regras";

// dados fictícios (nomes inventados, NP fictício)
const SEMANA: Periodo = { ini: "2026-11-16", fim: "2026-11-20" }; // segunda a sexta

const tec = (over: Partial<Tecnico> = {}): Tecnico => ({
  id: "a001", nome: "Técnico A", np: "1000001", centro: "Mistura", area: "Prensa", turno: "1º turno", jornada: 8,
  feriasInicio: null, feriasFim: null, folga: null, foto: "", ...over,
});

const prog = (over: Partial<Programacao> = {}): Programacao => ({
  id: "p001", equipamento: "Prensa 1", tipoOrdem: "Corretiva", ordem: "900001", descricao: "Troca de correia", area: "Prensa",
  data: "2026-11-16", turno: "1º turno", status: "programada", minutos: 60, tecnicoId: "a001", tecnicoNome: "Técnico A",
  np: "1000001", criadoEm: "2026-11-10T10:00:00.000Z", historico: [], ...over,
});

afterEach(() => {
  vi.useRealTimers();
});

describe("periodoDaVisao", () => {
  it("dia: início e fim são a própria data", () => {
    expect(periodoDaVisao("dia", "2026-11-19")).toEqual({ ini: "2026-11-19", fim: "2026-11-19" });
  });

  it("semana: sempre segunda a sexta, a partir de qualquer dia (inclusive domingo e sábado)", () => {
    expect(periodoDaVisao("semana", "2026-11-19")).toEqual(SEMANA); // quinta
    expect(periodoDaVisao("semana", "2026-11-16")).toEqual(SEMANA); // segunda
    expect(periodoDaVisao("semana", "2026-11-20")).toEqual(SEMANA); // sexta
    expect(periodoDaVisao("semana", "2026-11-21")).toEqual(SEMANA); // sábado
    expect(periodoDaVisao("semana", "2026-11-22")).toEqual(SEMANA); // domingo
  });

  it("domingo fecha a semana anterior: 15/11 (domingo) é a semana de 09 a 13/11", () => {
    expect(periodoDaVisao("semana", "2026-11-15")).toEqual({ ini: "2026-11-09", fim: "2026-11-13" });
  });

  it("mês: do dia 1 ao último dia (inclui fevereiro bissexto)", () => {
    expect(periodoDaVisao("mes", "2026-11-19")).toEqual({ ini: "2026-11-01", fim: "2026-11-30" });
    expect(periodoDaVisao("mes", "2026-02-10")).toEqual({ ini: "2026-02-01", fim: "2026-02-28" });
    expect(periodoDaVisao("mes", "2028-02-10")).toEqual({ ini: "2028-02-01", fim: "2028-02-29" });
  });

  it("referência inválida usa hoje (fuso de Brasília)", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-19T15:00:00Z"));
    expect(periodoDaVisao("dia", "lixo")).toEqual({ ini: "2026-11-19", fim: "2026-11-19" });
  });
});

describe("hojeIso", () => {
  it("usa a data de Brasília, não a UTC (23h em Brasília já é o mesmo dia; 1h UTC ainda é o dia anterior)", () => {
    expect(hojeIso(new Date("2026-11-20T01:00:00Z"))).toBe("2026-11-19");
    expect(hojeIso(new Date("2026-11-19T02:59:00Z"))).toBe("2026-11-18");
  });
});

describe("contarDiasUteis", () => {
  it("conta segunda a sexta, inclusive", () => {
    expect(contarDiasUteis("2026-11-16", "2026-11-20")).toBe(5);
    expect(contarDiasUteis("2026-11-19", "2026-11-19")).toBe(1);
  });

  it("fim de semana não conta", () => {
    expect(contarDiasUteis("2026-11-14", "2026-11-15")).toBe(0); // sábado e domingo
    expect(contarDiasUteis("2026-11-16", "2026-11-22")).toBe(5); // uma semana inteira com domingo no fim
  });

  it("mês inteiro de novembro/2026 (começa e termina em fim de semana)", () => {
    expect(contarDiasUteis("2026-11-01", "2026-11-30")).toBe(21);
  });

  it("intervalo invertido ou inválido vale 0", () => {
    expect(contarDiasUteis("2026-11-20", "2026-11-16")).toBe(0);
    expect(contarDiasUteis("2026-02-30", "2026-03-02")).toBe(0);
  });
});

describe("sobreposicaoDiasUteis", () => {
  it("sem datas de férias vale 0", () => {
    expect(sobreposicaoDiasUteis(SEMANA.ini, SEMANA.fim, null, null)).toBe(0);
  });

  it("conta só os dias úteis em comum", () => {
    expect(sobreposicaoDiasUteis(SEMANA.ini, SEMANA.fim, "2026-11-18", "2026-11-25")).toBe(3); // qua a sex
  });

  it("sem sobreposição vale 0; intervalo que cobre o período inteiro vale 5", () => {
    expect(sobreposicaoDiasUteis(SEMANA.ini, SEMANA.fim, "2026-11-01", "2026-11-13")).toBe(0);
    expect(sobreposicaoDiasUteis(SEMANA.ini, SEMANA.fim, "2026-11-23", "2026-11-30")).toBe(0);
    expect(sobreposicaoDiasUteis(SEMANA.ini, SEMANA.fim, "2026-11-01", "2026-12-31")).toBe(5);
  });

  it("férias só no fim de semana não contam", () => {
    expect(sobreposicaoDiasUteis(SEMANA.ini, SEMANA.fim, "2026-11-21", "2026-11-22")).toBe(0);
  });
});

describe("disponibilidade", () => {
  it("sem férias, folga nem ausência: dias úteis × jornada", () => {
    const c = disponibilidade(tec(), SEMANA);
    expect(c).toMatchObject({ diasUteis: 5, teorico: 40, diasFerias: 0, horasFerias: 0, diasFolga: 0, horasFolga: 0,
      diasOutras: 0, horasOutras: 0, disponivel: 40 });
  });

  it("férias parciais no período descontam só os dias em comum", () => {
    const c = disponibilidade(tec({ feriasInicio: "2026-11-18", feriasFim: "2026-11-25" }), SEMANA);
    expect(c.diasFerias).toBe(3);
    expect(c.horasFerias).toBe(24);
    expect(c.disponivel).toBe(16);
  });

  it("folga em dia útil desconta uma jornada", () => {
    const c = disponibilidade(tec({ folga: "2026-11-18" }), SEMANA);
    expect(c).toMatchObject({ diasFolga: 1, horasFolga: 8, disponivel: 32 });
  });

  it("folga em fim de semana não desconta", () => {
    const c = disponibilidade(tec({ folga: "2026-11-21" }), SEMANA);
    expect(c).toMatchObject({ diasFolga: 0, horasFolga: 0, disponivel: 40 });
  });

  it("folga dentro das férias não conta duas vezes", () => {
    const c = disponibilidade(tec({ feriasInicio: "2026-11-18", feriasFim: "2026-11-20", folga: "2026-11-19" }), SEMANA);
    expect(c.horasFerias).toBe(24);
    expect(c.diasFolga).toBe(0);
    expect(c.horasFolga).toBe(0);
    expect(c.disponivel).toBe(16); // 40 − 24, sem descontar a folga de novo
  });

  it("folga fora das férias desconta, junto com as férias", () => {
    const c = disponibilidade(tec({ feriasInicio: "2026-11-18", feriasFim: "2026-11-20", folga: "2026-11-16" }), SEMANA);
    expect(c.diasFolga).toBe(1);
    expect(c.disponivel).toBe(8); // 40 − 24 − 8
  });

  it("ausência de dia inteiro da Gestão de HH desconta, e dia coberto por férias não conta de novo", () => {
    const externas: AusenciaExterna[] = [{ tipo: "Treinamento", de: "2026-11-16", ate: "2026-11-18", horas: null }];
    const semFerias = disponibilidade(tec(), SEMANA, externas);
    expect(semFerias).toMatchObject({ diasOutras: 3, horasOutras: 24, disponivel: 16 });

    const comFerias = disponibilidade(tec({ feriasInicio: "2026-11-16", feriasFim: "2026-11-17" }), SEMANA, externas);
    expect(comFerias.diasOutras).toBe(1); // só 18 de novembro
    expect(comFerias.disponivel).toBe(16); // 40 − 16 (férias) − 8 (ausência)
  });

  it("ausência sobre a folga do cadastro não conta o dia da folga como ausência", () => {
    const externas: AusenciaExterna[] = [{ tipo: "Atestado", de: "2026-11-17", ate: "2026-11-19", horas: null }];
    const c = disponibilidade(tec({ folga: "2026-11-18" }), SEMANA, externas);
    expect(c.diasFolga).toBe(1);
    expect(c.diasOutras).toBe(2); // 17 e 19
    expect(c.disponivel).toBe(16); // 40 − 8 (folga) − 16 (ausências)
  });

  it("a mesma ausência repetida no mesmo dia conta uma vez", () => {
    const externas: AusenciaExterna[] = [
      { tipo: "A", de: "2026-11-17", ate: "2026-11-17", horas: null },
      { tipo: "B", de: "2026-11-17", ate: "2026-11-17", horas: null },
    ];
    expect(disponibilidade(tec(), SEMANA, externas).diasOutras).toBe(1);
  });

  it("carga parcial (treinamento de 4 h) desconta só as horas; carga 0 (EAD) não desconta", () => {
    const parcial = disponibilidade(tec(), SEMANA, [{ tipo: "Treinamento", de: "2026-11-17", ate: "2026-11-17", horas: 4 }]);
    expect(parcial).toMatchObject({ diasOutras: 0, horasOutras: 4, disponivel: 36 });
    const ead = disponibilidade(tec(), SEMANA, [{ tipo: "EAD", de: "2026-11-17", ate: "2026-11-17", horas: 0 }]);
    expect(ead.disponivel).toBe(40);
  });

  it("ausências fora do período e em fim de semana não contam", () => {
    const externas: AusenciaExterna[] = [
      { tipo: "A", de: "2026-10-01", ate: "2026-10-31", horas: null },
      { tipo: "B", de: "2026-11-21", ate: "2026-11-22", horas: null },
    ];
    expect(disponibilidade(tec(), SEMANA, externas).disponivel).toBe(40);
  });

  it("nunca fica negativo, mesmo com ausências parciais maiores que a jornada", () => {
    const c = disponibilidade(tec(), SEMANA, [{ tipo: "X", de: "2026-11-16", ate: "2026-11-20", horas: 60 }]);
    expect(c.horasOutras).toBe(40);
    expect(c.disponivel).toBe(0);
  });
});

describe("situacao", () => {
  it("sem nada no período: disponível", () => {
    expect(situacao(disponibilidade(tec(), SEMANA))).toBe("disponivel");
  });

  it("férias parciais: férias no período (ainda sobra horas)", () => {
    expect(situacao(disponibilidade(tec({ feriasInicio: "2026-11-18", feriasFim: "2026-11-25" }), SEMANA))).toBe("ferias");
  });

  it("folga em dia útil: folga no período", () => {
    expect(situacao(disponibilidade(tec({ folga: "2026-11-17" }), SEMANA))).toBe("folga");
  });

  it("ausência da Gestão de HH: ausência", () => {
    const c = disponibilidade(tec(), SEMANA, [{ tipo: "Treinamento", de: "2026-11-17", ate: "2026-11-17", horas: 4 }]);
    expect(situacao(c)).toBe("ausencia");
  });

  it("sem horas disponíveis e com jornada no período: indisponível (vale antes de férias)", () => {
    expect(situacao(disponibilidade(tec({ feriasInicio: "2026-11-16", feriasFim: "2026-11-20" }), SEMANA))).toBe("indisponivel");
  });

  it("jornada zero não é indisponível (não há horas teóricas)", () => {
    expect(situacao(disponibilidade(tec({ jornada: 0 }), SEMANA))).toBe("disponivel");
  });
});

describe("tecnicosVisiveis", () => {
  const A = tec({ id: "a001", nome: "Técnico A", centro: "Mistura", turno: "1º turno", area: "Prensa" }); // disponível 40
  const B = tec({ id: "b002", nome: "Técnico B", np: "1000002", centro: "Prensas", turno: "2º turno", area: "Prensa",
    feriasInicio: "2026-11-16", feriasFim: "2026-11-18" }); // disponível 16
  const C = tec({ id: "c003", nome: "Técnica C", np: "1000003", centro: "Mistura", turno: "1º turno", area: "Injeção", jornada: 6 }); // 30
  const todos = [A, B, C];
  const ids = (l: Tecnico[]) => l.map((t) => t.id);

  it("sem filtro, ordem padrão é a de maior disponibilidade", () => {
    expect(ids(tecnicosVisiveis(todos, SEMANA))).toEqual(["a001", "c003", "b002"]);
    expect(ids(tecnicosVisiveis(todos, SEMANA, { ordem: "maior" }))).toEqual(["a001", "c003", "b002"]);
  });

  it("ordem menor disponibilidade primeiro e ordem por nome", () => {
    expect(ids(tecnicosVisiveis(todos, SEMANA, { ordem: "menor" }))).toEqual(["b002", "c003", "a001"]);
    expect(ids(tecnicosVisiveis(todos, SEMANA, { ordem: "nome" }))).toEqual(["c003", "a001", "b002"]);
  });

  it("filtra por centro, turno e área", () => {
    expect(ids(tecnicosVisiveis(todos, SEMANA, { centro: "Mistura" }))).toEqual(["a001", "c003"]);
    expect(ids(tecnicosVisiveis(todos, SEMANA, { turno: "2º turno" }))).toEqual(["b002"]);
    expect(ids(tecnicosVisiveis(todos, SEMANA, { area: "Prensa" }))).toEqual(["a001", "b002"]);
  });

  it("busca pelo nome: sem diferença de maiúscula/acento e com espaços nas pontas", () => {
    expect(ids(tecnicosVisiveis(todos, SEMANA, { busca: "TÉCNICA" }))).toEqual(["c003"]);
    expect(ids(tecnicosVisiveis(todos, SEMANA, { busca: "  técnico a " }))).toEqual(["a001"]);
  });

  it("filtros combinados e não altera a lista original", () => {
    expect(ids(tecnicosVisiveis(todos, SEMANA, { centro: "Mistura", area: "Injeção" }))).toEqual(["c003"]);
    tecnicosVisiveis(todos, SEMANA, { ordem: "menor" });
    expect(ids(todos)).toEqual(["a001", "b002", "c003"]);
  });
});

describe("comparativo", () => {
  const A = tec({ id: "a001", nome: "Técnico A" }); // disponível 40
  const B = tec({ id: "b002", nome: "Técnico B", np: "1000002", feriasInicio: "2026-11-16", feriasFim: "2026-11-18" }); // 16
  const C = tec({ id: "c003", nome: "Técnica C", np: "1000003", jornada: 6, area: "Injeção" }); // 30
  const lista: Programacao[] = [
    prog({ id: "p1", data: "2026-11-16", minutos: 240, status: "programada", tipoOrdem: "Corretiva", tecnicoId: "a001" }),
    prog({ id: "p2", data: "2026-11-17", minutos: 120, status: "concluida", tipoOrdem: "Preventiva", tecnicoId: "a001" }),
    prog({ id: "p3", data: "2026-11-18", minutos: 480, status: "reprogramada", tipoOrdem: "Corretiva", tecnicoId: "b002" }),
    prog({ id: "p4", data: "2026-11-23", minutos: 60, tecnicoId: "c003" }), // fora do período
    prog({ id: "p5", data: "2026-11-17", minutos: 60, status: "concluida", tipoOrdem: "", tecnicoId: "a001" }),
  ];

  it("saldo e ocupação por técnico (horas programadas no período)", () => {
    const r = comparativo([A, B, C], lista, SEMANA);
    const linha = (id: string) => r.linhas.find((l) => l.tecnico.id === id)!;
    expect(linha("a001")).toMatchObject({ disponivel: 40, programado: 7, saldo: 33 });
    expect(linha("a001").ocupacao).toBeCloseTo(17.5, 6);
    expect(linha("b002")).toMatchObject({ disponivel: 16, programado: 8, saldo: 8 });
    expect(linha("b002").ocupacao).toBeCloseTo(50, 6);
    expect(linha("c003")).toMatchObject({ disponivel: 30, programado: 0, saldo: 30, ocupacao: 0 });
  });

  it("totais do período, ocupação geral e linhas em ordem de nome", () => {
    const r = comparativo([A, B, C], lista, SEMANA);
    expect(r.linhas.map((l) => l.tecnico.id)).toEqual(["c003", "a001", "b002"]);
    expect(r.disponivel).toBe(86);
    expect(r.programado).toBe(15);
    expect(r.saldo).toBe(71);
    expect(r.ocupacao).toBeCloseTo(17.4419, 3);
  });

  it("aderência = concluídas ÷ programações do período; tipos de ordem somados", () => {
    const r = comparativo([A, B, C], lista, SEMANA);
    expect(r.programacoes).toBe(4);
    expect(r.concluidas).toBe(2);
    expect(r.aderencia).toBeCloseTo(50, 6);
    expect(r.porTipo).toEqual([
      { rotulo: "Corretiva", valor: 12 },
      { rotulo: "Preventiva", valor: 2 },
      { rotulo: "Sem tipo", valor: 1 },
    ]);
  });

  it("filtra por área e por técnico", () => {
    const porArea = comparativo([A, B, C], lista, SEMANA, { area: "Prensa" });
    expect(porArea.linhas.map((l) => l.tecnico.id)).toEqual(["a001", "b002"]);
    const so = comparativo([A, B, C], lista, SEMANA, { tecnicoId: "c003" });
    expect(so.linhas.map((l) => l.tecnico.id)).toEqual(["c003"]);
  });

  it("sem disponibilidade e com programação: ocupação 100% e saldo negativo; sem programação: 0%", () => {
    const D = tec({ id: "d004", nome: "Técnico D", np: "1000004", feriasInicio: "2026-11-16", feriasFim: "2026-11-20" });
    const r = comparativo([D], [prog({ data: "2026-11-18", minutos: 120, tecnicoId: "d004" })], SEMANA);
    expect(r.linhas[0]).toMatchObject({ disponivel: 0, programado: 2, saldo: -2, ocupacao: 100 });
    const vazio = comparativo([D], [], SEMANA);
    expect(vazio.linhas[0].ocupacao).toBe(0);
    expect(vazio.ocupacao).toBe(0);
  });

  it("sem técnicos: totais zerados e aderência nula", () => {
    const r = comparativo([], lista, SEMANA);
    expect(r).toMatchObject({ linhas: [], disponivel: 0, programado: 0, saldo: 0, ocupacao: 0, aderencia: null, programacoes: 0 });
  });
});

describe("calendario", () => {
  const lista: Programacao[] = [
    prog({ id: "x1", data: "2026-11-16", turno: "1º turno", equipamento: "Prensa 1", minutos: 60, status: "programada",
      tecnicoNome: "Técnico A", descricao: "Troca de correia" }),
    prog({ id: "x2", data: "2026-11-16", turno: "1º turno", equipamento: "prensa 1", minutos: 30, status: "reprogramada",
      tecnicoNome: "Técnico B", descricao: "Troca de correia", tecnicoId: "b002" }),
    prog({ id: "x3", data: "2026-11-16", turno: "", equipamento: "Prensa 1", minutos: 45, status: "concluida", tecnicoNome: "" }),
    prog({ id: "x4", data: "2026-11-18", turno: "2º turno", equipamento: "Injetora 2", minutos: 90, status: "concluida",
      tecnicoNome: "Técnico A", area: "Injeção" }),
    prog({ id: "x5", data: "2026-11-30", turno: "1º turno", equipamento: "Prensa 1", minutos: 10 }), // fora do período
  ];

  it("lista os dias úteis do período e os dias com programação", () => {
    const r = calendario(lista, SEMANA);
    expect(r.datas).toEqual(["2026-11-16", "2026-11-17", "2026-11-18", "2026-11-19", "2026-11-20"]);
    expect([...r.dias.keys()].sort()).toEqual(["2026-11-16", "2026-11-18"]);
    expect(r.diasComProgramacao).toBe(2);
    expect(r.total).toBe(4);
  });

  it("agrupa por turno + equipamento (sem diferença de maiúscula), somando minutos e reunindo técnicos e descrições", () => {
    const itens = calendario(lista, SEMANA).dias.get("2026-11-16")!;
    expect(itens).toHaveLength(2);
    const turno1 = itens.find((i) => i.turno === "1º turno")!;
    expect(turno1).toEqual({
      id: "x1", equipamento: "Prensa 1", turno: "1º turno", status: "reprogramada", minutos: 90, quantidade: 2, ids: ["x1", "x2"],
      tecnicos: ["Técnico A", "Técnico B"], descricoes: ["Troca de correia"],
    });
    const semTurno = itens.find((i) => i.turno === "")!;
    expect(semTurno).toMatchObject({ minutos: 45, status: "concluida", quantidade: 1, tecnicos: [] });
  });

  it("equipamentos distintos ignoram maiúscula; total e dias seguem o filtro", () => {
    const r = calendario(lista, SEMANA);
    expect(r.equipamentos).toBe(2);
    const turno2 = calendario(lista, SEMANA, { turno: "2º turno" });
    expect(turno2.total).toBe(1);
    expect([...turno2.dias.keys()]).toEqual(["2026-11-18"]);
    expect(turno2.equipamentos).toBe(1);
    expect(calendario(lista, SEMANA, { turno: "sem turno" }).total).toBe(1);
    expect(calendario(lista, SEMANA, { area: "Injeção" }).total).toBe(1);
  });
});

describe("validarTecnico", () => {
  const ok = { nome: "  Técnico   A ", np: "1000001", centro: "Mistura", area: "Prensa", turno: "1º turno", jornada: "8",
    feriasInicio: null, feriasFim: null, folga: "", foto: "" };

  it("aceita cadastro completo, normaliza espaços e trata folga vazia como ausente", () => {
    const r = validarTecnico(ok);
    expect(r).toEqual({ ok: true, valor: { nome: "Técnico A", np: "1000001", centro: "Mistura", area: "Prensa", turno: "1º turno",
      jornada: 8, feriasInicio: null, feriasFim: null, folga: null, foto: "" } });
  });

  it("nome, NP, centro, área, turno e jornada são obrigatórios", () => {
    const r = validarTecnico({});
    expect(r.ok).toBe(false);
    if (!r.ok) expect(Object.keys(r.erros).sort()).toEqual(["area", "centro", "jornada", "nome", "np", "turno"]);
  });

  it("modo legado: NP 'Não informado' e área vazia são aceitos", () => {
    const r = validarTecnico({ ...ok, np: "Não informado", area: "" }, { legado: true });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.valor).toMatchObject({ np: "", area: "" });
  });

  it("turno tem de ser um dos turnos de técnico (fora do modo legado)", () => {
    expect(validarTecnico({ ...ok, turno: "Administrativo" }).ok).toBe(true);
    const r = validarTecnico({ ...ok, turno: "Diurno" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.erros.turno).toBe("Turno inválido.");
  });

  it("jornada entre 1 e 24 h, aceita vírgula e arredonda em centésimos", () => {
    const erro = (jornada: unknown) => {
      const r = validarTecnico({ ...ok, jornada });
      return r.ok ? null : r.erros.jornada;
    };
    expect(erro("0")).toBe("Informe uma jornada entre 1 e 24 horas.");
    expect(erro("25")).toBe("Informe uma jornada entre 1 e 24 horas.");
    expect(erro("abc")).toBe("Informe uma jornada entre 1 e 24 horas.");
    expect(erro("")).toBe("Informe uma jornada entre 1 e 24 horas.");
    expect(erro("1")).toBeNull();
    expect(erro("24")).toBeNull();
    expect(erro("7,5")).toBeNull();
    const r = validarTecnico({ ...ok, jornada: "7,456" });
    expect(r.ok && r.valor.jornada).toBe(7.46);
  });

  it("férias: com só uma data é erro; fim antes do início é erro; data inválida é erro", () => {
    const so = validarTecnico({ ...ok, feriasInicio: "2026-11-16", feriasFim: "" });
    expect(so.ok).toBe(false);
    if (!so.ok) expect(so.erros.feriasFim).toBe("Informe as duas datas das férias.");

    const invertida = validarTecnico({ ...ok, feriasInicio: "2026-11-20", feriasFim: "2026-11-16" });
    expect(invertida.ok).toBe(false);
    if (!invertida.ok) expect(invertida.erros.feriasFim).toBe("A data final deve ser igual ou posterior ao início.");

    const invalida = validarTecnico({ ...ok, feriasInicio: "2026-02-30", feriasFim: "2026-03-02" });
    expect(invalida.ok).toBe(false);
    if (!invalida.ok) expect(invalida.erros.feriasFim).toBe("Data das férias inválida.");

    expect(validarTecnico({ ...ok, feriasInicio: "2026-11-16", feriasFim: "2026-11-16" }).ok).toBe(true);
  });

  it("folga inválida é erro; folga válida é aceita", () => {
    const r = validarTecnico({ ...ok, folga: "2026-13-01" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.erros.folga).toBe("Data de folga inválida.");
    expect(validarTecnico({ ...ok, folga: "2026-11-18" })).toMatchObject({ ok: true, valor: { folga: "2026-11-18" } });
  });

  it("foto: só data URL de imagem jpeg/png/webp em base64", () => {
    expect(validarTecnico({ ...ok, foto: "data:image/png;base64,AAAA" }).ok).toBe(true);
    const r = validarTecnico({ ...ok, foto: "data:image/gif;base64,AAAA" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.erros.foto).toBeDefined();
  });

  it("nome é cortado em 80 caracteres", () => {
    const r = validarTecnico({ ...ok, nome: "A".repeat(100) });
    expect(r.ok && r.valor.nome.length).toBe(80);
  });
});

describe("validarProgramacao", () => {
  const tecnicos = [tec()];
  const ok = { equipamento: "Prensa 1", tipoOrdem: "Corretiva", ordem: "900001", descricao: "Troca de correia", area: "Prensa",
    data: "2026-11-16", turno: "1º turno", status: "programada", minutos: "120", tecnicoId: "a001" };

  it("aceita programação completa e preenche o técnico pelo cadastro", () => {
    const r = validarProgramacao(ok, tecnicos);
    expect(r).toEqual({ ok: true, valor: { equipamento: "Prensa 1", tipoOrdem: "Corretiva", ordem: "900001", descricao: "Troca de correia",
      area: "Prensa", data: "2026-11-16", turno: "1º turno", status: "programada", minutos: 120, tecnicoId: "a001",
      tecnicoNome: "Técnico A", np: "1000001" } });
  });

  it("campos obrigatórios vazios geram erros", () => {
    const r = validarProgramacao({}, tecnicos);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(Object.keys(r.erros).sort()).toEqual(
      ["area", "data", "descricao", "equipamento", "minutos", "ordem", "status", "tecnicoId", "tipoOrdem", "turno"].sort());
  });

  it("minutos: inteiro de 1 a 10.080", () => {
    const erro = (minutos: string) => {
      const r = validarProgramacao({ ...ok, minutos }, tecnicos);
      return r.ok ? null : r.erros.minutos;
    };
    expect(erro("0")).toBeDefined();
    expect(erro("10081")).toBeDefined();
    expect(erro("1.5")).toBeDefined();
    expect(erro("abc")).toBeDefined();
    expect(erro("")).toBeDefined();
    expect(erro("1")).toBeNull();
    expect(erro("10080")).toBeNull();
  });

  it("turno: 1º ou 2º; vazio só se for registro antigo (semTurnoPermitido)", () => {
    const r = validarProgramacao({ ...ok, turno: "3º turno" }, tecnicos);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.erros.turno).toBe("Selecione o 1º ou 2º turno.");
    expect(validarProgramacao({ ...ok, turno: "" }, tecnicos).ok).toBe(false);
    const antigo = validarProgramacao({ ...ok, turno: "" }, tecnicos, { semTurnoPermitido: true });
    expect(antigo.ok && antigo.valor.turno).toBe("");
  });

  it("status inválido, data inválida e técnico não cadastrado são erros", () => {
    const st = validarProgramacao({ ...ok, status: "xyz" }, tecnicos);
    expect(st.ok).toBe(false);
    if (!st.ok) expect(st.erros.status).toBe("Status inválido.");
    const dt = validarProgramacao({ ...ok, data: "2026-02-30" }, tecnicos);
    expect(dt.ok).toBe(false);
    if (!dt.ok) expect(dt.erros.data).toBe("Informe a data programada.");
    const tc = validarProgramacao({ ...ok, tecnicoId: "zz999" }, tecnicos);
    expect(tc.ok).toBe(false);
    if (!tc.ok) expect(tc.erros.tecnicoId).toBe("Selecione o técnico responsável.");
  });
});

describe("dataDaCelula", () => {
  it("objeto de data do leitor de planilha (ano, mês, dia)", () => {
    expect(dataDaCelula({ ano: 2026, mes: 11, dia: 16 })).toBe("2026-11-16");
    expect(dataDaCelula({ ano: 2026, mes: 2, dia: 30 })).toBe("");
  });

  it("número de série do Excel (2025-01-01 = 45658; 2026-11-19 = 46345)", () => {
    expect(dataDaCelula(45658)).toBe("2025-01-01");
    expect(dataDaCelula(46345)).toBe("2026-11-19");
    expect(dataDaCelula(46345.75)).toBe("2026-11-19");
    expect(dataDaCelula(0)).toBe("");
  });

  it("texto aaaa-mm-dd ou dd/mm/aaaa (também com hífen e dia sem zero à esquerda)", () => {
    expect(dataDaCelula("2026-11-16")).toBe("2026-11-16");
    expect(dataDaCelula("16/11/2026")).toBe("2026-11-16");
    expect(dataDaCelula("6/3/2026")).toBe("2026-03-06");
    expect(dataDaCelula("16-11-2026")).toBe("2026-11-16");
  });

  it("entradas inválidas ou vazias viram texto vazio", () => {
    expect(dataDaCelula("31/02/2026")).toBe("");
    expect(dataDaCelula("")).toBe("");
    expect(dataDaCelula(null)).toBe("");
    expect(dataDaCelula(undefined)).toBe("");
    expect(dataDaCelula("amanhã")).toBe("");
  });
});

describe("prepararImportacao", () => {
  const tecnicos = [tec()];
  const linhaOk = {
    Equipamento: "Prensa 1", "Tipo de Ordem": "Corretiva", Ordem: "900001", Descrição: "Troca de correia",
    "Área de Atuação": "Prensa", "Data Programada": 46345, Turno: "1º turno", Status: "Programada", "Tempo em Min": "120", NP: "1000001",
  };

  it("linhas válidas viram itens com data, status e técnico resolvidos (linha 2 = primeira linha de dados)", () => {
    const r = prepararImportacao([linhaOk], tecnicos);
    expect(r.erros).toEqual([]);
    expect(r.itens).toHaveLength(1);
    expect(r.itens[0].linha).toBe(2);
    expect(r.itens[0].entrada).toMatchObject({ equipamento: "Prensa 1", data: "2026-11-19", status: "programada", minutos: 120,
      tecnicoId: "a001", turno: "1º turno" });
  });

  it("linha com problemas vira erro com o número da linha e os campos faltantes; as outras continuam", () => {
    const r = prepararImportacao([
      linhaOk,
      { ...linhaOk, Equipamento: "", NP: "9999999" },
      { ...linhaOk, Turno: "3º turno", "Tempo em Min": "10081", Status: "Cancelado" },
    ], tecnicos);
    expect(r.itens.map((i) => i.linha)).toEqual([2]);
    expect(r.erros).toHaveLength(2);
    expect(r.erros[0]).toBe("Linha 3: Equipamento, NP não cadastrado");
    expect(r.erros[1]).toBe("Linha 4: Status, Turno (1º turno ou 2º turno), Tempo em Min");
  });

  it("status concluída (com acento) é aceito; minutos fracionários são erro", () => {
    expect(prepararImportacao([{ ...linhaOk, Status: "Concluída" }], tecnicos).itens).toHaveLength(1);
    const r = prepararImportacao([{ ...linhaOk, "Tempo em Min": "1,5" }], tecnicos);
    expect(r.erros[0]).toBe("Linha 2: Tempo em Min");
  });

  it("planilha vazia e planilha com mais de 500 linhas são recusadas", () => {
    expect(prepararImportacao([], tecnicos)).toEqual({ itens: [], erros: ["A planilha não possui linhas preenchidas."] });
    const muitas = Array.from({ length: 501 }, () => linhaOk);
    const r = prepararImportacao(muitas, tecnicos);
    expect(r.itens).toEqual([]);
    expect(r.erros).toEqual(["A planilha passa de 500 linhas preenchidas: importe no máximo 500 linhas por vez (divida em mais de um arquivo). Nada foi importado."]);
  });
});

describe("lerBackup", () => {
  const tecnicoBackup = { id: "tec-0001", name: "Técnico A", personalNumber: "1000001", center: "Mistura", area: "Prensa",
    shift: "1º turno", dailyHours: 8, vacationStart: null, vacationEnd: null, dayOffDate: null, photo: "" };
  const programaBackup = { id: "prog-0001", equipment: "Prensa 1", orderType: "Corretiva", orderNumber: "900001",
    description: "Troca de correia", area: "Prensa", scheduledDate: "2026-11-16", shift: "1º turno", status: "programada",
    durationMinutes: 60, technicianId: "tec-0001", technicianName: "Técnico A", personalNumber: "1000001",
    createdAt: "2026-11-10T10:00:00.000Z",
    rescheduleHistory: [{ from: "2026-11-15", to: "2026-11-16", at: "2026-11-10T10:00:00.000Z", by: "Administrador" }] };

  it("backup válido no formato do app original (técnicos e programação) é lido com os nomes de campo traduzidos", () => {
    const r = lerBackup({ version: 1, technicians: [tecnicoBackup], programming: [programaBackup] });
    expect(r).not.toBeNull();
    expect(r!.tecnicos[0]).toMatchObject({ id: "tec-0001", nome: "Técnico A", np: "1000001", centro: "Mistura", jornada: 8 });
    expect(r!.programacoes[0]).toMatchObject({ id: "prog-0001", equipamento: "Prensa 1", ordem: "900001", data: "2026-11-16",
      tecnicoId: "tec-0001", minutos: 60,
      historico: [{ de: "2026-11-15", para: "2026-11-16", em: "2026-11-10T10:00:00.000Z", por: "Administrador" }] });
  });

  it("aceita a lista de programação com outro nome (entries) e uma lista pura de técnicos", () => {
    const comEntries = lerBackup({ technicians: [tecnicoBackup], entries: [programaBackup] });
    expect(comEntries!.programacoes).toHaveLength(1);
    const lista = lerBackup([tecnicoBackup, null, "lixo"]);
    expect(lista!.tecnicos).toHaveLength(1);
    expect(lista!.programacoes).toEqual([]);
  });

  it("JSON que não é backup (nulo, texto, objeto sem lista de técnicos) devolve null", () => {
    expect(lerBackup(null)).toBeNull();
    expect(lerBackup("texto")).toBeNull();
    expect(lerBackup({ foo: 1 })).toBeNull();
    expect(lerBackup({ technicians: "x" })).toBeNull();
  });

  it("lista de técnicos vazia ainda é backup válido", () => {
    expect(lerBackup({ technicians: [] })).toEqual({ tecnicos: [], programacoes: [] });
  });
});

describe("prepararRestauracao", () => {
  let n = 0;
  const novoId = () => `novo-${++n}`;
  const tecnicoBackup = { id: "tec-0001", name: "Técnico A", personalNumber: "1000001", center: "Mistura", area: "Prensa",
    shift: "1º turno", dailyHours: 8, photo: "" };
  const programaBackup = { id: "prog-0001", equipment: "Prensa 1", orderType: "Corretiva", orderNumber: "900001",
    description: "Troca de correia", area: "Prensa", scheduledDate: "2026-11-16", shift: "1º turno", status: "programada",
    durationMinutes: 60, technicianId: "tec-0001", technicianName: "Técnico A", personalNumber: "1000001",
    createdAt: "2026-11-10T10:00:00.000Z", rescheduleHistory: [] };

  it("backup válido: mantém ids válidos e liga a programação ao técnico pelo id", () => {
    n = 0;
    const r = prepararRestauracao(lerBackup({ technicians: [tecnicoBackup], programming: [programaBackup] })!, novoId);
    expect(r.avisos).toEqual([]);
    expect(r.tecnicos[0]).toEqual({ id: "tec-0001", nome: "Técnico A", np: "1000001", centro: "Mistura", area: "Prensa",
      turno: "1º turno", jornada: 8, feriasInicio: null, feriasFim: null, folga: null, foto: "" });
    expect(r.programacoes[0]).toMatchObject({ id: "prog-0001", tecnicoId: "tec-0001", tecnicoNome: "Técnico A", np: "1000001",
      minutos: 60, criadoEm: "2026-11-10T10:00:00.000Z" });
  });

  it("sem id de técnico válido, liga pelo NP; ids inválidos ou repetidos ganham id novo", () => {
    n = 0;
    const semId = { ...programaBackup, technicianId: "" };
    const r = prepararRestauracao(lerBackup({
      technicians: [
        { ...tecnicoBackup, id: "t1" }, // id curto demais: ganha id novo
        { ...tecnicoBackup, id: "tec-0001", name: "Técnico B", personalNumber: "1000002" },
        { ...tecnicoBackup, id: "tec-0001", name: "Técnico C", personalNumber: "1000003" }, // id repetido: ganha id novo
      ],
      programming: [semId],
    })!, novoId);
    expect(r.tecnicos.map((t) => t.id)).toEqual(["novo-1", "tec-0001", "novo-2"]);
    expect(r.programacoes[0].tecnicoId).toBe("novo-1"); // NP 1000001 é do primeiro técnico
  });

  it("técnico sem nome e programação com data inválida viram avisos e ficam de fora", () => {
    n = 0;
    const r = prepararRestauracao(lerBackup({
      technicians: [{ ...tecnicoBackup, name: "" }, tecnicoBackup],
      programming: [{ ...programaBackup, scheduledDate: "2026-02-30" }],
    })!, novoId);
    expect(r.tecnicos.map((t) => t.nome)).toEqual(["Técnico A"]);
    expect(r.avisos).toContain("Técnico 1 (sem nome): Informe o nome completo.");
    expect(r.avisos).toContain("Programação 1 (ordem 900001): Informe a data programada.");
    expect(r.programacoes).toEqual([]);
  });

  it("programação sem turno é aceita na restauração (registro antigo); foto inválida vira aviso e é descartada", () => {
    n = 0;
    const r = prepararRestauracao(lerBackup({
      technicians: [{ ...tecnicoBackup, photo: "http://exemplo.invalido/foto.jpg" }],
      programming: [{ ...programaBackup, shift: "" }],
    })!, novoId);
    expect(r.tecnicos[0].foto).toBe("");
    expect(r.avisos).toContain("Foto de Técnico A não veio (grande demais ou inválida).");
    expect(r.programacoes[0].turno).toBe("");
  });

  it("data de criação inválida fica vazia e o histórico de reprogramação é mantido", () => {
    n = 0;
    const r = prepararRestauracao(lerBackup({
      technicians: [tecnicoBackup],
      programming: [{ ...programaBackup, createdAt: "isto não é data",
        rescheduleHistory: [{ from: "2026-11-15", to: "2026-11-16", at: "x", by: "Administrador" }] }],
    })!, novoId);
    expect(r.programacoes[0].criadoEm).toBe("");
    expect(r.programacoes[0].historico).toEqual([{ de: "2026-11-15", para: "2026-11-16", em: "x", por: "Administrador" }]);
  });
});
