import "server-only";

import { after } from "next/server";

import { cabecalhosSupabase, configSupabase } from "./dados/supabase";

/**
 * Trilha de auditoria: quem fez o que e quando (entrada e saída, senha, usuários e permissões, bases enviadas,
 * exportações, alocações do MRO…). Fica na tabela `auditoria` do Supabase (RLS ligado, só a chave secreta acessa);
 * sem o Supabase (demonstração, testes), numa lista em memória só desta instância. Registrar nunca derruba a ação
 * do usuário: falhou, vai para o log do servidor e segue. Guarda 12 meses (ver /privacidade). Testado em
 * testes/auditoria.test.ts.
 */

export const RETENCAO_DIAS = 365;
const MAX_MEMORIA = 2_000;
const TEMPO_MS = 5_000;

/** As ações registradas e como aparecem na tela de auditoria. */
export const ACOES: Record<string, string> = {
  login: "Entrou no site",
  login_falhou: "Senha errada na entrada",
  login_bloqueado: "Entrada bloqueada (muitas tentativas)",
  logout: "Saiu do site",
  logout_inatividade: "Saiu por inatividade",
  senha_trocada: "Trocou a própria senha",
  sessoes_encerradas: "Desconectou todos os aparelhos",
  primeiro_admin: "Criou o primeiro administrador",
  usuario_criado: "Cadastrou usuário",
  usuario_editado: "Alterou usuário",
  usuario_excluido: "Excluiu usuário",
  pedido_acesso: "Pediu acesso",
  pedido_aprovado: "Aprovou pedido de acesso",
  pedido_recusado: "Recusou pedido de acesso",
  base_enviada: "Enviou base do SAP",
  exportacao: "Baixou planilha",
  mro_alocacao: "Alocação automática de peças (MRO)",
  mro_desfazer: "Desfez a alocação automática (MRO)",
  comentario_roadmap: "Alterou comentário do Roadmap SIM",
  meus_dados: "Baixou os próprios dados (LGPD)",
};

export interface Evento {
  em: string;
  quem: string;
  acao: string;
  alvo: string;
  detalhe: Record<string, unknown>;
}

/** Campos que nunca entram no registro, mesmo que alguém passe por engano. */
const PROIBIDOS = /senha|password|token|segredo|secret|chave|hash|sess(ao|oes)|cookie/i;

/** O detalhe que vai para o banco: sem campos sensíveis, textos curtos, no máximo 20 campos e sem objetos aninhados. */
export function limparDetalhe(d: Record<string, unknown> | undefined): Record<string, unknown> {
  const r: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(d ?? {}).slice(0, 20)) {
    if (PROIBIDOS.test(k) || v === undefined) continue;
    if (typeof v === "string") r[k] = v.slice(0, 300);
    else if (typeof v === "number" || typeof v === "boolean" || v === null) r[k] = v;
    else if (Array.isArray(v)) r[k] = v.slice(0, 30).map((x) => String(x).slice(0, 80));
    else r[k] = String(v).slice(0, 300);
  }
  return r;
}

const g = globalThis as unknown as { __cmAuditoria?: Evento[]; __cmAuditoriaLimpeza?: string };
const memoria = (g.__cmAuditoria ??= []);

function rest() {
  const cfg = configSupabase();
  return cfg ? { url: `${cfg.url}/rest/v1/auditoria`, h: (extra?: Record<string, string>) => cabecalhosSupabase(cfg.chave, extra) } : null;
}

