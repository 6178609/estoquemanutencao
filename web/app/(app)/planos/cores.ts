import type { Cor } from "@/components/graficos";
import * as planos from "@/lib/wcm/planos";

/**
 * Situação da chamada → cor. A cor é status (sempre junto do símbolo ✓ ● ! ○ – · e do nome):
 * Concluída = bom, Atrasada = crítico, Em aberto (ordem gerada, ainda no prazo) = azul informativo,
 * Programada (futura, ordem ainda não gerada) = vazada, Saltada/cancelada e sem status = cinza.
 */
export const COR_SITUACAO: Record<planos.SituacaoChamada, Cor> = {
  [planos.CONCLUIDA]: "st-bom", [planos.ABERTA]: "serie-1", [planos.ATRASADA]: "st-critico",
  [planos.PROGRAMADA]: "neutro", [planos.SALTADA]: "neutro", [planos.SEM_STATUS]: "neutro",
};

const corCss = (c: Cor) => (c === "neutro" ? "var(--texto-4)" : `var(--${c})`);
const tinta = (c: Cor, pct = 16) => `color-mix(in srgb, ${corCss(c)} ${pct}%, transparent)`;

/** Estilo da célula do calendário (fundo, borda, texto): o texto fica sempre na cor do texto, nunca na da série. */
export function estiloCelula(s: planos.SituacaoChamada): { background: string; border: string; color: string } {
  switch (s) {
    case planos.CONCLUIDA: return { background: tinta("st-bom", 55), border: "transparent", color: "var(--texto)" };
    case planos.ABERTA: return { background: tinta("serie-1", 50), border: "transparent", color: "var(--texto)" };
    case planos.ATRASADA: return { background: tinta("st-critico", 62), border: "transparent", color: "var(--texto)" };
    case planos.PROGRAMADA: return { background: "transparent", border: "var(--texto-4)", color: "var(--texto-2)" };
    case planos.SALTADA: return { background: "var(--superficie-3)", border: "transparent", color: "var(--texto-3)" };
    default: return { background: "var(--superficie-2)", border: "var(--borda)", color: "var(--texto-3)" };
  }
}

export const EXPLICA: Record<planos.SituacaoChamada, string> = {
  [planos.CONCLUIDA]: "Chamada com data de conclusão, programação concluída na IP19 ou ordem concluída no IW38.",
  [planos.ABERTA]: "A ordem já foi gerada (chamada/solicitada) e a data ainda não passou.",
  [planos.ATRASADA]: "A data planejada já passou e a chamada não foi concluída.",
  [planos.PROGRAMADA]: "Chamada futura, ainda em espera (a ordem não foi gerada).",
  [planos.SALTADA]: "Chamada saltada/ignorada na IP19 ou ordem cancelada no IW38 — não conta na aderência.",
  [planos.SEM_STATUS]: "Ordem antiga sem status no export do IW38 (só quando o calendário vem do próprio IW38).",
};
