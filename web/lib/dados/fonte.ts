import "server-only";

import { promises as fs } from "node:fs";
import path from "node:path";

/**
 * De onde vêm os dados — o repositório de dados usado pelo site:
 *
 * - GitHub (produção na Vercel): repositório PRIVADO de dados. As bases enviadas em Fontes de dados ficam em
 *   `bases/*.parquet` e `bases/manifesto.json`; os cadastros (usuários, mínimos, equipamentos…) ficam em `app/*.json`.
 * - Pasta (desenvolvimento): a mesma estrutura numa pasta local (DADOS_PASTA).
 * - Sem nenhum dos dois: modo demonstração (dados fictícios gerados no código, ver demo.ts).
 *
 * Os dados nunca vão para o repositório do código (ele é público).
 */

export type Modo = "github" | "pasta" | "demo";

export interface Lido {
  bytes: Uint8Array;
  versao: string; // sha (GitHub) ou data de modificação (pasta)
}

export interface Fonte {
  modo: Modo;
  descricao: string;
  /** Versões de todos os arquivos (uma chamada só): para saber se algo mudou sem baixar nada. */
  versoes(fresco?: boolean): Promise<Map<string, string>>;
  /** Quando a lista de versões guardada foi lida (ms); só o GitHub guarda (0 = nunca). */
  listadoEm?(): number;
  ler(caminho: string): Promise<Lido | null>;
  /** Grava só se a versão ainda é `versao` (null = arquivo novo). false = alguém gravou antes (releia). */
  gravarCondicional(caminho: string, bytes: Uint8Array, versao: string | null, mensagem: string): Promise<boolean>;
  /** Apaga o arquivo (se ainda estiver na versão informada). */
  apagar(caminho: string, versao: string, mensagem: string): Promise<boolean>;
}

export class FonteErro extends Error {}

const TEMPO_VERSOES_MS = 30_000;
const TEMPO_MAX_VERSOES_MS = 10 * 60_000;
const TEMPO_PEDIDO_MS = 30_000; // gravação
const TEMPO_LEITURA_MS = 40_000; // leitura de um arquivo, até o fim do download
const TEMPO_LISTA_MS = 15_000; // lista de versões

// ----------------------------------------------------------------------------
// GitHub
// ----------------------------------------------------------------------------
class GitHub implements Fonte {
  modo = "github" as const;
  descricao: string;
  private cacheVersoes: { em: number; mapa: Map<string, string> } | null = null;

  constructor(private repo: string, private token: string, private ramo: string) {
    this.descricao = `Repositório de dados ${repo}`;
  }

  /**
   * Chamada à API com tempo limite (uma resposta travada não segura a página até o fim do prazo da função) e novas
   * tentativas em erro de rede, 429 e 5xx. Gravações (tentativas = 1) nunca repetem: o resultado poderia ser incerto.
   */
  private async pedir(caminho: string, init: RequestInit = {}, tentativas = 3, limiteMs = TEMPO_PEDIDO_MS): Promise<Response> {
    let ultimoErro: unknown = null;
    for (let i = 0; i < tentativas; i++) {
      if (i) await new Promise((ok) => setTimeout(ok, 2 ** (i - 1) * 600 + Math.random() * 300));
      try {
        const r = await fetch(`https://api.github.com${caminho}`, {
          ...init,
          cache: "no-store",
          signal: AbortSignal.timeout(limiteMs),
          headers: {
            Authorization: `Bearer ${this.token}`,
            Accept: "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
            ...(init.headers || {}),
          },
        });
        // 403 só repete quando é o limite de taxa da API (cota zerada), não falta de permissão
        const limite = r.status === 429 || (r.status === 403
          && (r.headers.get("x-ratelimit-remaining") === "0" || r.headers.has("retry-after"))); // primário ou secundário
        if (i < tentativas - 1 && (limite || r.status >= 500)) {
          await r.body?.cancel().catch(() => {});
          const espera = Number(r.headers.get("retry-after"));
          if (limite) console.warn(`[dados] limite da API do GitHub em ${caminho.split("?")[0]}`);
          if (espera > 0 && espera <= 10) await new Promise((ok) => setTimeout(ok, espera * 1000));
          continue;
        }
        return r;
      } catch (e) {
        ultimoErro = e;
      }
    }
    const nome = (ultimoErro as Error)?.name;
    throw new FonteErro(nome === "TimeoutError" || nome === "AbortError"
      ? "O repositório de dados demorou a responder. Tente de novo em instantes."
      : "Sem conexão com o repositório de dados. Tente de novo em instantes.");
  }

