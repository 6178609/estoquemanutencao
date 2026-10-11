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
  // o leitor de parquet e os compressores rodam só no servidor
  serverExternalPackages: ["hyparquet", "hyparquet-compressors"],
  async headers() {
    return [{ source: "/:path*", headers: seguranca }];
  },
};

export default nextConfig;
