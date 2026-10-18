import Image from "next/image";

/** `claro`: texto branco, para o fundo verde do menu. Sem ele, texto escuro para fundo claro (tela de entrada). */
export function Marca({ compacta = false, claro = false }: { compacta?: boolean; claro?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <div className="grid size-10 shrink-0 place-items-center rounded-[10px] bg-white p-1">
        <Image src="/logo_sim.svg" alt="SIM Manutenção Profissional" width={32} height={32} unoptimized className="size-full object-contain" priority />
      </div>
      {!compacta && (
        <div className="leading-tight">
          <div className={claro ? "font-display text-[15px] font-medium tracking-[-0.02em] text-white" : "font-display text-[15px] font-medium tracking-[-0.02em] text-texto"}>Central de Manutenção</div>
          <div className={claro ? "text-[11.5px] text-menu-apoio" : "text-[11.5px] text-texto-3"}>PCM · F26</div>
        </div>
      )}
    </div>
  );
}

/** A logo SIM Manutenção grande (vetor, nítida em qualquer tela), num quadro branco que gira devagar em 3D.
 *  Legível também no tema escuro; com "reduzir movimento" ligado, fica parada. Tela de entrada. */
export function LogoSim({ largura = 140 }: { largura?: number }) {
  return (
    <div className="logo-3d w-fit">
      <div className="relative overflow-hidden rounded-cartao border border-borda bg-white px-4 py-3 shadow-flutuante">
        <Image src="/logo_sim.svg" alt="SIM Manutenção Profissional" width={largura} height={Math.round((largura * 540) / 1000)} priority unoptimized />
        <span aria-hidden className="logo-brilho pointer-events-none absolute inset-0 bg-[linear-gradient(105deg,transparent_35%,rgba(255,255,255,0.75)_50%,transparent_65%)]" />
      </div>
    </div>
  );
}
