import { describe, expect, it } from "vitest";

import { ABAS_BASICAS, acessoTotal, ehAdmin, podeEditar, podeEditarSuporte, podeVer } from "@/lib/auth/acesso";
import { confere, normalizarLogin, validarLogin } from "@/lib/auth/senha";
import { GRUPOS, TODAS } from "@/lib/navegacao";

describe("aba Programação de paradas", () => {
  it("liberada a Líder e Analista pelo padrão da função; Manutentor só se marcada", () => {
    expect(podeVer({ login: "l", funcao: "lider" }, "programacao_paradas")).toBe(true);
    expect(podeVer({ login: "a", funcao: "analista" }, "programacao_paradas")).toBe(true);
    expect(podeVer({ login: "m", funcao: "manutentor" }, "programacao_paradas")).toBe(false);
    expect(podeVer({ login: "m", funcao: "manutentor", abas: ["programacao_paradas"] }, "programacao_paradas")).toBe(true);
  });
  it("no grupo Planejamento, com rota e ícone", () => {
    const g = GRUPOS.find((x) => x.titulo === "Planejamento")!;
    const a = g.abas.find((x) => x.id === "programacao_paradas");
    expect(a).toMatchObject({ titulo: "Programação de paradas", icone: "CalendarCog", rota: "/programacao_paradas" });
    expect(g.abas.findIndex((x) => x.id === "programacao_paradas")).toBe(g.abas.findIndex((x) => x.id === "gestao_hh") + 1);
  });
});

