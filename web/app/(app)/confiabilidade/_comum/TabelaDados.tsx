"use client";

import clsx from "clsx";
import { ArrowDown, ArrowUp, Download } from "lucide-react";
import { useDeferredValue, useMemo, useState } from "react";

import { CampoBusca } from "@/components/Filtros";
import { casaBusca, normalizarBusca } from "@/lib/dados/texto";
import { brl } from "@/lib/formato";
import { dataBr } from "@/lib/wcm/util";

/**
 * Tabela de dados das abas Confiabilidade / Custos / Mão de obra: ordena pelo cabeçalho, busca (todos os termos),
 * coluna com barra de progresso (magnitude), baixa CSV (abre no Excel) e rola dentro do cartão (a página não rola
 * de lado). Mostra no máximo `limite` linhas — a busca e a ordenação valem para todas.
 * Valores chegam crus (número/Dia/texto) e são formatados aqui: o servidor não passa funções.
 */
export type FormatoCol = "texto" | "inteiro" | "num1" | "R$" | "data" | "%" | "h" | "dias" | "sem" | "codigo";
export interface Coluna { rotulo: string; formato?: FormatoCol; barra?: number; largo?: boolean; dica?: string }
export type Celula = string | number | null;

const n0 = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 });
const n1 = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

export function formatarCelula(v: Celula, f: FormatoCol = "texto"): string {
  if (v == null || v === "" || (typeof v === "number" && Number.isNaN(v))) return f === "texto" || f === "codigo" ? "" : "—";
  if (typeof v === "string") return v;
  switch (f) {
    case "inteiro": return n0.format(v);
    case "num1": return n1.format(v);
    case "R$": return brl(v);
    case "data": return dataBr(v);
    case "%": return `${n0.format(v)}%`;
    case "h": return `${n1.format(v)} h`;
    case "dias": return `${n0.format(v)} d`;
    case "sem": return `${n1.format(v)} sem`;
    default: return String(v);
  }
}

const numerica = (f?: FormatoCol) => !!f && f !== "texto" && f !== "codigo";

