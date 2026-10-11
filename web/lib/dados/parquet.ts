import "server-only";

import { parquetReadObjects } from "hyparquet";
import { compressors } from "hyparquet-compressors";

/** Parquet do repositório de dados (o sincronizador grava tudo como texto, compressão zstd). */
export async function lerParquet(bytes: Uint8Array): Promise<Record<string, unknown>[]> {
  const file = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  return (await parquetReadObjects({ file, compressors })) as Record<string, unknown>[];
}
