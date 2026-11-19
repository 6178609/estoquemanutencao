import { cabecalhosSupabase, configSupabase } from "./dados/supabase";

/**
 * Mantém o banco (Supabase) ativo: o plano gratuito pausa o projeto depois de dias sem consulta, e aí a Auditoria e os
 * cadastros no banco param ("fetch failed"). Uma leitura mínima por dia (1 linha da auditoria, nada é gravado) basta.
 * Chamado pelo agendamento diário da Vercel (`/api/manter-banco`, vercel.json).
 */
export async function manterBancoAtivo(): Promise<{ ok: boolean; status: number | null; motivo: string }> {
  const cfg = configSupabase();
  if (!cfg) return { ok: true, status: null, motivo: "sem Supabase configurado" };
  try {
    const resp = await fetch(`${cfg.url}/rest/v1/auditoria?select=em&limit=1`,
      { headers: cabecalhosSupabase(cfg.chave), cache: "no-store", signal: AbortSignal.timeout(10_000) });
    return { ok: resp.ok, status: resp.status, motivo: resp.ok ? "banco ativo" : `Supabase respondeu ${resp.status}` };
  } catch (e) {
    return { ok: false, status: null, motivo: `Supabase sem resposta: ${(e as Error).message}` };
  }
}
