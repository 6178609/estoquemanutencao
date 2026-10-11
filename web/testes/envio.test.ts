import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { estoque, MANIFESTO } from "@/lib/dados/bases";
import { caminhoParte, receberParte } from "@/lib/dados/envio";
import { _definirFonte, type Fonte } from "@/lib/dados/fonte";
import { paraParquet } from "@/lib/leitura/parquet";

/** Repositório de dados na memória (modo GitHub), com dados fictícios. */
function fonteMemoria() {
  const arquivos = new Map<string, { bytes: Uint8Array; versao: string }>();
  let n = 1;
  const f: Fonte = {
    modo: "github", descricao: "memória",
    versoes: async () => new Map([...arquivos.entries()].map(([k, v]) => [k, v.versao])),
    ler: async (c) => arquivos.get(c) ?? null,
    apagar: async (c, v) => (arquivos.get(c)?.versao === v ? arquivos.delete(c) : false),
    gravarCondicional: async (c, bytes, versao) => {
      if ((arquivos.get(c)?.versao ?? null) !== versao) return false;
      arquivos.set(c, { bytes, versao: `v${n++}` });
      return true;
    },
  };
  return { f, arquivos };
}

const COLS = ["Material", "Texto breve material", "UM", "Utilização livre"];
const mb52 = (de: number, ate: number) => ({ colunas: COLS, linhas: Array.from({ length: ate - de }, (_, i) => [String(de + i), `PECA ${de + i}`, "UN", "2"]) });
const base = { tipo: "mb52" as const, arquivo: "MB52.htm", aba: null, modificado: "2026-10-01T08:00:00+00:00", por: "1234567" };
let mem: ReturnType<typeof fonteMemoria>;

beforeEach(() => { mem = fonteMemoria(); _definirFonte(mem.f); });
afterEach(() => _definirFonte(undefined));

const manifesto = () => JSON.parse(new TextDecoder().decode(mem.arquivos.get(MANIFESTO)!.bytes));

describe("envio de bases pela tela Fontes de dados", () => {
  it("base pequena vai inteira; base grande em partes, e o manifesto só muda na última", async () => {
    await receberParte({ ...base, envio: "aaaaaaaa", parte: 1, total: 1, linhas: 3, bytes: paraParquet(mb52(1, 4)) });
    expect(mem.arquivos.has("bases/MB52.parquet")).toBe(true);
    expect(manifesto()["bases/MB52.parquet"]).toMatchObject({ origem: "MB52.htm", linhas: 3, enviado_por: "1234567" });
    expect((await estoque()).dados?.length).toBe(3);

    // envio em 2 partes: depois da 1ª ainda vale a versão anterior
    const r1 = await receberParte({ ...base, envio: "bbbbbbbb", parte: 1, total: 2, linhas: 10, bytes: paraParquet(mb52(100, 105)) });
    expect(r1.concluido).toBe(false);
    expect(manifesto()["bases/MB52.parquet"].partes).toBeUndefined();
    expect((await estoque()).dados?.length).toBe(3);
    const r2 = await receberParte({ ...base, envio: "bbbbbbbb", parte: 2, total: 2, linhas: 10, bytes: paraParquet(mb52(105, 110)) });
    expect(r2.concluido).toBe(true);
    expect(manifesto()["bases/MB52.parquet"].partes).toEqual([caminhoParte("mb52", "bbbbbbbb", 1), caminhoParte("mb52", "bbbbbbbb", 2)]);
    const est = (await estoque()).dados!;
    expect(est.length).toBe(10); // as duas partes juntas
    expect(est.map((e) => e.material)).toContain("109");

    // novo envio inteiro: volta ao arquivo único e as partes antigas são apagadas
    await receberParte({ ...base, envio: "cccccccc", parte: 1, total: 1, linhas: 2, bytes: paraParquet(mb52(7, 9)) });
    expect([...mem.arquivos.keys()].some((k) => k.startsWith("bases/partes/"))).toBe(false);
    expect((await estoque()).dados?.length).toBe(2);
  });

  it("recusa o que não é parquet, parte inválida e envio sem repositório", async () => {
    const lixo = new TextEncoder().encode("isto não é um parquet");
    await expect(receberParte({ ...base, envio: "aaaaaaaa", parte: 1, total: 1, linhas: 1, bytes: lixo })).rejects.toThrow(/parquet/);
    await expect(receberParte({ ...base, envio: "aaaaaaaa", parte: 3, total: 2, linhas: 1, bytes: paraParquet(mb52(1, 2)) })).rejects.toThrow(/parte/);
    await expect(receberParte({ ...base, envio: "../x", parte: 1, total: 1, linhas: 1, bytes: paraParquet(mb52(1, 2)) })).rejects.toThrow(/envio/);
    _definirFonte(null);
    await expect(receberParte({ ...base, envio: "aaaaaaaa", parte: 1, total: 1, linhas: 1, bytes: paraParquet(mb52(1, 2)) })).rejects.toThrow(/demonstração/);
  });
});
