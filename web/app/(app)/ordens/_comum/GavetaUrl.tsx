"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";

import { Gaveta } from "@/components/Gaveta";

/** Gaveta de detalhe aberta pelo endereço (?ordem=…): fechar tira as chaves do endereço. O conteúdo vem do servidor. */
export function GavetaUrl({ chaves, titulo, subtitulo, children }: { chaves: string[]; titulo: React.ReactNode; subtitulo?: React.ReactNode;
  children: React.ReactNode }) {
  const router = useRouter();
  const rota = usePathname();
  const params = useSearchParams();
  const fechar = useCallback(() => {
    const p = new URLSearchParams(params.toString());
    for (const k of chaves) p.delete(k);
    router.replace(`${rota}?${p.toString()}`, { scroll: false });
  }, [chaves, params, rota, router]);
  return <Gaveta aberta aoFechar={fechar} titulo={titulo} subtitulo={subtitulo}>{children}</Gaveta>;
}
