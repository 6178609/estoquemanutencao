import "server-only";

import { FonteErro } from "./fonte";

/**
 * Cadastros no Supabase (Postgres): tabela `cadastros` — um documento JSON por cadastro (o antigo `app/<nome>.json`),
 * com versão para a gravação condicional (função `gravar_cadastro`) e o histórico das versões anteriores em
 * `cadastros_historico` (trigger no banco). Só a chave secreta acessa (RLS ligado, sem políticas).
 *
 * Ativo quando SUPABASE_URL e SUPABASE_SECRET_KEY estão definidas (e a fonte de dados é o GitHub); sem elas os
 * cadastros seguem no repositório de dados.
 * As bases do SAP continuam na fonte de dados (GitHub).
 */

const TEMPO_LEITURA_MS = 8_000;
const TEMPO_GRAVACAO_MS = 10_000;
export const MARCADOR_MIGRACAO = "__migracao";

/** O Supabase recusou a chave (401/403): configuração errada, ex.: a chave publicável no lugar da secreta. */
export class SupabaseSemAcesso extends FonteErro {}

export interface Documento { conteudo: unknown; versao: string }

export interface ClienteSupabase {
  /** Versão de cada cadastro (uma consulta só); rapido = uma tentativa, sem repetir. */
  versoes(rapido?: boolean): Promise<Map<string, string>>;
  ler(nome: string): Promise<Documento | null>;
  /** Grava se a versão ainda é `versao` (null = cadastro novo); devolve a versão nova ou null (alguém gravou antes). */
  gravar(nome: string, conteudo: unknown, versao: string | null, por: string): Promise<string | null>;
  /** Insere os que ainda não existem (nunca sobrescreve): usado na cópia inicial vinda do GitHub. */
  importar(docs: { nome: string; conteudo: unknown }[]): Promise<void>;
}

class Rest implements ClienteSupabase {
  constructor(private url: string, private chave: string) {}

  private cabecalhos(extra: Record<string, string> = {}): Record<string, string> {
    // chaves novas (sb_secret_…) vão só no apikey; a service_role antiga (JWT) também no Authorization
    const h: Record<string, string> = { apikey: this.chave, "Content-Type": "application/json", ...extra };
    if (!this.chave.startsWith("sb_")) h.Authorization = `Bearer ${this.chave}`;
    return h;
  }

  private async pedir(caminho: string, init: RequestInit, leitura: boolean, tentativas = leitura ? 3 : 1): Promise<Response> {
    let ultimo: unknown;
    for (let i = 0; i < tentativas; i++) {
      let r: Response;
      try {
        r = await fetch(`${this.url}/rest/v1/${caminho}`, {
          ...init, cache: "no-store", signal: AbortSignal.timeout(leitura ? TEMPO_LEITURA_MS : TEMPO_GRAVACAO_MS),
        });
      } catch (e) {
        ultimo = e; // rede ou tempo esgotado: tenta de novo (só leitura)
        if (i + 1 < tentativas) await new Promise((ok) => setTimeout(ok, 400 * (i + 1)));
        continue;
      }
      if (r.ok) return r;
      // erro do pedido (4xx): repetir não adianta
      if (r.status === 401 || r.status === 403)
        throw new SupabaseSemAcesso(`O Supabase recusou a chave (${r.status}): confira SUPABASE_SECRET_KEY (deve ser a chave secreta, sb_secret_…).`);
      if (r.status < 500 && r.status !== 429) throw new FonteErro(`Supabase respondeu ${r.status}: ${(await r.text()).slice(0, 200)}`);
      ultimo = new Error(`Supabase respondeu ${r.status}`);
      if (i + 1 < tentativas) await new Promise((ok) => setTimeout(ok, 400 * (i + 1)));
    }
    throw new FonteErro(`O banco de dados (Supabase) não respondeu: ${ultimo instanceof Error ? ultimo.message : String(ultimo)}`);
  }

  async versoes(rapido = false): Promise<Map<string, string>> {
    const r = await this.pedir("cadastros?select=nome,versao", { headers: this.cabecalhos() }, true, rapido ? 1 : 3);
    const linhas = (await r.json()) as { nome: string; versao: number }[];
    return new Map(linhas.map((l) => [l.nome, String(l.versao)]));
  }

  async ler(nome: string): Promise<Documento | null> {
    const r = await this.pedir(`cadastros?select=conteudo,versao&nome=eq.${encodeURIComponent(nome)}`,
      { headers: this.cabecalhos() }, true);
    const [l] = (await r.json()) as { conteudo: unknown; versao: number }[];
    return l ? { conteudo: l.conteudo, versao: String(l.versao) } : null;
  }

  async gravar(nome: string, conteudo: unknown, versao: string | null, por: string): Promise<string | null> {
    const r = await this.pedir("rpc/gravar_cadastro", {
      method: "POST", headers: this.cabecalhos(),
      body: JSON.stringify({ p_nome: nome, p_conteudo: conteudo, p_versao_esperada: versao == null ? null : Number(versao), p_por: por }),
    }, false);
    const v = (await r.json()) as number | null;
    return v == null ? null : String(v);
  }

  async importar(docs: { nome: string; conteudo: unknown }[]): Promise<void> {
    if (!docs.length) return;
    await this.pedir("cadastros?on_conflict=nome", {
      method: "POST", headers: this.cabecalhos({ Prefer: "resolution=ignore-duplicates,return=minimal" }),
      body: JSON.stringify(docs.map((d) => ({ nome: d.nome, conteudo: d.conteudo, atualizado_por: "cópia do GitHub" }))),
    }, false);
  }
}

const g = globalThis as unknown as { __cmSupabase?: ClienteSupabase | null };

/** O cliente configurado (null = sem Supabase: os cadastros ficam na fonte de dados). */
export function supabase(): ClienteSupabase | null {
  if (g.__cmSupabase !== undefined) return g.__cmSupabase;
  const url = process.env.SUPABASE_URL?.trim().replace(/\/+$/, "");
  const chave = process.env.SUPABASE_SECRET_KEY?.trim();
  g.__cmSupabase = url && chave ? new Rest(url, chave) : null;
  return g.__cmSupabase;
}

/** Só para os testes: troca o cliente (undefined = volta a ler as variáveis). */
export function _definirSupabase(c: ClienteSupabase | null | undefined) {
  if (c === undefined) delete g.__cmSupabase;
  else g.__cmSupabase = c;
}
