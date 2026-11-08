import { validarEmail } from "./senha";

/**
 * Atualização mensal obrigatória dos dados cadastrais (nome completo e e-mail).
 * Quem nunca confirmou os dados (campo `dados_confirmados_em` vazio no usuarios.json) é bloqueado já no próximo acesso;
 * a contagem começa no primeiro salvamento e cada salvamento recomeça o prazo de 1 mês.
 * Testado em testes/atualizacaoDados.test.ts.
 */
export const PRAZO_MESES = 1;

/** Data em que a próxima atualização passa a ser obrigatória (mesmo dia do mês seguinte; 31/01 → 28 ou 29/02). */
export function proximaAtualizacao(confirmadoEm: string): Date | null {
  const d = new Date(confirmadoEm);
  if (!confirmadoEm || isNaN(+d)) return null;
  const alvo = new Date(d);
  alvo.setUTCDate(1);
  alvo.setUTCMonth(alvo.getUTCMonth() + PRAZO_MESES);
  const ultimoDia = new Date(Date.UTC(alvo.getUTCFullYear(), alvo.getUTCMonth() + 1, 0)).getUTCDate();
  alvo.setUTCDate(Math.min(d.getUTCDate(), ultimoDia));
  return alvo;
}

/** true quando a pessoa precisa atualizar os dados agora (nunca confirmou, data inválida ou prazo vencido). */
export function precisaAtualizarDados(confirmadoEm: unknown, agora: Date = new Date()): boolean {
  const prox = typeof confirmadoEm === "string" ? proximaAtualizacao(confirmadoEm) : null;
  return !prox || +agora >= +prox;
}

/** Nome sem espaços sobrando. */
export function limparNome(nome: string): string {
  return (nome || "").normalize("NFC").replace(/[’‘´`]/g, "'").trim().replace(/\s+/g, " ");
}

const PARTICULAS = new Set(["da", "de", "do", "das", "dos", "e"]);

/** Nome completo: pelo menos nome e sobrenome, só letras (com acento), espaço, hífen e apóstrofo. */
export function validarNomeCompleto(nome: string): string {
  const n = limparNome(nome);
  if (!n) return "Informe o nome completo.";
  if (n.length > 120) return "Nome muito longo (máximo de 120 caracteres).";
  if (!/^[\p{L}][\p{L}\p{M}'. -]*$/u.test(n)) return "Use só letras no nome (sem números ou símbolos).";
  // partículas (da, de, do, dos, das, e) não contam como sobrenome
  const partes = n.split(" ").filter((p) => /\p{L}{2,}/u.test(p) && !PARTICULAS.has(p.toLowerCase()));
  if (partes.length < 2) return "Informe o nome completo, com nome e sobrenome.";
  return "";
}

/** E-mail obrigatório e válido. */
export function validarEmailObrigatorio(email: string): string {
  return (email || "").trim() ? validarEmail(email) : "Informe o e-mail.";
}
