import "server-only";

import { after } from "next/server";

import { fonte, FonteErro, type Fonte } from "./fonte";
import { lerJsonDemo, gravarJsonDemo } from "./demo";

/**
 * Cadastros do app — mínimos de estoque, usuários, equipamentos, Gestão de HH… Uma alteração feita aqui vale para
 * todas as telas. Ficam nos arquivos `app/<nome>.json` do repositório de dados (privado, no GitHub).
 *
 * Gravação: relê o cadastro na hora, aplica só os itens alterados e grava condicionado à versão lida; se outra
 * pessoa gravou no meio, relê e aplica de novo. Cópia de segurança: antes da primeira gravação do dia, a versão anterior
 * vai para `app/backup/<cadastro>-<dia>.json`.
 */

type Item = Record<string, unknown>;
export type Cadastro = Record<string, Item>;
/** Função aplicada ao item relido na hora da gravação: devolve o item inteiro, null para remover ou undefined para não mexer. */
export type Alteracao = (atual: Item | undefined) => Item | null | undefined;

const CAMPOS_DE_EDICAO = new Set(["atualizado_em", "atualizado_por"]);
const g = globalThis as unknown as { __cmCadastros?: Map<string, { versao: string; dados: Cadastro; em: number }>; __cmBackups?: Set<string> };
const cache = (g.__cmCadastros ??= new Map());
const backupsFeitos = (g.__cmBackups ??= new Set());

function caminho(nome: string) {
  return `app/${nome}`;
}

function decodificar(nome: string, bytes: Uint8Array): Cadastro {
  try {
    const j = JSON.parse(new TextDecoder().decode(bytes));
    if (j && typeof j === "object" && !Array.isArray(j)) return j as Cadastro;
  } catch {
    /* cai no erro abaixo */
  }
  // erro de leitura nunca vira "vazio" gravado por cima
  throw new FonteErro(`O cadastro ${nome} está ilegível; nada foi gravado.`);
}

function hojeLocal(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
}

/**
 * Atualiza só os itens informados. `null` remove o item. mesclar=true muda só os campos informados (campo null
 * é apagado) e remove o item que fica sem nenhum campo — o mínimo de um material não apaga a foto dele.
 * Uma função no lugar do item é calculada sobre o item relido a cada tentativa (edição atômica: nada se perde
 * quando duas pessoas mexem no mesmo item ao mesmo tempo).
 */
interface Lido { dados: Cadastro; versao: string; bruto?: Uint8Array }

/** Onde os cadastros ficam. */
interface Armazem {
  versao(nome: string, fresco?: boolean): Promise<string | undefined>;
  ler(nome: string): Promise<Lido | null>;
  /** Grava se a versão ainda é `versao` (null = novo); false = alguém gravou antes. */
  gravar(nome: string, dados: Cadastro, versao: string | null, usuario: string, anterior: Lido | null): Promise<boolean>;
}

export const BACKUP_DIAS = 60;
const MAX_APAGAR_POR_DIA = 20;

/** Roda depois da resposta (não atrasa quem salvou); fora de uma requisição (testes), roda solto. */
function depoisDaResposta(tarefa: () => Promise<void>) {
  try {
    after(tarefa);
  } catch {
    void tarefa();
  }
}
const gl = globalThis as unknown as { __cmBackupsLimpos?: string };

/**
 * Uma vez por dia por instância: apaga até 20 cópias de `app/backup/` com mais de 60 dias, menos a do dia 1 de cada
 * mês (o histórico do Git guarda todas). A falha da limpeza nunca impede a gravação.
 */
export async function limparBackupsAntigos(f: Fonte, hoje: string): Promise<void> {
  if (gl.__cmBackupsLimpos === hoje) return;
  gl.__cmBackupsLimpos = hoje;
  try {
    const limite = new Date(Date.parse(`${hoje}T12:00:00Z`) - BACKUP_DIAS * 86400_000).toISOString().slice(0, 10);
    let apagados = 0;
    for (const [c, versao] of await f.versoes()) {
      if (apagados >= MAX_APAGAR_POR_DIA) break; // o resto fica para amanhã (não esgota o limite de gravações)
      const dia = /^app\/backup\/.+-(\d{4}-\d{2}-\d{2})(?:-[a-z])?\.json$/.exec(c)?.[1];
      if (dia && dia < limite && !dia.endsWith("-01") && await f.apagar(c, versao, `Backup antigo (mais de ${BACKUP_DIAS} dias)`)) apagados++;
    }
  } catch {
    /* tenta de novo amanhã */
  }
}

