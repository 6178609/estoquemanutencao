"use client";

import clsx from "clsx";
import { CalendarRange, ChevronDown, Search, X } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

import { MultiEscolha } from "@/components/Filtros";

/**
 * Filtros próprios de uma aba (os das abas de programação: Planos, Calendário e Semanal), no
 * endereço — com nomes que não colidem com a barra global (?ini/?fim/?area/…): mudar um deles recalcula a página no
 * servidor mantendo o desenho anterior esmaecido, como a barra global. Tudo serializável (vem do servidor).
 */
export type Controle =
  | { tipo: "periodo"; de: string; ate: string; valorDe: string; valorAte: string; rotulo?: string;
    atalhos?: { rotulo: string; de: string; ate: string }[] }
  | { tipo: "busca"; chave: string; valor: string; placeholder: string }
  | { tipo: "multi"; chave: string; rotulo: string; valor: string[]; opcoes: { valor: string; rotulo?: string; n?: number }[] }
  | { tipo: "alternar"; chave: string; rotulo: string; valor: boolean; dica?: string }
  | { tipo: "escolha"; chave: string; rotulo: string; valor: string; opcoes: { valor: string; rotulo: string }[] }
  | { tipo: "pilulas"; chave: string; rotulo: string; valor: string[]; opcoes: { valor: string; n?: number }[] };

export function useAplicar(limpar: string[] = []) {
  const router = useRouter();
  const rota = usePathname();
  const params = useSearchParams();
  const [pendente, iniciar] = useTransition();
  useEffect(() => {
    document.documentElement.toggleAttribute("data-carregando", pendente);
  }, [pendente]);
  return (mudar: Record<string, string | string[] | null>) => {
    const p = new URLSearchParams(params.toString());
    for (const k of limpar) p.delete(k);
    for (const [k, v] of Object.entries(mudar)) {
      const s = Array.isArray(v) ? v.join(",") : v;
      if (s) p.set(k, s); else p.delete(k);
    }
    iniciar(() => router.push(`${rota}?${p.toString()}`, { scroll: false }));
  };
}

function Busca({ c, aplicar }: { c: Extract<Controle, { tipo: "busca" }>; aplicar: (m: Record<string, string | null>) => void }) {
  const [v, setV] = useState(c.valor);
  useEffect(() => setV(c.valor), [c.valor]);
  // aplica ao parar de digitar (0,5 s) ou no Enter
  useEffect(() => {
    if (v === c.valor) return;
    const t = setTimeout(() => aplicar({ [c.chave]: v.trim() || null }), 500);
    return () => clearTimeout(t);
  }, [v]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <label className="relative block min-w-[220px] flex-1">
      <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-texto-3" />
      <input value={v} onChange={(e) => setV(e.target.value)} placeholder={c.placeholder} type="search" enterKeyHint="search"
        onKeyDown={(e) => e.key === "Enter" && aplicar({ [c.chave]: v.trim() || null })}
        className="h-11 w-full rounded-xl border border-borda bg-superficie-2 pl-9 pr-9 text-[14px] transition placeholder:text-texto-4 focus:border-[var(--acao)] focus:bg-superficie" />
      {v && (
        <button onClick={() => { setV(""); aplicar({ [c.chave]: null }); }} aria-label="Limpar busca"
          className="absolute right-2 top-1/2 grid size-7 -translate-y-1/2 place-items-center rounded-lg text-texto-3 hover:bg-superficie-3">
          <X className="size-4" />
        </button>
      )}
    </label>
  );
}

