import { describe, expect, it } from "vitest";

import * as I from "@/app/(app)/mro/ia06";

/** Inclusão das peças nas listas de tarefas (IA06) — dados fictícios. */
const ip19 = [
  { "Plano de manutenção": "900001", "Texto plano manut.": "PREV MENSAL PRENSA", "Grp.plnj.PM": "P01", "Grupo listas tarefas": "GRP_A", "Numerador de grupos": "1" },
  { "Plano de manutenção": "900001", "Texto plano manut.": "PREV MENSAL PRENSA", "Grp.plnj.PM": "P01", "Grupo listas tarefas": "GRP_A", "Numerador de grupos": "1" },
  { "Plano de manutenção": "900002", "Texto plano manut.": "LUBRIFICACAO", "Grp.plnj.PM": "P01", "Grupo listas tarefas": "GRP_B", "Numerador de grupos": "3" },
  { "Plano de manutenção": "900003", "Texto plano manut.": "SEM LISTA", "Grp.plnj.PM": "P01", "Grupo listas tarefas": "", "Numerador de grupos": "" },
];

describe("listas de tarefas de cada equipamento", () => {
  it("plano → grupo/numerador pela IP19 (sem confundir com o grupo de planejamento)", () => {
    const m = I.listasPorPlano(ip19);
    expect([...m.keys()]).toEqual(["900001", "900002"]);
    expect(m.get("900002")).toEqual({ grupo: "GRP_B", numerador: "3", texto: "LUBRIFICACAO" });
    expect(I.listasPorPlano(null).size).toBe(0);
  });
  it("equipamento → listas pelos planos das ordens do IW38, sem repetir", () => {
    const m = I.listasPorEquipamento([
      { equipChave: "EQ1", plano: "900002" }, { equipChave: "EQ1", plano: "900001" }, { equipChave: "EQ1", plano: "900001" },
      { equipChave: "EQ2", plano: "900003" }, { equipChave: "EQ3", plano: "" },
    ], I.listasPorPlano(ip19));
    expect(m.get("EQ1")!.map((l) => `${l.grupo}/${l.numerador}`)).toEqual(["GRP_A/1", "GRP_B/3"]);
    expect(m.get("EQ1")![0].planos).toEqual(["900001"]);
    expect(m.get("EQ1")!.map((l) => l.equipamentos)).toEqual([1, 1]);
    // lista geral compartilhada: conta os equipamentos
    const c = I.listasPorEquipamento([{ equipChave: "EQ1", plano: "900001" }, { equipChave: "EQ9", plano: "900001" }], I.listasPorPlano(ip19));
    expect(c.get("EQ9")![0].equipamentos).toBe(2);
    expect(m.has("EQ2")).toBe(false);
  });
});

describe("listas pela IP19 e pelos subconjuntos", () => {
  it("listas pela coluna Equipamento da IP19 (mesmo sem ordem), todas as listas do plano", () => {
    const linhas = [{ ...ip19[2], Equipamento: "SUB1" }, { ...ip19[2], Equipamento: "SUB1", "Grupo listas tarefas": "GRP_C", "Numerador de grupos": "2" },
      { ...ip19[0], Equipamento: "" }];
    expect(I.listasDiretasDaIp19(null)).toEqual([]);
    const m = I.listasPorEquipamento([], new Map(), I.listasDiretasDaIp19(linhas));
    expect(m.get("SUB1")!.map((l) => `${l.grupo}/${l.numerador}/${l.planos.join()}`)).toEqual(["GRP_B/3/900002", "GRP_C/2/900002"]);
  });
  it("a máquina recebe as listas dos subconjuntos, com o nome, sem repetir as dela", () => {
    const base = I.listasPorEquipamento([{ equipChave: "MAQ", plano: "900001" }, { equipChave: "SUB1", plano: "900001" },
      { equipChave: "SUB1", plano: "900002" }, { equipChave: "NETO", plano: "900002" }], I.listasPorPlano(ip19));
    const m = I.comListasDosSubconjuntos(base, [{ equipamento: "MAQ", denominacao: "MAQUINA" },
      { equipamento: "SUB1", denominacao: "MAQ - LUBRIFICACAO", superior: "MAQ" }, { equipamento: "NETO", denominacao: "X", superior: "SUB1" }]);
    expect(m.get("MAQ")!.map((l) => `${l.grupo}/${l.numerador}/${l.subconjunto ?? ""}`)).toEqual(["GRP_A/1/", "GRP_B/3/MAQ - LUBRIFICACAO (SUB1)"]);
    expect(m.get("SUB1")!.map((l) => l.grupo)).toEqual(["GRP_A", "GRP_B"]);
  });
  it("script acha o CSV fora da pasta dele (rodando de dentro do SAP) e pergunta a pasta", () => {
    const v = I.scriptInclusao(true);
    expect(v).toContain("%USERPROFILE%");
    expect(v).toContain("InputBox(");
    expect(v).not.toMatch(/C:\\Users\\[a-z]/i);
  });
});

