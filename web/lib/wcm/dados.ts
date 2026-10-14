import "server-only";

import { cookies } from "next/headers";
import { after } from "next/server";

import { lerBase, manifesto, type Base } from "../dados/bases";
import { lerCadastro } from "../dados/cadastros";
import { fonte } from "../dados/fonte";
import { DESTINO } from "../leitura/tipos";
import { basesDemo } from "./demo";
import {
  marcarQuebras, prepararConfirmacoes, prepararEquipamentos, prepararEquipe, prepararIw38, prepararNotas, prepararOperacoes,
  prepararRequisicoes, tiposPorOrdem, type Confirmacao, type Crua, type Equipamento, type Nota, type Operacao, type Ordem,
  type Pessoa, type Requisicao,
} from "./preparo";
import { hoje } from "./util";

/**
 * As bases do SAP já preparadas, para as páginas (servidor). Cada uma com cache pela versão do arquivo no
 * repositório de dados (e pelo dia, quando o preparo depende de hoje). Sem repositório: dados fictícios.
 */
export interface Bases {
  ordens: Base<Ordem[]>;
  notas: Base<Nota[]>;
  operacoes: Base<Operacao[]>;
  confirmacoes: Base<Confirmacao[]>;
  equipamentos: Base<Equipamento[]>;
  equipe: Base<Pessoa[]>;
  requisicoes: Base<Requisicao[]>;
  cruas: { ip19: Base<Crua[]>; af: Base<Crua[]>; acoesAf: Base<Crua[]> }; // preparadas pelos módulos próprios
  hoje: number;
}

const ident = (l: Crua[]) => l;

// o objeto montado fica guardado enquanto nenhuma base mudar (a marcação das quebras cruza 150 mil linhas)
const gb = globalThis as unknown as { __cmBasesWcm?: { chave: string; valor: Bases; assin: string | null }; __cmBasesWcmEm?: { assin: string | null; h: number; p: Promise<Bases> } | null };

/** Cookie que a tela Fontes de dados grava ao receber uma base: quem acabou de enviar vê o dado novo na hora. */
export const COOKIE_ENVIO = "cmw_envio";
export const ENVIO_VALE_MS = 2 * 60_000;

export async function bases(): Promise<Bases> {
  const h = hoje();
  const f = fonte();
  if (!f) return basesDemo(h);
  const envio = await envioRecente();
  // acabou de enviar uma base: confere a lista de versões no GitHub (outra instância pode ter recebido o envio)
  if (envio && (f.listadoEm?.() ?? Infinity) < envio) await f.versoes(true).catch(() => null);
  const pronto = gb.__cmBasesWcm;
  const assin = await assinatura(h).catch(() => null);
  // nada mudou desde a última montagem: nem passa pelas bases
  if (pronto && assin && pronto.assin === assin) return pronto.valor;
  // várias requisições ao mesmo tempo (servidor recém-ligado) esperam a MESMA leitura, em vez de baixar tudo de novo
  // (só reaproveita a montagem em andamento se ela é desta mesma versão e dia; senão monta outra em seguida)
  const montar = (): Promise<Bases> => {
    const em = gb.__cmBasesWcmEm;
    if (em && em.assin === assin && em.h === h) return em.p;
    const p: Promise<Bases> = (em ? em.p.catch(() => null).then(() => montarBases(h, assin)) : montarBases(h, assin))
      .finally(() => { if (gb.__cmBasesWcmEm?.p === p) gb.__cmBasesWcmEm = null; });
    gb.__cmBasesWcmEm = { assin, h, p };
    return p;
  };
  // export novo e já há bases de hoje (e ninguém acabou de enviar): responde com as anteriores e monta as novas depois
  // da resposta (stale-while-revalidate) — baixar e preparar ocupa a CPU por alguns segundos
  if (pronto && pronto.valor.hoje === h && !envio) {
    try {
      after(() => montar().then(() => undefined, (e) => console.warn(`[dados] montagem das bases falhou: ${(e as Error).message}`)));
      return pronto.valor;
    } catch {
      /* fora de uma requisição (testes): monta agora */
    }
  }
  return montar();
}

