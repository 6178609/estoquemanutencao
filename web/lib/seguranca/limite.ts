import "server-only";

import { headers } from "next/headers";

/**
 * Limite de tentativas (login e código do primeiro administrador).
 *
 * Na Vercel cada instância tem a sua memória e ela zera a cada cold start, então o contador local sozinho é
 * contornável. Com UPSTASH_REDIS_REST_URL e UPSTASH_REDIS_REST_TOKEN definidos (Vercel › Storage › Upstash
 * Redis) o contador passa a ser compartilhado entre todas as instâncias. Sem eles, vale o contador local.
 */
export interface Regra {
  /** quantas falhas até bloquear */
  max: number;
  /** janela em que as falhas contam, e duração do bloqueio */
  janelaMs: number;
}

const g = globalThis as unknown as { __cmLimite?: Map<string, { n: number; ate: number }> };
const local = (g.__cmLimite ??= new Map());

function redis(): { url: string; token: string } | null {
  const url = process.env.UPSTASH_REDIS_REST_URL?.trim();
  const token = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();
  return url && token ? { url: url.replace(/\/$/, ""), token } : null;
}

async function comando(r: { url: string; token: string }, ...args: (string | number)[]): Promise<unknown> {
  const resp = await fetch(r.url, {
    method: "POST", cache: "no-store", signal: AbortSignal.timeout(2500),
    headers: { Authorization: `Bearer ${r.token}`, "Content-Type": "application/json" },
    body: JSON.stringify(args),
  });
  if (!resp.ok) throw new Error(`redis ${resp.status}`);
  return ((await resp.json()) as { result?: unknown }).result;
}

function limparLocal() {
  if (local.size < 5000) return;
  const agora = Date.now();
  for (const [k, v] of local) if (v.ate < agora) local.delete(k);
}

/** Minutos que faltam para liberar (0 = liberado). Só consulta, não conta. */
export async function bloqueadoPor(chave: string, regra: Regra): Promise<number> {
  const r = redis();
  if (r) {
    try {
      const n = Number(await comando(r, "GET", `lim:${chave}`)) || 0;
      if (n >= regra.max) {
        const ms = Number(await comando(r, "PTTL", `lim:${chave}`)) || regra.janelaMs;
        return Math.max(1, Math.ceil(ms / 60_000));
      }
      return 0;
    } catch {
      /* Redis fora do ar: cai no contador local */
    }
  }
  const v = local.get(chave);
  return v && v.n >= regra.max && v.ate > Date.now() ? Math.max(1, Math.ceil((v.ate - Date.now()) / 60_000)) : 0;
}

/** Conta uma falha. */
export async function registrarFalha(chave: string, regra: Regra): Promise<void> {
  const r = redis();
  if (r) {
    try {
      const n = Number(await comando(r, "INCR", `lim:${chave}`));
      if (n === 1) await comando(r, "PEXPIRE", `lim:${chave}`, regra.janelaMs);
      return;
    } catch {
      /* cai no contador local */
    }
  }
  limparLocal();
  const agora = Date.now();
  const v = local.get(chave);
  if (!v || v.ate < agora) local.set(chave, { n: 1, ate: agora + regra.janelaMs });
  else v.n += 1;
}

/** Zera o contador (login certo). */
export async function limpar(chave: string): Promise<void> {
  local.delete(chave);
  const r = redis();
  if (r) await comando(r, "DEL", `lim:${chave}`).catch(() => undefined);
}

/** Endereço de quem chamou (a Vercel preenche x-forwarded-for / x-real-ip). */
export function ipDe(h: Headers): string {
  const ip = (h.get("x-real-ip") || h.get("x-forwarded-for")?.split(",")[0] || "").trim();
  return ip.slice(0, 64) || "desconhecido";
}

/** O IP de quem fez a requisição atual ("desconhecido" fora de uma requisição, como nos testes). */
export async function ipAtual(): Promise<string> {
  try {
    return ipDe(await headers());
  } catch {
    return "desconhecido";
  }
}
