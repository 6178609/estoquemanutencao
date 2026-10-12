import clsx from "clsx";
import { Info, TrendingDown, TrendingUp } from "lucide-react";

import { SeloFarol } from "@/components/Indicador";
import type { Farol } from "@/lib/wcm/indicadores";

/**
 * Peças pequenas das telas de execução, HH, preditiva e AF (servidor): cartão de número, grade de cartões,
 * alternância por endereço (?param=) e nota de rodapé. Mesma linguagem do CartaoKpi do Painel.
 */

/** Cartão de um número: rótulo (fórmula na dica), valor, complemento e variação/farol opcionais. */
export function Tile({ rotulo, valor, detalhe, dica, variacao, farol }: {
  rotulo: string; valor: string; detalhe?: React.ReactNode; dica?: string;
  variacao?: { texto: string; melhorou: boolean | null; subiu: boolean } | null; farol?: Farol;
}) {
  return (
    <div className="flex flex-col justify-between rounded-cartao border border-borda bg-superficie p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="inline-flex items-center gap-1 text-[13px] font-medium leading-snug text-texto-2" title={dica}>
          {rotulo}{dica && <Info className="size-3.5 shrink-0 text-texto-4" aria-label={dica} />}
        </div>
        {farol && farol !== "neutro" && <SeloFarol farol={farol} compacto />}
      </div>
      <div className="num mt-2 font-display text-[26px] font-medium leading-none tracking-[-0.02em]">{valor}</div>
      {(detalhe || variacao) && (
        <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[12px] text-texto-3">
          {variacao && (
            <span title="vs período anterior de mesma duração" className={clsx("inline-flex items-center gap-0.5 font-medium",
              variacao.melhorou == null ? "text-texto-3" : variacao.melhorou ? "text-[var(--st-bom)]" : "text-[var(--st-critico)]")}>
              {variacao.subiu ? <TrendingUp className="size-3.5" /> : <TrendingDown className="size-3.5" />}{variacao.texto}
            </span>
          )}
          {detalhe && <span>{detalhe}</span>}
        </div>
      )}
    </div>
  );
}

export function GradeTiles({ children, colunas = 4 }: { children: React.ReactNode; colunas?: 3 | 4 | 5 }) {
  return (
    <div className={clsx("grid grid-cols-2 gap-3", colunas === 3 ? "lg:grid-cols-3" : colunas === 5 ? "lg:grid-cols-5" : "lg:grid-cols-4")}>
      {children}
    </div>
  );
}

/** Variação em pontos percentuais (ou absoluta) para o Tile. */
export function variacaoPp(atual: number | null | undefined, anterior: number | null | undefined, sentido: 1 | -1 = 1,
  unidade: "p.p." | "" = "p.p."): { texto: string; melhorou: boolean | null; subiu: boolean } | null {
  if (atual == null || anterior == null || Number.isNaN(atual) || Number.isNaN(anterior)) return null;
  const d = atual - anterior;
  if (Math.abs(d) < 1e-9) return { texto: "=", melhorou: null, subiu: true };
  const nf = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: unidade ? 1 : 0 });
  return { texto: `${d > 0 ? "+" : "−"}${nf.format(Math.abs(d))}${unidade ? ` ${unidade}` : ""}`, melhorou: d > 0 === sentido > 0, subiu: d > 0 };
}

/** Alternância por endereço (?param=valor), mantendo os outros parâmetros. */
export function Opcoes({ param, opcoes, atual, params, rotulo }: { param: string; opcoes: { valor: string; rotulo?: string }[]; atual: string;
  params: Record<string, string | string[] | undefined>; rotulo?: string }) {
  const base = new URLSearchParams(Object.entries(params).flatMap(([k, v]) => (k === param || v == null ? [] : (Array.isArray(v) ? v : [v]).map((x) => [k, x]))));
  return (
    <nav className="flex flex-wrap items-center gap-1" aria-label={rotulo}>
      {rotulo && <span className="mr-1 text-[12.5px] text-texto-3">{rotulo}</span>}
      {opcoes.map((o) => {
        const p = new URLSearchParams(base);
        p.set(param, o.valor);
        return (
          <a key={o.valor} href={`?${p.toString()}`} aria-current={o.valor === atual ? "true" : undefined}
            className={o.valor === atual ? "rounded-full bg-superficie-3 px-3 py-1.5 text-[13px] font-medium text-texto"
              : "rounded-full px-3 py-1.5 text-[13px] text-texto-3 transition hover:text-texto"}>
            {o.rotulo ?? o.valor}
          </a>
        );
      })}
    </nav>
  );
}

export function Nota({ children }: { children: React.ReactNode }) {
  return <p className="max-w-4xl text-[12.5px] leading-relaxed text-texto-3">{children}</p>;
}

/** Cartão simples com título (para tabelas e listas que não são gráficos). */
export function Quadro({ titulo, subtitulo, acoes, children, id }: { titulo: string; subtitulo?: React.ReactNode; acoes?: React.ReactNode;
  children: React.ReactNode; id?: string }) {
  return (
    <div id={id} className="scroll-mt-28 rounded-cartao border border-borda bg-superficie p-5">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="font-display text-[15px] font-medium">{titulo}</div>
          {subtitulo && <div className="mt-0.5 text-[12.5px] text-texto-3">{subtitulo}</div>}
        </div>
        {acoes}
      </div>
      {children}
    </div>
  );
}

/** Lista de pares campo → valor (fichas de detalhe). */
export function Campos({ itens }: { itens: [string, React.ReactNode][] }) {
  return (
    <dl className="grid gap-x-6 gap-y-2.5 text-[13px] sm:grid-cols-2">
      {itens.map(([k, v]) => (
        <div key={k} className="min-w-0">
          <dt className="text-[11.5px] text-texto-3">{k}</dt>
          <dd className="break-words text-texto">{v === "" || v == null ? "—" : v}</dd>
        </div>
      ))}
    </dl>
  );
}
