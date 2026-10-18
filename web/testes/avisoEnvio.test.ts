import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { criarPrimeiroAdmin, criarUsuario } from "@/lib/auth/usuarios";
import { validarEmail } from "@/lib/auth/senha";
import { enviarAvisoTreinamentos, ultimoEnvio } from "@/lib/avisos/treinamentos";
import { _definirFonte, type Fonte } from "@/lib/dados/fonte";
import { _definirSupabase } from "@/lib/dados/supabase";
import type { ItemAviso } from "@/lib/wcm/avisoTreinamentos";
import { dia } from "@/lib/wcm/util";

// tudo fictício: repositório de dados na memória, SMTP falso
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

const HOJE = dia(2026, 10, 19)!;
const ITEM: ItemAviso = { np: "1", nome: "Pessoa Um", cargo: "", turma: "", titulo: "NR-10", validade: HOJE + 10, dias: 10, vencido: false };
const comItens = (itens: ItemAviso[], semEquipe = false) => async () => ({ itens, hoje: HOJE, semEquipe });
const SENHA = "Senha-Forte-1";

beforeEach(async () => {
  process.env.DADOS_GH_TOKEN = "github_pat_FICTICIO_abc123XYZ789";
  _definirFonte(fonteMemoria());
  _definirSupabase(null);
  await criarPrimeiroAdmin({ nome: "Admin", login: "9000001", funcao: "analista", senha: SENHA, senha2: SENHA, codigo: "XYZ789" });
  for (const [login, funcao, email] of [["9000002", "lider", "lider.a@exemplo.test"], ["9000003", "lider", "lider.b@exemplo.test"],
    ["9000004", "lider", ""], ["9000005", "analista", "analista@exemplo.test"]])
    await criarUsuario("9000001", { nome: `Pessoa ${login}`, login, funcao, perfil: "leitor", senha: SENHA, email });
});
afterEach(() => {
  delete process.env.DADOS_GH_TOKEN;
  _definirFonte(undefined);
  _definirSupabase(undefined);
});

describe("envio do aviso semanal", () => {
  it("manda só aos líderes com e-mail, uma vez por semana no automático; o manual reenvia", async () => {
    const para: string[] = [];
    const enviar = async (e: string) => { para.push(e); };
    const r = await enviarAvisoTreinamentos({ manual: false, por: "teste", site: "https://exemplo.test", enviar, itens: comItens([ITEM]) });
    expect(r).toEqual({ ok: true, enviados: 2, itens: 1, falhas: [] });
    expect(para.sort()).toEqual(["lider.a@exemplo.test", "lider.b@exemplo.test"]);
    expect(await ultimoEnvio()).toMatchObject({ semana: "2026-S43", destinatarios: 2, itens: 1 });
    expect((await ultimoEnvio())?.enviando).toBeUndefined();
    const de_novo = await enviarAvisoTreinamentos({ manual: false, por: "teste", site: "x", enviar, itens: comItens([ITEM]) });
    expect(de_novo).toMatchObject({ ok: false, motivo: expect.stringMatching(/já foi enviado/) });
    expect(await enviarAvisoTreinamentos({ manual: true, por: "teste", site: "x", enviar, itens: comItens([ITEM]) })).toMatchObject({ ok: true, enviados: 2 });
  });
  it("falha de um destinatário não para os outros; sem tempo, o resto fica como pendente", async () => {
    const r = await enviarAvisoTreinamentos({ manual: true, por: "teste", site: "x", itens: comItens([ITEM]),
      enviar: async (e) => { if (e.startsWith("lider.a")) throw Object.assign(new Error("550 lider.a@exemplo.test rejeitado"), { responseCode: 550 }); } });
    expect(r).toMatchObject({ ok: true, enviados: 1, falhas: ["Pessoa 9000002"] });
    let t = 0;
    const lento = await enviarAvisoTreinamentos({ manual: true, por: "teste", site: "x", itens: comItens([ITEM]),
      agora: () => (t += 30_000), enviar: async () => {} });
    expect(lento).toMatchObject({ ok: true, enviados: 1, falhas: ["Pessoa 9000003 (sem tempo)"] });
  });
  it("equipe ilegível não vira 'nada vencendo'; sem itens registra a semana sem mandar", async () => {
    const enviar = async () => { throw new Error("não devia enviar"); };
    expect(await enviarAvisoTreinamentos({ manual: false, por: "t", site: "x", enviar, itens: comItens([], true) }))
      .toMatchObject({ ok: false, motivo: expect.stringMatching(/equipe/) });
    expect(await ultimoEnvio()).toBeNull();
    expect(await enviarAvisoTreinamentos({ manual: false, por: "t", site: "x", enviar, itens: comItens([]) }))
      .toEqual({ ok: true, enviados: 0, itens: 0, falhas: [] });
    expect(await ultimoEnvio()).toMatchObject({ semana: "2026-S43", itens: 0 });
  });
  it("e-mail com quebra de linha ou sinais de cabeçalho é recusado", () => {
    expect(validarEmail("a@exemplo.test\r\nBcc: x@y.z")).not.toBe("");
    expect(validarEmail("<a@exemplo.test>")).not.toBe("");
    expect(validarEmail("a,b@exemplo.test")).not.toBe("");
    expect(validarEmail("nome.sobrenome@exemplo.com.br")).toBe("");
  });
});