function baixarCsv(nome: string, colunas: Coluna[], linhas: Celula[][]) {
  const esc = (v: unknown) => `"${String(v ?? "").replaceAll('"', '""')}"`;
  const cel = (v: Celula, f?: FormatoCol) => (v == null ? "" : typeof v === "number"
    ? f === "data" ? dataBr(v) : String(Math.round(v * 100) / 100).replace(".", ",") : v);
  const txt = [colunas.map((c) => esc(c.rotulo)).join(";"), ...linhas.map((l) => l.map((v, j) => esc(cel(v, colunas[j]?.formato))).join(";"))];
  const blob = new Blob(["﻿" + txt.join("\r\n")], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${nome}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}

export function TabelaDados({ colunas, linhas, busca, baixar, limite = 400, alturaMax = 460, ordemInicial, aoSelecionar, selecionada,
  vazio = "Nada a mostrar.", rodape, filtroExterno }: {
  colunas: Coluna[]; linhas: Celula[][]; busca?: string; baixar?: string; limite?: number; alturaMax?: number;
  ordemInicial?: { coluna: number; desc: boolean }; aoSelecionar?: (linha: Celula[]) => void; selecionada?: Celula;
  vazio?: string; rodape?: React.ReactNode; filtroExterno?: React.ReactNode;
}) {
  const [texto, setTexto] = useState("");
  const adiado = useDeferredValue(texto);
  const [ordem, setOrdem] = useState<{ coluna: number; desc: boolean } | null>(ordemInicial ?? null);
  const indice = useMemo(() => linhas.map((l) => normalizarBusca(l.map((v, j) => (colunas[j]?.formato === "texto" || colunas[j]?.formato === "codigo"
    || !colunas[j]?.formato ? v ?? "" : "")).join(" "))), [linhas, colunas]);
  const vis = useMemo(() => {
    const r = linhas.filter((_, i) => !adiado || casaBusca(indice[i], adiado));
    if (ordem) {
      const { coluna: j, desc } = ordem;
      r.sort((a, b) => {
        const x = a[j], y = b[j];
        if (x == null || x === "") return y == null || y === "" ? 0 : 1;
        if (y == null || y === "") return -1;
        const c = typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y), "pt-BR", { numeric: true });
        return desc ? -c : c;
      });
    }
    return r;
  }, [linhas, indice, adiado, ordem]);
  const mostradas = vis.slice(0, limite);
  return (
    <div className="space-y-3">
      {(busca || baixar || filtroExterno) && (
        <div className="flex flex-wrap items-center gap-2">
          {busca && <div className="min-w-[220px] flex-1"><CampoBusca valor={texto} aoMudar={setTexto} placeholder={busca} /></div>}
          {filtroExterno}
          {baixar && (
            <button onClick={() => baixarCsv(baixar, colunas, vis)} title="Baixar as linhas filtradas (CSV, abre no Excel)"
              className="inline-flex h-11 items-center gap-2 rounded-xl border border-borda bg-superficie px-3.5 text-[13.5px] font-medium text-texto-2 transition hover:bg-superficie-2 hover:text-texto">
              <Download className="size-4" /> Baixar
            </button>
          )}
        </div>
      )}
      <div className="overflow-auto rounded-xl border border-borda" style={{ maxHeight: alturaMax }}>
        <table className="w-full text-left text-[12.5px]">
          <thead className="sticky top-0 z-[1] bg-superficie-2 text-[11.5px] text-texto-3">
            <tr>
              {colunas.map((c, j) => (
                <th key={c.rotulo} title={c.dica} className={clsx("whitespace-nowrap px-3 py-2 font-medium", numerica(c.formato) && "text-right")}>
                  <button className="inline-flex items-center gap-1 hover:text-texto" onClick={() =>
                    setOrdem(ordem?.coluna === j ? { coluna: j, desc: !ordem.desc } : { coluna: j, desc: numerica(c.formato) })}>
                    {c.rotulo}
                    {ordem?.coluna === j && (ordem.desc ? <ArrowDown className="size-3" /> : <ArrowUp className="size-3" />)}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-borda divide-y">
            {mostradas.map((l, i) => (
              <tr key={i} onClick={aoSelecionar ? () => aoSelecionar(l) : undefined}
                className={clsx(aoSelecionar && "cursor-pointer hover:bg-superficie-2", selecionada != null && l[0] === selecionada && "bg-superficie-3")}>
                {l.map((v, j) => {
                  const c = colunas[j] ?? { rotulo: "" };
                  const t = formatarCelula(v, c.formato);
                  if (c.barra != null && typeof v === "number") {
                    return (
                      <td key={j} className="px-3 py-1.5">
                        <div className="flex min-w-[110px] items-center gap-2">
                          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-superficie-3">
                            <div className="h-full rounded-full bg-[var(--serie-1)]" style={{ width: `${Math.max(0, Math.min(1, v / (c.barra || 1))) * 100}%` }} />
                          </div>
                          <span className="num w-14 shrink-0 text-right tabular-nums">{t}</span>
                        </div>
                      </td>
                    );
                  }
                  return (
                    <td key={j} title={c.largo ? t : undefined}
                      className={clsx("px-3 py-1.5", numerica(c.formato) ? "num whitespace-nowrap text-right tabular-nums" : c.largo ? "min-w-[220px] max-w-[420px] truncate" : "whitespace-nowrap",
                        c.formato === "codigo" && "font-mono text-[12px]")}>
                      {t}
                    </td>
                  );
                })}
              </tr>
            ))}
            {!mostradas.length && <tr><td colSpan={colunas.length} className="px-3 py-6 text-center text-texto-3">{vazio}</td></tr>}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 text-[12px] text-texto-3">
        <span>{vis.length > limite ? `Mostrando ${n0.format(limite)} de ${n0.format(vis.length)} linhas — refine a busca ou baixe tudo.` : `${n0.format(vis.length)} linha(s)`}
          {aoSelecionar && " · clique numa linha para detalhar"}</span>
        {rodape}
      </div>
    </div>
  );
}
