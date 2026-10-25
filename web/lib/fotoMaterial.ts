/**
 * Fotos de um material (usado no navegador e no servidor, sem nada que só roda num dos dois).
 *
 * O cadastro de materiais guarda: `foto` (a principal, a 1ª) e `fotos` (a lista, até 8). Cada referência é
 * `app/fotos/materiais/<material>` (a 1ª foto, como antes) ou `app/fotos/materiais/<material>~<id>` (as demais),
 * com `?v=<versão do conteúdo>` e `&mini=1` quando há miniatura. Foto do site antigo: `fotos_materiais/<cod>.jpg`.
 */

export const MAX_FOTOS = 8;
export const REGEX_ID_FOTO = /^[a-z0-9]{6,12}$/;
const PREFIXO = "app/fotos/materiais/";
const LEGADO = /^fotos_materiais\/[0-9A-Za-z_-]+\.jpg$/;

/** Sugestão de foto (busca na web) já pronta para a tela: sem o endereço da imagem, só o índice e a chave. */
export interface SugestaoPublica {
  i: number;
  k: string;
  titulo: string;
  pagina: string | null;
}

interface RefFoto {
  material: string;
  id: string | null;
  versao: string;
  mini: boolean;
}

/** Separa uma referência de foto nova. Caminho inválido (com barra, `..` ou id fora do formato) → null. */
export function lerRefFoto(ref: unknown): RefFoto | null {
  if (typeof ref !== "string" || !ref.startsWith(PREFIXO)) return null;
  const [caminho, consulta = ""] = ref.split("?");
  const m = /^app\/fotos\/materiais\/([A-Za-z0-9][\w.\-]{0,39})(?:~([a-z0-9]{6,12}))?$/.exec(caminho);
  if (!m || m[1].includes("..")) return null;
  const q = new URLSearchParams(consulta);
  return { material: m[1], id: m[2] ?? null, versao: q.get("v") ?? "", mini: q.get("mini") === "1" };
}

/** Referência válida (foto nova ou do site antigo). */
export function refValida(ref: unknown): ref is string {
  return typeof ref === "string" && (lerRefFoto(ref) !== null || LEGADO.test(ref));
}

/** Monta a referência de uma foto gravada. */
export function refFoto(material: string, id: string | null, versao: string, mini: boolean): string {
  return `${PREFIXO}${material}${id ? `~${id}` : ""}?v=${versao}${mini ? "&mini=1" : ""}`;
}

/**
 * A lista de fotos do material, na ordem (a 1ª é a principal). `foto` é sempre a principal: se vier de fora da lista
 * (gravação antiga), entra na frente. Refs inválidas são descartadas; no máximo MAX_FOTOS.
 */
export function fotosDoCadastro(info: { foto?: unknown; fotos?: unknown } | null | undefined): string[] {
  const lista: string[] = [];
  if (Array.isArray(info?.fotos)) for (const r of info.fotos) if (refValida(r) && !lista.includes(r)) lista.push(r);
  const principal = info?.foto;
  if (refValida(principal)) {
    const resto = lista.filter((r) => r !== principal);
    return [principal, ...resto].slice(0, MAX_FOTOS);
  }
  return lista.slice(0, MAX_FOTOS);
}

/** Endereço da foto de um material (a referência `foto` ou uma da lista). Usado no navegador e no servidor. */
export function urlFotoMaterial(material: string, ref: unknown, mini = false): string | null {
  const m = encodeURIComponent(material);
  if (typeof ref === "string" && LEGADO.test(ref)) return `/api/estoque/foto?m=${m}&v=legado`;
  const r = lerRefFoto(ref);
  if (!r) return null;
  const q = new URLSearchParams({ m: material, v: r.versao });
  if (r.id) q.set("f", r.id);
  if (mini && r.mini) q.set("mini", "1");
  return `/api/estoque/foto?${q.toString()}`;
}

/**
 * Foto que não é do material: do fabricante (achada pela referência do item) ou do tipo de material (ilustrativa).
 * `k` é a chave do endereço no cadastro (um pedaço do hash); o endereço da imagem nunca vai para o navegador.
 */
export interface FotoExterna { k: string; pagina: string | null; titulo: string }

export type OrigemFoto = "propria" | "referencia" | "tipo";
export interface FotoDoItem { origem: OrigemFoto; url: string; pagina: string | null; titulo: string }

/** Os campos de foto de um item da tela (o que o servidor manda junto). */
export interface ItemComFoto {
  material: string;
  /** código usado nas fotos quando difere do `material` (zeros à esquerda no Sysmat, sem eles no MB52) */
  codigoFoto?: string;
  pdm?: string;
  foto?: string | null;
  fotoRef?: FotoExterna | null;
  fotoTipo?: FotoExterna | null;
}

/** Rótulo discreto de cada origem (a própria não tem rótulo). */
export const ROTULO_FOTO: Record<Exclude<OrigemFoto, "propria">, string> = { referencia: "Foto do fabricante", tipo: "Foto ilustrativa" };

/**
 * A foto a mostrar no item, pela prioridade: foto própria (a principal) → do fabricante (referência do item) → do tipo
 * de material (ilustrativa) → nenhuma (null: a tela segue sem foto). Usado no navegador e no servidor.
 */
export function fotoDoItem(it: ItemComFoto, mini = false): FotoDoItem | null {
  const codigo = it.codigoFoto ?? it.material;
  const propria = urlFotoMaterial(codigo, it.foto ?? null, mini);
  if (propria) return { origem: "propria", url: propria, pagina: null, titulo: "" };
  if (it.fotoRef) {
    const q = new URLSearchParams({ m: codigo, k: it.fotoRef.k });
    return { origem: "referencia", url: `/api/estoque/foto/referencia?${q}`, pagina: it.fotoRef.pagina, titulo: it.fotoRef.titulo };
  }
  if (it.fotoTipo && it.pdm) {
    const q = new URLSearchParams({ p: it.pdm, k: it.fotoTipo.k });
    return { origem: "tipo", url: `/api/estoque/foto/tipo?${q}`, pagina: it.fotoTipo.pagina, titulo: it.fotoTipo.titulo };
  }
  return null;
}
