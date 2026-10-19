import { unzipSync } from "fflate";

/**
 * Leitor de .xlsx enxuto (roda no navegador e nos testes): descompacta com fflate e lê o XML das abas direto,
 * com o mínimo que os exports do SAP usam — textos compartilhados, números, datas pelo formato da célula, abas
 * ocultas. Sem dependência de planilha (a SheetJS do npm está desatualizada e com falhas conhecidas).
 */

export type Valor = string | number | boolean | DataCelula | null;

/** Data/hora de uma célula, já nos números do relógio da planilha (sem fuso). */
export interface DataCelula {
  data: true;
  ano: number; mes: number; dia: number; hora: number; minuto: number; segundo: number;
  soHora: boolean;
}

export interface AbaXlsx {
  nome: string;
  visivel: boolean;
  arquivo: string;
}

const dec = new TextDecoder("utf-8");

const ENTIDADES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
// HTML (o MB52 salvo pelo SAP GUI usa &nbsp; e às vezes acentos nomeados): o bloco Latin-1 do HTML 4
"nbsp iexcl cent pound curren yen brvbar sect uml copy ordf laquo not shy reg macr deg plusmn sup2 sup3 acute micro para middot cedil sup1 ordm raquo frac14 frac12 frac34 iquest Agrave Aacute Acirc Atilde Auml Aring AElig Ccedil Egrave Eacute Ecirc Euml Igrave Iacute Icirc Iuml ETH Ntilde Ograve Oacute Ocirc Otilde Ouml times Oslash Ugrave Uacute Ucirc Uuml Yacute THORN szlig agrave aacute acirc atilde auml aring aelig ccedil egrave eacute ecirc euml igrave iacute icirc iuml eth ntilde ograve oacute ocirc otilde ouml divide oslash ugrave uacute ucirc uuml yacute thorn yuml"
  .split(" ").forEach((n, i) => { ENTIDADES[n] = String.fromCharCode(160 + i); });
export function desescapar(s: string): string {
  if (!s.includes("&")) return s;
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]*);/gi, (todo, e: string) =>
    e[0] === "#" ? String.fromCodePoint(e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10))
      : ENTIDADES[e] ?? ENTIDADES[e.toLowerCase()] ?? todo);
}

/**
 * Planilhas exportadas pelo Power BI (e outros geradores .NET) escrevem as tags com prefixo de namespace
 * (<x:sheetData>, <x:row>, <x:c>…). Tira o prefixo das tags para o resto do leitor valer igual (atributos como r:id ficam).
 */
export function semPrefixo(xml: string): string {
  const raiz = /<([A-Za-z_][\w.-]*):(workbook|worksheet|sst|styleSheet)\b/.exec(xml.slice(0, 2000));
  return raiz ? xml.replace(new RegExp(`<(/?)${raiz[1].replace(/[.-]/g, "\\$&")}:`, "g"), "<$1") : xml;
}

/** Atributo de uma tag ("r", "t", "s"…). */
function atributo(tag: string, nome: string): string | null {
  const m = new RegExp(`\\s${nome}="([^"]*)"`).exec(tag);
  return m ? m[1] : null;
}

/** Texto de um <si> ou <is>: junta os <t> (rich text), ignorando a fonética (<rPh>). */
/** Fim de linha do XML: \r\n e \r viram \n (como em qualquer leitor de XML); o &#13; escapado continua. */
const fimDeLinha = (s: string) => (s.includes("\r") ? s.replace(/\r\n?/g, "\n") : s);

function textoRico(xml: string): string {
  const semFonetica = xml.includes("<rPh") ? xml.replace(/<rPh\b[\s\S]*?<\/rPh>/g, "") : xml;
  let s = "";
  for (const m of semFonetica.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>|<t\b[^>]*\/>/g)) s += m[1] ?? "";
  return desescapar(fimDeLinha(s));
}

function colunaDe(ref: string): number {
  let n = 0;
  for (const ch of ref) {
    const c = ch.charCodeAt(0);
    if (c < 65 || c > 90) break;
    n = n * 26 + (c - 64);
  }
  return n - 1;
}

const DATAS_EMBUTIDAS = new Set([14, 15, 16, 17, 18, 19, 20, 21, 22, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 45, 46, 47,
  50, 51, 52, 53, 54, 55, 56, 57, 58]);

