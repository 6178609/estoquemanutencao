import "server-only";

import { gravarCadastroLote } from "./cadastros";
import { fonte, FonteErro } from "./fonte";

/**
 * Foto de cada material do estoque: o arquivo vai para o repositório de dados (privado), em `app/fotos/materiais/`,
 * e o cadastro de materiais guarda só a referência com a versão (`foto`), para o navegador saber quando mudou.
 * Qualquer pessoa com acesso ao Estoque pode pôr ou trocar a foto. Em demonstração, fica só na memória.
 */
export const LIMITE_FOTO = 1_500_000; // o navegador já reduz a foto antes de enviar (≤ 1600 px, JPEG)
const PASTA = "app/fotos/materiais";
const demo = new Map<string, Uint8Array>();

export type TipoImagem = "image/jpeg" | "image/png" | "image/webp";

/** O tipo pela assinatura dos bytes (não pelo nome nem pelo que o navegador diz). */
export function tipoImagem(b: Uint8Array): TipoImagem | null {
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "image/png";
  if (b.length > 12 && String.fromCharCode(...b.slice(0, 4)) === "RIFF" && String.fromCharCode(...b.slice(8, 12)) === "WEBP") return "image/webp";
  return null;
}

/** Código de material aceito (o mesmo formato do mínimo): letras, números, ponto, hífen e sublinhado. */
export const materialValido = (m: string) => /^[\w.\-]{1,40}$/.test(m);

export const caminhoFoto = (material: string) => `${PASTA}/${material}`;

/** Grava a foto e registra no cadastro; devolve a referência nova (com a versão). */
export async function gravarFotoMaterial(material: string, bytes: Uint8Array, por: string): Promise<string> {
  if (!materialValido(material)) throw new FonteErro("Material inválido.");
  if (!tipoImagem(bytes)) throw new FonteErro("O arquivo não é uma imagem JPEG, PNG ou WebP.");
  if (bytes.length > LIMITE_FOTO) throw new FonteErro("A foto passou de 1,5 MB.");
  const caminho = caminhoFoto(material);
  const f = fonte();
  if (!f) demo.set(material, bytes);
  else {
    let gravou = false;
    for (let i = 0; i < 3 && !gravou; i++) {
      const versao = (await f.versoes(i > 0)).get(caminho) ?? null;
      gravou = await f.gravarCondicional(caminho, bytes, versao, `Foto do material ${material}`);
    }
    if (!gravou) throw new FonteErro("Outra pessoa está gravando a foto deste material agora; tente de novo.");
  }
  const ref = `${caminho}?v=${Date.now().toString(36)}`;
  await gravarCadastroLote("cadastro_materiais.json", { [material]: { foto: ref } }, por, true);
  return ref;
}

export async function lerFotoMaterial(material: string): Promise<{ bytes: Uint8Array; tipo: TipoImagem } | null> {
  if (!materialValido(material)) return null;
  const f = fonte();
  const bytes = f ? (await f.ler(caminhoFoto(material)))?.bytes : demo.get(material);
  const tipo = bytes && tipoImagem(bytes);
  return bytes && tipo ? { bytes, tipo } : null;
}
