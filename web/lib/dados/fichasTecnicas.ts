import "server-only";

import { normalizarFicha, type FichaTecnica } from "../wcm/fichaTecnica";
import { fonte } from "./fonte";

const ARQUIVO = "app/fichas_tecnicas.json";
let cache: { versao: string; dados: Record<string, FichaTecnica> } | null = null;

/** As fichas técnicas dos modelos (repositório de dados, `app/fichas_tecnicas.json`), por id do modelo; vazio sem a fonte. */
export async function fichasTecnicas(): Promise<Record<string, FichaTecnica>> {
  const f = fonte();
  if (!f) return {};
  try {
    const versao = (await f.versoes()).get(ARQUIVO);
    if (!versao) return {};
    if (cache?.versao === versao) return cache.dados;
    const lido = await f.ler(ARQUIVO);
    if (!lido) return cache?.dados ?? {};
    const bruto = JSON.parse(new TextDecoder().decode(lido.bytes)) as Record<string, Record<string, unknown>>;
    const dados = Object.fromEntries(Object.entries(bruto).map(([k, v]) => [k, normalizarFicha(v)]));
    cache = { versao: lido.versao, dados };
    return dados;
  } catch {
    return cache?.dados ?? {};
  }
}
