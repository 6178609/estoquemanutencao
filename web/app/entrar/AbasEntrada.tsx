"use client";

import clsx from "clsx";
import { useState } from "react";

import { FormularioEntrada } from "./FormularioEntrada";
import { FormularioSolicitar } from "./FormularioSolicitar";

/** "Entrar" / "Solicitar acesso" — o pedido só existe com o repositório de dados ligado (na demonstração não há onde gravar). */
export function AbasEntrada({ demo }: { demo: boolean }) {
  const [aba, setAba] = useState<"entrar" | "pedir">("entrar");
  if (demo) return <FormularioEntrada demo />;
  return (
    <div className="space-y-5">
      <div role="tablist" className="grid grid-cols-2 gap-1 rounded-xl bg-superficie-2 p-1">
        {([["entrar", "Entrar"], ["pedir", "Solicitar acesso"]] as const).map(([id, titulo]) => (
          <button key={id} role="tab" aria-selected={aba === id} onClick={() => setAba(id)}
            className={clsx("h-9 rounded-lg text-[14px] transition",
              aba === id ? "bg-superficie font-medium text-texto shadow-sm" : "text-texto-3 hover:text-texto")}>
            {titulo}
          </button>
        ))}
      </div>
      {aba === "entrar" ? <FormularioEntrada demo={false} /> : <FormularioSolicitar />}
    </div>
  );
}
