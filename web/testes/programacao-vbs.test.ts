import { describe, expect, it } from "vitest";

import { consultas, deIso } from "@/app/(app)/programacao/logica";
import { gerarVbs, nomeArquivoVbs } from "@/app/(app)/programacao/vbs";

// programação fictícia: duas máquinas, uma para duas vezes no mês
const prog = { "2030-03-05": ["MAQ-01", "MAQ-02"], "2030-03-19": ["MAQ-01"] };
const cons = consultas(prog, deIso("2030-03-01")!, deIso("2030-03-31")!);
const base = { de: "2030-03-01", ate: "2030-03-31", por: "Pessoa Ficticia", geradoEm: "01/03/2030 08:00",
  nomes: { "MAQ-01": "Injetora Ficticia Ç", "MAQ-02": "Prensa \"B\"" } };

/** Confere o aninhamento dos blocos do VBScript (o arquivo só roda no Windows; aqui vai a estrutura). */
function blocos(vbs: string): string[] {
  const pilha: string[] = [];
  const erros: string[] = [];
  vbs.split("\r\n").forEach((cru, n) => {
    const l = cru.replace(/'.*$/, "").replace(/"[^"]*"/g, '""').trim();
    if (!l) return;
    const abre = (k: string) => pilha.push(k);
    const fecha = (k: string) => { if (pilha.pop() !== k) erros.push(`linha ${n + 1}: ${cru.trim()}`); };
    if (/^(Public |Private )?Sub \w+/i.test(l)) abre("Sub");
    else if (/^(Public |Private )?Function \w+/i.test(l)) abre("Function");
    else if (/^End Sub$/i.test(l)) fecha("Sub");
    else if (/^End Function$/i.test(l)) fecha("Function");
    else if (/^If .* Then$/i.test(l)) abre("If");
    else if (/^End If$/i.test(l)) fecha("If");
    else if (/^For\b/i.test(l)) abre("For");
    else if (/^Next\b/i.test(l)) fecha("For");
    else if (/^Do\b/i.test(l)) abre("Do");
    else if (/^Loop\b/i.test(l)) fecha("Do");
    else if (/^Select Case\b/i.test(l)) abre("Select");
    else if (/^End Select$/i.test(l)) fecha("Select");
  });
  return [...erros, ...pilha.map((k) => `aberto sem fechar: ${k}`)];
}

describe("script VBS da programação do mês", () => {
  it("embute as consultas da IW38 de cada dia e o modo", () => {
    const vbs = gerarVbs(cons, { ...base, teste: true });
    expect(vbs).toContain("Const MODO_TESTE = True");
    // MAQ-01 para duas vezes: a 1ª parada leva as ordens até ela, a última até o fim do mês; MAQ-02 leva o mês todo
    expect(vbs).toContain('Junta "2030-03-05;2030-03-01;2030-03-05;MAQ-01"');
    expect(vbs).toContain('Junta "2030-03-05;2030-03-01;2030-03-31;MAQ-02"');
    expect(vbs).toContain('Junta "2030-03-19;2030-03-06;2030-03-31;MAQ-01"');
    expect(gerarVbs(cons, { ...base, teste: false })).toContain("Const MODO_TESTE = False");
    expect(vbs).not.toContain("@@DADOS@@");
  });

  it("só ASCII, com quebra de linha do Windows e aspas seguras nos comentários", () => {
    const vbs = gerarVbs(cons, { ...base, teste: false });
    expect(/^[\x09\x0a\x0d\x20-\x7e]*$/.test(vbs)).toBe(true);
    expect(vbs.split("\r\n").length).toBeGreaterThan(400);
    expect(/[^\r]\n/.test(vbs)).toBe(false);
    expect(vbs).toContain("Injetora Ficticia C");
    expect(vbs).toContain("Prensa 'B'");
  });

  it("blocos do VBScript balanceados", () => {
    expect(blocos(gerarVbs(cons, { ...base, teste: false }))).toEqual([]);
  });

  it("nome do arquivo", () => {
    expect(nomeArquivoVbs("2030-03-01", "2030-03-31", true)).toBe("SAP_IW32_datas_20300301_20300331_TESTE.vbs");
  });
});
