import { afterEach, describe, expect, it } from "vitest";

import { gravarCadastroLote, lerCadastro, versaoCadastro } from "@/lib/dados/cadastros";
import { _definirFonte, type Fonte } from "@/lib/dados/fonte";
import { _definirSupabase, MARCADOR_MIGRACAO, SupabaseSemAcesso, type ClienteSupabase } from "@/lib/dados/supabase";

/** Cadastros no Supabase: banco e repositório de dados falsos na memória (dados fictícios). */
const json = (j: unknown) => new TextEncoder().encode(JSON.stringify(j));

function repositorio(arquivos: Record<string, unknown>) {
  const m = new Map<string, { bytes: Uint8Array; versao: string }>(
    Object.entries(arquivos).map(([c, j], i) => [c, { bytes: json(j), versao: `sha${i}` }]));
  const gravados: string[] = [];
  const f: Fonte = {
    modo: "github", descricao: "repositório falso",
    versoes: async () => new Map([...m].map(([k, v]) => [k, v.versao])),
    ler: async (c) => m.get(c) ?? null,
    apagar: async () => true,
    gravarCondicional: async (c, bytes) => { gravados.push(c); m.set(c, { bytes, versao: "novo" }); return true; },
  };
  return { f, gravados };
}

function banco(opcoes: { falharVersoes?: () => boolean; intrometer?: string } = {}) {
  const linhas = new Map<string, { conteudo: unknown; versao: number }>();
  let seq = 0, intrometeu = !opcoes.intrometer;
  const c: ClienteSupabase = {
    versoes: async () => {
      if (opcoes.falharVersoes?.()) throw new Error("fora do ar");
      return new Map([...linhas].map(([k, v]) => [k, String(v.versao)]));
    },
    ler: async (nome) => { const l = linhas.get(nome); return l ? { conteudo: structuredClone(l.conteudo), versao: String(l.versao) } : null; },
    gravar: async (nome, conteudo, versao) => {
      if (!intrometeu && nome === opcoes.intrometer) { // outra pessoa grava no meio
        intrometeu = true;
        const l = linhas.get(nome)!;
        linhas.set(nome, { conteudo: { ...(l.conteudo as object), outro: { de: "Bia" } }, versao: ++seq });
      }
      const atual = linhas.get(nome);
      if (versao == null ? atual : atual?.versao !== Number(versao)) return null;
      linhas.set(nome, { conteudo: structuredClone(conteudo), versao: ++seq });
      return String(seq);
    },
    importar: async (docs) => { for (const d of docs) if (!linhas.has(d.nome)) linhas.set(d.nome, { conteudo: d.conteudo, versao: ++seq }); },
  };
  return { c, linhas };
}

afterEach(() => { _definirFonte(undefined); _definirSupabase(undefined); });

