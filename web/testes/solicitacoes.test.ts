import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { aprovar, jaTemUsuario, pendentes, recusar, solicitacoes, solicitar } from "@/lib/auth/solicitacoes";
import { confere } from "@/lib/auth/senha";
import { criarPrimeiroAdmin, usuarios } from "@/lib/auth/usuarios";
import { _definirFonte, type Fonte } from "@/lib/dados/fonte";

/** Repositório de dados na memória (modo GitHub). Dados fictícios. */
function fonteMemoria(): Fonte {
  const arquivos = new Map<string, { bytes: Uint8Array; versao: string }>();
  let n = 1;
  return {
    modo: "github", descricao: "memória",
    versoes: async () => new Map([...arquivos.entries()].map(([k, v]) => [k, v.versao])),
    ler: async (c) => arquivos.get(c) ?? null,
    apagar: async (c) => { arquivos.delete(c); return true; },
    gravarCondicional: async (c, bytes, versao) => {
      if ((arquivos.get(c)?.versao ?? null) !== versao) return false;
      arquivos.set(c, { bytes, versao: String(n++) });
      return true;
    },
  };
}

const SENHA = "Senha-Forte-1";
const pedido = { nome: "  Bia   Souza ", login: "1.234.567", senha: "Minha-Senha-9", senha2: "Minha-Senha-9", funcao: "manutentor", motivo: "Consultar estoque" };
let origem = 0;
const nova = () => `10.0.0.${++origem}`;

beforeEach(async () => {
  process.env.DADOS_GH_TOKEN = "github_pat_FICTICIO_abc123XYZ789";
  _definirFonte(fonteMemoria());
  await criarPrimeiroAdmin({ nome: "Ana Lima", login: "6178609", funcao: "lider", senha: SENHA, senha2: SENHA, codigo: "XYZ789" });
});
afterEach(() => {
  delete process.env.DADOS_GH_TOKEN;
  _definirFonte(undefined);
});

describe("pedido de acesso", () => {
  it("valida, grava pendente sem guardar a senha em texto e bloqueia duplicado", async () => {
    expect(await solicitar({ ...pedido, nome: "B" }, nova())).toBe("Informe seu nome.");
    expect(await solicitar({ ...pedido, login: "abc" }, nova())).toMatch(/NP|Número Pessoal/);
    expect(await solicitar({ ...pedido, senha: "12345678", senha2: "12345678" }, nova())).toMatch(/letras/);
    expect(await solicitar({ ...pedido, senha2: "outra-123" }, nova())).toBe("As senhas não conferem.");
    expect(await solicitar({ ...pedido, login: "6178609" }, nova())).toMatch(/já tem usuário/);
    expect(await solicitar(pedido, nova())).toBe("");
    const p = (await pendentes())["1234567"];
    expect(p).toMatchObject({ nome: "Bia Souza", funcao: "manutentor", motivo: "Consultar estoque", status: "pendente" });
    expect(JSON.stringify(p)).not.toContain("Minha-Senha-9");
    expect(await solicitar(pedido, nova())).toMatch(/aguardando aprovação/);
  });

  it("quem já tem usuário não pede de novo: mesmo NP (com zeros à esquerda) ou mesmo nome", async () => {
    // a admin "Ana Lima" (6178609) já existe
    expect(await solicitar({ ...pedido, login: "6178609" }, nova())).toMatch(/já tem usuário/);
    expect(await solicitar({ ...pedido, login: "06178609" }, nova())).toMatch(/já tem usuário/);
    expect(await solicitar({ ...pedido, nome: "ana  LIMA", login: "7654321" }, nova())).toMatch(/usuário com esse nome/);
    expect(await solicitar({ ...pedido, nome: "Âna Lima", login: "7654321" }, nova())).toMatch(/usuário com esse nome/);
    expect(Object.keys(await pendentes())).toEqual([]);
    // nome de uma palavra só não bloqueia (pode ser outra pessoa); NP novo e nome novo passam
    expect(jaTemUsuario("7654321", "Ana", { "6178609": { nome: "Ana Lima" } })).toBe("");
    expect(await solicitar(pedido, nova())).toBe("");
    // segundo pedido da mesma pessoa com outro NP enquanto o primeiro espera
    expect(await solicitar({ ...pedido, login: "1234568" }, nova())).toMatch(/aguardando aprovação/);
  });

  it("aprovar recusa quem já tem usuário com o mesmo nome", async () => {
    expect(await solicitar(pedido, nova())).toBe("");
    const us = await usuarios();
    expect(jaTemUsuario("9999999", "Bia Souza", { ...us, "1234567": { nome: "Bia Souza" } })).toMatch(/nome/);
  });

  it("um pedido a cada 10 minutos por origem", async () => {
    const o = nova();
    expect(await solicitar(pedido, o)).toBe("");
    expect(await solicitar({ ...pedido, login: "7654321" }, o)).toMatch(/acabou de enviar/);
  });

  it("aprovar cria o usuário com a senha escolhida e apaga o hash do pedido", async () => {
    await solicitar(pedido, nova());
    expect(await aprovar("1234567", "", "leitor", null, "6178609")).toMatch(/função/);
    expect(await aprovar("1234567", "analista", "editor", ["planos", "ordens"], "6178609")).toBe("");
    const u = (await usuarios())["1234567"];
    expect(u).toMatchObject({ nome: "Bia Souza", funcao: "analista", perfil: "editor", ativo: true, trocar_senha: false, abas: ["ordens", "planos"] });
    expect(await confere(u, "Minha-Senha-9")).toBe(true);
    const s = (await solicitacoes())["1234567"];
    expect(s).toMatchObject({ status: "aprovada", decidido_por: "6178609" });
    expect(s.sal).toBeUndefined();
    expect(s.senha_hash).toBeUndefined();
    expect(await aprovar("1234567", "analista", "editor", null, "6178609")).toMatch(/não está mais pendente/);
    // pode pedir de novo? não: já é usuário
    expect(await solicitar(pedido, nova())).toMatch(/já tem usuário/);
  });

  it("recusar guarda o motivo e libera um novo pedido", async () => {
    await solicitar(pedido, nova());
    expect(await recusar("1234567", "Não é da manutenção", "6178609")).toBe("");
    expect((await solicitacoes())["1234567"]).toMatchObject({ status: "recusada", motivo_recusa: "Não é da manutenção" });
    expect((await usuarios())["1234567"]).toBeUndefined();
    expect(await solicitar(pedido, nova())).toBe("");
  });

  it("limite de 30 pedidos pendentes", async () => {
    for (let i = 0; i < 30; i++) expect(await solicitar({ ...pedido, nome: `Pessoa ${i} Teste`, login: String(2000000 + i) }, nova())).toBe("");
    expect(await solicitar({ ...pedido, nome: "Outra Pessoa", login: "3000000" }, nova())).toMatch(/muitos pedidos/);
  }, 30_000); // 30 senhas com PBKDF2 de 260 mil iterações: passa de 5 s em máquina lenta
});
