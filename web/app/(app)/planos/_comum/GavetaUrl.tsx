"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";

import { Gaveta } from "@/components/Gaveta";

/**
 * Gaveta lateral ligada a um parâmetro do endereço (?plano=…, ?lote=…): aberta quando ele existe; fechar tira o
 * parâmetro (o conteúdo vem pronto do servidor como `children`).
 */
export function GavetaUrl({ parametro, titulo, subtitulo, children }: {
  parametro: string; titulo: React.ReactNode; subtitulo?: React.ReactNode; children: React.ReactNode;
}) {
  const router = useRouter();
  const rota = usePathname();
  const params = useSearchParams();
  const aberta = params.has(parametro);
  const fechar = useCallback(() => {
    const p = new URLSearchParams(params.toString());
    p.delete(parametro);
    router.push(`${rota}${p.size ? `?${p}` : ""}`, { scroll: false });
  }, [params, parametro, rota, router]);
  return <Gaveta aberta={aberta} aoFechar={fechar} titulo={titulo} subtitulo={subtitulo}>{children}</Gaveta>;
}
