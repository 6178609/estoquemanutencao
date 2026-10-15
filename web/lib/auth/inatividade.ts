/**
 * Saída automática por inatividade — regra única para o navegador (components/Inatividade.tsx) e o servidor (proxy.ts).
 *
 * - Navegador: conta o último movimento (mouse, teclado, toque, rolagem) em todas as abas abertas; 1 min antes do
 *   limite mostra o aviso com "Continuar conectado"; no limite, sai e volta para a tela de entrada.
 * - Servidor: o cookie COOKIE_ATIVO guarda a hora da última requisição; passou do limite, a sessão é encerrada mesmo
 *   que o navegador tenha ficado fechado ou o computador suspenso.
 */
export const INATIVIDADE_MIN = 30;
export const LIMITE_MS = INATIVIDADE_MIN * 60_000;
export const AVISO_MS = 60_000;
/** Intervalo mínimo entre os avisos ao servidor de que a pessoa segue usando o site (renova o cookie). */
export const PING_MS = 4 * 60_000;
export const COOKIE_ATIVO = "cmw_ativo";
export const COOKIE_SESSAO = "cmw_sessao";
export const MOTIVO = "inatividade";
/** Validade do cookie da última atividade: a da sessão mais longa ("manter conectado", 30 dias). */
export const VALIDADE_S = 30 * 86400;

/** Passou do limite desde a última atividade? Sem registro (cookie ausente ou inválido) não conta como expirado. */
export function expirou(ultima: number | null | undefined, agora: number, limite = LIMITE_MS): boolean {
  return typeof ultima === "number" && Number.isFinite(ultima) && ultima > 0 && agora - ultima > limite;
}

/** Milissegundos até a saída (negativo = já passou). */
export function restante(ultima: number, agora: number, limite = LIMITE_MS): number {
  return ultima + limite - agora;
}
