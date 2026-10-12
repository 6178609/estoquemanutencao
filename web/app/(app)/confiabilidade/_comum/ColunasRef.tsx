"use client";

import { useEffect, useRef, useState } from "react";

import { cor, fmt, type Cor, type Formato, type Serie } from "@/components/graficos";

/**
 * Colunas (uma série ou empilhadas) com uma LINHA DE REFERÊNCIA rotulada que não é meta — capacidade semanal,
 * HH disponíveis… O `Colunas` compartilhado só desenha "meta" (verde); aqui a referência é tracejada, neutra e
 * com o rótulo dado. Mesmas marcas do sistema: barra ≤ 24 px, ponta de 4 px, vão de 2 px na pilha, grade discreta.
 */
function escala(max: number, passos = 4) {
  const bruto = Math.max(max, 1e-9) / passos;
  const mag = 10 ** Math.floor(Math.log10(bruto));
  const passo = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((p) => p >= bruto) ?? 10 * mag;
  const topo = Math.ceil(max / passo) * passo || passo;
  const ticks: number[] = [];
  for (let t = 0; t <= topo + passo / 1e6; t += passo) ticks.push(Math.round(t * 1e9) / 1e9);
  return { ticks, topo };
}

function barraV(x: number, y: number, w: number, h: number, r: number) {
  if (r <= 0) return `M${x},${y}h${w}v${h}h${-w}Z`;
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
}

export function ColunasRef({ rotulos, series, referencia, formato = "padrao", altura = 240, titulosDica }: {
  rotulos: string[]; series: Serie[]; referencia?: { valor: number; rotulo: string } | null; formato?: Formato; altura?: number;
  titulosDica?: string[];
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [largura, setLargura] = useState(0);
  const [hover, setHover] = useState<{ i: number; x: number; y: number } | null>(null);
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([e]) => setLargura(Math.floor(e.contentRect.width)));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  const f = (v: number) => fmt(formato, v);
  const BASE = 22, TOPO = 18;
  const totais = rotulos.map((_, i) => series.reduce((s, x) => s + Math.max(0, x.valores[i] ?? 0), 0));
  const { ticks, topo } = escala(Math.max(...totais, referencia?.valor ?? 0, 0));
  const ESQ = Math.max(28, ...ticks.map((t) => f(t).length * 6.2 + 10));
  const w = Math.max(largura - ESQ, 10), h = altura - BASE - TOPO;
  const banda = w / Math.max(rotulos.length, 1);
  const larg = Math.min(24, Math.max(3, banda * 0.66));
  const y = (v: number) => TOPO + h - (v / topo) * h;
  const passo = Math.ceil(rotulos.length / Math.max(1, Math.floor(w / 46)));
  const corDe = (s: Serie, j: number): Cor => s.cor ?? (`serie-${(j % 4) + 1}` as Cor);
  return (
    <div ref={ref} className="relative" onPointerLeave={() => setHover(null)}>
      {largura > 0 && (
        <svg width={largura} height={altura} role="img" aria-label={series.map((s) => s.nome).join(", ")}>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={ESQ} x2={largura} y1={y(t)} y2={y(t)} stroke="var(--grade)" strokeWidth={1} />
              <text x={ESQ - 6} y={y(t)} dy="0.32em" textAnchor="end" className="fill-[var(--texto-3)] text-[10.5px] tabular-nums">{f(t)}</text>
            </g>
          ))}
          {rotulos.map((r, i) => {
            const x0 = ESQ + i * banda + (banda - larg) / 2;
            let acc = 0;
            const vis = series.map((s) => Math.max(0, s.valores[i] ?? 0));
            const ultimoComValor = vis.reduce((u, v, j) => (v > 0 ? j : u), -1);
            return (
              <g key={r + i}>
                {series.map((s, j) => {
                  const v = vis[j];
                  const y1 = y(acc + v), y0 = y(acc);
                  acc += v;
                  if (!v) return null;
                  const alt = Math.max(1, y0 - y1 - (j > 0 && acc - v > 0 ? 2 : 0));
                  return <path key={s.nome} d={barraV(x0, y1, larg, alt, j === ultimoComValor ? Math.min(4, alt / 2, larg / 2) : 0)} fill={cor(corDe(s, j))} />;
                })}
                {i % passo === 0 && <text x={ESQ + i * banda + banda / 2} y={altura - 6} textAnchor="middle" className="fill-[var(--texto-3)] text-[10.5px]">{r}</text>}
                <rect x={ESQ + i * banda} y={TOPO} width={banda} height={h} fill="transparent" tabIndex={0}
                  onPointerMove={(e) => setHover({ i, x: e.nativeEvent.offsetX, y: e.nativeEvent.offsetY })}
                  onFocus={() => setHover({ i, x: ESQ + i * banda + banda / 2, y: TOPO })} />
              </g>
            );
          })}
          {referencia && referencia.valor > 0 && (
            <g pointerEvents="none">
              <line x1={ESQ} x2={largura} y1={y(referencia.valor)} y2={y(referencia.valor)} stroke="var(--texto-2)" strokeWidth={1.25} strokeDasharray="5 4" />
              <text x={largura - 2} y={y(referencia.valor) - 5} textAnchor="end" className="fill-[var(--texto-2)] text-[10.5px]"
                style={{ paintOrder: "stroke", stroke: "var(--superficie)", strokeWidth: 3 }}>
                {referencia.rotulo} {f(referencia.valor)}
              </text>
            </g>
          )}
          <line x1={ESQ} x2={largura} y1={y(0)} y2={y(0)} stroke="var(--eixo)" strokeWidth={1} />
        </svg>
      )}
      {hover && (
        <div role="status" className="pointer-events-none absolute z-10 min-w-[150px] rounded-lg border border-borda bg-superficie px-3 py-2 text-[12px] shadow-flutuante"
          style={{ left: hover.x > largura - 200 ? undefined : hover.x + 12, right: hover.x > largura - 200 ? largura - hover.x + 12 : undefined, top: Math.max(0, hover.y - 10) }}>
          <div className="mb-1 text-texto-3">{titulosDica?.[hover.i] ?? rotulos[hover.i]}</div>
          {[...series].map((s, j) => ({ s, j })).reverse().map(({ s, j }) => (
            <div key={s.nome} className="flex items-center gap-2">
              <span className="size-2 rounded-[2px]" style={{ background: cor(corDe(s, j)) }} />
              <span className="num font-medium text-texto">{s.valores[hover.i] == null ? "—" : f(s.valores[hover.i]!)}</span>
              <span className="text-texto-3">{s.nome}</span>
            </div>
          ))}
          {series.length > 1 && <div className="mt-1 border-t border-borda pt-1 text-texto-2">Total <b className="num font-medium text-texto">{f(totais[hover.i])}</b></div>}
          {referencia && <div className="text-texto-3">{referencia.rotulo}: {f(referencia.valor)}</div>}
        </div>
      )}
    </div>
  );
}
