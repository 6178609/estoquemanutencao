import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import * as R from "@/lib/machineLedger/regras";
import { dia } from "@/lib/wcm/util";

/** Só dados fictícios (máquinas, códigos e descrições inventados). */
const CAB_RCM = [
  ["MAQUINA FICTICIA"],
  ["ESTRUTURA MAQUINA", "", "", "", "", "", "", "", "INFORMAÇÕES RCM"],
  ["Equipamento - Nivel 01", "Conjunto - Nivel 02", "Subconjunto - Nivel 03", "Item", "Componente - 04", "FOTO", "COD SAP", "Quant. Instalada",
    "FUNÇÃO DO COMPONENTE", "FALHA FUNCIONAL DO COMPONENTE", "TIPO DE DETERIORAÇÃO", "MODO DE FALHA DE DETERIORAÇÃO NATURAL", "EFEITO E CONSEQUÊNCIA DA FALHA", "TIPO DE FALHA"],
  ["", "", "", "", "", "", "", "", "", "", "", "", "", "EVIDENTE", "OCULTA", "", "", "", "", "", "", "", "Classificação ( A, B, C )", "MANUTENÇÃO PM"],
  ["", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "IMPACTO EM SEGURANÇA", "IMPACTO EM QUALIDADE", "GRAU DE IMPACTO (G)",
    "PROBABILIDADE DE QUEBRA (P)", "TEMPO DE REPARO OU SUBSTITUIÇÃO (T)", "VALOR DO COMPONENTE (R$) (V)", "INDICE H= P x G x T"],
];
const linhaRcm = (comp: string, cod: string, seg: string, qual: string, para: string, p: string, t: string, v: string, h: string, cl: string) =>
  ["MAQUINA FICTICIA 05", "CONJ A", "SUB A", "1", comp, "", cod, "1", "Função", "Falha", "NATURAL", "Desgaste", "Para", "X", "", seg, qual, para, p, t, v, h, cl, "TBM"];

