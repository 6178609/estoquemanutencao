import { desescapar, Xlsx, type Valor } from "./xlsx";
import { identificar, type Tipo } from "./tipos";

/**
 * Leitura dos exports do SAP e das planilhas — porta de central/leitura.py, para rodar no navegador (o arquivo não
 * precisa subir inteiro para o servidor): .xlsx, o "xls" que na verdade é HTML/texto do SAP GUI, .htm/.html,
 * .csv e .txt (lista com |), inclusive o MB52 em árvore. A base é reconhecida pelos cabeçalhos.
 */

export class LeituraErro extends Error {}

export interface Tabela {
  colunas: string[];
  linhas: string[][]; // tudo como texto, no mesmo formato que o sincronizador grava (central/nuvem.py)
}

export interface Achado {
  tipo: Tipo;
  aba: string | null;
  linhaCab: number | null;
}

// ----------------------------------------------------------------------------
// Valores → texto (o _texto de central/nuvem.py)
// ----------------------------------------------------------------------------
const p2 = (n: number) => String(n).padStart(2, "0");

export function paraTexto(v: Valor | undefined): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "number") {
    if (!Number.isFinite(v)) return "";
    if (Number.isInteger(v)) return String(v);
    const s = String(v);
    return s.includes("e") ? v.toFixed(10).replace(/0+$/, "") : s;
  }
  if (typeof v === "boolean") return v ? "True" : "False";
  if (typeof v === "object") {
    if (v.soHora) return `${p2(v.hora)}:${p2(v.minuto)}:${p2(v.segundo)}`;
    const d = `${p2(v.dia)}/${p2(v.mes)}/${v.ano}`;
    return v.hora || v.minuto ? `${d} ${p2(v.hora)}:${p2(v.minuto)}` : d;
  }
  return String(v).trim();
}

// ----------------------------------------------------------------------------
// Texto
// ----------------------------------------------------------------------------
export function decodificar(b: Uint8Array): string {
  const semBom = b[0] === 0xef && b[1] === 0xbb && b[2] === 0xbf ? b.subarray(3) : b;
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(semBom);
  } catch {
    return new TextDecoder("windows-1252").decode(semBom);
  }
}

/** Primeira linha com 3+ células preenchidas vira cabeçalho; repetições dele (o SAP repete a cada página) saem. */
export function tabelaComCabecalho(tabela: string[][]): Tabela {
  const idx = tabela.findIndex((ln) => ln.filter((c) => c).length >= 3);
  if (idx < 0) throw new LeituraErro("não encontrei uma linha de cabeçalho");
  const original = tabela[idx];
  const cab = original.map((c, i) => c || `col${i}`);
  const vistos = new Map<string, number>();
  cab.forEach((c, i) => {
    if (vistos.has(c)) {
      vistos.set(c, vistos.get(c)! + 1);
      cab[i] = `${c} (${vistos.get(c)})`;
    } else vistos.set(c, 0);
  });
  const linhas: string[][] = [];
  for (const ln of tabela.slice(idx + 1)) {
    if (!ln.some((c) => c)) continue;
    if (ln.slice(0, cab.length).every((c, i) => c === original[i]) && ln.length >= Math.min(cab.length, original.length)) continue;
    linhas.push([...ln, ...Array(Math.max(0, cab.length - ln.length)).fill("")].slice(0, cab.length));
  }
  return { colunas: cab, linhas };
}

/** CSV com aspas (o separador já escolhido). */
function lerCsv(txt: string, sep: string): string[][] {
  const linhas: string[][] = [];
  let campo = "", linha: string[] = [], aspas = false;
  for (let i = 0; i < txt.length; i++) {
    const ch = txt[i];
    if (aspas) {
      if (ch === '"') {
        if (txt[i + 1] === '"') { campo += '"'; i++; } else aspas = false;
      } else campo += ch;
    } else if (ch === '"' && campo === "") aspas = true;
    else if (ch === sep) { linha.push(campo); campo = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && txt[i + 1] === "\n") i++;
      linha.push(campo); campo = "";
      linhas.push(linha); linha = [];
    } else campo += ch;
  }
  if (campo || linha.length) { linha.push(campo); linhas.push(linha); }
  return linhas;
}

