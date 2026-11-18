/**
 * Faixa de baixo da tela de entrada: um astronauta, no mesmo traço do foguetinho da logo, corre puxando a logo SIM por
 * uma corda. Corpo articulado (quadril, joelhos, ombros, cotovelos) com passada natural, balanço e inclinação; no meio do
 * caminho tropeça, abana os braços, cai de cara e quica, a logo escorrega e bate nele, ele balança a cabeça tonto,
 * levanta se apoiando e segue. Ciclo de 16 s, só CSS e SVG (classes `astro-*` no globals.css); com "reduzir movimento"
 * a faixa não aparece.
 */

const TRACO = { fill: "#fff", stroke: "var(--texto-3)", strokeWidth: 1.6 } as const;
const TRACO_ATRAS = { fill: "#e6ebe7", stroke: "var(--texto-3)", strokeWidth: 1.6 } as const;

/** Perna articulada: coxa gira no quadril, canela no joelho. `atras` = perna de trás (mais escura, meio passo defasada). */
function Perna({ atras }: { atras?: boolean }) {
  const t = atras ? TRACO_ATRAS : TRACO;
  return (
    <g className={atras ? "astro-coxa astro-defasado" : "astro-coxa"} style={{ transformOrigin: "30px 50px" }}>
      <rect x="26.5" y="48" width="7.5" height="14" rx="3.5" {...t} />
      <g className={atras ? "astro-canela astro-defasado" : "astro-canela"} style={{ transformOrigin: "30px 61px" }}>
        <rect x="26.8" y="60" width="7" height="13" rx="3.2" {...t} />
        <path d="M26 71.5h10.5a2.5 2.5 0 0 1 0 5H26z" fill="var(--texto-3)" />
      </g>
    </g>
  );
}

export function AstronautaSim() {
  return (
    <div aria-hidden className="astro-faixa pointer-events-none relative h-[86px] overflow-x-clip [@media(max-height:680px)]:h-[70px] [@media(max-height:680px)]:[zoom:0.8]">
      {/* chão: linha tracejada como as órbitas */}
      <div className="absolute inset-x-0 bottom-[8px] border-b border-dashed border-[var(--borda-forte)]" />
      <div className="astro-trajeto absolute bottom-[8px] left-0 flex items-end">
        {/* a carga: a logo SIM numa corda */}
        <div className="flex items-end">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo_sim.svg" alt="" width={92} height={50} className="astro-logo origin-bottom drop-shadow-[0_4px_6px_rgba(9,9,11,0.15)]" />
          <span className="astro-corda mb-[40px] block h-[2px] rounded-full bg-[var(--texto-3)]" />
        </div>
        <div className="relative">
          <svg width="60" height="80" viewBox="0 0 60 80" className="overflow-visible">
            {/* queda (linha do tempo de 16 s), girando pelos pés */}
            <g className="astro-queda" style={{ transformOrigin: "30px 78px" }}>
              {/* quique da corrida e inclinação para frente */}
              <g className="astro-quica">
                <Perna atras />
                {/* braço de trás: puxa a corda, com um tranco a cada passo */}
                <g className="astro-puxa" style={{ transformOrigin: "26px 32px" }}>
                  <rect x="10" y="29.5" width="17" height="6.5" rx="3.2" {...TRACO_ATRAS} />
                  <circle cx="10" cy="32.8" r="3.3" fill="var(--texto-3)" />
                </g>
                {/* mochila e tronco */}
                <rect x="12.5" y="25" width="9" height="19" rx="3" fill="#e9eeea" stroke="var(--texto-3)" strokeWidth="1.6" />
                <rect x="19" y="26" width="22" height="26" rx="9" {...TRACO} />
                <rect x="24.5" y="33" width="9.5" height="6" rx="1.5" fill="var(--color-marca-500)" />
                <circle cx="37" cy="44" r="1.3" fill="var(--color-alp-laranja)" />
                <Perna />
                {/* cabeça: capacete com a viseira verde (o globo da logo) */}
                <g className="astro-cabeca" style={{ transformOrigin: "31px 26px" }}>
                  <circle cx="31" cy="15" r="12" {...TRACO} strokeWidth={1.8} />
                  <path d="M31 7.5a8.5 7.8 0 0 1 9.4 7.5 8.5 7.8 0 0 1-9.4 7.5 6.5 6.5 0 0 1-3.2-7.5 6.5 6.5 0 0 1 3.2-7.5z" fill="var(--color-marca-500)" />
                  <path d="M34.5 10.5q2.8 1.3 3.3 4" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" fill="none" opacity="0.85" />
                  <rect x="29" y="1.5" width="4" height="3" rx="1" fill="var(--texto-3)" />
                </g>
                {/* braço da frente: ombro e cotovelo, balança oposto à perna da frente */}
                <g className="astro-giro" style={{ transformOrigin: "31px 31px" }}>
                  <g className="astro-ombro" style={{ transformOrigin: "31px 31px" }}>
                    <rect x="27.8" y="29" width="6.5" height="11.5" rx="3.2" {...TRACO} />
                    <g className="astro-cotovelo" style={{ transformOrigin: "31px 40px" }}>
                      <rect x="28" y="38.5" width="6" height="10.5" rx="3" {...TRACO} />
                      <circle cx="31" cy="49.5" r="3.1" fill="var(--texto-3)" />
                    </g>
                  </g>
                </g>
              </g>
            </g>
          </svg>
          {/* estrelinhas de tontura e a poeira da queda */}
          <span className="astro-tontura absolute -top-1 left-[46px] text-[13px] leading-none text-[var(--color-alp-amarelo)]">✦ ✧ ✦</span>
          <span className="astro-poeira absolute bottom-0 left-12 size-7 rounded-full bg-[var(--borda-forte)]" />
        </div>
      </div>
    </div>
  );
}