  private url(caminho: string) {
    return `/repos/${this.repo}/contents/${caminho.split("/").map(encodeURIComponent).join("/")}`;
  }

  listadoEm() {
    return this.cacheVersoes?.em ?? 0;
  }

  async versoes(fresco = false): Promise<Map<string, string>> {
    const c = this.cacheVersoes;
    if (!fresco && c) {
      const idade = Date.now() - c.em;
      if (idade < TEMPO_VERSOES_MS) return c.mapa;
      // passou de 30 s: responde com a lista que já tem e confere o GitHub em segundo plano (a página não espera);
      // só bloqueia se a lista estiver velha demais
      if (idade < TEMPO_MAX_VERSOES_MS) {
        this.listando ??= this.listar().catch(() => c.mapa).finally(() => { this.listando = null; });
        return c.mapa;
      }
    }
    // lista velha demais (ou nenhuma): espera a nova; se o GitHub falhar, segue com a antiga em vez de derrubar a página
    // (a promessa é a mesma para todos; cada um decide: só quem pediu a lista fresca recebe o erro)
    this.listando ??= this.listar().finally(() => { this.listando = null; });
    try {
      return await this.listando;
    } catch (e) {
      const antiga = c?.mapa ?? this.reserva;
      if (antiga && !fresco) return antiga;
      throw e;
    }
  }

  private listando: Promise<Map<string, string>> | null = null;
  /** Última lista lida (fica mesmo depois de uma gravação zerar o cache): reserva para quando o GitHub falha. */
  private reserva: Map<string, string> | null = null;

  private async listar(): Promise<Map<string, string>> {
    const r = await this.pedir(`/repos/${this.repo}/git/trees/${encodeURIComponent(this.ramo)}?recursive=1`, {}, 3, TEMPO_LISTA_MS);
    if (r.status === 404 || r.status === 409) return new Map();
    if (!r.ok) throw new FonteErro(`Erro ${r.status} ao listar o repositório de dados.`);
    const j = (await r.json()) as { tree?: { path: string; type: string; sha: string }[] };
    const mapa = new Map<string, string>();
    for (const it of j.tree || []) if (it.type === "blob") mapa.set(it.path, it.sha);
    this.cacheVersoes = { em: Date.now(), mapa };
    this.reserva = mapa;
    return mapa;
  }

  async ler(caminho: string): Promise<Lido | null> {
    const versao = (await this.versoes()).get(caminho);
    if (!versao) return null;
    // "raw" serve arquivos de até 100 MB (o JSON do contents só traz o conteúdo até 1 MB). O tempo limite vale até o
    // fim do download: se cair no meio, tenta mais uma vez.
    for (let i = 0; ; i++) {
      const r = await this.pedir(`${this.url(caminho)}?ref=${encodeURIComponent(this.ramo)}`, {
        headers: { Accept: "application/vnd.github.raw" },
      }, 3, TEMPO_LEITURA_MS);
      if (r.status === 404) return null;
      if (!r.ok) throw new FonteErro(`Erro ${r.status} ao ler ${caminho}.`);
      try {
        return { bytes: new Uint8Array(await r.arrayBuffer()), versao };
      } catch (e) {
        if (i >= 1) throw new FonteErro(`O download de ${caminho} não terminou (${(e as Error).name === "TimeoutError" ? "demorou demais" : "conexão caiu"}).`);
      }
    }
  }

  async gravarCondicional(caminho: string, bytes: Uint8Array, versao: string | null, mensagem: string) {
    const corpo: Record<string, string> = {
      message: mensagem,
      content: Buffer.from(bytes).toString("base64"),
      branch: this.ramo,
    };
    if (versao) corpo.sha = versao;
    // tempo esgotado: o GitHub pode ter gravado mesmo assim — a lista de versões é relida antes do próximo uso
    const r = await this.pedir(this.url(caminho), { method: "PUT", body: JSON.stringify(corpo) }, 1)
      .catch((e) => { this.cacheVersoes = null; throw e; });
    if (r.ok) {
      this.cacheVersoes = null;
      return true;
    }
    if (r.status === 409 || r.status === 422) {
      this.cacheVersoes = null;
      return false;
    }
    throw new FonteErro(`Erro ${r.status} ao gravar ${caminho}.`);
  }

