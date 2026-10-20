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
