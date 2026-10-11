import { parquetWriteBuffer } from "hyparquet-writer";

import type { Tabela } from "./leitura";

/**
 * Tabela → parquet (tudo como texto, como o sincronizador grava), feito no navegador. A Vercel aceita no máximo
 * ~4,5 MB por requisição: uma base maior (o catálogo do Sysmat) vai em partes, cada uma um parquet completo.
 */
export const LIMITE_PARTE = 3_000_000;

export function paraParquet(t: Tabela, ini = 0, fim = t.linhas.length): Uint8Array {
  const linhas = t.linhas.slice(ini, fim);
  const buf = parquetWriteBuffer({
    columnData: t.colunas.map((nome, j) => ({ name: nome, data: linhas.map((l) => l[j] ?? ""), type: "STRING" as const })),
  });
  return new Uint8Array(buf);
}

export function emPartes(t: Tabela, limite = LIMITE_PARTE): Uint8Array[] {
  const inteiro = paraParquet(t);
  if (inteiro.length <= limite) return [inteiro];
  let n = Math.ceil(inteiro.length / limite) + 1;
  for (;;) {
    const passo = Math.ceil(t.linhas.length / n);
    const partes: Uint8Array[] = [];
    for (let i = 0; i < t.linhas.length; i += passo) partes.push(paraParquet(t, i, i + passo));
    if (partes.every((p) => p.length <= limite) || passo <= 1) return partes;
    n *= 2;
  }
}
