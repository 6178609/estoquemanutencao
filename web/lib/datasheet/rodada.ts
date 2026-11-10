import "server-only";

import { gravarCadastroLote, lerCadastro } from "../dados/cadastros";
import { ARQ_DATASHEETS, chaveMaterial, datasheetsDe, gravarLinkDatasheet } from "../dados/documentos";
import { buscarWebEm, ChaveErro, configuracoesBusca, CotaErro, type PaginaBusca } from "../fotos/buscaImagem";
import { ARQUIVO_ESTADO, carregarDados, planejarBusca } from "../fotos/rodadaFotos";
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

export interface ProvedorWeb { nome: string; porDia: number; buscar: (consulta: string) => Promise<PaginaBusca[]> }

let rodando = false;
export interface ResumoDatasheets { ligada: boolean; buscados: number; achados: number; motivo: string }

export async function rodadaDatasheets(o: { porRodada: number; prazoMs: number; provedores?: ProvedorWeb[] }): Promise<ResumoDatasheets> {
  const provs = o.provedores ?? configuracoesBusca().map((c) => ({ nome: c.provedor, porDia: c.porDia, buscar: (q: string) => buscarWebEm(c, q) }));
  if (!provs.length) return { ligada: false, buscados: 0, achados: 0, motivo: "busca desligada" };
  if (rodando) return { ligada: true, buscados: 0, achados: 0, motivo: "já há uma rodada em andamento" };
  rodando = true;
  try {
    const inicio = Date.now();
    const hoje = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
    const [estado, estadoFotos] = await Promise.all([lerCadastro(ARQUIVO_ESTADO_DS), lerCadastro(ARQUIVO_ESTADO)]);
    const dia = estado[CHAVE_DIA] as { dia?: unknown; usadas?: unknown } | undefined;
    const usadas = dia?.dia === hoje && typeof dia.usadas === "number" ? dia.usadas : 0;
    const teto = Math.min(o.porRodada, Math.max(0, limiteDatasheets() - usadas));
    if (teto <= 0) return { ligada: true, buscados: 0, achados: 0, motivo: "orçamento do dia esgotado" };
    // a cota grátis de cada provedor é uma só para fotos e datasheets: conta no orçamento do dia das fotos
    const diaF = estadoFotos[CHAVE_DIA] as { dia?: unknown; por?: unknown } | undefined;
    const porProv = new Map<string, number>(diaF?.dia === hoje && diaF.por && typeof diaF.por === "object"
      ? Object.entries(diaF.por as Record<string, unknown>).map(([k, v]) => [k, typeof v === "number" ? v : 0]) : []);
    const usadasAgora = new Map<string, number>();
    const esgotados = new Set<string>();
    const livre = (p: ProvedorWeb) => !esgotados.has(p.nome) && (porProv.get(p.nome) ?? 0) + (usadasAgora.get(p.nome) ?? 0) < p.porDia;
    const [d, ds] = await Promise.all([carregarDados(), lerCadastro(ARQ_DATASHEETS)]);
    // o cadastro de datasheets usa o código sem zeros: o material que já tem datasheet não volta à fila
    const alvos = planejarBusca({ ...d, refs: ds, estado }).filter((a) => !Object.hasOwn(ds, chaveMaterial(a.material)));
    const novos: Record<string, Record<string, unknown>> = {};
    const em = new Date().toISOString();
    let chamadas = 0, achados = 0, motivo = "fim da fila";
    fila: for (const a of alvos) {
      if (chamadas >= teto) { motivo = "orçamento da rodada"; break; }
      if (Date.now() - inicio > o.prazoMs) { motivo = "tempo da rodada"; break; }
      if (!provs.some(livre)) { motivo = "cota do provedor de busca"; break; }
      let respondeu = false, achou = false;
      for (const p of provs) {
        if (!livre(p)) continue;
        if (chamadas >= teto || Date.now() - inicio > o.prazoMs) break fila;
        chamadas++;
        usadasAgora.set(p.nome, (usadasAgora.get(p.nome) ?? 0) + 1);
        let lista: PaginaBusca[];
        try {
          lista = await p.buscar(consultaDatasheet(a.fab, a.ref));
        } catch (e) {
          if (e instanceof CotaErro || e instanceof ChaveErro) esgotados.add(p.nome);
          continue;
        }
        respondeu = true;
        const x = escolherDatasheet(lista, a.fab, a.ref);
        if (!x) continue;
        try {
          // o mesmo link não entra duas vezes (rodada e botão ao mesmo tempo, ou o editor já pôs)
          if (!(await datasheetsDe(a.material)).some((doc) => doc.url === x.url))
            await gravarLinkDatasheet(a.material, { titulo: `${x.pdf ? "Datasheet (PDF)" : "Página do produto"} · ${x.titulo}`, url: x.url }, "busca automática");
          achou = true;
        } catch {
          // falha ao gravar (lista cheia, fonte fora): segue para o próximo material
        }
        break;
      }
      if (!respondeu) continue;
      novos[a.chave] = { data: em, resultado: achou ? "achou" : "sem" };
      if (achou) achados++;
    }
    if (chamadas) {
      await gravarCadastroLote(ARQUIVO_ESTADO_DS, {
        ...novos,
        [CHAVE_DIA]: (atual: Record<string, unknown> | undefined) => ({
          dia: hoje, usadas: (atual?.dia === hoje && typeof atual.usadas === "number" ? atual.usadas : 0) + chamadas,
        }),
      }, "busca automática", false);
      await gravarCadastroLote(ARQUIVO_ESTADO, {
        [CHAVE_DIA]: (atual: Record<string, unknown> | undefined) => {
          const mesmo = atual?.dia === hoje;
          const por: Record<string, number> = mesmo && atual?.por && typeof atual.por === "object" ? { ...(atual.por as Record<string, number>) } : {};
          for (const [k, n] of usadasAgora) por[k] = (typeof por[k] === "number" ? por[k] : 0) + n;
          return { ...(mesmo ? atual : {}), dia: hoje, por, ...(!mesmo && { usadas: 0 }) };
        },
      }, "busca automática", false);
    }
    console.info(`busca de datasheets: ${chamadas} buscas, ${achados} achados (${motivo})`);
    return { ligada: true, buscados: chamadas, achados, motivo };
  } finally {
    rodando = false;
  }
}