async function gravar(ev: Evento): Promise<void> {
  const r = rest();
  if (!r) {
    memoria.unshift(ev);
    memoria.length = Math.min(memoria.length, MAX_MEMORIA);
    return;
  }
  try {
    const resp = await fetch(r.url, {
      method: "POST", headers: r.h({ Prefer: "return=minimal" }), body: JSON.stringify(ev), cache: "no-store", signal: AbortSignal.timeout(TEMPO_MS),
    });
    if (!resp.ok) throw new Error(`Supabase respondeu ${resp.status}`);
    // uma vez por dia por instância: apaga o que passou da retenção
    const dia = ev.em.slice(0, 10);
    if (g.__cmAuditoriaLimpeza !== dia) {
      const limite = new Date(Date.now() - RETENCAO_DIAS * 86400_000).toISOString();
      const apagou = await fetch(`${r.url}?em=lt.${encodeURIComponent(limite)}`, { method: "DELETE", headers: r.h({ Prefer: "return=minimal" }),
        cache: "no-store", signal: AbortSignal.timeout(TEMPO_MS) }).catch((e: Error) => e);
      if (apagou instanceof Response && apagou.ok) g.__cmAuditoriaLimpeza = dia;
      else console.warn(`[auditoria] limpeza dos registros antigos falhou: ${apagou instanceof Response ? `Supabase ${apagou.status}` : apagou.message}`);
    }
  } catch (e) {
    console.warn(`[auditoria] não registrado (${ev.acao} por ${ev.quem}): ${(e as Error).message}`);
  }
}

/**
 * Registra uma ação. Dentro de uma requisição grava depois da resposta (não atrasa a tela); fora dela, na hora.
 * Devolve a promessa da gravação só para os testes — quem chama não precisa esperar.
 */
export function registrar(quem: string, acao: string, alvo = "", detalhe?: Record<string, unknown>): Promise<void> {
  const ev: Evento = {
    em: new Date().toISOString(), quem: String(quem || "?").slice(0, 80), acao: acao.slice(0, 60), alvo: String(alvo || "").slice(0, 200),
    detalhe: limparDetalhe(detalhe),
  };
  let pronto!: () => void;
  const feito = new Promise<void>((ok) => (pronto = ok));
  const tarefa = () => gravar(ev).finally(pronto);
  try {
    after(tarefa);
  } catch {
    void tarefa(); // fora de uma requisição (testes, scripts)
  }
  return feito;
}

interface Filtro { quem?: string; alvo?: string; acao?: string; desde?: string; ate?: string; limite?: number }

/** Os eventos mais novos primeiro, com os filtros (quem, alvo e ação exatos; desde/até = dias "2026-10-01", hora de Brasília). */
export async function eventos(f: Filtro = {}): Promise<Evento[]> {
  const limite = Math.min(Math.max(f.limite ?? 500, 1), 2_000);
  const desde = /^\d{4}-\d{2}-\d{2}$/.test(f.desde ?? "") ? `${f.desde}T00:00:00-03:00` : "";
  const ate = /^\d{4}-\d{2}-\d{2}$/.test(f.ate ?? "") ? `${f.ate}T23:59:59.999-03:00` : "";
  const r = rest();
  if (!r) {
    return memoria.filter((e) => (!f.quem || e.quem === f.quem) && (!f.alvo || e.alvo === f.alvo) && (!f.acao || e.acao === f.acao)
      && (!desde || e.em >= new Date(desde).toISOString()) && (!ate || e.em <= new Date(ate).toISOString())).slice(0, limite);
  }
  const q = new URLSearchParams({ select: "em,quem,acao,alvo,detalhe", order: "em.desc", limit: String(limite) });
  if (f.quem) q.append("quem", `eq.${f.quem}`);
  if (f.alvo) q.append("alvo", `eq.${f.alvo}`);
  if (f.acao) q.append("acao", `eq.${f.acao}`);
  if (desde) q.append("em", `gte.${desde}`);
  if (ate) q.append("em", `lte.${ate}`);
  const resp = await fetch(`${r.url}?${q}`, { headers: r.h(), cache: "no-store", signal: AbortSignal.timeout(8_000) });
  if (!resp.ok) throw new Error(`A trilha de auditoria não respondeu (Supabase ${resp.status}).`);
  return (await resp.json()) as Evento[];
}

/** Só para os testes: esvazia a lista em memória. */
export function _limparMemoria() {
  memoria.length = 0;
  delete g.__cmAuditoriaLimpeza;
}
