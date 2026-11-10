import "server-only";

/**
 * Busca de imagens na web para as fotos automáticas, com rodízio entre todos os provedores configurados (cada um na sua
 * cota gratuita). As chaves vêm das variáveis da Vercel — uma por provedor (`BUSCA_IMAGENS_CHAVE_GOOGLE` +
 * `BUSCA_IMAGENS_GOOGLE_CX`, `BUSCA_IMAGENS_CHAVE_BRAVE`, `…_SERPER`, `…_FIRECRAWL`, `…_SERPAPI`) ou o par antigo
 * `BUSCA_IMAGENS_PROVEDOR` + `BUSCA_IMAGENS_CHAVE` — e nunca entram em log, resposta ou mensagem de erro.
 */

export interface ImagemBusca { imagem: string; pagina: string | null; titulo: string }

/** Na ordem do rodízio: primeiro as cotas que renovam (Google por dia, Brave por mês), depois os créditos de cadastro. */
export const PROVEDORES = ["google", "brave", "serper", "firecrawl", "serpapi"] as const;
export type Provedor = (typeof PROVEDORES)[number];

/**
 * Buscas por dia de cada provedor, dentro do plano gratuito: Google Programmable Search 100/dia; Brave 2.000/mês;
 * Serper 2.500 de cadastro; Firecrawl 500 de cadastro; SerpApi 100/mês. Ajustável por `BUSCA_IMAGENS_POR_DIA_<PROVEDOR>`.
 */
export const COTA_GRATIS_DIA: Record<Provedor, number> = { google: 100, brave: 60, serper: 80, firecrawl: 15, serpapi: 3 };

export interface ConfiguracaoBusca { provedor: Provedor; chave: string; cx?: string; porDia: number }

/** Cota esgotada ou limite de pedidos (402/429): a rodada do dia para, sem erro fatal. */
export class CotaErro extends Error {}
/** Outra falha do provedor (rede, resposta inválida, 5xx). Não diz endereço nem chave. */
export class BuscaErro extends Error {}
/** O provedor recusou a chave (401/403 fora de cota): fica fora da rodada inteira. */
export class ChaveErro extends BuscaErro {}

const PRAZO_MS = 10_000;
const QUANTIDADE = 10;

const cotaDia = (env: Partial<NodeJS.ProcessEnv>, p: Provedor): number => {
  const n = Number(env[`BUSCA_IMAGENS_POR_DIA_${p.toUpperCase()}`]?.trim() || NaN);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : COTA_GRATIS_DIA[p];
};

/**
 * Todos os provedores configurados, na ordem do rodízio (vazio = busca desligada). O Google precisa também do id do
 * buscador (`BUSCA_IMAGENS_GOOGLE_CX`). O par antigo vale para o provedor que ele nomeia, se esse não tiver chave própria.
 */
export function configuracoesBusca(env: Partial<NodeJS.ProcessEnv> = process.env): ConfiguracaoBusca[] {
  const antigo = env.BUSCA_IMAGENS_PROVEDOR?.trim().toLowerCase() ?? "";
  const chaveAntiga = env.BUSCA_IMAGENS_CHAVE?.trim() ?? "";
  const out: ConfiguracaoBusca[] = [];
  for (const p of PROVEDORES) {
    const chave = env[`BUSCA_IMAGENS_CHAVE_${p.toUpperCase()}`]?.trim() || (antigo === p ? chaveAntiga : "");
    if (!chave) continue;
    const cx = p === "google" ? env.BUSCA_IMAGENS_GOOGLE_CX?.trim() ?? "" : undefined;
    if (p === "google" && !cx) continue;
    out.push({ provedor: p, chave, ...(cx && { cx }), porDia: cotaDia(env, p) });
  }
  return out;
}

/** O primeiro provedor configurado (null = busca desligada). */
export function configuracaoBusca(env: Partial<NodeJS.ProcessEnv> = process.env): ConfiguracaoBusca | null {
  return configuracoesBusca(env)[0] ?? null;
}

const texto = (x: unknown): string | null => (typeof x === "string" && x.trim() ? x.trim() : null);
const lista = (x: unknown): unknown[] => (Array.isArray(x) ? x.slice(0, QUANTIDADE) : []);
const pagina = (x: unknown) => texto(x);

/** Google Programmable Search (imagens): `items[]` com `title`, `link` (a imagem) e `image.contextLink` (a página). */
export function normalizarGoogle(json: unknown): ImagemBusca[] {
  const r = json as { items?: unknown };
  return lista(r?.items).flatMap((i) => {
    const o = i as { title?: unknown; link?: unknown; image?: { contextLink?: unknown } };
    const imagem = texto(o?.link);
    return imagem ? [{ imagem, pagina: pagina(o.image?.contextLink), titulo: texto(o.title) ?? "" }] : [];
  });
}

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

async function pedir(endereco: string, init: RequestInit, cota403 = false): Promise<unknown> {
  let r: Response;
  try {
    r = await fetch(endereco, { ...init, cache: "no-store", signal: AbortSignal.timeout(PRAZO_MS) });
  } catch {
    throw new BuscaErro("sem resposta do provedor de busca");
  }
  if (r.status === 402 || r.status === 429 || (cota403 && r.status === 403)) throw new CotaErro(`cota do provedor de busca (${r.status})`);
  if (r.status === 401 || r.status === 403) throw new ChaveErro(`o provedor recusou a chave (${r.status})`);
  if (!r.ok) throw new BuscaErro(`resposta ${r.status} do provedor de busca`);
  try {
    return await r.json();
  } catch {
    throw new BuscaErro("resposta inválida do provedor de busca");
  }
}

/**
 * Imagens para a consulta, no primeiro provedor configurado (lança BuscaErro se a busca está desligada). A rodada usa
 * buscarImagensEm, provedor a provedor.
 */
export async function buscarImagens(consulta: string): Promise<ImagemBusca[]> {
  const cfg = configuracaoBusca();
  if (!cfg) throw new BuscaErro("busca de fotos desligada");
  return buscarImagensEm(cfg, consulta);
}

let ultimoBrave = 0;

/** Imagens para a consulta num provedor. Tempo limite de 10 s; 402/429 viram CotaErro (no Google, também 403 de cota). */
export async function buscarImagensEm(cfg: ConfiguracaoBusca, consulta: string): Promise<ImagemBusca[]> {
  const { provedor, chave } = cfg;
  const json = "application/json";
  switch (provedor) {
    case "google": {
      const u = new URL("https://www.googleapis.com/customsearch/v1");
      u.searchParams.set("key", chave);
      u.searchParams.set("cx", cfg.cx ?? "");
      u.searchParams.set("q", consulta);
      u.searchParams.set("searchType", "image");
      u.searchParams.set("num", String(QUANTIDADE));
      u.searchParams.set("safe", "active");
      return normalizarGoogle(await pedir(u.href, { headers: { Accept: json } }, true));
    }
    case "brave": {
      // plano grátis do Brave: 1 pedido por segundo
      const espera = ultimoBrave + 1_100 - Date.now();
      if (espera > 0) await new Promise((ok) => setTimeout(ok, espera));
      ultimoBrave = Date.now();
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
