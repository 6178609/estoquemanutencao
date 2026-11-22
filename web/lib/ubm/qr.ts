import "server-only";

import { headers } from "next/headers";
import QRCode from "qrcode";

/**
 * QR codes das etiquetas da UBM, gerados no servidor como SVG (pacote `qrcode`, MIT). O endereço é o do site:
 * URL_SITE ou URL_SITE_ATUAL (variáveis da Vercel); sem elas, na Vercel, o endereço gratuito fixo (como o aviso de
 * treinamentos: o QR colado no armário não pode apontar para uma prévia nem para um domínio sem DNS); fora da Vercel
 * (local, testes), a origem da requisição.
 */
export const URL_PADRAO = "https://pcmemacao.vercel.app";

/** O endereço do site: as variáveis, o padrão fixo na Vercel ou, fora dela, `origem` (a da requisição). */
export function siteDe(origem: string): string {
  const fixo = (process.env.URL_SITE || process.env.URL_SITE_ATUAL)?.trim().replace(/\/+$/, "");
  if (fixo && /^https?:\/\/[^\s/]+/.test(fixo)) return fixo;
  if (process.env.VERCEL) return URL_PADRAO;
  return origem.replace(/\/+$/, "");
}

/** O endereço do site numa página (a origem vem dos cabeçalhos da requisição). */
export async function enderecoSite(): Promise<string> {
  const h = await headers();
  const host = (h.get("x-forwarded-host") || h.get("host") || "localhost").split(",")[0].trim();
  const proto = (h.get("x-forwarded-proto") || (host.startsWith("localhost") ? "http" : "https")).split(",")[0].trim();
  return siteDe(`${proto === "http" ? "http" : "https"}://${host.replace(/[^\w.:\-[\]]/g, "")}`);
}

/**
 * Só o QR de SOLICITAÇÃO: o de retirada saiu em 22/11/2026 (a retirada agora é confirmada pelo líder na validação da
 * IW13). A rota /ubm/retirada das etiquetas antigas já coladas leva à validação.
 */
export type QualQr = "solicitacao";
/** A etiqueta de cada armário (o mesmo texto na impressão A4 e na etiqueta baixada). */
export const ETIQUETAS: { qual: QualQr; titulo: string; instrucao: string }[] = [
  { qual: "solicitacao", titulo: "SOLICITAÇÃO", instrucao: "Item acabou, está no fim ou faltando? Leia o QR e avise o planejamento." },
];

/** O endereço do QR do armário (solicitação). */
export function enderecosQr(site: string, armario: string) {
  return { solicitacao: `${site}/ubm/solicitacao?u=${encodeURIComponent(armario)}` };
}

/** SVG do QR (só o texto do SVG, sem cabeçalho XML), correção de erro média, com margem branca. */
export async function qrSvg(texto: string): Promise<string> {
  const svg = await QRCode.toString(texto, { type: "svg", errorCorrectionLevel: "M", margin: 2, color: { dark: "#000000", light: "#ffffff" } });
  return svg.replace(/<\?xml[^>]*>/, "").trim();
}

const OPCOES = { errorCorrectionLevel: "M" as const, color: { dark: "#000000", light: "#ffffff" } };

/** PNG só do QR, em alta resolução para impressão (~1200 px), com margem branca (sem dependência nativa: pngjs). */
export async function qrPng(texto: string, largura = 1200): Promise<Uint8Array> {
  return new Uint8Array(await QRCode.toBuffer(texto, { ...OPCOES, type: "png", width: largura, margin: 4 }));
}

const xml = (v: string) => v.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[c]!);

/** Quebra o texto em linhas de até `max` caracteres (por palavra). */
export function quebrar(texto: string, max: number): string[] {
  const linhas: string[] = [];
  for (const p of texto.split(/\s+/).filter(Boolean)) {
    const ult = linhas.at(-1);
    if (ult != null && (ult + " " + p).length <= max) linhas[linhas.length - 1] = `${ult} ${p}`;
    else linhas.push(p);
  }
  return linhas;
}

/**
 * A etiqueta pronta em SVG (1200 × 1600, o visual da impressa): faixa preta com SOLICITAÇÃO, o armário, o QR,
 * a instrução e o endereço. O navegador converte em PNG (canvas) para baixar.
 */
export async function etiquetaSvg(e: { titulo: string; armario: string; nome: string; local: string; instrucao: string; url: string }): Promise<string> {
  const qr = (await qrSvg(e.url)).replace(/^<svg /, '<svg x="250" y="470" width="700" height="700" ');
  const fonte = 'font-family="Arial, Helvetica, sans-serif"';
  const nome = quebrar(`${e.armario} · ${e.nome}`, 34).slice(0, 2);
  const instr = quebrar(e.instrucao, 42).slice(0, 4);
  const txt = (y: number, tam: number, peso: string, cor: string, t: string) =>
    `<text x="600" y="${y}" ${fonte} font-size="${tam}" font-weight="${peso}" fill="${cor}" text-anchor="middle">${xml(t)}</text>`;
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1600" viewBox="0 0 1200 1600">`,
    `<rect x="0" y="0" width="1200" height="1600" fill="#ffffff"/>`,
    `<rect x="12" y="12" width="1176" height="1576" rx="40" fill="none" stroke="#000000" stroke-width="8"/>`,
    `<path d="M12 52 a40 40 0 0 1 40 -40 h1096 a40 40 0 0 1 40 40 v168 h-1176 z" fill="#000000"/>`,
    txt(160, 110, "700", "#ffffff", e.titulo),
    ...nome.map((l, i) => txt(310 + i * 66, 56, "700", "#000000", l)),
    e.local ? txt(310 + nome.length * 66 + 10, 40, "400", "#333333", e.local) : "",
    qr,
    ...instr.map((l, i) => txt(1260 + i * 58, 44, "400", "#000000", l)),
    txt(1545, 24, "400", "#555555", e.url),
    `</svg>`,
  ].join("");
}
