import { chave } from "@/lib/dados/texto";

/**
 * Validação do valor disponível mensal (aba Custos): 12 posições, jan a dez, cada uma vazia (null) ou um valor em R$.
 * Sem dependências: usada pela ação do servidor e pelo editor. "" = ok.
 */
const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

export function validarOrcamento(ano: number, valores: (number | null)[]): string {
  if (!Number.isInteger(ano) || ano < 2000 || ano > 2100) return "O ano deve estar entre 2000 e 2100.";
  if (!Array.isArray(valores) || valores.length !== 12) return "Informe os 12 meses (deixe em branco o que não tiver valor).";
  for (let i = 0; i < 12; i++) {
    const v = valores[i];
    if (v === null) continue;
    if (!(typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 1e9))
      return `Valor inválido em ${MESES[i]}: use um número entre R$ 0 e R$ 1.000.000.000.`;
  }
  return "";
}

/**
 * Validação do padrão de "Pessoas (requisições)" (quem solicita pela manutenção): até 50 nomes, cada um de 1 a 120
 * caracteres depois de aparado, com letras ou números, e sem repetidos (comparação pela chave: sem acento, maiúsculas,
 * espaços). "" = vale; lista vazia vale (sem filtro).
 */
export function validarSolicitantes(nomes: string[]): string {
  if (!Array.isArray(nomes) || nomes.some((n) => typeof n !== "string")) return "A lista de pessoas da manutenção é inválida.";
  if (nomes.length > 50) return "São aceitas no máximo 50 pessoas da manutenção.";
  const vistos = new Set<string>();
  for (const n of nomes) {
    const t = n.trim();
    if (!t || t.length > 120) return "Cada nome deve ter de 1 a 120 caracteres.";
    const k = chave(t);
    if (!k) return "Cada nome deve ter letras ou números.";
    if (vistos.has(k)) return `“${t}” aparece mais de uma vez na lista.`;
    vistos.add(k);
  }
  return "";
}
