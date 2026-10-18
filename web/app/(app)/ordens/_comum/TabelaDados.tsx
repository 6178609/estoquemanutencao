import clsx from "clsx";
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";

import { brl, inteiro } from "@/lib/formato";
import { dataBr } from "@/lib/wcm/util";
import { href, type Params } from "./url";

/**
 * Tabela renderizada no servidor: só a página atual vai ao navegador. Cabeçalho clicável ordena (?ord=&dir=),
 * rodapé pagina (?pag=), a linha pode abrir um detalhe (link). Larga demais → rola dentro do cartão.
 * No celular (< md) cada linha vira um cartão: `cartao` desenha o conteúdo; sem ele, a 1ª coluna é o título e as
 * colunas marcadas `celular` aparecem como "rótulo: valor". O cartão inteiro é o mesmo link da linha.
 */
export type TipoColuna = "texto" | "longo" | "data" | "R$" | "int" | "num1" | "bool" | "codigo";
export interface Coluna { chave: string; rotulo: string; tipo?: TipoColuna; celular?: boolean; dica?: string }
export type Celula = string | number | boolean | null | undefined;
export type Linha = Record<string, Celula>;

const n1 = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

export function formatarCelula(v: Celula, tipo: TipoColuna = "texto"): string {
  if (v == null || v === "" || (typeof v === "number" && Number.isNaN(v))) return tipo === "bool" ? "" : "—";
  switch (tipo) {
    case "data": return typeof v === "number" ? dataBr(v) : String(v);
    case "R$": return brl(Number(v));
    case "int": return inteiro(Number(v));
    case "num1": return n1.format(Number(v));
    case "bool": return v ? "Sim" : "";
    default: return String(v);
  }
}

const NUMERICOS = new Set<TipoColuna>(["R$", "int", "num1"]);

