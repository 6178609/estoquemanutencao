import "server-only";

import { createHash, randomInt } from "node:crypto";

import { fotosDoCadastro, MAX_FOTOS, refFoto, REGEX_ID_FOTO } from "../fotoMaterial";
import { estoque } from "./bases";
import { gravarCadastroLote, lerCadastro } from "./cadastros";
import { fonte, FonteErro } from "./fonte";

/**
 * Fotos de cada material do estoque: o arquivo vai para o repositório de dados (privado), em `app/fotos/materiais/`,
 * junto com uma miniatura (para a lista), e o cadastro de materiais guarda as referências (`fotos`, a 1ª é a principal;
 * `foto` repete a principal), com a versão de cada uma, para o navegador saber quando mudou. Qualquer pessoa com acesso
 * ao Estoque pode incluir, trocar a principal ou remover foto. As fotos do site antigo (`fotos_materiais/<cod>.jpg`,
 * na pasta app/) continuam aparecendo. Em demonstração, ficam só na memória.
 */
export const LIMITE_FOTO = 1_500_000; // o navegador já reduz a foto antes de enviar (≤ 1600 px, JPEG)
export const LIMITE_MINI = 120_000;
export { MAX_FOTOS };
const PASTA = "app/fotos/materiais";
const CADASTRO = "cadastro_materiais.json";

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

/**
 * Caminho do arquivo. Sem `id`: a 1ª foto de antes (e a miniatura `_mini`). Com `id` (foto extra): `<material>~<id>`.
 * O id já é validado aqui: nada além de [a-z0-9] entra no caminho.
 */
export function caminhoFoto(material: string, mini = false, id?: string): string {
  if (id && !REGEX_ID_FOTO.test(id)) throw new Error("id de foto inválido");
  return `${PASTA}/${material}${id ? `~${id}` : ""}${mini ? "_mini" : ""}`;
}

const ALFABETO = "abcdefghijklmnopqrstuvwxyz0123456789";
/** Id curto e aleatório da foto extra (10 caracteres de [a-z0-9]). */
export function novoIdFoto(): string {
  let s = "";
  for (let i = 0; i < 10; i++) s += ALFABETO[randomInt(ALFABETO.length)];
  return s;
}

/** Versão da foto pelo conteúdo: a mesma foto tem sempre a mesma versão (o cache do navegador fica certo). */
export const versaoFoto = (b: Uint8Array) => createHash("sha1").update(b).digest("hex").slice(0, 16);

/** O material está no MB52 (ou o MB52 ainda não foi enviado: nesse caso não há o que conferir). */
export async function materialNoEstoque(material: string): Promise<boolean> {
  const mb52 = await estoque();
  return !mb52.dados || mb52.dados.some((i) => i.material === material);
}

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
let releuEm = 0;

async function gravarArquivo(caminho: string, bytes: Uint8Array, mensagem: string) {
  const f = fonte();
  if (!f) return guardarDemo(caminho, bytes);
  for (let i = 0; i < 3; i++) {
    const versao = (await f.versoes(i > 0)).get(caminho) ?? null;
    if (await f.gravarCondicional(caminho, bytes, versao, mensagem)) return;
  }
  throw new FonteErro("Outra pessoa está gravando a foto deste material agora; tente de novo.");
}

async function fotosAtuais(material: string): Promise<string[]> {
  const cad = await lerCadastro(CADASTRO);
  return fotosDoCadastro(cad[material] as { foto?: unknown; fotos?: unknown } | undefined);
}

/**
 * Inclui uma foto (e a miniatura) no fim da lista do material; devolve a lista nova. A cada foto um arquivo novo
 * (`<material>~<id>`), então nada que já existe é sobrescrito. Atômico no cadastro: relê o item na hora da gravação.
 */
export async function adicionarFotoMaterial(material: string, bytes: Uint8Array, mini: Uint8Array | null, por: string): Promise<string[]> {
  if (!materialValido(material)) throw new FonteErro("Material inválido.");
  if (!tipoImagem(bytes) || (mini && !tipoImagem(mini))) throw new FonteErro("O arquivo não é uma imagem JPEG, PNG ou WebP.");
  if (bytes.length > LIMITE_FOTO) throw new FonteErro("A foto passou de 1,5 MB.");
  if (mini && mini.length > LIMITE_MINI) throw new FonteErro("A miniatura passou do tamanho.");
  const limite = () => new FonteErro(`Este material já tem ${MAX_FOTOS} fotos. Remova uma para pôr outra.`);
  if ((await fotosAtuais(material)).length >= MAX_FOTOS) throw limite(); // confere antes de gravar os arquivos

  const id = novoIdFoto();
  if (mini) await gravarArquivo(caminhoFoto(material, true, id), mini, `Miniatura da foto do material ${material}`);
  await gravarArquivo(caminhoFoto(material, false, id), bytes, `Foto do material ${material}`);
  const ref = refFoto(material, id, versaoFoto(bytes), !!mini);

  let nova: string[] = [];
  await gravarCadastroLote(CADASTRO, {
    [material]: (atual) => {
      const lista = fotosDoCadastro(atual as { foto?: unknown; fotos?: unknown } | undefined);
      if (lista.length >= MAX_FOTOS) throw limite();
      nova = [...lista, ref];
      return { ...(atual ?? {}), foto: nova[0], fotos: nova, foto_versao: null };
    },
  }, por, true);
  return nova;
}

/**
 * Tira o material de uma foto da lista (`remover`) ou põe essa foto na frente, como principal (`principal`).
 * Os arquivos ficam no repositório (sem apagar: a foto pode ter sido vista em outra tela há pouco).
 */
export async function alterarFotoMaterial(material: string, acao: "principal" | "remover", ref: string, por: string): Promise<string[]> {
  if (!materialValido(material)) throw new FonteErro("Material inválido.");
  let nova: string[] = [];
  await gravarCadastroLote(CADASTRO, {
    [material]: (atual) => {
      const lista = fotosDoCadastro(atual as { foto?: unknown; fotos?: unknown } | undefined);
      if (!lista.includes(ref)) throw new FonteErro("Essa foto já não está no cadastro. Atualize a tela e tente de novo.");
      nova = acao === "principal" ? [ref, ...lista.filter((r) => r !== ref)] : lista.filter((r) => r !== ref);
      if (!nova.length) return { ...(atual ?? {}), foto: null, fotos: null, foto_versao: null };
      return { ...(atual ?? {}), foto: nova[0], fotos: nova, foto_versao: null };
    },
  }, por, true);
  return nova;
}

/** Lê a foto (ou a miniatura) de uma foto extra (`id`) ou da principal. Sem a nova, tenta a do site antigo. */
export async function lerFotoMaterial(material: string, { mini = false, recente = false, id }: { mini?: boolean; recente?: boolean; id?: string } = {}):
  Promise<{ bytes: Uint8Array; tipo: TipoImagem; versao: string } | null> {
  if (!materialValido(material)) return null;
  if (id && !REGEX_ID_FOTO.test(id)) return null;
  const f = fonte();
  const caminhos = id ? [caminhoFoto(material, mini, id)]
    : mini ? [caminhoFoto(material, true)] : [caminhoFoto(material), `app/fotos_materiais/${material}.jpg`];
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

