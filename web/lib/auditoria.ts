import "server-only";

import { after } from "next/server";

import { fonte, type Fonte } from "./dados/fonte";

/**
 * Trilha de auditoria: quem fez o que e quando (entrada e saída, senha, usuários e permissões, bases enviadas,
 * exportações, alocações do MRO…). Fica no repositório de dados (privado), um arquivo por mês em `app/auditoria/`;
 * na demonstração, numa lista em memória só desta instância. Registrar nunca derruba a ação
 * do usuário: falhou, vai para o log do servidor e segue. Guarda 12 meses (ver /privacidade). Testado em
 * testes/auditoria.test.ts.
 */

export const RETENCAO_DIAS = 365;
const MAX_MEMORIA = 2_000;

/** As ações registradas e como aparecem na tela de auditoria. */
export const ACOES: Record<string, string> = {
  login: "Entrou no site",
  login_falhou: "Senha errada na entrada",
  login_bloqueado: "Entrada bloqueada (muitas tentativas)",
  logout: "Saiu do site",
  logout_inatividade: "Saiu por inatividade",
  senha_trocada: "Trocou a própria senha",
  sessoes_encerradas: "Desconectou todos os aparelhos",
  dados_atualizados: "Atualizou os próprios dados cadastrais",
  primeiro_admin: "Criou o primeiro administrador",
  usuario_criado: "Cadastrou usuário",
  usuario_editado: "Alterou usuário",
  usuario_excluido: "Excluiu usuário",
  pedido_acesso: "Pediu acesso",
  pedido_aprovado: "Aprovou pedido de acesso",
  pedido_recusado: "Recusou pedido de acesso",
  base_enviada: "Enviou base do SAP",
  exportacao: "Baixou planilha",
  mro_alocacao: "Alocação automática de peças (MRO)",
  mro_desfazer: "Desfez a alocação automática (MRO)",
  comentario_roadmap: "Alterou comentário do Roadmap SIM",
  meus_dados: "Baixou os próprios dados (LGPD)",
  cadastro_material: "Pedido de cadastro de material",
};

export interface Evento {
  em: string;
  quem: string;
  acao: string;
  alvo: string;
  detalhe: Record<string, unknown>;
}

/** Campos que nunca entram no registro, mesmo que alguém passe por engano. */
const PROIBIDOS = /senha|password|token|segredo|secret|chave|hash|sess(ao|oes)|cookie/i;

/** O detalhe que vai para o banco: sem campos sensíveis, textos curtos, no máximo 20 campos e sem objetos aninhados. */
export function limparDetalhe(d: Record<string, unknown> | undefined): Record<string, unknown> {
  const r: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(d ?? {}).slice(0, 20)) {
    if (PROIBIDOS.test(k) || v === undefined) continue;
    if (typeof v === "string") r[k] = v.slice(0, 300);
    else if (typeof v === "number" || typeof v === "boolean" || v === null) r[k] = v;
    else if (Array.isArray(v)) r[k] = v.slice(0, 30).map((x) => String(x).slice(0, 80));
    else r[k] = String(v).slice(0, 300);
  }
  return r;
}

const g = globalThis as unknown as {
  __cmAuditoria?: Evento[]; __cmAuditoriaFila?: Evento[]; __cmAuditoriaVez?: Promise<void>; __cmAuditoriaLimpeza?: string; __cmAuditoriaUltima?: number;
};
const memoria = (g.__cmAuditoria ??= []);
const fila = (g.__cmAuditoriaFila ??= []);

/** Um arquivo por mês no repositório de dados: `app/auditoria/2026-11.json` (eventos do mais antigo ao mais novo). */
const PASTA = "app/auditoria/";
const arquivoDoMes = (mes: string) => `${PASTA}${mes}.json`;
const mesDe = (iso: string) => iso.slice(0, 7);

function decodificar(bytes: Uint8Array | undefined): Evento[] {
  if (!bytes) return [];
  const j = JSON.parse(new TextDecoder().decode(bytes));
  if (!Array.isArray(j)) throw new Error("arquivo da auditoria ilegível");
  return j as Evento[];
}