describe("cadastros no Supabase", () => {
  it("copia os cadastros do repositório uma vez (sem backups) e nunca por cima do que já está no banco", async () => {
    const { f } = repositorio({
      "app/usuarios.json": { ana: { nome: "Ana" } }, "app/metas_sb.json": { m: { meta: 1 } },
      "app/backup/usuarios-2026-10-01.json": {}, "bases/IW38.parquet": "x",
    });
    const { c, linhas } = banco();
    linhas.set("metas_sb.json", { conteudo: { m: { meta: 9 } }, versao: 100 }); // já gravado no banco
    _definirFonte(f);
    _definirSupabase(c);
    expect(await lerCadastro("usuarios.json")).toEqual({ ana: { nome: "Ana" } }); // a leitura espera a cópia
    expect((await lerCadastro("metas_sb.json")).m).toEqual({ meta: 9 });
    expect([...linhas.keys()].sort()).toEqual([MARCADOR_MIGRACAO, "metas_sb.json", "usuarios.json"]);
    expect((linhas.get(MARCADOR_MIGRACAO)!.conteudo as { copiados: object }).copiados).toEqual({ "usuarios.json": "sha0", "metas_sb.json": "sha1" });
  });

  it("não marca a cópia como feita se o repositório vier sem usuarios.json (tenta de novo depois)", async () => {
    const { f } = repositorio({});
    const { c, linhas } = banco();
    _definirFonte(f);
    _definirSupabase(c);
    await expect(lerCadastro("vazio_sb.json")).rejects.toThrow(/usuarios\.json/);
    expect(linhas.has(MARCADOR_MIGRACAO)).toBe(false);
  });

  it("gravação condicional: conflito relê e aplica de novo; cópia do dia vai para o repositório", async () => {
    const { f, gravados } = repositorio({ "app/usuarios.json": {}, "app/hh_sb.json": { "10": { nome: "Pessoa" } } });
    const { c, linhas } = banco({ intrometer: "hh_sb.json" });
    _definirFonte(f);
    _definirSupabase(c);
    const antes = await versaoCadastro("hh_sb.json");
    await gravarCadastroLote("hh_sb.json", { "10": { cargo: "Mecânico" } }, "ana", true);
    const conteudo = linhas.get("hh_sb.json")!.conteudo as Record<string, Record<string, unknown>>;
    expect(conteudo["10"]).toMatchObject({ nome: "Pessoa", cargo: "Mecânico", atualizado_por: "ana" });
    expect(conteudo.outro).toEqual({ de: "Bia" }); // a gravação do outro não se perdeu
    expect(await versaoCadastro("hh_sb.json")).not.toBe(antes);
    await new Promise((ok) => setTimeout(ok, 0));
    expect(gravados.some((g) => g.startsWith("app/backup/hh_sb-"))).toBe(true);
  });

  it("Supabase fora do ar: a leitura usa o último conteúdo lido", async () => {
    const { f } = repositorio({ "app/usuarios.json": {}, "app/pref_sb.json": { a: { v: 1 } } });
    let fora = false;
    const { c } = banco({ falharVersoes: () => fora });
    _definirFonte(f);
    _definirSupabase(c);
    expect(await lerCadastro("pref_sb.json")).toEqual({ a: { v: 1 } });
    fora = true;
    expect(await lerCadastro("pref_sb.json", { fresco: true })).toEqual({ a: { v: 1 } });
  });

  it("demonstração e pasta local não usam o Supabase", async () => {
    const { f } = repositorio({ "app/usuarios.json": { ze: {} } });
    const { c, linhas } = banco();
    _definirFonte({ ...f, modo: "pasta" });
    _definirSupabase(c);
    expect(await lerCadastro("usuarios.json")).toEqual({ ze: {} });
    expect(linhas.size).toBe(0);
  });

  it("chave recusada (ex.: publicável no lugar da secreta) antes da cópia: segue no repositório, sem erro", async () => {
    const { f, gravados } = repositorio({ "app/usuarios.json": { ana: { nome: "Ana" } }, "app/chave_sb.json": { a: { v: 1 } } });
    const recusa = () => { throw new SupabaseSemAcesso("recusou"); };
    const c: ClienteSupabase = { versoes: async () => recusa(), ler: async () => recusa(), gravar: async () => recusa(), importar: async () => recusa() };
    _definirFonte(f);
    _definirSupabase(c);
    expect(await lerCadastro("chave_sb.json")).toEqual({ a: { v: 1 } });
    await gravarCadastroLote("chave_sb.json", { b: { v: 2 } }, "ana");
    expect(gravados).toContain("app/chave_sb.json"); // gravou no repositório, como antes
  });

  it("chave recusada depois da cópia: dá erro (nunca volta aos cadastros parados do repositório)", async () => {
    const { f } = repositorio({ "app/usuarios.json": {}, "app/__migrado_supabase.json": {} });
    const recusa = () => { throw new SupabaseSemAcesso("recusou"); };
    _definirFonte(f);
    _definirSupabase({ versoes: async () => recusa(), ler: async () => recusa(), gravar: async () => recusa(), importar: async () => recusa() });
    await expect(lerCadastro("depois_sb.json")).rejects.toThrow(/recusou/);
  });
});
