"use client";

import { useVirtualizer } from "@tanstack/react-virtual";
import clsx from "clsx";
import { Download } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import * as planos from "@/lib/wcm/planos";

import { baixarCsv, type Celula } from "./_comum/TabelaLonga";
import { estiloCelula } from "./cores";

/**
 * Calendário semanal dos planos: uma linha por plano, uma coluna por semana; a cor é a pior situação da semana e o
 * número, quantas chamadas caíram nela. Rolagem virtual nas linhas (só as visíveis vão para o DOM) e horizontal
 * dentro do cartão; a coluna do plano fica fixa. Clicar na linha abre o plano (?plano=).
 */
export interface LinhaGrade {
  /** chave do plano */ k: string; /** descrição */ d: string; /** atrasadas no período */ a: number;
  /** equipamento */ e: string; /** centro */ ct: string; /** ciclo */ ci: string; /** chamadas no período */ n: number;
  /** células com chamada: [coluna, índice da situação em SITUACOES, chamadas, datas, ordens] */
  c: [number, number, number, string, string][];
}

const ALT = 26;

export function GradePlanos({ semanas, periodos, meses, atual, linhas, hrefBase, selecionado, csv }: {
  semanas: string[]; periodos: string[]; meses: [number, string][]; atual: number | null; linhas: LinhaGrade[];
  hrefBase: string; selecionado?: string; csv: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const v = useVirtualizer({ count: linhas.length, getScrollElement: () => ref.current, estimateSize: () => ALT, overscan: 14 });
  const [larguraCaixa, setLarguraCaixa] = useState(0);
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([e]) => setLarguraCaixa(e.contentRect.width));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  // a semana ocupa o espaço que sobra (entre 20 e 44 px); com muitas semanas, rola dentro do cartão
  const rotulo = larguraCaixa >= 640 ? 300 : 150;
  const COL = Math.max(20, Math.min(44, Math.floor((larguraCaixa - rotulo - 8) / Math.max(semanas.length, 1)) || 20));
  const CEL = COL - 3, H = Math.min(CEL, 20);
  const largura = semanas.length * COL;
  const href = (k: string) => `${hrefBase}${hrefBase === "?" ? "" : "&"}plano=${encodeURIComponent(k)}`;
  

  const colunasCsv = ["Plano", "Descrição", "Atrasadas", ...semanas, "Equipamento", "Centro", "Ciclo", "Chamadas"];
  const linhasCsv = (): Celula[][] => linhas.map((l) => {
    const sem: string[] = semanas.map(() => "");
    for (const [j, s, n] of l.c) sem[j] = planos.SIMBOLO[planos.SITUACOES[s]] + (n > 1 ? String(n) : "");
    return [l.k, l.d, l.a, ...sem, l.e, l.ct, l.ci, l.n];
  });

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2 text-[12.5px] text-texto-3">
        <span>{linhas.length.toLocaleString("pt-BR")} plano(s) · {semanas.length} semana(s) · clique numa linha para abrir o plano</span>
        <BotaoCsvPreguicoso nome={csv} colunas={colunasCsv} gerar={linhasCsv} />
      </div>
      <div ref={ref} className="overflow-auto rounded-xl border border-borda" style={{ maxHeight: 640 }}>
        <div className="relative" style={{ minWidth: largura + rotulo }}>
          {/* cabeçalho: meses e semanas */}
          <div className="sticky top-0 z-[3] flex border-b border-borda bg-superficie-2">
            <div className="sticky left-0 z-[1] flex shrink-0 items-end bg-superficie-2 px-3 pb-1.5 text-[11.5px] font-medium text-texto-3" style={{ width: rotulo }}>Plano · descrição</div>
            <div className="relative shrink-0" style={{ width: largura, height: 40 }}>
              {meses.map(([j, m]) => (
                <span key={j} className="absolute top-1.5 whitespace-nowrap border-l border-borda-forte pl-1 text-[11px] font-medium text-texto-2"
                  style={{ left: j * COL }}>{m}</span>
              ))}
              {semanas.map((s, j) => (j % Math.max(1, Math.ceil(26 / COL)) === 0 || j === atual) && (
                <span key={s} title={`${s} · ${periodos[j]}`}
                  className={clsx("absolute bottom-1 text-center text-[9.5px] tabular-nums", j === atual ? "font-semibold text-texto" : "text-texto-3")}
                  style={{ left: j * COL - 6, width: CEL + 12 }}>{s.replace(/^S/, "").replace(/\/\d+$/, "")}</span>
              ))}
            </div>
          </div>
          <div className="relative" style={{ height: v.getTotalSize() }}>
            {atual != null && (
              <div aria-hidden className="pointer-events-none absolute inset-y-0 z-[1] rounded-sm border-x-2 border-dashed"
                style={{ left: rotulo + atual * COL - 2, width: CEL + 4, borderColor: "var(--st-bom)" }} />
            )}
            {v.getVirtualItems().map((r) => {
              const l = linhas[r.index];
              const sel = l.k === selecionado;
              return (
                <Link key={r.key} href={href(l.k)} scroll={false}
                  className={clsx("group absolute inset-x-0 flex items-center border-b border-borda transition hover:bg-superficie-2",
                    sel ? "bg-superficie-3" : "bg-superficie")}
                  style={{ height: ALT, transform: `translateY(${r.start}px)` }}>
                  <div className={clsx("sticky left-0 z-[2] flex h-full shrink-0 items-center gap-1.5 px-3 text-[12px]",
                    sel ? "bg-superficie-3" : "bg-superficie group-hover:bg-superficie-2")} title={`${l.k} · ${l.d}`} style={{ width: rotulo }}>
                    <span className="num shrink-0 font-medium">{l.k}</span>
                    <span className="truncate text-texto-3">{l.d}</span>
                    {l.a > 0 && <span className="ml-auto shrink-0 rounded px-1 text-[10.5px] font-semibold" style={{ background: "color-mix(in srgb, var(--st-critico) 18%, transparent)" }}>!{l.a}</span>}
                  </div>
                  <div className="relative shrink-0" style={{ width: largura, height: H,
                    backgroundImage: `linear-gradient(to right, var(--superficie-2) ${CEL}px, transparent ${CEL}px)`, backgroundSize: `${COL}px 100%` }}>
                    {l.c.map(([j, s, n, datas, ordens]) => {
                      const sit = planos.SITUACOES[s];
                      const e = estiloCelula(sit);
                      return (
                        <span key={j} title={`${l.k} · ${semanas[j]} (${periodos[j]})\n${sit} · ${n} chamada(s)\nDatas: ${datas}\nOrdens: ${ordens}`}
                          className="absolute top-0 grid place-items-center rounded-[4px] border text-[10px] font-semibold leading-none"
                          style={{ left: j * COL, width: CEL, height: H, background: e.background, borderColor: e.border, color: e.color }}>
                          {n > 1 ? n : planos.SIMBOLO[sit]}
                        </span>
                      );
                    })}
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

function BotaoCsvPreguicoso({ nome, colunas, gerar }: { nome: string; colunas: string[]; gerar: () => Celula[][] }) {
  return (
    <button onClick={() => baixarCsv(nome, colunas, gerar())}
      className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-borda px-2.5 text-[12.5px] text-texto-2 transition hover:bg-superficie-2 hover:text-texto">
      <Download className="size-3.5" /> Baixar calendário (CSV)
    </button>
  );
}
