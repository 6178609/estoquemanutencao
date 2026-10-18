import { strToU8, zipSync } from "fflate";
import { describe, expect, it } from "vitest";

import { lerArquivo, lerHtml, lerTexto, paraTexto, sondar } from "@/lib/leitura/leitura";
import { emPartes, paraParquet } from "@/lib/leitura/parquet";
import { identificar } from "@/lib/leitura/tipos";
import { formatoDeData, Xlsx } from "@/lib/leitura/xlsx";

/** Uma pasta de trabalho mínima (dados fictícios), montada à mão como o Excel grava. */
function xlsxFicticio(abas: { nome: string; oculta?: boolean; linhas: string }[]): Uint8Array {
  const arquivos: Record<string, Uint8Array> = {
    "[Content_Types].xml": strToU8("<Types/>"),
    "xl/workbook.xml": strToU8(`<workbook xmlns:r="r"><sheets>${abas.map((a, i) =>
      `<sheet name="${a.nome}" sheetId="${i + 1}"${a.oculta ? ' state="hidden"' : ""} r:id="rId${i + 1}"/>`).join("")}</sheets></workbook>`),
    "xl/_rels/workbook.xml.rels": strToU8(`<Relationships>${abas.map((_, i) =>
      `<Relationship Id="rId${i + 1}" Target="worksheets/sheet${i + 1}.xml"/>`).join("")}</Relationships>`),
    "xl/sharedStrings.xml": strToU8(`<sst><si><t>Ordem</t></si><si><t>Tipo de ordem</t></si><si><t>Texto breve</t></si>
      <si><t>Data-base do início</t></si><si><r><t>TROCAR </t></r><r><t>ROLAMENTO\r\nMOTOR</t></r></si><si><t>NA</t></si></sst>`),
    "xl/styles.xml": strToU8(`<styleSheet><numFmts count="1"><numFmt numFmtId="164" formatCode="dd/mm/yyyy\\ hh:mm"/></numFmts>
      <cellXfs count="3"><xf numFmtId="0"/><xf numFmtId="14"/><xf numFmtId="164"/></cellXfs>
      <dxfs><dxf><numFmt numFmtId="14" formatCode="General"/></dxf></dxfs></styleSheet>`),
  };
  abas.forEach((a, i) => { arquivos[`xl/worksheets/sheet${i + 1}.xml`] = strToU8(`<worksheet><sheetData>${a.linhas}</sheetData></worksheet>`); });
  return zipSync(arquivos);
}

const IW38 = `<row r="1"><c r="A1" t="inlineStr"><is><t>Relatório IW38</t></is></c></row>
<row r="3"><c r="A3" t="s"><v>0</v></c><c r="B3" t="s"><v>1</v></c><c r="C3" t="s"><v>2</v></c><c r="D3" t="s"><v>3</v></c></row>
<row r="4"><c r="A4"><v>4001234</v></c><c r="B4" t="inlineStr"><is><t>YM01</t></is></c><c r="C4" t="s"><v>4</v></c><c r="D4" s="1"><v>45659</v></c></row>
<row r="5"><c r="A5"><v>4001235.5</v></c><c r="B5" t="s"><v>5</v></c><c r="D5" s="2"><v>45659.5</v></c></row>`;

