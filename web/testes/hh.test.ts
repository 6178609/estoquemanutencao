import { describe, expect, it } from "vitest";

import * as hh from "@/lib/wcm/hh";
import { identificar } from "@/lib/leitura/tipos";
import { prepararConfirmacoes, prepararEquipe, type Pessoa } from "@/lib/wcm/preparo";
import { dia } from "@/lib/wcm/util";

/**
 * Gerenciador de HH (jornada, % disponível, capacidade e ausências) e as bases que o alimentam (IW47 e Gestão de
 * HH), com dados fictícios.
 */
const D = (a: number, m: number, d: number) => dia(a, m, d)!;

const EQUIPE: Pessoa[] = [
  ["10", "ANA", "MECANICO", "Mecânica", "MEC"],
  ["20", "BRUNO", "ELETRICISTA", "Elétrica", "ELE"],
  ["30", "CAIO", "ANALISTA PLANEJ", "Planejamento (GPM)", "PCM"],
].map(([np, nome, cargo, especialidade, centroTrabalho]) =>
  ({ np, nome, cargo, especialidade, centroTrabalho, area: "X", turma: "1ª", supervisor: "", setor: "" }));

describe("Gerenciador de HH · disponibilidade", () => {
  it("padrões sem cadastro", () => {
    const p = hh.pessoas(EQUIPE, {}, 44);
    expect(p.map((x) => x.jornada)).toEqual([44, 44, 44]);
    expect(p.map((x) => x.disponivel)).toEqual([100, 100, 100]);
    expect(p.map((x) => x.contaNaCapacidade)).toEqual([true, true, false]); // planejamento não conta
    // 2 técnicos × 44 h × 7 dias ÷ 7 = a conta antiga (técnicos × jornada)
    expect(hh.horasDisponiveis(p, {}, D(2026, 10, 5), D(2026, 10, 11))).toBeCloseTo(88);
    expect(hh.pessoas(null, {}, 44)).toEqual([]);
    expect(hh.ARQ).toBe("hh_disponibilidade.json");
  });

  it("jornada, percentual, capacidade e ausências", () => {
    const cad = {
      "10": { jornada: 40, percentual: 80, ausencias: [{ id: "a", tipo: "Férias", de: "2026-10-01", ate: "2026-10-07" },
        { id: "b", tipo: "Treinamento", de: "2026-10-06", ate: "2026-10-06" }] },
      "20": { capacidade: false }, "30": { capacidade: true, jornada: 20 },
    };
    const p = hh.pessoas(EQUIPE, cad, 44);
    expect(p.map((x) => x.contaNaCapacidade)).toEqual([true, false, true]);
    const d = new Map(hh.disponibilidade(p, cad, D(2026, 10, 5), D(2026, 10, 11)).map((x) => [x.np, x]));
    // ANA: 40 h na semana, ausente 5, 6, 7 (o treinamento do dia 6 não conta em dobro) → (40 − 3×40/7) × 80%
    expect(d.get("10")!.diasAusente).toBe(3);
    expect(d.get("10")!.horasDisponiveis).toBeCloseTo((40 - (3 * 40) / 7) * 0.8);
    expect(d.get("30")!.horasDisponiveis).toBeCloseTo(20);
    const centros = hh.porCentro(p, cad, D(2026, 10, 5), D(2026, 10, 11));
    expect(Object.keys(centros).sort()).toEqual(["MEC", "PCM"]);
    expect(centros.MEC[1]).toBe(1);
    expect(hh.ausentesEm(p, cad, D(2026, 10, 6)).map((x) => x.tipo)).toEqual(["Férias", "Treinamento"]);
  });

  it("a disponibilidade alimenta as horas e a capacidade por centro", () => {
    const cad = { "10": { ausencias: [{ id: "a", tipo: "Férias", de: "2026-10-05", ate: "2026-10-11" }] } };
    const p = hh.pessoas(EQUIPE, cad, 44);
    expect(hh.horasDisponiveis(p, cad, D(2026, 10, 5), D(2026, 10, 5))).toBeCloseTo(44 / 7); // só o BRUNO
    const disp = hh.porCentro(p, cad, D(2026, 10, 5), D(2026, 10, 11));
    expect(disp.ELE[0]).toBeCloseTo(44);
    expect(disp.MEC).toEqual([0, 1]); // a ANA, única do centro, está de férias a semana toda
  });

  it("valores do cadastro: limites, inválidos e período vazio", () => {
    const cad = { "10": { jornada: "", percentual: 150, obs: "turno fixo" }, "20": { percentual: -5, jornada: "36" },
      "30": "lixo" };
    const p = hh.pessoas(EQUIPE, cad, 44);
    expect(p.map((x) => x.jornada)).toEqual([44, 36, 44]);
    expect(p.map((x) => x.disponivel)).toEqual([100, 0, 100]);
    expect(p[0].observacao).toBe("turno fixo");
    expect(hh.disponibilidade(p, cad, D(2026, 10, 5), D(2026, 10, 4)).every((x) => x.horasDisponiveis === 0)).toBe(true);
    // até antes do início vira um dia só; sem início válido fica fora
    const aus = hh.ausencias({ "10": { ausencias: [{ de: "2026-10-05", ate: "2026-10-01" }, { de: "", ate: "2026-10-01" }] } });
    expect(aus).toEqual([{ np: "10", id: "", tipo: "Outro", de: D(2026, 10, 5), ate: D(2026, 10, 5), obs: "", titulo: "", horas: null,
      entidade: "", validade: null, semHh: false }]);
    expect(hh.diasAusente({}, D(2026, 10, 1), D(2026, 10, 31))).toEqual({});
  });

  it("apoio à tela: nova ausência, situação e item a gravar", () => {
    expect(hh.sequenciaAusencias([{ id: "10-20261001-20261007-1" }, { id: "10-20261001-20261007-3" }])).toBe(3); // removida a 2ª: não repete
    const a = hh.novaAusencia("10", "Férias", D(2026, 10, 1), D(2026, 10, 7), " viagem ", 2);
    expect(a).toEqual({ id: "10-20261001-20261007-3", tipo: "Férias", de: "2026-10-01", ate: "2026-10-07", obs: "viagem" });
    const x = { de: D(2026, 10, 1), ate: D(2026, 10, 7) };
    expect(hh.diasDaAusencia(x)).toBe(7);
    expect([D(2026, 9, 30), D(2026, 10, 3), D(2026, 10, 8)].map((h) => hh.situacaoAusencia(x, h)))
      .toEqual(["Futura", "Em andamento", "Encerrada"]);
    // o que fica igual ao padrão é apagado (null)
    expect(hh.itemDisponibilidade({ jornada: 44, disponivel: 100, contaNaCapacidade: true, observacao: " " }, 44, "Mecânica"))
      .toEqual({ jornada: null, percentual: null, capacidade: null, obs: null });
    expect(hh.itemDisponibilidade({ jornada: 40, disponivel: 80, contaNaCapacidade: true, observacao: "ok" }, 44,
      "Planejamento (GPM)")).toEqual({ jornada: 40, percentual: 80, capacidade: true, obs: "ok" });
  });
});

