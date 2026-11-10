/**
 * Quem vê cada aba: uma regra só — a lista de abas do usuário. Regra testada em testes/acesso.test.ts.
 *
 * - "Escolher as abas" (lista própria, em Usuários): vê exatamente as abas marcadas, de qualquer função
 *   (inclusive Estoque, Suporte Técnico e Equipamentos, que também ficam na lista).
 * - "Padrão da função" (sem lista): Líder e Analista veem todas; Manutentor e Terceiro, Estoque e Suporte Técnico;
 *   conta antiga sem função: administrador vê todas, os demais Estoque e Suporte Técnico.
 * Minha conta é de todos; Usuários, só de administrador (não são abas).
 */
import { TODAS } from "../navegacao";

export const FUNCOES: Record<string, string> = { lider: "Líder de manutenção", analista: "Analista", manutentor: "Manutentor", terceiro: "Terceiro" };
export const PERFIS: Record<string, string> = { admin: "Administrador", editor: "Editor", leitor: "Leitor" };
const FUNCOES_ACESSO_TOTAL = new Set(["lider", "analista"]);
/** Abas do "Padrão da função" de Manutentor, Terceiro e conta antiga sem função (não administradora). */
export const ABAS_BASICAS = new Set(["estoque", "suporte"]);
/**
 * Funções operacionais (Terceiro e Manutentor): veem as abas da lista como qualquer um, mas não podem ser
 * administradores, não gravam na biblioteca técnica nem na Gestão de MRO e não têm bloco de cartão.
 */
export const FUNCOES_SO_ESTOQUE = new Set(["terceiro", "manutentor"]);

/** "Terceiro não pode ser administrador…" (vale para toda função operacional). */
export function erroAdminSoEstoque(funcao: string): string {
  return `${FUNCOES[funcao] ?? funcao} não pode ser administrador: escolha Leitor ou Editor.`;
}

/** Função operacional (Terceiro ou Manutentor) — ver FUNCOES_SO_ESTOQUE. Não limita mais as abas que a pessoa vê. */
export function soEstoque(u: Usuario | null): boolean {
  return !!u?.funcao && FUNCOES_SO_ESTOQUE.has(u.funcao);
}

/**
 * Administra o site (usuários): perfil administrador e não terceiro. Um Manutentor que já era administrador continua
 * administrando (para o site nunca ficar sem administrador), mas não se cria mais nenhum: ver erroAdminSoEstoque.
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
  /** aprova pedidos de cadastro de material como Almoxarifado / PCM (marcado em Usuários) */
  aprova_almox?: boolean;
  aprova_pcm?: boolean;
}

export function idPagina(pagina: string): string {
  return String(pagina).trim();
}

export function abasPersonalizadas(u: Usuario | null): Set<string> | null {
  return Array.isArray(u?.abas) ? new Set((u!.abas as unknown[]).map((a) => idPagina(String(a)))) : null;
}

/** Abas do "Padrão da função" (quando não há lista própria). */
export function abasPadrao(u: Usuario | null): Set<string> {
  if (!u) return new Set();
  const todas = u.funcao && u.funcao in FUNCOES ? FUNCOES_ACESSO_TOTAL.has(u.funcao) : u.perfil === "admin";
  return new Set(todas ? TODAS : ABAS_BASICAS);
}

/** As abas que a pessoa vê: a lista própria, ou o padrão da função. */
export function abasDoUsuario(u: Usuario | null): Set<string> {
  return abasPersonalizadas(u) ?? abasPadrao(u);
}

export function acessoTotal(u: Usuario | null): boolean {
  if (!u) return false;
  const abas = abasDoUsuario(u);
  return TODAS.every((p) => abas.has(p));
}

/** Vê a aba (inteira: não há mais visão parcial). */
export function veInteira(u: Usuario | null, pagina: string): boolean {
  return !!u && abasDoUsuario(u).has(idPagina(pagina));
}

export function podeVer(u: Usuario | null, pagina: string): boolean {
  return veInteira(u, pagina);
}

export function podeEditar(u: Usuario | null): boolean {
  return !!u && (u.perfil === "admin" || u.perfil === "editor");
}

/**
 * Grava na biblioteca técnica (Suporte Técnico): quem vê a aba por lista própria ou pela função de acesso total, com
 * perfil de edição e fora de Terceiro e Manutentor.
 */
export function podeEditarSuporte(u: Usuario | null): boolean {
  if (!u || soEstoque(u) || !podeEditar(u)) return false;
  const pers = abasPersonalizadas(u);
  return pers ? pers.has("suporte") : acessoTotal(u);
}

export function nomeFuncao(u: Usuario | null): string {
  return (u?.funcao && FUNCOES[u.funcao]) || "sem função definida";
}
