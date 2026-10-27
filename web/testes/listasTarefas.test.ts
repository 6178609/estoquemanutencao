import { describe, expect, it } from "vitest";

import { lerArquivo, sondar } from "@/lib/leitura/leitura";
import { lerListasTarefas } from "@/lib/leitura/listasTarefas";
import * as L from "@/lib/wcm/listasTarefas";
import { filtrar, lerFiltro, montarLinhas, resumir } from "@/app/(app)/listas_tarefas/logica";
import { problemasDasListas } from "@/app/(app)/listas_tarefas/qualidade";

/** Texto no formato da impressão da IA03 — tudo fictício. */
const TXT = `
LTa  99001  1  PREV.MEC.PRENSA TESTE
Estratégia  YPM261  Tipo montagem
Utilização  4  Status  4
Centro  X001

Operação  0010  VERIFICAR ROLAMENTOS
VERIFICAR ROLAMENTOS
VERIFICAR RUIDO DOS MANCAIS.
SE NECESSARIO, SUBSTITUIR O ROLAMENTO.
SE NECESSARIO, SUBSTITUIR O ROLAMENTO.
Cen.trabalho  MEC_TESTE
Chave de controle  PM01
Núm.de pessoas  1
Trabalho  30,0  MIN
Duração  30,0  MIN
Pac.manuten02  M  1 Mês
Operação  0020  TROCAR FILTRO DE OLEO
Cen.trabalho  MEC_TESTE
Chave de controle  PM01
Núm.de pessoas  2
Trabalho  1,5  H
Duração  1,0  H
Pac.manuten08  6M  6 Meses
Comp.mat.  555001  FILTRO OLEO TESTE
Lista técnica  00000001  1
Categoria do item  L
Quantidade  2,000  UN
Suboperaç. 0010  conferir vazamento
Cen.trabalho  MEC_TESTE
Chave de controle  PM01
Núm.de pessoas  0
Trabalho  0,0
Duração  0,0

LTa  99002  3  INSPECAO SEM OPERACAO
Estratégia  YPM261  Tipo montagem
Utilização  4  Status  4
Centro  X001
`;

const linhasDe = () => {
  const t = lerListasTarefas(TXT);
  return t.linhas.map((l) => Object.fromEntries(t.colunas.map((c, i) => [c, l[i]])));
};

describe("leitura do texto das listas de tarefas", () => {
  it("é reconhecido como base de listas de tarefas", () => {
    const b = new TextEncoder().encode(TXT);
    expect(sondar("LISTAS.txt", b)).toEqual([{ tipo: "listas_tarefas", aba: null, linhaCab: null }]);
    expect(lerArquivo("LISTAS.txt", b).linhas.length).toBe(5);
  });
  it("operações, suboperação, componente e lista sem operação; texto longo sem linhas repetidas", () => {
    const ls = L.prepararListas(linhasDe());
    expect(ls.map((l) => l.chave)).toEqual(["99001|1", "99002|3"]);
    const [a, b] = ls;
    expect(a.operacoes.map((o) => o.operacao)).toEqual(["0010", "0020"]);
    expect(a.operacoes[0].textoLongo).toBe("VERIFICAR RUIDO DOS MANCAIS.\nSE NECESSARIO, SUBSTITUIR O ROLAMENTO.");
    expect(a.operacoes[1].componentes).toEqual([{ material: "555001", texto: "FILTRO OLEO TESTE", quantidade: 2, um: "UN" }]);
    expect(a.suboperacoes).toHaveLength(1);
    expect(a.operacoes[1].trabalhoH).toBe(1.5);
    // 0,5 h por mês + 1,5 h por semestre = 6 + 3 h por ano
    expect(a.horasAno).toBe(9);
    expect(L.rotuloCiclo(a.cicloDias)).toBe("1 mês");
    expect(b.operacoes).toHaveLength(0);
  });
});

