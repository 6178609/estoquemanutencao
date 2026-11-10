import "server-only";

import { gravarCadastroLote, lerCadastro } from "../dados/cadastros";
import { ARQ_DATASHEETS, gravarLinkDatasheet } from "../dados/documentos";
import { buscarWebEm, ChaveErro, configuracoesBusca, CotaErro, type PaginaBusca } from "../fotos/buscaImagem";
import { carregarDados, planejarBusca } from "../fotos/rodadaFotos";
import { consultaDatasheet, escolherDatasheet } from "./escolha";

/**
 * Busca automática do datasheet do fabricante, pela mesma fila das fotos (almoxarifado → ligados a equipamento →
 * aprovados → demais) e os mesmos provedores em rodízio, só com busca web. O achado vira um link na biblioteca de
 * datasheets do material (por "busca automática"); o editor pode trocar ou anexar o PDF. Tentativa registrada em
 * `datasheets_busca_estado.json` (não repete por 60 dias). Nunca registra endereços nem chaves no log.
 */
export const ARQUIVO_ESTADO_DS = "datasheets_busca_estado.json";
export const DATASHEETS_POR_DIA_PADRAO = 40;
const CHAVE_DIA = "_orcamento_dia";

export function limiteDatasheets(env: Partial<NodeJS.ProcessEnv> = process.env): number {
  const n = Number(env.DATASHEETS_POR_DIA?.trim() || NaN);
  return Number.isFinite(n) && n >= 0 ? Math.min(200, Math.floor(n)) : DATASHEETS_POR_DIA_PADRAO;
}

export interface ProvedorWeb { nome: string; buscar: (consulta: string) => Promise<PaginaBusca[]> }
export interface ResumoDatasheets { ligada: boolean; buscados: number; achados: number; motivo: string }

export async function rodadaDatasheets(o: { porRodada: number; prazoMs: number; provedores?: ProvedorWeb[] }): Promise<ResumoDatasheets> {
  const provs = o.provedores ?? configuracoesBusca().map((c) => ({ nome: c.provedor, buscar: (q: string) => buscarWebEm(c, q) }));
  if (!provs.length) return { ligada: false, buscados: 0, achados: 0, motivo: "busca desligada" };
  const inicio = Date.now();
  const [d, ds, estado] = await Promise.all([carregarDados(), lerCadastro(ARQ_DATASHEETS), lerCadastro(ARQUIVO_ESTADO_DS)]);
  const hoje = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
  const dia = estado[CHAVE_DIA] as { dia?: unknown; usadas?: unknown } | undefined;
  const usadas = dia?.dia === hoje && typeof dia.usadas === "number" ? dia.usadas : 0;
  const teto = Math.min(o.porRodada, Math.max(0, limiteDatasheets() - usadas));
  const alvos = planejarBusca({ ...d, refs: ds, estado });
  const esgotados = new Set<string>();
  const novos: Record<string, Record<string, unknown>> = {};
  const em = new Date().toISOString();
  let chamadas = 0, achados = 0, motivo = teto <= 0 ? "orçamento do dia esgotado" : "fim da fila";
  fila: for (const a of alvos) {
    if (chamadas >= teto) { motivo = "orçamento da rodada"; break; }
    if (Date.now() - inicio > o.prazoMs) { motivo = "tempo da rodada"; break; }
    let respondeu = false, achou = false;
    for (const p of provs) {
      if (esgotados.has(p.nome)) continue;
      if (chamadas >= teto || Date.now() - inicio > o.prazoMs) break fila;
      chamadas++;
      let lista: PaginaBusca[];
      try {
        lista = await p.buscar(consultaDatasheet(a.fab, a.ref));
      } catch (e) {
        if (e instanceof CotaErro || e instanceof ChaveErro) esgotados.add(p.nome);
        continue;
      }
      respondeu = true;
      const x = escolherDatasheet(lista, a.fab, a.ref);
      if (x) {
        await gravarLinkDatasheet(a.material, { titulo: `${x.pdf ? "Datasheet (PDF)" : "Página do produto"} · ${x.titulo}`, url: x.url }, "busca automática");
        achou = true;
        break;
      }
    }
    if (!respondeu) {
      if (provs.every((p) => esgotados.has(p.nome))) { motivo = "cota do provedor de busca"; break; }
      continue;
    }
    novos[a.chave] = { data: em, resultado: achou ? "achou" : "sem" };
    if (achou) achados++;
  }
  await gravarCadastroLote(ARQUIVO_ESTADO_DS, {
    ...novos,
    [CHAVE_DIA]: (atual: Record<string, unknown> | undefined) => ({
      dia: hoje, usadas: (atual?.dia === hoje && typeof atual.usadas === "number" ? atual.usadas : 0) + chamadas,
    }),
  }, "busca automática", false);
  console.info(`busca de datasheets: ${chamadas} buscas, ${achados} achados (${motivo})`);
  return { ligada: true, buscados: chamadas, achados, motivo };
}