/** Uma linha por evento: o histórico do repositório mostra só o que entrou. */
const codificar = (lista: Evento[]) => new TextEncoder().encode(`[\n${lista.map((e) => JSON.stringify(e)).join(",\n")}\n]\n`);

/** Acrescenta os eventos ao arquivo do mês, relendo e tentando de novo se outra instância gravou no meio. */
async function acrescentar(f: Fonte, mes: string, novos: Evento[]): Promise<void> {
  const caminho = arquivoDoMes(mes);
  let erro = "o arquivo do mês estava sendo gravado por outra instância";
  for (let tentativa = 0; tentativa < 5; tentativa++) {
    try {
      const lido = await f.ler(caminho);
      const lista = [...decodificar(lido?.bytes), ...novos];
      if (await f.gravarCondicional(caminho, codificar(lista), lido?.versao ?? null, `Auditoria ${mes}`)) return;
    } catch (e) {
      erro = (e as Error).message; // repositório lento ou fora do ar: tenta de novo
    }
    await new Promise((ok) => setTimeout(ok, esperaTentativaMs * (tentativa + 1)));
  }
  throw new Error(erro);
}

/** Uma vez por dia por instância: apaga os meses que passaram da retenção. */
async function limparAntigos(f: Fonte, dia: string) {
  if (g.__cmAuditoriaLimpeza === dia) return;
  g.__cmAuditoriaLimpeza = dia;
  const limite = mesDe(new Date(Date.now() - RETENCAO_DIAS * 86400_000).toISOString());
  for (const [c, versao] of await f.versoes()) {
    const mes = c.startsWith(PASTA) ? c.slice(PASTA.length, -5) : "";
    if (/^\d{4}-\d{2}$/.test(mes) && mes < limite) await f.apagar(c, versao, `Auditoria: apaga ${mes} (retenção de 12 meses)`);
  }
}

/**
 * Intervalo mínimo entre duas gravações desta instância: uma rajada (ex.: muitas senhas erradas, trocas de turno) vira
 * um registro só no repositório e não esgota o limite de gravações da API do GitHub (no máximo ~240 por hora).
 */
let intervaloMs = 15_000;
let esperaTentativaMs = 500;

/**
 * Grava o que está na fila numa gravação por mês (vários eventos juntos viram um registro só no repositório). Um lote por
 * chamada: cada `registrar` agenda a sua, então o que chegar depois vai na próxima. Falhou mesmo depois das novas
 * tentativas: o lote volta para a fila (até o teto) e segue na próxima gravação.
 */
async function descarregar(): Promise<void> {
  const f = fonte();
  if (!fila.length) return;
  if (!f) {
    memoria.unshift(...fila.splice(0).reverse());
    memoria.length = Math.min(memoria.length, MAX_MEMORIA);
    return;
  }
  const espera = (g.__cmAuditoriaUltima ?? 0) + intervaloMs - Date.now();
  if (espera > 0) await new Promise((ok) => setTimeout(ok, espera));
  const lote = fila.splice(0);
  if (!lote.length) return;
  g.__cmAuditoriaUltima = Date.now();
  for (const [mes, novos] of Map.groupBy(lote, (e) => mesDe(e.em))) {
    try {
      await acrescentar(f, mes, novos);
    } catch (e) {
      const cabe = Math.max(0, MAX_MEMORIA - fila.length);
      fila.unshift(...novos.slice(-cabe));
      console.warn(`[auditoria] ${novos.length} registro(s) adiado(s) (${(e as Error).message})`
        + (novos.length > cabe ? `; ${novos.length - cabe} descartado(s) pelo teto da fila` : ""));
    }
  }
  await limparAntigos(f, lote[0].em.slice(0, 10)).catch((e: Error) => {
    console.warn(`[auditoria] limpeza dos meses antigos falhou: ${e.message}`);
  });
}

