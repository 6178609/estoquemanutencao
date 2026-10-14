import { afterEach, describe, expect, it } from "vitest";

import { gravarCadastroLote, lerCadastro } from "@/lib/dados/cadastros";
import { _definirFonte, type Fonte } from "@/lib/dados/fonte";

/** Fonte na memória que simula outra pessoa gravando no meio (o GitHub recusa pelo sha). */
function fonteFalsa(inicial: Record<string, unknown>, intrometer = false) {
  const arquivos = new Map<string, { bytes: Uint8Array; versao: string }>();
  let n = 1;
  const pôr = (c: string, j: unknown) => arquivos.set(c, { bytes: new TextEncoder().encode(JSON.stringify(j)), versao: String(n++) });
  pôr("app/cadastro_materiais.json", inicial);
  let intrometeu = !intrometer;
  const f: Fonte = {
    modo: "pasta", descricao: "memória",
    versoes: async () => new Map([...arquivos.entries()].map(([k, v]) => [k, v.versao])),
    ler: async (c) => arquivos.get(c) ?? null,
    apagar: async (c) => { arquivos.delete(c); return true; },
    gravarCondicional: async (c, bytes, versao) => {
      if (!intrometeu && c === "app/cadastro_materiais.json") {
        intrometeu = true; // outra pessoa grava a foto do 222 antes de nós
        const atual = JSON.parse(new TextDecoder().decode(arquivos.get(c)!.bytes));
        pôr(c, { ...atual, "222": { foto: "fotos/222.jpg" } });
      }
      if ((arquivos.get(c)?.versao ?? null) !== versao) return false;
      arquivos.set(c, { bytes, versao: String(n++) });
      return true;
    },
  };
  return { f, arquivos };
}

afterEach(() => _definirFonte(undefined));

describe("gravação de cadastros (igual a gravar_cadastro_lote)", () => {
  it("mesclar muda só o mínimo e não apaga a foto; conflito relê e aplica de novo", async () => {
    const { f, arquivos } = fonteFalsa({ "111": { foto: "fotos/111.jpg", minimo: 1 } }, true);
    _definirFonte(f);
    await gravarCadastroLote("cadastro_materiais.json", { "111": { minimo: 5 } }, "Ana", true);
    const j = JSON.parse(new TextDecoder().decode(arquivos.get("app/cadastro_materiais.json")!.bytes));
    expect(j["111"]).toMatchObject({ foto: "fotos/111.jpg", minimo: 5, atualizado_por: "Ana" });
    expect(j["222"]).toEqual({ foto: "fotos/222.jpg" }); // a gravação do outro não se perdeu
    expect([...arquivos.keys()].some((k) => k.startsWith("app/backup/cadastro_materiais-"))).toBe(true);
    await gravarCadastroLote("cadastro_materiais.json", { "111": { minimo: null, foto: null } }, "Ana", true);
    expect((await lerCadastro("cadastro_materiais.json"))["111"]).toBeUndefined(); // sem campos: sai
  });
  it("função no lugar do item: calculada sobre o item relido (edição atômica)", async () => {
    const { f, arquivos } = fonteFalsa({ "111": { pecas: ["A"] } }, true);
    _definirFonte(f);
    const vistos: unknown[] = [];
    await gravarCadastroLote("cadastro_materiais.json", {
      "111": (atual) => { vistos.push(atual); return { ...atual, pecas: [...((atual?.pecas as string[]) ?? []), "B"] }; },
      "333": () => undefined, // nada a gravar
    }, "Ana");
    const j = JSON.parse(new TextDecoder().decode(arquivos.get("app/cadastro_materiais.json")!.bytes));
    expect(j["111"]).toMatchObject({ pecas: ["A", "B"], atualizado_por: "Ana" });
    expect(j["222"]).toEqual({ foto: "fotos/222.jpg" }); // a gravação do outro, no meio, não se perdeu
    expect("333" in j).toBe(false);
    expect(vistos.length).toBe(2); // relida e recalculada depois do conflito
    await gravarCadastroLote("cadastro_materiais.json", { "111": () => null }, "Ana");
    expect((await lerCadastro("cadastro_materiais.json"))["111"]).toBeUndefined();
  });
  it("cadastro ilegível nunca é sobrescrito", async () => {
    const { f, arquivos } = fonteFalsa({});
    arquivos.set("app/cadastro_materiais.json", { bytes: new TextEncoder().encode("{quebrado"), versao: "x" });
    _definirFonte(f);
    await expect(gravarCadastroLote("cadastro_materiais.json", { a: { minimo: 1 } }, "Ana")).rejects.toThrow(/ilegível/);
  });
});
