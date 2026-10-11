import clsx from "clsx";
import type { LucideIcon } from "lucide-react";

export function Cabecalho({ titulo, subtitulo, sobre, acoes }: { titulo: string; subtitulo?: string; sobre?: string;
  acoes?: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        {sobre && <p className="mb-1 font-display text-xs font-semibold uppercase tracking-[0.16em] text-marca-700 dark:text-marca-300">{sobre}</p>}
        <h1 className="font-display text-3xl font-extrabold tracking-tight sm:text-[34px]">{titulo}</h1>
        {subtitulo && <p className="mt-1.5 max-w-3xl text-[15px] text-texto-2">{subtitulo}</p>}
      </div>
      {acoes && <div className="flex shrink-0 flex-wrap items-center gap-2">{acoes}</div>}
    </div>
  );
}

const TONS = {
  marca: "from-marca-500/15 text-marca-700 dark:text-marca-300",
  acao: "from-acao-500/15 text-acao-500",
  alerta: "from-alerta-500/15 text-alerta-500",
  perigo: "from-perigo-500/15 text-perigo-500",
  neutro: "from-black/5 text-texto-2 dark:from-white/10",
};

export function Kpi({ rotulo, valor, detalhe, icone: I, tom = "marca", dica }: { rotulo: string; valor: string;
  detalhe?: string; icone?: LucideIcon; tom?: keyof typeof TONS; dica?: string }) {
  return (
    <div title={dica} className="group relative overflow-hidden rounded-cartao border border-borda bg-superficie p-5 shadow-cartao transition hover:-translate-y-0.5 hover:shadow-flutuante">
      <div className={clsx("pointer-events-none absolute -right-8 -top-8 size-28 rounded-full bg-gradient-to-br to-transparent blur-xl", TONS[tom])} />
      <div className="relative flex items-start justify-between gap-3">
        <div className="text-[13px] font-medium text-texto-2">{rotulo}</div>
        {I && <span className={clsx("grid size-9 place-items-center rounded-xl bg-gradient-to-br", TONS[tom])}><I className="size-[18px]" /></span>}
      </div>
      <div className="num relative mt-3 font-display text-[30px] font-extrabold leading-none tracking-tight">{valor}</div>
      {detalhe && <div className="relative mt-2 text-[13px] text-texto-3">{detalhe}</div>}
    </div>
  );
}

const SELO = {
  verde: "bg-marca-500/12 text-marca-700 ring-marca-500/25 dark:text-marca-300",
  azul: "bg-acao-500/10 text-acao-500 ring-acao-500/25",
  laranja: "bg-alerta-500/12 text-alerta-500 ring-alerta-500/30",
  vermelho: "bg-perigo-500/10 text-perigo-500 ring-perigo-500/25",
  cinza: "bg-black/[0.04] text-texto-2 ring-black/10 dark:bg-white/10 dark:ring-white/15",
};

export function Selo({ cor = "cinza", children, className }: { cor?: keyof typeof SELO; children: React.ReactNode; className?: string }) {
  return <span className={clsx("inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ring-inset", SELO[cor], className)}>{children}</span>;
}

export function Cartao({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={clsx("rounded-cartao border border-borda bg-superficie shadow-cartao", className)}>{children}</div>;
}

export function Pagina({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto w-full max-w-[1500px] space-y-6 px-4 py-6 sm:px-8 sm:py-8">{children}</div>;
}
