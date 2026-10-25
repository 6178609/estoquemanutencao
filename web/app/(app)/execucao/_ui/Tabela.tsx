"use client";

import { useVirtualizer } from "@tanstack/react-virtual";
import clsx from "clsx";
import { ArrowDown, ArrowUp, ChevronRight, Download } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useDeferredValue, useMemo, useRef, useState } from "react";

import { CampoBusca, MultiEscolha } from "@/components/Filtros";
import { cor as corDe, type Cor } from "@/components/graficos";
import { casaBusca, normalizarBusca } from "@/lib/dados/texto";
import { dataBr } from "@/lib/wcm/util";

/**
 * Tabela das telas de execução, HH, preditiva e AF: busca, filtros por valor (facetas), alternâncias, ordenação pelo
 * cabeçalho, rolagem virtual dentro do cartão (aguenta alguns milhares de linhas), baixar CSV e abrir o detalhe da
 * linha. Tudo serializável: as colunas e as linhas vêm do servidor.
 */
type Celula = string | number | null;
type Linha = Record<string, Celula>;
export type TipoColuna = "texto" | "num" | "data" | "situacao" | "barra" | "pct" | "h" | "R$" | "link" | "codigo";

export interface Coluna {
  id: string;
  rotulo: string;
  tipo?: TipoColuna;
  /** px */
  largura?: number;
  casas?: number;
  dica?: string;
  /** cor da barra (tipo "barra") */
  corBarra?: Cor;
  /** máximo da barra (padrão: o maior valor da coluna) */
  max?: number;
}
interface Faceta { id: string; rotulo: string; lista?: boolean; ordem?: string[] }
interface Alternancia { id: string; rotulo: string; campo: string; padrao: boolean; dica?: string }

const LARGURA: Record<TipoColuna, number> = { texto: 180, num: 92, data: 100, situacao: 180, barra: 150, pct: 86, h: 86, "R$": 120,
  link: 90, codigo: 110 };
const ALTURA_LINHA = 38;
const n = (casas: number) => new Intl.NumberFormat("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas });
const n0 = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 });
const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

function formatarCelula(c: Coluna, v: Celula): string {
  if (v == null || v === "") return "";
  switch (c.tipo) {
    case "data": return typeof v === "number" ? dataBr(v) : String(v);
    case "num": case "barra": return typeof v === "number" ? n(c.casas ?? 0).format(v) : String(v);
    case "pct": return typeof v === "number" ? `${n(c.casas ?? 0).format(v)}%` : String(v);
    case "h": return typeof v === "number" ? `${n(c.casas ?? 1).format(v)} h` : String(v);
    case "R$": return typeof v === "number" ? brl.format(v) : String(v);
    default: return String(v);
  }
}

function comparar(a: Celula, b: Celula): number {
  if (a === b) return 0;
  if (a == null || a === "") return 1;
  if (b == null || b === "") return -1;
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b), "pt-BR", { numeric: true });
}

export function baixarCsv(arquivo: string, colunas: Coluna[], linhas: Linha[]) {
  const esc = (v: unknown) => `"${String(v ?? "").replaceAll('"', '""')}"`;
  const valor = (c: Coluna, v: Celula) => (typeof v === "number" && c.tipo !== "data" ? String(v).replace(".", ",") : formatarCelula(c, v));
  const corpo = [colunas.map((c) => esc(c.rotulo)).join(";"), ...linhas.map((l) => colunas.map((c) => esc(valor(c, l[c.id]))).join(";"))];
  const blob = new Blob(["﻿" + corpo.join("\r\n")], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${arquivo}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}

export function PontoSituacao({ nome, cor }: { nome: string; cor?: Cor }) {
  if (!nome) return null;
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5">
      <span className="size-2 shrink-0 rounded-full" style={{ background: corDe(cor ?? "neutro") }} />
      <span className="truncate">{nome}</span>
    </span>
  );
}

