"use client";

import clsx from "clsx";
import { Check, ChevronDown, Search, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

export function CampoBusca({ valor, aoMudar, placeholder }: { valor: string; aoMudar: (v: string) => void; placeholder: string }) {
  return (
    <label className="relative block min-w-0 flex-1">
      <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-texto-3" />
      <input value={valor} onChange={(e) => aoMudar(e.target.value)} placeholder={placeholder} type="text" enterKeyHint="search"
        className="h-11 w-full rounded-xl border border-borda bg-superficie pl-10 pr-9 text-sm outline-none transition placeholder:text-texto-3 focus:border-marca-500 focus:ring-4 focus:ring-marca-500/15" />
      {valor && (
        <button onClick={() => aoMudar("")} aria-label="Limpar busca" className="absolute right-2 top-1/2 grid size-7 -translate-y-1/2 place-items-center rounded-lg text-texto-3 hover:bg-superficie-2">
          <X className="size-4" />
        </button>
      )}
    </label>
  );
}

export function Segmentos<T extends string>({ opcoes, valor, aoMudar }: { opcoes: { valor: T; rotulo: string; n?: number }[];
  valor: T; aoMudar: (v: T) => void }) {
  return (
    <div className="flex flex-wrap gap-1 rounded-xl border border-borda bg-superficie-2 p-1">
      {opcoes.map((o) => (
        <button key={o.valor} onClick={() => aoMudar(o.valor)}
          className={clsx("rounded-lg px-3 py-1.5 text-sm font-medium transition",
            valor === o.valor ? "bg-superficie text-texto shadow-cartao" : "text-texto-2 hover:text-texto")}>
          {o.rotulo}{o.n !== undefined && <span className="num ml-1.5 text-xs text-texto-3">{o.n.toLocaleString("pt-BR")}</span>}
        </button>
      ))}
    </div>
  );
}

/** Seleção múltipla compacta (vazio = todos). */
export function MultiEscolha({ rotulo, opcoes, valor, aoMudar }: { rotulo: string; opcoes: { valor: string; rotulo?: string; n?: number }[];
  valor: string[]; aoMudar: (v: string[]) => void }) {
  const [aberta, setAberta] = useState(false);
  const [filtro, setFiltro] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const fora = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setAberta(false);
    document.addEventListener("mousedown", fora);
    return () => document.removeEventListener("mousedown", fora);
  }, []);
  const vis = opcoes.filter((o) => (o.rotulo || o.valor).toLowerCase().includes(filtro.toLowerCase()));
  const alternar = (v: string) => aoMudar(valor.includes(v) ? valor.filter((x) => x !== v) : [...valor, v]);
  return (
    <div ref={ref} className="relative">
      <button onClick={() => setAberta(!aberta)}
        className={clsx("flex h-11 items-center gap-2 rounded-xl border px-3.5 text-sm font-medium transition",
          valor.length ? "border-marca-400 bg-marca-50 text-marca-800 dark:bg-marca-900/30 dark:text-marca-200" : "border-borda bg-superficie text-texto-2 hover:text-texto")}>
        {rotulo}{valor.length > 0 && <span className="num rounded-full bg-marca-600 px-1.5 text-xs text-white">{valor.length}</span>}
        <ChevronDown className={clsx("size-4 transition", aberta && "rotate-180")} />
      </button>
      {aberta && (
        <div className="absolute left-0 z-30 mt-2 w-72 overflow-hidden rounded-2xl border border-borda bg-superficie shadow-flutuante">
          {opcoes.length > 8 && (
            <div className="border-b border-borda p-2">
              <input autoFocus value={filtro} onChange={(e) => setFiltro(e.target.value)} placeholder="Filtrar…"
                className="h-9 w-full rounded-lg bg-superficie-2 px-3 text-sm outline-none" />
            </div>
          )}
          <ul className="max-h-72 overflow-y-auto p-1.5">
            {vis.map((o) => (
              <li key={o.valor}>
                <button onClick={() => alternar(o.valor)} className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm hover:bg-superficie-2">
                  <span className={clsx("grid size-4 shrink-0 place-items-center rounded border", valor.includes(o.valor) ? "border-marca-600 bg-marca-600 text-white" : "border-borda")}>
                    {valor.includes(o.valor) && <Check className="size-3" />}
                  </span>
                  <span className="flex-1 truncate">{o.rotulo || o.valor}</span>
                  {o.n !== undefined && <span className="num text-xs text-texto-3">{o.n.toLocaleString("pt-BR")}</span>}
                </button>
              </li>
            ))}
            {!vis.length && <li className="px-3 py-2 text-sm text-texto-3">Nada encontrado.</li>}
          </ul>
          {valor.length > 0 && (
            <div className="border-t border-borda p-1.5">
              <button onClick={() => aoMudar([])} className="w-full rounded-lg px-2.5 py-2 text-left text-sm font-medium text-acao-500 hover:bg-superficie-2">Limpar seleção</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
