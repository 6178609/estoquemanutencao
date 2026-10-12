import type { Cor } from "@/components/graficos";
import * as planos from "@/lib/wcm/planos";

/**
 * Situação da chamada → cor (é status: sempre junto do símbolo ✓ ● ! ○ – e do nome).
 * Concluída = bom, Atrasada = crítico, Em aberto (ordem gerada, no prazo) = atenção, Programada (futura) = azul,
 * Saltada/cancelada e sem status = cinza.
 */
export const COR_SITUACAO: Record<planos.SituacaoChamada, Cor> = {
  [planos.CONCLUIDA]: "st-bom", [planos.ABERTA]: "st-atencao", [planos.ATRASADA]: "st-critico",
  [planos.PROGRAMADA]: "serie-1", [planos.SALTADA]: "neutro", [planos.SEM_STATUS]: "neutro",
};

export const corCss = (c: Cor) => (c === "neutro" ? "var(--texto-4)" : `var(--${c})`);
export const tinta = (c: Cor, pct = 16) => `color-mix(in srgb, ${corCss(c)} ${pct}%, transparent)`;

export const EXPLICA: Record<planos.SituacaoChamada, string> = {
  [planos.CONCLUIDA]: "Chamada com data de conclusão, programação concluída na IP19 ou ordem concluída no IW38.",
  [planos.ABERTA]: "A ordem já foi gerada (chamada/solicitada) e a data ainda não passou.",
  [planos.ATRASADA]: "A data planejada já passou e a chamada não foi concluída.",
  [planos.PROGRAMADA]: "Chamada futura, ainda em espera (a ordem não foi gerada).",
  [planos.SALTADA]: "Chamada saltada/ignorada na IP19 ou ordem cancelada no IW38 — não conta na aderência.",
  [planos.SEM_STATUS]: "Ordem antiga sem status no export do IW38 (só quando o calendário vem do próprio IW38).",
};
