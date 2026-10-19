import type { NextConfig } from "next";

const seguranca = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
];

/**
 * Content-Security-Policy das páginas: só o próprio site carrega script, estilo, fonte, imagem e conexão (as fontes do
 * Google são servidas pelo próprio site, pelo next/font). 'unsafe-inline' fica no script porque o Next injeta scripts
 * inline sem nonce; o que ela barra é script de outro endereço. vercel.live = barra de comentários das prévias da Vercel.
 * Fica fora das rotas /api (foto e documento têm a sua, e o visualizador de PDF do navegador precisa ficar livre).
 * Em desenvolvimento (next dev) não vale: o recarregamento ao vivo usa eval e websocket.
 */
const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' https://vercel.live",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self' https://vercel.live wss://ws-us3.pusher.com",
  "worker-src 'self' blob:",
  "frame-src https://vercel.live",
  "frame-ancestors 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "upgrade-insecure-requests",
].join("; ");

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // pasta de build própria por servidor local (várias telas testadas ao mesmo tempo); na Vercel fica o padrão
  ...(process.env.NEXT_DIST_DIR ? { distDir: process.env.NEXT_DIST_DIR } : {}),
  // o leitor de parquet e os compressores rodam só no servidor
  serverExternalPackages: ["hyparquet", "hyparquet-compressors"],
  // a Programação do mês e o Calendário de ordens foram retirados: endereço antigo salvo cai nos Planos
  async redirects() {
    return [{ source: "/programacao", destination: "/planos", permanent: false },
      { source: "/calendario", destination: "/planos", permanent: false }];
  },
  async headers() {
    const paginas = process.env.NODE_ENV === "production" ? [{ source: "/((?!api/).*)", headers: [{ key: "Content-Security-Policy", value: csp }] }] : [];
    return [{ source: "/:path*", headers: seguranca }, ...paginas];
  },
};

export default nextConfig;
