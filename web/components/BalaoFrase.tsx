"use client";

import { useCallback, useState } from "react";

import { FRASES, proximaFrase } from "@/lib/frasesAstronauta";

const CHAVE = "astronauta-frases";
/** Sorteio desta aba quando o navegador não deixa guardar. */
let memoria: unknown = null;

/** Sorteia a próxima frase e guarda a posição no navegador (sem armazenamento, segue só nesta aba). */
function sortear(): string {
  let guardado: unknown = null;
  try { guardado = JSON.parse(localStorage.getItem(CHAVE) || "null"); } catch { /* sem armazenamento */ }
  const r = proximaFrase(guardado ?? memoria);
  memoria = r.estado;
  try { localStorage.setItem(CHAVE, JSON.stringify(r.estado)); } catch { /* sem armazenamento */ }
  return FRASES[r.indice];
}

/**
 * Balão de fala do astronauta. A frase troca a cada ciclo da animação (`.astro-balao`, 18 s), enquanto o balão está
 * escondido: ao montar e a cada repetição sai a próxima do sorteio, sem repetir.
 */
export function BalaoFrase() {
  const [frase, setFrase] = useState("");
  // a primeira frase sai assim que o balão monta (a animação pode ter começado antes de a página ficar pronta)
  const montar = useCallback((el: HTMLDivElement | null) => { if (el) setFrase((f) => f || sortear()); }, []);
  const trocar = () => setFrase(sortear());
  return (
    <div ref={montar} onAnimationIteration={trocar}
      className="astro-balao absolute bottom-[78px] left-[30px] w-max max-w-[340px] origin-bottom-left rounded-2xl border border-borda bg-white px-3.5 py-2.5 text-[13px] font-medium leading-snug text-texto-2 shadow-flutuante">
      {frase}
      <span className="absolute -bottom-[7px] left-4 size-3 rotate-45 border-b border-r border-borda bg-white" />
    </div>
  );
}
