import { describe, expect, it } from "vitest";

import * as R from "@/lib/agendaHh/regras";

// só dados fictícios
const tec = (x: Partial<R.Tecnico> = {}): R.Tecnico => ({ id: "tec001", nome: "Técnico Fictício", np: "1001", centro: "Centro A", area: "Mecânica",
  turno: "1º turno", jornada: 8, feriasInicio: null, feriasFim: null, folga: null, foto: "", ...x });
const prog = (x: Partial<R.Programacao> = {}): R.Programacao => ({ id: "prog001", equipamento: "MAQ-01", tipoOrdem: "YM15", ordem: "9000001",
  descricao: "Serviço fictício", area: "Mecânica", data: "2026-11-16", turno: "1º turno", status: "programada", minutos: 60, tecnicoId: "tec001",
  tecnicoNome: "Técnico Fictício", np: "1001", criadoEm: "", historico: [], ...x });
// semana de seg 16/11/2026 a sex 20/11/2026: 5 dias úteis
const SEMANA = { ini: "2026-11-16", fim: "2026-11-20" };

describe("ausências da Gestão de HH na disponibilidade", () => {
  it("dias inteiros descontam a jornada; sem ausência fica igual ao original", () => {
    expect(R.disponibilidade(tec(), SEMANA).disponivel).toBe(40);
    const t = tec({ ausenciasHh: [{ tipo: "Afastamento", de: "2026-11-17", ate: "2026-11-18", horas: null }] });
    const c = R.disponibilidade(t, SEMANA);
    expect(c.diasOutras).toBe(2);
    expect(c.disponivel).toBe(24);
    expect(R.situacao(c)).toBe("ausencia");
  });
  it("não conta em dobro: sobreposição com férias, folga e outra ausência", () => {
    const t = tec({ feriasInicio: "2026-11-16", feriasFim: "2026-11-17", folga: "2026-11-19",
      ausenciasHh: [{ tipo: "Férias", de: "2026-11-17", ate: "2026-11-19", horas: null }, { tipo: "Licença", de: "2026-11-18", ate: "2026-11-18", horas: null }] });
    const c = R.disponibilidade(t, SEMANA);
    // férias 16–17 (2 dias), folga 19 (1), Gestão de HH só acrescenta o 18
    expect([c.diasFerias, c.diasFolga, c.diasOutras]).toEqual([2, 1, 1]);
    expect(c.disponivel).toBe(8);
  });
  it("fim de semana não conta; carga parcial é repartida pelos dias da ausência; carga 0 não tira HH", () => {
    expect(R.disponibilidade(tec({ ausenciasHh: [{ tipo: "Férias", de: "2026-11-21", ate: "2026-11-22", horas: null }] }), SEMANA).disponivel).toBe(40);
    // 16 h em 2 dias, só 1 dentro do período (20 e 21/11) → 8 h
    expect(R.disponibilidade(tec({ ausenciasHh: [{ tipo: "Treinamento", de: "2026-11-20", ate: "2026-11-21", horas: 16 }] }), SEMANA).disponivel).toBe(32);
    expect(R.disponibilidade(tec({ ausenciasHh: [{ tipo: "Treinamento", de: "2026-11-17", ate: "2026-11-17", horas: 0 }] }), SEMANA).disponivel).toBe(40);
  });
  it("o mapa por NP ignora zeros à esquerda", () => {
    const mapa = { "1001": [{ tipo: "Licença", de: "2026-11-16", ate: "2026-11-16", horas: null }] };
    expect(R.ausenciasDo(tec({ np: "0001001" }), mapa)).toHaveLength(1);
    expect(R.resumoHoras([tec({ np: "01001" })], SEMANA, mapa).total).toBe(32);
  });
});

describe("alertas de sobrecarga", () => {
  it("acima da jornada do dia, em dia de férias/folga/fim de semana; concluída não conta", () => {
    const t = tec({ folga: "2026-11-19", feriasInicio: "2026-11-20", feriasFim: "2026-11-20" });
    const lista = [prog({ id: "a1", data: "2026-11-16", minutos: 600 }), prog({ id: "a2", data: "2026-11-17", minutos: 480 }),
      prog({ id: "a3", data: "2026-11-19" }), prog({ id: "a4", data: "2026-11-20" }), prog({ id: "a5", data: "2026-11-22" }),
      prog({ id: "a6", data: "2026-11-18", minutos: 900, status: "concluida" })];
    const al = R.alertas([t], lista, { ini: "2026-11-16", fim: "2026-11-22" });
    expect(al.map((a) => [a.data, a.motivo])).toEqual([["2026-11-16", "sobrecarga"], ["2026-11-19", "folga"], ["2026-11-20", "férias"],
      ["2026-11-22", "fim de semana"]]);
    expect(R.textoAlerta(al[0])).toContain("10h programadas para 8h disponíveis");
  });
  it("ausência parcial da Gestão de HH reduz o disponível do dia", () => {
    const t = tec({ ausenciasHh: [{ tipo: "Treinamento", de: "2026-11-16", ate: "2026-11-16", horas: 4 }] });
    expect(R.alertas([t], [prog({ minutos: 300 })], SEMANA)).toHaveLength(1);
    expect(R.alertas([t], [prog({ minutos: 240 })], SEMANA)).toHaveLength(0);
  });
});

