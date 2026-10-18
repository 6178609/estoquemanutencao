import "server-only";

import { usuarios } from "../auth/usuarios";
import { validarEmail } from "../auth/senha";
import { gravarCadastroLote, lerCadastro } from "../dados/cadastros";
import { itensAviso, montarEmail, semanaDoAno, type ItemAviso } from "../wcm/avisoTreinamentos";
import { contexto } from "../wcm/contexto";
import * as hh from "../wcm/hh";
import * as ind from "../wcm/indicadores";
import * as tr from "../wcm/treinamentos";
import { emailConfigurado, enviarEmail } from "./email";

/**
 * Aviso semanal de treinamentos aos líderes (função Líder, ativos, com e-mail no cadastro de usuários). Disparado
 * toda segunda pela Vercel (vercel.json → /api/avisos/treinamentos) e, se precisar, pelo botão "Enviar agora".
 * O registro do último envio fica no cadastro `avisos.json` (uma vez por semana, salvo envio manual).
 */
export const ARQ_AVISOS = "avisos.json";
const CHAVE = "treinamentos";

export interface Destinatario { login: string; nome: string; email: string }
export interface RegistroEnvio { em: string; semana: string; por: string; destinatarios: number; itens: number; falhas: string[] }

export async function destinatarios(): Promise<Destinatario[]> {
  const us = await usuarios();
  return Object.entries(us)
    .filter(([, u]) => u.funcao === "lider" && u.ativo !== false && typeof u.email === "string" && u.email && !validarEmail(u.email))
    .map(([login, u]) => ({ login, nome: u.nome || login, email: String(u.email) }))
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
}

/** Os treinamentos que entram no aviso de hoje (mesma equipe e mesma regra da aba Treinamentos e férias). */
export async function itensDeHoje(): Promise<{ itens: ItemAviso[]; hoje: number }> {
  const c = await contexto({});
  const pes = hh.pessoas(c.b.equipe.dados ?? [], c.cad.hh, ind.horasSemanaDe(c.cad.metas));
  const porNp = new Map(pes.map((p) => [p.np, { nome: p.nome, cargo: p.cargo, turma: p.turma }]));
  const treinos = hh.ausencias(c.cad.hh).filter((a) => porNp.has(a.np) && a.tipo === tr.TREINAMENTO);
  return { itens: itensAviso(tr.reciclagens(treinos, c.b.hoje), porNp), hoje: c.b.hoje };
}

export async function ultimoEnvio(): Promise<RegistroEnvio | null> {
  const r = (await lerCadastro(ARQ_AVISOS))[CHAVE];
  return r && typeof r === "object" ? (r as unknown as RegistroEnvio) : null;
}

export type ResultadoEnvio =
  | { ok: true; enviados: number; itens: number; falhas: string[] }
  | { ok: false; motivo: string };

/**
 * Manda o aviso a cada líder. `manual` (botão) manda mesmo que já tenha ido nesta semana; o automático não repete.
 * Sem nada vencendo, não manda (e registra).
 */
export async function enviarAvisoTreinamentos(opcoes: { manual: boolean; por: string; site: string }): Promise<ResultadoEnvio> {
  if (!emailConfigurado()) return { ok: false, motivo: "O envio de e-mail não está configurado na Vercel (SMTP_HOST e EMAIL_REMETENTE)." };
  const [para, { itens, hoje }, ultimo] = await Promise.all([destinatarios(), itensDeHoje(), ultimoEnvio()]);
  const semana = semanaDoAno(hoje);
  if (!opcoes.manual && ultimo?.semana === semana) return { ok: false, motivo: `O aviso desta semana (${semana}) já foi enviado.` };
  if (!para.length) return { ok: false, motivo: "Nenhum líder ativo com e-mail no cadastro de usuários." };
  const falhas: string[] = [];
  let enviados = 0;
  if (itens.length) {
    const msg = montarEmail(itens, hoje, `${opcoes.site}/treinamentos_ferias?visao=Treinamentos`);
    for (const d of para) {
      try {
        await enviarEmail(d.email, msg);
        enviados++;
      } catch (e) {
        console.error(`aviso de treinamentos para ${d.login}:`, e);
        falhas.push(d.nome);
      }
    }
  }
  const registro: RegistroEnvio = { em: new Date().toISOString(), semana, por: opcoes.por, destinatarios: enviados, itens: itens.length, falhas };
  await gravarCadastroLote(ARQ_AVISOS, { [CHAVE]: registro as unknown as Record<string, unknown> }, opcoes.por);
  return { ok: true, enviados, itens: itens.length, falhas };
}
