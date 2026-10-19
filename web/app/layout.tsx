import type { Metadata, Viewport } from "next";
import { IBM_Plex_Sans, Space_Grotesk } from "next/font/google";

import "./globals.css";

const texto = IBM_Plex_Sans({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--fonte-texto", display: "swap" });
const titulo = Space_Grotesk({ subsets: ["latin"], variable: "--fonte-titulo", display: "swap", weight: ["400", "500", "600", "700"] });

export const metadata: Metadata = {
  title: { default: "Central de Manutenção · PCM F26", template: "%s · Central de Manutenção" },
  description: "Gestão da manutenção da F26: estoque, ativos, ordens e indicadores WCM.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: "#06331F", // a barra do navegador no celular acompanha o cabeçalho verde
};

// tema antes da primeira pintura (sem piscar claro → escuro)
// padrão claro; o escuro só quando a pessoa escolhe no botão de tema
const TEMA = `try{document.documentElement.dataset.tema=localStorage.getItem("tema")==="escuro"?"escuro":"claro"}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={`${texto.variable} ${titulo.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: TEMA }} />
      </head>
      <body className="min-h-dvh font-sans">{children}</body>
    </html>
  );
}
