"use client";

import { Download, FileImage, LoaderCircle, Printer } from "lucide-react";
import { useState } from "react";

import { BOTAO_PRIMARIO } from "@/components/ui";

export function Imprimir() {
  return <button type="button" onClick={() => window.print()} className={BOTAO_PRIMARIO}><Printer className="size-4" /> Imprimir todas (A4)</button>;
}

const BOTAO = "inline-flex h-10 items-center gap-1.5 rounded-lg border border-borda bg-superficie px-3 text-[12.5px] text-texto hover:bg-superficie-2 disabled:opacity-60";

function baixar(nome: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nome;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/**
 * Baixar o QR (SVG ou PNG em ~1200 px, gerados no servidor) e a etiqueta pronta em PNG: o servidor manda a etiqueta em
 * SVG e o navegador desenha num canvas (1200 × 1600) para virar PNG — sem dependência nativa.
 */
export function BaixarQr({ armario, qual }: { armario: string; qual: "solicitacao" }) {
  const [estado, setEstado] = useState({ ocupado: false, erro: "" });
  const base = `/api/ubm?${new URLSearchParams({ qr: qual, u: armario })}`;
  const etiqueta = async () => {
    setEstado({ ocupado: true, erro: "" });
    try {
      const r = await fetch(`${base}&formato=etiqueta`);
      if (!r.ok) throw new Error("sem acesso");
      const url = URL.createObjectURL(new Blob([await r.text()], { type: "image/svg+xml" }));
      const img = new Image();
      await new Promise<void>((ok, erro) => { img.onload = () => ok(); img.onerror = () => erro(new Error("imagem")); img.src = url; });
      const c = document.createElement("canvas");
      c.width = 1200;
      c.height = 1600;
      const ctx = c.getContext("2d")!;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, c.width, c.height);
      ctx.drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      const png = await new Promise<Blob | null>((ok) => c.toBlob(ok, "image/png"));
      if (!png) throw new Error("png");
      baixar(`${armario}_${qual}_etiqueta.png`, png);
      setEstado({ ocupado: false, erro: "" });
    } catch {
      setEstado({ ocupado: false, erro: "Não consegui montar a etiqueta agora; tente de novo." });
    }
  };
  return (
    <div className="nao-imprimir flex flex-wrap justify-center gap-1.5" aria-label={`Baixar solicitação · ${armario}`} role="group">
      <a href={`${base}&formato=png`} download={`${armario}_${qual}_qr.png`} className={BOTAO}><Download className="size-3.5" /> Baixar QR (PNG)</a>
      <a href={`${base}&formato=svg`} download={`${armario}_${qual}_qr.svg`} className={BOTAO}><Download className="size-3.5" /> Baixar QR (SVG)</a>
      <button type="button" onClick={etiqueta} disabled={estado.ocupado} className={BOTAO}>
        {estado.ocupado ? <LoaderCircle className="size-3.5 animate-spin" /> : <FileImage className="size-3.5" />} Baixar etiqueta (PNG)
      </button>
      {estado.erro && <span role="alert" className="w-full text-center text-[12px] text-[var(--selo-critico-texto)]">{estado.erro}</span>}
    </div>
  );
}
