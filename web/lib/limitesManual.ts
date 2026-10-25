/**
 * Limites dos manuais, os mesmos no navegador e no servidor (um arquivo nunca cai entre os dois caminhos).
 * Até LIMITE_DOCUMENTO o arquivo vai num pedido só (a Vercel recebe até ~4,5 MB por pedido); acima disso, até
 * LIMITE_MANUAL_GRANDE, vai em partes de TAMANHO_PARTE.
 */
export const LIMITE_DOCUMENTO = 4_000_000;
export const LIMITE_MANUAL_GRANDE = 100_000_000;
export const TAMANHO_PARTE = 3_500_000;