describe("Machine Ledger: leitura da planilha pelos cabeçalhos", () => {
  it("lê o RCM pelas colunas certas e o índice H da planilha", () => {
    const c = R.lerRcm([...CAB_RCM, linhaRcm("ROLAMENTO FICTICIO 1", "SysMat-20000001", "S", "S", "S", "1", "2", "1", "14", "A")]);
    expect(c).toHaveLength(1);
    expect(c[0]).toMatchObject({ componente: "ROLAMENTO FICTICIO 1", codigo: "SysMat-20000001", seguranca: true, qualidade: true, parada: true,
      p: 1, t: 2, v: 1, h: 14, classe: "A", tipoManut: "TBM", evidente: true, oculta: false });
  });

  it("código com \".0\" do Excel sai limpo; células mescladas repetem conjunto/subconjunto", () => {
    const l2 = linhaRcm("SENSOR FICTICIO", "9990001.0", "N", "N", "S", "1", "1", "1", "3", "C");
    l2[0] = ""; l2[1] = ""; l2[2] = "";
    const c = R.lerRcm([...CAB_RCM, linhaRcm("ROLAMENTO FICTICIO 1", "", "N", "N", "S", "1", "1", "1", "3", "C"), l2]);
    expect(c[1]).toMatchObject({ codigo: "9990001", conjunto: "CONJ A", subconjunto: "SUB A", equip: "MAQUINA FICTICIA 05" });
  });

  it("ledger com uma coluna a mais no RCM: tudo desloca e a leitura pelo cabeçalho continua certa", () => {
    const desloca = (l: string[]) => [...l.slice(0, 13), "COLUNA EXTRA", ...l.slice(13)];
    const cab = CAB_RCM.map((l, i) => (i >= 3 ? desloca(l) : l));
    const c = R.lerRcm([...cab, desloca(linhaRcm("SENSOR FICTICIO", "1234567", "N", "S", "S", "3", "1", "2", "10", "A"))]);
    expect(c[0]).toMatchObject({ seguranca: false, qualidade: true, parada: true, p: 3, t: 1, v: 2, h: 10, classe: "A", tipoManut: "TBM", codigo: "1234567" });
  });

  it("índice H: o da planilha vale; vazio, calcula como as planilhas (P + T + V + 6 seg. + 4 qual.)", () => {
    const [c] = R.lerRcm([...CAB_RCM, linhaRcm("CORREIA FICTICIA", "", "S", "N", "S", "2", "3", "1", "", "")]);
    expect(c.h).toBeNull();
    expect(R.calcularH(c)).toBe(2 + 3 + 1 + 6);
    expect(R.indiceH(c)).toBe(12);
    expect(R.classeDe(c)).toBe("A");
    expect(R.indiceH({ ...c, h: 7 })).toBe(7);
    expect(R.classeDeH(5, true)).toBe("C");
    expect(R.classeDeH(8, true)).toBe("B");
    expect(R.classeDeH(20, false)).toBe("C");
    expect(R.calcularH({ p: null, t: 1, v: 1, seguranca: false, qualidade: false })).toBeNull();
  });

  it("valida as abas obrigatórias e lê capa, plano e peças", () => {
    const capa = [["Machine Ledger", "Elaboradores: Pessoa Ficticia Planta: F00 Equipamento: PRENSA FICTICIA Fabricante: FICTO Modelo: X1 UGB: 1 Área: TESTE Versão: Data da última revisão: 10/02/2026"],
      ["", "Texto longo da função da máquina fictícia, que faz coisas fictícias de forma contínua e segura durante todo o turno."]];
    const plano = [["x"], ["Equipamento - Nivel 01", "Conjunto - Nivel 02", "Subconjunto - Nivel 03", "Componente - 04", "Detalhe atividade", "PLANO CIL-R OA",
      "MANUTENÇÃO PM - TIPO", "TEMPO (MIN)", "PERIODICIDADE", "Quant. Mec", "Quant. Ele", "PROCEDIMENTO", "COD. PLANOS DE MANUTENÇÃO PM"],
      ["MAQ", "CONJ A", "SUB A", "ROLAMENTO FICTICIO 1", "Inspecionar", "", "MP", "30", "MENSAL", "1", "0", "", "12345"]];
    const pecas = [[""], [""], ["Item", "Conjunto", "Código Sysmat/SAP", "Descrição", "Consumível ou Reparavel", "Classificação do material", "Estrategico ou comum?",
      "Deve ter reserva? Sim ou não", "Estoque de segurança Almox", "Valor unitário do material", "Valor total", "Área de estocagem", "Localização na área de estocagem", "Estoque de segurança UBM"],
      ["1", "CONJ A", "1234567", "ROLAMENTO FICTICIO", "Consumível", "Mecânico", "ESTRATÉGICO", "Estocagem recomendada", "2", "10,5", "21", "A", "B-1", "1"]];
    const abas = [{ nome: "CAPA", linhas: capa }, { nome: "MACHINE LEDGER - RCM 2025", linhas: [] }, { nome: "MACHINE LEDGER - RCM  2026", linhas: [...CAB_RCM, linhaRcm("ROLAMENTO FICTICIO 1", "", "N", "N", "S", "1", "1", "1", "3", "C")] },
      { nome: "PLANO MESTRE MP", linhas: plano }, { nome: "GT_SPARE_PARTS", linhas: pecas }];
    expect(R.lerLedger("x.xlsx", abas.slice(0, 2))).toEqual({ erro: expect.stringMatching(/PLANO MESTRE, GT_SPARE_PARTS/) });
    const l = R.lerLedger("MACHINE LEDGER - PRENSA FICTICIA 05.xlsx", abas);
    if ("erro" in l) throw new Error(l.erro);
    expect(l.nome).toBe("PRENSA FICTICIA 05");
    expect(l.revisao).toBe("10/02/2026");
    expect(l.capa).toMatchObject({ maquina: "PRENSA FICTICIA", fabricante: "FICTO", modelo: "X1", area: "TESTE" });
    expect(l.capa.funcao).toMatch(/^Texto longo/);
    expect(JSON.stringify(l)).not.toMatch(/Pessoa Ficticia/);
    expect(l.conteudo.componentes).toHaveLength(1); // a aba do RCM de 2026 (a mais recente)
    expect(l.conteudo.plano[0]).toMatchObject({ atividade: "Inspecionar", tempoMin: 30, planoSap: "12345" });
    expect(l.conteudo.pecas[0]).toMatchObject({ codigo: "1234567", estrategico: true, reserva: true, estSegAlmox: 2, valorUnit: 10.5, estSegUbm: 1 });
  });
});

