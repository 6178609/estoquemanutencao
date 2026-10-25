import "server-only";

import { randomBytes } from "node:crypto";

import { FonteErro, fonte } from "./fonte";

/**
 * Manuais grandes (acima de 4 MB, até 100 MB) enviados em partes. Cada parte vai numa requisição própria e fica na
 * fonte (repositório de dados) em `app/documentos/partes/<envio>/<índice>`; o estado do envio fica em
 * `app/documentos/partes/<envio>/info.json`. Quando o documento é concluído, o info some e as partes ficam (são o
 * arquivo do manual). Em demonstração, tudo fica na memória (limitado em tamanho).
 */

export const LIMITE_MANUAL_GRANDE = 100_000_000;
export const TAMANHO_PARTE = 3_500_000;
export const MAX_PARTES = Math.ceil(LIMITE_MANUAL_GRANDE / TAMANHO_PARTE); // 29
export const PRAZO_ENVIO_MS = 2 * 60 * 60_000; // um envio que não termina em 2 h é descartado
export const PASTA_PARTES = "app/documentos/partes";
const INICIOS_POR_HORA = 10;

/** Quantas partes um arquivo desse tamanho ocupa. */
export const numeroDePartes = (tamanho: number) => Math.ceil(tamanho / TAMANHO_PARTE);

/** Índice de parte dentro do envio. */
export const indiceValido = (indice: number, total: number) => Number.isInteger(indice) && indice >= 0 && indice < total;

/** Uma parte tem de ter bytes e caber em TAMANHO_PARTE. */
export const parteValida = (tamanho: number) => Number.isInteger(tamanho) && tamanho > 0 && tamanho <= TAMANHO_PARTE;
/**
 * Tamanho exato da parte `indice` de um arquivo de `tamanho` bytes: todas têm TAMANHO_PARTE, menos a última (o resto).
 * Conferido a cada parte recebida, a conclusão não precisa reler as partes para somar o tamanho.
 */
export const tamanhoDaParte = (indice: number, tamanho: number) =>
  Math.min(TAMANHO_PARTE, tamanho - indice * TAMANHO_PARTE);

/** Id de envio: 24 caracteres hexadecimais (sorteado; também é o nome da pasta na fonte). */
export const envioIdValido = (id: unknown): id is string => typeof id === "string" && /^[0-9a-f]{24}$/.test(id);

export const novoEnvio = () => randomBytes(12).toString("hex");

export const caminhoParte = (envio: string, indice: number) => `${PASTA_PARTES}/${envio}/${indice}`;
const caminhoInfo = (envio: string) => `${PASTA_PARTES}/${envio}/info.json`;

/** Quem iniciou o envio, quando expira, e o que vai virar o documento. */
export interface Envio {
  envio: string;
  /** login de quem iniciou (só ele manda partes e conclui) */
  login: string;
  /** nome para exibir (vai para o registro do documento) */
  por: string;
  titulo: string;
  nome: string;
  tamanho: number;
  total: number;
  /** equipamentos (TAGs) que vão receber o manual */
  tags: string[];
  expiraEm: string;
}

/** Envio expirado (ou sem data válida). */
export const envioExpirado = (e: { expiraEm: string }, agora = Date.now()) => !(Date.parse(e.expiraEm) > agora);

const inicios = new Map<string, number[]>();
/** Limite por pessoa para abrir envios: até 10 por hora (cada envio pode ocupar até 29 partes). */
export function podeIniciarEnvio(pessoa: string, agora = Date.now()): boolean {
  const recentes = (inicios.get(pessoa) ?? []).filter((t) => agora - t < 60 * 60_000);
  if (recentes.length >= INICIOS_POR_HORA) {
    inicios.set(pessoa, recentes);
    return false;
  }
  recentes.push(agora);
  inicios.set(pessoa, recentes);
  return true;
}

// ---------------------------------------------------------------------------- armazenamento

const DEMO_MAX_BYTES = 200_000_000;
const demo = new Map<string, Uint8Array>();
let demoBytes = 0;
function guardarDemo(caminho: string, bytes: Uint8Array) {
  const antes = demo.get(caminho);
  if (antes) demoBytes -= antes.length;
  demo.set(caminho, bytes);
  demoBytes += bytes.length;
  // demonstração: descarta os mais antigos quando passa do limite (é só para testar a tela)
  for (const k of demo.keys()) {
    if (demoBytes <= DEMO_MAX_BYTES) break;
    demoBytes -= demo.get(k)!.length;
    demo.delete(k);
  }
}

/** Grava um arquivo do envio (cria ou troca). Erro se a fonte recusar. */
async function gravar(caminho: string, bytes: Uint8Array, mensagem: string): Promise<void> {
  const f = fonte();
  if (!f) return guardarDemo(caminho, bytes);
  for (let i = 0; i < 3; i++) {
    // a 1ª tentativa usa a lista guardada; se o arquivo mudou (ou a lista está velha), relê e tenta de novo
    const versao = (await f.versoes(i > 0)).get(caminho) ?? null;
    if (await f.gravarCondicional(caminho, bytes, versao, mensagem)) return;
  }
  throw new FonteErro("Não consegui gravar agora; tente de novo.");
}

