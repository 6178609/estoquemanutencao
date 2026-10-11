import "server-only";

/**
 * Trilha de auditoria: uma linha JSON por evento, no log da Vercel (Project › Logs; dá para enviar a um drain/SIEM
 * e filtrar por `"cm_auditoria"`). Nunca registra senha, token nem código.
 */
export type Evento =
  | "login_ok" | "login_falha" | "login_bloqueado" | "logout"
  | "primeiro_admin_criado" | "primeiro_admin_falha"
  | "usuario_criado" | "usuario_editado" | "usuario_excluido"
  | "senha_trocada" | "sessoes_encerradas" | "base_enviada";

export function auditar(evento: Evento, detalhe: Record<string, string | number | boolean | null | undefined> = {}) {
  console.log(JSON.stringify({ cm_auditoria: evento, em: new Date().toISOString(), ...detalhe }));
}