describe("leitor de .xlsx", () => {
  it("acha a base pelo cabeçalho, lê datas pelo formato e textos compartilhados", () => {
    const bytes = xlsxFicticio([{ nome: "Velha", oculta: true, linhas: IW38 }, { nome: "IW38", linhas: IW38 }]);
    const achados = sondar("export.xlsx", bytes);
    expect(achados).toEqual([{ tipo: "iw38", aba: "IW38", linhaCab: 2 }]); // a aba visível vence a oculta
    const t = lerArquivo("export.xlsx", bytes, "IW38", 2);
    expect(t.colunas).toEqual(["Ordem", "Tipo de ordem", "Texto breve", "Data-base do início"]);
    expect(t.linhas).toEqual([
      ["4001234", "YM01", "TROCAR ROLAMENTO\nMOTOR", "02/01/2025"],
      ["4001235.5", "", "", "02/01/2025 12:00"], // "NA" vira vazio
    ]);
  });
  it("formatos de data", () => {
    expect(formatoDeData("dd/mm/yyyy")).toBe(true);
    expect(formatoDeData('#,##0.00_-;"R$"\\ #,##0')).toBe(false);
    expect(formatoDeData("[$-416]mmm/yy")).toBe(true);
    expect(formatoDeData("General")).toBe(false);
    expect(new Xlsx(xlsxFicticio([{ nome: "A", linhas: "" }])).abas.map((a) => a.nome)).toEqual(["A"]);
  });
  it("números e datas viram texto no formato do repositório de dados", () => {
    expect(paraTexto(12)).toBe("12");
    expect(paraTexto(12.5)).toBe("12.5");
    expect(paraTexto(1e-7)).toBe("0.0000001");
    expect(paraTexto(true)).toBe("True");
    expect(paraTexto(null)).toBe("");
  });
});

describe("HTML e texto do SAP GUI", () => {
  it("MB52 em árvore (lista agrupada) soma os saldos e não confunde texto com número", () => {
    const tr = (s: string) => `<tr><td><nobr>${s.replace(/ /g, "&nbsp;")}</nobr></td></tr>`;
    const html = `<html><body><table>${[
      "11111      PARAFUSO M8 X 20  2690089  2660019",
      "           UN                                  6",
      "22222      GRAXA LITIO",
      "           KG                          2.475,500",
      "0099378    KG   A                         1,5-",
      "* Total",
    ].map(tr).join("")}</table></body></html>`;
    const t = lerArquivo("MB52.htm", new TextEncoder().encode(html));
    expect(t.colunas).toEqual(["Material", "Texto breve material", "UM", "Utilização livre"]);
    expect(t.linhas).toEqual([["11111", "PARAFUSO M8 X 20 2690089 2660019", "UN", "6"], ["22222", "GRAXA LITIO", "KG", "2474"]]);
    expect(identificar(t.colunas)).toBe("mb52");
  });
  it("tabela HTML com cabeçalho repetido a cada página", () => {
    const linha = (cs: string[], tag = "td") => `<tr>${cs.map((c) => `<${tag}>${c}</${tag}>`).join("")}</tr>`;
    const cab = ["Nota", "Tipo de nota", "Descrição"];
    const t = lerHtml(`<table>${linha(cab, "th")}${linha(["1", "M1", "Ruído &amp; vibração"])}${linha(cab)}${linha(["2", "M2", "Vazamento"])}</table>`);
    expect(t.linhas).toEqual([["1", "M1", "Ruído & vibração"], ["2", "M2", "Vazamento"]]);
  });
  it("lista com | e CSV com ;", () => {
    const pipe = lerTexto("----------\n| Material | Utilização livre | UM |\n----------\n| 111 | 5 | UN |\n| 222 | 1,5 | KG |\n");
    expect(pipe.linhas).toEqual([["111", "5", "UN"], ["222", "1,5", "KG"]]);
    const csv = lerTexto('Nº da requisição;Aprovador;Total\n10;"Silva; A";1.234,50\n');
    expect(csv.linhas).toEqual([["10", "Silva; A", "1.234,50"]]);
    expect(identificar(csv.colunas)).toBe("requisicoes");
    expect(sondar("ordens_filtradas.csv", new TextEncoder().encode("Ordem;Tipo de ordem\n1;YM01"))).toEqual([]);
  });
});

describe("parquet no navegador", () => {
  it("divide uma base grande em partes que cabem numa requisição", () => {
    const t = { colunas: ["Material", "Descr Completa"], linhas: Array.from({ length: 4000 }, (_, i) => [String(i), `PECA FICTICIA ${i} `.repeat(8)]) };
    expect(paraParquet(t).subarray(0, 4)).toEqual(new Uint8Array([80, 65, 82, 49])); // PAR1
    const partes = emPartes(t, 40_000);
    expect(partes.length).toBeGreaterThan(1);
    expect(partes.every((p) => p.length <= 40_000)).toBe(true);
  });
});
