"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";

import { ObjetoSim } from "@/components/ObjetoSim";

/** three.js só entra no cliente e só quando a cena 3D vai aparecer (tela grande, com WebGL, sem "reduzir movimento"). */
const CenaEntrada = dynamic(() => import("./CenaEntrada").then((m) => m.CenaEntrada), { ssr: false });

function podeAnimar(): boolean {
  if (typeof window === "undefined") return false;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return false;
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") || c.getContext("webgl"));
  } catch {
    return false;
  }
}

/**
 * O destaque da tela de entrada: a cena 3D da manutenção (engrenagens, órbitas e dados) com a logo SIM à frente.
 * Sem WebGL, com "reduzir movimento" ou se o navegador perder o contexto, fica a logo SIM em 3D (ObjetoSim).
 */
export function HeroEntrada({ tamanho = 520 }: { tamanho?: number }) {
  const [animar, setAnimar] = useState(false);
  const [pronta, setPronta] = useState(false);
  useEffect(() => {
    // decisão só no cliente (no servidor sai a logo, sem diferença de hidratação)
    const id = requestAnimationFrame(() => setAnimar(podeAnimar()));
    return () => cancelAnimationFrame(id);
  }, []);
  useEffect(() => {
    if (!animar) return;
    const t = setTimeout(() => setPronta(true), 350);
    return () => clearTimeout(t);
  }, [animar]);

  if (!animar) return <ObjetoSim tamanho={tamanho} />;
  return (
    <div className="relative" style={{ width: tamanho, maxWidth: "100%", aspectRatio: "1" }} role="img"
      aria-label="SIM Manutenção Profissional: engrenagens em movimento, órbitas e dados da manutenção em tempo real">
      <div aria-hidden className="absolute inset-[4%] rounded-full"
        style={{ background: "radial-gradient(circle at 50% 45%, rgb(0 138 64 / 0.10) 0%, rgb(0 108 180 / 0.05) 42%, transparent 70%)" }} />
      <div aria-hidden className={`absolute inset-0 transition-opacity duration-1000 ${pronta ? "opacity-100" : "opacity-0"}`}>
        <CenaEntrada aoFalhar={() => setAnimar(false)} />
      </div>
      {/* a marca à frente da cena */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/logo_sim.svg" alt="" width={1000} height={540} aria-hidden
        className={`pointer-events-none absolute bottom-[1%] left-1/2 w-[34%] -translate-x-1/2 drop-shadow-[0_10px_18px_rgba(9,9,11,0.18)] transition-all duration-1000 ${pronta ? "translate-y-0 opacity-100" : "translate-y-3 opacity-0"}`} />
    </div>
  );
}
