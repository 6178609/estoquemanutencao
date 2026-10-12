"use client";

import clsx from "clsx";
import { CalendarRange, Check, ChevronDown, FilterX, Search } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";

export interface Opcao { valor: string; rotulo?: string; n: number }
export interface OpcoesFiltro { areas: Opcao[]; setores: Opcao[]; centros: Opcao[]; tipos: Opcao[] }

const ATALHOS = ["Mês atual", "Mês passado", "Últimos 3 meses", "Próximos 30 dias", "Ano atual", "Últimos 12 meses", "Tudo"];
const n0 = new Intl.NumberFormat("pt-BR");

/** Um menu de múltipla escolha com busca; cada opção mostra quantas ordens tem no recorte (filtro em cascata). */
function Multi({ nome, chave, opcoes, selecionados, aoMudar }: {
  nome: string; chave: string; opcoes: Opcao[]; selecionados: string[]; aoMudar: (k: string, v: string[]) => void;
}) {
  const [aberto, setAberto] = useState(false);
  const [busca, setBusca] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!aberto) return;
    const fora = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setAberto(false); };
    document.addEventListener("mousedown", fora);
    return () => document.removeEventListener("mousedown", fora);
  }, [aberto]);
  const vis = opcoes.filter((o) => !busca || (o.rotulo || o.valor).toLowerCase().includes(busca.toLowerCase()));
  const alternar = (v: string) => aoMudar(chave, selecionados.includes(v) ? selecionados.filter((x) => x !== v) : [...selecionados, v]);
  const resumo = selecionados.length === 0 ? "Todos" : selecionados.length === 1 ? (opcoes.find((o) => o.valor === selecionados[0])?.rotulo || selecionados[0]) : `${selecionados.length} escolhidos`;
  return (
    <div ref={ref} className="relative">
      <button onClick={() => setAberto(!aberto)} aria-expanded={aberto}
        className={clsx("inline-flex h-9 max-w-[220px] items-center gap-1.5 rounded-lg border px-3 text-[13px] transition",
          selecionados.length ? "border-marca-500/40 bg-marca-500/8 text-texto" : "border-borda bg-superficie text-texto-2 hover:border-borda-forte")}>
        <span className="text-texto-3">{nome}:</span><span className="truncate font-medium">{resumo}</span>
        <ChevronDown className="size-3.5 shrink-0 text-texto-3" />
      </button>
      {aberto && (
        <div className="absolute left-0 z-30 mt-1.5 w-72 rounded-xl border border-borda bg-superficie p-2 shadow-flutuante">
          {opcoes.length > 8 && (
            <label className="mb-1.5 flex items-center gap-2 rounded-lg border border-borda px-2.5">
              <Search className="size-3.5 text-texto-3" />
              <input autoFocus value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Procurar"
                className="h-8 w-full bg-transparent text-[13px] outline-none" />
            </label>
          )}
          <div className="max-h-72 overflow-y-auto">
            {vis.length === 0 && <div className="px-2 py-3 text-[12.5px] text-texto-3">Nada no recorte.</div>}
            {vis.map((o) => {
              const marcado = selecionados.includes(o.valor);
              return (
                <button key={o.valor} onClick={() => alternar(o.valor)}
                  className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[13px] hover:bg-superficie-2">
                  <span className={clsx("grid size-4 shrink-0 place-items-center rounded border", marcado ? "border-marca-500 bg-marca-500 text-white" : "border-borda-forte")}>
                    {marcado && <Check className="size-3" strokeWidth={3} />}
                  </span>
                  <span className="min-w-0 flex-1 truncate">{o.rotulo || o.valor}</span>
                  <span className="num text-[11.5px] text-texto-3">{n0.format(o.n)}</span>
                </button>
              );
            })}
          </div>
          {selecionados.length > 0 && (
            <button onClick={() => aoMudar(chave, [])} className="mt-1 w-full rounded-lg px-2 py-1.5 text-left text-[12.5px] text-texto-3 hover:bg-superficie-2">
              Limpar {nome.toLowerCase()}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Barra única de filtros, acima de tudo o que ela recorta (todas as abas usam a mesma). Mudou um filtro: o endereço
 * muda, o cookie guarda a escolha para as outras abas e a página recalcula mantendo o desenho anterior esmaecido.
 */
export function BarraFiltros({ ini, fim, opcoes, recorte, periodo = true, dimensoes = true }: {
  ini: string; fim: string; opcoes: OpcoesFiltro; recorte: string; periodo?: boolean; dimensoes?: boolean;
}) {
  const router = useRouter();
  const rota = usePathname();
  const params = useSearchParams();
  const [pendente, iniciar] = useTransition();
  const [menuPeriodo, setMenuPeriodo] = useState(false);
  const sel = useMemo(() => ({
    area: (params.get("area") || "").split(",").filter(Boolean), setor: (params.get("setor") || "").split(",").filter(Boolean),
    centro: (params.get("centro") || "").split(",").filter(Boolean), tipo: (params.get("tipo") || "").split(",").filter(Boolean),
  }), [params]);
  useEffect(() => {
    document.documentElement.toggleAttribute("data-carregando", pendente);
  }, [pendente]);

  function aplicar(mudar: Record<string, string | string[] | null>) {
    const p = new URLSearchParams(params.toString());
    if (!("atalho" in mudar)) {
      if (mudar.ini || mudar.fim) p.delete("atalho");
      if (!p.get("atalho")) { p.set("ini", p.get("ini") || ini); p.set("fim", p.get("fim") || fim); }
    }
    for (const [k, v] of Object.entries(mudar)) {
      const s = Array.isArray(v) ? v.join(",") : v;
      if (s) p.set(k, s); else p.delete(k);
    }
    const guardar = Object.fromEntries(["atalho", "ini", "fim", "area", "setor", "centro", "tipo"].map((k) => [k, p.get(k) || ""]).filter(([, v]) => v));
    document.cookie = `cm_filtros=${encodeURIComponent(JSON.stringify(guardar))}; path=/; max-age=${60 * 60 * 24 * 90}; samesite=lax`;
    iniciar(() => router.push(`${rota}?${p.toString()}`, { scroll: false }));
  }
  const algum = sel.area.length + sel.setor.length + sel.centro.length + sel.tipo.length > 0;

  return (
    <div className="nao-imprimir sticky top-[57px] z-20 -mx-4 border-b border-borda bg-fundo/90 px-4 py-3 backdrop-blur lg:top-0 sm:-mx-8 sm:px-8">
      <div className="flex flex-wrap items-center gap-2">
        {periodo && (
          <div className="relative flex items-center gap-1.5">
            <div className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-borda bg-superficie px-2 text-[13px]">
              <CalendarRange className="size-4 text-texto-3" />
              <input type="date" value={ini} max={fim} onChange={(e) => e.target.value && aplicar({ ini: e.target.value })}
                aria-label="Data inicial" className="bg-transparent outline-none [color-scheme:inherit]" />
              <span className="text-texto-4">→</span>
              <input type="date" value={fim} min={ini} onChange={(e) => e.target.value && aplicar({ fim: e.target.value })}
                aria-label="Data final" className="bg-transparent outline-none" />
            </div>
            <button onClick={() => setMenuPeriodo(!menuPeriodo)} className="inline-flex h-9 items-center gap-1 rounded-lg border border-borda bg-superficie px-2.5 text-[13px] text-texto-2 hover:border-borda-forte">
              Atalhos <ChevronDown className="size-3.5" />
            </button>
            {menuPeriodo && (
              <div className="absolute left-0 top-10 z-30 w-52 rounded-xl border border-borda bg-superficie p-1.5 shadow-flutuante" onMouseLeave={() => setMenuPeriodo(false)}>
                {ATALHOS.map((a) => (
                  <button key={a} onClick={() => { setMenuPeriodo(false); aplicar({ atalho: a, ini: null, fim: null }); }}
                    className="block w-full rounded-lg px-2.5 py-1.5 text-left text-[13px] hover:bg-superficie-2">{a}</button>
                ))}
              </div>
            )}
          </div>
        )}
        {dimensoes && (
          <>
            <Multi nome="Área" chave="area" opcoes={opcoes.areas} selecionados={sel.area} aoMudar={(k, v) => aplicar({ [k]: v })} />
            <Multi nome="Setor" chave="setor" opcoes={opcoes.setores} selecionados={sel.setor} aoMudar={(k, v) => aplicar({ [k]: v })} />
            <Multi nome="Centro" chave="centro" opcoes={opcoes.centros} selecionados={sel.centro} aoMudar={(k, v) => aplicar({ [k]: v })} />
            <Multi nome="Tipo" chave="tipo" opcoes={opcoes.tipos} selecionados={sel.tipo} aoMudar={(k, v) => aplicar({ [k]: v })} />
          </>
        )}
        {algum && (
          <button onClick={() => aplicar({ area: null, setor: null, centro: null, tipo: null })}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-[13px] text-texto-3 hover:bg-superficie-2 hover:text-texto">
            <FilterX className="size-4" /> Limpar
          </button>
        )}
        <span className="ml-auto text-[12.5px] text-texto-3">{recorte}</span>
      </div>
    </div>
  );
}
