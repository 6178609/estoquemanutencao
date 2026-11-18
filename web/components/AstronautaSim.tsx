/**
 * Faixa de baixo da tela de entrada: um astronauta, no mesmo traço do foguetinho da logo, corre puxando a logo SIM por
 * uma corda (corpo articulado: quadril, joelhos, ombros, cotovelos). No meio do caminho ele para, acena e fala a frase
 * motivacional do dia num balão (`fraseDoDia`, uma por dia, sem repetir), depois segue. Ciclo de 18 s, só CSS e SVG
 * (classes `astro-*` no globals.css); com "reduzir movimento" a faixa não aparece.
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

/** Capacete com a viseira verde (o globo da logo). */
function Capacete() {
  return (
    <>
      <circle cx="31" cy="15" r="12" {...TRACO} strokeWidth={1.8} />
      <path d="M31 7.5a8.5 7.8 0 0 1 9.4 7.5 8.5 7.8 0 0 1-9.4 7.5 6.5 6.5 0 0 1-3.2-7.5 6.5 6.5 0 0 1 3.2-7.5z" fill="var(--color-marca-500)" />
      <path d="M34.5 10.5q2.8 1.3 3.3 4" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" fill="none" opacity="0.85" />
      <rect x="29" y="1.5" width="4" height="3" rx="1" fill="var(--texto-3)" />
    </>
  );
}

export function AstronautaSim({ frase }: { frase: string }) {
  return (
    <div aria-hidden className="astro-faixa pointer-events-none relative h-[86px] overflow-x-clip [@media(max-height:680px)]:h-[70px] [@media(max-height:680px)]:[zoom:0.8]">
      {/* chão: linha tracejada como as órbitas */}
      <div className="absolute inset-x-0 bottom-[8px] border-b border-dashed border-[var(--borda-forte)]" />
      <div className="astro-trajeto absolute bottom-[8px] left-0 flex items-end">
        {/* a carga: a logo SIM numa corda */}
        <div className="flex items-end">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo_sim.svg" alt="" width={92} height={50} className="origin-bottom drop-shadow-[0_4px_6px_rgba(9,9,11,0.15)]" />
          <span className="astro-corda mb-[40px] block h-[2px] rounded-full bg-[var(--texto-3)]" />
        </div>
        <div className="relative">
          <svg width="60" height="80" viewBox="0 0 60 80" className="overflow-visible">
            {/* correndo */}
            <g className="astro-correndo">
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
                <Capacete />
                {/* braço da frente: ombro e cotovelo, balança oposto à perna da frente */}
                <g className="astro-ombro" style={{ transformOrigin: "31px 31px" }}>
                  <rect x="27.8" y="29" width="6.5" height="11.5" rx="3.2" {...TRACO} />
                  <g className="astro-cotovelo" style={{ transformOrigin: "31px 40px" }}>
                    <rect x="28" y="38.5" width="6" height="10.5" rx="3" {...TRACO} />
                    <circle cx="31" cy="49.5" r="3.1" fill="var(--texto-3)" />
                  </g>
                </g>
              </g>
            </g>
            {/* parado, de frente, acenando e falando */}
            <g className="astro-parado">
              <g className="astro-respira" style={{ transformOrigin: "30px 78px" }}>
                <rect x="23" y="49" width="7" height="24" rx="3.4" {...TRACO_ATRAS} />
                <rect x="31" y="49" width="7" height="24" rx="3.4" {...TRACO} />
                <path d="M21.5 71.5h9v5h-9a2.5 2.5 0 0 1 0-5zM30.5 71.5h9a2.5 2.5 0 0 1 0 5h-9z" fill="var(--texto-3)" />
                {/* braço de trás segurando a corda */}
                <g style={{ transform: "rotate(-8deg)", transformOrigin: "22px 32px" }}>
                  <rect x="8" y="29.5" width="15" height="6.5" rx="3.2" {...TRACO_ATRAS} />
                  <circle cx="8.5" cy="32.8" r="3.3" fill="var(--texto-3)" />
                </g>
                <rect x="12.5" y="25" width="9" height="19" rx="3" fill="#e9eeea" stroke="var(--texto-3)" strokeWidth="1.6" />
                <rect x="19" y="26" width="22" height="26" rx="9" {...TRACO} />
                <rect x="24.5" y="33" width="9.5" height="6" rx="1.5" fill="var(--color-marca-500)" />
                <circle cx="37" cy="44" r="1.3" fill="var(--color-alp-laranja)" />
                <g className="astro-fala" style={{ transformOrigin: "31px 26px" }}><Capacete /></g>
                {/* acenando */}
                <g className="astro-aceno" style={{ transformOrigin: "38px 31px" }}>
                  <rect x="36" y="18" width="6.5" height="15" rx="3.2" {...TRACO} />
                  <circle cx="39.2" cy="17" r="3.4" fill="var(--texto-3)" />
                </g>
              </g>
            </g>
          </svg>
          {/* balão com a frase do dia */}
          <div className="astro-balao absolute bottom-[78px] left-[30px] w-max max-w-[340px] origin-bottom-left rounded-2xl border border-borda bg-white px-3.5 py-2.5 text-[13px] font-medium leading-snug text-texto-2 shadow-flutuante">
            {frase}
            <span className="absolute -bottom-[7px] left-4 size-3 rotate-45 border-b border-r border-borda bg-white" />
          </div>
        </div>
      </div>
    </div>
  );
}
