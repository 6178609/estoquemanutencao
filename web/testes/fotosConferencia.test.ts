import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { _definirFonte } from "@/lib/dados/fonte";
import { _definirSupabase } from "@/lib/dados/supabase";
import { lerCadastro } from "@/lib/dados/cadastros";
import { fotoDoCadastro, fotoExternaDe } from "@/lib/dados/fotosExternas";
import { aConferir, conferirAosPoucos, conferirFotos } from "@/lib/fotos/conferencia";

const agora = Date.parse("2026-10-26T12:00:00Z");
const pag = (n: string) => ({ url: null, pagina: `https://loja.exemplo.com.br/p/${n}`, titulo: n, buscado_em: "2026-10-25T00:00:00Z" });

describe("conferência das fotos do fabricante", () => {
  _definirFonte(null);
  _definirSupabase(null);

  it("confere as nunca conferidas e as que falharam há mais de 3 dias", () => {
    const cad = {
      novo: pag("novo"),
      ok: { ...pag("ok"), conferido_em: "2026-10-25T00:00:00Z" },
      falhouOntem: { ...pag("f1"), falhas: 1, conferido_em: "2026-10-25T00:00:00Z" },
      falhouAntes: { ...pag("f2"), falhas: 1, conferido_em: "2026-10-20T00:00:00Z" },
    };
    expect(aConferir(cad, agora)).toEqual(["novo", "falhouAntes"]);
  });

  it("foto já guardada no repositório não depende da loja: aparece e não é conferida", () => {
    const guardada = { ...pag("g"), arquivo: "app/fotos/fabricante/100200.jpg", falhas: 1 };
    expect(fotoDoCadastro(guardada)?.arquivo).toBe("app/fotos/fabricante/100200.jpg");
    expect(fotoDoCadastro({ arquivo: "app/fotos/fabricante/100200.webp", titulo: "x" })?.arquivo).toBe("app/fotos/fabricante/100200.webp");
    expect(aConferir({ g: guardada }, agora)).toEqual([]);
    // alta resolução + miniatura para a lista
    const comMini = fotoDoCadastro({ arquivo: "app/fotos/fabricante/1.jpg", arquivo_mini: "app/fotos/fabricante/1_mini.jpg" })!;
    expect(comMini.arquivoMini).toBe("app/fotos/fabricante/1_mini.jpg");
    expect(fotoExternaDe(comMini).mini).toBe(true);
    expect(fotoDoCadastro({ arquivo_mini: "app/fotos/fabricante/1_mini.jpg" })).toBeNull();
    // caminho fora da pasta das guardadas é ignorado
    expect(fotoDoCadastro({ arquivo: "app/usuarios.json" })).toBeNull();
    expect(fotoDoCadastro({ arquivo: "app/fotos/fabricante/../usuarios.jpg" })).toBeNull();
  });

  it("foto que falhou na conferência não aparece na tela", () => {
    expect(fotoDoCadastro({ ...pag("x"), falhas: 1 })).toBeNull();
    expect(fotoDoCadastro(pag("x"))).not.toBeNull();
  });

  it("a que carrega ganha o endereço da imagem; a que falha sai da tela mas fica no cadastro", async () => {
    const { gravarCadastroLote } = await import("@/lib/dados/cadastros");
    await gravarCadastroLote("fotos_referencia.json", {
      "910001": pag("bom"), "910002": pag("ruim"), "910003": { ...pag("ruim2"), falhas: 1, conferido_em: "2026-10-01T00:00:00Z" },
    }, "teste", false);
    const conferir = vi.fn(async (f: { pagina: string | null }) => {
      if (f.pagina?.endsWith("/bom")) return "https://cdn.exemplo.com.br/bom.jpg";
      throw new Error("resposta 403");
    });
    const r = await conferirFotos({ limite: 100, prazoMs: 10_000, agora, conferir });
    // a demonstração já traz uma foto de exemplo (900000, endereço que não existe): ela também falha
    expect(r).toMatchObject({ ok: 1, falharam: 3 });
    const cad = await lerCadastro("fotos_referencia.json");
    expect(cad["910001"]).toMatchObject({ url: "https://cdn.exemplo.com.br/bom.jpg", pagina: "https://loja.exemplo.com.br/p/bom" });
    expect(cad["910001"].falhas).toBeUndefined();
    expect(cad["910002"]).toMatchObject({ falhas: 1 });
    expect(fotoDoCadastro(cad["910002"])).toBeNull();
    // 2ª falha: continua no cadastro (escondido), com nova tentativa só em 30 dias
    expect(cad["910003"]).toMatchObject({ falhas: 2 });
    expect(aConferir({ x: { ...pag("x"), falhas: 2, conferido_em: "2026-10-20T00:00:00Z" } }, agora)).toEqual([]);
    expect(aConferir({ x: { ...pag("x"), falhas: 2, conferido_em: "2026-09-01T00:00:00Z" } }, agora)).toEqual(["x"]);
  });

  it("falha passageira não conta; rodada só de falhas (rede caída) não grava nada", async () => {
    const cad = Object.fromEntries(Array.from({ length: 25 }, (_, i) => [`93${String(i).padStart(4, "0")}`, pag(`r${i}`)]));
    const gravados: string[] = [];
    const { gravarCadastroLote } = await import("@/lib/dados/cadastros");
    const passageira = await conferirFotos({ limite: 5, prazoMs: 10_000, agora, ler: async () => cad,
      conferir: async () => { throw new Error("tempo esgotado"); } });
    expect(passageira).toMatchObject({ conferidas: 5, falharam: 0, passageiras: 5, pendentes: 25 });
    await gravarCadastroLote("fotos_referencia.json", cad, "teste", false);
    const rede = await conferirFotos({ limite: 1_000, prazoMs: 10_000, agora,
      conferir: async () => { throw new Error("resposta 403"); } });
    expect(rede.ok).toBe(0);
    expect(rede.falharam).toBeGreaterThanOrEqual(25);
    const lido = await lerCadastro("fotos_referencia.json");
    for (const k of Object.keys(cad)) if (lido[k]?.falhas) gravados.push(k);
    expect(gravados).toEqual([]);
  });

  it("respeita o limite por rodada e conta o que ficou pendente", async () => {
    const cad = Object.fromEntries(Array.from({ length: 5 }, (_, i) => [`92000${i}`, pag(`q${i}`)]));
    const conferir = vi.fn(async () => "https://cdn.exemplo.com.br/a.jpg");
    const r = await conferirFotos({ limite: 2, prazoMs: 10_000, agora, conferir, ler: async () => cad });
    expect(r.conferidas).toBe(2);
    expect(r.pendentes).toBe(3);
    expect(conferir).toHaveBeenCalledTimes(2);
  });

  it("aos poucos: não roda na demonstração (sem repositório de dados)", async () => {
    expect(await conferirAosPoucos()).toBeNull();
  });
});
