import "server-only";

/**
 * Busca de imagens na web para as fotos automáticas. O provedor e a chave vêm das variáveis da Vercel
 * (`BUSCA_IMAGENS_PROVEDOR` e `BUSCA_IMAGENS_CHAVE`); a chave nunca entra em log, resposta ou mensagem de erro.
 */

export interface ImagemBusca { imagem: string; pagina: string | null; titulo: string }

export const PROVEDORES = ["brave", "serper", "serpapi", "firecrawl"] as const;
export type Provedor = (typeof PROVEDORES)[number];

export interface ConfiguracaoBusca { provedor: Provedor; chave: string }

/** Cota esgotada ou limite de pedidos (402/429): a rodada do dia para, sem erro fatal. */
export class CotaErro extends Error {}
/** Outra falha do provedor (rede, resposta inválida, 5xx). Não diz endereço nem chave. */
export class BuscaErro extends Error {}

const PRAZO_MS = 10_000;
const QUANTIDADE = 10;

/** Provedor e chave das variáveis da Vercel; null (busca desligada) se faltar algo ou o nome não for conhecido. */
export function configuracaoBusca(env: Partial<NodeJS.ProcessEnv> = process.env): ConfiguracaoBusca | null {
  const provedor = env.BUSCA_IMAGENS_PROVEDOR?.trim().toLowerCase() ?? "";
  const chave = env.BUSCA_IMAGENS_CHAVE?.trim() ?? "";
  if (!chave || !(PROVEDORES as readonly string[]).includes(provedor)) return null;
  return { provedor: provedor as Provedor, chave };
}

const texto = (x: unknown): string | null => (typeof x === "string" && x.trim() ? x.trim() : null);
const lista = (x: unknown): unknown[] => (Array.isArray(x) ? x.slice(0, QUANTIDADE) : []);
const pagina = (x: unknown) => texto(x);

/** Brave: `results[]` com `title`, `url` (a página) e `properties.url` (a imagem). */
export function normalizarBrave(json: unknown): ImagemBusca[] {
  const r = json as { results?: unknown };
  return lista(r?.results).flatMap((i) => {
    const o = i as { title?: unknown; url?: unknown; properties?: { url?: unknown } };
    const imagem = texto(o?.properties?.url);
    return imagem ? [{ imagem, pagina: pagina(o.url), titulo: texto(o.title) ?? "" }] : [];
  });
}

/** Serper: `images[]` com `title`, `imageUrl` e `link` (a página). */
export function normalizarSerper(json: unknown): ImagemBusca[] {
  const r = json as { images?: unknown };
  return lista(r?.images).flatMap((i) => {
    const o = i as { title?: unknown; imageUrl?: unknown; link?: unknown };
    const imagem = texto(o?.imageUrl);
    return imagem ? [{ imagem, pagina: pagina(o.link), titulo: texto(o.title) ?? "" }] : [];
  });
}

/** SerpApi (Google Images): `images_results[]` com `title`, `original` (a imagem) e `link` (a página). */
export function normalizarSerpapi(json: unknown): ImagemBusca[] {
  const r = json as { images_results?: unknown };
  return lista(r?.images_results).flatMap((i) => {
    const o = i as { title?: unknown; original?: unknown; link?: unknown };
    const imagem = texto(o?.original);
    return imagem ? [{ imagem, pagina: pagina(o.link), titulo: texto(o.title) ?? "" }] : [];
  });
}

/**
 * Firecrawl: `data.images[]` com `title`, `imageUrl` (ou só `url`, que então é a imagem) e `url` (a página, quando
 * há `imageUrl`).
 */
export function normalizarFirecrawl(json: unknown): ImagemBusca[] {
  const r = json as { data?: { images?: unknown } };
  return lista(r?.data?.images).flatMap((i) => {
    const o = i as { title?: unknown; imageUrl?: unknown; url?: unknown };
    const comImagemPropria = texto(o?.imageUrl);
    const imagem = comImagemPropria ?? texto(o?.url);
    if (!imagem) return [];
    return [{ imagem, pagina: comImagemPropria ? pagina(o.url) : null, titulo: texto(o.title) ?? "" }];
  });
}

async function pedir(endereco: string, init: RequestInit): Promise<unknown> {
  let r: Response;
  try {
    r = await fetch(endereco, { ...init, cache: "no-store", signal: AbortSignal.timeout(PRAZO_MS) });
  } catch {
    throw new BuscaErro("sem resposta do provedor de busca");
  }
  if (r.status === 402 || r.status === 429) throw new CotaErro(`cota do provedor de busca (${r.status})`);
  if (!r.ok) throw new BuscaErro(`resposta ${r.status} do provedor de busca`);
  try {
    return await r.json();
  } catch {
    throw new BuscaErro("resposta inválida do provedor de busca");
  }
}

/**
 * Imagens para a consulta, no provedor configurado (lança BuscaErro se a busca está desligada). Tempo limite de 10 s;
 * 402/429 viram CotaErro.
 */
export async function buscarImagens(consulta: string): Promise<ImagemBusca[]> {
  const cfg = configuracaoBusca();
  if (!cfg) throw new BuscaErro("busca de fotos desligada");
  const { provedor, chave } = cfg;
  const json = "application/json";
  switch (provedor) {
    case "brave": {
      const u = new URL("https://api.search.brave.com/res/v1/images/search");
      u.searchParams.set("q", consulta);
      u.searchParams.set("count", String(QUANTIDADE));
      u.searchParams.set("safesearch", "strict");
      return normalizarBrave(await pedir(u.href, { headers: { "X-Subscription-Token": chave, Accept: json } }));
    }
    case "serper":
      return normalizarSerper(await pedir("https://google.serper.dev/images", {
        method: "POST",
        headers: { "X-API-KEY": chave, "Content-Type": json, Accept: json },
        body: JSON.stringify({ q: consulta, gl: "br", hl: "pt-br", num: QUANTIDADE }),
      }));
    case "serpapi": {
      const u = new URL("https://serpapi.com/search.json");
      u.searchParams.set("engine", "google_images");
      u.searchParams.set("q", consulta);
      u.searchParams.set("gl", "br");
      u.searchParams.set("hl", "pt-br");
      u.searchParams.set("api_key", chave);
      return normalizarSerpapi(await pedir(u.href, { headers: { Accept: json } }));
    }
    case "firecrawl":
      return normalizarFirecrawl(await pedir("https://api.firecrawl.dev/v2/search", {
        method: "POST",
        headers: { Authorization: `Bearer ${chave}`, "Content-Type": json, Accept: json },
        body: JSON.stringify({ query: consulta, sources: ["images"], limit: QUANTIDADE }),
      }));
  }
}
