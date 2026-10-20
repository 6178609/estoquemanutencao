import { describe, expect, it } from "vitest";

import type { OrdemCusto } from "@/app/(app)/custos/calculo";
import { lerJsonDemo } from "@/lib/dados/demo";
import {
  chaveMes, entradaDaRequisicao, faseDaRequisicao, orcamentoDe, orcamentoPorMes, tipoDaRequisicao,
} from "@/lib/wcm/orcamento";
import { prepararRequisicoes, type Requisicao } from "@/lib/wcm/preparo";
import { dia, hoje, type Dia } from "@/lib/wcm/util";

// dados fictícios
const D = (a: number, m: number, d: number): Dia => dia(a, m, d)!;

const req = (x: Partial<Requisicao>): Requisicao => ({
  requisicao: "R", po: "", status: "", aprovador: "", proprietario: "", solicitante: "", itens: "", justificativa: "",
  enviadoEm: null, ultimoEnvio: null, total: 0, pendente: false, diasAguardando: null, tipo: "material", fase: "aprovada", ...x,
});
const ordem = (data: Dia | null, custoReal: number) => ({ data, custoReal }) as unknown as OrdemCusto;

describe("fase da requisição", () => {
  it("aprovada, pendente e fora pelo prefixo do status (com e sem RFQ)", () => {
    for (const s of ["Solicitado", "Solicitado (Enviado para RFQ)", "Ação de comprador pendente",
      "Ação de comprador pendente (Enviado para RFQ)", "Recebido", "Recebido (Enviado para RFQ)",
      "Parcialmente recebido", "Parcialmente recebido (Enviado para RFQ)"]) {
      expect(faseDaRequisicao(s), s).toBe("aprovada");
    }
    for (const s of ["Aprovação pendente", "Aprovação pendente (Enviado para RFQ)"]) expect(faseDaRequisicao(s), s).toBe("pendente");
    for (const s of ["Rascunho", "Rascunho (Enviado para RFQ)", "Carrinho", ""]) expect(faseDaRequisicao(s), s).toBe("fora");
  });
});

describe("tipo da requisição", () => {
  it("serviço, material e vazio", () => {
    for (const s of ["Serviço", "SERVICO", "serviços"]) expect(tipoDaRequisicao(s), s).toBe("servico");
    for (const s of ["Material", "MAT"]) expect(tipoDaRequisicao(s), s).toBe("material");
    expect(tipoDaRequisicao("")).toBeNull();
    expect(tipoDaRequisicao("  ")).toBeNull();
    expect(tipoDaRequisicao("Submaterial")).toBeNull();
  });
});

describe("entrada da requisição no orçamento", () => {
  it("material +30 dias, serviço +15 dias, virada de ano incluída", () => {
    expect(entradaDaRequisicao({ enviadoEm: D(2026, 12, 15), ultimoEnvio: null, tipo: "material" })).toBe(D(2027, 1, 14));
    expect(entradaDaRequisicao({ enviadoEm: D(2026, 3, 20), ultimoEnvio: null, tipo: "servico" })).toBe(D(2026, 4, 4));
    expect(entradaDaRequisicao({ enviadoEm: null, ultimoEnvio: D(2026, 3, 20), tipo: null })).toBe(D(2026, 4, 19));
    expect(entradaDaRequisicao({ enviadoEm: null, ultimoEnvio: null, tipo: "servico" })).toBeNull();
  });
});

