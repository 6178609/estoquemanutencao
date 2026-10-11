import type { Metadata, Viewport } from "next";
import { Inter, Space_Grotesk } from "next/font/google";

import "./globals.css";

const texto = Inter({ subsets: ["latin"], variable: "--fonte-texto", display: "swap" });
const titulo = Space_Grotesk({ subsets: ["latin"], variable: "--fonte-titulo", display: "swap", weight: ["400", "500", "600", "700"] });

export const metadata: Metadata = {
  title: { default: "Central de Manutenção · PCM F26", template: "%s · Central de Manutenção" },
  description: "Gestão da manutenção da F26: estoque, ativos, ordens e indicadores WCM.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#09090b" },
  ],
};

// tema antes da primeira pintura (sem piscar claro → escuro)
const TEMA = `try{var t=localStorage.getItem("tema");document.documentElement.dataset.tema=t||(matchMedia("(prefers-color-scheme: dark)").matches?"escuro":"claro")}catch(e){}`;

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