// ----------------------------------------------------------------------------
// IW47 e Gestão de HH — as linhas como a leitura entrega (texto)
// ----------------------------------------------------------------------------
const COLS_IW47 = ["Nº pessoal", "Ordem", "Status do sistema", "Operação", "Suboperação", "Trabalho real",
  "Unid.trabalho (real)", "Centro trab.(real)", "Tp.atividade (real)", "Tipo ativid.(plan.)", "Data lançamento",
  "Criado em"];
const iw47 = () => [
  ["1001", "32000001", "CONF ENTE", "10", "", "90", "MIN", "MEC_COMP", "MECA", "MECA", "08/06/2026", "08/06/2026"],
  ["1001", "32000001", "CONF ENTE", "20", "", "30", "MIN", "MEC_COMP", "", "ELETRI", "08/06/2026", "08/06/2026"],
  ["1002", "32000002", "CONF ENTE", "10", "", "600", "MIN", "ELE_COMP", "ELETRI", "ELETRI", "09/06/2026", "09/06/2026"],
  ["1002", "32000002", "CONF ENTE", "10", "", "-600", "MIN", "ELE_COMP", "ELETRI", "ELETRI", "09/06/2026", "09/06/2026"],
  ["1003", "32000003", "CONF ENTE", "10", "", "60", "MIN", "FABPILOT", "MECA", "MECA", "09/06/2026", "09/06/2026"],
].map((l) => Object.fromEntries(COLS_IW47.map((c, i) => [c, l[i]])));

describe("IW47 e Gestão de HH", () => {
  it("a IW47 não é confundida com o IW38", () => {
    expect(identificar(COLS_IW47)).toBe("iw47");
    expect(identificar(["Ordem", "Tipo de ordem", "Status do sistema", "Texto breve"])).toBe("iw38");
  });

  it("preparo da IW47", () => {
    const df = prepararConfirmacoes(iw47());
    expect(new Set(df.map((x) => x.ordem))).toEqual(new Set(["32000001", "32000002"])); // FABPILOT fora
    expect(df.reduce((s, x) => s + x.horas, 0)).toBeCloseTo(2); // 90 + 30 min; 600 − 600 (estorno) = 0
    expect(df.find((x) => x.operacao === "20")!.atividade).toBe("ELETRI"); // sem a real, vale a planejada
    expect(df[0].np).toBe("1001");
    expect(df[0].data).toBe(D(2026, 6, 8));
    expect(prepararConfirmacoes(iw47(), false)).toHaveLength(5);
  });

  it("da Gestão de HH só vale a lista de pessoas", () => {
    const cols = ["Nº", "Nº PESSOAL", "NOME", "CARGO", "CENTRO TRABALHO", "AREA", "TURMA", "01/01/2026"];
    expect(identificar(cols)).toBe("equipe");
    const cru = [
      ["1", "1001", "ANA SOUZA", "MECANICO ESPECIALIZADO", "MEC_COMP", "COMPONENTES", "1ª", "8"],
      ["2", "1002", "BRUNO LIMA", "ELETRICISTA LIDER", "ELE_COMP", "COMPONENTES", "2ª", "8"],
      ["3", "1004", "CARLA DIAS", "GPM", "GPM", "PLANEJADA", "#REF!", "8"],
      ["4", "", "#REF!", "#REF!", "", "", "", ""],
    ].map((l) => Object.fromEntries(cols.map((c, i) => [c, l[i]])));
    const eq = prepararEquipe(cru);
    expect(eq.map((x) => x.np)).toEqual(["1001", "1002", "1004"]); // linha #REF! fora
    expect(eq.map((x) => x.especialidade)).toEqual(["Mecânica", "Elétrica", "Planejamento (GPM)"]);
    expect(eq.find((x) => x.np === "1004")!.turma).toBe(""); // #REF! vira vazio
    expect(eq[0].area).toBe("COMPONENTES");
    // a equipe preparada entra direto no Gerenciador de HH
    expect(hh.pessoas(eq, {}, 44).map((x) => x.contaNaCapacidade)).toEqual([true, true, false]);
  });
});
