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
export async function enderecoSite(): Promise<string> {
  const fixo = (process.env.URL_SITE || process.env.URL_SITE_ATUAL)?.trim().replace(/\/+$/, "");
  if (fixo && /^https?:\/\/[^\s/]+/.test(fixo)) return fixo;
  if (process.env.VERCEL) return URL_PADRAO;
  const h = await headers();
  const host = (h.get("x-forwarded-host") || h.get("host") || "localhost").split(",")[0].trim();
  const proto = (h.get("x-forwarded-proto") || (host.startsWith("localhost") ? "http" : "https")).split(",")[0].trim();
  return `${proto === "http" ? "http" : "https"}://${host.replace(/[^\w.:\-[\]]/g, "")}`;
}

/** Os endereços dos dois QR do armário (retirada e solicitação). */
export function enderecosQr(site: string, armario: string) {
  const u = encodeURIComponent(armario);
  return { retirada: `${site}/ubm/retirada?u=${u}`, solicitacao: `${site}/ubm/solicitacao?u=${u}` };
}

/** SVG do QR (só o texto do SVG, sem cabeçalho XML), correção de erro média, com margem branca. */
export async function qrSvg(texto: string): Promise<string> {
  const svg = await QRCode.toString(texto, { type: "svg", errorCorrectionLevel: "M", margin: 2, color: { dark: "#000000", light: "#ffffff" } });
  return svg.replace(/<\?xml[^>]*>/, "").trim();
}