/** Versões dos arquivos das bases (e partes enviadas pelo site) + o dia: muda quando qualquer export muda. */
async function assinatura(h: number): Promise<string> {
  const [v, man] = await Promise.all([fonte()!.versoes(), manifesto()]);
  return `${h}|` + ARQUIVOS_WCM.map((a) => {
    const arqs = man[a]?.partes?.length ? man[a].partes! : [a];
    return arqs.map((x) => v.get(x) ?? "-").join("+") + ":" + (man[a]?.modificado ?? "");
  }).join("|");
}

async function envioRecente(): Promise<number> {
  try {
    const v = Number((await cookies()).get(COOKIE_ENVIO)?.value);
    return v && Date.now() - v < ENVIO_VALE_MS ? v : 0;
  } catch {
    return 0; // fora de uma requisição
  }
}

const ARQUIVOS_WCM = [DESTINO.iw38, DESTINO.iw38op, DESTINO.iw47, DESTINO.iw28, DESTINO.ih08, DESTINO.equipe, DESTINO.requisicoes,
  DESTINO.ip19, DESTINO.af, DESTINO.acoes_af];

async function montarBases(h: number, assin: string | null): Promise<Bases> {
  const dia = String(h);
  const [iw38, oper, conf, iw28, ih08, equipe, req, ip19, af, acoesAf] = await Promise.all([
    lerBase(DESTINO.iw38, (l) => prepararIw38(l, h).ordens, dia),
    lerBase(DESTINO.iw38op, (l) => prepararOperacoes(l)),
    lerBase(DESTINO.iw47, (l) => prepararConfirmacoes(l)),
    lerBase(DESTINO.iw28, (l) => prepararNotas(l, h), dia),
    lerBase(DESTINO.ih08, (l) => prepararEquipamentos(l)),
    lerBase(DESTINO.equipe, (l) => prepararEquipe(l)),
    lerBase(DESTINO.requisicoes, (l) => prepararRequisicoes(l, h), dia),
    lerBase(DESTINO.ip19, ident),
    lerBase(DESTINO.af, ident),
    lerBase(DESTINO.acoes_af, ident),
  ]);
  const todas = [iw38, oper, conf, iw28, ih08, equipe, req, ip19, af, acoesAf];
  const chave = `${h}|` + todas.map((x) => `${x.atualizado}:${x.dados?.length ?? -1}:${x.erro ?? ""}`).join("|");
  // com alguma base em erro (download falhou), não guarda a assinatura: a próxima requisição tenta de novo
  const semErro = todas.every((x) => !x.erro);
  if (gb.__cmBasesWcm?.chave === chave) {
    gb.__cmBasesWcm.assin = semErro ? assin : null;
    return gb.__cmBasesWcm.valor;
  }
  // quebra = Y1 convertida em YM11: o tipo da ordem vem das três bases que têm ordem
  const tipos = tiposPorOrdem(iw38.dados || [], oper.dados || [], conf.dados || []);
  const notas = { ...iw28, dados: iw28.dados ? marcarQuebras(iw28.dados, tipos) : null };
  const valor: Bases = { ordens: iw38, notas, operacoes: oper, confirmacoes: conf, equipamentos: ih08, equipe, requisicoes: req,
    cruas: { ip19, af, acoesAf }, hoje: h };
  gb.__cmBasesWcm = { chave, valor, assin: semErro ? assin : null };
  return valor;
}

/** Só a lista da Gestão de HH (para conferir um pedido de acesso sem ler as outras bases). */
export async function equipe(): Promise<Pessoa[]> {
  if (!fonte()) return basesDemo(hoje()).equipe.dados || [];
  return (await lerBase(DESTINO.equipe, (l) => prepararEquipe(l))).dados || [];
}

/** Os cadastros do app que os indicadores usam (metas, equipamentos, materiais, HH). */
export async function cadastros() {
  const [metas, equipamentos, materiais, preferencias] = await Promise.all([
    lerCadastro("metas_wcm.json"), lerCadastro("cadastro_equipamentos.json"), lerCadastro("cadastro_materiais.json"),
    lerCadastro("preferencias.json"),
  ]);
  return { metas, equipamentos, materiais, preferencias };
}