// ----------------------------------------------------------------------------
const CAT = [
  { material: "100001", sysmat: "20000001", substituto: "", descricaoCurta: "ROLAMENTO RIGIDO 6205", descrCompleta: "ROLAMENTO; FAB: FICTOSKF - REF: 6205", status: "APROVADO", pdm: "ROLAMENTO" },
  { material: "100002", sysmat: "20000002", substituto: "", descricaoCurta: "CORREIA EM V A40", descrCompleta: "CORREIA; FAB: FICTOGATES", status: "APROVADO", pdm: "CORREIA" },
  { material: "100003", sysmat: "20000003", substituto: "100004", descricaoCurta: "SENSOR VELHO", descrCompleta: "", status: "BLOQUEADO", pdm: "SENSOR" },
  { material: "100004", sysmat: "20000004", substituto: "", descricaoCurta: "SENSOR INDUTIVO M12", descrCompleta: "SENSOR; FAB: OUTROFAB", status: "APROVADO", pdm: "SENSOR" },
  { material: "100005", sysmat: "20000005", substituto: "", descricaoCurta: "VALVULA SOLENOIDE 5/2", descrCompleta: "VALVULA", status: "APROVADO", pdm: "VALVULA" },
  { material: "100006", sysmat: "20000006", substituto: "", descricaoCurta: "CONTATOR 9A", descrCompleta: "CONTATOR; APLICACAO: MAQUINA OUTROFAB", status: "APROVADO", pdm: "CONTATOR" },
  { material: "100007", sysmat: "20000007", substituto: "100004", descricaoCurta: "SENSOR CANCELADO", descrCompleta: "", status: "CANCELADO", pdm: "SENSOR" },
  { material: "100008", sysmat: "20069677", substituto: "", descricaoCurta: "GRAXA DE USO GERAL", descrCompleta: "GRAXA", status: "APROVADO", pdm: "GRAXA" },
];
const EST = [{ material: "100001", descricao: "ROLAMENTO", um: "UN", estoque: 5 }, { material: "100005", descricao: "VALVULA", um: "UN", estoque: 0 }];
const B = R.indexarBase(CAT, EST);

describe("Machine Ledger: códigos no Sysmat", () => {
  it("código SAP, código Sysmat, descrição curta exata, inexistente e inativo com Para", () => {
    expect(R.resolverCodigo("100001", "", B)).toMatchObject({ codigo: "100001", situacao: "ok", origem: "ledger" });
    expect(R.resolverCodigo("SysMat-20000002", "", B)).toMatchObject({ codigo: "100002", situacao: "ok", origem: "sysmat" });
    expect(R.resolverCodigo("", "Correia em V  A40", B)).toMatchObject({ codigo: "100002", origem: "descricao" });
    expect(R.resolverCodigo("12800101", "PECA DO FABRICANTE", B)).toMatchObject({ situacao: "sem_codigo" });
    expect(R.resolverCodigo("999999", "X", B)).toMatchObject({ codigo: "999999", situacao: "inexistente" });
    expect(R.resolverCodigo("100003", "X", B)).toMatchObject({ situacao: "bloqueado", para: "100004", status: "BLOQUEADO" });
    expect(R.resolverCodigo("100007", "X", B)).toMatchObject({ situacao: "inexistente", para: "100004", status: "CANCELADO" });
  });

  it("só dígitos é código SAP: \".0\" sai, texto de fabricante/desenho vai pela descrição, 2006… é Sysmat", () => {
    expect(R.resolverCodigo("100001.0", "", B)).toMatchObject({ codigo: "100001", situacao: "ok" });
    expect(R.resolverCodigo("DES-1234567", "CORREIA EM V A40", B)).toMatchObject({ codigo: "100002", origem: "descricao" });
    expect(R.resolverCodigo("AS1002F-04A", "PECA SEM CADASTRO", B)).toMatchObject({ situacao: "sem_codigo" });
    expect(R.resolverCodigo("1.28.010.0016", "PECA SEM CADASTRO", B)).toMatchObject({ situacao: "sem_codigo" });
    expect(R.resolverCodigo("20069677", "", B)).toMatchObject({ codigo: "100008", origem: "sysmat" });
    expect(R.resolverCodigo("SysMat-20069999", "", B)).toMatchObject({ situacao: "inexistente", origem: "sysmat" });
    expect(R.resolverCodigo("20069999", "", B)).toMatchObject({ situacao: "sem_codigo" });
  });
});

