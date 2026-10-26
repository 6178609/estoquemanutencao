import { strFromU8, unzipSync } from "fflate";
import { describe, expect, it } from "vitest";

import { gerarPdfTabela } from "@/lib/exportacao/pdf";
import { gerarXlsx } from "@/lib/exportacao/xlsx";

/** Só dados fictícios. */
const latin1 = (b: Uint8Array) => Array.from(b, (x) => String.fromCharCode(x)).join("");

describe("PDF de tabela", () => {
  const linhas = Array.from({ length: 70 }, (_, i) => [String(1000 + i), `Rolamento ação (${i}) \\ teste`, "FAB: SKF - REF: 6205", "UN", "3", "—", "Em estoque"]);
  const pdf = gerarPdfTabela({ titulo: "Peças vinculadas · Injetora teste", subtitulo: "Linha teste", colunas: [
    { titulo: "Material", largura: 60 }, { titulo: "Descrição", largura: 200 }, { titulo: "Fab", largura: 150 }, { titulo: "UM", largura: 30 },
    { titulo: "Estoque", largura: 50, direita: true }, { titulo: "Mínimo", largura: 50, direita: true }, { titulo: "Situação", largura: 100 }], linhas },
  new Date("2026-10-26T12:00:00Z"));
  const s = latin1(pdf);

  it("é um PDF válido com xref certo e várias páginas", () => {
    expect(s.startsWith("%PDF-1.4")).toBe(true);
    expect(s.trimEnd().endsWith("%%EOF")).toBe(true);
    const xref = Number(/startxref\n(\d+)/.exec(s)![1]);
    expect(s.slice(xref, xref + 4)).toBe("xref");
    // cada entrada do xref aponta para "n 0 obj"
    const entradas = s.slice(xref).split("\n").filter((l) => / 00000 n $/.test(l)).map((l) => Number(l.slice(0, 10)));
    entradas.forEach((o, i) => expect(s.slice(o, o + 12)).toMatch(new RegExp(`^${i + 1} 0 obj`)));
    expect(/\/Count (\d+)/.exec(s)![1]).toBe("3");
    expect(s).toContain("P\\341gina 3 de 3"); // "Página" em WinAnsi
  });

  it("acentos em WinAnsi e parênteses/barra escapados", () => {
    expect(s).toContain("a\\347\\343o"); // "ação"
    expect(s).toContain("\\(0\\) \\\\ teste");
    expect(s).toContain("/Encoding /WinAnsiEncoding");
  });

  it("tabela vazia ainda gera uma página", () => {
    const v = latin1(gerarPdfTabela({ titulo: "Vazio", colunas: [{ titulo: "A", largura: 10 }], linhas: [] }));
    expect(v).toContain("Nenhum item.");
    expect(/\/Count (\d+)/.exec(v)![1]).toBe("1");
  });
});

describe("Excel (.xlsx)", () => {
  const x = unzipSync(gerarXlsx("Peças 4100/1", [{ titulo: "Material" }, { titulo: "Descrição" }, { titulo: "Estoque" }],
    [["1773701", "Agulha <bloqueio> & \"bico\"", 3], ["=HYPERLINK(1)", null, 2.5]]));

  it("tem as partes do pacote e a aba com nome válido", () => {
    expect(Object.keys(x).sort()).toEqual(["[Content_Types].xml", "_rels/.rels", "xl/_rels/workbook.xml.rels", "xl/styles.xml", "xl/workbook.xml", "xl/worksheets/sheet1.xml"]);
    expect(strFromU8(x["xl/workbook.xml"])).toContain('name="Peças 4100 1"');
  });

  it("texto escapado e nunca fórmula; número como número; cabeçalho fixo", () => {
    const sh = strFromU8(x["xl/worksheets/sheet1.xml"]);
    expect(sh).toContain("Agulha &lt;bloqueio&gt; &amp; &quot;bico&quot;");
    expect(sh).toContain('<c r="C2"><v>3</v></c>');
    expect(sh).toContain('<c r="A3" t="inlineStr"><is><t xml:space="preserve">=HYPERLINK(1)</t></is></c>');
    expect(sh).not.toContain("<f>");
    expect(sh).toContain('state="frozen"');
    expect(sh).toContain('<autoFilter ref="A1:C3"/>');
  });
});
