import { describe, expect, it } from "vitest";

import {
  MAX_LINHAS_PLANILHA, calendario, disponibilidade, historicoDe, objetosDaPlanilha, prepararImportacao, prepararRestauracao,
  statusDoGrupo, tecnicoDaProgramacao, validarTecnico, type Periodo, type Programacao, type Tecnico,
} from "@/lib/agendaHh/regras";

// Achados da revisão do Controle de HH (só dados fictícios)
const SEMANA: Periodo = { ini: "2026-11-16", fim: "2026-11-20" }; // segunda a sexta

const tec = (over: Partial<Tecnico> = {}): Tecnico => ({
  id: "a001", nome: "Técnico A", np: "123", centro: "Mistura", area: "Prensa", turno: "1º turno", jornada: 8,
  feriasInicio: null, feriasFim: null, folga: null, foto: "", ...over,
});

const prog = (over: Partial<Programacao> = {}): Programacao => ({
  id: "p001", equipamento: "Prensa 1", tipoOrdem: "Corretiva", ordem: "900001", descricao: "Troca de correia", area: "Prensa",
  data: "2026-11-16", turno: "1º turno", status: "programada", minutos: 60, tecnicoId: "a001", tecnicoNome: "Técnico A",
  np: "123", criadoEm: "2026-11-10T10:00:00.000Z", historico: [], ...over,
});

const linhaOk = {
  Equipamento: "Prensa 1", "Tipo de Ordem": "Corretiva", Ordem: "900001", Descrição: "Troca de correia",
  "Área de Atuação": "Prensa", "Data Programada": "19/11/2026", Turno: "1º turno", Status: "Programada", "Tempo em Min": "60", NP: "123",
};

describe("planilha acima do limite", () => {
  it("lendo MAX + 2 linhas (cabeçalho + MAX + 1), a importação recusa em vez de cortar", () => {
    const cab = Object.keys(linhaOk);
    const linhas = [cab, ...Array.from({ length: MAX_LINHAS_PLANILHA + 1 }, () => Object.values(linhaOk))];
    const r = prepararImportacao(objetosDaPlanilha(linhas), [tec()]);
    expect(r.itens).toEqual([]);
    expect(r.erros[0]).toMatch(/passa de 500 linhas.*Nada foi importado/);
  });

  it("exatamente MAX linhas ainda entram", () => {
    const r = prepararImportacao(Array.from({ length: MAX_LINHAS_PLANILHA }, () => linhaOk), [tec()]);
    expect(r.erros).toEqual([]);
    expect(r.itens).toHaveLength(MAX_LINHAS_PLANILHA);
  });
});

describe("NP comparado sem zeros à esquerda", () => {
  it("importação: NP do Excel '00123' (ou número 123) acha o técnico com NP '123', e vice-versa", () => {
    expect(prepararImportacao([{ ...linhaOk, NP: "00123" }], [tec()]).itens[0].entrada.tecnicoId).toBe("a001");
    expect(prepararImportacao([{ ...linhaOk, NP: 123 }], [tec({ np: "000123" })]).itens[0].entrada.tecnicoId).toBe("a001");
  });

  it("tecnicoDaProgramacao e a restauração ligam pelo NP com e sem zeros", () => {
    expect(tecnicoDaProgramacao(prog({ tecnicoId: "sumiu", np: "000123", tecnicoNome: "Outro nome" }), [tec()])?.id).toBe("a001");
    const r = prepararRestauracao({
      tecnicos: [{ id: "tec-0001", nome: "Técnico A", np: "123", centro: "Mistura", area: "Prensa", turno: "1º turno", jornada: 8 }],
      programacoes: [{ id: "prog-0001", equipamento: "Prensa 1", tipoOrdem: "Corretiva", ordem: "900001", descricao: "Troca",
        area: "Prensa", data: "2026-11-16", turno: "1º turno", status: "programada", minutos: 60, tecnicoId: "",
        tecnicoNome: "Nome diferente", np: "0123", criadoEm: "", historico: [] }],
    }, () => "novo-id-0001");
    expect(r.avisos).toEqual([]);
    expect(r.programacoes[0].tecnicoId).toBe("tec-0001");
  });
});

