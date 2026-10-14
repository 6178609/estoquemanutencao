import clsx from "clsx";
import { ChevronRight, type LucideIcon } from "lucide-react";
import Link from "next/link";

/**
 * Design system no estilo do template de referência (21st.dev · Developer Tools Landing): base neutra, tipografia
 * faz a hierarquia — título em dois tons, a segunda parte no cinza SIM —, cartões claros com borda fina e ícone
 * num quadradinho. As cores vêm só das logos (verde SIM e o espectro Alpargatas).
 */

export const ESPECTRO = {
  verde: "#009c48", azul: "#006cb4", ciano: "#009cd8", celeste: "#6cccf0", lima: "#a8c024", amarelo: "#fcb40c",
  laranja: "#f07818", vermelho: "#e41824",
} as const;
export type Tom = keyof typeof ESPECTRO | "neutro";

export const BOTAO_PRIMARIO =
  "inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-marca-500 px-5 font-display text-[15px] font-medium text-white transition hover:bg-marca-600 disabled:cursor-not-allowed disabled:opacity-60";
export const BOTAO_SECUNDARIO =
  "inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-borda bg-superficie px-4 font-display text-[15px] font-medium text-texto transition hover:bg-superficie-2";

/** Pílula do topo da seção ("4.093 materiais · MB52 de hoje ›"). */
export function Pilula({ children, href }: { children: React.ReactNode; href?: string }) {
  const cls = "inline-flex items-center gap-1.5 rounded-full border border-borda-forte bg-superficie-2 px-3 py-1 text-[12.5px] font-medium text-texto-2";
  return href ? <Link prefetch={false} href={href} className={clsx(cls, "transition hover:text-texto")}>{children}<ChevronRight className="size-3.5" /></Link>
    : <span className={cls}>{children}</span>;
}

/** Título em dois tons: `titulo` em preto, `destaque` no cinza (é o que dá sentido à frase). */
export function Titulo({ titulo, destaque, nivel = 1, className }: { titulo: string; destaque?: string; nivel?: 1 | 2;
  className?: string }) {
  const H = nivel === 1 ? "h1" : "h2";
  return (
    <H className={clsx("font-display font-medium tracking-[-0.03em] text-texto",
      nivel === 1 ? "text-[34px] leading-[1.06] sm:text-[46px]" : "text-[28px] leading-[1.1] sm:text-[34px]", className)}>
      {titulo}{destaque && <> <span className="tom2">{destaque}</span></>}
    </H>
  );
}

export function Cabecalho({ titulo, destaque, subtitulo, sobre, acoes }: { titulo: string; destaque?: string;
  subtitulo?: string; sobre?: React.ReactNode; acoes?: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
      <div className="space-y-4">
        {sobre && <div>{typeof sobre === "string" ? <Pilula>{sobre}</Pilula> : sobre}</div>}
        <Titulo titulo={titulo} destaque={destaque} />
        {subtitulo && <p className="max-w-2xl text-[15px] leading-relaxed text-texto-3">{subtitulo}</p>}
      </div>
      {acoes && <div className="flex shrink-0 flex-wrap items-center gap-2">{acoes}</div>}
    </div>
  );
}

/** Ícone num quadradinho com borda (como nos cartões do template); a cor vem do espectro das logos. */
export function IconeQuadro({ icone: I, tom = "neutro", grande }: { icone: LucideIcon; tom?: Tom; grande?: boolean }) {
  return (
    <span className={clsx("grid shrink-0 place-items-center rounded-[10px] border border-borda bg-superficie",
      grande ? "size-12" : "size-9")}
      style={tom !== "neutro" ? { color: ESPECTRO[tom] } : undefined}>
      <I className={clsx(grande ? "size-5" : "size-[17px]", tom === "neutro" && "text-texto-2")} strokeWidth={1.75} />
    </span>
  );
}

export function Kpi({ rotulo, valor, detalhe, icone, tom = "verde", dica }: { rotulo: string; valor: string;
  detalhe?: string; icone?: LucideIcon; tom?: Tom; dica?: string }) {
  return (
    <div title={dica} className="rounded-cartao border border-borda bg-superficie-2 p-5 transition hover:border-borda-forte">
      {icone && <IconeQuadro icone={icone} tom={tom} />}
      <div className={clsx("text-[13.5px] font-medium text-texto-2", icone && "mt-4")}>{rotulo}</div>
      <div className="num mt-1.5 font-display text-[32px] font-medium leading-none tracking-[-0.03em]">{valor}</div>
      {detalhe && <div className="mt-2 text-[12.5px] leading-snug text-texto-3">{detalhe}</div>}
    </div>
  );
}

/** Faixa de números grandes (como a do template): o que a tela tem, em uma linha. */
export function FaixaNumeros({ itens }: { itens: { valor: string; rotulo: string; tom?: Tom }[] }) {
  return (
    <div className="grid grid-cols-2 gap-y-6 rounded-cartao border border-borda bg-superficie-2 px-4 py-7 sm:grid-cols-4">
      {itens.map((i) => (
        <div key={i.rotulo} className="text-center">
          <div className="num font-display text-[34px] font-medium leading-none tracking-[-0.03em]"
            style={i.tom && i.tom !== "neutro" ? { color: ESPECTRO[i.tom] } : undefined}>{i.valor}</div>
          <div className="mt-2 text-[12.5px] text-texto-3">{i.rotulo}</div>
        </div>
      ))}
    </div>
  );
}

const SELO: Record<string, string> = {
  verde: "#009c48", azul: "#006cb4", laranja: "#f07818", vermelho: "#e41824", amarelo: "#b58100", ciano: "#0083b5",
};

export function Selo({ cor = "cinza", children, className }: { cor?: "verde" | "azul" | "laranja" | "vermelho" | "amarelo" | "ciano" | "cinza";
  children: React.ReactNode; className?: string }) {
  const c = SELO[cor];
  return (
    <span className={clsx("inline-flex items-center gap-1 whitespace-nowrap rounded-md px-1.5 py-0.5 text-[11.5px] font-medium",
      !c && "bg-superficie-3 text-texto-2", className)}
      style={c ? { color: c, backgroundColor: `color-mix(in srgb, ${c} 11%, transparent)` } : undefined}>
      {children}
    </span>
  );
}

export function Cartao({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={clsx("rounded-cartao border border-borda bg-superficie", className)}>{children}</div>;
}

export function Pagina({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto w-full max-w-[1240px] space-y-10 px-4 py-8 sm:px-8 sm:py-12">{children}</div>;
}
