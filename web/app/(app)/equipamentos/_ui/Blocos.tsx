import clsx from "clsx";
import { AlertTriangle, ChevronLeft, ChevronRight, CircleCheck, CircleX, Download } from "lucide-react";
import Link from "next/link";

import { hrefCom, type Params } from "./url";

/**
 * Peças de tela (servidor) das abas Equipamentos e Saúde: número com explicação, tabela com linha clicável e
 * paginação por endereço, faixa de saúde (cor + ícone + rótulo) e abas internas por parâmetro.
 */

const n0 = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 });
export const inteiroBr = (v: number | null | undefined) => (v == null || Number.isNaN(v) ? "—" : n0.format(v));

/** Número grande com rótulo, detalhe e a explicação (fórmula) na dica — o cartão dos KPIs destas telas. */
export function Numero({ rotulo, valor, detalhe, dica, tom }: { rotulo: string; valor: string; detalhe?: React.ReactNode; dica?: string;
  tom?: "critico" | "atencao" | "bom" }) {
  const I = tom === "critico" ? CircleX : tom === "atencao" ? AlertTriangle : tom === "bom" ? CircleCheck : null;
  return (
    <div className="rounded-cartao border border-borda bg-superficie p-4 transition hover:border-borda-forte" title={dica}>
      <div className="flex items-start justify-between gap-2">
        <div className={clsx("text-[13px] font-medium leading-snug text-texto-2", dica && "cursor-help underline decoration-borda-forte decoration-dotted underline-offset-4")}>{rotulo}</div>
        {I && <I className="size-4 shrink-0" style={{ color: `var(--st-${tom === "atencao" ? "atencao" : tom})` }} strokeWidth={2} />}
      </div>
      <div className="num mt-2 font-display text-[28px] font-medium leading-none tracking-[-0.02em]">{valor}</div>
      {detalhe && <div className="mt-2 text-[12px] leading-snug text-texto-3">{detalhe}</div>}
    </div>
  );
}

export function GradeNumeros({ children, colunas = 4 }: { children: React.ReactNode; colunas?: 3 | 4 | 5 | 6 }) {
  return (
    <div className={clsx("grid grid-cols-2 gap-3", colunas === 3 ? "lg:grid-cols-3" : colunas === 5 ? "md:grid-cols-3 lg:grid-cols-5"
      : colunas === 6 ? "md:grid-cols-3 xl:grid-cols-6" : "lg:grid-cols-4")}>
      {children}
    </div>
  );
}

// ----------------------------------------------------------------------------
// Faixa de saúde: sempre cor + ícone + rótulo
// ----------------------------------------------------------------------------
const FAIXA_COR: Record<string, string> = { "Boa": "st-bom", "Atenção": "st-atencao", "Crítica": "st-critico" };
const FAIXA_ICONE = { "Boa": CircleCheck, "Atenção": AlertTriangle, "Crítica": CircleX } as const;

export function SeloFaixa({ faixa }: { faixa: string }) {
  const I = FAIXA_ICONE[faixa as keyof typeof FAIXA_ICONE];
  if (!I) return <span className="text-texto-3">—</span>;
  return (
    <span className="inline-flex items-center gap-1 whitespace-nowrap text-[12px] font-medium text-texto-2">
      <I className="size-3.5" style={{ color: `var(--${FAIXA_COR[faixa]})` }} strokeWidth={2} />{faixa}
    </span>
  );
}

/** Índice 0–100 com a barrinha na cor da faixa. */
export function BarraSaude({ valor, faixa }: { valor: number | null; faixa: string }) {
  if (valor == null) return <span className="text-texto-3">—</span>;
  return (
    <span className="inline-flex items-center gap-2" title={`Saúde ${valor} · ${faixa}`}>
      <span className="num w-7 text-right font-medium tabular-nums">{valor}</span>
      <span className="h-1.5 w-16 overflow-hidden rounded-full bg-superficie-3">
        <span className="block h-full rounded-full" style={{ width: `${Math.max(2, Math.min(100, valor))}%`, background: `var(--${FAIXA_COR[faixa] ?? "texto-4"})` }} />
      </span>
    </span>
  );
}

// ----------------------------------------------------------------------------
// Tabela com linha clicável (link no código) e rolagem dentro do cartão
// ----------------------------------------------------------------------------
interface ColunaT { rotulo: string; dir?: boolean; dica?: string; larga?: boolean }
export interface LinhaT { chave: string; href?: string; ativa?: boolean; celulas: React.ReactNode[] }

