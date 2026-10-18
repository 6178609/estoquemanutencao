import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { confere } from "@/lib/auth/senha";
import {
  criarPrimeiroAdmin, criarUsuario, editarUsuario, excluirUsuario, precisaPrimeiroAdmin, trocarSenha, usuarios,
} from "@/lib/auth/usuarios";
import { _definirFonte, type Fonte } from "@/lib/dados/fonte";

/** Repositório de dados na memória, no modo GitHub (o código do 1º acesso vem do fim do token). */
function fonteMemoria() {
  const arquivos = new Map<string, { bytes: Uint8Array; versao: string }>();
  let n = 1;
  const f: Fonte = {
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
  return f;
}

const SENHA = "Senha-Forte-1";
const novoAdmin = { nome: "Ana Lima", login: "6.178.609", funcao: "lider", senha: SENHA, senha2: SENHA };

beforeEach(() => {
  process.env.DADOS_GH_TOKEN = "github_pat_FICTICIO_abc123XYZ789";
  _definirFonte(fonteMemoria());
});
afterEach(() => {
  delete process.env.DADOS_GH_TOKEN;
  _definirFonte(undefined);
});

describe("primeiro administrador (repositório de dados vazio)", () => {
  it("exige o código (6 últimos caracteres do token) e cria só uma vez", async () => {
    expect(await precisaPrimeiroAdmin()).toBe(true);
    expect((await criarPrimeiroAdmin({ ...novoAdmin, codigo: "errado" })).erro).toMatch(/Código/);
    expect((await criarPrimeiroAdmin({ ...novoAdmin, funcao: "manutentor", codigo: "XYZ789" })).erro).toMatch(/Líder/);
    const r = await criarPrimeiroAdmin({ ...novoAdmin, codigo: "XYZ789" });
    expect(r).toEqual({ erro: "", login: "6178609" });
    const us = await usuarios();
    expect(us["6178609"]).toMatchObject({ nome: "Ana Lima", perfil: "admin", funcao: "lider", ativo: true });
    expect(await confere(us["6178609"], SENHA)).toBe(true); // hash PBKDF2 gravado no cadastro
    expect(await precisaPrimeiroAdmin()).toBe(false);
    expect((await criarPrimeiroAdmin({ ...novoAdmin, login: "1234567", codigo: "XYZ789" })).erro).toMatch(/Já existe/);
  });
});

describe("tela Usuários", () => {
  const eu = { login: "6178609", perfil: "admin", funcao: "lider" };
  beforeEach(async () => { await criarPrimeiroAdmin({ ...novoAdmin, codigo: "XYZ789" }); });

  it("novo usuário com senha provisória; valida NP, senha e duplicado", async () => {
    expect(await criarUsuario(eu.login, { nome: "Rui", login: "abc", funcao: "manutentor", perfil: "leitor", senha: SENHA })).toMatch(/NP/);
    expect(await criarUsuario(eu.login, { nome: "Rui", login: "1111111", funcao: "manutentor", perfil: "leitor", senha: "12345678" })).toMatch(/letras/);
    expect(await criarUsuario(eu.login, { nome: "Rui", login: "1111111", funcao: "manutentor", perfil: "leitor", senha: SENHA })).toBe("");
    expect(await criarUsuario(eu.login, { nome: "Rui", login: "1111111", funcao: "manutentor", perfil: "leitor", senha: SENHA })).toMatch(/já existe/);
    expect((await usuarios())["1111111"]).toMatchObject({ trocar_senha: true, perfil: "leitor", atualizado_por: "6178609" });
  });

  it("único administrador não perde o perfil nem é desativado; troca de NP move a conta", async () => {
    const e = { novoLogin: "6178609", nome: "Ana", funcao: "lider", perfil: "leitor", ativo: false, novaSenha: "", abas: null };
    expect((await editarUsuario(eu, "6178609", e)).erro).toBe("");
    expect((await usuarios())["6178609"]).toMatchObject({ perfil: "admin", ativo: true });
    await criarUsuario(eu.login, { nome: "Rui", login: "1111111", funcao: "manutentor", perfil: "leitor", senha: SENHA });
    const r = await editarUsuario(eu, "1111111", { ...e, novoLogin: "2222222", funcao: "manutentor", perfil: "editor", ativo: true,
      abas: ["ordens"] });
    expect(r).toEqual({ erro: "", login: "2222222" });
    const us = await usuarios();
    expect(us["1111111"]).toBeUndefined();
    expect(us["2222222"]).toMatchObject({ perfil: "editor", abas: ["ordens"] });
    expect(await confere(us["2222222"], SENHA)).toBe(true); // a senha continua a mesma
    expect(await excluirUsuario(eu, "6178609")).toMatch(/própria/);
    expect(await excluirUsuario(eu, "2222222")).toBe("");
  });

  it("e-mail opcional: valida, guarda em minúsculas, mantém quando não vem e apaga quando vem vazio", async () => {
    const novo = { nome: "Lia", login: "3333333", funcao: "lider", perfil: "leitor", senha: SENHA };
    expect(await criarUsuario(eu.login, { ...novo, email: "lia@" })).toMatch(/E-mail/);
    expect(await criarUsuario(eu.login, { ...novo, email: " Lia.Lider@Exemplo.com " })).toBe("");
    expect((await usuarios())["3333333"].email).toBe("lia.lider@exemplo.com");
    const e = { novoLogin: "3333333", nome: "Lia", funcao: "lider", perfil: "leitor", ativo: true, novaSenha: "", abas: null };
    expect((await editarUsuario(eu, "3333333", e)).erro).toBe("");
    expect((await usuarios())["3333333"].email).toBe("lia.lider@exemplo.com");
    expect((await editarUsuario(eu, "3333333", { ...e, email: "x y@exemplo.com" })).erro).toMatch(/E-mail/);
    expect((await editarUsuario(eu, "3333333", { ...e, email: "" })).erro).toBe("");
    expect((await usuarios())["3333333"].email).toBeUndefined();
  });

  it("não tira de si mesmo o acesso às abas", async () => {
    const r = await editarUsuario(eu, "6178609", { novoLogin: "6178609", nome: "Ana", funcao: "lider", perfil: "admin",
      ativo: true, novaSenha: "", abas: ["ordens"] });
    expect(r.erro).toMatch(/si mesmo/);
    // e o único administrador não vira Manutentor (que só vê o Estoque e não administra)
    const m = await editarUsuario(eu, "6178609", { novoLogin: "6178609", nome: "Ana", funcao: "manutentor", perfil: "admin",
      ativo: true, novaSenha: "", abas: null });
    expect(m.erro).toMatch(/Manutentor não pode ser administrador/);
  });

  it("trocar a senha confere a atual e derruba os outros aparelhos", async () => {
    const { gravarCadastroLote } = await import("@/lib/dados/cadastros");
    await gravarCadastroLote("usuarios.json", { "6178609": { sessoes: [{ h: "este", ate: "2999" }, { h: "outro", ate: "2999" }] } }, "x", true);
    expect(await trocarSenha("6178609", "errada", "Nova-Senha-2", "Nova-Senha-2", "este")).toMatch(/atual/);
    expect(await trocarSenha("6178609", SENHA, "Nova-Senha-2", "Nova-Senha-2", "este")).toBe("");
    const u = (await usuarios())["6178609"];
    expect(u.sessoes).toEqual([{ h: "este", ate: "2999" }]);
    expect(await confere(u, "Nova-Senha-2")).toBe(true);
  });
});