const idx = (id: string, nome: string, fabricante: string, equipamentos: string[]): R.Indice => ({
  id, arquivo: `${nome}.xlsx`, nome, tipo: "maquina", revisao: "", capa: { maquina: nome, fabricante, modelo: "", area: "", funcao: "" }, equipamentos,
  origem: "automatica", sugestoes: [], contagens: { componentes: 0, plano: 0, pecas: 0 }, enviadoEm: "", enviadoPor: "", confirmadoEm: "", confirmadoPor: "" });
const peca = (codigo: string, descricao: string, x: Partial<R.Peca> = {}): R.Peca => ({ conjunto: "CONJ", codigo, descricao, consumivel: "", classe: "",
  estrategico: false, reserva: false, estSegAlmox: null, valorUnit: null, area: "", posicao: "", estSegUbm: null, ...x });
const [COMP] = R.lerRcm([...CAB_RCM, linhaRcm("ROLAMENTO FICTICIO 1", "", "N", "N", "S", "1", "1", "1", "3", "C")]);

describe("Machine Ledger: pente fino", () => {
  const ledgers: R.EntradaPente[] = [
    { indice: idx("ml-teste01", "MAQUINA FICTICIA 05", "FICTOSKF", ["5000001"]), conteudo: {
      componentes: [{ ...COMP, equip: "MAQUINA FICTICIA 02" }, { ...COMP, equip: "MAQUINA FICTICIA 02" }], plano: [],
      pecas: [peca("100001", "ROLAMENTO RIGIDO"), peca("100002", "CORREIA EM V", { estrategico: true }), peca("999999", "VALVULA QUE NAO EXISTE"),
        peca("100003", "SENSOR"), peca("100007", "SENSOR"), peca("100005", "CHAVE DE FENDA ISOLADA", { reserva: true })] } },
    { indice: idx("ml-teste02", "OUTRA MAQUINA", "OUTROFAB", []), conteudo: { componentes: [], plano: [], pecas: [] } },
  ];
  let vinc: Record<string, string[]> = { "5000001": ["100001", "100006", "100004"] };
  const rodar = (conf = new Set<string>()) => R.penteFino(ledgers, (a) => vinc[a] ?? [], B, conf);
  const de = (as: R.Achado[], t: R.TipoAchado) => as.filter((a) => a.tipo === t);

  it("gera cada tipo de achado", () => {
    const as = rodar();
    expect(de(as, "faltando").map((a) => a.codigo).sort()).toEqual(["100002", "100005"]);
    const sem = de(as, "sem_respaldo");
    expect(sem.map((a) => a.codigo).sort()).toEqual(["100004", "100006"]);
    expect(sem.every((a) => a.forte)).toBe(true); // cita OUTROFAB, fabricante de outro ledger
    const inv = de(as, "codigo_invalido");
    expect(inv.map((a) => a.codigo).sort()).toEqual(["100007", "999999"]);
    expect(inv.find((a) => a.codigo === "100007")?.para).toBe("100004");
    expect(de(as, "bloqueado").map((a) => [a.codigo, a.para])).toEqual([["100003", "100004"]]);
    expect(de(as, "descricao_divergente").map((a) => a.codigo)).toEqual(["100005"]);
    expect(de(as, "estrategico_sem_saldo").map((a) => [a.codigo, a.foraMb52, !!a.secundario])).toEqual([["100002", true, false]]);
    expect(de(as, "reserva_sem_saldo").map((a) => [a.codigo, a.foraMb52, a.secundario])).toEqual([["100005", false, true]]);
    const cop = de(as, "ledger_copiado");
    expect(cop).toHaveLength(1);
    expect(cop[0].detalhe).toMatch(/2 linha\(s\).*MAQUINA FICTICIA 02/);
    const res = R.resumoAchados(as, () => 1);
    expect(res.porAtivo[0]).toMatchObject({ ativo: "5000001", n: 4 }); // só os de vínculo (2 faltando + 2 sem respaldo)
    expect(res.porLedger[0]).toMatchObject({ ledger: "ml-teste01", n: as.length - 4, equipamentos: 1 });
    expect(res.porTipo.codigo_invalido).toEqual({ achados: 2, codigos: 2, ledgers: 1 });
  });

  it("vincular tira o achado 'faltando'; desvincular tira o 'sem respaldo'", () => {
    vinc = { "5000001": [...vinc["5000001"], "100002"].filter((c) => c !== "100006") };
    const as = rodar();
    expect(de(as, "faltando").map((a) => a.codigo)).toEqual(["100005"]);
    expect(de(as, "sem_respaldo").map((a) => a.codigo)).toEqual(["100004"]);
  });

  it("sem respaldo: código vinculado em vários ativos com ledger é de uso geral e fica secundário", () => {
    const ls: R.EntradaPente[] = ["01", "02", "03"].map((n, i) => ({ indice: idx(`ml-uso${n}`, `MAQ USO ${n}`, "FICTOSKF", [`600000${i}`]),
      conteudo: { componentes: [], plano: [], pecas: [peca("100001", "ROLAMENTO RIGIDO")] } }));
    const as = R.penteFino(ls, () => ["100001", "100008"], B);
    const sem = as.filter((a) => a.tipo === "sem_respaldo");
    expect(sem).toHaveLength(3);
    expect(sem.every((a) => a.usoGeral && a.secundario && !a.forte)).toBe(true);
    expect(as.filter((a) => R.visivel(a, false)).some((a) => a.tipo === "sem_respaldo")).toBe(false);
  });

  it("conferido some da lista", () => {
    const chave = R.chaveAchado("codigo_invalido", "ml-teste01", "999999");
    expect(rodar(new Set([chave])).some((a) => a.chave === chave)).toBe(false);
  });

  it("ledger copiado: número diferente do nome; sem número, nada", () => {
    expect(R.rcmDeOutraMaquina("MOINHO FICT 05", [{ equip: "MOINHO FICT 02" }, { equip: "MOINHO FICT 05" }])).toEqual({ texto: "MOINHO FICT 02", linhas: 1 });
    expect(R.rcmDeOutraMaquina("MOINHO FICT 05", [{ equip: "MOINHO FICT" }])).toBeNull();
    expect(R.rcmDeOutraMaquina("INJ FICT 15 a 19", [{ equip: "INJ FICT 17" }])).toBeNull();
  });
});

