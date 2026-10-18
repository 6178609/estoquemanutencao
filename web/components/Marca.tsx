import Image from "next/image";

/** `claro`: texto branco, para o fundo verde do menu. Sem ele, texto escuro para fundo claro (tela de entrada). */
export function Marca({ compacta = false, claro = false }: { compacta?: boolean; claro?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <div className="grid size-10 shrink-0 place-items-center rounded-[10px] bg-white p-1">
        <Image src="/logo_sim.png" alt="SIM Manutenção Profissional" width={32} height={32} className="size-full object-contain" priority />
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

/** A logo SIM Manutenção em tamanho grande, num quadro branco (legível também no tema escuro). Tela de entrada. */
export function LogoSim({ largura = 140 }: { largura?: number }) {
  return (
    <div className="flex w-fit rounded-cartao border border-borda bg-white px-4 py-3">
      <Image src="/logo_sim.png" alt="SIM Manutenção Profissional" width={largura} height={Math.round((largura * 68) / 125)} priority />
    </div>
  );
}
