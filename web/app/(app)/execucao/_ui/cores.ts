import type { Cor } from "@/components/graficos";
import * as af from "@/lib/wcm/af";
import * as ex from "@/lib/wcm/execucao";
import * as pr from "@/lib/wcm/preditiva";

/**
 * Cor de cada situação nas telas (a cor aqui significa situação: sempre acompanhada do rótulo). Concluída no prazo =
 * bom; concluída fora / sem confirmação = atenção; vencendo / sem ordem = sério; atrasada = crítico; em andamento =
 * azul de série (neutro de progresso); cancelada / não iniciada = cinza.
 */
export const COR_ATIVIDADE: Record<string, Cor> = {
  [ex.EXECUTADA]: "st-bom", [ex.SEM_APONTAMENTO]: "st-atencao", [ex.ATRASADA]: "st-critico", [ex.PROGRAMADA]: "serie-1",
  [ex.CANCELADA]: "neutro",
};

export const COR_ANOMALIA: Record<string, Cor> = {
  [pr.TRATADA]: "st-bom", [pr.SEM_CONF]: "st-atencao", [pr.TRATATIVA]: "serie-1", [pr.ATRASADA]: "st-critico",
  [pr.SEM_ORDEM]: "st-serio", [pr.CANCELADA]: "neutro",
};

export const COR_AF: Record<string, Cor> = {
  [af.AF_NO_PRAZO]: "st-bom", [af.AF_FORA_PRAZO]: "st-atencao", [af.AF_ATRASADA]: "st-critico", [af.AF_RISCO]: "st-serio",
  [af.AF_ANDAMENTO]: "serie-1", [af.AF_CANCELADA]: "neutro",
  // grupos dos gráficos
  [af.G_ABERTO]: "serie-1",
};

export const COR_ACAO: Record<string, Cor> = {
  [af.AC_NO_PRAZO]: "st-bom", [af.AC_FORA_PRAZO]: "st-atencao", [af.AC_ATRASADA]: "st-critico", [af.AC_VENCE]: "st-serio",
  [af.AC_ANDAMENTO]: "serie-1", [af.AC_NAO_INICIADA]: "neutro", [af.AC_CANCELADA]: "neutro",
};

/** Farol de um percentual de cumprimento: ≥ 90 na meta, ≥ 70 atenção, abaixo fora (regra do resumo corporativo). */
export function farolPct(v: number | null | undefined): "verde" | "amarelo" | "vermelho" | "neutro" {
  if (v == null || Number.isNaN(v)) return "neutro";
  return v >= 90 ? "verde" : v >= 70 ? "amarelo" : "vermelho";
}
