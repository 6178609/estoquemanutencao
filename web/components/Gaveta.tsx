"use client";

import { X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect } from "react";

export function Gaveta({ aberta, aoFechar, titulo, subtitulo, children }: { aberta: boolean; aoFechar: () => void;
  titulo: React.ReactNode; subtitulo?: React.ReactNode; children: React.ReactNode }) {
  useEffect(() => {
    if (!aberta) return;
    const tecla = (e: KeyboardEvent) => e.key === "Escape" && aoFechar();
    window.addEventListener("keydown", tecla);
    const antes = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", tecla); document.body.style.overflow = antes; };
  }, [aberta, aoFechar]);
  return (
    <AnimatePresence>
      {aberta && (
        <div className="fixed inset-0 z-50" role="dialog" aria-modal="true">
          <motion.div className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" onClick={aoFechar}
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} />
          <motion.aside className="absolute inset-y-0 right-0 flex w-full max-w-xl flex-col bg-superficie shadow-flutuante"
            initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }} transition={{ type: "spring", damping: 32, stiffness: 320 }}>
            <header className="flex items-start justify-between gap-4 border-b border-borda px-6 py-5">
              <div className="min-w-0">
                <div className="font-display text-lg font-bold leading-snug">{titulo}</div>
                {subtitulo && <div className="mt-1 text-sm text-texto-2">{subtitulo}</div>}
              </div>
              <button onClick={aoFechar} aria-label="Fechar" className="grid size-9 shrink-0 place-items-center rounded-xl hover:bg-superficie-2">
                <X className="size-5" />
              </button>
            </header>
            <div className="flex-1 space-y-6 overflow-y-auto px-6 py-6">{children}</div>
          </motion.aside>
        </div>
      )}
    </AnimatePresence>
  );
}
