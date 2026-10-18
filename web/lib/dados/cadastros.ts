import "server-only";

import { after } from "next/server";

import { fonte, FonteErro, type Fonte } from "./fonte";
import { lerJsonDemo, gravarJsonDemo } from "./demo";
import { MARCADOR_MIGRACAO, supabase, type ClienteSupabase } from "./supabase";

/**
 * Cadastros do app — mínimos de estoque, usuários, equipamentos, Gestão de HH… Uma alteração feita aqui vale para
 * todas as telas. Ficam no Supabase (tabela `cadastros`, ver supabase.ts) quando ele está configurado; sem ele, nos
 * arquivos `app/<nome>.json` do repositório de dados. Na primeira vez com o Supabase, os arquivos do repositório são
 * copiados para lá sozinhos (nunca por cima do que já está no banco).
 *
 * Gravação: relê o cadastro na hora, aplica só os itens alterados e grava condicionado à versão lida; se outra
 * pessoa gravou no meio, relê e aplica de novo. Cópia de segurança: no Supabase, cada versão anterior vai para
 * `cadastros_historico`; no repositório, antes da primeira gravação do dia, para `app/backup/<cadastro>-<dia>.json`.
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

/** Onde os cadastros ficam: o Supabase ou os arquivos da fonte de dados. */
interface Armazem {
  versao(nome: string, fresco?: boolean): Promise<string | undefined>;
  ler(nome: string): Promise<Lido | null>;
  /** Grava se a versão ainda é `versao` (null = novo); false = alguém gravou antes. */
  gravar(nome: string, dados: Cadastro, versao: string | null, usuario: string, anterior: Lido | null): Promise<boolean>;
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
    }
    const bytes = new TextEncoder().encode(JSON.stringify(dados, null, 1));
    return this.f.gravarCondicional(caminho(nome), bytes, versao, `Central de Manutenção: ${nome}`);
  }
}

const TEMPO_VERSOES_SB_MS = 5_000;
const RESERVA_MS = 10 * 60_000; // Supabase fora do ar: até 10 min com o último lido

/** Cópia diária no repositório de dados (fora do Supabase): a falha da cópia nunca impede a gravação. */
async function copiaDoDia(f: Fonte | null, nome: string, dados: Cadastro) {
  const dia = hojeLocal();
  if (!f || backupsFeitos.has(`${nome}|${dia}`)) return;
  backupsFeitos.add(`${nome}|${dia}`);
  try {
    const base = nome.replace(/\.[^.]+$/, "").replaceAll("/", "_");
    await f.gravarCondicional(`app/backup/${base}-${dia}.json`, new TextEncoder().encode(JSON.stringify(dados, null, 1)), null,
      `Backup de ${nome}`);
  } catch {
    /* sem cópia hoje; o histórico do Supabase continua */
  }
}

/** Roda depois da resposta (a função não congela no meio); fora de uma requisição (testes), roda solto. */
function depoisDaResposta(tarefa: () => Promise<void>) {
  try {
    after(tarefa);
  } catch {
    void tarefa();
  }
}

class ArmazemSupabase implements Armazem {
  private lista: { em: number; mapa: Map<string, string> } | null = null;
  private pedindo: Promise<Map<string, string>> | null = null;
  private migracao: Promise<void> | null = null;
  constructor(private sb: ClienteSupabase, private origem: Fonte) {}