class ArmazemArquivos implements Armazem {
  constructor(private f: Fonte) {}
  async versao(nome: string, fresco = false) {
    return (await this.f.versoes(fresco)).get(caminho(nome));
  }
  async ler(nome: string): Promise<Lido | null> {
    const lido = await this.f.ler(caminho(nome));
    return lido ? { dados: decodificar(nome, lido.bytes), versao: lido.versao, bruto: lido.bytes } : null;
  }
  async gravar(nome: string, dados: Cadastro, versao: string | null, _usuario: string, anterior: Lido | null) {
    const dia = hojeLocal();
    if (anterior?.bruto && !backupsFeitos.has(`${nome}|${dia}`)) {
      try {
        const base = nome.replace(/\.[^.]+$/, "").replaceAll("/", "_");
        await this.f.gravarCondicional(`app/backup/${base}-${dia}.json`, anterior.bruto, null, `Backup de ${nome}`);
      } catch {
        /* a cópia de segurança nunca impede a gravação */
      }
      backupsFeitos.add(`${nome}|${dia}`);
      const f = this.f;
      depoisDaResposta(() => limparBackupsAntigos(f, dia));
    }
    const bytes = new TextEncoder().encode(JSON.stringify(dados, null, 1));
    return this.f.gravarCondicional(caminho(nome), bytes, versao, `Central de Manutenção: ${nome}`);
  }
}

const RESERVA_MS = 10 * 60_000; // repositório fora do ar: até 10 min com o último lido

/** Onde gravar e ler: os arquivos do repositório de dados (ou da pasta local); null = demonstração, na memória. */
function armazem(): ArmazemArquivos | null {
  const f = fonte();
  return f ? new ArmazemArquivos(f) : null;
}

/** Versão atual do cadastro ("" = não existe); serve de chave de cache. Em demonstração, undefined. */
/** Só para os testes: permite limpar as cópias de novo no mesmo dia. */
export function _esquecerLimpezaBackups() {
  delete gl.__cmBackupsLimpos;
}

export async function versaoCadastro(nome: string, fresco = false): Promise<string | undefined> {
  const a = armazem();
  return a ? (await a.versao(nome, fresco)) ?? "" : undefined;
}

/**
 * Leitura (com cache pela versão do cadastro). fresco=true confere a versão de agora (ex.: a sessão gravada há pouco
 * por outra instância do servidor). Se a leitura falhar, vale o último conteúdo lido por até 10 min.
 */
export async function lerCadastro(nome: string, opcoes: { fresco?: boolean } = {}): Promise<Cadastro> {
  const a = armazem();
  if (!a) return lerJsonDemo(nome);
  const c = cache.get(nome);
  try {
    const versao = await a.versao(nome, opcoes.fresco);
    if (!versao) return {};
    if (c && c.versao === versao) {
      c.em = Date.now(); // conferido agora: a reserva conta daqui
      return c.dados;
    }
    const lido = await a.ler(nome);
    if (!lido) return {};
    cache.set(nome, { versao: lido.versao, dados: lido.dados, em: Date.now() });
    return lido.dados;
  } catch (e) {
    if (c && Date.now() - c.em <= RESERVA_MS) return c.dados;
    throw e;
  }
}

export async function gravarCadastroLote(
  nome: string,
  itens: Record<string, Item | null | Alteracao>,
  usuario: string,
  mesclar = false,
): Promise<void> {
  const a = armazem();
  if (!a) {
    gravarJsonDemo(nome, itens, usuario, mesclar);
    return;
  }
  for (let tentativa = 0; tentativa < 5; tentativa++) {
    const lido = await a.ler(nome);
    const atual: Cadastro = lido ? structuredClone(lido.dados) : {};
    const agora = new Date().toISOString().replace(/\.\d{3}Z$/, "+00:00");
    for (const [k, valor] of Object.entries(itens)) {
      let dados: Item | null | undefined;
      if (typeof valor === "function") {
        dados = valor(atual[k] ? { ...atual[k] } : undefined);
        if (dados === undefined) continue;
        if (dados) dados = Object.fromEntries(Object.entries(dados).filter(([c, v]) => v !== null && v !== undefined && !CAMPOS_DE_EDICAO.has(c)));
      } else dados = valor;
      if (dados && mesclar && typeof valor !== "function") {
        const junto: Item = {};
        for (const [c, v] of Object.entries({ ...(atual[k] || {}), ...dados }))
          if (v !== null && v !== undefined && !CAMPOS_DE_EDICAO.has(c)) junto[c] = v;
        dados = Object.keys(junto).length ? junto : null;
      }
      if (!dados) delete atual[k];
      else atual[k] = { ...dados, atualizado_em: agora, atualizado_por: usuario };
    }
    if (await a.gravar(nome, atual, lido?.versao ?? null, usuario, lido)) {
      cache.delete(nome);
      return;
    }
    await new Promise((ok) => setTimeout(ok, 300 * (tentativa + 1)));
  }
  throw new FonteErro(`${nome} está sendo alterado por outra pessoa agora; nada foi gravado — tente de novo.`);
}
