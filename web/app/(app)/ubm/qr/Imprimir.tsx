"use client";

import { Printer } from "lucide-react";

import { BOTAO_PRIMARIO } from "@/components/ui";

export function Imprimir() {
  return <button type="button" onClick={() => window.print()} className={BOTAO_PRIMARIO}><Printer className="size-4" /> Imprimir</button>;
}