describe("Machine Ledger: envio validado e ids estáveis", () => {
  it("sanitiza o conteúdo campo a campo e acha o ledger do mesmo nome", () => {
    const c = R.sanitizarConteudo({ componentes: [{ componente: "X".repeat(500), codigo: "123456.0", p: "3", h: 7, evidente: "sim", extra: "fora" }, { codigo: "1" }],
      pecas: [{ descricao: "PECA", estrategico: true, estSegAlmox: "2,5", valorUnit: "abc" }], plano: "nada" });
    expect(c.componentes).toHaveLength(1);
    expect(c.componentes[0]).toMatchObject({ codigo: "123456", p: 3, h: 7, evidente: false });
    expect(c.componentes[0].componente).toHaveLength(200);
    expect("extra" in c.componentes[0]).toBe(false);
    expect(c.pecas[0]).toMatchObject({ estrategico: true, estSegAlmox: 2.5, valorUnit: null });
    expect(c.plano).toEqual([]);
    const ind = [{ id: "ml-abc1234567", arquivo: "MACHINE LEDGER - PRENSA FICT 05.xlsx", nome: "PRENSA FICT 05" }];
    expect(R.ledgerDoMesmoNome(ind, "Machine Ledger - Prensa Fict 05.xlsx", "")).toBe("ml-abc1234567");
    expect(R.ledgerDoMesmoNome(ind, "outro.xlsx", "prensa fict 05")).toBe("ml-abc1234567");
    expect(R.ledgerDoMesmoNome(ind, "outro.xlsx", "outra")).toBeNull();
    // o mesmo arquivo baixado com "_" no lugar dos espaços (anexo de e-mail, chat)
    expect(R.ledgerDoMesmoNome(ind, "MACHINE_LEDGER_-_PRENSA_FICT_05.xlsx", R.nomeDoArquivo("MACHINE_LEDGER_-_PRENSA_FICT_05.xlsx"))).toBe("ml-abc1234567");
    expect(R.nomeDoArquivo("Machine_Ledger_-_Prensa_Fict.xlsx")).toBe("Prensa_Fict");
  });
  it("reconhece o mesmo conteúdo enviado com outro nome de arquivo", () => {
    const c = R.sanitizarConteudo({ componentes: [{ conjunto: "A", subconjunto: "B", componente: "C", codigo: "99001" }], plano: [], pecas: [] });
    const d = R.sanitizarConteudo({ componentes: [{ conjunto: "A", subconjunto: "B", componente: "D", codigo: "99001" }], plano: [], pecas: [] });
    expect(R.mesmoConteudo(c, R.sanitizarConteudo(JSON.parse(JSON.stringify(c))))).toBe(true);
    expect(R.mesmoConteudo(c, d)).toBe(false);
  });
});

