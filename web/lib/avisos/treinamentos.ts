import "server-only";

import { usuarios } from "../auth/usuarios";
import { validarEmail } from "../auth/senha";
import { gravarCadastroLote, lerCadastro } from "../dados/cadastros";
import { itensAviso, montarEmail, semanaDoAno, type ItemAviso } from "../wcm/avisoTreinamentos";
import { contexto } from "../wcm/contexto";
import * as hh from "../wcm/hh";
import * as ind from "../wcm/indicadores";
import * as tr from "../wcm/treinamentos";
import { abrirEnvio, codigoErro, emailConfigurado, type Enviar } from "./email";

/**
 * Aviso semanal de treinamentos aos líderes (função Líder, ativos, com e-mail no cadastro de usuários). Disparado
 * toda segunda pela Vercel (vercel.json → /api/avisos/treinamentos) e, se precisar, pelo botão "Enviar agora".
 * O registro do último envio fica no cadastro `avisos.json` (uma vez por semana, salvo envio manual).
 */
export const ARQ_AVISOS = "avisos.json";
const CHAVE = "treinamentos";

export interface Destinatario { login: string; nome: string; email: string }
export interface RegistroEnvio {
  em: string; semana: string; por: string; destinatarios: number; itens: number; falhas: string[];
  /** true enquanto o lote está saindo (se a função cair no meio, fica marcado e não repete no automático) */
  enviando?: boolean;
}

const PRAZO_MS = 40_000; // a função tem 60 s; para antes, com folga para gravar o registro

export async function destinatarios(): Promise<Destinatario[]> {
  const us = await usuarios();
  return Object.entries(us)
    .filter(([, u]) => u.funcao === "lider" && u.ativo !== false && typeof u.email === "string" && u.email && !validarEmail(u.email))
    .map(([login, u]) => ({ login, nome: u.nome || login, email: String(u.email) }))
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
}

/** Os treinamentos que entram no aviso de hoje (mesma equipe e mesma regra da aba Treinamentos e férias). */
export async function itensDeHoje(): Promise<{ itens: ItemAviso[]; hoje: number; semEquipe: boolean }> {
  const c = await contexto({});
  const pes = hh.pessoas(c.b.equipe.dados ?? [], c.cad.hh, ind.horasSemanaDe(c.cad.metas));
  const porNp = new Map(pes.map((p) => [p.np, { nome: p.nome, cargo: p.cargo, turma: p.turma }]));
  const treinos = hh.ausencias(c.cad.hh).filter((a) => porNp.has(a.np) && a.tipo === tr.TREINAMENTO);
  // base com erro ou equipe vazia não pode virar "nada vencendo" (fecharia a semana sem avisar ninguém)
  return { itens: itensAviso(tr.reciclagens(treinos, c.b.hoje), porNp), hoje: c.b.hoje, semEquipe: !!c.b.equipe.erro || !pes.length };
}

export async function ultimoEnvio(): Promise<RegistroEnvio | null> {
  const r = (await lerCadastro(ARQ_AVISOS))[CHAVE];
  return r && typeof r === "object" ? (r as unknown as RegistroEnvio) : null;
}

export type ResultadoEnvio =
  | { ok: true; enviados: number; itens: number; falhas: string[] }
  | { ok: false; motivo: string };

async function registrar(r: RegistroEnvio, por: string) {
  await gravarCadastroLote(ARQ_AVISOS, { [CHAVE]: r as unknown as Record<string, unknown> }, por);
}

/**
 * Manda o aviso a cada líder. `manual` (botão) manda mesmo que já tenha ido nesta semana; o automático não repete.
 * Sem nada vencendo, não manda (e registra a semana).
 */
export async function enviarAvisoTreinamentos(opcoes: { manual: boolean; por: string; site: string;
  /** só para testes: SMTP falso, relógio e os itens (sem ler as bases) */
  enviar?: Enviar; agora?: () => number; itens?: () => Promise<Awaited<ReturnType<typeof itensDeHoje>>> }):
  Promise<ResultadoEnvio> {
  if (!opcoes.enviar && !emailConfigurado()) return { ok: false, motivo: "O envio de e-mail não está configurado na Vercel (SMTP_HOST e EMAIL_REMETENTE)." };
  const [para, { itens, hoje, semEquipe }, ultimo] = await Promise.all([destinatarios(), (opcoes.itens ?? itensDeHoje)(), ultimoEnvio()]);
  const semana = semanaDoAno(hoje);
  if (!opcoes.manual && ultimo?.semana === semana) return { ok: false, motivo: `O aviso desta semana (${semana}) já foi enviado.` };
  if (semEquipe) return { ok: false, motivo: "Não consegui ler a equipe (base com erro ou equipe vazia); o aviso não foi enviado." };
  if (!para.length) {
    console.warn("aviso de treinamentos: nenhum líder ativo com e-mail");
    return { ok: false, motivo: "Nenhum líder ativo com e-mail no cadastro de usuários." };
  }
  const agora = opcoes.agora ?? Date.now;
  const inicio = agora();
  const base: RegistroEnvio = { em: new Date(inicio).toISOString(), semana, por: opcoes.por, destinatarios: 0, itens: itens.length, falhas: [] };
  if (!itens.length) {
    await registrar(base, opcoes.por);
    return { ok: true, enviados: 0, itens: 0, falhas: [] };
  }
  // marca a semana antes de começar: um segundo disparo do agendamento não manda de novo
  await registrar({ ...base, enviando: true }, opcoes.por);
  const msg = montarEmail(itens, hoje, `${opcoes.site}/treinamentos_ferias?visao=Treinamentos`);
  const conexao = opcoes.enviar ? null : abrirEnvio();
  const enviar = opcoes.enviar ?? conexao!.enviar;
  const falhas: string[] = [];
  let enviados = 0;
  try {
    for (const d of para) {
      if (agora() - inicio > PRAZO_MS) {
        falhas.push(`${d.nome} (sem tempo)`);
        continue;
      }
      try {
        await enviar(d.email, msg);
        enviados++;
      } catch (e) {
        console.error(`aviso de treinamentos para ${d.login}: ${codigoErro(e)}`);
        falhas.push(d.nome);
      }
    }
  } finally {
    conexao?.fechar();
  }
  await registrar({ ...base, destinatarios: enviados, falhas }, opcoes.por);
  return { ok: true, enviados, itens: itens.length, falhas };
}