  async apagar(caminho: string, versao: string, mensagem: string) {
    const r = await this.pedir(this.url(caminho), { method: "DELETE",
      body: JSON.stringify({ message: mensagem, sha: versao, branch: this.ramo }) }, 1)
      .catch((e) => { this.cacheVersoes = null; throw e; });
    this.cacheVersoes = null;
    if (r.ok || r.status === 404) return true;
    if (r.status === 409 || r.status === 422) return false;
    throw new FonteErro(`Erro ${r.status} ao apagar ${caminho}.`);
  }
}

// ----------------------------------------------------------------------------
// Pasta local (desenvolvimento)
// ----------------------------------------------------------------------------
class Pasta implements Fonte {
  modo = "pasta" as const;
  descricao: string;

  constructor(private raiz: string) {
    this.descricao = `Pasta ${raiz}`;
  }

  private abs(caminho: string) {
    const alvo = path.resolve(this.raiz, caminho);
    if (!alvo.startsWith(path.resolve(this.raiz) + path.sep)) throw new FonteErro("caminho fora da pasta de dados");
    return alvo;
  }

  async versoes() {
    const mapa = new Map<string, string>();
    const andar = async (dir: string, prefixo: string, nivel: number) => {
      if (nivel > 4) return;
      let itens: import("node:fs").Dirent[] = [];
      try {
        itens = await fs.readdir(dir, { withFileTypes: true });
      } catch {
        return;
      }
      for (const it of itens) {
        const rel = prefixo ? `${prefixo}/${it.name}` : it.name;
        if (it.isDirectory()) await andar(path.join(dir, it.name), rel, nivel + 1);
        else mapa.set(rel, String((await fs.stat(path.join(dir, it.name))).mtimeMs));
      }
    };
    await andar(this.raiz, "", 0);
    return mapa;
  }

  async ler(caminho: string) {
    try {
      const alvo = this.abs(caminho);
      const [bytes, st] = await Promise.all([fs.readFile(alvo), fs.stat(alvo)]);
      return { bytes: new Uint8Array(bytes), versao: String(st.mtimeMs) };
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw e;
    }
  }

  async gravarCondicional(caminho: string, bytes: Uint8Array, versao: string | null) {
    const alvo = this.abs(caminho);
    const atual = await this.ler(caminho);
    if ((atual?.versao ?? null) !== versao) return false;
    await fs.mkdir(path.dirname(alvo), { recursive: true });
    const tmp = `${alvo}.${process.pid}.tmp`;
    await fs.writeFile(tmp, bytes);
    await fs.rename(tmp, alvo);
    return true;
  }

  async apagar(caminho: string, versao: string) {
    const atual = await this.ler(caminho);
    if (!atual) return true;
    if (atual.versao !== versao) return false;
    await fs.unlink(this.abs(caminho));
    return true;
  }
}

// uma fonte por processo (globalThis: páginas e rotas de API podem carregar cópias separadas deste módulo, e o
// cache de versões precisa ser o mesmo para uma gravação aparecer na hora nas duas)
const g = globalThis as unknown as { __cmFonte?: Fonte | null };
let unica: Fonte | null | undefined = g.__cmFonte;

/** A fonte configurada (null = modo demonstração). */
export function fonte(): Fonte | null {
  if (unica !== undefined) return unica;
  const repo = process.env.DADOS_GH_REPO?.trim();
  const token = process.env.DADOS_GH_TOKEN?.trim();
  const pasta = process.env.DADOS_PASTA?.trim();
  if (repo && token) unica = new GitHub(repo, token, process.env.DADOS_GH_RAMO?.trim() || "main");
  else if (pasta) unica = new Pasta(pasta);
  else unica = null;
  g.__cmFonte = unica;
  return unica;
}

export function modo(): Modo {
  return fonte()?.modo ?? "demo";
}

/** Só para os testes: troca a fonte. */
export function _definirFonte(f: Fonte | null | undefined) {
  unica = f;
  if (f === undefined) delete g.__cmFonte;
  else g.__cmFonte = f;
}