describe("orçamento por mês", () => {
  const ini = D(2026, 1, 1), fim = D(2026, 2, 28);
  const reqs = [
    req({ requisicao: "A", total: 1000, enviadoEm: D(2025, 12, 10), tipo: "material", fase: "aprovada" }),
    req({ requisicao: "B", total: 400, enviadoEm: D(2026, 2, 1), tipo: "servico", fase: "pendente" }),
    req({ requisicao: "C", total: 999, enviadoEm: D(2026, 1, 5), tipo: "material", fase: "fora" }),
    req({ requisicao: "D", total: 0, enviadoEm: D(2026, 1, 5), tipo: "material", fase: "aprovada" }),
    req({ requisicao: "E", total: 250, enviadoEm: null, ultimoEnvio: null, tipo: "material", fase: "aprovada" }),
  ];
  const ordens = [ordem(D(2026, 1, 10), 3000), ordem(D(2026, 2, 3), 500), ordem(null, 7000)];
  const disponivel = new Map([["2026-01", 10000]]);

  it("linhas, saldo e totais com fictícios", () => {
    const r = orcamentoPorMes(ordens, reqs, disponivel, ini, fim);
    expect(r.linhas).toEqual([
      { mes: "2026-01", disponivel: 10000, ordens: 3000, requisicoes: 1000, saldo: 6000, aEntrar: 0 },
      { mes: "2026-02", disponivel: null, ordens: 500, requisicoes: 0, saldo: null, aEntrar: 400 },
    ]);
    expect(r.totais).toEqual({ disponivel: 10000, gasto: 4500, saldo: 6000, aEntrar: 400 });
    expect(r.semData).toBe(1);
    expect(r.semTipo).toBe(false);
  });

  it("sem requisições (base não carregada): colunas de requisição ficam null", () => {
    const r = orcamentoPorMes(ordens, null, disponivel, ini, fim);
    expect(r.linhas.every((l) => l.requisicoes === null && l.aEntrar === null)).toBe(true);
    expect(r.totais.aEntrar).toBeNull();
    expect(r.totais.gasto).toBe(3500);
    expect(r.semTipo).toBe(false);
  });

  it("semTipo só quando todas as requisições estão sem tipo", () => {
    const sem = reqs.map((x) => ({ ...x, tipo: null }));
    expect(orcamentoPorMes([], sem, disponivel, ini, fim).semTipo).toBe(true);
    expect(orcamentoPorMes([], [...sem, req({ tipo: "servico" })], disponivel, ini, fim).semTipo).toBe(false);
    expect(orcamentoPorMes([], [], disponivel, ini, fim).semTipo).toBe(false);
  });
});

describe("orcamentoDe", () => {
  it("lê só orcamento:AAAA-MM com valor numérico ≥ 0", () => {
    const cad = {
      "orcamento:2026-03": { valor: 1234.5 },
      "2026-04": { valor: 999 },
      "orcamento:2026-05": { valor: -1 },
      "orcamento:2026-06": { valor: "1000" },
      "orcamento:2026-07": { valor: 0 },
    } as unknown as Parameters<typeof orcamentoDe>[0];
    expect([...orcamentoDe(cad).entries()]).toEqual([["2026-03", 1234.5], ["2026-07", 0]]);
    expect(orcamentoDe(null).size).toBe(0);
    expect(chaveMes(D(2026, 3, 9))).toBe("2026-03");
  });
});

describe("prepararRequisicoes com tipo e fase", () => {
  const cru = (x: Record<string, unknown>) => ({ "Número da requisição": "R1", Status: "Ação de comprador pendente",
    "Enviado em": "15/12/2026", Total: "100,00", ...x });

  it("lê a coluna Material ou serviço e a fase", () => {
    const [r] = prepararRequisicoes([cru({ "Material ou serviço": "Serviço" })], D(2026, 12, 20));
    expect(r.tipo).toBe("servico");
    expect(r.fase).toBe("aprovada");
    expect(r.pendente).toBe(true);
  });

  it("sem a coluna de tipo: tipo null", () => {
    const [r] = prepararRequisicoes([cru({})], D(2026, 12, 20));
    expect(r.tipo).toBeNull();
  });

  it("'Tipo de requisição' não é confundido com o número da requisição", () => {
    const [r] = prepararRequisicoes([{ "Número da requisição": "R9", "Tipo de requisição": "Material", Status: "Rascunho" }], D(2026, 12, 20));
    expect(r.requisicao).toBe("R9");
    expect(r.tipo).toBe("material");
    expect(r.fase).toBe("fora");
  });
});

describe("demonstração do orçamento", () => {
  it("o cadastro da demo tem orçamento para o mês de hoje", () => {
    const cad = lerJsonDemo("metas_wcm.json") as unknown as Parameters<typeof orcamentoDe>[0];
    const mesHoje = chaveMes(hoje());
    expect(orcamentoDe(cad).get(mesHoje)).toBe(50000);
  });
});
