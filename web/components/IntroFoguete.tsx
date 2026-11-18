/**
 * Abertura da tela de entrada: um foguete (como o da logo SIM) atravessa a tela com rastro de fogo e, quando passa pela
 * logo, ela pulsa com uma onda de luz (`.logo-pulso` e `.onda-abertura` no globals.css); na primeira vez a logo se abre
 * (`.logo-abre`). Repete a cada 12 s. Só CSS e SVG; com "reduzir movimento" fica parado (logo aberta, sem foguete).
 */
export function IntroFoguete() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-20 hidden overflow-hidden lg:block">
      <div className="foguete-voo absolute left-0 top-0">
        <div className="relative" style={{ transform: "rotate(30deg)" }}>
          {/* rastro: chama e fumaça saindo do bocal */}
          <span className="absolute left-1/2 top-[96px] h-[260px] w-[18px] -translate-x-1/2 rounded-full bg-[linear-gradient(180deg,#fff6d8_0%,var(--color-alp-laranja)_14%,rgb(240_120_24/0.35)_35%,rgb(200_210_205/0.25)_60%,transparent_100%)] blur-[2px]" />
          <span className="absolute left-1/2 top-[92px] h-[34px] w-[12px] -translate-x-1/2 rounded-full bg-[#fff6d8] blur-[1px]" />
          <svg width="64" height="100" viewBox="0 0 22 34" className="relative drop-shadow-[0_8px_14px_rgba(9,9,11,0.25)]">
            <path d="M11 1c5 4 7 10 7 17v6H4v-6C4 11 6 5 11 1z" fill="#fff" stroke="var(--texto-3)" strokeWidth="1.2" />
            <circle cx="11" cy="12" r="2.6" fill="var(--color-alp-azul)" stroke="var(--texto-3)" strokeWidth="0.9" />
            <path d="M4 17l-3 6v3l3-2M18 17l3 6v3l-3-2" fill="var(--color-marca-500)" />
            <path d="M8 24h6l-1 3h-4z" fill="var(--texto-3)" />
          </svg>
        </div>
      </div>
    </div>
  );
}
