/// <reference lib="webworker" />
import { processar } from "./processar";

/** Lê os exports fora da thread da tela (o IW38OP leva alguns segundos e travaria a página). */
self.onmessage = (ev: MessageEvent<{ id: number; nome: string; buf: ArrayBuffer }>) => {
  const { id, nome, buf } = ev.data;
  const r = processar(nome, new Uint8Array(buf));
  const transferir = r.bases.flatMap((b) => b.partes.map((p) => p.buffer as ArrayBuffer));
  (self as unknown as DedicatedWorkerGlobalScope).postMessage({ id, r }, transferir);
};
