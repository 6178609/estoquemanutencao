"use client";

import clsx from "clsx";
import { FilterX, LoaderCircle } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";

import { CampoBusca, MultiEscolha } from "@/components/Filtros";

/**
 * Filtros locais de uma tela, guardados no endereço (?param=…): a página (servidor) relê e filtra. Mudar um filtro
 * volta para a página 1 e fecha o item aberto (`zerar`). Lista vazia com padrão não vazio vira "-" (= todos).
 */
export type CampoFiltro =
  | { tipo: "busca"; param: string; placeholder: string }
  | { tipo: "multi"; param: string; rotulo: string; opcoes: { valor: string; rotulo?: string; n?: number }[]; padrao?: string[] }
  | { tipo: "pilulas"; param: string; rotulo: string; opcoes: string[]; padrao?: string[] }
  | { tipo: "alternar"; param: string; rotulo: string; padrao?: boolean };

function lista(sp: URLSearchParams, param: string, padrao: string[] = []): string[] {
  const v = sp.get(param);
  if (v == null) return padrao;
  return v.split(",").map((x) => x.trim()).filter((x) => x && x !== "-");
}

export function FiltrosUrl({ campos, zerar = [] }: { campos: CampoFiltro[]; zerar?: string[] }) {
  const sp = useSearchParams();
  const router = useRouter();
  const rota = usePathname();
  const [pendente, iniciar] = useTransition();
  const buscaCampo = campos.find((c) => c.tipo === "busca");
  const [texto, setTexto] = useState(buscaCampo ? sp.get(buscaCampo.param) ?? "" : "");
  const espera = useRef<ReturnType<typeof setTimeout> | null>(null);

  const ir = (mudar: (p: URLSearchParams) => void) => {
    const p = new URLSearchParams(sp.toString());
    mudar(p);
    for (const k of ["pag", ...zerar]) p.delete(k);
    iniciar(() => router.replace(`${rota}?${p.toString()}`, { scroll: false }));
  };
  const definirLista = (param: string, v: string[], padrao: string[] = []) => ir((p) => {
    const igual = v.length === padrao.length && v.every((x) => padrao.includes(x));
    if (igual) p.delete(param);
    else if (!v.length) p.set(param, "-");
    else p.set(param, v.join(","));
  });

  useEffect(() => () => { if (espera.current) clearTimeout(espera.current); }, []);
  const mudarBusca = (v: string) => {
    setTexto(v);
    if (!buscaCampo) return;
    if (espera.current) clearTimeout(espera.current);
    espera.current = setTimeout(() => ir((p) => (v.trim() ? p.set(buscaCampo.param, v.trim()) : p.delete(buscaCampo.param))), 350);
  };

  const algum = campos.some((c) => sp.get(c.param) != null);
  return (
    <div className="flex flex-col gap-3 rounded-cartao border border-borda bg-superficie p-3 sm:p-4">
      <div className="flex flex-wrap items-center gap-2">
        {buscaCampo?.tipo === "busca" && (
          <div className="w-full min-w-0 sm:w-auto sm:min-w-[260px] sm:flex-1"><CampoBusca valor={texto} aoMudar={mudarBusca} placeholder={buscaCampo.placeholder} /></div>
        )}
        {campos.map((c) => {
          if (c.tipo === "multi")
            return <MultiEscolha key={c.param} rotulo={c.rotulo} opcoes={c.opcoes} valor={lista(sp, c.param, c.padrao)}
              aoMudar={(v) => definirLista(c.param, v, c.padrao)} />;
          if (c.tipo === "alternar") {
            const padrao = !!c.padrao;
            const v = sp.get(c.param) == null ? padrao : sp.get(c.param) === "1";
            return (
              <button key={c.param} role="switch" aria-checked={v}
                onClick={() => ir((p) => (!v === padrao ? p.delete(c.param) : p.set(c.param, !v ? "1" : "0")))}
                className="inline-flex h-11 items-center gap-2 rounded-xl border border-borda bg-superficie-2 px-3.5 text-[13.5px] text-texto-2 transition hover:text-texto">
                <span className={clsx("relative h-5 w-9 rounded-full transition", v ? "bg-marca-500" : "bg-superficie-3")}>
                  <span className={clsx("absolute top-0.5 size-4 rounded-full bg-white shadow transition-all", v ? "left-[18px]" : "left-0.5")} />
                </span>
                {c.rotulo}
              </button>
            );
          }
          return null;
        })}
        {algum && (
          <button onClick={() => { setTexto(""); ir((p) => { for (const c of campos) p.delete(c.param); }); }}
            className="inline-flex h-11 items-center gap-1.5 rounded-xl px-3 text-[13px] text-texto-3 transition hover:text-texto">
            <FilterX className="size-4" /> Limpar
          </button>
        )}
        {pendente && <LoaderCircle className="size-4 animate-spin text-texto-3" aria-label="Atualizando" />}
      </div>
      {campos.filter((c) => c.tipo === "pilulas").map((c) => {
        if (c.tipo !== "pilulas") return null;
        const v = lista(sp, c.param, c.padrao);
        return (
          <div key={c.param} className="flex flex-wrap items-center gap-1.5">
            <span className="mr-1 text-[12.5px] text-texto-3">{c.rotulo}:</span>
            {c.opcoes.map((o) => {
              const on = v.includes(o);
              return (
                <button key={o} aria-pressed={on} onClick={() => definirLista(c.param, on ? v.filter((x) => x !== o) : [...v, o], c.padrao)}
                  className={clsx("rounded-full border px-3 py-1 text-[12.5px] transition",
                    on ? "border-marca-500/40 bg-marca-500/10 font-medium text-texto" : "border-borda text-texto-3 hover:text-texto")}>
                  {o}
                </button>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
