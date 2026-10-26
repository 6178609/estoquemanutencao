/**
 * Envio de manual grande pelo navegador (aba Manuais e biblioteca do equipamento): inicia, manda as partes em ordem
 * (cada uma com novas tentativas) e conclui em /api/manuais/partes. Se desistir, pede para apagar as partes já enviadas.
 */
import { TAMANHO_PARTE } from "../limitesManual";

/** Uma parte tem 3 tentativas (a 1ª e 2 novas) antes de desistir. */
const TENTATIVAS_PARTE = 3;

/** Falha de um pedido: `repetir` quando vale tentar de novo (rede ou erro do servidor), não quando a regra recusou. */
export class ErroEnvio extends Error {
  constructor(mensagem: string, readonly repetir: boolean) {
    super(mensagem);
  }
}

export async function pedir(url: string, init: RequestInit, padrao: string): Promise<Record<string, unknown>> {
  const r = await fetch(url, { method: "POST", ...init }).catch(() => null);
  const j = ((await r?.json().catch(() => ({}))) ?? {}) as Record<string, unknown>;
  if (!r?.ok) throw new ErroEnvio(String(j.erro || padrao), !r || r.status >= 500);
  return j;
}

/** Envia o arquivo em partes e devolve em quantos equipamentos o manual entrou. */
export async function enviarManualEmPartes(f: File, eqs: string[], titulo: string,
  aoProgredir: (p: { feitas: number; total: number }) => void): Promise<number> {
  const total = Math.ceil(f.size / TAMANHO_PARTE);
  const { envio } = await pedir("/api/manuais/partes?acao=iniciar",
    { headers: { "Content-Type": "application/json" }, body: JSON.stringify({ eqs, titulo, nome: f.name, tamanho: f.size }) },
    "Não foi possível iniciar o envio.") as { envio: string };
  aoProgredir({ feitas: 0, total });
  try {
    for (let i = 0; i < total; i++) {
      const parte = f.slice(i * TAMANHO_PARTE, Math.min(f.size, (i + 1) * TAMANHO_PARTE));
      for (let t = 1; ; t++) {
        const form = new FormData();
        form.set("envio", envio);
        form.set("indice", String(i));
        form.append("arquivo", parte, f.name);
        try {
          await pedir("/api/manuais/partes?acao=parte", { body: form }, "Não foi possível enviar a parte.");
          break;
        } catch (e) {
          const erroParte = e instanceof ErroEnvio ? e : new ErroEnvio("Não foi possível enviar a parte.", true);
          if (!erroParte.repetir || t >= TENTATIVAS_PARTE) {
            throw new ErroEnvio(`Não foi possível enviar a parte ${i + 1} de ${total}. ${erroParte.message} Tente de novo.`, false);
          }
        }
      }
      aoProgredir({ feitas: i + 1, total });
    }
    const j = await pedir("/api/manuais/partes?acao=concluir", { headers: { "Content-Type": "application/json" }, body: JSON.stringify({ envio }) },
      "Não foi possível concluir o envio.");
    return Number(j.vinculados) || eqs.length;
  } catch (e) {
    // desistiu: pede para apagar as partes já enviadas (se falhar, o servidor apaga quando o envio vencer)
    void fetch("/api/manuais/partes?acao=cancelar", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ envio }) }).catch(() => undefined);
    throw e;
  }
}