describe("carga e script", () => {
  const item: I.ItemInclusao = { grupo: "GRP_A", numerador: "1", operacao: "10", material: "100200", quantidade: 1.5, um: "PC",
    texto: "ROLAMENTO; 6205 ÇÃO", equipamento: "LINHA-1" };
  it("CSV no leiaute do script: X, operação com 4 dígitos, vírgula decimal, sem ; no texto, ativos identificados", () => {
    const s = I.csvInclusao([item, item, { ...item, material: "" }]);
    const l = s.trim().split("\r\n");
    expect(l[0]).toBe(I.CABECALHO_CSV);
    expect(l[0]).toBe("EXECUTAR;GRUPO;CONTADOR;OPERACAO;MATERIAL;QUANTIDADE;UM;TEXTO;ATIVOS;QTD_ATIVOS;EQUIPAMENTOS_DA_LISTA");
    expect(l).toHaveLength(2);
    expect(l[1]).toBe("X;GRP_A;1;0010;100200;1,5;PC;ROLAMENTO 6205 ÇÃO;LINHA-1;1;");
    expect(I.csvInclusao([{ ...item, usoLista: 3 }]).split("\r\n")[1].endsWith(";3")).toBe(true);
    expect(I.csvInclusao([item], false).split("\r\n")[1].startsWith(";GRP_A;")).toBe(true);
  });
  it("nunca repete o material na mesma lista: outra operação, zeros à esquerda ou outro ativo viram uma linha só", () => {
    const l = I.csvInclusao([
      { ...item, equipamento: "EXT-01 (41001404) - PRENSA 01" },
      { ...item, operacao: "20", material: "000100200", equipamento: "EXT-02 (41001405) - PRENSA 02" },
      { ...item, equipamento: "EXT-01 (41001404) - PRENSA 01" },
      { ...item, numerador: "2", equipamento: "EXT-03" }, // outra lista: entra
    ]).trim().split("\r\n").slice(1);
    expect(l).toHaveLength(2);
    expect(l[0].split(";")).toEqual(["X", "GRP_A", "1", "0010", "100200", "1,5", "PC", "ROLAMENTO 6205 ÇÃO",
      "EXT-01 (41001404) - PRENSA 01 | EXT-02 (41001405) - PRENSA 02", "2", ""]);
    expect(l[1].split(";").slice(1, 3)).toEqual(["GRP_A", "2"]);
  });
  it("identificação do ativo: campo de ordenação, equipamento e nome", () => {
    expect(I.identificarAtivo({ codigo: "41001404", campo: "EXT-01", nome: "PRENSA; 01" })).toBe("EXT-01 (41001404) - PRENSA 01");
    expect(I.identificarAtivo({ codigo: "41001404", campo: "41001404" })).toBe("41001404");
  });
  it("ANSI: acento em Latin-1, fora dele vira ?", () => {
    expect([...I.ansi("Ç€a")]).toEqual([0xc7, 63, 97]);
    expect(I.operacao4("20")).toBe("0020");
    expect(I.operacao4("0100")).toBe("0100");
  });
  it("script: modo teste escolhido, CRLF, sem caminho pessoal, blocos fechados", () => {
    const t = I.scriptInclusao(true), g = I.scriptInclusao(false);
    expect(t).toContain("Const MODO_TESTE = True");
    expect(g).toContain("Const MODO_TESTE = False");
    expect(t).not.toContain("@@");
    expect(t).not.toMatch(/C:\\Users/i);
    expect(t.split("\r\n").length).toBeGreaterThan(100);
    expect(t.replace(/\r\n/g, "").includes("\n")).toBe(false);
    const conta = (re: RegExp) => (t.match(re) ?? []).length;
    expect(conta(/^\s*Function \w+/gm)).toBe(conta(/^\s*End Function\b/gm));
    expect(conta(/^\s*Sub \w+/gm)).toBe(conta(/^\s*End Sub\b/gm));
    // If de bloco (linha terminando em Then) × End If
    expect(conta(/^\s*(Else)?If .* Then\s*$/gm) - conta(/^\s*ElseIf .* Then\s*$/gm)).toBe(conta(/^\s*End If\b/gm));
    expect(conta(/^\s*Do\b/gm)).toBe(conta(/^\s*Loop\b/gm));
    expect(conta(/^\s*For\b/gm)).toBe(conta(/^\s*Next\b/gm));
    expect(t).toContain('Const ARQ_CSV = "' + I.ARQ_CSV + '"');
    expect(t).not.toMatch(/COL_UM|Loop While pos <= maxPos \+ vis/); // não escreve unidade; varredura não passa do fim
    expect(conta(/If pos > maxPos Then pos = maxPos/g)).toBe(4);
    // nunca repete: chave por lista + material (sem operação) nos feitos e no próprio CSV; ativos nos logs
    expect(t).toContain("Function ChaveMaterial(campos)");
    expect(t).toContain("ElseIf vistos.Exists(chMat) Then");
    expect(t).toContain("feitosMat.Exists(chMat)");
    expect(t).toMatch(/AnotaFeito campos, "ja estava"/);
    expect(t).toContain('"GRUPO;CONTADOR;OPERACAO;MATERIAL;QUANTIDADE;UM;TEXTO;MOTIVO;DATA;ATIVOS"');
  });
});
