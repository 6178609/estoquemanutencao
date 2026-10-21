"use client";

import clsx from "clsx";
import { Table2 } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";

/**
 * Gráficos do site, em SVG próprio, seguindo o método de dataviz:
 * - cores por função: série (identidade, ordem fixa --serie-1..4), status (farol --st-*), sequencial (--seq-*);
 *   paleta validada para daltonismo e contraste nos dois temas (globals.css);
 * - marcas finas: barra ≤ 24 px com ponta arredondada de 4 px, linha de 2 px, marcador ≥ 8 px com anel da superfície,
 *   vão de 2 px entre fatias; grade e eixos em linha fina sólida e discreta;
 * - texto nunca na cor da série; legenda sempre que há 2+ séries; rótulo direto só no que importa;
 * - dica ao passar o mouse (crosshair em linhas, a própria marca em barras) e "Ver tabela" em todo gráfico.
 */

export type Cor = "serie-1" | "serie-2" | "serie-3" | "serie-4" | "st-bom" | "st-atencao" | "st-serio" | "st-critico" | "neutro";
export const cor = (c: Cor) => (c === "neutro" ? "var(--texto-4)" : `var(--${c})`);

export interface Serie {
  nome: string;
  cor?: Cor;
  valores: (number | null)[];
}

const n0 = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 });
const n1 = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 });
const compacto = new Intl.NumberFormat("pt-BR", { notation: "compact", maximumFractionDigits: 1 });
export const fmtPadrao = (v: number) => (Math.abs(v) >= 10_000 ? compacto.format(v) : Math.abs(v) < 10 ? n1.format(v) : n0.format(v));

/** Formatos nomeados (o servidor não pode passar funções para estes componentes do navegador). */
export type Formato = "padrao" | "inteiro" | "un" | "%" | "h" | "dias" | "sem" | "R$" | "ind";
export function fmt(f: Formato | undefined, v: number): string {
  switch (f) {
    case "inteiro": case "un": return n0.format(v);
    case "%": return `${n1.format(v)}%`;
    case "h": return `${Math.abs(v) >= 100 ? n0.format(v) : n1.format(v)} h`;
    case "dias": return `${Math.abs(v) >= 100 ? n0.format(v) : n1.format(v)} d`;
    case "sem": return `${n1.format(v)} sem`;
    case "R$": return Math.abs(v) >= 1e6 ? `R$ ${n1.format(v / 1e6)} mi` : Math.abs(v) >= 1e4 ? `R$ ${n0.format(v / 1e3)} mil` : `R$ ${n0.format(v)}`;
    case "ind": return `${n0.format(v)} ind.`;
    default: return fmtPadrao(v);
  }
}

/** Largura do contêiner (o SVG desenha em pixels reais: nada esticado, texto nítido). */
function useLargura<T extends HTMLElement>(): [React.RefObject<T | null>, number] {
  const ref = useRef<T>(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([e]) => setW(Math.floor(e.contentRect.width)));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

/** Escala "bonita" (0, 25, 50, 75, 100) que cobre o máximo. */
function escala(max: number, min = 0, passos = 4, inteiro = false): { ticks: number[]; topo: number; base: number } {
  const span = Math.max(max - min, 1e-9);
  const bruto = span / passos;
  const mag = 10 ** Math.floor(Math.log10(bruto));
  let passo = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((p) => p >= bruto) ?? 10 * mag;
  if (inteiro) passo = Math.max(1, Math.ceil(passo)); // contagens: nada de "0,5 ordem" (que virava 1, 1, 0, 0 no eixo)
  const base = Math.floor(min / passo) * passo;
  const topo = Math.ceil(max / passo) * passo || passo;
  const ticks: number[] = [];
  for (let t = base; t <= topo + passo / 1e6; t += passo) ticks.push(Math.round(t * 1e9) / 1e9);
  return { ticks, topo, base };
}

// ----------------------------------------------------------------------------
// Moldura: título, legenda, "ver tabela"
// ----------------------------------------------------------------------------
export function Legenda({ series, linha }: { series: { nome: string; cor?: Cor }[]; linha?: boolean }) {
  if (series.length < 2) return null;
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-texto-2">
      {series.map((s, i) => (
        <span key={s.nome} className="inline-flex items-center gap-1.5">
          <span className={linha ? "h-[2px] w-3.5 rounded-full" : "size-2.5 rounded-[3px]"}
            style={{ background: cor(s.cor ?? (`serie-${(i % 4) + 1}` as Cor)) }} />
          {s.nome}
        </span>
      ))}
    </div>
  );
}