export function lerTexto(txt: string): Tabela {
  const linhas = txt.split(/\r?\n|\r/).filter((ln) => ln.trim());
  if (!linhas.length) throw new LeituraErro("arquivo vazio");
  const amostra = linhas.slice(0, 50).join("\n");
  const conta = (s: string) => amostra.split(s).length - 1;
  // lista do SAP "não convertida": | col | col | e linhas de ------
  if (conta("|") > Math.min(linhas.length, 50) * 2) {
    const uteis = linhas.filter((ln) => ln.includes("|") && !/^[\s|-]+$/.test(ln));
    return tabelaComCabecalho(uteis.map((ln) => ln.trim().replace(/^\|+|\|+$/g, "").split("|").map((c) => c.trim())));
  }
  const sep = [";", "\t", ","].reduce((a, b) => (conta(b) > conta(a) ? b : a));
  const tabela = lerCsv(linhas.join("\n"), sep);
  const [cab, ...resto] = tabela;
  if (!cab) throw new LeituraErro("arquivo vazio");
  const colunas = cab.map((c, i) => c.trim() || `Unnamed: ${i}`);
  return { colunas, linhas: resto.map((l) => colunas.map((_, i) => l[i] ?? "")) };
}

// ----------------------------------------------------------------------------
// HTML do SAP GUI
// ----------------------------------------------------------------------------
function semTags(s: string): string {
  return desescapar(s.replace(/<br\s*\/?>/gi, " ").replace(/<[^>]*>/g, "")).replace(/ /g, " ");
}

/** A tabela com mais linhas (tr) do documento, como a xpath do Python. */
function tabelaPrincipal(html: string): string | null {
  const abre = /<table\b/gi, fecha = /<\/table\s*>/gi;
  const marcas: { pos: number; abre: boolean }[] = [];
  for (const m of html.matchAll(abre)) marcas.push({ pos: m.index!, abre: true });
  for (const m of html.matchAll(fecha)) marcas.push({ pos: m.index! + m[0].length, abre: false });
  marcas.sort((a, b) => a.pos - b.pos);
  const pilha: number[] = [];
  let melhor: string | null = null, maxTr = -1;
  for (const m of marcas) {
    if (m.abre) pilha.push(m.pos);
    else if (pilha.length) {
      const ini = pilha.pop()!;
      const trecho = html.slice(ini, m.pos);
      const n = (trecho.match(/<tr\b/gi) || []).length;
      if (n > maxTr) { maxTr = n; melhor = trecho; }
    }
  }
  if (melhor === null && pilha.length) melhor = html.slice(pilha[0]); // </table> faltando no fim
  return melhor;
}

function linhasTr(tabela: string): string[] {
  return [...tabela.matchAll(/<tr\b[^>]*>([\s\S]*?)(?=<tr\b|<\/table|$)/gi)].map((m) => m[1].replace(/<\/tr\s*>[\s\S]*$/i, ""));
}

export function lerHtml(html: string): Tabela {
  const principal = tabelaPrincipal(html);
  if (!principal) throw new LeituraErro("nenhuma tabela no HTML");
  const trs = linhasTr(principal);
  const linhas = trs.map((tr) => [...tr.matchAll(/<t[hd]\b[^>]*>([\s\S]*?)(?=<t[hd]\b|$)/gi)]
    .map((m) => semTags(m[1].replace(/<\/t[hd]\s*>[\s\S]*$/i, "")).replace(/\s+/g, " ").trim()));
  const largura = linhas.reduce((m, l) => Math.max(m, l.length), 0); // sem espalhar: 80 mil linhas estouram a pilha
  if (largura >= 3) return tabelaComCabecalho(linhas);
  // lista agrupada (MB52 em árvore): cada linha é um texto de largura fixa
  return listaAgrupadaMb52(trs.map(semTags));
}

const tokens = (linha: string) => linha.trim().split(/\s{2,}/).filter(Boolean);

/** Número no padrão do SAP (1.234,500); o sinal pode vir no fim (12,500- = −12,5). */
export function numBr(t: string): number | null {
  t = t.trim();
  const negativo = t.endsWith("-");
  const s = t.replace(/-+$/, "").replaceAll(".", "").replace(",", ".");
  if (!/^[-+]?(\d+\.?\d*|\.\d+)$/.test(s)) return null;
  const v = Number(s);
  return negativo ? -v : v;
}

