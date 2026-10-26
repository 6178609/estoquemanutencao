/**
 * PDF simples de tabela (A4 deitado, Helvetica), sem biblioteca: título, subtítulo, cabeçalho repetido em cada página,
 * linhas com zebra e "página x de y". Texto em WinAnsi (acentos do português); caractere fora dele vira "?".
 * Testado em testes/exportacao.test.ts.
 */
export interface ColunaPdf { titulo: string; largura: number; direita?: boolean }
export interface TabelaPdf { titulo: string; subtitulo?: string; rodape?: string; colunas: ColunaPdf[]; linhas: string[][] }

const L = 842, A = 595, M = 32;
const TAM = 8, ALT_LINHA = 15;
/** Largura aproximada de um caractere da Helvetica (média em 1/1000 do corpo): para cortar o que não cabe. */
const LARG_MEDIA = 0.52;

/** Texto → bytes WinAnsi, já escapado para dentro de ( ) no PDF. */
function winAnsi(s: string): string {
  let out = "";
  for (const ch of s.normalize("NFC")) {
    const c = ch.codePointAt(0)!;
    const b = c === 0x20ac ? 0x80 : c === 0x2013 ? 0x96 : c === 0x2014 ? 0x97 : c === 0x2022 ? 0x95 : c === 0x2026 ? 0x85
      : c === 0x201c ? 0x93 : c === 0x201d ? 0x94 : c === 0x2018 ? 0x91 : c === 0x2019 ? 0x92 : c < 0x20 ? 0x20 : c <= 0xff ? c : 0x3f;
    out += b === 0x28 || b === 0x29 || b === 0x5c ? `\\${String.fromCharCode(b)}` : b > 0x7e ? `\\${b.toString(8).padStart(3, "0")}` : String.fromCharCode(b);
  }
  return out;
}

/** Corta o texto para caber na largura (pt) com "…". */
function caber(s: string, largura: number, tam = TAM): string {
  const max = Math.max(1, Math.floor(largura / (tam * LARG_MEDIA)));
  return s.length <= max ? s : s.slice(0, Math.max(1, max - 1)) + "…";
}

/** Largura (pt) aproximada do texto no corpo da tabela: dígitos e espaços mais estreitos, maiúsculas mais largas. */
const largura = (s: string, tam = TAM) => [...s].reduce((w, ch) => w + (/[0-9]/.test(ch) ? 0.556 : /[\s.,:;]/.test(ch) ? 0.278
  : /[A-Z]/.test(ch) ? 0.667 : 0.5), 0) * tam;

const txt = (x: number, y: number, s: string, tam = TAM, negrito = false) =>
  `BT /${negrito ? "F2" : "F1"} ${tam} Tf ${x.toFixed(1)} ${y.toFixed(1)} Td (${winAnsi(s)}) Tj ET`;

export function gerarPdfTabela(t: TabelaPdf, geradoEm = new Date()): Uint8Array {
  const somaLarg = t.colunas.reduce((s, c) => s + c.largura, 0);
  const escala = (L - 2 * M) / somaLarg;
  const cols = t.colunas.map((c) => ({ ...c, w: c.largura * escala }));
  const xs = cols.reduce<number[]>((acc, c, i) => [...acc, i ? acc[i - 1] + cols[i - 1].w : M], []);
  const topo = A - M - (t.subtitulo ? 58 : 42);
  const porPagina = Math.max(1, Math.floor((topo - M - 20) / ALT_LINHA));
  const paginas: string[][][] = [];
  for (let i = 0; i < Math.max(1, t.linhas.length); i += porPagina) paginas.push(t.linhas.slice(i, i + porPagina));
  const quando = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" }).format(geradoEm);

  const conteudos = paginas.map((linhas, p) => {
    const c: string[] = [];
    c.push("0 0.42 0.23 rg", `${M} ${A - M - 3} ${L - 2 * M} 3 re f`, "0 0 0 rg"); // faixa verde da marca
    c.push(txt(M, A - M - 18, caber(t.titulo, L - 2 * M, 14), 14, true));
    if (t.subtitulo) c.push("0.35 0.35 0.35 rg", txt(M, A - M - 32, caber(t.subtitulo, L - 2 * M, 9), 9), "0 0 0 rg");
    let y = topo;
    // cabeçalho
    c.push("0.93 0.95 0.94 rg", `${M} ${y - 4} ${L - 2 * M} ${ALT_LINHA} re f`, "0 0 0 rg");
    cols.forEach((col, i) => {
      const s = caber(col.titulo, col.w - 8);
      c.push(txt(col.direita ? xs[i] + col.w - 4 - largura(s) : xs[i] + 4, y, s, TAM, true));
    });
    y -= ALT_LINHA;
    if (!t.linhas.length) c.push(txt(M + 4, y, "Nenhum item."));
    linhas.forEach((l, i) => {
      if (i % 2) c.push("0.975 0.975 0.975 rg", `${M} ${y - 4} ${L - 2 * M} ${ALT_LINHA} re f`, "0 0 0 rg");
      cols.forEach((col, j) => {
        const s = caber(String(l[j] ?? ""), col.w - 8);
        const x = col.direita ? xs[j] + col.w - 4 - largura(s) : xs[j] + 4;
        c.push(txt(x, y, s));
      });
      y -= ALT_LINHA;
    });
    c.push("0.85 0.85 0.85 RG", `${M} ${M + 10} m ${L - M} ${M + 10} l S`);
    c.push("0.4 0.4 0.4 rg", txt(M, M, caber(`${t.rodape ? `${t.rodape} · ` : ""}Gerado em ${quando}`, L - 2 * M - 90), 7),
      txt(L - M - 70, M, `Página ${p + 1} de ${paginas.length}`, 7));
    return c.join("\n");
  });

  // objetos: 1 catálogo, 2 páginas, 3 fonte normal, 4 negrito, depois (página, conteúdo) por página
  const objs: string[] = [];
  const nPag = conteudos.length;
  const idPag = (i: number) => 5 + i * 2;
  objs[1] = "<< /Type /Catalog /Pages 2 0 R >>";
  objs[2] = `<< /Type /Pages /Kids [${conteudos.map((_, i) => `${idPag(i)} 0 R`).join(" ")}] /Count ${nPag} >>`;
  objs[3] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>";
  objs[4] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>";
  conteudos.forEach((s, i) => {
    objs[idPag(i)] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${L} ${A}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${idPag(i) + 1} 0 R >>`;
    objs[idPag(i) + 1] = `<< /Length ${s.length} >>\nstream\n${s}\nendstream`;
  });
  let pdf = "%PDF-1.4\n%\xe2\xe3\xcf\xd3\n";
  const offs: number[] = [];
  for (let i = 1; i < objs.length; i++) {
    offs[i] = pdf.length;
    pdf += `${i} 0 obj\n${objs[i]}\nendobj\n`;
  }
  const xref = pdf.length;
  pdf += `xref\n0 ${objs.length}\n0000000000 65535 f \n${offs.slice(1).map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("")}`;
  pdf += `trailer\n<< /Size ${objs.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  // tudo já é ASCII ou byte único (escapes octais): 1 caractere = 1 byte
  return Uint8Array.from(pdf, (ch) => ch.charCodeAt(0) & 0xff);
}