export function Tabela({ colunas, linhas }: { colunas: string[]; linhas: (string | number)[][] }) {
  return (
    <div className="max-h-72 overflow-auto rounded-lg border border-borda">
      <table className="w-full text-left text-[12.5px]">
        <thead className="sticky top-0 bg-superficie-2 text-texto-3">
          <tr>{colunas.map((c) => <th key={c} className="px-3 py-1.5 font-medium">{c}</th>)}</tr>
        </thead>
        <tbody className="divide-borda divide-y">
          {linhas.map((l, i) => (
            <tr key={i}>{l.map((v, j) => <td key={j} className={clsx("px-3 py-1.5", j > 0 && "num tabular-nums")}>{v}</td>)}</tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Cartão de gráfico: título (+ fórmula na dica), legenda, o gráfico e a alternância para a tabela. */
export function Grafico({ titulo, subtitulo, dica, legenda, tabela, acoes, children, className }: {
  titulo: string; subtitulo?: string; dica?: string; legenda?: React.ReactNode;
  tabela?: { colunas: string[]; linhas: (string | number)[][] }; acoes?: React.ReactNode; children: React.ReactNode; className?: string;
}) {
  const [verTabela, setVerTabela] = useState(false);
  return (
    <div className={clsx("rounded-cartao border border-borda bg-superficie p-5", className)}>
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="font-display text-[15px] font-medium" title={dica}>{titulo}</div>
          {subtitulo && <div className="mt-0.5 text-[12.5px] text-texto-3">{subtitulo}</div>}
        </div>
        <div className="flex items-center gap-1">
          {acoes}
          {tabela && (
            <button onClick={() => setVerTabela(!verTabela)} title={verTabela ? "Ver gráfico" : "Ver tabela"}
              aria-pressed={verTabela}
              className={clsx("grid size-8 place-items-center rounded-lg transition hover:bg-superficie-2",
                verTabela ? "text-texto" : "text-texto-3")}>
              <Table2 className="size-4" strokeWidth={1.75} />
            </button>
          )}
        </div>
      </div>
      {legenda && !verTabela && <div className="mb-3">{legenda}</div>}
      {verTabela && tabela ? <Tabela {...tabela} /> : children}
    </div>
  );
}

// ----------------------------------------------------------------------------
// Dica (tooltip)
// ----------------------------------------------------------------------------
interface Dica { x: number; y: number; titulo: string; linhas: { nome: string; valor: string; cor?: Cor; linha?: boolean }[] }

function CaixaDica({ d, largura }: { d: Dica | null; largura: number }) {
  if (!d) return null;
  const esquerda = d.x > largura - 190;
  return (
    <div role="status" className="pointer-events-none absolute z-10 min-w-[140px] rounded-lg border border-borda bg-superficie px-3 py-2 text-[12px] shadow-flutuante"
      style={{ left: esquerda ? undefined : d.x + 12, right: esquerda ? largura - d.x + 12 : undefined, top: Math.max(0, d.y - 10) }}>
      <div className="mb-1 text-texto-3">{d.titulo}</div>
      {d.linhas.map((l) => (
        <div key={l.nome} className="flex items-center gap-2">
          {l.cor && <span className={l.linha === false ? "size-2 rounded-[2px]" : "h-[2px] w-3 rounded-full"} style={{ background: cor(l.cor) }} />}
          <span className="num font-medium text-texto">{l.valor}</span>
          <span className="text-texto-3">{l.nome}</span>
        </div>
      ))}
    </div>
  );
}

// ----------------------------------------------------------------------------
// Colunas (verticais): uma série, várias lado a lado ou empilhadas; linha de meta opcional (única, ou uma por coluna)
// ----------------------------------------------------------------------------
export function Colunas({ rotulos, series, empilhar, meta, metaPorRotulo, nomeMetaPorRotulo = "Meta", formato: fmtNome = "padrao", altura = 220, corPorValor, rotular = "ultimo" }: {
  rotulos: string[]; series: Serie[]; empilhar?: boolean; meta?: number | null; metaPorRotulo?: (number | null)[]; nomeMetaPorRotulo?: string; formato?: Formato;
  altura?: number; corPorValor?: (v: number, i: number) => Cor; rotular?: "ultimo" | "todos" | "nenhum";
}) {
  const [ref, largura] = useLargura<HTMLDivElement>();
  const fmtV = (v: number) => fmt(fmtNome, v);
  const [dica, setDica] = useState<Dica | null>(null);
  const BASE = 22, TOPO = 16;
  const totais = rotulos.map((_, i) => empilhar ? series.reduce((s, x) => s + Math.max(0, x.valores[i] ?? 0), 0)
    : Math.max(0, ...series.map((x) => x.valores[i] ?? 0)));
  const { ticks, topo } = escala(Math.max(...totais, meta ?? 0, ...(metaPorRotulo ?? []).map((v) => v ?? 0), 0), 0, 4, fmtNome === "inteiro" || fmtNome === "un");
  const ESQ = margemEixo(ticks.map(fmtV));
  const w = Math.max(largura - ESQ, 10), h = altura - BASE - TOPO;
  const banda = w / Math.max(rotulos.length, 1);
  const grupos = empilhar ? 1 : series.length;
  const larg = Math.min(24, Math.max(3, (banda * 0.7) / grupos - (grupos > 1 ? 2 : 0)));
  const y = (v: number) => TOPO + h - (v / topo) * h;
  const passoRotulo = Math.ceil(rotulos.length / Math.max(1, Math.floor(w / 46)));
  return (
    <div ref={ref} className="relative" onPointerLeave={() => setDica(null)}>
      {largura > 0 && (
        <svg width={largura} height={altura} role="img" aria-label={series.map((s) => s.nome).join(", ")}>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={ESQ} x2={largura} y1={y(t)} y2={y(t)} stroke="var(--grade)" strokeWidth={1} />
              <text x={ESQ - 6} y={y(t)} dy="0.32em" textAnchor="end" className="fill-[var(--texto-3)] text-[10.5px] tabular-nums">{fmtV(t)}</text>
            </g>
          ))}
          {rotulos.map((r, i) => {
            const x0 = ESQ + i * banda + (banda - (larg + 2) * grupos + 2) / 2;
            let acumulado = 0;
            const marcas = series.map((s, j) => {
              const v = Math.max(0, s.valores[i] ?? 0);
              const c = corPorValor ? corPorValor(v, i) : (s.cor ?? (`serie-${(j % 4) + 1}` as Cor));
              const x = empilhar ? x0 : x0 + j * (larg + 2);
              const y1 = empilhar ? y(acumulado + v) : y(v);
              const y0 = empilhar ? y(acumulado) : y(0);
              const topoPilha = empilhar ? j === series.length - 1 || series.slice(j + 1).every((t) => !(t.valores[i] ?? 0)) : true;
              acumulado += v;
              if (!v) return null;
              const alt = Math.max(1, y0 - y1 - (empilhar && j > 0 ? 2 : 0));
              const raio = topoPilha ? Math.min(4, alt / 2, larg / 2) : 0;
              return <path key={s.nome} d={barraV(x, y1, larg, alt, raio)} fill={cor(c)} />;
            });
            const ultimo = i === rotulos.length - 1;
            const mostrar = rotular === "todos" || (rotular === "ultimo" && ultimo);
            return (
              <g key={r + i}>
                {marcas}
                {mostrar && totais[i] > 0 && (
                  <text x={Math.min(x0 + ((larg + 2) * grupos - 2) / 2, largura - fmtV(totais[i]).length * 3.4)} y={y(totais[i]) - 5} textAnchor="middle" className="fill-[var(--texto)] text-[11px] font-medium tabular-nums">
                    {fmtV(totais[i])}
                  </text>
                )}
                {i % passoRotulo === 0 && (
                  <text x={ESQ + i * banda + banda / 2} y={altura - 6} textAnchor="middle" className="fill-[var(--texto-3)] text-[10.5px]">{r}</text>
                )}
                <rect x={ESQ + i * banda} y={TOPO} width={banda} height={h} fill="transparent" tabIndex={0}
                  onPointerMove={(e) => setDica({ x: e.nativeEvent.offsetX, y: e.nativeEvent.offsetY, titulo: r,
                    linhas: [...series.map((s, j) => ({ nome: s.nome, valor: s.valores[i] == null ? "—" : fmtV(s.valores[i]!), linha: false,
                      cor: corPorValor ? corPorValor(s.valores[i] ?? 0, i) : (s.cor ?? (`serie-${(j % 4) + 1}` as Cor)) })),
                    ...(metaPorRotulo?.[i] != null ? [{ nome: nomeMetaPorRotulo, valor: fmtV(metaPorRotulo[i]!), linha: true }] : [])] })}
                  onFocus={() => setDica({ x: ESQ + i * banda + banda / 2, y: TOPO, titulo: r,
                    linhas: [...series.map((s) => ({ nome: s.nome, valor: s.valores[i] == null ? "—" : fmtV(s.valores[i]!) })),
                      ...(metaPorRotulo?.[i] != null ? [{ nome: nomeMetaPorRotulo, valor: fmtV(metaPorRotulo[i]!) }] : [])] })} />
              </g>
            );
          })}
          {metaPorRotulo?.map((v, i) => v == null ? null : (
            <line key={`meta-${i}`} x1={ESQ + i * banda + banda * 0.12} x2={ESQ + i * banda + banda * 0.88} y1={y(v)} y2={y(v)}
              stroke="var(--st-bom)" strokeWidth={2} strokeDasharray="4 3" />
          ))}
          {meta != null && meta > 0 && (
            <g>
              <line x1={ESQ} x2={largura} y1={y(meta)} y2={y(meta)} stroke="var(--st-bom)" strokeWidth={1.5} />
              <text x={largura - 2} y={y(meta) - 4} textAnchor="end" className="fill-[var(--texto-2)] text-[10.5px]">meta {fmtV(meta)}</text>
            </g>
          )}
          <line x1={ESQ} x2={largura} y1={y(0)} y2={y(0)} stroke="var(--eixo)" strokeWidth={1} />
        </svg>
      )}
      <CaixaDica d={dica} largura={largura} />
    </div>
  );
}

/** Margem do eixo y pelo rótulo mais longo (nada de "00 mil" cortado). */
function margemEixo(rotulos: string[]) {
  return Math.max(28, ...rotulos.map((r) => r.length * 6.2 + 10));
}

/** Barra vertical com ponta arredondada (4 px) e base reta. */
function barraV(x: number, y: number, w: number, h: number, r: number) {
  if (r <= 0) return `M${x},${y}h${w}v${h}h${-w}Z`;
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
}

/** Barra horizontal com ponta arredondada à direita. */
function barraH(x: number, y: number, w: number, h: number, r: number) {
  if (r <= 0 || w < 1) return `M${x},${y}h${Math.max(w, 0)}v${h}h${-Math.max(w, 0)}Z`;
  return `M${x},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h - r}Q${x + w},${y + h} ${x + w - r},${y + h}H${x}Z`;
}

// ----------------------------------------------------------------------------
// Barras horizontais (ranking): rótulo à esquerda, valor na ponta
// ----------------------------------------------------------------------------
export interface ItemBarra { rotulo: string; valor: number; detalhe?: string; cor?: Cor; href?: string; partes?: { nome: string; valor: number; cor: Cor }[] }

export function Barras({ itens, formato: fmtNome = "padrao", max, larguraRotulo = 160, meta, aoClicar }: {
  itens: ItemBarra[]; formato?: Formato; max?: number; larguraRotulo?: number; meta?: number | null;
  aoClicar?: (i: ItemBarra) => void;
}) {
  const [ref, largura] = useLargura<HTMLDivElement>();
  const fmtV = (v: number) => fmt(fmtNome, v);
  const [dica, setDica] = useState<Dica | null>(null);
  const ALT = 26, ESP = 30;
  const topo = max ?? Math.max(...itens.map((i) => i.valor), meta ?? 0, 1e-9);
  const rotW = Math.min(larguraRotulo, Math.max(90, largura * 0.38));
  // espaço à direita para o valor escrito ao fim da barra (o maior deles), em vez de um fixo que cortava "R$ 69 mil"
  const dir = Math.max(40, ...itens.map((i) => fmtV(i.valor).length * 6.6 + 12));
  const w = Math.max(largura - rotW - dir, 10);
  const cabe = Math.max(4, Math.floor((rotW - 10) / 7.2)); // caracteres que cabem no rótulo (dígitos e maiúsculas são largos)
  const altura = itens.length * ESP + 4;
  return (
    <div ref={ref} className="relative" onPointerLeave={() => setDica(null)}>
      {largura > 0 && (
        <svg width={largura} height={altura} role="img">
          {itens.map((it, i) => {
            const y = i * ESP + (ESP - Math.min(ALT, 18)) / 2;
            const hB = Math.min(ALT, 18);
            const vw = Math.max(0, (it.valor / topo) * w);
            let acc = 0;
            return (
              <g key={it.rotulo + i} className={aoClicar ? "cursor-pointer" : undefined} onClick={() => aoClicar?.(it)}
                onPointerMove={(e) => setDica({ x: e.nativeEvent.offsetX, y: e.nativeEvent.offsetY, titulo: it.rotulo,
                  linhas: it.partes?.length ? it.partes.map((p) => ({ nome: p.nome, valor: fmtV(p.valor), cor: p.cor, linha: false }))
                    : [{ nome: it.detalhe ?? "", valor: fmtV(it.valor), cor: it.cor ?? "serie-1", linha: false }] })}>
                <text x={rotW - 8} y={y + hB / 2} dy="0.32em" textAnchor="end" className="fill-[var(--texto-2)] text-[12px]">
                  {it.rotulo.length > cabe ? it.rotulo.slice(0, cabe - 1) + "…" : it.rotulo}
                  {it.rotulo.length > cabe && <title>{it.rotulo}</title>}
                </text>
                {it.partes?.length ? it.partes.map((p, j) => {
                  const pw = (p.valor / topo) * w;
                  const x = rotW + acc + (j > 0 ? 2 : 0);
                  acc += pw;
                  const ultimo = j === it.partes!.length - 1;
                  return pw > 0 ? <path key={p.nome} d={barraH(x, y, Math.max(pw - (j > 0 ? 2 : 0), 1), hB, ultimo ? Math.min(4, pw / 2) : 0)} fill={cor(p.cor)} /> : null;
                }) : <path d={barraH(rotW, y, Math.max(vw, it.valor > 0 ? 2 : 0), hB, Math.min(4, vw / 2))} fill={cor(it.cor ?? "serie-1")} />}
                <text x={rotW + vw + 6} y={y + hB / 2} dy="0.32em" className="fill-[var(--texto)] text-[11.5px] font-medium tabular-nums">{fmtV(it.valor)}</text>
                <rect x={0} y={i * ESP} width={largura} height={ESP} fill="transparent" />
              </g>
            );
          })}
          {meta != null && meta > 0 && (
            <line x1={rotW + (meta / topo) * w} x2={rotW + (meta / topo) * w} y1={0} y2={altura} stroke="var(--st-bom)" strokeWidth={1.5} />
          )}
        </svg>
      )}
      <CaixaDica d={dica} largura={largura} />
    </div>
  );
}

// ----------------------------------------------------------------------------
// Linhas (tendência): crosshair que acha o X, dica com todas as séries, área opcional para uma série
// ----------------------------------------------------------------------------
export function Linhas({ rotulos, series, meta, formato: fmtNome = "padrao", altura = 220, area, minimo }: {
  rotulos: string[]; series: Serie[]; meta?: number | null; formato?: Formato; altura?: number;
  area?: boolean; minimo?: number;
}) {
  const [ref, largura] = useLargura<HTMLDivElement>();
  const fmtV = (v: number) => fmt(fmtNome, v);
  const [hover, setHover] = useState<number | null>(null);
  const id = useId();
  const BASE = 22, TOPO = 16;
  const todos = series.flatMap((s) => s.valores.filter((v): v is number => v != null));
  const { ticks, topo, base } = escala(Math.max(...todos, meta ?? 0, 0), minimo ?? Math.min(0, ...todos), 4, fmtNome === "inteiro" || fmtNome === "un");
  const ESQ = margemEixo(ticks.map(fmtV));
  const finais = series.map((s) => [...s.valores].reverse().find((v) => v != null)).filter((v): v is number => v != null);
  const DIR = series.length <= 4 && finais.length ? Math.max(30, ...finais.map((v) => fmtV(v).length * 6.6 + 12)) : 12;
  const w = Math.max(largura - ESQ - DIR, 10), h = altura - BASE - TOPO;
  const x = (i: number) => ESQ + (rotulos.length > 1 ? (i / (rotulos.length - 1)) * w : w / 2);
  const y = (v: number) => TOPO + h - ((v - base) / (topo - base || 1)) * h;
  const passoRotulo = Math.ceil(rotulos.length / Math.max(1, Math.floor(w / 50)));
  const caminho = (vs: (number | null)[]) => {
    let d = "", aberto = false;
    vs.forEach((v, i) => {
      if (v == null) { aberto = false; return; }
      d += `${aberto ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`;
      aberto = true;
    });
    return d;
  };
  return (
    <div ref={ref} className="relative" onPointerLeave={() => setHover(null)}>
      {largura > 0 && (
        <svg width={largura} height={altura} role="img"
          onPointerMove={(e) => {
            const px = e.nativeEvent.offsetX;
            const i = Math.round(((px - ESQ) / w) * (rotulos.length - 1));
            setHover(Math.max(0, Math.min(rotulos.length - 1, i)));
          }}>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={ESQ} x2={largura - DIR} y1={y(t)} y2={y(t)} stroke="var(--grade)" strokeWidth={1} />
              <text x={ESQ - 6} y={y(t)} dy="0.32em" textAnchor="end" className="fill-[var(--texto-3)] text-[10.5px] tabular-nums">{fmtV(t)}</text>
            </g>
          ))}
          {rotulos.map((r, i) => i % passoRotulo === 0 && (
            <text key={r + i} x={x(i)} y={altura - 6} textAnchor="middle" className="fill-[var(--texto-3)] text-[10.5px]">{r}</text>
          ))}
          {meta != null && (
            <g>
              <line x1={ESQ} x2={largura - DIR} y1={y(meta)} y2={y(meta)} stroke="var(--st-bom)" strokeWidth={1.5} />
              <text x={largura - DIR} y={y(meta) - 4} textAnchor="end" className="fill-[var(--texto-2)] text-[10.5px]">meta {fmtV(meta)}</text>
            </g>
          )}
          {series.map((s, j) => {
            const c = cor(s.cor ?? (`serie-${(j % 4) + 1}` as Cor));
            const d = caminho(s.valores);
            const ult = s.valores.map((v, i) => [v, i] as const).filter(([v]) => v != null).pop();
            return (
              <g key={s.nome}>
                {area && series.length === 1 && d && ult && (
                  <path d={`${d}L${x(ult[1])},${y(Math.max(base, 0))}L${x(s.valores.findIndex((v) => v != null))},${y(Math.max(base, 0))}Z`} fill={c} opacity={0.1} />
                )}
                <path d={d} fill="none" stroke={c} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
                {ult && (
                  <>
                    <circle cx={x(ult[1])} cy={y(ult[0]!)} r={4} fill={c} stroke="var(--superficie)" strokeWidth={2} />
                    {series.length <= 4 && (
                      <text x={x(ult[1]) + 7} y={y(ult[0]!)} dy="0.32em" className="fill-[var(--texto)] text-[11px] font-medium tabular-nums">{fmtV(ult[0]!)}</text>
                    )}
                  </>
                )}
              </g>
            );
          })}
          {hover != null && (
            <g>
              <line x1={x(hover)} x2={x(hover)} y1={TOPO} y2={TOPO + h} stroke="var(--eixo)" strokeWidth={1} />
              {series.map((s, j) => s.valores[hover] != null && (
                <circle key={s.nome} cx={x(hover)} cy={y(s.valores[hover]!)} r={4} fill={cor(s.cor ?? (`serie-${(j % 4) + 1}` as Cor))} stroke="var(--superficie)" strokeWidth={2} />
              ))}
            </g>
          )}
          <defs><clipPath id={id}><rect x={ESQ} y={0} width={w} height={altura} /></clipPath></defs>
        </svg>
      )}
      {hover != null && (
        <CaixaDica largura={largura} d={{ x: x(hover), y: TOPO, titulo: rotulos[hover],
          linhas: series.map((s, j) => ({ nome: s.nome, valor: s.valores[hover] == null ? "—" : fmtV(s.valores[hover]!),
            cor: s.cor ?? (`serie-${(j % 4) + 1}` as Cor) })) }} />
      )}
    </div>
  );
}

