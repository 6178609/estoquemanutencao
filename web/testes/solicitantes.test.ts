import { describe, expect, it } from "vitest";

import { contarSolicitantes, pessoasAtivas, soManutencao, solicitantesDe } from "@/lib/wcm/solicitantes";
import type { Requisicao } from "@/lib/wcm/preparo";

// nomes fictícios
const r = (solicitante: string, extra: Partial<Requisicao> = {}) =>
  ({ requisicao: "R1", po: "", status: "", aprovador: "", proprietario: "", solicitante, itens: "", justificativa: "",
    enviadoEm: null, ultimoEnvio: null, total: 1, pendente: false, diasAguardando: null, tipo: null, fase: "aprovada", ...extra }) as Requisicao;

describe("pessoas da manutenção (filtro das requisições)", () => {
  it("solicitantesDe lê a lista do cadastro e ignora valores inválidos", () => {
    expect(solicitantesDe(null)).toEqual([]);
    expect(solicitantesDe(undefined)).toEqual([]);
    expect(solicitantesDe({})).toEqual([]);
    expect(solicitantesDe({ _solicitantes: { nomes: "Pessoa Teste A" } })).toEqual([]);
    expect(solicitantesDe({ _solicitantes: { nomes: ["Pessoa Teste A", 5, "", "   ", null, "  Fulano de Tal  "] } }))
      .toEqual(["Pessoa Teste A", "Fulano de Tal"]);
  });

  it("lista vazia ou ausente não filtra: devolve o mesmo array", () => {
    const xs = [r("Pessoa Teste A"), r("Fulano de Tal")];
    expect(soManutencao(xs, [])).toBe(xs);
    expect(soManutencao(xs, [])).toHaveLength(2);
  });

  it("nome só de símbolos não casa com requisição sem solicitante", () => {
    expect(soManutencao([r(""), r("Fulano de Tal")], ["---", "Fulano de Tal"])).toHaveLength(1);
  });

  it("reqs null devolve null", () => {
    expect(soManutencao(null, ["Pessoa Teste A"])).toBeNull();
  });

  it("filtra pelas pessoas marcadas, sem acento nem caixa, sem mutar a base", () => {
    const xs = [r("josé  silva"), r("Fulano de Tal"), r("JOSE SILVA", { requisicao: "R2" }), r("")];
    const antes = xs.map((x) => x.requisicao);
    const out = soManutencao(xs, ["JOSE SILVA"]);
    expect(out).not.toBe(xs);
    expect(out?.map((x) => x.requisicao)).toEqual(["R1", "R2"]);
    expect(xs.map((x) => x.requisicao)).toEqual(antes);
    expect(xs).toHaveLength(4);
  });

  it("contarSolicitantes: nomes distintos pela chave, texto mais frequente, ordem por quantidade e nome, sem vazios", () => {
    const xs = [r("Pessoa Teste A"), r("Pessoa Teste A"), r("pessoa  teste a"), r("Fulano de Tal"), r("Fulano de Tal"),
      r("Fulano de Tal"), r("Outra Pessoa de Teste"), r(""), r("   ")];
    expect(contarSolicitantes(xs)).toEqual([
      { nome: "Fulano de Tal", qtd: 3 },
      { nome: "Pessoa Teste A", qtd: 3 },
      { nome: "Outra Pessoa de Teste", qtd: 1 },
    ]);
    expect(contarSolicitantes(null)).toEqual([]);
  });
});

describe("pessoas ativas (filtro pes da aba Custos)", () => {
  const padrao = ["Pessoa Teste A", "Fulano de Tal"];

  it("sem pes, vale o padrão salvo (vazio = todas)", () => {
    expect(pessoasAtivas({}, padrao)).toEqual(padrao);
    expect(pessoasAtivas({ ini: "2026-01-01" }, padrao)).toEqual(padrao);
    expect(pessoasAtivas({}, [])).toEqual([]);
  });

  it("pes único e repetido viram a lista, na ordem do endereço", () => {
    expect(pessoasAtivas({ pes: "Fulano de Tal" }, padrao)).toEqual(["Fulano de Tal"]);
    expect(pessoasAtivas({ pes: ["Fulano de Tal", "Pessoa Teste A"] }, [])).toEqual(["Fulano de Tal", "Pessoa Teste A"]);
  });

  it("pes=todas é sem filtro, mesmo com padrão salvo", () => {
    expect(pessoasAtivas({ pes: "todas" }, padrao)).toEqual([]);
    expect(pessoasAtivas({ pes: ["Fulano de Tal", "todas"] }, padrao)).toEqual([]);
  });

  it("ignora vazios e espaços; endereço só com vazios não usa o padrão", () => {
    expect(pessoasAtivas({ pes: ["", "  ", " Fulano de Tal "] }, padrao)).toEqual(["Fulano de Tal"]);
    expect(pessoasAtivas({ pes: "" }, padrao)).toEqual([]);
  });

  it("descarta nome com mais de 120 caracteres (após aparar)", () => {
    const longo = "x".repeat(121);
    expect(pessoasAtivas({ pes: [longo, "  " + "y".repeat(120) + "  ", "Fulano de Tal"] }, [])).toEqual(["y".repeat(120), "Fulano de Tal"]);
  });

  it("dedupe pela chave (sem acento, caixa e espaços), mantendo a primeira grafia", () => {
    expect(pessoasAtivas({ pes: ["Fulano de Tal", "FULANO  de tal", "Pessoa Teste A"] }, [])).toEqual(["Fulano de Tal", "Pessoa Teste A"]);
  });

  it("no máximo 50 nomes", () => {
    const xs = Array.from({ length: 60 }, (_, i) => `Pessoa ${i}`);
    const out = pessoasAtivas({ pes: xs }, []);
    expect(out).toHaveLength(50);
    expect(out[0]).toBe("Pessoa 0");
    expect(out[49]).toBe("Pessoa 49");
  });
});
