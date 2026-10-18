import { describe, expect, it } from "vitest";

import { acessoTotal, ehAdmin, podeEditar, podeVer, veInteira } from "@/lib/auth/acesso";
import { confere, normalizarLogin, validarLogin } from "@/lib/auth/senha";
import { TODAS } from "@/lib/navegacao";

describe("acesso por função", () => {
  it("líder e analista veem tudo", () => {
    for (const funcao of ["lider", "analista"]) {
      const u = { login: "x", funcao, perfil: "leitor" };
      expect(acessoTotal(u)).toBe(true);
      expect(TODAS.every((p) => podeVer(u, p))).toBe(true);
    }
    expect(podeVer({ login: "l", funcao: "lider" }, "mro") && podeVer({ login: "a", funcao: "analista" }, "mro")).toBe(true);
    expect(ehAdmin({ login: "a", funcao: "lider", perfil: "admin" })).toBe(true);
  });
  it("conta antiga sem função e abas escolhidas", () => {
    expect(acessoTotal({ login: "a", perfil: "admin" })).toBe(true);
    expect(TODAS.filter((p) => podeVer({ login: "e", perfil: "editor" }, p))).toEqual(["equipamentos", "estoque"]);
    const pers = { login: "p", perfil: "editor", abas: ["ordens", "planos"] };
    expect(podeVer(pers, "ordens") && podeVer(pers, "planos") && podeVer(pers, "estoque")).toBe(true);
    expect(podeVer(pers, "painel")).toBe(false);
    expect(podeVer(null, "estoque")).toBe(false);
  });
  it("terceiro e manutentor só veem o Estoque — mesmo com lista de abas ou perfil administrador", () => {
    for (const funcao of ["terceiro", "manutentor"]) {
      for (const u of [{ login: "t", funcao, perfil: "leitor" }, { login: "t", funcao, perfil: "editor" }, { login: "t", funcao, perfil: "admin" },
        { login: "t", funcao, abas: TODAS }, { login: "t", funcao, abas: ["ordens", "mro", "equipamentos"] }]) {
        expect(TODAS.filter((p) => podeVer(u, p))).toEqual(["estoque"]);
        expect(TODAS.filter((p) => veInteira(u, p))).toEqual(["estoque"]);
        expect(acessoTotal(u)).toBe(false);
        expect(ehAdmin(u)).toBe(false);
      }
    }
  });
  it("perfil de edição", () => {
    expect(podeEditar({ login: "a", perfil: "editor" })).toBe(true);
    expect(podeEditar({ login: "a", perfil: "leitor" })).toBe(false);
  });
});

describe("senha e login", () => {
  it("confere um hash PBKDF2 já gravado no cadastro", async () => {
    const u = { sal: "00112233445566778899aabbccddeeff", senha_hash: "1b491ff57c39b5e752f1567e6f946262ab75a354d0d07ad374002b8e617be06a" };
    expect(await confere(u, "Senha-Teste-1")).toBe(true);
    expect(await confere(u, "senha-teste-1")).toBe(false);
    expect(await confere(null, "x")).toBe(false);
  });
  it("NP", () => {
    expect(normalizarLogin(" 6.178.609 ")).toBe("6178609");
    expect(normalizarLogin("Jose.Silva")).toBe("jose.silva");
    expect(validarLogin("6178609")).toBe("");
    expect(validarLogin("abc")).not.toBe("");
  });
});
