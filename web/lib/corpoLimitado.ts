/**
 * Corpo JSON de um pedido com limite de bytes: confere o content-length (quando vem) e lê o corpo em partes, parando assim que
 * passa do limite — sem o cabeçalho (envio em partes), o tamanho também é conferido. Testado em testes/corpoLimitado.test.ts.
 */
export type CorpoJson = { ok: true; json: unknown } | { ok: false; grande: boolean };

export async function lerJsonLimitado(req: Request, max: number): Promise<CorpoJson> {
  if (Number(req.headers.get("content-length") ?? 0) > max) return { ok: false, grande: true };
  if (!req.body) return { ok: false, grande: false };
  const leitor = req.body.getReader();
  const partes: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await leitor.read();
    if (done) break;
    total += value.byteLength;
    if (total > max) { await leitor.cancel().catch(() => {}); return { ok: false, grande: true }; }
    partes.push(value);
  }
  const bytes = new Uint8Array(total);
  let i = 0;
  for (const p of partes) { bytes.set(p, i); i += p.byteLength; }
  try {
    return { ok: true, json: JSON.parse(new TextDecoder().decode(bytes)) };
  } catch {
    return { ok: false, grande: false };
  }
}