describe("Machine Ledger: permissões", () => {
  it("grava: editor/admin que vê a aba, fora de Terceiro e Manutentor", () => {
    expect(R.podeGravar({ perfil: "editor", funcao: "analista" }, true)).toBe(true);
    expect(R.podeGravar({ perfil: "admin", funcao: "lider" }, true)).toBe(true);
    expect(R.podeGravar({ perfil: "leitor", funcao: "lider" }, true)).toBe(false);
    expect(R.podeGravar({ perfil: "editor", funcao: "terceiro" }, true)).toBe(false);
    expect(R.podeGravar({ perfil: "editor", funcao: "manutentor" }, true)).toBe(false);
    expect(R.podeGravar({ perfil: "editor", funcao: "analista" }, false)).toBe(false);
    expect(R.podeGravar(null, true)).toBe(false);
  });
});

// ----------------------------------------------------------------------------
const C = (conjunto: string, subconjunto: string, componente: string, h: number): R.Componente => ({ ...COMP, conjunto, subconjunto, componente, h, classe: "", p: 1, t: 1, v: 1 });
const COMPS = [C("SISTEMA HIDRAULICO", "BOMBA", "ROLAMENTO RIGIDO DE ESFERAS 6205", 3), C("SISTEMA HIDRAULICO", "BOMBA", "VALVULA SOLENOIDE NV0-123", 14),
  C("TRANSMISSAO", "ACIONAMENTO", "CORREIA EM V A40", 12), C("SISTEMA ELETRICO", "PAINEL ELETRICO", "CONTATOR PRINCIPAL", 10)];
const q = (numero: string, d: number | null, texto: string, x: Partial<R.Quebra> = {}): R.Quebra =>
  ({ fonte: "AF", numero, data: d, equipamento: "5000001", conjunto: "", subconjunto: "", componente: "", texto, criticidade: "A", os: "", ...x });

