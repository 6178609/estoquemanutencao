"use client";

import { Check, Copy } from "lucide-react";
import { useEffect, useRef, useState } from "react";

/** Copia um texto (área de transferência; sem permissão, pela seleção de um campo escondido). */
async function copiar(texto: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(texto);
    return true;
  } catch {
    try {
      const t = document.createElement("textarea");
      t.value = texto;
      t.style.position = "fixed";
      t.style.opacity = "0";
      document.body.appendChild(t);
      t.select();
      const ok = document.execCommand("copy");
      t.remove();
      return ok;
    } catch {
      return false;
    }
  }
}

export function BotaoCopiar({ texto, rotulo, compacto }: { texto: string; rotulo: string; compacto?: boolean }) {
  const [estado, setEstado] = useState<"" | "ok" | "erro">("");
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  return (
    <button type="button" disabled={!texto} aria-label={compacto && !estado ? rotulo : undefined}
      onClick={async () => {
        const ok = await copiar(texto);
        clearTimeout(timer.current);
        setEstado(ok ? "ok" : "erro");
        timer.current = setTimeout(() => setEstado(""), 2500);
      }}
      className={`inline-flex items-center gap-1.5 rounded-lg border border-borda bg-superficie text-[12.5px] transition hover:bg-superficie-2 disabled:opacity-50 ${compacto ? "h-8 px-2" : "h-9 px-3"}`}>
      {estado === "ok" ? <Check className="size-3.5" aria-hidden /> : <Copy className="size-3.5" aria-hidden />}
      <span aria-live="polite">{estado === "ok" ? "Copiado" : estado === "erro" ? "Não copiou: selecione e copie" : compacto ? "Copiar" : rotulo}</span>
    </button>
  );
}
