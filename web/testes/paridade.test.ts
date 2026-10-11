import { createHash } from "node:crypto";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "vitest";

import { lerArquivo, sondar } from "@/lib/leitura/leitura";
import { Xlsx } from "@/lib/leitura/xlsx";

/**
 * Paridade com central/leitura.py nos exports REAIS — só roda quando PARIDADE_PASTA aponta para uma pasta local
 * com os arquivos (que nunca vão para o repositório). Grava o resumo em PARIDADE_SAIDA para comparar com o Python.
 */
const pasta = process.env.PARIDADE_PASTA;

describe.skipIf(!pasta)("paridade com o leitor do Python (dados reais, local)", () => {
  it("lê cada export", () => {
    const out: Record<string, unknown> = {};
    for (const nome of readdirSync(pasta!).sort()) {
      const bytes = new Uint8Array(readFileSync(path.join(pasta!, nome)));
      const t0 = Date.now();
      const x = /\.xlsx$/i.test(nome) ? new Xlsx(bytes) : undefined;
      for (const a of sondar(nome, bytes, x)) {
        const t = lerArquivo(nome, bytes, a.aba, a.linhaCab, x);
        const h = createHash("sha256").update(t.linhas.map((r) => r.join("\x1f")).join("\x1e")).digest("hex").slice(0, 16);
        if (process.env.PARIDADE_LINHAS)
          writeFileSync(path.join(process.env.PARIDADE_LINHAS, `${a.tipo}.ts.json`), JSON.stringify(t.linhas));
        out[`${nome}|${a.tipo}`] = { aba: a.aba, lin: a.linhaCab, cols: t.colunas, n: t.linhas.length, h,
          r0: t.linhas[0], rN: t.linhas[t.linhas.length - 1], ms: Date.now() - t0 };
      }
    }
    writeFileSync(process.env.PARIDADE_SAIDA || "paridade.json", JSON.stringify(out, null, 1));
  }, 600_000);
});
