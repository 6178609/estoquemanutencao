import type { NextConfig } from "next";

const seguranca = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // pasta de build própria por servidor local (várias telas testadas ao mesmo tempo); na Vercel fica o padrão
  ...(process.env.NEXT_DIST_DIR ? { distDir: process.env.NEXT_DIST_DIR } : {}),
  // o leitor de parquet e os compressores rodam só no servidor
  serverExternalPackages: ["hyparquet", "hyparquet-compressors"],
  // a Programação do mês foi retirada: endereço antigo salvo cai no Calendário de ordens
  async redirects() {
    return [{ source: "/programacao", destination: "/calendario", permanent: false }];
  },
  async headers() {
    return [{ source: "/:path*", headers: seguranca }];
  },
};

export default nextConfig;