// ----------------------------------------------------------------------------
// Mapa de calor (grade): uma cor, do claro (pouco) ao escuro (muito)
// ----------------------------------------------------------------------------
const SEQ = ["--seq-1", "--seq-2", "--seq-3", "--seq-4", "--seq-5", "--seq-6", "--seq-7"];

export function MapaDeCalor({ linhas, colunas, valores, formato: fmtNome = "padrao", larguraRotulo = 150, aoClicar }: {
  linhas: string[]; colunas: string[]; valores: (number | null)[][]; formato?: Formato; larguraRotulo?: number;
  aoClicar?: (linha: number, coluna: number) => void;
}) {
  const [ref, largura] = useLargura<HTMLDivElement>();
  const fmtV = (v: number) => fmt(fmtNome, v);
  const [dica, setDica] = useState<Dica | null>(null);
  const max = Math.max(...valores.flat().filter((v): v is number => v != null), 1e-9);
  const rotW = Math.min(larguraRotulo, largura * 0.35);
  const cw = Math.max((largura - rotW) / Math.max(colunas.length, 1), 8);
  const ch = 26;
  const passo = Math.ceil(colunas.length / Math.max(1, Math.floor((largura - rotW) / 40)));
  return (
    <div ref={ref} className="relative" onPointerLeave={() => setDica(null)}>
      {largura > 0 && (
        <svg width={largura} height={linhas.length * ch + 22} role="img">
          {colunas.map((c, j) => j % passo === 0 && (
            <text key={c + j} x={rotW + j * cw + cw / 2} y={12} textAnchor="middle" className="fill-[var(--texto-3)] text-[10.5px]">{c}</text>
          ))}
          {linhas.map((l, i) => (
            <g key={l + i}>
              <text x={rotW - 8} y={22 + i * ch + ch / 2} dy="0.32em" textAnchor="end" className="fill-[var(--texto-2)] text-[12px]">
                {l.length > rotW / 6.6 ? l.slice(0, Math.floor(rotW / 6.6) - 1) + "…" : l}
              </text>
              {colunas.map((c, j) => {
                const v = valores[i]?.[j];
                const nivel = v == null || v <= 0 ? -1 : Math.min(6, Math.floor((v / max) * 6.999));
                return (
                  <rect key={c + j} x={rotW + j * cw + 1} y={22 + i * ch + 1} width={cw - 2} height={ch - 2} rx={3}
                    fill={nivel < 0 ? "var(--superficie-2)" : `var(${SEQ[nivel]})`} className={aoClicar ? "cursor-pointer" : undefined}
                    onClick={() => aoClicar?.(i, j)}
                    onPointerMove={(e) => setDica({ x: e.nativeEvent.offsetX, y: e.nativeEvent.offsetY, titulo: `${l} · ${c}`,
                      linhas: [{ nome: "", valor: v == null ? "—" : fmtV(v) }] })} />
                );
              })}
            </g>
          ))}
        </svg>
      )}
      <CaixaDica d={dica} largura={largura} />
    </div>
  );
}

