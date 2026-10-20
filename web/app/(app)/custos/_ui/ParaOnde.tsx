import { brlCurto } from "@/lib/formato";

/** Para onde vai: a maior classe de manutenção em destaque, as outras em blocos menores, e a régua da planejada. */
export interface ParaOndeProps {
  grupos: { grupo: string; valor: number; pct: number }[];
  /** planejada hoje (ordens com plano ÷ custo total), em % */
  planejadaPct: number | null;
  /** meta da planejada = 100% − meta do custo do backlog; null sem meta */
  metaPlanejada: number | null;
  emergencial: number;
  emergencialPct: number | null;
}

const nf1 = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 });
const limita = (v: number) => Math.min(100, Math.max(0, v));

/** Cores pelos selos do site: verde = planejada, laranja = emergencial, cinza = as demais. */
const TOM: Record<string, { fundo: string; texto: string }> = {
  verde: { fundo: "var(--selo-bom-fundo)", texto: "var(--selo-bom-texto)" },
  laranja: { fundo: "var(--selo-serio-fundo)", texto: "var(--selo-serio-texto)" },
  cinza: { fundo: "var(--selo-neutro-fundo)", texto: "var(--selo-neutro-texto)" },
};
const tomDe = (grupo: string) => (grupo === "Planejada" ? TOM.verde : grupo === "Emergencial" ? TOM.laranja : TOM.cinza);

export function ParaOnde({ grupos, planejadaPct, metaPlanejada, emergencial, emergencialPct }: ParaOndeProps) {
  if (!grupos.length) return null;
  const maior = grupos.reduce((a, b) => (b.valor > a.valor ? b : a));
  const menores = grupos.filter((g) => g !== maior);

  return (
    <section className="flex min-w-0 flex-col gap-4 rounded-cartao border border-borda bg-superficie p-5">
      <div>
        <div className="font-display text-[15px] font-medium">Para onde vai</div>
        <div className="mt-0.5 text-[12.5px] text-texto-3">Custo por classe de manutenção no período</div>
      </div>

      <div className="rounded-cartao bg-marca-700 p-5 text-white">
        <div className="text-[11.5px] font-medium tracking-[0.12em] text-white/80">MAIOR CLASSE</div>
        <div className="mt-1.5 font-display text-[18px] font-medium">{maior.grupo}</div>
        <div className="num mt-2 font-display text-[34px] font-medium leading-none tracking-[-0.02em]">{nf1.format(maior.pct)}%</div>
        <div className="mt-1.5 text-[13px] text-white/85">{brlCurto(maior.valor)} do custo</div>
      </div>

      {menores.length > 0 && (
        <div className="grid grid-cols-3 gap-2">
          {menores.map((g) => {
            const t = tomDe(g.grupo);
            return (
              <div key={g.grupo} className="min-w-0 rounded-cartao p-3" style={{ background: t.fundo, color: t.texto }}>
                <div className="text-[12px] font-medium">{g.grupo}</div>
                <div className="num mt-1 font-display text-[18px] font-medium leading-none">{nf1.format(g.pct)}%</div>
                <div className="mt-1 text-[12px]">{brlCurto(g.valor)}</div>
              </div>
            );
          })}
        </div>
      )}

      {planejadaPct != null && (
        <div>
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 text-[12.5px] text-texto-2">
            <span>Planejada hoje × meta</span>
            <span className="num">
              <b className="font-medium text-texto">{nf1.format(planejadaPct)}%</b>
              {metaPlanejada != null && <> · meta {nf1.format(metaPlanejada)}%</>}
            </span>
          </div>
          <div aria-hidden className="relative mt-2 h-2.5 rounded-full bg-superficie-3">
            <div className="absolute inset-y-0 left-0 rounded-full bg-marca-500" style={{ width: `${limita(planejadaPct)}%` }} />
            {metaPlanejada != null && (
              <div className="absolute -top-1 h-4 w-0.5" style={{ left: `${limita(metaPlanejada)}%`, background: "var(--texto)" }} />
            )}
          </div>
        </div>
      )}

      {emergencial > 0 && (
        <div className="rounded-cartao border-l-4 bg-superficie-2 p-4" style={{ borderLeftColor: "var(--st-serio)" }}>
          <div className="text-[12.5px] font-medium text-texto">Emergencial no período</div>
          <div className="num mt-1 font-display text-[20px] font-medium">{brlCurto(emergencial)}</div>
          <div className="mt-1 text-[12.5px] text-texto-2">
            {emergencialPct != null ? `${nf1.format(emergencialPct)}% do custo · ` : ""}ordens de tipo emergencial (ex.: YM11).
          </div>
        </div>
      )}
    </section>
  );
}
