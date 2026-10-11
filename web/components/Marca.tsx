import Image from "next/image";

export function Marca({ compacta = false, claro = false }: { compacta?: boolean; claro?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-white shadow-cartao ring-1 ring-black/5">
        <Image src="/logo_sim.png" alt="SIM Manutenção Profissional" width={30} height={30} className="object-contain" priority />
      </div>
      {!compacta && (
        <div className="leading-tight">
          <div className={claro ? "font-display text-[15px] font-bold tracking-tight text-white" : "font-display text-[15px] font-bold tracking-tight text-texto"}>Central de Manutenção</div>
          <div className={claro ? "text-xs font-medium text-white/60" : "text-xs font-medium text-texto-3"}>PCM F26 · Alpargatas</div>
        </div>
      )}
    </div>
  );
}