// ----------------------------------------------------------------------------
// Pequenos: sparkline, medidor, barra de partes (100%)
// ----------------------------------------------------------------------------
export function Sparkline({ valores, cor: c = "serie-1", altura = 32 }: { valores: (number | null)[]; cor?: Cor; altura?: number }) {
  const [ref, largura] = useLargura<HTMLDivElement>();
  const vs = valores.filter((v): v is number => v != null);
  if (vs.length < 2) return <div ref={ref} style={{ height: altura }} />;
  const min = Math.min(...vs), max = Math.max(...vs);
  const x = (i: number) => 2 + (i / (valores.length - 1)) * (largura - 6);
  const y = (v: number) => 3 + (1 - (v - min) / (max - min || 1)) * (altura - 6);
  let d = "", aberto = false;
  valores.forEach((v, i) => { if (v == null) { aberto = false; return; } d += `${aberto ? "L" : "M"}${x(i)},${y(v)}`; aberto = true; });
  const ultimo = valores.length - 1 - [...valores].reverse().findIndex((v) => v != null);
  return (
    <div ref={ref} style={{ height: altura }}>
      {largura > 0 && (
        <svg width={largura} height={altura} aria-hidden>
          <path d={d} fill="none" stroke="var(--texto-4)" strokeWidth={1.5} strokeLinejoin="round" />
          <circle cx={x(ultimo)} cy={y(valores[ultimo]!)} r={3} fill={cor(c)} />
        </svg>
      )}
    </div>
  );
}

