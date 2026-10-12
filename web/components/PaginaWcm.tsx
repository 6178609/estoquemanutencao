import { Suspense } from "react";

import { BarraFiltros, type OpcoesFiltro } from "./BarraFiltros";

/** Moldura das abas WCM: a barra de filtros (uma só, acima de tudo) e o conteúdo. */
export function PaginaWcm({ barra, children, periodo = true, dimensoes = true }: {
  barra: { ini: string; fim: string; opcoes: OpcoesFiltro; recorte: string }; children: React.ReactNode; periodo?: boolean; dimensoes?: boolean;
}) {
  return (
    <div className="mx-auto w-full max-w-[1320px] px-4 sm:px-8">
      <Suspense>
        <BarraFiltros {...barra} periodo={periodo} dimensoes={dimensoes} />
      </Suspense>
      <div className="space-y-10 py-8">{children}</div>
    </div>
  );
}

/** Seção com título em dois tons e ações à direita. */
export function Secao({ titulo, destaque, sub, acoes, children }: { titulo: string; destaque?: string; sub?: string; acoes?: React.ReactNode;
  children: React.ReactNode }) {
  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-display text-[22px] font-medium tracking-[-0.02em]">{titulo}{destaque && <> <span className="tom2">{destaque}</span></>}</h2>
          {sub && <p className="mt-1 max-w-3xl text-[13px] text-texto-3">{sub}</p>}
        </div>
        {acoes}
      </div>
      {children}
    </section>
  );
}

/** Abas internas por endereço (?visao=…), mantendo os filtros. */
export function AbasVisao({ visoes, atual, params }: { visoes: string[]; atual: string; params: Record<string, string | string[] | undefined> }) {
  const base = new URLSearchParams(Object.entries(params).flatMap(([k, v]) => (k === "visao" || v == null ? [] : (Array.isArray(v) ? v : [v]).map((x) => [k, x]))));
  return (
    <nav className="flex flex-wrap gap-1">
      {visoes.map((v) => {
        const p = new URLSearchParams(base);
        p.set("visao", v);
        return (
          <a key={v} href={`?${p.toString()}`}
            className={v === atual ? "rounded-full bg-superficie-3 px-4 py-2 text-[13.5px] font-medium text-texto" : "rounded-full px-4 py-2 text-[13.5px] text-texto-3 transition hover:text-texto"}>
            {v}
          </a>
        );
      })}
    </nav>
  );
}

export function Aviso({ children, tom = "laranja" }: { children: React.ReactNode; tom?: "laranja" | "azul" }) {
  return (
    <div className="flex gap-3 rounded-cartao border border-borda bg-superficie-2 px-4 py-3 text-[13.5px] text-texto-2">
      <span className="mt-1.5 size-2 shrink-0 rounded-full" style={{ background: tom === "azul" ? "var(--serie-1)" : "var(--st-serio)" }} />
      <div>{children}</div>
    </div>
  );
}

export function SemDados({ base }: { base: string }) {
  return <Aviso>A base <b>{base}</b> ainda não está no repositório de dados. Envie o export em <a href="/dados" className="font-medium underline">Fontes de dados</a>.</Aviso>;
}