const QTD = /^-?\d[\d.]*(,\d+)?-?$/;
const UNIDADE = /^[A-Za-zÀ-ÿ]{1,3}\d?$/;
const TOTAL = /^\s*\*+\s*total/i;

/**
 * Lista do MB52 salva como HTML pelo SAP GUI, em árvore: linha do material (código + texto) na coluna 0 e os saldos
 * recuados (UM + quantidade) ou de lote (nº + UM + quantidade). A linha é classificada pela posição, não pelo
 * "jeito de número" — o texto do material pode ter números. Os saldos de cada material são somados.
 */
export function listaAgrupadaMb52(linhas: string[]): Tabela {
  const grupos: { material: string; texto: string; um: string; livre: number }[] = [];
  let atual: (typeof grupos)[number] | null = null;
  for (const linha of linhas) {
    const toks = tokens(linha);
    if (!toks.length || TOTAL.test(linha)) continue;
    const recuada = /^\s/.test(linha);
    const lote = !recuada && toks.length >= 3 && UNIDADE.test(toks[1]) && toks.slice(2).some((t) => QTD.test(t));
    if (!recuada && /^\d/.test(toks[0]) && !lote) {
      atual = { material: toks[0], texto: toks.slice(1).join(" "), um: "", livre: 0 };
      grupos.push(atual);
      continue;
    }
    const qtds = toks.slice(1).filter((t) => QTD.test(t));
    if (!atual || !qtds.length) continue;
    const q = numBr(qtds[qtds.length - 1]);
    if (q === null) continue;
    atual.livre += q;
    if (!atual.um) atual.um = toks.find((t) => UNIDADE.test(t) && !/^\d+$/.test(t)) || "";
  }
  if (!grupos.length) throw new LeituraErro("lista do SAP sem materiais reconhecíveis");
  return {
    colunas: ["Material", "Texto breve material", "UM", "Utilização livre"],
    linhas: grupos.map((g) => [g.material, g.texto, g.um, paraTexto(Math.round(g.livre * 1e6) / 1e6)]),
  };
}

// ----------------------------------------------------------------------------
// Entrada principal
// ----------------------------------------------------------------------------
const ehXlsx = (b: Uint8Array) => b[0] === 0x50 && b[1] === 0x4b && b[2] === 0x03 && b[3] === 0x04;
const ehXls = (b: Uint8Array) => b[0] === 0xd0 && b[1] === 0xcf && b[2] === 0x11 && b[3] === 0xe0;

/** Exports filtrados (deste site ou do antigo: ordens_filtradas, IW38_filtrado.csv…): nunca viram a base. */
export function ehRecorte(nome: string): boolean {
  return /filtrad/i.test(nome.replace(/\.[^.]*$/, ""));
}

function limpar(t: Tabela): Tabela {
  const manter = t.colunas.map((c, i) => [c.trim(), i] as const).filter(([c]) => c && !c.toLowerCase().startsWith("unnamed"));
  const linhas = t.linhas.map((l) => manter.map(([, i]) => (l[i] ?? "").trim())).filter((l) => l.some((c) => c));
  return { colunas: manter.map(([c]) => c), linhas };
}

// textos que o pandas (read_excel) lê como vazio — o site atual sempre leu assim; mantidos iguais
const NA_PANDAS = new Set(["", "#N/A", "#N/A N/A", "#NA", "-1.#IND", "-1.#QNAN", "-NaN", "-nan", "1.#IND", "1.#QNAN",
  "<NA>", "N/A", "NA", "NULL", "NaN", "None", "n/a", "nan", "null"]);
const celulaXlsx = (v: Valor | undefined) => (typeof v === "string" && NA_PANDAS.has(v) ? "" : paraTexto(v));

