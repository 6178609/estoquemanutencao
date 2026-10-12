import { strToU8, zipSync } from "fflate";
import { describe, expect, it } from "vitest";

import { processar, tiposDaGestao } from "@/lib/leitura/processar";
import { Xlsx } from "@/lib/leitura/xlsx";

/** Planilha fictícia de Gestão de HH: aba da equipe + aba de apoio com os tipos de ordem. */
function planilha(): Uint8Array {
  const cel = (r: number, c: string, v: string) => `<c r="${c}${r}" t="inlineStr"><is><t>${v}</t></is></c>`;
  const equipe = `<row r="1">${cel(1, "A", "Nº pessoal")}${cel(1, "B", "Nome")}${cel(1, "C", "Cargo")}${cel(1, "D", "Centro trabalho")}</row>`
    + `<row r="2">${cel(2, "A", "7000101")}${cel(2, "B", "Pessoa Fictícia")}${cel(2, "C", "Mecânico")}${cel(2, "D", "MEC_COMP")}</row>`;
  const apoio = `<row r="1">${cel(1, "A", "TIPO")}${cel(1, "B", "TIPO DE OM")}</row><row r="2">${cel(2, "A", "YM11")}${cel(2, "B", "Corretiva Emergencial")}</row>`
    + `<row r="3">${cel(3, "A", "YM01")}${cel(3, "B", "Preventiva")}</row><row r="4">${cel(4, "A", "xx")}${cel(4, "B", "inválido")}</row>`;
  return zipSync({
    "xl/workbook.xml": strToU8('<workbook><sheets><sheet name="Gestão de HH" r:id="rId1"/><sheet name="Apoio" r:id="rId2"/></sheets></workbook>'),
    "xl/_rels/workbook.xml.rels": strToU8('<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Target="worksheets/sheet2.xml"/></Relationships>'),
    "xl/worksheets/sheet1.xml": strToU8(`<worksheet><sheetData>${equipe}</sheetData></worksheet>`),
    "xl/worksheets/sheet2.xml": strToU8(`<worksheet><sheetData>${apoio}</sheetData></worksheet>`),
  });
}

describe("tipos de ordem da Gestão de HH", () => {
  it("lê a aba de apoio (TIPO / TIPO DE OM) junto com a equipe", () => {
    const b = planilha();
    expect(tiposDaGestao(new Xlsx(b))).toEqual({ YM11: "Corretiva Emergencial", YM01: "Preventiva" });
    const r = processar("Gestao de HH.xlsx", b);
    expect(r.bases.map((x) => x.tipo)).toEqual(["equipe"]);
    expect(r.tiposOrdem).toEqual({ YM11: "Corretiva Emergencial", YM01: "Preventiva" });
  });
});
