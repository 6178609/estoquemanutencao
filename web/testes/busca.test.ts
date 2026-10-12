import { describe, expect, it } from "vitest";

import type { ItemEstoque } from "@/lib/dados/materiais";
import * as busca from "@/lib/wcm/busca";
import type { AfBusca, BasesBusca, OrdemBusca } from "@/lib/wcm/busca";
import { dia } from "@/lib/wcm/util";

/** Busca global (dados fictícios). */
function ordem(x: Partial<OrdemBusca>): OrdemBusca {
  return { ordem: "", tipo: "YM13", texto: "", situacao: "Aberta", data: null, fim: null, equipamento: "", equipChave: "", objeto: "",
    local: "", plano: "", criadoPor: "", statusUsuario: "", centroTrabalho: "MEC_COMP", localizacao: "", custoReal: 0,
    natureza: "Backlog", campoOrdenacao: "", ...x };
}

function bases(): BasesBusca {
  const ordens = [
    ordem({ ordem: "4001", texto: "TROCAR ROLAMENTO", equipamento: "41020389", equipChave: "41020389", objeto: "INJETORA 07",
      campoOrdenacao: "41020389", data: dia(2026, 9, 1) }),
    ordem({ ordem: "4002", texto: "LUBRIFICAR CORRENTE", equipamento: "41020389", equipChave: "41020389", objeto: "INJETORA 07",
      campoOrdenacao: "41020389", data: dia(2026, 10, 1) }),
    ordem({ ordem: "4003", texto: "REVISÃO GERAL", equipamento: "41000001", equipChave: "41000001", objeto: "PRENSA",
      campoOrdenacao: "PR-01", data: dia(2026, 8, 1) }),
  ];
  const notas = [{ nota: "9001", descricao: "Vazamento de óleo", ordem: "4001", equipChave: "41020389", data: dia(2026, 9, 1),
    tipoNota: "", objeto: "", local: "", centroTrabalho: "", localizacao: "", quebra: false }];
  const equip = [
    { equipamento: "41020389", denominacao: "INJETORA 07 UGB", local: "GAL1", localizacao: "GAL1", codigoAbc: "A" },
    { equipamento: "41000001", denominacao: "PRENSA HIDRÁULICA", local: "GAL2", localizacao: "GAL2", codigoAbc: "B" },
  ];
  const estoque: ItemEstoque[] = [{ material: "100200", descricao: "ROLAMENTO 6205", estoque: 4, um: "UN", valor: 0, depositos: "" }];
  const afs: AfBusca[] = [{ numero: "AF-1", codigoSap: "41020389", equipamento: "INJETORA 07", resumo: "Quebra do rolamento",
    dataFalha: dia(2026, 9, 10), situacao: "", criticidade: "", causaRaiz: "", area: "", osCorretiva: "" }];
  return { ordens, notas, equip, estoque, afs };
}

describe("busca.buscar", () => {
  it("busca por palavras sem acento em todas as bases", () => {
    let r = busca.buscar("rolamento", bases());
    expect(r.Ordens.map((o) => o.ordem)).toEqual(["4001"]);
    expect(r.Materiais.map((m) => m.material)).toEqual(["100200"]);
    expect(r["Análises de falha"].length).toBe(1);
    expect(r.Notas).toEqual([]);
    r = busca.buscar("hidraulica prensa", bases()); // sem acento e fora de ordem
    expect(r.Equipamentos.map((e) => e.equipamento)).toEqual(["41000001"]);
    r = busca.buscar("óleo", bases());
    expect(r.Notas.map((n) => n.nota)).toEqual(["9001"]);
    expect(busca.buscar("af-1", bases())["Análises de falha"].map((a) => a.numero)).toEqual(["AF-1"]); // pontuação conta
  });

  it("número exato primeiro e campo de ordenação", () => {
    const b = bases();
    let r = busca.buscar("41020389", b);
    expect(r.Ordens.map((o) => o.ordem)).toEqual(["4002", "4001"]); // mais recente primeiro (as duas exatas)
    expect(r.Equipamentos.map((e) => e.equipamento)).toEqual(["41020389"]);
    expect(r.Notas.length).toBe(1);
    r = busca.buscar("pr-01", b); // campo de ordenação
    expect(r.Ordens.map((o) => o.ordem)).toEqual(["4003"]);
    b.ordens = [...b.ordens!, { ...b.ordens![0], ordem: "14001", data: dia(2026, 10, 5) }];
    r = busca.buscar("4001", b);
    expect(r.Ordens.map((o) => o.ordem)).toEqual(["4001", "14001"]); // exata antes da parecida mais recente
    b.ordens = [...b.ordens, { ...b.ordens[0], ordem: "000014002", texto: "OUTRA", data: dia(2026, 10, 9) },
      { ...b.ordens[0], ordem: "114002", texto: "OUTRA", data: dia(2026, 10, 10) }];
    expect(busca.buscar("14002", b).Ordens.map((o) => o.ordem)).toEqual(["000014002", "114002"]); // zeros à esquerda não contam
  });

  it("termo curto ou vazio não busca e cadastro do site entra", () => {
    const vazio = busca.buscar("a", bases());
    expect(busca.CATEGORIAS.every((c) => vazio[c].length === 0)).toBe(true);
    expect(busca.totalDeResultados(busca.buscar("  ", bases()))).toBe(0);
    const r = busca.buscar("bomba", { ...bases(), cadEq: { "MT-102": { nome: "Motor bomba", criticidade: "Alta" } } });
    expect(r.Equipamentos.map((e) => e.equipamento)).toEqual(["MT-102"]);
    expect(r.Equipamentos[0].criticidade).toBe("Alta");
    expect(Object.keys(busca.buscar("x1", bases())).sort()).toEqual([...busca.CATEGORIAS].sort());
  });

  it("limite por categoria e planos", () => {
    const muitas = Array.from({ length: 250 }, (_, i) => ordem({ ordem: String(5000 + i), texto: "ROLAMENTO", data: dia(2026, 1, 1) }));
    expect(busca.buscar("rolamento", { ordens: muitas }).Ordens.length).toBe(busca.LIMITE);
    const chamadas = [
      { plano: "PL10", texto: "LUBRIFICAÇÃO SEMANAL", data: dia(2026, 9, 1), situacao: "Programada", ordem: "", equipamento: "E1", objeto: "", centroTrabalho: "" },
      { plano: "PL11", texto: "INSPEÇÃO", data: dia(2026, 10, 1), situacao: "Atrasada", ordem: "", equipamento: "E1", objeto: "", centroTrabalho: "" },
    ];
    expect(busca.buscar("e1", { chamadas }).Planos.map((c) => c.plano)).toEqual(["PL11", "PL10"]);
    expect(busca.buscar("lubrificacao", { chamadas }).Planos.map((c) => c.plano)).toEqual(["PL10"]);
  });
});
