import "server-only";

import { createHash } from "node:crypto";

import { gravarCadastroLote } from "./cadastros";
import { fonte, FonteErro } from "./fonte";

/**
 * Foto de cada material do estoque: o arquivo vai para o repositório de dados (privado), em `app/fotos/materiais/`,
 * junto com uma miniatura (`<material>_mini`, para a lista), e o cadastro de materiais guarda só a referência com a
 * versão (`foto`), para o navegador saber quando mudou. Qualquer pessoa com acesso ao Estoque pode pôr ou trocar a
 * foto. As fotos do site antigo (`fotos_materiais/<cod>.jpg`, na pasta app/) continuam aparecendo.
 * Em demonstração, fica só na memória.
 */
export const LIMITE_FOTO = 1_500_000; // o navegador já reduz a foto antes de enviar (≤ 1600 px, JPEG)
export const LIMITE_MINI = 120_000;
const PASTA = "app/fotos/materiais";

export type TipoImagem = "image/jpeg" | "image/png" | "image/webp";

/** O tipo pela assinatura dos bytes (não pelo nome nem pelo que o navegador diz). */
export function tipoImagem(b: Uint8Array): TipoImagem | null {
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "image/png";
  if (b.length > 12 && String.fromCharCode(...b.slice(0, 4)) === "RIFF" && String.fromCharCode(...b.slice(8, 12)) === "WEBP") return "image/webp";
  return null;
}

/** Código de material aceito: começa com letra ou número; depois letras, números, ponto, hífen e sublinhado. */
export const materialValido = (m: string) => /^[A-Za-z0-9][\w.\-]{0,39}$/.test(m) && !m.includes("..");

export const caminhoFoto = (material: string, mini = false) => `${PASTA}/${material}${mini ? "_mini" : ""}`;

/** Versão da foto pelo conteúdo: a mesma foto tem sempre a mesma versão (o cache do navegador fica certo). */
export const versaoFoto = (b: Uint8Array) => createHash("sha1").update(b).digest("hex").slice(0, 16);

// ---------------------------------------------------------------------------- memória
// demonstração: as fotos ficam aqui (no máximo 50, sai a mais antiga)
const demo = new Map<string, Uint8Array>();
function guardarDemo(caminho: string, b: Uint8Array) {
  demo.delete(caminho);
  demo.set(caminho, b);
  while (demo.size > 50) demo.delete(demo.keys().next().value!);
}

// cache das fotos lidas do GitHub, por (caminho, versão do arquivo): poupa a cota da API (até ~30 MB, sai a mais antiga)
const cache = new Map<string, Uint8Array>();
let bytesCache = 0;
function guardarCache(chave: string, b: Uint8Array) {
  if (cache.has(chave) || b.length > 2_000_000) return;
  cache.set(chave, b);
  bytesCache += b.length;
  for (const [k, v] of cache) {
    if (bytesCache <= 30_000_000) break;
    cache.delete(k);
    bytesCache -= v.length;
  }
}

// ---------------------------------------------------------------------------- limite de envios
// por pessoa: até 20 envios a cada 10 minutos (evita encher o repositório de dados)
const envios = new Map<string, number[]>();
export function podeEnviar(pessoa: string, agora = Date.now()): boolean {
  const recentes = (envios.get(pessoa) ?? []).filter((t) => agora - t < 10 * 60_000);
  if (recentes.length >= 20) {
    envios.set(pessoa, recentes);
    return false;
  }
  recentes.push(agora);
  envios.set(pessoa, recentes);
  return true;
}

// ---------------------------------------------------------------------------- gravar e ler
async function gravarArquivo(caminho: string, bytes: Uint8Array, mensagem: string) {
  const f = fonte();
  if (!f) return guardarDemo(caminho, bytes);
  for (let i = 0; i < 3; i++) {
    const versao = (await f.versoes(i > 0)).get(caminho) ?? null;
    if (await f.gravarCondicional(caminho, bytes, versao, mensagem)) return;
  }
  throw new FonteErro("Outra pessoa está gravando a foto deste material agora; tente de novo.");
}

/** Grava a foto (e a miniatura) e registra no cadastro; devolve a referência nova (com a versão). */
export async function gravarFotoMaterial(material: string, bytes: Uint8Array, mini: Uint8Array | null, por: string): Promise<string> {
  if (!materialValido(material)) throw new FonteErro("Material inválido.");
  if (!tipoImagem(bytes) || (mini && !tipoImagem(mini))) throw new FonteErro("O arquivo não é uma imagem JPEG, PNG ou WebP.");
  if (bytes.length > LIMITE_FOTO) throw new FonteErro("A foto passou de 1,5 MB.");
  if (mini && mini.length > LIMITE_MINI) throw new FonteErro("A miniatura passou do tamanho.");
  if (mini) await gravarArquivo(caminhoFoto(material, true), mini, `Miniatura da foto do material ${material}`);
  await gravarArquivo(caminhoFoto(material), bytes, `Foto do material ${material}`);
  const ref = `${caminhoFoto(material)}?v=${versaoFoto(bytes)}${mini ? "&mini=1" : ""}`;
  // foto_versao era do site antigo: null apaga o campo
  await gravarCadastroLote("cadastro_materiais.json", { [material]: { foto: ref, foto_versao: null } }, por, true);
  return ref;
}

let releuEm = 0;

/**
 * Lê a foto (ou a miniatura). Sem a nova, tenta a do site antigo. A versão devolvida é o hash do conteúdo.
 * `recente`: o cadastro diz que há foto nova — se outra instância acabou de gravar, a lista de versões daqui ainda não
 * tem o arquivo; então relê a lista (no máximo a cada 15 s, para não gastar a cota da API).
 */
export async function lerFotoMaterial(material: string, { mini = false, recente = false } = {}):
  Promise<{ bytes: Uint8Array; tipo: TipoImagem; versao: string } | null> {
  if (!materialValido(material)) return null;
  const f = fonte();
  const caminhos = mini ? [caminhoFoto(material, true)] : [caminhoFoto(material), `app/fotos_materiais/${material}.jpg`];
  for (const caminho of caminhos) {
    let bytes: Uint8Array | undefined;
    if (!f) bytes = demo.get(caminho);
    else {
      let versao = (await f.versoes()).get(caminho);
      if (!versao && recente && caminho.startsWith(`${PASTA}/`) && Date.now() - releuEm > 15_000) {
        releuEm = Date.now();
        versao = (await f.versoes(true)).get(caminho);
      }
      if (!versao) continue;
      const chave = `${caminho}@${versao}`;
      bytes = cache.get(chave);
      if (!bytes) {
        const lido = await f.ler(caminho);
        if (!lido) continue;
        bytes = lido.bytes;
        versao = lido.versao;
        guardarCache(`${caminho}@${versao}`, bytes);
      }
    }
    const tipo = bytes && tipoImagem(bytes);
    if (bytes && tipo) return { bytes, tipo, versao: versaoFoto(bytes) };
  }
  return null;
}
