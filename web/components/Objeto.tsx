/**
 * O "objeto" das seções de destaque (como o logo 3D do template): o mosaico de triângulos da Alpargatas desenhado em
 * SVG, com as cores exatas da logo, um leve relevo em cada peça e um halo suave atrás.
 */
const COR = {
  azul: "#006cb4", laranja: "#f07818", ciano: "#009cd8", lima: "#a8c024", vermelho: "#e41824", amarelo: "#fcb40c",
  celeste: "#6cccf0", verde: "#009c48",
};

// linha, posição e se aponta para cima (3 linhas: 1 + 3 + 5 peças; a do meio de baixo é o vão do "A")
const PECAS: { r: number; i: number; cima: boolean; cor: keyof typeof COR | null }[] = [
  { r: 0, i: 0, cima: true, cor: "azul" },
  { r: 1, i: 0, cima: true, cor: "laranja" }, { r: 1, i: 0, cima: false, cor: "ciano" }, { r: 1, i: 1, cima: true, cor: "lima" },
  { r: 2, i: 0, cima: true, cor: "vermelho" }, { r: 2, i: 0, cima: false, cor: "amarelo" }, { r: 2, i: 1, cima: true, cor: null },
  { r: 2, i: 1, cima: false, cor: "celeste" }, { r: 2, i: 2, cima: true, cor: "verde" },
];

export function Objeto({ className = "", tamanho = 420 }: { className?: string; tamanho?: number }) {
  const W = 300, H = 260, cx = 200, topo = 70, w = W / 3, h = H / 3;
  const pontos = (r: number, i: number, cima: boolean) => {
    const x0 = cx - (r * w) / 2 + i * w, y0 = topo + r * h, y1 = y0 + h;
    return cima ? `${x0},${y0} ${x0 - w / 2},${y1} ${x0 + w / 2},${y1}` : `${x0},${y0} ${x0 + w},${y0} ${x0 + w / 2},${y1}`;
  };
  return (
    <div className={`relative ${className}`} style={{ width: tamanho, maxWidth: "100%", aspectRatio: "1" }} aria-hidden>
      <div className="absolute inset-[6%] rounded-full"
        style={{ background: "radial-gradient(circle at 50% 45%, color-mix(in srgb, var(--texto) 7%, transparent) 0%, color-mix(in srgb, var(--texto) 3%, transparent) 45%, transparent 70%)" }} />
      <svg viewBox="0 0 400 400" className="flutuar relative size-full drop-shadow-[0_30px_40px_rgba(9,9,11,0.18)]">
        <defs>
          {Object.entries(COR).map(([nome, c]) => (
            <linearGradient key={nome} id={`g-${nome}`} x1="0" y1="0" x2="0.35" y2="1">
              <stop offset="0" stopColor={c} stopOpacity="0.78" />
              <stop offset="0.55" stopColor={c} />
              <stop offset="1" stopColor={c} />
            </linearGradient>
          ))}
          <linearGradient id="brilho" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#fff" stopOpacity="0.45" />
            <stop offset="0.5" stopColor="#fff" stopOpacity="0" />
          </linearGradient>
        </defs>
        <ellipse cx="200" cy="352" rx="150" ry="10" fill="currentColor" className="text-black/10 dark:text-white/5" />
        {PECAS.filter((p) => p.cor).map((p, k) => (
          <g key={k}>
            <polygon points={pontos(p.r, p.i, p.cima)} fill={`url(#g-${p.cor})`} stroke="var(--fundo)" strokeWidth="3" strokeLinejoin="round" />
            <polygon points={pontos(p.r, p.i, p.cima)} fill="url(#brilho)" stroke="none" />
          </g>
        ))}
      </svg>
    </div>
  );
}
