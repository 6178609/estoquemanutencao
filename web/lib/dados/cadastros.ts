import "server-only";

import { fonte, FonteErro } from "./fonte";
import { lerJsonDemo, gravarJsonDemo } from "./demo";

/**
 * Cadastros do app (`app/<nome>.json`): os MESMOS arquivos que o site atual grava — mínimos de estoque,
 * usuários, equipamentos… Uma alteração feita aqui aparece lá e vice-versa.
 *
 * Gravação igual à do central/bases.py (gravar_cadastro_lote): relê o arquivo na hora, aplica só os itens
 * alterados e grava condicionado à versão lida; se outra pessoa gravou no meio, relê e aplica de novo.
 * Antes da primeira gravação do dia, uma cópia vai para `app/backup/<cadastro>-<dia>.json`.
 */

type Item = Record<string, unknown>;
export type Cadastro = Record<string, Item>;

const CAMPOS_DE_EDICAO = new Set(["atualizado_em", "atualizado_por"]);
const g = globalThis as unknown as { __cmCadastros?: Map<string, { versao: string; dados: Cadastro }>; __cmBackups?: Set<string> };
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

/** Leitura (com cache pela versão do arquivo). */
export async function lerCadastro(nome: string): Promise<Cadastro> {
  const f = fonte();
  if (!f) return lerJsonDemo(nome);
  const versao = (await f.versoes()).get(caminho(nome));
  if (!versao) return {};
  const c = cache.get(nome);
  if (c && c.versao === versao) return c.dados;
  const lido = await f.ler(caminho(nome));
  if (!lido) return {};
  const dados = decodificar(nome, lido.bytes);
  cache.set(nome, { versao: lido.versao, dados });
  return dados;
}

function hojeLocal(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
}

/**
 * Atualiza só os itens informados. `null` remove o item. mesclar=true muda só os campos informados (campo null
 * é apagado) e remove o item que fica sem nenhum campo — o mínimo de um material não apaga a foto dele.
 */
export async function gravarCadastroLote(
  nome: string,
  itens: Record<string, Item | null>,
  usuario: string,
  mesclar = false,
): Promise<void> {
  const f = fonte();
  if (!f) {
    gravarJsonDemo(nome, itens, usuario, mesclar);
    return;
  }
  for (let tentativa = 0; tentativa < 5; tentativa++) {
    const lido = await f.ler(caminho(nome));
    const atual: Cadastro = lido ? decodificar(nome, lido.bytes) : {};
    const dia = hojeLocal();
    if (tentativa === 0 && lido && !backupsFeitos.has(`${nome}|${dia}`)) {
      try {
        const base = nome.replace(/\.[^.]+$/, "").replaceAll("/", "_");
        await f.gravarCondicional(`app/backup/${base}-${dia}.json`, lido.bytes, null, `Backup de ${nome}`);
      } catch {
        /* a cópia de segurança nunca impede a gravação */
      }
      backupsFeitos.add(`${nome}|${dia}`);
    }
    const agora = new Date().toISOString().replace(/\.\d{3}Z$/, "+00:00");
    for (const [k, valor] of Object.entries(itens)) {
      let dados = valor;
      if (dados && mesclar) {
        const junto: Item = {};
        for (const [c, v] of Object.entries({ ...(atual[k] || {}), ...dados }))
          if (v !== null && v !== undefined && !CAMPOS_DE_EDICAO.has(c)) junto[c] = v;
        dados = Object.keys(junto).length ? junto : null;
      }
      if (!dados) delete atual[k];
      else atual[k] = { ...dados, atualizado_em: agora, atualizado_por: usuario };
    }
    const bytes = new TextEncoder().encode(JSON.stringify(atual, null, 1));
    if (await f.gravarCondicional(caminho(nome), bytes, lido?.versao ?? null, `Central de Manutenção: ${nome}`)) {
      cache.delete(nome);
      return;
    }
    await new Promise((ok) => setTimeout(ok, 300 * (tentativa + 1)));
  }
  throw new FonteErro(`${nome} está sendo alterado por outra pessoa agora; nada foi gravado — tente de novo.`);
}
