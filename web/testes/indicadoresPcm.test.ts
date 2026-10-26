import { describe, expect, it } from "vitest";

import * as ind from "@/lib/wcm/indicadores";
import { prepararIw38 } from "@/lib/wcm/preparo";
import { dia } from "@/lib/wcm/util";

/** Só dados fictícios. */
const HOJE = dia(2026, 10, 20)!;
const COLS = ["Ordem", "Plano de manutenção", "Status do sistema", "Data-base do início", "Tipo de ordem", "Custos tot.reais", "Equipamento", "Status usuário"];
const ordens = prepararIw38([
  ["1", "500", "ENTE CONF", "02/10/2026", "YM02", "100", "E1", ""], // preventiva concluída
  ["2", "501", "LIB", "05/10/2026", "YM02", "50", "E1", ""],        // preventiva ainda aberta
  ["3", "502", "ABER", "30/10/2026", "YM02", "0", "E1", ""],        // preventiva futura: não conta
  ["4", "", "ENTE CONF", "06/10/2026", "YM01", "200", "E2", ""],    // corretiva
  ["5", "", "LIB", "07/10/2026", "YM11", "150", "E2", ""],          // emergencial
  ["6", "", "LIB", "08/10/2026", "YM01", "999", "E2", "CAN"], // cancelada: fora
].map((l) => Object.fromEntries(COLS.map((c, i) => [c, l[i]]))), HOJE).ordens;

const dados = (tipos: Record<string, ind.TipoOrdem>): ind.Dados => ({
  ordens, notas: null, oper: null, chamadas: null, estoque: null, requisicoes: null, cadEq: {}, cadMat: {}, capacidade: {}, conf: null,
  confTodos: null, equipe: null, tipos, horasSemana: 44, disponibilidade: {}, afs: null, acoesAf: null, hoje: HOJE, centros: [],
  tiposFiltro: [], filtroAreaTipo: false, memo: new Map(),
});
const TIPOS = { YM01: { descricao: "Corretiva", classe: "Corretiva" }, YM02: { descricao: "Preventiva", classe: "Preventiva" },
  YM11: { descricao: "Quebra", classe: "Emergencial" } };

describe("indicadores do painel de PCM", () => {
  const r = ind.calcular(dados(TIPOS), dia(2026, 10, 1)!, dia(2026, 10, 31)!);

  it("custo total sem as canceladas", () => expect(r.custo_total).toBe(500));
  it("% corretiva = corretiva + emergencial ÷ total", () => expect(r.pct_corretiva).toBe(70));
  it("cumprimento da preventiva: ordens de plano até hoje concluídas", () => expect(r.cumprimento_prev).toBe(50));
  it("custo por hora sem horas apontadas fica vazio", () => expect(r.custo_hora).toBeNull());
  it("% corretiva sem tipos cadastrados fica vazio", () =>
    expect(ind.calcular(dados({}), dia(2026, 10, 1)!, dia(2026, 10, 31)!).pct_corretiva).toBeNull());
});