/** Medidor de uma razão contra o limite: o preenchimento leva o status; o trilho é a superfície. */
export function Medidor({ valor, max = 100, status = "st-bom", rotulo }: { valor: number | null; max?: number; status?: Cor; rotulo?: string }) {
  const p = valor == null ? 0 : Math.max(0, Math.min(1, valor / max));
  return (
    <div>
      <div className="h-2 overflow-hidden rounded-full bg-superficie-3" role="meter" aria-valuenow={valor ?? undefined} aria-valuemax={max} aria-label={rotulo}>
        <div className="h-full rounded-full" style={{ width: `${p * 100}%`, background: cor(status) }} />
      </div>
    </div>
  );
}

/** Barra 100% (parte do todo) com legenda — até 6 partes. */
export function Partes({ partes, formato: fmtNome = "inteiro" }: { partes: { nome: string; valor: number; cor: Cor }[]; formato?: Formato }) {
  const fmtV = (v: number) => fmt(fmtNome, v);
  const total = partes.reduce((s, p) => s + p.valor, 0) || 1;
  const vis = useMemo(() => partes.filter((p) => p.valor > 0), [partes]);
  return (
    <div className="space-y-2.5">
      <div className="flex h-3 gap-[2px] overflow-hidden rounded-full">
        {vis.map((p, i) => (
          <div key={p.nome} title={`${p.nome}: ${fmtV(p.valor)}`} style={{ width: `${(p.valor / total) * 100}%`, background: cor(p.cor) }}
            className={clsx(i === 0 && "rounded-l-full", i === vis.length - 1 && "rounded-r-full")} />
        ))}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-texto-2">
        {partes.map((p) => (
          <span key={p.nome} className="inline-flex items-center gap-1.5">
            <span className="size-2.5 rounded-[3px]" style={{ background: cor(p.cor) }} />
            {p.nome} <b className="num font-medium text-texto">{fmtV(p.valor)}</b>
            <span className="text-texto-3">({Math.round((p.valor / total) * 100)}%)</span>
          </span>
        ))}
      </div>
    </div>
  );
}
