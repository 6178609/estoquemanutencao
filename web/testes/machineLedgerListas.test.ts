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

describe("Código do componente: RCM → peça de reposição → Sysmat pela descrição", () => {
  const B2 = R.indexarBase([
    { material: "200001", sysmat: "", substituto: "", descricaoCurta: "VALVULA FICT 5/2", descrCompleta: "", status: "APROVADO", pdm: "", um: "UN" },
    { material: "200002", sysmat: "", substituto: "", descricaoCurta: "SENSOR FICT M12", descrCompleta: "", status: "APROVADO", pdm: "", um: "UN" },
    { material: "200003", sysmat: "", substituto: "", descricaoCurta: "BOMBA FICT", descrCompleta: "", status: "APROVADO", pdm: "", um: "UN" },
    { material: "200004", sysmat: "", substituto: "", descricaoCurta: "OUTRA BOMBA", descrCompleta: "", status: "APROVADO", pdm: "", um: "UN" },
  ], null);
  const peca = (conjunto: string, codigo: string, descricao: string): R.Peca => ({ conjunto, codigo, descricao, consumivel: "", classe: "", estrategico: false,
    reserva: false, estSegAlmox: null, valorUnit: null, area: "", posicao: "", estSegUbm: null });
  const pecas = [peca("PNEUMATICA", "200001", "Válvula  solenoide   5/2"), peca("HIDRAULICA", "200004", "BOMBA DE ENGRENAGEM"), peca("ELETRICA", "200003", "BOMBA DE ENGRENAGEM")];
  const porDesc = R.pecasPorDescricao(pecas);

  it("usa o RCM se válido; senão a peça de reposição de descrição idêntica (mesmo conjunto no empate); senão o Sysmat", () => {
    expect(R.codigoDoComponente({ codigo: "200002", componente: "X", conjunto: "" }, porDesc, B2)).toMatchObject({ codigo: "200002", origemCodigo: "RCM" });
    expect(R.codigoDoComponente({ codigo: "", componente: "VALVULA SOLENOIDE 5/2", conjunto: "OUTRO" }, porDesc, B2)).toMatchObject({ codigo: "200001", origemCodigo: "peça de reposição" });
    expect(R.codigoDoComponente({ codigo: "999999", componente: "Bomba de engrenagem", conjunto: "ELETRICA" }, porDesc, B2)).toMatchObject({ codigo: "200003", origemCodigo: "peça de reposição" });
    expect(R.codigoDoComponente({ codigo: "", componente: "SENSOR FICT M12", conjunto: "" }, porDesc, B2)).toMatchObject({ codigo: "200002", origemCodigo: "Sysmat pela descrição" });
    expect(R.codigoDoComponente({ codigo: "999999", componente: "NADA", conjunto: "" }, porDesc, B2)).toMatchObject({ situacao: "inexistente", origemCodigo: "RCM" });
    expect(R.codigoDoComponente({ codigo: "", componente: "NADA", conjunto: "" }, porDesc, B2)).toMatchObject({ situacao: "sem_codigo", origemCodigo: "" });
  });

  it("pente fino e IA06 usam o mesmo código, com a origem (e o CSV ganha a coluna no fim)", () => {
    const comps = [comp("ELETRICA", "MOTOR", "BOMBA DE ENGRENAGEM", "999999")];
    const res = R.pecasResolvidas({ componentes: comps, plano: [], pecas: [] }, B2);
    expect(res.map((p) => [p.r.codigo, p.r.situacao, p.origemCodigo])).toEqual([["999999", "inexistente", "RCM"]]); // sem peça igual: fica o inválido
    const res2 = R.pecasResolvidas({ componentes: comps, plano: [], pecas }, B2);
    // o inválido do RCM continua (achado) e a peça de reposição de mesma descrição fica ligada ao componente
    expect(res2.filter((p) => p.componente).map((p) => [p.r.codigo, p.r.situacao]).sort()).toEqual([["200003", "ok"], ["999999", "inexistente"]]);
    const ops = L.operacoesDasListas([{ grupo: "99009", numerador: "1", descricao: "", estrategia: "", centro: "", operacoes: [
      { numero: "0010", texto: "TROCAR BOMBA DE ENGRENAGEM", textoLongo: "", centroTrabalho: "", chave: "", pessoas: null, trabalhoMin: null, pacote: "", componentes: [] }] }]);
    const linhas = L.linhasOperacoes("ml-y", comps, ops, new Map(), new Map(), B2, pecas);
    expect(linhas[0]).toMatchObject({ codigo: "200003", codigoOk: true, origemCodigo: "peça de reposição" });
    const itens = L.itensIa06(linhas, {}, true, "EQ");
    expect(csvInclusao(itens, true, true).split("\r\n")).toEqual([`${"EXECUTAR;GRUPO;CONTADOR;OPERACAO;MATERIAL;QUANTIDADE;UM;TEXTO;ATIVOS;QTD_ATIVOS;EQUIPAMENTOS_DA_LISTA"};ORIGEM_CODIGO`,
      "X;99009;1;0010;200003;1;UN;BOMBA FICT;EQ;1;;peça de reposição", ""]);
  });
});

