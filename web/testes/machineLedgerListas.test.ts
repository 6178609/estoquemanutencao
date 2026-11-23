import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { csvInclusao } from "@/app/(app)/mro/ia06";
import * as L from "@/lib/machineLedger/listasTarefas";
import * as R from "@/lib/machineLedger/regras";

/** Só dados fictícios: export no formato do SAP com listas, operações, suboperação e componentes inventados. */
const EXPORT = `
LTa  99001  1  PREVENTIVA PRENSA FICTICIA
Estratégia  YPMTST  Tipo montagem
Utilização  4  Status  4
Centro  A000

Operação  0010  INSPECIONAR ROLAMENTO DA BOMBA
INSPECIONAR ROLAMENTO DA BOMBA
VERIFICAR RUIDO E TEMPERATURA DOS ROLAMENTOS
Cen.trabalho  MEC_TST
Chave de controle  PM01
Núm.de pessoas  2
Trabalho  1,5  H
Duração  1,5  H
Pac.manuten08  6M  6 Meses
Comp.mat.  000100001  ROLAMENTO FICTICIO 6205
Lista técnica  00001003  1
Categoria do item  L
Quantidade  2,000  UN
Operação  0020  VERIFICAR TENSAO DA CORREIA
Conferir a correia em V do acionamento
Cen.trabalho  MEC_TST
Chave de controle  PM01
Núm.de pessoas  1
Trabalho  30,0  MIN
Duração  30,0  MIN
Pac.manuten02  M  1 Mês
Suboperaç. 0010  trocar se necessario
Cen.trabalho  OUTRO
Chave de controle  PM01
Núm.de pessoas  0
Trabalho  0,0  MIN
Operação  0030

LTa  99002  2  LUBRIFICACAO FICTICIA
Estratégia  YPMTST  Tipo montagem
Centro  A000
Operação  0010  LUBRIFICAR MANCAIS
Cen.trabalho  LUB_TST
Trabalho  10,0  MIN
`;

describe("Listas de tarefas: leitura do export", () => {
  it("lê listas, operações (com texto longo, campos e suboperação) e componentes", () => {
    const r = L.lerListasTarefas(EXPORT);
    if ("erro" in r) throw new Error(r.erro);
    expect(r.listas.map((l) => [l.grupo, l.numerador, l.descricao, l.estrategia, l.centro])).toEqual([
      ["99001", "1", "PREVENTIVA PRENSA FICTICIA", "YPMTST", "A000"], ["99002", "2", "LUBRIFICACAO FICTICIA", "YPMTST", "A000"]]);
    const [o1, o2, o3] = r.listas[0].operacoes;
    expect(o1).toMatchObject({ numero: "0010", texto: "INSPECIONAR ROLAMENTO DA BOMBA", centroTrabalho: "MEC_TST", chave: "PM01", pessoas: 2, trabalhoMin: 90,
      pacote: "6M 6 Meses", componentes: [{ material: "100001", descricao: "ROLAMENTO FICTICIO 6205", quantidade: 2, um: "UN" }] });
    expect(o1.textoLongo).toMatch(/RUIDO E TEMPERATURA/);
    expect(o2).toMatchObject({ numero: "0020", centroTrabalho: "MEC_TST", pessoas: 1, trabalhoMin: 30 });
    expect(o2.textoLongo).toMatch(/correia em V.*Suboperação 0010: trocar se necessario/s);
    expect(o3).toMatchObject({ numero: "0030", texto: "" });
    expect(r.listas[1].operacoes[0]).toMatchObject({ numero: "0010", trabalhoMin: 10 });
    expect(L.lerListasTarefas("qualquer coisa")).toEqual({ erro: expect.stringMatching(/LTa/) });
  });

  it("cadastro: ida e volta validada; chave grupo|numerador", () => {
    const r = L.lerListasTarefas(EXPORT);
    if ("erro" in r) throw new Error(r.erro);
    const cad = Object.fromEntries(r.listas.map((l) => [L.chaveLista(l.grupo, l.numerador), L.itemLista(l)]));
    expect(Object.keys(cad)).toEqual(["99001|1", "99002|2"]);
    const m = L.listasDe({ ...cad, "LIXO": { x: 1 }, "99003|ABC": {} });
    expect([...m.keys()]).toEqual(["99001|1", "99002|2"]);
    expect(m.get("99001|1")).toEqual(r.listas[0]);
    expect(L.sanitizarLista("99001", "1", { operacoes: [{ numero: "10", texto: "x".repeat(500), componentes: [{ material: "0123", quantidade: "a" }] }] })?.operacoes[0])
      .toMatchObject({ numero: "0010", componentes: [{ material: "123", quantidade: null }] });
  });
});

// ----------------------------------------------------------------------------
const comp = (conjunto: string, subconjunto: string, componente: string, codigo: string, qtd = "1"): R.Componente => ({
  equip: "PRENSA FICT", conjunto, subconjunto, componente, codigo, qtd, funcao: "", falha: "", deterioracao: "", modo: "", efeito: "", evidente: true, oculta: false,
  seguranca: false, qualidade: false, parada: true, p: 1, t: 1, v: 1, h: 3, classe: "C", tipoManut: "" });