describe("Machine Ledger: AF → componente e calendário de quebras", () => {
  it("associa do mais específico ao mais geral, sem acento e no plural", () => {
    expect(R.associarQuebra(q("1", null, "Válvula solenóide travada"), COMPS)).toMatchObject({ nivel: "componente", indice: 1 });
    expect(R.associarQuebra(q("2", null, "", { componente: "Correia em V" }), COMPS)).toMatchObject({ nivel: "componente", indice: 2 });
    expect(R.associarQuebra(q("3", null, "Troca dos rolamentos travados"), COMPS)).toMatchObject({ nivel: "componente", indice: 0 });
    expect(R.associarQuebra(q("4", null, "Vazamento na bomba"), COMPS)).toMatchObject({ nivel: "subconjunto", rotulo: "BOMBA" });
    expect(R.associarQuebra(q("5", null, "Falha no sistema elétrico"), COMPS)).toMatchObject({ nivel: "conjunto", rotulo: "SISTEMA ELETRICO" });
    expect(R.associarQuebra(q("6", null, "Operador reclamou de barulho"), COMPS)).toMatchObject({ nivel: "nenhum", rotulo: R.NAO_ASSOCIADA });
  });

  it("calendário por mês e semana do ano escolhido; não associadas no fim", () => {
    const qs = [q("A1", dia(2026, 3, 2), "Válvula solenoide queimada"), q("A2", dia(2026, 3, 20), "valvula solenoide travada"),
      q("A3", dia(2026, 7, 9), "Correia rompida"), q("A4", dia(2026, 5, 1), "Barulho estranho"), q("A5", dia(2025, 3, 2), "Válvula solenoide"),
      q("A6", null, "Válvula solenoide")];
    const cal = R.calendarioQuebras(COMPS, qs, 2026);
    expect(cal.map((l) => l.rotulo)).toEqual(["VALVULA SOLENOIDE NV0-123", "CORREIA EM V A40", R.NAO_ASSOCIADA]);
    expect(cal[0].meses[2]).toBe(2);
    expect(cal[0].semanas[2]).toEqual([1, 0, 1, 0, 0]);
    expect(cal[0].total).toBe(2);
    expect(cal[0].h).toBe(14);
    expect(cal[1].meses[6]).toBe(1);
    expect(cal[2].quebras.map((x) => x.numero)).toEqual(["A4"]);
  });

  it("sinais: quebra recorrente com H baixo e H alto sem plano", () => {
    const s = R.sinaisQuebra(COMPS, [{ ...({} as R.Atividade), componente: "CORREIA EM V A40", atividade: "Verificar tensão" }],
      [q("1", 1, "rolamento travado"), q("2", 2, "rolamento com folga")]);
    expect(s.find((x) => x.sinal === "rcm_subestimado")).toMatchObject({ rotulo: "ROLAMENTO RIGIDO DE ESFERAS 6205", quebras: 2 });
    expect(s.filter((x) => x.sinal === "h_alto_sem_plano").map((x) => x.rotulo).sort()).toEqual(["CONTATOR PRINCIPAL", "VALVULA SOLENOIDE NV0-123"]);
  });
});

describe("Machine Ledger: outros cruzamentos", () => {
  it("IW13 × ledger, IP19 × Plano Mestre e sugestões para a UBM", () => {
    const c = R.consumoXLedger([{ material: "0100001", descricao: "", ordens: 1, quantidade: 1 }, { material: "100009", descricao: "", ordens: 3, quantidade: 2 }], new Set(["100001"]));
    expect(c).toEqual({ previstasConsumidas: 1, naoPrevistas: [{ material: "100009", descricao: "", ordens: 3, quantidade: 2 }] });
    const at = (planoSap: string) => ({ ...({} as R.Atividade), atividade: `A${planoSap}`, planoSap });
    const p = R.planoXIp19([at("111"), at("222"), at("")], [{ plano: "111", texto: "" }, { plano: "333", texto: "" }]);
    expect(p.semPlanoSap.map((a) => a.planoSap)).toEqual(["222"]);
    expect(p.semCodigo).toBe(1);
    expect(p.foraDoLedger.map((x) => x.plano)).toEqual(["333"]);
    expect(R.sugestoesUbm([peca("1", "a", { estSegUbm: 2 }), peca("2", "b")]).map((x) => x.codigo)).toEqual(["1"]);
  });
});

