"use client";

import { useVirtualizer } from "@tanstack/react-virtual";
import clsx from "clsx";
import { Download } from "lucide-react";
import Link from "next/link";
import { useRef } from "react";

/**
 * Tabela longa com rolagem virtual (só as linhas visíveis vão para o DOM) e "Baixar CSV" — para listas de algumas
 * centenas a ~5 mil linhas já recortadas no servidor. Colunas largas rolam dentro do cartão (nunca a página).
 */
export type Celula = string | number | null | { t: string; cor?: string; fundo?: string; dica?: string; forte?: boolean };
export interface Coluna { titulo: string; largura?: number; flex?: boolean; num?: boolean; centro?: boolean; dica?: string; fixa?: boolean }

const texto = (c: Celula) => (c == null ? "" : typeof c === "object" ? c.t : typeof c === "number" ? c.toLocaleString("pt-BR") : c);

export function baixarCsv(nome: string, colunas: string[], linhas: Celula[][]) {
  const esc = (v: string) => `"${v.replaceAll('"', '""')}"`;
  const corpo = linhas.map((l) => l.map((c) => esc(typeof c === "number" ? String(c).replace(".", ",") : texto(c))).join(";"));
  const blob = new Blob(["﻿" + [colunas.map(esc).join(";"), ...corpo].join("\r\n")], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = nome.endsWith(".csv") ? nome : `${nome}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}

export function BotaoCsv({ nome, colunas, linhas, rotulo = "Baixar CSV" }: { nome: string; colunas: string[]; linhas: Celula[][]; rotulo?: string }) {
  return (
    <button onClick={() => baixarCsv(nome, colunas, linhas)} disabled={!linhas.length}
      className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-borda px-2.5 text-[12.5px] text-texto-2 transition hover:bg-superficie-2 hover:text-texto disabled:opacity-50">
      <Download className="size-3.5" /> {rotulo}
    </button>
  );
}

export function TabelaLonga({ colunas, linhas, links, altura = 520, csv, vazio = "Nada para mostrar.", rodape }: {
  colunas: Coluna[]; linhas: Celula[][]; links?: (string | null)[]; altura?: number; csv?: string; vazio?: string; rodape?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const ALT = 36;
  const v = useVirtualizer({ count: linhas.length, getScrollElement: () => ref.current, estimateSize: () => ALT, overscan: 12 });
  const modelo = colunas.map((c) => (c.flex ? `minmax(${c.largura ?? 160}px, 1fr)` : `${c.largura ?? 110}px`)).join(" ");
  const minimo = colunas.reduce((s, c) => s + (c.largura ?? (c.flex ? 160 : 110)), 0);
  const fixa = (j: number) => colunas[j].fixa ? "sticky left-0 z-[1] bg-inherit" : "";
  return (
    <div className="space-y-2">
      {(csv || rodape) && (
        <div className="flex flex-wrap items-center justify-between gap-2 text-[12.5px] text-texto-3">
          <span>{rodape ?? `${linhas.length.toLocaleString("pt-BR")} linha(s)`}</span>
          {csv && <BotaoCsv nome={csv} colunas={colunas.map((c) => c.titulo)} linhas={linhas} />}
        </div>
      )}
      <div ref={ref} className="overflow-auto rounded-xl border border-borda" style={{ maxHeight: altura }}>
        <div style={{ minWidth: minimo }}>
          <div className="sticky top-0 z-[2] grid border-b border-borda bg-superficie-2 text-[11.5px] font-medium text-texto-3"
            style={{ gridTemplateColumns: modelo }}>
            {colunas.map((c, j) => (
              <div key={c.titulo + j} title={c.dica} className={clsx("truncate px-3 py-2", (c.num || c.centro) && "text-right", c.centro && "text-center", fixa(j))}>{c.titulo}</div>
            ))}
          </div>
          {!linhas.length && <div className="px-4 py-6 text-[13px] text-texto-3">{vazio}</div>}
          <div className="relative" style={{ height: v.getTotalSize() }}>
            {v.getVirtualItems().map((r) => {
              const l = linhas[r.index];
              const href = links?.[r.index];
              const conteudo = l.map((c, j) => {
                const o = c != null && typeof c === "object" ? c : null;
                const t = texto(c);
                return (
                  <div key={j} title={o?.dica ?? (t.length > 18 ? t : undefined)}
                    className={clsx("flex items-center truncate px-3 text-[12.5px]", colunas[j]?.num && "num justify-end tabular-nums",
                      colunas[j]?.centro && "justify-center", o?.forte && "font-medium", fixa(j))}>
                    {o?.fundo ? (
                      <span className="inline-flex min-w-7 items-center justify-center rounded-md px-1.5 py-0.5 text-[11.5px] font-medium"
                        style={{ background: o.fundo, color: o.cor }}>{t}</span>
                    ) : <span className="truncate" style={o?.cor ? { color: o.cor } : undefined}>{t}</span>}
                  </div>
                );
              });
              const cls = clsx("absolute inset-x-0 grid border-b border-borda bg-superficie", href && "transition hover:bg-superficie-2");
              const estilo = { gridTemplateColumns: modelo, height: ALT, transform: `translateY(${r.start}px)` };
              return href ? <Link key={r.key} href={href} scroll={false} className={cls} style={estilo}>{conteudo}</Link>
                : <div key={r.key} className={cls} style={estilo}>{conteudo}</div>;
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