/**
 * Registra uma ação. Dentro de uma requisição grava depois da resposta (não atrasa a tela); fora dela, na hora.
 * Devolve a promessa da gravação só para os testes — quem chama não precisa esperar.
 */
export function registrar(quem: string, acao: string, alvo = "", detalhe?: Record<string, unknown>): Promise<void> {
  const ev: Evento = {
    em: new Date().toISOString(), quem: String(quem || "?").slice(0, 80), acao: acao.slice(0, 60), alvo: String(alvo || "").slice(0, 200),
    detalhe: limparDetalhe(detalhe),
  };
  fila.push(ev);
  let pronto!: () => void;
  const feito = new Promise<void>((ok) => (pronto = ok));
  // uma gravação por vez nesta instância; a vez seguinte já leva o que chegou no meio
  const tarefa = () => {
    const vez = (g.__cmAuditoriaVez ?? Promise.resolve()).then(descarregar, descarregar).finally(pronto);
    g.__cmAuditoriaVez = vez;
    return vez;
  };
  try {
    after(tarefa);
  } catch {
    void tarefa(); // fora de uma requisição (testes, scripts)
  }
  return feito;
}

interface Filtro { quem?: string; alvo?: string; acao?: string; desde?: string; ate?: string; limite?: number }

/** Os meses de `ate` (ou de agora) para trás, até `desde` ou até o fim da retenção. */
function mesesDoFiltro(desde: string, ate: string): string[] {
  const fim = mesDe(ate || new Date().toISOString());
  const inicio = mesDe(desde || new Date(Date.now() - RETENCAO_DIAS * 86400_000).toISOString());
  const meses: string[] = [];
  let [a, m] = fim.split("-").map(Number);
  for (let i = 0; i < 24; i++) {
    const mes = `${a}-${String(m).padStart(2, "0")}`;
    if (mes < inicio) break;
    meses.push(mes);
    if (--m === 0) { m = 12; a--; }
  }
  return meses;
}

/** Os eventos mais novos primeiro, com os filtros (quem, alvo e ação exatos; desde/até = dias "2026-10-01", hora de Brasília). */
export async function eventos(f: Filtro = {}): Promise<Evento[]> {
  const limite = Math.min(Math.max(f.limite ?? 500, 1), 2_000);
  const desde = /^\d{4}-\d{2}-\d{2}$/.test(f.desde ?? "") ? new Date(`${f.desde}T00:00:00-03:00`).toISOString() : "";
  const ate = /^\d{4}-\d{2}-\d{2}$/.test(f.ate ?? "") ? new Date(`${f.ate}T23:59:59.999-03:00`).toISOString() : "";
  const passa = (e: Evento) => (!f.quem || e.quem === f.quem) && (!f.alvo || e.alvo === f.alvo) && (!f.acao || e.acao === f.acao)
    && (!desde || e.em >= desde) && (!ate || e.em <= ate);
  const fo = fonte();
  if (!fo) return memoria.filter(passa).slice(0, limite);
  const existentes = await fo.versoes();
  const achados: Evento[] = [];
  for (const mes of mesesDoFiltro(desde, ate)) {
    if (!existentes.has(arquivoDoMes(mes))) continue;
    let lido;
    try {
      lido = await fo.ler(arquivoDoMes(mes));
    } catch {
      throw new Error("O repositório de dados não respondeu ao ler a auditoria. Tente de novo em instantes; os registros não se perdem.");
    }
    const doMes = decodificar(lido?.bytes).filter(passa).reverse();
    achados.push(...doMes);
    if (achados.length >= limite) break;
  }
  return achados.slice(0, limite);
}

/** Só para os testes: esvazia a lista em memória. */
export function _limparMemoria() {
  memoria.length = 0;
  fila.length = 0;
  delete g.__cmAuditoriaVez;
  delete g.__cmAuditoriaUltima;
}

/** Só para os testes: muda o intervalo mínimo entre gravações e a espera entre as novas tentativas. */
export function _definirIntervalo(ms: number) {
  intervaloMs = ms;
  esperaTentativaMs = ms;
  delete g.__cmAuditoriaLimpeza;
}
