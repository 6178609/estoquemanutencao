import { describe, expect, it } from "vitest";

import {
  limparNome, precisaAtualizarDados, proximaAtualizacao, validarEmailObrigatorio, validarNomeCompleto,
} from "@/lib/auth/atualizacaoDados";

describe("atualização mensal obrigatória dos dados cadastrais", () => {
  it("quem nunca confirmou (ou tem data inválida) precisa atualizar já", () => {
    expect(precisaAtualizarDados(undefined)).toBe(true);
    expect(precisaAtualizarDados("")).toBe(true);
    expect(precisaAtualizarDados("lixo")).toBe(true);
    expect(precisaAtualizarDados(123)).toBe(true);
  });

  it("conta 1 mês a partir do salvamento", () => {
    const salvo = "2026-11-08T13:00:00.000Z";
    expect(proximaAtualizacao(salvo)?.toISOString()).toBe("2026-12-08T13:00:00.000Z");
    expect(precisaAtualizarDados(salvo, new Date("2026-11-08T13:00:01Z"))).toBe(false);
    expect(precisaAtualizarDados(salvo, new Date("2026-12-08T12:59:59Z"))).toBe(false);
    expect(precisaAtualizarDados(salvo, new Date("2026-12-08T13:00:00Z"))).toBe(true);
  });

  it("fim de mês e virada de ano", () => {
    expect(proximaAtualizacao("2026-01-31T10:00:00Z")?.toISOString()).toBe("2026-02-28T10:00:00.000Z");
    expect(proximaAtualizacao("2028-01-31T10:00:00Z")?.toISOString()).toBe("2028-02-29T10:00:00.000Z");
    expect(proximaAtualizacao("2026-12-15T10:00:00Z")?.toISOString()).toBe("2027-01-15T10:00:00.000Z");
  });

  it("nome completo: nome e sobrenome, só letras", () => {
    expect(validarNomeCompleto("")).toMatch(/nome completo/);
    expect(validarNomeCompleto("Fulano")).toMatch(/sobrenome/);
    expect(validarNomeCompleto("Fulano X")).toMatch(/sobrenome/);
    expect(validarNomeCompleto("Fulano 123")).toMatch(/só letras/);
    expect(validarNomeCompleto("  Ana   de Tal ")).toBe("");
    expect(validarNomeCompleto("João D'Ávila-Souza")).toBe("");
    expect(limparNome("  Ana   de Tal ")).toBe("Ana de Tal");
    // nomes reais: apóstrofo curvo (celular), acento separado (NFD), "Jr.", partículas
    expect(validarNomeCompleto("Ana D’Ávila")).toBe("");
    expect(validarNomeCompleto("José da Silva".normalize("NFD"))).toBe("");
    expect(validarNomeCompleto("José de Souza Jr.")).toBe("");
    expect(validarNomeCompleto("Maria da Silva")).toBe("");
    expect(validarNomeCompleto("Maria da")).toMatch(/sobrenome/);
  });

  it("e-mail obrigatório e válido", () => {
    expect(validarEmailObrigatorio("")).toMatch(/Informe o e-mail/);
    expect(validarEmailObrigatorio("nao-e-email")).toMatch(/inválido/);
    expect(validarEmailObrigatorio("pessoa@exemplo.com")).toBe("");
  });
});
