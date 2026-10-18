"use client";

import clsx from "clsx";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";

import { CampoBusca, MultiEscolha } from "@/components/Filtros";

/**
 * Filtros da página (abaixo da barra global): busca, múltipla escolha, chaves liga/desliga e segmentos. Tudo vai
 * para o endereço (?q=…) e o servidor filtra e pagina — o navegador nunca recebe a base inteira.
 */
export type Campo =
  | { tipo: "busca"; chave: string; placeholder: string }
  | { tipo: "multi"; chave: string; rotulo: string; opcoes: { valor: string; rotulo?: string; n?: number }[] }
  | { tipo: "alternar"; chave: string; rotulo: string; dica?: string; padrao?: boolean }
  | { tipo: "segmentos"; chave: string; opcoes: { valor: string; rotulo: string }[]; padrao: string; limpa?: string[]; atual?: string }
  | { tipo: "datas"; de: string; ate: string; rotulo: string; padraoDe: string; padraoAte: string; limpa?: string[] };

export function FiltrosLocais({ campos, limpar = [] }: { campos: Campo[]; limpar?: string[] }) {
  const router = useRouter();
  const rota = usePathname();
  const params = useSearchParams();
  const [pendente, iniciar] = useTransition();
  useEffect(() => { document.documentElement.toggleAttribute("data-carregando", pendente); }, [pendente]);

  function aplicar(chave: string, valor: string, extra: Record<string, string> = {}) {
    const p = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries({ [chave]: valor, ...extra })) if (v) p.set(k, v); else p.delete(k);
    for (const k of ["pag", ...limpar]) p.delete(k);
    iniciar(() => router.replace(`${rota}?${p.toString()}`, { scroll: false }));
  }

  const busca = campos.filter((c) => c.tipo === "busca");
  const outros = campos.filter((c) => c.tipo !== "busca");
  return (
    <div className="space-y-3 rounded-cartao border border-borda bg-superficie p-4">
      {busca.map((c) => <Busca key={c.chave} placeholder={c.placeholder} inicial={params.get(c.chave) ?? ""} aoMudar={(v) => aplicar(c.chave, v)} />)}
      {outros.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          {outros.map((c) => {
            if (c.tipo === "multi") {
              const valor = (params.get(c.chave) || "").split(",").filter(Boolean);
              return <MultiEscolha key={c.chave} rotulo={c.rotulo} opcoes={c.opcoes} valor={valor} aoMudar={(v) => aplicar(c.chave, v.join(","))} />;
            }
            if (c.tipo === "alternar") {
              const atual = params.get(c.chave);
              const ativo = atual == null ? !!c.padrao : atual === "1";
              return (
                <button key={c.chave} role="switch" aria-checked={ativo} title={c.dica}
                  onClick={() => aplicar(c.chave, ativo === !!c.padrao ? (ativo ? "0" : "1") : "")}
                  className={clsx("flex h-11 items-center gap-2.5 rounded-xl border px-3.5 text-[13.5px] transition",
                    ativo ? "border-marca-300 bg-marca-50 font-medium text-marca-700 dark:bg-marca-900/30 dark:text-marca-200" : "border-borda bg-superficie-2 text-texto-2 hover:text-texto")}>
                  <span className={clsx("relative h-[18px] w-8 shrink-0 rounded-full transition", ativo ? "bg-marca-500" : "bg-superficie-3")}>
                    <span className={clsx("absolute top-[2px] size-[14px] rounded-full bg-white shadow transition-all", ativo ? "left-[16px]" : "left-[2px]")} />
                  </span>
                  {c.rotulo}
                </button>
              );
            }
            if (c.tipo === "datas") {
              const de = params.get(c.de) || c.padraoDe, ate = params.get(c.ate) || c.padraoAte;
              const entrada = "h-9 rounded-lg bg-superficie px-2 text-[13px] text-texto";
              return (
                <div key={c.de} className="flex h-11 flex-wrap items-center gap-1.5 rounded-xl border border-borda bg-superficie-2 px-2 text-[13px] text-texto-3">
                  <span className="pl-1">{c.rotulo}</span>
                  <input type="date" aria-label="De" value={de} max={ate} className={entrada}
                    onChange={(e) => e.target.value && aplicar(c.de, e.target.value, { [c.ate]: ate, ...vazios(c.limpa) })} />
                  <span>a</span>
                  <input type="date" aria-label="Até" value={ate} min={de} className={entrada}
                    onChange={(e) => e.target.value && aplicar(c.ate, e.target.value, { [c.de]: de, ...vazios(c.limpa) })} />
                </div>
              );
            }
            if (c.tipo === "segmentos") {
              const atual = c.atual ?? (params.get(c.chave) || c.padrao);
              return (
                <div key={c.chave} className="flex h-11 max-w-full items-center gap-0.5 overflow-x-auto rounded-xl border border-borda bg-superficie-2 p-1">
                  {c.opcoes.map((o) => (
                    <button key={o.valor} onClick={() => aplicar(c.chave, o.valor === c.padrao ? "" : o.valor, vazios(c.limpa))} aria-pressed={atual === o.valor}
                      className={clsx("h-full shrink-0 whitespace-nowrap rounded-lg px-3 text-[13px] transition",
                        atual === o.valor ? "bg-superficie font-medium text-texto shadow-sm" : "text-texto-3 hover:text-texto")}>
                      {o.rotulo}
                    </button>
                  ))}
                </div>
              );
            }
            return null;
          })}
          {pendente && <span className="text-[12.5px] text-texto-3">Filtrando…</span>}
        </div>
      )}
    </div>
  );
}

const vazios = (ks: string[] = []) => Object.fromEntries(ks.map((k) => [k, ""]));

/** Busca com espera de 350 ms (não refaz a página a cada tecla). */
function Busca({ placeholder, inicial, aoMudar }: { placeholder: string; inicial: string; aoMudar: (v: string) => void }) {
  const [v, setV] = useState(inicial);
  const ultimo = useRef(inicial);
  useEffect(() => {
    if (v.trim() === ultimo.current.trim()) return;
    const t = setTimeout(() => { ultimo.current = v; aoMudar(v.trim()); }, 350);
    return () => clearTimeout(t);
  }, [v, aoMudar]);
  return <CampoBusca valor={v} aoMudar={setV} placeholder={placeholder} />;
}