function tabelaXlsx(x: Xlsx, aba: string | null, linhaCab: number | null): Tabela {
  const a = (aba && x.abas.find((s) => s.nome === aba)) || x.abas[0];
  if (!a) throw new LeituraErro("a planilha não tem abas");
  const linhas = x.linhas(a);
  const ic = linhaCab ?? 0;
  const cab = (linhas[ic] || []).map((v) => paraTexto(v));
  let largura = cab.length;
  for (let i = ic + 1; i < linhas.length; i++) largura = Math.max(largura, linhas[i].length); // sem espalhar (pilha)
  // nomes repetidos ganham sufixo (.1, .2) como no pandas
  const vistos = new Map<string, number>();
  const colunas = Array.from({ length: largura }, (_, i) => {
    const c = cab[i] || `Unnamed: ${i}`;
    const n = vistos.get(c) ?? 0;
    vistos.set(c, n + 1);
    return n ? `${c}.${n}` : c;
  });
  return { colunas, linhas: linhas.slice(ic + 1).map((l) => colunas.map((_, i) => celulaXlsx(l[i]))) };
}

const XLS_ANTIGO = "planilha no formato .xls antigo (binário): abra no Excel e salve como .xlsx";

/** Lê o arquivo inteiro. No Excel, `aba` e `linhaCab` (0 = primeira linha) vêm de `sondar`. */
export function lerArquivo(nome: string, bytes: Uint8Array, aba: string | null = null, linhaCab: number | null = null,
  xlsx?: Xlsx): Tabela {
  let t: Tabela;
  try {
    if (/\.parquet$/i.test(nome)) throw new LeituraErro("envie o export original do SAP (não o .parquet)");
    if (ehXls(bytes)) throw new LeituraErro(XLS_ANTIGO);
    if (ehXlsx(bytes)) t = tabelaXlsx(xlsx || new Xlsx(bytes), aba, linhaCab);
    else {
      const txt = decodificar(bytes);
      const inicio = txt.slice(0, 2048).trimStart().toLowerCase();
      t = txt.slice(0, 200_000).toLowerCase().includes("<table") || inicio.startsWith("<!doctype") || inicio.startsWith("<html")
        ? lerHtml(txt) : lerTexto(txt);
    }
  } catch (e) {
    if (e instanceof LeituraErro) throw e;
    throw new LeituraErro(`não foi possível ler ${nome}: ${(e as Error).message}`);
  }
  t = limpar(t);
  if (!t.linhas.length) throw new LeituraErro(`${nome} não tem linhas de dados`);
  return t;
}

/**
 * Quais bases existem no arquivo (uma pasta de trabalho pode ter mais de uma, uma por aba): [{tipo, aba, linha do
 * cabeçalho}]. Uma aba por base: a visível vence a oculta. Planilhas de gestão trazem cópias de outras bases: da
 * Gestão de HH só vale a equipe e do Gerenciador de AF só as análises e as ações.
 */
export function sondar(nome: string, bytes: Uint8Array, xlsx?: Xlsx): Achado[] {
  if (ehRecorte(nome)) return [];
  if (ehXls(bytes)) throw new LeituraErro(XLS_ANTIGO);
  if (ehXlsx(bytes)) {
    const x = xlsx || new Xlsx(bytes);
    let achados: (Achado & { visivel: boolean })[] = [];
    for (const a of x.abas) {
      const linhas = x.linhas(a, 15);
      for (let i = 0; i < linhas.length; i++) {
        const tipo = identificar(linhas[i].map((v) => paraTexto(v)).filter(Boolean));
        if (tipo) { achados.push({ tipo, aba: a.nome, linhaCab: i, visivel: a.visivel }); break; }
      }
    }
    const vistos = new Set<string>();
    achados = [...achados].sort((a, b) => Number(!a.visivel) - Number(!b.visivel)).filter((a) => !vistos.has(a.tipo) && !!vistos.add(a.tipo));
    for (const proprios of [new Set<Tipo>(["equipe"]), new Set<Tipo>(["af", "acoes_af"])])
      if (achados.some((a) => proprios.has(a.tipo))) achados = achados.filter((a) => proprios.has(a.tipo));
    return achados.map(({ tipo, aba, linhaCab }) => ({ tipo, aba, linhaCab }));
  }
  let t: Tabela;
  try {
    t = lerArquivo(nome, bytes);
  } catch (e) {
    if (e instanceof LeituraErro) return [];
    throw e;
  }
  const tipo = identificar(t.colunas);
  return tipo ? [{ tipo, aba: null, linhaCab: null }] : [];
}