describe("aba Cadastro de material", () => {
  it("no padrão de Líder e Analista; fora das abas básicas (Manutentor e Terceiro só se marcada)", () => {
    expect(TODAS).toContain("cadastro_material");
    expect(ABAS_BASICAS.has("cadastro_material")).toBe(false);
    expect(podeVer({ login: "l", funcao: "lider" }, "cadastro_material")).toBe(true);
    expect(podeVer({ login: "a", funcao: "analista" }, "cadastro_material")).toBe(true);
    expect(podeVer({ login: "m", funcao: "manutentor" }, "cadastro_material")).toBe(false);
    expect(podeVer({ login: "t", funcao: "terceiro" }, "cadastro_material")).toBe(false);
    expect(podeVer({ login: "m", funcao: "manutentor", abas: ["cadastro_material"] }, "cadastro_material")).toBe(true);
  });
  it("no grupo Custos e suprimentos, logo após Requisições, com rota e ícone", () => {
    const g = GRUPOS.find((x) => x.titulo === "Custos e suprimentos")!;
    const a = g.abas.find((x) => x.id === "cadastro_material");
    expect(a).toMatchObject({ titulo: "Cadastro de material", icone: "PackagePlus", rota: "/cadastro_material" });
    expect(g.abas.findIndex((x) => x.id === "cadastro_material")).toBe(g.abas.findIndex((x) => x.id === "requisicoes") + 1);
  });
});

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
    expect(TODAS.filter((p) => podeVer({ login: "e", perfil: "editor" }, p)).sort()).toEqual(["estoque", "suporte"]);
    const pers = { login: "p", perfil: "editor", abas: ["ordens", "planos"] };
    expect(podeVer(pers, "ordens") && podeVer(pers, "planos")).toBe(true);
    // regra única: só as abas marcadas — Estoque e Suporte não vêm mais de graça
    expect(podeVer(pers, "estoque") || podeVer(pers, "suporte") || podeVer(pers, "painel")).toBe(false);
    expect(podeVer(null, "estoque")).toBe(false);
  });
  it("padrão da função: Terceiro e Manutentor veem o Estoque e o Suporte Técnico; não podem ser administradores", () => {
    for (const funcao of ["terceiro", "manutentor"]) {
      for (const perfil of ["leitor", "editor", "admin"]) {
        const u = { login: "t", funcao, perfil };
        expect(TODAS.filter((p) => podeVer(u, p)).sort()).toEqual(["estoque", "suporte"]);
        expect(acessoTotal(u)).toBe(false);
      }
    }
    expect(ehAdmin({ login: "t", funcao: "terceiro", perfil: "admin" })).toBe(false);
    // manutentor que já era administrador segue administrando usuários (o site não fica sem administrador)
    expect(ehAdmin({ login: "m", funcao: "manutentor", perfil: "admin" })).toBe(true);
  });
  it("lista própria vale para qualquer função, inclusive Terceiro e Manutentor", () => {
    const m = { login: "m", funcao: "manutentor", perfil: "leitor", abas: ["estoque", "suporte", "manuais"] };
    expect(TODAS.filter((p) => podeVer(m, p)).sort()).toEqual(["estoque", "manuais", "suporte"]);
    const t = { login: "t", funcao: "terceiro", perfil: "leitor", abas: ["ordens"] };
    expect(podeVer(t, "ordens")).toBe(true);
    expect(podeVer(t, "estoque")).toBe(false);
    const a = { login: "a", funcao: "analista", perfil: "leitor", abas: ["estoque"] };
    expect(TODAS.filter((p) => podeVer(a, p))).toEqual(["estoque"]);
    expect(acessoTotal({ login: "x", funcao: "manutentor", abas: TODAS })).toBe(true);
    expect(TODAS.filter((p) => podeVer({ login: "v", funcao: "lider", abas: [] }, p))).toEqual([]);
  });
  it("gravar na biblioteca técnica segue a regra antiga: editor com a aba (ou função de acesso total), nunca Terceiro/Manutentor", () => {
    expect(podeEditarSuporte({ login: "l", funcao: "lider", perfil: "editor" })).toBe(true);
    expect(podeEditarSuporte({ login: "a", funcao: "analista", perfil: "admin" })).toBe(true);
    expect(podeEditarSuporte({ login: "l", funcao: "lider", perfil: "leitor" })).toBe(false);
    expect(podeEditarSuporte({ login: "m", funcao: "manutentor", perfil: "admin" })).toBe(false);
    expect(podeEditarSuporte({ login: "t", funcao: "terceiro", perfil: "editor", abas: ["suporte"] })).toBe(false);
    expect(podeEditarSuporte({ login: "s", perfil: "editor" })).toBe(false);
    expect(podeEditarSuporte({ login: "e", funcao: "analista", perfil: "editor", abas: ["ordens"] })).toBe(false);
    expect(podeEditarSuporte({ login: "e", funcao: "analista", perfil: "editor", abas: ["ordens", "suporte"] })).toBe(true);
    expect(podeEditarSuporte(null)).toBe(false);
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

describe("aba nova Indicadores SIM (MP) e Manuais", () => {
  it("liberadas para Líder e Analista; fora do padrão de Terceiro e Manutentor e de lista que não as marca", () => {
    for (const aba of ["indicadores_sim", "manuais"]) {
      expect(podeVer({ login: "a", funcao: "lider", perfil: "leitor" }, aba)).toBe(true);
      expect(podeVer({ login: "b", funcao: "analista", perfil: "leitor" }, aba)).toBe(true);
      expect(podeVer({ login: "c", funcao: "terceiro", perfil: "editor" }, aba)).toBe(false);
      expect(podeVer({ login: "d", funcao: "manutentor", perfil: "admin" }, aba)).toBe(false);
      expect(podeVer({ login: "e", funcao: "analista", perfil: "leitor", abas: ["painel", "ordens"] }, aba)).toBe(false);
    }
  });
});

describe("aba Manuais", () => {
  it("fica no grupo Confiabilidade, logo depois de Equipamentos", () => {
    const g = GRUPOS.find((x) => x.abas.some((a) => a.id === "manuais"));
    expect(g?.titulo).toBe("Confiabilidade");
    const ids = g!.abas.map((a) => a.id);
    expect(ids[ids.indexOf("equipamentos") + 1]).toBe("manuais");
    expect(GRUPOS.flatMap((x) => x.abas).find((a) => a.id === "manuais")).toMatchObject({ rota: "/manuais", icone: "BookOpen" });
  });
});
