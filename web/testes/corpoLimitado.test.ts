import { describe, expect, it } from "vitest";

import { lerJsonLimitado } from "@/lib/corpoLimitado";

/** Pedido com o corpo em partes (stream), sem o cabeçalho content-length. */
function semTamanho(partes: string[]): Request {
  const enc = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({ start(c) { for (const p of partes) c.enqueue(enc.encode(p)); c.close(); } });
  return new Request("http://teste.local/x", { method: "POST", body, duplex: "half" } as RequestInit);
}

describe("Corpo JSON com limite de tamanho", () => {
  it("lê o JSON dentro do limite, mesmo sem content-length", async () => {
    expect(await lerJsonLimitado(semTamanho(['{"acao":', '"teste"}']), 100)).toEqual({ ok: true, json: { acao: "teste" } });
  });
  it("recusa acima do limite sem o cabeçalho (lendo em partes) e com o cabeçalho", async () => {
    expect(await lerJsonLimitado(semTamanho(["x".repeat(60), "y".repeat(60)]), 100)).toEqual({ ok: false, grande: true });
    const comCab = new Request("http://teste.local/x", { method: "POST", body: "{}", headers: { "content-length": "5000" } });
    expect(await lerJsonLimitado(comCab, 100)).toEqual({ ok: false, grande: true });
  });
  it("JSON inválido ou vazio = pedido inválido", async () => {
    expect(await lerJsonLimitado(semTamanho(["{não é json"]), 100)).toEqual({ ok: false, grande: false });
    expect(await lerJsonLimitado(new Request("http://teste.local/x", { method: "POST" }), 100)).toEqual({ ok: false, grande: false });
  });
});
