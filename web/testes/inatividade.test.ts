import { describe, expect, it } from "vitest";

import { NextRequest } from "next/server";

import { AVISO_MS, COOKIE_ATIVO, COOKIE_SESSAO, expirou, INATIVIDADE_MIN, LIMITE_MS, restante } from "@/lib/auth/inatividade";
import { proxy } from "@/proxy";

describe("saída por inatividade", () => {
  it("regra: 30 minutos, aviso 1 minuto antes; sem registro não derruba", () => {
    expect(INATIVIDADE_MIN).toBe(30);
    expect(LIMITE_MS).toBe(30 * 60_000);
    expect(AVISO_MS).toBe(60_000);
    const t = 1_800_000_000_000;
    expect(expirou(t, t + LIMITE_MS)).toBe(false);
    expect(expirou(t, t + LIMITE_MS + 1)).toBe(true);
    expect(expirou(Number(undefined), t)).toBe(false);
    expect(expirou(0, t)).toBe(false);
    expect(restante(t, t + LIMITE_MS - AVISO_MS)).toBe(AVISO_MS);
  });

  const pedir = (caminho: string, cookies: Record<string, string>) => new NextRequest(`https://exemplo.test${caminho}`, {
    headers: { cookie: Object.entries(cookies).map(([k, v]) => `${k}=${v}`).join("; ") },
  });

  it("servidor: sessão parada além do limite vai para a entrada com o motivo e perde os cookies", () => {
    const r = proxy(pedir("/painel", { [COOKIE_SESSAO]: "123:abc", [COOKIE_ATIVO]: String(Date.now() - LIMITE_MS - 5000) }));
    expect(r.status).toBe(307);
    expect(r.headers.get("location")).toBe("https://exemplo.test/entrar?motivo=inatividade");
    const sc = r.headers.getSetCookie().join("\n");
    expect(sc).toMatch(new RegExp(`${COOKIE_SESSAO}=;`));
    expect(sc).toMatch(new RegExp(`${COOKIE_ATIVO}=;`));
  });

  it("servidor: API parada responde 401; em uso renova a hora; sem sessão não mexe", () => {
    const velho = String(Date.now() - LIMITE_MS - 5000);
    expect(proxy(pedir("/api/sessao", { [COOKIE_SESSAO]: "1:a", [COOKIE_ATIVO]: velho })).status).toBe(401);
    const antes = Date.now();
    const ok = proxy(pedir("/painel", { [COOKIE_SESSAO]: "1:a", [COOKIE_ATIVO]: String(antes - 60_000) }));
    expect(ok.headers.get("location")).toBeNull();
    const valor = Number(/cmw_ativo=(\d+)/.exec(ok.headers.getSetCookie().join("\n"))?.[1]);
    expect(valor).toBeGreaterThanOrEqual(antes);
    expect(proxy(pedir("/painel", { [COOKIE_ATIVO]: velho })).headers.getSetCookie()).toEqual([]);
  });
});

describe("saída por inatividade · casos de borda do servidor", () => {
  const velho = () => String(Date.now() - 31 * 60_000);
  const pedir = (caminho: string, extra: Record<string, string> = {}) => new NextRequest(`https://exemplo.test${caminho}`, {
    method: extra["next-action"] ? "POST" : "GET",
    headers: { cookie: `${COOKIE_SESSAO}=1:a; ${COOKIE_ATIVO}=${velho()}`, ...extra },
  });
  it("na entrada só limpa os cookies; server action recebe 401 em vez de redirect", () => {
    const e = proxy(pedir("/entrar"));
    expect(e.headers.get("location")).toBeNull();
    expect(e.headers.getSetCookie().join("\n")).toMatch(new RegExp(`${COOKIE_SESSAO}=;`));
    expect(proxy(pedir("/painel", { "next-action": "abc" })).status).toBe(401);
  });
});