describe("ausência parcial só nos dias que ainda têm HH", () => {
  const parcial = (de: string, ate: string, horas: number) => ({ tipo: "Treinamento", de, ate, horas });

  it("parcial no fim de semana não desconta", () => {
    const d = disponibilidade(tec(), { ini: "2026-11-16", fim: "2026-11-22" }, [parcial("2026-11-21", "2026-11-21", 4)]);
    expect(d.horasOutras).toBe(0);
    expect(d.disponivel).toBe(40);
  });

  it("parcial nas férias, na folga ou em dia já coberto por ausência de dia inteiro não desconta de novo", () => {
    const t = tec({ feriasInicio: "2026-11-16", feriasFim: "2026-11-16", folga: "2026-11-17" });
    const d = disponibilidade(t, SEMANA, [
      parcial("2026-11-16", "2026-11-16", 4), // férias
      parcial("2026-11-17", "2026-11-17", 4), // folga
      { tipo: "Afastamento", de: "2026-11-18", ate: "2026-11-18", horas: null },
      parcial("2026-11-18", "2026-11-18", 4), // dia inteiro já descontado
    ]);
    expect(d.diasOutras).toBe(1);
    expect(d.horasOutras).toBe(8);
    expect(d.disponivel).toBe(40 - 8 - 8 - 8);
  });

  it("parcial em vários dias corridos rateia e só conta os dias úteis livres", () => {
    // 12 h de sexta a domingo = 4 h por dia; só a sexta tem HH
    const d = disponibilidade(tec(), { ini: "2026-11-16", fim: "2026-11-22" }, [parcial("2026-11-20", "2026-11-22", 12)]);
    expect(d.horasOutras).toBe(4);
  });
});

describe("calendário: status e programações do grupo", () => {
  it("status do grupo: concluída só se todas; senão reprogramada se alguma; senão programada", () => {
    expect(statusDoGrupo(["concluida", "concluida"])).toBe("concluida");
    expect(statusDoGrupo(["concluida", "programada"])).toBe("programada");
    expect(statusDoGrupo(["concluida", "reprogramada"])).toBe("reprogramada");
    expect(statusDoGrupo(["programada"])).toBe("programada");
  });

  it("grupo com uma concluída e uma programada não aparece como concluído e guarda os ids de todas", () => {
    const cal = calendario([prog({ id: "p001", status: "concluida" }), prog({ id: "p002", ordem: "900002" })], SEMANA);
    const [g] = cal.dias.get("2026-11-16")!;
    expect(g.status).toBe("programada");
    expect(g.ids).toEqual(["p001", "p002"]);
    expect(g.quantidade).toBe(2);
  });
});

describe("limites do backup", () => {
  it("turno do modo legado fica em 40 caracteres", () => {
    const v = validarTecnico({ nome: "Técnico A", centro: "Mistura", turno: "x".repeat(200), jornada: 8 }, { legado: true });
    expect(v.ok && v.valor.turno.length).toBe(40);
  });

  it("histórico: 'em' e 'por' em 80 caracteres e no máximo os 50 últimos", () => {
    const h = historicoDe(Array.from({ length: 70 }, (_, i) => ({ de: "2026-11-16", para: "2026-11-17", em: "e".repeat(200), por: `p${i}` })));
    expect(h).toHaveLength(50);
    expect(h[0].por).toBe("p20");
    expect(h[0].em).toHaveLength(80);
    expect(historicoDe([{ de: "2026-11-16", para: "2026-11-17", em: "", por: "z".repeat(200) }])[0].por).toHaveLength(80);
  });
});