export function TabelaT({ colunas, linhas, vazio = "Nada para mostrar com estes filtros.", alta }: {
  colunas: ColunaT[]; linhas: LinhaT[]; vazio?: string; alta?: boolean;
}) {
  return (
    <div className={clsx("overflow-auto rounded-cartao border border-borda bg-superficie", alta && "max-h-[640px]")}>
      <table className="w-full min-w-max text-left text-[13px]">
        <thead className="sticky top-0 z-[1] bg-superficie-2 text-[12px] text-texto-3">
          <tr>{colunas.map((c) => (
            <th key={c.rotulo} title={c.dica} className={clsx("px-3 py-2.5 font-medium", c.dir && "text-right", c.dica && "cursor-help")}>{c.rotulo}</th>
          ))}</tr>
        </thead>
        <tbody className="divide-y divide-borda">
          {linhas.map((l) => (
            <tr key={l.chave} className={clsx("transition", l.ativa ? "bg-marca-500/8" : "hover:bg-superficie-2")}>
              {l.celulas.map((v, j) => (
                <td key={j} className={clsx("px-3 py-2 align-middle", colunas[j]?.dir && "num text-right tabular-nums", colunas[j]?.larga && "min-w-[220px] max-w-[360px] whitespace-normal")}>
                  {j === 0 && l.href ? <Link prefetch={false} href={l.href} scroll={l.href.startsWith("/")} className="font-mono text-[12.5px] font-medium text-alp-azul underline-offset-2 hover:underline">{v}</Link> : v}
                </td>
              ))}
            </tr>
          ))}
          {!linhas.length && <tr><td colSpan={colunas.length} className="px-3 py-6 text-center text-texto-3">{vazio}</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

export function Paginacao({ params, pag, paginas, total, inicio, mostrados, rotulo = "itens", baixar }: {
  params: Params; pag: number; paginas: number; total: number; inicio: number; mostrados: number; rotulo?: string; baixar?: string;
}) {
  const btn = "inline-flex h-9 items-center gap-1 rounded-lg border border-borda bg-superficie px-3 text-[13px] transition hover:bg-superficie-2";
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 text-[12.5px] text-texto-3">
      <span>{total ? `${inteiroBr(inicio + 1)}–${inteiroBr(inicio + mostrados)} de ${inteiroBr(total)} ${rotulo}` : `0 ${rotulo}`}</span>
      <div className="flex items-center gap-2">
        {baixar && (
          <a href={baixar} className={btn} download><Download className="size-3.5" /> Baixar (Excel)</a>
        )}
        {paginas > 1 && (
          <>
            {pag > 1 ? <Link prefetch={false} scroll={false} href={hrefCom(params, { pag: pag - 1 })} className={btn} aria-label="Página anterior"><ChevronLeft className="size-4" /></Link>
              : <span className={clsx(btn, "opacity-40")}><ChevronLeft className="size-4" /></span>}
            <span className="num">{pag} / {paginas}</span>
            {pag < paginas ? <Link prefetch={false} scroll={false} href={hrefCom(params, { pag: pag + 1 })} className={btn} aria-label="Próxima página"><ChevronRight className="size-4" /></Link>
              : <span className={clsx(btn, "opacity-40")}><ChevronRight className="size-4" /></span>}
          </>
        )}
      </div>
    </div>
  );
}

/** Abas internas por parâmetro do endereço (como AbasVisao, para um segundo nível). */
export function AbasParam({ params, param, abas, atual, ancora }: { params: Params; param: string; abas: { id: string; rotulo: string; icone?: React.ReactNode }[];
  atual: string; ancora?: string }) {
  return (
    <nav className="flex flex-wrap gap-1 border-b border-borda">
      {abas.map((a) => (
        <Link prefetch={false} key={a.id} scroll={false} href={hrefCom(params, { [param]: a.id, pag: null }, ancora)}
          className={clsx("-mb-px inline-flex items-center gap-1.5 border-b-2 px-3 py-2.5 text-[13.5px] transition",
            a.id === atual ? "border-texto font-medium text-texto" : "border-transparent text-texto-3 hover:text-texto")}>
          {a.icone}{a.rotulo}
        </Link>
      ))}
    </nav>
  );
}

export function Cartao({ titulo, sub, children, acoes, className }: { titulo?: React.ReactNode; sub?: React.ReactNode; children: React.ReactNode;
  acoes?: React.ReactNode; className?: string }) {
  return (
    <div className={clsx("rounded-cartao border border-borda bg-superficie p-5", className)}>
      {(titulo || acoes) && (
        <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            {titulo && <div className="font-display text-[15px] font-medium">{titulo}</div>}
            {sub && <div className="mt-0.5 text-[12.5px] text-texto-3">{sub}</div>}
          </div>
          {acoes}
        </div>
      )}
      {children}
    </div>
  );
}
