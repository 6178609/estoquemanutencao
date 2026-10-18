/**
 * Quem vê cada aba. Regra testada em testes/acesso.test.ts.
 */
import { TODAS } from "../navegacao";

export const FUNCOES: Record<string, string> = { lider: "Líder de manutenção", analista: "Analista", manutentor: "Manutentor", terceiro: "Terceiro" };
export const PERFIS: Record<string, string> = { admin: "Administrador", editor: "Editor", leitor: "Leitor" };
const FUNCOES_ACESSO_TOTAL = new Set(["lider", "analista"]);
export const PAGINAS_LIVRES = new Set(["estoque"]);
export const PAGINAS_PARCIAIS: Record<string, string> = { equipamentos: "Gestão de ativos" };
/**
 * Terceiro e Manutentor: só o Estoque — nada de parte parcial, lista personalizada de abas ou administração
 * (mesmo que a lista de abas do usuário diga outra coisa).
 */
export const FUNCOES_SO_ESTOQUE = new Set(["terceiro", "manutentor"]);
/** As únicas abas de quem é "só Estoque". */
export const PAGINAS_SO_ESTOQUE = new Set(["estoque"]);

/** "Terceiro não pode ser administrador…" (vale para toda função só-Estoque). */
export function erroAdminSoEstoque(funcao: string): string {
  return `${FUNCOES[funcao] ?? funcao} não pode ser administrador: escolha Leitor ou Editor.`;
}

export function soEstoque(u: Usuario | null): boolean {
  return !!u?.funcao && FUNCOES_SO_ESTOQUE.has(u.funcao);
}

/**
 * Administra o site (usuários): perfil administrador e não terceiro. Um Manutentor que já era administrador antes de a
 * função passar a ver só o Estoque continua administrando (para o site nunca ficar sem administrador), mas não se cria
 * mais nenhum: ver erroAdminSoEstoque.
 */
export function ehAdmin(u: Usuario | null): boolean {
  return !!u && u.perfil === "admin" && u.funcao !== "terceiro";
}

export interface Usuario {
  login: string;
  nome?: string;
  funcao?: string;
  perfil?: string;
  abas?: unknown;
  ativo?: boolean;
}

export function idPagina(pagina: string): string {
  return String(pagina).trim();
}

export function abasPersonalizadas(u: Usuario | null): Set<string> | null {
  return Array.isArray(u?.abas) ? new Set((u!.abas as unknown[]).map((a) => idPagina(String(a)))) : null;
}

export function acessoTotal(u: Usuario | null): boolean {
  if (!u || soEstoque(u)) return false;
  const pers = abasPersonalizadas(u);
  if (pers) return TODAS.every((p) => pers.has(p) || PAGINAS_LIVRES.has(p));
  if (u.funcao && u.funcao in FUNCOES) return FUNCOES_ACESSO_TOTAL.has(u.funcao);
  return u.perfil === "admin";
}

export function veInteira(u: Usuario | null, pagina: string): boolean {
  if (!u) return false;
  const pid = idPagina(pagina);
  if (PAGINAS_LIVRES.has(pid)) return true;
  if (soEstoque(u)) return PAGINAS_SO_ESTOQUE.has(pid);
  const pers = abasPersonalizadas(u);
  return pers ? pers.has(pid) : acessoTotal(u);
}

export function podeVer(u: Usuario | null, pagina: string): boolean {
  if (!u) return false;
  if (soEstoque(u)) return PAGINAS_SO_ESTOQUE.has(idPagina(pagina));
  return idPagina(pagina) in PAGINAS_PARCIAIS || veInteira(u, pagina);
}

export function podeEditar(u: Usuario | null): boolean {
  return !!u && (u.perfil === "admin" || u.perfil === "editor");
}

export function nomeFuncao(u: Usuario | null): string {
  return (u?.funcao && FUNCOES[u.funcao]) || "sem função definida";
}
