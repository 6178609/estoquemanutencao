/**
 * Fundo da tela de entrada: as órbitas da logo SIM em volta do objeto 3D da logo. Linhas finas, poucos pontos de luz
 * nas cores da marca percorrendo as órbitas e um foguete pequeno em órbita lenta (os pilares da manutenção são
 * foguetes). Só SVG e CSS (sem WebGL): leve, igual em qualquer computador, e parado com "reduzir movimento".
 */

const CENTRO = 600;
interface Orbita { rx: number; ry: number; cor: string; tracejada?: boolean }
const ORBITAS: Orbita[] = [
  { rx: 330, ry: 118, cor: "var(--borda-forte)" },
  { rx: 450, ry: 165, cor: "color-mix(in srgb, var(--color-marca-500) 30%, transparent)", tracejada: true },
  { rx: 575, ry: 215, cor: "var(--borda)" },
];

/** Caminho da elipse para o `offset-path` (no mesmo sistema de coordenadas do quadro de 1200×1200). */
const caminho = ({ rx, ry }: Orbita) =>
  `path('M ${CENTRO - rx} ${CENTRO} A ${rx} ${ry} 0 1 0 ${CENTRO + rx} ${CENTRO} A ${rx} ${ry} 0 1 0 ${CENTRO - rx} ${CENTRO}')`;

const PONTOS = [
  { orbita: 0, cor: "var(--color-marca-500)", duracao: 26, atraso: 0, tam: 7 },
  { orbita: 0, cor: "var(--color-alp-azul)", duracao: 26, atraso: -13, tam: 5 },
  { orbita: 1, cor: "var(--color-alp-laranja)", duracao: 38, atraso: -9, tam: 6 },
  { orbita: 2, cor: "var(--color-alp-amarelo)", duracao: 52, atraso: -30, tam: 5 },
];

const ESTRELAS: [number, number, number][] = [
  [140, 210, 0], [980, 160, 1.2], [1080, 470, 2.4], [210, 930, 0.8], [880, 1010, 1.8], [470, 120, 3], [1120, 820, 2], [70, 600, 1.4],
];

export function OrbitasSim() {
  return (
    <div aria-hidden className="pointer-events-none absolute left-1/2 top-1/2 size-[1200px] -translate-x-1/2 -translate-y-1/2">
      <div className="orbitas-giro relative size-full" style={{ transform: "rotate(-14deg)" }}>
        <svg viewBox="0 0 1200 1200" className="absolute inset-0 size-full" fill="none">
          {ORBITAS.map((o, i) => (
            <ellipse key={i} cx={CENTRO} cy={CENTRO} rx={o.rx} ry={o.ry} stroke={o.cor} strokeWidth={1.2}
              strokeDasharray={o.tracejada ? "3 9" : undefined} strokeLinecap="round" />
          ))}
        </svg>
        {PONTOS.map((p, i) => (
          <span key={i} className="orbita-ponto absolute left-0 top-0 rounded-full"
            style={{
              width: p.tam, height: p.tam, background: p.cor, boxShadow: `0 0 0 4px color-mix(in srgb, ${p.cor} 18%, transparent), 0 0 14px ${p.cor}`,
              offsetPath: caminho(ORBITAS[p.orbita]), animationDuration: `${p.duracao}s`, animationDelay: `${p.atraso}s`,
            }} />
        ))}
        {/* o foguete, em órbita lenta na elipse do meio */}
        <span className="orbita-ponto absolute left-0 top-0" style={{ offsetPath: caminho(ORBITAS[1]), offsetRotate: "auto 90deg", animationDuration: "64s", animationDelay: "-20s" }}>
          <svg width="22" height="34" viewBox="0 0 22 34" className="drop-shadow-[0_3px_6px_rgba(9,9,11,0.18)]">
            <path d="M11 1c5 4 7 10 7 17v6H4v-6C4 11 6 5 11 1z" fill="#fff" stroke="var(--texto-3)" strokeWidth="1.4" />
            <circle cx="11" cy="12" r="2.6" fill="var(--color-alp-azul)" stroke="var(--texto-3)" strokeWidth="1" />
            <path d="M4 17l-3 6v3l3-2M18 17l3 6v3l-3-2" fill="var(--color-marca-500)" />
            <path d="M8 24h6l-1 3h-4z" fill="var(--texto-3)" />
            <path className="orbita-chama" d="M9 27h4l-2 6z" fill="var(--color-alp-laranja)" />
          </svg>
        </span>
      </div>
      {ESTRELAS.map(([x, y, d], i) => (
        <span key={i} className="orbita-estrela absolute size-1 rounded-full bg-[var(--color-marca-300)]"
          style={{ left: x, top: y, animationDelay: `${d}s` }} />
      ))}
    </div>
  );
}