/** O formato mostra data/hora? (o mesmo critério do openpyxl: d, m, y, h ou s fora de aspas e colchetes) */
export function formatoDeData(codigo: string): boolean {
  const limpo = codigo.replace(/"[^"]*"/g, "").replace(/\[[^\]]*\]/g, "").replace(/\\./g, "").replace(/_.|\*./g, "");
  if (/^general$/i.test(limpo.trim())) return false;
  return /[dmyhs]/i.test(limpo.split(";")[0]);
}

// formatos numéricos embutidos do Excel (os que não vêm escritos no styles.xml)
const FORMATOS_EMBUTIDOS: Record<number, string> = { 1: "0", 2: "0.00", 3: "#,##0", 4: "#,##0.00", 9: "0%", 10: "0.00%",
  11: "0.00E+00", 37: "#,##0", 38: "#,##0", 39: "#,##0.00", 40: "#,##0.00" };

/** O formato mostra porcentagem? (o "%" fora de aspas) */
export const ehPercentual = (formato: string) => formato.split(";")[0].replace(/"[^"]*"/g, "").includes("%");

function serialParaData(serial: number, data1904: boolean): DataCelula {
  // dias desde 30/12/1899 (o Excel conta o 29/02/1900 que não existiu; os seriais modernos já descontam)
  const ms = Math.round((serial + (data1904 ? 1462 : 0)) * 86_400_000) + Date.UTC(1899, 11, 30);
  const d = new Date(ms);
  return { data: true, ano: d.getUTCFullYear(), mes: d.getUTCMonth() + 1, dia: d.getUTCDate(), hora: d.getUTCHours(),
    minuto: d.getUTCMinutes(), segundo: d.getUTCSeconds(), soHora: serial < 1 };
}

export class Xlsx {
  private bytes: Uint8Array;
  private arquivos: Record<string, Uint8Array>;
  private compartilhados: string[] | null = null;
  private estilosData: boolean[] | null = null;
  private estilosFormato: string[] | null = null;
  /** Números com formato de porcentagem saem em pontos (0,0285 → 2,85), como aparecem na tela. */
  percentualEmPontos = false;
  private data1904 = false;
  readonly abas: AbaXlsx[];

  constructor(bytes: Uint8Array) {
    this.bytes = bytes;
    // as abas (o grosso do arquivo) só são descompactadas quando alguém pede a aba
    this.arquivos = unzipSync(bytes, { filter: (f) => f.name.startsWith("xl/") && !f.name.startsWith("xl/worksheets/")
      && /\.(xml|rels)$/.test(f.name) });
    const nomes = new Set<string>();
    unzipSync(bytes, { filter: (f) => { if (f.name.startsWith("xl/worksheets/")) nomes.add(f.name); return false; } });
    const wb = this.texto("xl/workbook.xml");
    if (!wb) throw new Error("não é uma planilha do Excel (.xlsx)");
    this.data1904 = /date1904="(1|true)"/.test(wb);
    const rels = this.texto("xl/_rels/workbook.xml.rels") || "";
    const alvo = new Map<string, string>();
    for (const m of rels.matchAll(/<Relationship\b[^>]*>/g)) {
      const id = atributo(m[0], "Id"), t = atributo(m[0], "Target");
      if (id && t) alvo.set(id, t.startsWith("/") ? t.slice(1) : `xl/${t.replace(/^\.\//, "")}`);
    }
    this.abas = [...wb.matchAll(/<sheet\b[^>]*>/g)].map((m) => {
      const id = atributo(m[0], "r:id") ?? (/\sr:id="([^"]*)"|\s\w+:id="([^"]*)"/.exec(m[0])?.slice(1).find(Boolean) || "");
      return { nome: desescapar(atributo(m[0], "name") || ""), visivel: !/state="(hidden|veryHidden)"/.test(m[0]),
        arquivo: alvo.get(id) || "" };
    }).filter((a) => a.arquivo && nomes.has(a.arquivo));
  }

  private texto(caminho: string): string | null {
    const b = this.arquivos[caminho];
    return b ? semPrefixo(dec.decode(b)) : null;
  }

