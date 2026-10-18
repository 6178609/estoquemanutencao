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

export async function enviarEmail(para: string, msg: { assunto: string; texto: string; html: string }): Promise<void> {
  if (!emailConfigurado()) throw new Error("Envio de e-mail não configurado (SMTP_HOST e EMAIL_REMETENTE na Vercel).");
  const porta = Number(process.env.SMTP_PORT || 587);
  const transporte = nodemailer.createTransport({
    host: process.env.SMTP_HOST, port: porta, secure: porta === 465,
    auth: process.env.SMTP_USUARIO ? { user: process.env.SMTP_USUARIO, pass: process.env.SMTP_SENHA ?? "" } : undefined,
    connectionTimeout: 15_000, greetingTimeout: 15_000, socketTimeout: 20_000,
  });
  await transporte.sendMail({ from: process.env.EMAIL_REMETENTE, to: para, subject: msg.assunto, text: msg.texto, html: msg.html });
}
