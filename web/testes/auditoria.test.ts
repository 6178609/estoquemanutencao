import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { _limparMemoria, ACOES, eventos, limparDetalhe, registrar } from "@/lib/auditoria";

describe("auditoria", () => {
  const env = { ...process.env };
  beforeEach(() => {
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SECRET_KEY;
    _limparMemoria();
  });
  afterEach(() => {
    process.env = { ...env };
    vi.unstubAllGlobals();
  });

  it("nunca guarda senha, token ou sessão no detalhe e encurta os textos", () => {
    const d = limparDetalhe({ senha: "x", nova_senha: "y", token: "t", sessoes: [1], hash: "h", funcao: "lider", texto: "a".repeat(500),
      lista: Array.from({ length: 50 }, (_, i) => i), aninhado: { a: 1 }, nada: undefined });
    expect(Object.keys(d).sort()).toEqual(["aninhado", "funcao", "lista", "texto"]);
    expect((d.texto as string).length).toBe(300);
    // a marca de "acesso redefinido" (sem a palavra senha) passa
    expect(limparDetalhe({ acesso_redefinido: true })).toEqual({ acesso_redefinido: true });
    expect((d.lista as string[]).length).toBe(30);
    expect(d.aninhado).toBe("[object Object]");
  });

  it("sem Supabase guarda em memória, filtra por pessoa, ação e dia, mais novo primeiro", async () => {
    await registrar("100", "login");
    await registrar("200", "login");
    await registrar("100", "exportacao", "saude_dos_ativos.csv", { linhas: 3 });
    expect((await eventos()).map((e) => e.acao)).toEqual(["exportacao", "login", "login"]);
    expect((await eventos({ quem: "100" })).length).toBe(2);
    expect((await eventos({ alvo: "saude_dos_ativos.csv" })).map((e) => e.quem)).toEqual(["100"]);
    expect((await eventos({ acao: "login" })).map((e) => e.quem)).toEqual(["200", "100"]);
    const hoje = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
    expect((await eventos({ desde: hoje, ate: hoje })).length).toBe(3);
    expect((await eventos({ ate: "2000-01-01" })).length).toBe(0);
    expect(Object.keys(ACOES)).toContain("base_enviada");
  });

  it("com Supabase grava na tabela auditoria e uma falha não derruba quem registrou", async () => {
    process.env.SUPABASE_URL = "https://exemplo.supabase.co";
    process.env.SUPABASE_SECRET_KEY = "sb_secret_ficticia";
    const chamadas: { url: string; metodo: string; corpo?: string }[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit) => {
      chamadas.push({ url, metodo: init.method ?? "GET", corpo: init.body as string | undefined });
      return new Response(null, { status: chamadas.length === 1 ? 201 : 500 });
    }));
    await registrar("100", "usuario_criado", "300", { funcao: "lider", senha: "segredo" });
    expect(chamadas[0].url).toBe("https://exemplo.supabase.co/rest/v1/auditoria");
    expect(chamadas[0].metodo).toBe("POST");
    const corpo = JSON.parse(chamadas[0].corpo!);
    expect(corpo).toMatchObject({ quem: "100", acao: "usuario_criado", alvo: "300", detalhe: { funcao: "lider" } });
    expect(JSON.stringify(corpo)).not.toContain("segredo");
    // primeira gravação do dia: apaga o que passou de 12 meses
    expect(chamadas[1].metodo).toBe("DELETE");
    expect(chamadas[1].url).toMatch(/auditoria\?em=lt\./);
    const aviso = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    await expect(registrar("100", "logout")).resolves.toBeUndefined();
    expect(aviso).toHaveBeenCalled();
    aviso.mockRestore();
  });
});