  private carregarAuxiliares() {
    if (this.compartilhados) return;
    const sst = this.texto("xl/sharedStrings.xml") || "";
    this.compartilhados = [...sst.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>|<si\b[^>]*\/>/g)].map((m) => textoRico(m[1] || ""));
    const estilos = this.texto("xl/styles.xml") || "";
    const formatos = new Map<number, string>();
    // só o bloco <numFmts> (os <dxfs> da formatação condicional também têm <numFmt> e não valem para a célula)
    const blocoFormatos = /<numFmts\b[^>]*>([\s\S]*?)<\/numFmts>/.exec(estilos)?.[1] || "";
    for (const m of blocoFormatos.matchAll(/<numFmt\b[^>]*>/g))
      formatos.set(Number(atributo(m[0], "numFmtId")), desescapar(atributo(m[0], "formatCode") || ""));
    const xfs = /<cellXfs\b[^>]*>([\s\S]*?)<\/cellXfs>/.exec(estilos)?.[1] || "";
    const ids = [...xfs.matchAll(/<xf\b[^>]*>/g)].map((m) => Number(atributo(m[0], "numFmtId") || 0));
    this.estilosData = ids.map((id) => (formatos.has(id) ? formatoDeData(formatos.get(id)!) : DATAS_EMBUTIDAS.has(id)));
    this.estilosFormato = ids.map((id) => formatos.get(id) ?? FORMATOS_EMBUTIDOS[id] ?? "");
  }

  /** Linhas da aba (índice = nº da linha − 1). `max` lê só o começo (para descobrir a base sem ler tudo). */
  linhas(aba: AbaXlsx, max?: number): Valor[][] {
    this.carregarAuxiliares();
    const bytes = (this.arquivos[aba.arquivo] ??= unzipSync(this.bytes, { filter: (f) => f.name === aba.arquivo })[aba.arquivo]);
    // só o começo do XML quando bastam as primeiras linhas (o IW38OP tem 150 MB de XML)
    const xml = semPrefixo(max ? dec.decode(bytes.subarray(0, Math.min(bytes.length, 400_000 + max * 20_000))) : dec.decode(bytes));
    const dados = xml.indexOf("<sheetData");
    const fim = xml.lastIndexOf("</sheetData>");
    const corpo = dados < 0 ? "" : xml.slice(dados, fim < 0 ? undefined : fim);
    const saida: Valor[][] = [];
    let proxima = 0;
    for (const lin of corpo.matchAll(/<row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g)) {
      const r = Number(atributo(lin[1] + " ", "r") || 0);
      const idx = r > 0 ? r - 1 : proxima;
      proxima = idx + 1;
      if (max && idx >= max) break;
      const linha: Valor[] = [];
      let col = 0;
      for (const c of (lin[2] || "").matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
        const attrs = c[1] + " ";
        const ref = atributo(attrs, "r");
        if (ref) col = colunaDe(ref);
        linha[col] = this.valor(attrs, c[2] || "");
        col++;
      }
      saida[idx] = linha;
    }
    for (let i = 0; i < saida.length; i++) if (!saida[i]) saida[i] = [];
    return saida;
  }

  private valor(attrs: string, interno: string): Valor {
    const t = atributo(attrs, "t");
    if (t === "inlineStr") return textoRico(/<is>([\s\S]*?)<\/is>/.exec(interno)?.[1] || "");
    const v = /<v>([\s\S]*?)<\/v>/.exec(interno)?.[1];
    if (v === undefined) return null;
    if (t === "s") return this.compartilhados![Number(v)] ?? "";
    if (t === "str" || t === "e") return desescapar(fimDeLinha(v));
    if (t === "b") return v === "1";
    if (t === "d") {
      const d = new Date(v);
      return isNaN(+d) ? v : { data: true, ano: d.getUTCFullYear(), mes: d.getUTCMonth() + 1, dia: d.getUTCDate(),
        hora: d.getUTCHours(), minuto: d.getUTCMinutes(), segundo: d.getUTCSeconds(), soHora: false };
    }
    const n = Number(v);
    if (Number.isNaN(n)) return desescapar(v);
    const s = Number(atributo(attrs, "s") || 0);
    if (this.estilosData![s]) return serialParaData(n, this.data1904);
    return this.percentualEmPontos && ehPercentual(this.estilosFormato![s] ?? "") ? Number((n * 100).toPrecision(12)) : n;
  }
}