export function Tabela({ colunas, linhas, busca, facetas = [], alternancias = [], cores = {}, arquivo, altura = 520, vazio = "Nada para mostrar.",
  aoAbrir, abrirParam, contagem = "linhas", ordem, resumoPor, extra, buscaInicial = "" }: {
  colunas: Coluna[]; linhas: Linha[]; busca?: { campos: string[]; placeholder: string }; facetas?: Faceta[]; alternancias?: Alternancia[];
  cores?: Record<string, Cor>; arquivo?: string; altura?: number; vazio?: string;
  /** detalhe no navegador (só de outro componente de cliente) */
  aoAbrir?: (l: Linha) => void;
  /** ou detalhe pelo endereço: ?<param>=<linha[campo]> */
  abrirParam?: { param: string; campo: string; ancora?: string };
  contagem?: string; ordem?: { campo: string; desc?: boolean }; resumoPor?: string; extra?: React.ReactNode;
  /** texto inicial da busca (ex.: ?q= vindo da aba Buscar) */
  buscaInicial?: string;
}) {
  const router = useRouter();
  const rota = usePathname();
  const params = useSearchParams();
  const [texto, setTexto] = useState(buscaInicial);
  const textoAdiado = useDeferredValue(texto);
  const [sel, setSel] = useState<Record<string, string[]>>({});
  const [liga, setLiga] = useState<Record<string, boolean>>(() => Object.fromEntries(alternancias.map((a) => [a.id, a.padrao])));
  const [ord, setOrd] = useState<{ campo: string; desc: boolean } | null>(ordem ? { campo: ordem.campo, desc: !!ordem.desc } : null);

  const indice = useMemo(() => (busca ? linhas.map((l) => normalizarBusca(busca.campos.map((c) => l[c] ?? "").join(" "))) : []),
    [linhas, busca]);
  const valoresDe = (l: Linha, f: Faceta) => {
    const v = l[f.id];
    if (v == null || v === "") return [];
    return f.lista ? String(v).split(",").map((x) => x.trim()).filter(Boolean) : [String(v)];
  };
  const opcoes = useMemo(() => facetas.map((f) => {
    const m = new Map<string, number>();
    for (const l of linhas) for (const v of valoresDe(l, f)) m.set(v, (m.get(v) ?? 0) + 1);
    const chaves = f.ordem ? [...f.ordem.filter((v) => m.has(v)), ...[...m.keys()].filter((v) => !f.ordem!.includes(v)).sort()]
      : [...m.keys()].sort((a, b) => a.localeCompare(b, "pt-BR", { numeric: true }));
    return chaves.map((valor) => ({ valor, n: m.get(valor)! }));
  }), [linhas, facetas]);

  const visiveis = useMemo(() => {
    const r: Linha[] = [];
    linhas.forEach((l, i) => {
      for (const a of alternancias) if (liga[a.id] && !l[a.campo]) return;
      for (const f of facetas) {
        const s = sel[f.id];
        if (s?.length && !valoresDe(l, f).some((v) => s.includes(v))) return;
      }
      if (busca && textoAdiado && !casaBusca(indice[i], textoAdiado)) return;
      r.push(l);
    });
    if (ord) r.sort((a, b) => { const x = comparar(a[ord.campo], b[ord.campo]); return ord.desc && a[ord.campo] != null && b[ord.campo] != null ? -x : x; });
    return r;
  }, [linhas, indice, textoAdiado, sel, liga, ord, alternancias, facetas, busca]);

  const maximos = useMemo(() => Object.fromEntries(colunas.filter((c) => c.tipo === "barra").map((c) =>
    [c.id, c.max ?? Math.max(1e-9, ...visiveis.map((l) => (typeof l[c.id] === "number" ? (l[c.id] as number) : 0)))])), [colunas, visiveis]);

  const larguras = colunas.map((c) => c.largura ?? LARGURA[c.tipo ?? "texto"]);
  const clicavel = !!(aoAbrir || abrirParam);
  const grade = `${larguras.map((w) => `${w}px`).join(" ")}${clicavel ? " 28px" : ""}`;
  const total = larguras.reduce((s, w) => s + w, 0) + (clicavel ? 28 : 0);

  const caixa = useRef<HTMLDivElement>(null);
  const virt = useVirtualizer({ count: visiveis.length, getScrollElement: () => caixa.current, estimateSize: () => ALTURA_LINHA, overscan: 12 });
  const alturaCaixa = Math.min(altura, visiveis.length * ALTURA_LINHA + 40);

  function abrir(l: Linha) {
    if (aoAbrir) return aoAbrir(l);
    if (!abrirParam) return;
    const p = new URLSearchParams(params.toString());
    p.set(abrirParam.param, String(l[abrirParam.campo] ?? ""));
    router.push(`${rota}?${p.toString()}${abrirParam.ancora ? `#${abrirParam.ancora}` : ""}`, { scroll: !!abrirParam.ancora });
  }

  const resumo = resumoPor ? (() => {
    const m = new Map<string, number>();
    for (const l of visiveis) { const k = String(l[resumoPor] ?? ""); if (k) m.set(k, (m.get(k) ?? 0) + 1); }
    const ordemF = facetas.find((f) => f.id === resumoPor)?.ordem;
    return [...m.entries()].sort((a, b) => (ordemF ? ordemF.indexOf(a[0]) - ordemF.indexOf(b[0]) : b[1] - a[1]));
  })() : [];

  return (
    <div className="space-y-3">
      {(busca || facetas.length > 0 || alternancias.length > 0) && (
        <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
          {busca && <CampoBusca valor={texto} aoMudar={setTexto} placeholder={busca.placeholder} />}
          <div className="flex flex-wrap items-center gap-2">
            {facetas.map((f, i) => (
              <MultiEscolha key={f.id} rotulo={f.rotulo} opcoes={opcoes[i]} valor={sel[f.id] ?? []}
                aoMudar={(v) => setSel((s) => ({ ...s, [f.id]: v }))} />
            ))}
            {alternancias.map((a) => (
              <label key={a.id} title={a.dica} className="inline-flex h-11 cursor-pointer items-center gap-2 rounded-xl border border-borda bg-superficie-2 px-3.5 text-[13.5px] text-texto-2">
                <input type="checkbox" checked={!!liga[a.id]} onChange={(e) => setLiga((s) => ({ ...s, [a.id]: e.target.checked }))}
                  className="size-4 accent-[var(--color-marca-500)]" />
                {a.rotulo}
              </label>
            ))}
          </div>
        </div>
      )}
      <div className="flex flex-wrap items-center justify-between gap-2 text-[12.5px] text-texto-3">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span><b className="num font-medium text-texto-2">{n0.format(visiveis.length)}</b> {contagem}{visiveis.length !== linhas.length && ` de ${n0.format(linhas.length)}`}</span>
          {resumo.map(([k, q]) => (
            <span key={k} className="inline-flex items-center gap-1"><PontoSituacao nome={k} cor={cores[k]} /><b className="num font-medium text-texto-2">{n0.format(q)}</b></span>
          ))}
        </div>
        <div className="flex items-center gap-2">
          {extra}
          {arquivo && visiveis.length > 0 && (
            <button onClick={() => baixarCsv(arquivo, colunas, visiveis)}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-borda bg-superficie px-2.5 text-[12.5px] text-texto-2 transition hover:text-texto">
              <Download className="size-3.5" /> Baixar CSV
            </button>
          )}
        </div>
      </div>
      {visiveis.length === 0 ? (
        <p className="rounded-lg border border-dashed border-borda px-4 py-6 text-center text-[13px] text-texto-3">{vazio}</p>
      ) : (
        <div ref={caixa} className="overflow-auto rounded-lg border border-borda" style={{ height: alturaCaixa }}>
          <div style={{ width: total, minWidth: "100%" }}>
            <div className="sticky top-0 z-10 grid border-b border-borda bg-superficie-2 text-[11.5px] font-medium text-texto-3"
              style={{ gridTemplateColumns: grade }}>
              {colunas.map((c) => {
                const ativo = ord?.campo === c.id;
                const direita = c.tipo && !["texto", "situacao", "data", "link", "codigo"].includes(c.tipo);
                return (
                  <button key={c.id} title={c.dica} onClick={() => setOrd(ativo ? { campo: c.id, desc: !ord!.desc } : { campo: c.id, desc: !!direita })}
                    className={clsx("flex h-9 items-center gap-1 px-3 text-left hover:text-texto", direita && "justify-end text-right", ativo && "text-texto")}>
                    <span className="truncate">{c.rotulo}</span>
                    {ativo && (ord!.desc ? <ArrowDown className="size-3 shrink-0" /> : <ArrowUp className="size-3 shrink-0" />)}
                  </button>
                );
              })}
              {clicavel && <span />}
            </div>
            <div className="relative" style={{ height: virt.getTotalSize() }}>
              {virt.getVirtualItems().map((vi) => {
                const l = visiveis[vi.index];
                return (
                  <div key={vi.key} role={clicavel ? "button" : undefined} tabIndex={clicavel ? 0 : undefined}
                    onClick={clicavel ? () => abrir(l) : undefined} onKeyDown={clicavel ? (e) => e.key === "Enter" && abrir(l) : undefined}
                    className={clsx("absolute inset-x-0 grid items-center border-b border-borda text-[12.5px]", clicavel && "cursor-pointer hover:bg-superficie-2")}
                    style={{ gridTemplateColumns: grade, height: ALTURA_LINHA, transform: `translateY(${vi.start}px)` }}>
                    {colunas.map((c) => <CelulaTabela key={c.id} c={c} v={l[c.id]} cores={cores} max={maximos[c.id]} />)}
                    {clicavel && <ChevronRight className="size-4 text-texto-4" />}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function CelulaTabela({ c, v, cores, max }: { c: Coluna; v: Celula; cores: Record<string, Cor>; max?: number }) {
  const t = formatarCelula(c, v);
  if (c.tipo === "situacao") return <span className="min-w-0 px-3 text-texto-2"><PontoSituacao nome={t} cor={cores[t]} /></span>;
  if (c.tipo === "link") {
    return (
      <span className="px-3" onClick={(e) => e.stopPropagation()}>
        {typeof v === "string" && /^https?:\/\//i.test(v)
          ? <a href={v} target="_blank" rel="noreferrer noopener" className="text-[var(--serie-1)] underline-offset-2 hover:underline">Abrir</a> : ""}
      </span>
    );
  }
  if (c.tipo === "barra") {
    const p = typeof v === "number" && max ? Math.max(0, Math.min(1, v / max)) : 0;
    return (
      <span className="flex min-w-0 items-center gap-2 px-3">
        <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-superficie-3">
          <span className="block h-full rounded-full" style={{ width: `${p * 100}%`, background: corDe(c.corBarra ?? "serie-1") }} />
        </span>
        <span className="num w-12 shrink-0 text-right tabular-nums">{t}</span>
      </span>
    );
  }
  const direita = c.tipo && !["texto", "data", "codigo"].includes(c.tipo);
  return (
    <span title={t.length > 24 ? t : undefined} className={clsx("min-w-0 truncate px-3", direita && "num text-right tabular-nums",
      c.tipo === "codigo" && "num font-mono text-[12px]", c.tipo === "data" && "num tabular-nums text-texto-2")}>{t}</span>
  );
}
