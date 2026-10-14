import "server-only";

import { manifesto } from "@/lib/dados/bases";
import { fonte } from "@/lib/dados/fonte";
import { lerParquet } from "@/lib/dados/parquet";
import { acharColuna, texto } from "@/lib/dados/texto";
import { DESTINO } from "@/lib/leitura/tipos";
import type { Ordem } from "@/lib/wcm/preparo";

/**
 * Campo de ordenação de cada ordem (coluna "Campo de ordenação" do IW38), que a Ordem preparada não guarda.
 * Lê o export cru do repositório de dados com cache próprio pela versão do arquivo (não mexe no cache das bases).
 * Na demonstração (sem repositório) não há essa coluna: o campo fictício é o próprio código do equipamento.
 */
const g = globalThis as unknown as { __cmCamposOrd?: { versao: string; mapa: Map<string, string> } };

export async function camposDeOrdenacao(ordens: Ordem[] | null): Promise<Map<string, string>> {
  const f = fonte();
  if (!f) return new Map((ordens ?? []).filter((o) => o.equipamento).map((o) => [o.ordem, o.equipamento.trim().toUpperCase()]));
  try {
    const caminho = DESTINO.iw38;
    const [versoes, man] = await Promise.all([f.versoes(), manifesto()]);
    const arquivos = man[caminho]?.partes?.length ? man[caminho].partes! : [caminho];
    if (arquivos.some((a) => !versoes.has(a))) return new Map();
    const versao = arquivos.map((a) => versoes.get(a)).join("+");
    if (g.__cmCamposOrd?.versao === versao) return g.__cmCamposOrd.mapa;
    const lidos = await Promise.all(arquivos.map((a) => f.ler(a)));
    if (lidos.some((l) => !l)) return new Map();
    const linhas = (await Promise.all(lidos.map((l) => lerParquet(l!.bytes)))).flat();
    const cols = linhas.length ? Object.keys(linhas[0]) : [];
    const cOrdem = acharColuna(cols, ["^ORDEM$"]), cCampo = acharColuna(cols, ["CAMPO DE ORDENACAO", "CAMPO ORDENACAO", "CAMPO.*ORDEN"]);
    const mapa = new Map<string, string>();
    if (cOrdem && cCampo) for (const l of linhas) {
      const o = texto(l[cOrdem]), c = texto(l[cCampo]).trim().toUpperCase();
      if (o && c) mapa.set(o, c);
    }
    g.__cmCamposOrd = { versao, mapa };
    return mapa;
  } catch {
    return new Map();
  }
}
