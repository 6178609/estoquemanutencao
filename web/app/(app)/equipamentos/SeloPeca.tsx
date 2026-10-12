import { CircleCheck, CircleX, AlertTriangle, Link2Off } from "lucide-react";

import type { SituacaoPeca } from "./logica";

/** Situação da peça no estoque (a regra da página Estoque): ícone + cor + texto. */
const ESTILO = {
  ok: { I: CircleCheck, cor: "var(--st-bom)" }, baixo: { I: AlertTriangle, cor: "var(--st-serio)" },
  zerado: { I: CircleX, cor: "var(--st-critico)" }, ausente: { I: Link2Off, cor: "var(--st-critico)" },
} as const;

export function SeloPeca({ p }: { p: Pick<SituacaoPeca, "status" | "texto"> }) {
  const { I, cor } = ESTILO[p.status];
  return (
    <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-md bg-superficie-2 px-1.5 py-0.5 text-[11.5px] font-medium text-texto-2">
      <I className="size-3" style={{ color: cor }} strokeWidth={2.25} />{p.texto}
    </span>
  );
}
