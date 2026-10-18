import "server-only";

import nodemailer from "nodemailer";

/**
 * Envio de e-mail por SMTP (servidor de e-mail da empresa ou um serviço). Configurado só nas variáveis da Vercel —
 * nada disso fica no repositório:
 *   SMTP_HOST, SMTP_PORT (padrão 587; 465 = SSL), SMTP_USUARIO, SMTP_SENHA e EMAIL_REMETENTE ("Central <x@empresa>").
 */
export function emailConfigurado(): boolean {
  return !!(process.env.SMTP_HOST && process.env.EMAIL_REMETENTE);
}

export interface Mensagem { assunto: string; texto: string; html: string }
export type Enviar = (para: string, msg: Mensagem) => Promise<void>;

/** Uma conexão para o lote inteiro (não uma por destinatário); fechar() no fim. */
export function abrirEnvio(): { enviar: Enviar; fechar: () => void } {
  if (!emailConfigurado()) throw new Error("Envio de e-mail não configurado (SMTP_HOST e EMAIL_REMETENTE na Vercel).");
  const porta = Number(process.env.SMTP_PORT || 587);
  const transporte = nodemailer.createTransport({
    pool: true, maxConnections: 1,
    host: process.env.SMTP_HOST, port: porta, secure: porta === 465,
    auth: process.env.SMTP_USUARIO ? { user: process.env.SMTP_USUARIO, pass: process.env.SMTP_SENHA ?? "" } : undefined,
    connectionTimeout: 10_000, greetingTimeout: 10_000, socketTimeout: 10_000,
  });
  return {
    enviar: async (para, msg) => {
      await transporte.sendMail({ from: process.env.EMAIL_REMETENTE, to: para, subject: msg.assunto, text: msg.texto, html: msg.html });
    },
    fechar: () => transporte.close(),
  };
}

/** Só o código do erro, para o log (a mensagem do servidor costuma trazer o endereço do destinatário). */
export function codigoErro(e: unknown): string {
  const x = e as { code?: string; responseCode?: number };
  return [x?.code, x?.responseCode].filter(Boolean).join(" ") || "erro";
}
