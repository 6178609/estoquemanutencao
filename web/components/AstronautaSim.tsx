/**
 * Faixa de baixo da tela de entrada: um astronauta, no mesmo traço do foguetinho da logo, corre na horizontal puxando a
 * logo SIM por uma corda; no meio do caminho tropeça e cai de cara, a logo escorrega e bate nele, aparecem estrelinhas de
 * tontura, ele levanta e segue. Ciclo de 16 s, só CSS e SVG (classes `astro-*` no globals.css); com "reduzir movimento"
 * a faixa não aparece.
 */
export function AstronautaSim() {
  return (
    <div aria-hidden className="astro-faixa pointer-events-none relative h-[66px] overflow-x-clip">
      {/* chão: linha tracejada como as órbitas */}
      <div className="absolute inset-x-0 bottom-[10px] border-b border-dashed border-[var(--borda-forte)]" />
      <div className="astro-trajeto absolute bottom-[11px] left-0 flex items-end">
        {/* a carga: a logo SIM numa corda */}
        <div className="flex items-end">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo_sim.svg" alt="" width={96} height={52} className="astro-logo origin-bottom drop-shadow-[0_4px_6px_rgba(9,9,11,0.15)]" />
          <span className="astro-corda mb-[30px] block h-[2px] rounded-full bg-[var(--texto-3)]" />
        </div>
        <div className="astro-corpo relative origin-bottom">
          <svg width="46" height="62" viewBox="0 0 46 62" className="overflow-visible">
            {/* mochila */}
            <rect x="4" y="18" width="10" height="18" rx="3" fill="#e9eeea" stroke="var(--texto-3)" strokeWidth="1.6" />
            {/* pernas (correndo) */}
            <g className="astro-perna-a" style={{ transformOrigin: "21px 42px" }}>
              <rect x="17" y="40" width="8" height="16" rx="3.5" fill="#fff" stroke="var(--texto-3)" strokeWidth="1.6" />
              <rect x="16" y="53" width="11" height="5" rx="2" fill="var(--texto-3)" />
            </g>
            <g className="astro-perna-b" style={{ transformOrigin: "27px 42px" }}>
              <rect x="23" y="40" width="8" height="16" rx="3.5" fill="#fff" stroke="var(--texto-3)" strokeWidth="1.6" />
              <rect x="22" y="53" width="11" height="5" rx="2" fill="var(--texto-3)" />
            </g>
            {/* corpo */}
            <rect x="12" y="20" width="22" height="24" rx="8" fill="#fff" stroke="var(--texto-3)" strokeWidth="1.6" />
            <rect x="17" y="27" width="9" height="6" rx="1.5" fill="var(--color-marca-500)" />
            {/* braço de trás puxando a corda */}
            <g className="astro-braco" style={{ transformOrigin: "16px 24px" }}>
              <rect x="2" y="24" width="15" height="6" rx="3" fill="#fff" stroke="var(--texto-3)" strokeWidth="1.6" />
            </g>
            {/* capacete com viseira verde (o globo da logo) */}
            <circle cx="24" cy="12" r="11" fill="#fff" stroke="var(--texto-3)" strokeWidth="1.8" />
            <path d="M24 5.5a7.5 7 0 0 1 8.5 6.5 7.5 7 0 0 1-8.5 6.5 6 6 0 0 1-3-6.5 6 6 0 0 1 3-6.5z" fill="var(--color-marca-500)" />
            <path d="M27 8.5q2.5 1.2 3 3.5" stroke="#fff" strokeWidth="1.4" strokeLinecap="round" fill="none" opacity="0.8" />
            {/* braço da frente */}
            <g className="astro-braco-b" style={{ transformOrigin: "30px 24px" }}>
              <rect x="29" y="23" width="6" height="14" rx="3" fill="#fff" stroke="var(--texto-3)" strokeWidth="1.6" />
            </g>
          </svg>
          {/* estrelinhas de tontura e a poeira da queda */}
          <span className="astro-tontura absolute -top-3 left-6 text-[13px] leading-none text-[var(--color-alp-amarelo)]">✦ ✧ ✦</span>
          <span className="astro-poeira absolute bottom-0 left-8 size-6 rounded-full bg-[var(--borda-forte)]" />
        </div>
      </div>
    </div>
  );
}
