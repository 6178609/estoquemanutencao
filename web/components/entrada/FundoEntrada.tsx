"use client";

import dynamic from "next/dynamic";
import { useEffect, useState, useSyncExternalStore } from "react";

import { ObjetoSim } from "@/components/ObjetoSim";

/** three.js e os efeitos só entram no cliente, e só quando a cena vai aparecer. */
const EspacoCinematico = dynamic(() => import("./EspacoCinematico").then((m) => m.EspacoCinematico), { ssr: false });

// estado compartilhado entre o fundo e a coluna da direita: "a cena 3D está no ar?"
let cenaNoAr = false;
const ouvintes = new Set<() => void>();
function definirCena(v: boolean) {
  cenaNoAr = v;
  ouvintes.forEach((f) => f());
}
const assinar = (f: () => void) => { ouvintes.add(f); return () => { ouvintes.delete(f); }; };
const useCenaNoAr = () => useSyncExternalStore(assinar, () => cenaNoAr, () => false);

function podeAnimar(): boolean {
  if (typeof window === "undefined") return false;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return false;
  if (!window.matchMedia("(min-width: 1024px)").matches) return false;
  try {
    const c = document.createElement("canvas");
    const gl = (c.getContext("webgl2") || c.getContext("webgl")) as WebGLRenderingContext | null;
    if (!gl) return false;
    // sem aceleração de vídeo (renderização por software), a cena travaria a tela: fica a logo
    const info = gl.getExtension("WEBGL_debug_renderer_info");
    const placa = String(info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
    const software = /swiftshader|llvmpipe|software|basic render/i.test(placa);
    return !software || (window as { __cenaSemPlaca?: boolean }).__cenaSemPlaca === true;
  } catch {
    return false;
  }
}

/**
 * Fundo da tela de entrada: a animação 3D do espaço com a logo SIM (globo, anel e foguetes), em plano de cinema, atrás
 * da página (tela grande, com placa de vídeo e sem "reduzir movimento"). O formulário fica num painel de vidro claro.
 * Sem a cena, nada aparece aqui e a coluna da direita mostra a logo SIM em 3D (`LadoEntrada`).
 */
export function FundoEntrada() {
  const noAr = useCenaNoAr();
  const [visivel, setVisivel] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => definirCena(podeAnimar()));
    return () => { cancelAnimationFrame(id); definirCena(false); };
  }, []);
  useEffect(() => {
    if (!noAr) return;
    const t = setTimeout(() => setVisivel(true), 300);
    return () => clearTimeout(t);
  }, [noAr]);
  if (!noAr) return null;
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-0">
      <div className={`absolute inset-0 transition-opacity duration-[1600ms] ${visivel ? "opacity-100" : "opacity-0"}`}>
        <EspacoCinematico aoFalhar={() => definirCena(false)} />
      </div>
      {/* sombra suave à esquerda, onde fica o painel do formulário */}
      <div className="absolute inset-0 bg-[linear-gradient(90deg,rgb(2_6_10/0.55)_0%,rgb(2_6_10/0.25)_40%,transparent_62%)]" />
    </div>
  );
}

/** Coluna da direita: vazia quando a cena está no fundo (ela aparece ali), senão a logo SIM em 3D. */
export function LadoEntrada({ tamanho = 520 }: { tamanho?: number }) {
  const noAr = useCenaNoAr();
  if (noAr) return <div aria-hidden style={{ width: tamanho, maxWidth: "100%", aspectRatio: "1" }} />;
  return <ObjetoSim tamanho={tamanho} />;
}