  /**
   * Cópia única dos cadastros do repositório de dados para o Supabase. Leituras e gravações esperam por ela (sem
   * isso, usuarios.json vazio pediria o primeiro administrador). Insere só o que ainda não existe no banco: várias
   * instâncias ao mesmo tempo não se atrapalham e nada gravado no Supabase é sobrescrito. Para sem gravar o marcador
   * (tenta de novo no próximo acesso) se a lista do repositório vier vazia, faltar usuarios.json ou um arquivo estiver
   * ilegível — melhor parar do que sumir um cadastro. O marcador guarda a versão (sha) de cada arquivo copiado.
   */
  private migrar(mapa: Map<string, string>): Promise<void> {
    if (mapa.has(MARCADOR_MIGRACAO)) return Promise.resolve();
    if (this.migracao) return this.migracao;
    const p = (async () => {
      const versoes = await this.origem.versoes(true);
      const nomes = [...versoes.keys()].filter((c) => /^app\/[^/]+\.json$/.test(c)).map((c) => c.slice(4));
      if (!nomes.includes("usuarios.json"))
        throw new FonteErro("Cópia dos cadastros para o Supabase adiada: a lista do repositório de dados veio sem usuarios.json.");
      const copiados: Record<string, string> = {};
      for (const nome of nomes) {
        const lido = await this.origem.ler(caminho(nome));
        if (!lido) continue;
        await this.sb.importar([{ nome, conteudo: decodificar(nome, lido.bytes) }]);
        copiados[nome] = lido.versao;
      }
      await this.sb.importar([{ nome: MARCADOR_MIGRACAO, conteudo: { em: new Date().toISOString(), copiados } }]);
      this.lista = null;
    })();
    this.migracao = p;
    p.catch(() => { if (this.migracao === p) this.migracao = null; });
    return p;
  }

  /** Versões de todos os cadastros (uma consulta), com a cópia inicial garantida. Falha: a lista anterior por até 10 min. */
  private async mapa(fresco: boolean): Promise<Map<string, string>> {
    if (!fresco && this.lista && Date.now() - this.lista.em <= TEMPO_VERSOES_SB_MS) return this.lista.mapa;
    // um pedido por vez por instância; com reserva na mão, uma tentativa só (banco fora do ar não trava cada página)
    this.pedindo ??= (async () => {
      const reserva = !!this.lista && Date.now() - this.lista.em <= RESERVA_MS;
      let mapa = await this.sb.versoes(reserva);
      if (!mapa.has(MARCADOR_MIGRACAO)) {
        await this.migrar(mapa);
        mapa = await this.sb.versoes();
      }
      this.lista = { em: Date.now(), mapa };
      return mapa;
    })().finally(() => { this.pedindo = null; });
    try {
      return await this.pedindo;
    } catch (e) {
      if (this.lista && Date.now() - this.lista.em <= RESERVA_MS) return this.lista.mapa;
      throw e;
    }
  }

  async versao(nome: string, fresco = false) {
    return (await this.mapa(fresco)).get(nome);
  }
  async ler(nome: string): Promise<Lido | null> {
    await this.mapa(false);
    const d = await this.sb.ler(nome);
    if (!d) return null;
    if (!d.conteudo || typeof d.conteudo !== "object" || Array.isArray(d.conteudo))
      throw new FonteErro(`O cadastro ${nome} está ilegível; nada foi gravado.`);
    return { dados: d.conteudo as Cadastro, versao: d.versao };
  }
  async gravar(nome: string, dados: Cadastro, versao: string | null, usuario: string, anterior: Lido | null) {
    await this.mapa(false);
    const nova = await this.sb.gravar(nome, dados, versao, usuario);
    if (nova == null) return false;
    if (this.lista) this.lista.mapa.set(nome, nova);
    if (anterior) depoisDaResposta(() => copiaDoDia(this.origem, nome, anterior.dados));
    return true;
  }
}

const ga = globalThis as unknown as { __cmArmazem?: { chave: unknown; a: Armazem | null } };

/**
 * Onde gravar e ler (null = demonstração, na memória). O Supabase só vale junto com o repositório de dados no GitHub
 * (produção); demonstração e pasta local não mudam.
 */
function armazem(): Armazem | null {
  const f = fonte();
  const sb = f?.modo === "github" ? supabase() : null;
  const chave = sb ?? f;
  if (ga.__cmArmazem && ga.__cmArmazem.chave === chave) return ga.__cmArmazem.a;
  const a = sb && f ? new ArmazemSupabase(sb, f) : f ? new ArmazemArquivos(f) : null;
  ga.__cmArmazem = { chave, a };
  return a;
}

/** Os cadastros estão no Supabase? */
export function cadastrosNoSupabase(): boolean {
  return fonte()?.modo === "github" && !!supabase();
}

/** Versão atual do cadastro ("" = não existe); serve de chave de cache. Em demonstração, undefined. */
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
