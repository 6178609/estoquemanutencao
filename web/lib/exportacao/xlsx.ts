import { strToU8, zipSync } from "fflate";

/**
 * Planilha .xlsx simples (uma ou várias abas), sem biblioteca além do zip: cabeçalho em negrito e fixo, números como
 * número, texto como texto (nunca fórmula). Testado em testes/exportacao.test.ts.
 */
export type CelulaXlsx = string | number | null;
export interface AbaXlsx { nome: string; colunas: { titulo: string; largura?: number }[]; linhas: CelulaXlsx[][] }

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!)
  // caracteres de controle não valem em XML
  .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, " ");
const colunaLetra = (i: number) => { let s = ""; for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s; return s; };
/** Caracteres que o Excel não aceita no nome da aba. */
const PROIBIDOS_ABA = /[\\/?*[\]:]/g;

export function gerarXlsx(aba: string, colunas: { titulo: string; largura?: number }[], linhas: CelulaXlsx[][]): Uint8Array {
  return gerarXlsxAbas([{ nome: aba, colunas, linhas }]);
}

function planilha({ colunas, linhas }: AbaXlsx): string {
  const celula = (v: CelulaXlsx, ref: string, estilo = 0) => {
    const s = estilo ? ` s="${estilo}"` : "";
    if (v == null || v === "") return `<c r="${ref}"${s}/>`;
    if (typeof v === "number" && Number.isFinite(v)) return `<c r="${ref}"${s}><v>${v}</v></c>`;
    return `<c r="${ref}"${s} t="inlineStr"><is><t xml:space="preserve">${esc(String(v))}</t></is></c>`;
  };
  const todas = [colunas.map((c) => c.titulo), ...linhas];
  const sheetData = todas.map((l, r) => `<row r="${r + 1}">${l.map((v, c) => celula(v, `${colunaLetra(c)}${r + 1}`, r === 0 ? 1 : 0)).join("")}</row>`).join("");
  const cols = `<cols>${colunas.map((c, i) => `<col min="${i + 1}" max="${i + 1}" width="${c.largura ?? 16}" customWidth="1"/>`).join("")}</cols>`;
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>${cols}<sheetData>${sheetData}</sheetData>${linhas.length ? `<autoFilter ref="A1:${colunaLetra(colunas.length - 1)}${linhas.length + 1}"/>` : ""}</worksheet>`;
}

/** Pasta de trabalho com várias abas (nomes válidos e únicos: até 31 caracteres, repetido ganha " (2)"). */
export function gerarXlsxAbas(abas: AbaXlsx[]): Uint8Array {
  const usados = new Set<string>();
  const nomes = abas.map((a) => {
    const base = a.nome.replace(PROIBIDOS_ABA, " ").slice(0, 31) || "Planilha";
    let n = base, k = 2;
    while (usados.has(n.toLowerCase())) { const suf = ` (${k++})`; n = `${base.slice(0, 31 - suf.length)}${suf}`; }
    usados.add(n.toLowerCase());
    return esc(n);
  });
  const sheets = nomes.map((n, i) => `<sheet name="${n}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("");
  const filtros = abas.map((a, i) => (a.linhas.length
    ? `<definedName name="_xlnm._FilterDatabase" localSheetId="${i}" hidden="1">'${nomes[i]}'!$A$1:$${colunaLetra(a.colunas.length - 1)}$${a.linhas.length + 1}</definedName>` : "")).join("");
  const arquivos: Record<string, Uint8Array> = {
    "[Content_Types].xml": strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${abas.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("")}<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`),
    "_rels/.rels": strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`),
    "xl/workbook.xml": strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets}</sheets>${filtros ? `<definedNames>${filtros}</definedNames>` : ""}</workbook>`),
    "xl/_rels/workbook.xml.rels": strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${abas.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join("")}<Relationship Id="rId${abas.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`),
    "xl/styles.xml": strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFE8F3EC"/></patternFill></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf/></cellStyleXfs><cellXfs count="2"><xf/><xf fontId="1" fillId="2" applyFont="1" applyFill="1"/></cellXfs></styleSheet>`),
  };
  abas.forEach((a, i) => { arquivos[`xl/worksheets/sheet${i + 1}.xml`] = strToU8(planilha(a)); });
  return zipSync(arquivos, { level: 6 });
}