const COMPS = [comp("SISTEMA HIDRAULICO", "BOMBA", "ROLAMENTO RIGIDO 6205", "100001", "2"), comp("TRANSMISSAO", "ACIONAMENTO", "CORREIA EM V A40", "100002", "3"),
  comp("SISTEMA ELETRICO", "PAINEL", "CONTATOR PRINCIPAL", "100003"), comp("SISTEMA ELETRICO", "MANCAIS", "BUCHA DE BRONZE", "")];
const B = R.indexarBase([
  { material: "100001", sysmat: "", substituto: "", descricaoCurta: "ROLAMENTO 6205", descrCompleta: "", status: "APROVADO", pdm: "", um: "UN" },
  { material: "100002", sysmat: "", substituto: "", descricaoCurta: "CORREIA A40", descrCompleta: "", status: "APROVADO", pdm: "", um: "PC" },
  { material: "100003", sysmat: "", substituto: "", descricaoCurta: "CONTATOR", descrCompleta: "", status: "BLOQUEADO", pdm: "", um: "UN" },
], null);

describe("Listas de tarefas: operação ↔ componente e IA06", () => {
  const r = L.lerListasTarefas(EXPORT);
  if ("erro" in r) throw new Error(r.erro);
  const listas = new Map(r.listas.map((l) => [L.chaveLista(l.grupo, l.numerador), l]));
  const ops = L.operacoesDasListas(r.listas);

  it("sugere pela ordem componente → subconjunto → conjunto, com confiança e motivo", () => {
    expect(L.sugerirOperacao(COMPS[0], ops)).toMatchObject({ grupo: "99001", operacao: "0010", confianca: "media", pontos: 50, motivo: /rolamento.*subconjunto/ });
    expect(L.sugerirOperacao(comp("SISTEMA HIDRAULICO", "BOMBA", "ROLAMENTO DA BOMBA", ""), ops)).toMatchObject({ operacao: "0010", confianca: "alta", pontos: 100 });
    expect(L.sugerirOperacao(COMPS[1], ops)).toMatchObject({ operacao: "0020", confianca: "alta" });
    expect(L.sugerirOperacao(comp("X", "ACIONAMENTO", "PECA SEM NOME", ""), ops)).toMatchObject({ operacao: "0020", confianca: "media", motivo: /subconjunto/ });
    expect(L.sugerirOperacao(COMPS[3], ops)).toMatchObject({ grupo: "99002", operacao: "0010", confianca: "media", motivo: /subconjunto/ });
    expect(L.sugerirOperacao(comp("CABINE", "PORTA", "VIDRO TEMPERADO", ""), ops)).toBeNull();
    expect(L.confiancaDe(100)).toBe("alta");
    expect(L.confiancaDe(30)).toBe("baixa");
  });

  it("já na operação fica fora; só código válido e operação confirmada (ou alta, se pedido) vão para a IA06, com a operação", () => {
    const conf = new Map([[L.chaveAssociacao("ml-x", COMPS[1]), { grupo: "99001", numerador: "1", operacao: "0020", quantidade: null, por: "Teste", em: "" }]]);
    const linhas = L.linhasOperacoes("ml-x", [...COMPS, COMPS[0]], ops, conf, listas, B);
    expect(linhas).toHaveLength(4); // o repetido entra uma vez
    const [rol, cor, cont] = linhas;
    expect(rol).toMatchObject({ codigoOk: true, jaNaOperacao: true, qtdRcm: 2, um: "UN" });
    expect(cor).toMatchObject({ codigoOk: true, jaNaOperacao: false, confirmada: { operacao: "0020" } });
    expect(cont.codigoOk).toBe(false); // bloqueado
    expect(L.itensIa06(linhas, {}, false, "5000001 - PRENSA").map((i) => [i.grupo, i.numerador, i.operacao, i.material, i.quantidade, i.um]))
      .toEqual([["99001", "1", "0020", "100002", 3, "PC"]]);
    expect(L.itensIa06(linhas, { [cor.chave]: 5 }, true, "x").map((i) => i.quantidade)).toEqual([5]); // o rolamento já está na 0010
    const csv = csvInclusao(L.itensIa06(linhas, {}, false, "5000001 - PRENSA"));
    expect(csv.split("\r\n")[1]).toMatch(/^X;99001;1;0020;100002;3;PC;CORREIA A40;5000001 - PRENSA;1;$/);
    expect(L.jaNaOperacao(listas, "99001", "1", "10", "0100001")).toBe(true);
    expect(L.jaNaOperacao(listas, "99001", "1", "0020", "100001")).toBe(false);
  });

  it("chave do componente é estável e não depende de acento/caixa", () => {
    expect(L.chaveComponente({ conjunto: "Sistema Hidráulico", subconjunto: "bomba", componente: "Rolamento rígido 6205" }))
      .toBe(L.chaveComponente({ conjunto: "SISTEMA HIDRAULICO", subconjunto: "BOMBA", componente: "ROLAMENTO RIGIDO 6205" }));
  });
});