function Periodo({ c, aplicar }: { c: Extract<Controle, { tipo: "periodo" }>; aplicar: (m: Record<string, string | null>) => void }) {
  const [menu, setMenu] = useState(false);
  return (
    <div className="relative flex flex-wrap items-center gap-1.5">
      {c.rotulo && <span className="text-[13px] text-texto-3">{c.rotulo}</span>}
      <div className="inline-flex h-11 items-center gap-1.5 rounded-xl border border-borda bg-superficie-2 px-3 text-[13.5px]">
        <CalendarRange className="size-4 text-texto-3" />
        <input type="date" value={c.valorDe} max={c.valorAte} aria-label="Data inicial" className="bg-transparent"
          onChange={(e) => e.target.value && aplicar({ [c.de]: e.target.value })} />
        <span className="text-texto-4">→</span>
        <input type="date" value={c.valorAte} min={c.valorDe} aria-label="Data final" className="bg-transparent"
          onChange={(e) => e.target.value && aplicar({ [c.ate]: e.target.value })} />
      </div>
      {!!c.atalhos?.length && (
        <>
          <button onClick={() => setMenu(!menu)} aria-expanded={menu}
            className="inline-flex h-11 items-center gap-1 rounded-xl border border-borda bg-superficie-2 px-3 text-[13.5px] text-texto-2 hover:text-texto">
            Atalhos <ChevronDown className="size-3.5" />
          </button>
          {menu && (
            <div className="absolute left-0 top-12 z-30 w-56 rounded-xl border border-borda bg-superficie p-1.5 shadow-flutuante" onMouseLeave={() => setMenu(false)}>
              {c.atalhos.map((a) => (
                <button key={a.rotulo} onClick={() => { setMenu(false); aplicar({ [c.de]: a.de, [c.ate]: a.ate }); }}
                  className={clsx("block w-full rounded-lg px-2.5 py-1.5 text-left text-[13px] hover:bg-superficie-2",
                    a.de === c.valorDe && a.ate === c.valorAte && "font-medium")}>{a.rotulo}</button>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

/** Uma linha de filtros da aba. `limpar`: parâmetros que voltam ao padrão quando qualquer filtro muda (ex.: ?pag). */
export function Controles({ controles, limpar = [], className }: { controles: Controle[]; limpar?: string[]; className?: string }) {
  const aplicar = useAplicar(limpar);
  return (
    <div className={clsx("flex flex-wrap items-center gap-2", className)}>
      {controles.map((c) => {
        switch (c.tipo) {
          case "periodo": return <Periodo key={c.de} c={c} aplicar={aplicar} />;
          case "busca": return <Busca key={c.chave} c={c} aplicar={aplicar} />;
          case "multi":
            return <MultiEscolha key={c.chave} rotulo={c.rotulo} opcoes={c.opcoes} valor={c.valor} aoMudar={(v) => aplicar({ [c.chave]: v })} />;
          case "alternar":
            return (
              <label key={c.chave} title={c.dica} className="inline-flex h-11 cursor-pointer select-none items-center gap-2 rounded-xl border border-borda bg-superficie-2 px-3.5 text-[13.5px] text-texto-2">
                <input type="checkbox" checked={c.valor} onChange={(e) => aplicar({ [c.chave]: e.target.checked ? "1" : null })}
                  className="size-4 accent-[var(--serie-1)]" />
                {c.rotulo}
              </label>
            );
          case "escolha":
            return (
              <label key={c.chave} className="inline-flex h-11 items-center gap-2 rounded-xl border border-borda bg-superficie-2 px-3 text-[13.5px]">
                <span className="text-texto-3">{c.rotulo}</span>
                <select value={c.valor} onChange={(e) => aplicar({ [c.chave]: e.target.value })}
                  className="max-w-[60vw] bg-transparent font-medium">
                  {c.opcoes.map((o) => <option key={o.valor} value={o.valor}>{o.rotulo}</option>)}
                </select>
              </label>
            );
          case "pilulas":
            return (
              <div key={c.chave} className="flex flex-wrap items-center gap-1.5">
                <span className="text-[13px] text-texto-3">{c.rotulo}</span>
                {c.opcoes.map((o) => {
                  const on = c.valor.includes(o.valor);
                  return (
                    <button key={o.valor} aria-pressed={on}
                      onClick={() => aplicar({ [c.chave]: on ? c.valor.filter((x) => x !== o.valor) : [...c.valor, o.valor] })}
                      className={clsx("rounded-full border px-3 py-1 text-[12.5px] transition",
                        on ? "border-transparent bg-superficie-3 font-medium text-texto" : "border-borda text-texto-3 hover:text-texto")}>
                      {o.valor}{o.n != null && <span className="num ml-1 text-texto-3">{o.n.toLocaleString("pt-BR")}</span>}
                    </button>
                  );
                })}
              </div>
            );
        }
      })}
    </div>
  );
}
