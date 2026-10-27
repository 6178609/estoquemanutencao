import { describe, expect, it } from "vitest";

import { identificar } from "@/lib/leitura/tipos";
import type { Atribuicao } from "@/lib/wcm/distribuicaoIa06";
import { aplicarLevantamento, faltantesDoLevantamento, indicePorCodigo, porListaOperacao, prepararMateriaisOperacoes } from "@/lib/wcm/materiaisOperacoes";

/** Só dados fictícios. */
const linhas = [
  { "Máquina": "MAQ TESTE", "Lista de tarefas": "11111", "Contador": "", "Operação": "20", "Atividade (troca)": "Trocar o filtro", "Material": "Filtro de óleo",
    "Qtd.": "2", "UM": "PC", "Cód. SAP": "0001234", "Observação": "teste" },
  { "Máquina": "MAQ TESTE", "Lista de tarefas": "11111", "Contador": "2", "Operação": "0030", "Material": "Sensor sem código", "Cód. SAP": "" },
  { "Máquina": "MAQ TESTE", "Lista de tarefas": "", "Operação": "0010", "Material": "sem lista" },
];

describe("materiais das operações (levantamento dos manuais)", () => {
  it("reconhece a planilha pelos cabeçalhos", () => {
    expect(identificar(["Máquina", "Lista de tarefas", "Contador", "Operação", "Material", "Qtd.", "Cód. SAP", "Estoque (MB52)"])).toBe("materiais_operacoes");
  });
  it("prepara: contador vazio = numerador 1, operação com 4 dígitos, código sem zeros, sem lista fica de fora", () => {
    const m = prepararMateriaisOperacoes(linhas);
    expect(m).toHaveLength(2);
    expect(m[0]).toMatchObject({ lista: "11111|1", operacao: "0020", codigo: "1234", quantidade: 2, material: "Filtro de óleo" });
    expect(m[1]).toMatchObject({ lista: "11111|2", operacao: "0030", codigo: "" });
    expect(porListaOperacao(m).get("11111|1")?.get("0020")).toHaveLength(1);
  });
  const a = (x: Partial<Atribuicao>): Atribuicao => ({ codigo: "1234", descricao: "FILTRO X", um: "PC", origem: "E1", conferida: false,
    listas: ["11111|1", "22222|1"], lista: "22222|1", operacao: "0010", nivel: "baixa", motivo: "auto", ...x });
  it("põe a peça na operação do levantamento (se a lista é possível), com a quantidade", () => {
    const idx = indicePorCodigo(prepararMateriaisOperacoes(linhas));
    const [r] = aplicarLevantamento([a({})], idx);
    expect(r).toMatchObject({ lista: "11111|1", operacao: "0020", nivel: "alta", conferida: true, quantidade: 2 });
    expect(aplicarLevantamento([a({ listas: ["22222|1"] })], idx)[0].lista).toBe("22222|1");
  });
  it("traz os materiais do levantamento que faltam vincular, uma vez cada", () => {
    const m = prepararMateriaisOperacoes(linhas);
    const f = faltantesDoLevantamento(m, [{ chave: "11111|1", dono: "E1" }], new Set(), () => ({ descricao: "", um: "" }));
    expect(f).toHaveLength(1);
    expect(f[0]).toMatchObject({ codigo: "1234", lista: "11111|1", operacao: "0020", origem: "E1", nivel: "alta" });
    expect(faltantesDoLevantamento(m, [{ chave: "11111|1", dono: "E1" }], new Set(["001234"]), () => ({ descricao: "", um: "" }))).toHaveLength(0);
  });
});
