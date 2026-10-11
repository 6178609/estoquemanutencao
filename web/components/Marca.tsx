import Image from "next/image";

export function Marca({ compacta = false, claro = false }: { compacta?: boolean; claro?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <div className="grid size-9 shrink-0 place-items-center rounded-[10px] border border-borda bg-white">
        <Image src="/logo_sim.png" alt="SIM Manutenção Profissional" width={28} height={28} className="object-contain" priority />
      </div>
      {!compacta && (
        <div className="leading-tight">
          <div className={claro ? "font-display text-[15px] font-medium tracking-[-0.02em] text-white" : "font-display text-[15px] font-medium tracking-[-0.02em] text-texto"}>Central de Manutenção</div>
          <div className={claro ? "text-[11.5px] text-white/60" : "text-[11.5px] text-texto-3"}>PCM F26 · Alpargatas</div>
        </div>
      )}
    </div>
  );
}
