import { describe, expect, it } from "vitest";

import { acessoTotal, podeEditar, podeVer, veInteira } from "@/lib/auth/acesso";
import { confere, normalizarLogin, validarLogin } from "@/lib/auth/senha";
import { TODAS } from "@/lib/navegacao";

describe("acesso por função (os casos de tests/test_acesso.py)", () => {
  it("líder e analista veem tudo; manutentor só estoque + gestão de ativos", () => {
    for (const funcao of ["lider", "analista"]) {
      const u = { login: "x", funcao, perfil: "leitor" };
      expect(acessoTotal(u)).toBe(true);
      expect(TODAS.every((p) => podeVer(u, p))).toBe(true);
    }
    const m = { login: "m", funcao: "manutentor", perfil: "admin" };
    expect(TODAS.filter((p) => podeVer(m, p))).toEqual(["equipamentos", "estoque"]);
    expect(TODAS.filter((p) => veInteira(m, p))).toEqual(["estoque"]);
    expect(podeVer(m, "paginas/estoque.py")).toBe(true);
    expect(podeVer(m, "paginas\\painel.py")).toBe(false);
  });
  it("conta antiga sem função e abas escolhidas", () => {
    expect(acessoTotal({ login: "a", perfil: "admin" })).toBe(true);
    expect(TODAS.filter((p) => podeVer({ login: "e", perfil: "editor" }, p))).toEqual(["equipamentos", "estoque"]);
    const pers = { login: "p", funcao: "manutentor", abas: ["ordens", "paginas/planos.py"] };
    expect(podeVer(pers, "ordens") && podeVer(pers, "planos") && podeVer(pers, "estoque")).toBe(true);
    expect(podeVer(pers, "painel")).toBe(false);
    expect(acessoTotal({ login: "t", funcao: "manutentor", abas: TODAS })).toBe(true);
    expect(podeVer(null, "estoque")).toBe(false);
  });
  it("perfil de edição", () => {
    expect(podeEditar({ login: "a", perfil: "editor" })).toBe(true);
    expect(podeEditar({ login: "a", perfil: "leitor" })).toBe(false);
  });
});

describe("senha e login (compatível com central/auth.py)", () => {
  it("confere o hash PBKDF2 gerado pelo Python", async () => {
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