export function TabelaDados({ colunas, linhas, params, ord, desc, pagina, paginas, total, hrefLinha, ativa, vazio = "Nada no filtro.",
  rotulo = "registros", porPagina = 50, ordenavel = true, alturaMax, cartao }: {
  colunas: Coluna[]; linhas: Linha[]; params: Params; ord?: string; desc?: boolean; pagina: number; paginas: number; total: number;
  hrefLinha?: (l: Linha) => string | undefined; ativa?: (l: Linha) => boolean; vazio?: string; rotulo?: string; porPagina?: number;
  ordenavel?: boolean; alturaMax?: boolean; cartao?: (l: Linha) => React.ReactNode;
}) {
  const ini = total ? (pagina - 1) * porPagina + 1 : 0, fim = Math.min(total, pagina * porPagina);
  return (
    <div className="overflow-hidden rounded-cartao border border-borda bg-superficie">
      <ul className={clsx("divide-y divide-borda md:hidden", alturaMax && "max-h-[640px] overflow-y-auto")}>
        {linhas.map((l, i) => {
          const h = hrefLinha?.(l);
          const corpo = (
            <div className="flex min-h-11 items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">{cartao ? cartao(l) : <CartaoPadrao l={l} colunas={colunas} />}</div>
              {h && <ChevronRight className="size-4 shrink-0 text-texto-4" aria-hidden />}
            </div>
          );
          return (
            <li key={i} className={clsx(ativa?.(l) && "bg-marca-500/8")}>
              {h ? <Link prefetch={false} scroll={false} href={h} aria-current={ativa?.(l) ? "true" : undefined} className="block transition active:bg-superficie-2">{corpo}</Link> : corpo}
            </li>
          );
        })}
        {!linhas.length && <li className="px-4 py-8 text-center text-[13px] text-texto-3">{vazio}</li>}
      </ul>
      <div className={clsx("hidden overflow-x-auto md:block", alturaMax && "max-h-[640px] overflow-y-auto")}>
        <table className="w-full text-left text-[12.5px]">
          <thead className="sticky top-0 z-[1] border-b border-borda bg-superficie-2 text-[11.5px] text-texto-3">
            <tr>
              {colunas.map((c) => {
                const atual = ord === c.chave;
                const cls = clsx("whitespace-nowrap px-3 py-2 font-medium", NUMERICOS.has(c.tipo ?? "texto") && "text-right");
                if (!ordenavel) return <th key={c.chave} className={cls} title={c.dica}>{c.rotulo}</th>;
                return (
                  <th key={c.chave} className={cls} title={c.dica} aria-sort={atual ? (desc ? "descending" : "ascending") : undefined}>
                    <Link prefetch={false} scroll={false} href={href(params, { ord: c.chave, dir: atual && !desc ? "desc" : "asc", pag: null })}
                      className={clsx("inline-flex items-center gap-1 transition hover:text-texto", atual && "text-texto")}>
                      {c.rotulo}
                      {atual && (desc ? <ArrowDown className="size-3" /> : <ArrowUp className="size-3" />)}
                    </Link>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody className="divide-y divide-borda">
            {linhas.map((l, i) => {
              const h = hrefLinha?.(l);
              return (
                <tr key={i} className={clsx("transition", h && "hover:bg-superficie-2", ativa?.(l) && "bg-marca-500/8")}>
                  {colunas.map((c, j) => {
                    const t = c.tipo ?? "texto";
                    const txt = formatarCelula(l[c.chave], t);
                    const cls = clsx("px-3 py-2 align-top",
                      NUMERICOS.has(t) && "num whitespace-nowrap text-right tabular-nums",
                      t === "data" && "whitespace-nowrap tabular-nums",
                      t === "codigo" && "num whitespace-nowrap font-mono text-[12px]",
                      t === "longo" ? "min-w-[240px] max-w-[420px]" : t === "texto" && "max-w-[260px]");
                    const conteudo = t === "bool" && l[c.chave] ? <span className="text-texto-2">✓</span>
                      : <span className={clsx(t === "texto" && "line-clamp-2", t === "longo" && "line-clamp-3")}>{txt}</span>;
                    return (
                      <td key={c.chave} className={cls}>
                        {h ? <Link prefetch={false} scroll={false} href={h} tabIndex={j === 0 ? undefined : -1}
                          className={clsx("block", j === 0 && "font-medium text-alp-azul")}>{conteudo}</Link> : conteudo}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
            {!linhas.length && <tr><td colSpan={colunas.length} className="px-3 py-8 text-center text-[13px] text-texto-3">{vazio}</td></tr>}
          </tbody>
        </table>
      </div>
      {total > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-borda px-3 py-2 text-[12.5px] text-texto-3">
          <span className="num">{inteiro(ini)}–{inteiro(fim)} de {inteiro(total)} {rotulo}</span>
          {paginas > 1 && <Paginacao params={params} pagina={pagina} paginas={paginas} />}
        </div>
      )}
    </div>
  );
}

/** Cartão de celular sem desenho próprio: 1ª coluna em destaque e as colunas `celular` (ou as 4 primeiras) embaixo. */
function CartaoPadrao({ l, colunas }: { l: Linha; colunas: Coluna[] }) {
  const [primeira, ...resto] = colunas;
  const marcadas = resto.filter((c) => c.celular);
  const extras = (marcadas.length ? marcadas : resto.slice(0, 4)).filter((c) => formatarCelula(l[c.chave], c.tipo) !== "—");
  return (
    <>
      <div className="line-clamp-2 text-[14px] font-medium text-texto">{formatarCelula(l[primeira.chave], primeira.tipo)}</div>
      {extras.length > 0 && (
        <dl className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[12.5px] text-texto-3">
          {extras.map((c) => (
            <div key={c.chave} className="flex min-w-0 gap-1">
              <dt>{c.rotulo}:</dt>
              <dd className={clsx("min-w-0 text-texto-2", c.tipo === "longo" ? "line-clamp-2" : "truncate")}>{c.tipo === "bool" ? (l[c.chave] ? "Sim" : "Não") : formatarCelula(l[c.chave], c.tipo)}</dd>
            </div>
          ))}
        </dl>
      )}
    </>
  );
}

export function Paginacao({ params, pagina, paginas, chave = "pag" }: { params: Params; pagina: number; paginas: number; chave?: string }) {
  const nums = [...new Set([1, pagina - 1, pagina, pagina + 1, paginas])].filter((p) => p >= 1 && p <= paginas).sort((a, b) => a - b);
  const btn = "grid h-8 min-w-8 place-items-center rounded-lg px-2 transition hover:bg-superficie-2 hover:text-texto";
  return (
    <nav className="flex items-center gap-0.5" aria-label="Páginas">
      {pagina > 1 ? <Link prefetch={false} scroll={false} href={href(params, { [chave]: pagina - 1 })} className={btn} aria-label="Página anterior"><ChevronLeft className="size-4" /></Link>
        : <span className={clsx(btn, "opacity-40")}><ChevronLeft className="size-4" /></span>}
      {nums.map((p, i) => (
        <span key={p} className="flex items-center">
          {i > 0 && p - nums[i - 1] > 1 && <span className="px-1">…</span>}
          <Link prefetch={false} scroll={false} href={href(params, { [chave]: p })} aria-current={p === pagina ? "page" : undefined}
            className={clsx(btn, "num", p === pagina && "bg-superficie-3 font-medium text-texto")}>{inteiro(p)}</Link>
        </span>
      ))}
      {pagina < paginas ? <Link prefetch={false} scroll={false} href={href(params, { [chave]: pagina + 1 })} className={btn} aria-label="Próxima página"><ChevronRight className="size-4" /></Link>
        : <span className={clsx(btn, "opacity-40")}><ChevronRight className="size-4" /></span>}
    </nav>
  );
}