// ----------------------------------------------------------------------------
describe("Machine Ledger: gravação na demonstração (mesmo campo da Gestão de MRO)", async () => {
  const { _definirFonte } = await import("@/lib/dados/fonte");
  beforeAll(() => { _definirFonte(null); });
  afterAll(() => { _definirFonte(undefined); });
  const EDITOR = { login: "ed1", nome: "Editor Teste", perfil: "editor", funcao: "analista" };
  const MANUT = { login: "m1", nome: "Manutentor Teste", perfil: "editor", funcao: "manutentor" };

  it("vincular muda o achado; manutentor não grava; conferido e correspondência", async () => {
    const D = await import("@/lib/machineLedger/dados");
    const { lerCadastro } = await import("@/lib/dados/cadastros");
    const antes = (await D.penteFinoAtual()).achados;
    const f = antes.find((a) => a.tipo === "faltando")!;
    expect(f).toBeTruthy();
    await expect(D.alterarVinculo(MANUT, f.ativos[0], f.codigo, "vincular")).rejects.toThrow(/editores/);
    await D.alterarVinculo(EDITOR, f.ativos[0], f.codigo, "vincular");
    expect(((await lerCadastro("cadastro_equipamentos.json"))[f.ativos[0]].materiais as string[])).toContain(f.codigo);
    expect((await D.penteFinoAtual()).achados.some((a) => a.chave === f.chave)).toBe(false);
    await D.alterarVinculo(EDITOR, f.ativos[0], f.codigo, "desvincular");
    expect((await D.penteFinoAtual()).achados.some((a) => a.chave === f.chave)).toBe(true);
    const inv = antes.find((a) => a.tipo === "codigo_invalido")!;
    expect(inv).toBeTruthy();
    await D.marcarConferido(EDITOR, inv.chave, true);
    expect((await D.penteFinoAtual()).achados.some((a) => a.chave === inv.chave)).toBe(false);
    await D.marcarConferido(EDITOR, inv.chave, false);
    const [l] = await D.lerIndice();
    await D.gravarCorrespondencia(EDITOR, l.id, [...l.equipamentos, "10000140"]);
    expect((await D.lerIndice()).find((x) => x.id === l.id)).toMatchObject({ origem: "confirmada", equipamentos: [...l.equipamentos, "10000140"] });
    await expect(D.gravarCorrespondencia(EDITOR, l.id, ["99999999"])).rejects.toThrow(/fora do IH08/);
    await D.gravarCorrespondencia(EDITOR, l.id, l.equipamentos);
  });

  it("confirmar o código sugerido pela referência libera o componente para a IA06", async () => {
    const D = await import("@/lib/machineLedger/dados");
    const l = (await D.lerIndice()).find((i) => i.id === "ml-demo0001")!;
    const sug = (await D.operacoesDoLedger(l)).linhas.find((x) => x.sugerido && x.codigo)!;
    expect(sug.codigoOk).toBe(false);
    await expect(D.gravarCodigo(MANUT, sug.chave, sug.codigo)).rejects.toThrow(/editores/);
    await expect(D.gravarCodigo(EDITOR, sug.chave, "900000")).rejects.toThrow(/não é uma sugestão/);
    await D.gravarCodigo(EDITOR, sug.chave, sug.codigo);
    expect((await D.operacoesDoLedger(l)).linhas.find((x) => x.chave === sug.chave)).toMatchObject({ codigoOk: true, codigoConfirmado: { codigo: sug.codigo } });
    await D.gravarCodigo(EDITOR, sug.chave, null);
    expect((await D.operacoesDoLedger(l)).linhas.find((x) => x.chave === sug.chave)?.codigoOk).toBe(false);
  });

  it("demonstração gera achados de todos os tipos", async () => {
    const D = await import("@/lib/machineLedger/dados");
    const tipos = new Set((await D.penteFinoAtual()).achados.map((a) => a.tipo));
    expect([...tipos].sort()).toEqual(Object.keys(R.TIPOS_ACHADO).sort());
  });
});
