import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { _definirIntervalo, _limparMemoria, ACOES, eventos, limparDetalhe, registrar } from "@/lib/auditoria";
import { _definirFonte, type Fonte } from "@/lib/dados/fonte";

describe("auditoria", () => {
  const env = { ...process.env };
  beforeEach(() => {
    _definirFonte(null);
    _limparMemoria();
    _definirIntervalo(0);
  });
  afterEach(() => {
    process.env = { ...env };
    _definirFonte(undefined);
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

  it("na demonstração guarda em memória, filtra por pessoa, ação e dia, mais novo primeiro", async () => {
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

  it("no repositório de dados: um arquivo por mês, gravações juntas, mais novo primeiro e falha não derruba quem registrou", async () => {
    const arquivos = new Map<string, { bytes: Uint8Array; versao: string }>();
    let n = 1;
    let gravacoes = 0;
    let recusar = 0;
    const f: Fonte = {
      modo: "pasta", descricao: "memória",
      versoes: async () => new Map([...arquivos.entries()].map(([k, v]) => [k, v.versao])),
      ler: async (c) => arquivos.get(c) ?? null,
      apagar: async (c) => { arquivos.delete(c); return true; },
      gravarCondicional: async (c, bytes, versao) => {
        gravacoes++;
        if (recusar > 0) { recusar--; return false; } // outra instância gravou no meio
        if ((arquivos.get(c)?.versao ?? null) !== versao) return false;
        arquivos.set(c, { bytes, versao: String(n++) });
        return true;
      },
    };
    _definirFonte(f);
    // um mês fora da retenção é apagado na primeira gravação do dia
    arquivos.set("app/auditoria/2000-01.json", { bytes: new TextEncoder().encode("[]"), versao: "0" });
    recusar = 1;
    await Promise.all([registrar("100", "usuario_criado", "300", { funcao: "lider", senha: "segredo" }), registrar("100", "login")]);
    const mes = new Date().toISOString().slice(0, 7);
    const bruto = new TextDecoder().decode(arquivos.get(`app/auditoria/${mes}.json`)!.bytes);
    expect(bruto).not.toContain("segredo");
    expect(gravacoes).toBe(2); // os dois eventos numa gravação só (mais a nova tentativa depois do conflito)
    expect(arquivos.has("app/auditoria/2000-01.json")).toBe(false);
    expect((await eventos()).map((e) => e.acao)).toEqual(["login", "usuario_criado"]);
    expect((await eventos({ acao: "usuario_criado" }))[0]).toMatchObject({ quem: "100", alvo: "300", detalhe: { funcao: "lider" } });
    // repositório recusando sempre: só aviso no log e o evento fica na fila para a próxima gravação
    recusar = 99;
    const aviso = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    await expect(registrar("100", "logout")).resolves.toBeUndefined();
    expect(aviso).toHaveBeenCalled();
    aviso.mockRestore();
    recusar = 0;
    await registrar("100", "login");
    expect((await eventos()).map((e) => e.acao).slice(0, 2)).toEqual(["login", "logout"]);
  });
});