describe("Código pela referência do fabricante (sugestão para o PCM confirmar)", () => {
  it("extrai tokens de referência e ignora medidas puras", () => {
    expect(R.tokensReferencia("VÁLVULA SOLENÓIDE XY1-AB-123CD 24VCC")).toEqual(["XY1AB123CD"]);
    expect(R.tokensReferencia("REDUTOR 9876.54.32/1 220V 1/2\" 22MM")).toEqual(["9876543"+"21"]);
    expect(R.tokensReferencia("ROLAMENTO 6205-2Z (FICT)")).toEqual(["62052Z"]);
    expect(R.tokensReferencia("SMC_AS1002F-04A")).toEqual(["AS1002F04A"]);
    expect(R.tokensReferencia("ROLAMENTO 6205 MOTOR 15KW 380VAC 1500RPM 12,5MM")).toEqual([]);
    expect(R.tokensReferencia("AB12")).toEqual([]); // menos de 5 caracteres
  });

  const B3 = R.indexarBase([
    { material: "300001", sysmat: "", substituto: "", descricaoCurta: "VALVULA SOLENOIDE", descrCompleta: "FAB: FICTO - REF: XY1-AB-123CD", status: "APROVADO", pdm: "", um: "UN" },
    { material: "300002", sysmat: "", substituto: "", descricaoCurta: "ROLAMENTO 6205-2Z", descrCompleta: "", status: "APROVADO", pdm: "", um: "UN" },
    { material: "300003", sysmat: "", substituto: "", descricaoCurta: "ROLAMENTO", descrCompleta: "REF: 6205-2Z", status: "BLOQUEADO", pdm: "", um: "UN" },
    { material: "300004", sysmat: "", substituto: "", descricaoCurta: "SENSOR", descrCompleta: "REF: XS1-M12PA", status: "CANCELADO", pdm: "", um: "UN" },
    { material: "300005", sysmat: "", substituto: "", descricaoCurta: "SENSOR", descrCompleta: "REF: XS1-M12PA", status: "APROVADO", pdm: "", um: "UN" },
  ], null);

  it("aceita só um material único (aprovado ou bloqueado; cancelado não conta); vários = ambíguo com candidatos", () => {
    expect(R.porReferencia("VALVULA XY1AB-123CD", B3)).toMatchObject({ codigo: "300001", token: "XY1AB123CD" });
    expect(R.porReferencia("ROLAMENTO 6205-2Z", B3)).toMatchObject({ codigo: "", candidatos: [{ codigo: "300002" }, { codigo: "300003" }] });
    expect(R.porReferencia("SENSOR XS1-M12PA", B3)).toMatchObject({ codigo: "300005" });
    expect(R.porReferencia("SEM REFERENCIA", B3)).toBeNull();
    expect(R.indiceReferencias(B3)).toBe(R.indiceReferencias(B3)); // guardado pelo catálogo
  });

  it("a origem pela referência é sugerida: entra na IA06 só depois de o PCM confirmar o código", () => {
    const c = comp("PNEUMATICA", "VALVULAS", "VALVULA SOLENOIDE XY1-AB-123CD", "");
    expect(R.codigoDoComponente(c, new Map(), B3)).toMatchObject({ codigo: "300001", origemCodigo: "Sysmat pela referência", sugerido: true });
    const amb = R.codigoDoComponente(comp("X", "Y", "ROLAMENTO 6205-2Z DA BOMBA", ""), new Map(), B3);
    expect(amb).toMatchObject({ situacao: "sem_codigo", sugerido: true, candidatos: [{ codigo: "300002" }, { codigo: "300003" }] });
    // pente fino não usa a sugestão sem confirmação
    expect(R.pecasResolvidas({ componentes: [c], plano: [], pecas: [] }, B3)).toEqual([]);
    const ops = L.operacoesDasListas([{ grupo: "99010", numerador: "1", descricao: "", estrategia: "", centro: "", operacoes: [
      { numero: "0010", texto: "TESTAR VALVULA SOLENOIDE", textoLongo: "", centroTrabalho: "", chave: "", pessoas: null, trabalhoMin: null, pacote: "", componentes: [] }] }]);
    const conf = new Map([[L.chaveAssociacao("ml-z", c), { grupo: "99010", numerador: "1", operacao: "0010", quantidade: null, por: "T", em: "" }]]);
    const sem = L.linhasOperacoes("ml-z", [c], ops, conf, new Map(), B3);
    expect(sem[0]).toMatchObject({ codigo: "300001", codigoOk: false, sugerido: true });
    expect(L.itensIa06(sem, {}, true, "EQ")).toEqual([]);
    const cods = new Map([[L.chaveAssociacao("ml-z", c), { codigo: "300001", por: "PCM", em: "" }]]);
    const com = L.linhasOperacoes("ml-z", [c], ops, conf, new Map(), B3, [], cods);
    expect(com[0]).toMatchObject({ codigoOk: true, codigoConfirmado: { codigo: "300001" } });
    expect(L.itensIa06(com, {}, false, "EQ").map((i) => [i.material, i.operacao, i.origemCodigo])).toEqual([["300001", "0010", "Sysmat pela referência"]]);
    expect(L.codigosConfirmadosDe({ a: { codigo: "300001", codigoPor: "PCM" }, b: { grupo: "X" }, c: { codigo: "abc" } })).toEqual(new Map([["a", { codigo: "300001", por: "PCM", em: "" }]]));
  });
});