/** Lê um arquivo do envio (null se não existe). */
async function ler(caminho: string): Promise<Uint8Array | null> {
  const f = fonte();
  if (!f) return demo.get(caminho) ?? null;
  let r = await f.ler(caminho);
  if (!r) {
    // outra instância pode ter gravado agora: relê a lista e tenta de novo
    await f.versoes(true);
    r = await f.ler(caminho);
  }
  return r?.bytes ?? null;
}

/** Caminhos que existem na fonte para este envio. */
async function arquivosDoEnvio(envio: string, fresco = false): Promise<Map<string, string>> {
  const f = fonte();
  const prefixo = `${PASTA_PARTES}/${envio}/`;
  const mapa = f ? await f.versoes(fresco) : new Map([...demo.keys()].map((k) => [k, ""] as const));
  return new Map([...mapa].filter(([k]) => k.startsWith(prefixo)));
}

/** Índices das partes que ainda não estão na fonte (confere com lista fresca antes de dizer que falta). */
export async function partesFaltando(envio: string, total: number): Promise<number[]> {
  let mapa = await arquivosDoEnvio(envio);
  let faltam = indicesSem(mapa, envio, total);
  if (faltam.length) {
    mapa = await arquivosDoEnvio(envio, true);
    faltam = indicesSem(mapa, envio, total);
  }
  return faltam;
}

function indicesSem(mapa: Map<string, string>, envio: string, total: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < total; i++) if (!mapa.has(caminhoParte(envio, i))) out.push(i);
  return out;
}

/** Bytes de uma parte (null se não existe). */
export const lerParte = (envio: string, indice: number) => ler(caminhoParte(envio, indice));

/** Grava uma parte (troca se já existe: a tentativa anterior pode ter chegado pela metade). */
export const gravarParte = (envio: string, indice: number, bytes: Uint8Array, total: number) =>
  gravar(caminhoParte(envio, indice), bytes, `Parte ${indice + 1} de ${total} de manual (envio)`);

/** Estado do envio. */
export async function lerEnvio(envio: string): Promise<Envio | null> {
  const bytes = await ler(caminhoInfo(envio));
  if (!bytes) return null;
  try {
    const e = JSON.parse(new TextDecoder().decode(bytes)) as Envio;
    return e && e.envio === envio ? e : null;
  } catch {
    return null;
  }
}

export const gravarEnvio = (e: Envio) => gravar(caminhoInfo(e.envio), new TextEncoder().encode(JSON.stringify(e)),
  "Início de envio de manual (partes)");

/** Tira só o estado do envio (depois que o documento foi gravado nos equipamentos). */
export async function apagarEnvio(envio: string, por: string): Promise<void> {
  await apagarArquivos(envio, (caminho) => caminho === caminhoInfo(envio), por);
}

/** Apaga todas as partes do envio (remover o manual). */
export async function apagarPartesDoEnvio(envio: string, por: string): Promise<void> {
  await apagarArquivos(envio, () => true, por);
}

async function apagarArquivos(envio: string, escolhe: (caminho: string) => boolean, por: string): Promise<void> {
  if (!envioIdValido(envio)) return;
  const f = fonte();
  if (!f) {
    for (const k of [...demo.keys()]) {
      if (k.startsWith(`${PASTA_PARTES}/${envio}/`) && escolhe(k)) {
        demoBytes -= demo.get(k)!.length;
        demo.delete(k);
      }
    }
    return;
  }
  const mapa = await arquivosDoEnvio(envio, true);
  for (const [caminho, versao] of mapa) {
    if (!escolhe(caminho)) continue;
    // como a remoção de arquivo é feita hoje: a falha de uma parte não impede as outras (fica o que não apagou)
    await f.apagar(caminho, versao, `Remove partes de manual (${por})`).catch(() => false);
  }
}

/**
 * Fluxo de leitura das partes, em ordem (sem juntar tudo na memória). Erro no meio = o download é interrompido.
 */
export function fluxoDoEnvio(envio: string, total: number): ReadableStream<Uint8Array> {
  let proxima = 0;
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      if (proxima >= total) {
        controller.close();
        return;
      }
      const bytes = await lerParte(envio, proxima);
      if (!bytes) {
        controller.error(new FonteErro("Parte do manual não encontrada."));
        return;
      }
      proxima++;
      controller.enqueue(bytes);
    },
  });
}

/** Só para os testes: esvazia a demonstração e os limites de envio. */
export function _limparDemoPartes() {
  demo.clear();
  demoBytes = 0;
  inicios.clear();
}