describe("leitor: casos de borda (revisão)", () => {
  const BORDA = `
LTa  99010  2  BORDA
Estratégia  YPM261  Tipo montagem
Utilização  4  Status  4
Centro  X001  Planta Teste
Operação  0010  TEXTO A
DETALHE DO TEXTO A
Trabalho  30,0  MIN
Duração  30,0  MIN
Pac.manuten02 M 1 Mês
LTa  99011  1  SO CABECALHO
Estratégia  YPM999  Tipo montagem
Utilização  4  Status  2
Centro  X002
`;
  const ls = L.prepararListas((() => { const t = lerListasTarefas(BORDA); return t.linhas.map((l) => Object.fromEntries(t.colunas.map((c, i) => [c, l[i]]))); })());
  it("operação sem Cen.trabalho e pacote com um espaço só: trabalho, duração e ciclo lidos; texto longo limpo", () => {
    const o = ls[0].operacoes[0];
    expect([o.trabalhoH, o.duracaoH, o.ciclos, o.textoLongo]).toEqual([0.5, 0.5, "1 Mês", "DETALHE DO TEXTO A"]);
  });
  it("centro com descrição e lista sem operação com estratégia, status e centro", () => {
    expect(ls[0].centro).toBe("X001");
    expect([ls[1].estrategia, ls[1].status, ls[1].centro]).toEqual(["YPM999", "2", "X002"]);
  });
  it("rótulo da frequência sem vírgula (vai para o filtro do endereço)", () => {
    expect(L.rotuloCiclo(L.cicloEmDias("0,5 Mês"))).toBe("15 dias");
    expect(L.rotuloCiclo(L.cicloEmDias("1,5 Mês"))).not.toContain(",");
  });
  it("IP19 com a coluna Contador de grupos também liga a lista ao equipamento", () => {
    const m = L.equipamentosPorLista([{ "Plano de manutenção": "1", Equipamento: "EQ9", "Grupo listas tarefas": "99010", "Contador de grupos": "2" }]);
    expect(m.get("99010|2")?.[0].equipamento).toBe("EQ9");
  });
});

describe("ciclos, temas e peças", () => {
  it("ciclo em dias", () => {
    expect(L.cicloEmDias("2 Meses")).toBeCloseTo(60.88, 1);
    expect(L.cicloEmDias("1 Ano")).toBe(365.25);
    expect(L.cicloEmDias("0,5 Mês")).toBeCloseTo(15.2, 1);
    expect(L.cicloEmDias("Semanal")).toBe(7);
    expect(L.cicloEmDias("MANUTENÇÃO DE BOMBAS")).toBeNull();
  });
  it("temas do texto e o manual do tema", () => {
    const t = L.temasDoTexto("Lubrificar os mancais com graxa");
    expect(t.map((x) => x.id)).toEqual(["lubrificacao", "rolamento"]);
    expect(L.documentoDoTema("Manual X – Cap. 11 Lubrificação", t)).toBe(true);
    expect(L.documentoDoTema("Manual X – Cap. 2 Especificações", t)).toBe(false);
  });
  it("peça do equipamento combina com a operação de troca", () => {
    expect(L.pecaCombina("SUBSTITUIR O ROLAMENTO", "ROLAMENTO RIG ESF 6205")).toBe(true);
    expect(L.pecaCombina("VERIFICAR O ROLAMENTO", "ROLAMENTO RIG ESF 6205")).toBe(false);
    expect(L.pecaCombina("TROCAR FILTRO DE OLEO", "ELEMENTO FILT OLEO X")).toBe(true);
    expect(L.pecaCombina("TROCAR FILTRO DE OLEO", "CORREIA V A-40")).toBe(false);
  });
});

describe("equipamentos de cada lista, filtros e qualidade", () => {
  const ip19 = [
    { "Plano de manutenção": "700001", Equipamento: "EQ1", "Grupo listas tarefas": "99001", "Numerador de grupos": "1", "Texto plano manut.": "PREV" },
    { "Plano de manutenção": "700002", Equipamento: "", "Grupo listas tarefas": "99001", "Numerador de grupos": "1" },
  ];
  it("pela IP19 (equipamento do plano) e pelas ordens do IW38 do plano", () => {
    const m = L.equipamentosPorLista(ip19, [{ equipChave: "EQ2", plano: "700002" }]);
    expect(m.get("99001|1")!.map((e) => [e.equipamento, e.planos.join(), e.pelaOrdem])).toEqual([["EQ1", "700001", false], ["EQ2", "700002", true]]);
    expect(m.has("99002|3")).toBe(false);
  });
  it("filtros, resumo e pontos de qualidade", () => {
    const ls = L.prepararListas(linhasDe());
    const eq = L.equipamentosPorLista(ip19);
    const t = montarLinhas(ls, (k) => eq.get(k) ?? [], () => 2, () => "PRENSA");
    expect(filtrar(t, lerFiltro({ iq: "prensa" })).map((x) => x.lt.chave)).toEqual(["99001|1"]);
    expect(filtrar(t, lerFiltro({ isem: "1" })).map((x) => x.lt.chave)).toEqual(["99002|3"]);
    const r = resumir(t);
    expect([r.listas, r.operacoes, r.semEquipamento, r.trocas, r.comManual]).toEqual([2, 2, 1, 2, 1]);
    const p = Object.fromEntries(problemasDasListas(t).map((x) => [x.id, x.listas.map((y) => y.lt.chave)]));
    expect(p["sem-equip"]).toEqual(["99002|3"]);
    expect(p["sem-operacao"]).toEqual(["99002|3"]);
    expect(p["sem-texto"]).toEqual(["99001|1"]);
    expect(p["troca-sem-componente"]).toEqual(["99001|1"]);
  });
});