describe("comparativo: aderência e HH por tipo", () => {
  it("aderência = concluídas ÷ programações do período", () => {
    const c = R.comparativo([tec()], [prog({ status: "concluida" }), prog({ id: "b", tipoOrdem: "YM11", minutos: 120 }), prog({ id: "c", data: "2026-12-01" })], SEMANA);
    expect(c.aderencia).toBe(50);
    expect(c.porTipo).toEqual([{ rotulo: "YM11", valor: 2 }, { rotulo: "YM15", valor: 1 }]);
    expect(R.comparativo([tec()], [], SEMANA).aderencia).toBeNull();
  });
});

describe("reprogramação e status Concluída", () => {
  it("guarda a data anterior quando a data muda", () => {
    const h = R.comReprogramacao(prog(), "2026-11-18", "2026-11-15T10:00:00Z", "Usuário Fictício");
    expect(h).toEqual([{ de: "2026-11-16", para: "2026-11-18", em: "2026-11-15T10:00:00Z", por: "Usuário Fictício" }]);
    expect(R.comReprogramacao(prog(), "2026-11-16", "x", "y")).toEqual([]);
  });
  it("histórico sobrevive à gravação e ao backup", () => {
    const p = prog({ historico: [{ de: "2026-11-10", para: "2026-11-16", em: "", por: "" }], status: "concluida" });
    const { id, ...resto } = p;
    const lido = R.programacaoDe(id, R.itemProgramacao(resto));
    expect(lido?.historico).toHaveLength(1);
    expect(lido?.status).toBe("concluida");
    const volta = R.lerBackup(JSON.parse(JSON.stringify(R.backupDoSistema([tec()], [p]))));
    expect(volta?.programacoes[0].historico).toEqual(p.historico);
    expect(R.statusDaCelula("Concluída")).toBe("concluida");
  });
});

describe("integração com as bases", () => {
  it("traz da equipe só quem não está, com turno pela turma e jornada da semana", () => {
    const novos = R.tecnicosDaEquipe([
      { np: "001001", nome: "Já Cadastrado", centroTrabalho: "C1", area: "Mecânica", turma: "1" },
      { np: "2002", nome: "Pessoa Nova", centroTrabalho: "C2", area: "", especialidade: "Elétrica", turma: "Turma 2", jornadaSemana: 44 },
      { np: "3003", nome: "Pessoa Adm", centroTrabalho: "", area: "Utilidades", turma: "ADM" },
    ], [tec()]);
    expect(novos.map((t) => [t.np, t.turno, t.jornada, t.area, t.centro])).toEqual([
      ["2002", "2º turno", 9, "Elétrica", "C2"], ["3003", "Administrativo", 8, "Utilidades", "Sem centro"]]);
  });
  it("campos da ordem da IW38", () => {
    expect(R.camposDaOrdem({ ordem: "9000001", tipo: "YM12", texto: "Troca fictícia", equipamento: "10001", denominacao: "Máquina fictícia", area: "Setor A" }))
      .toEqual({ equipamento: "10001 · Máquina fictícia", tipoOrdem: "YM12", descricao: "Troca fictícia", area: "Setor A" });
    expect(R.chaveOrdem("000 9000001")).toBe("9000001");
  });
});

describe("acesso à aba", async () => {
  const { podeVer, ABAS_BASICAS } = await import("@/lib/auth/acesso");
  const { GRUPOS } = await import("@/lib/navegacao");
  it("entra no padrão de Líder e Analista, não no de Manutentor/Terceiro; fica no grupo da Gestão de HH", () => {
    expect(podeVer({ login: "l", funcao: "lider" }, "agenda_hh")).toBe(true);
    expect(podeVer({ login: "a", funcao: "analista" }, "agenda_hh")).toBe(true);
    expect(podeVer({ login: "m", funcao: "manutentor" }, "agenda_hh")).toBe(false);
    expect(podeVer({ login: "t", funcao: "terceiro", abas: ["agenda_hh"] }, "agenda_hh")).toBe(true);
    expect(ABAS_BASICAS.has("agenda_hh")).toBe(false);
    const g = GRUPOS.find((x) => x.abas.some((a) => a.id === "gestao_hh"));
    expect(g?.abas.find((a) => a.id === "agenda_hh")).toMatchObject({ titulo: "Controle de HH", rota: "/agenda_hh" });
  });
});
