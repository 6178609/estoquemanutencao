import "server-only";

import {
  codigoMaterial, consumo12m, indicePorMaterial, type LinhaHistorico, linhasDoHistorico, type LinhaRetirada, resumoHistorico,
  type ResumoHistorico, chaveOrdemMaterial,
} from "../estoque/historicoIw13";
import { iw13EstoqueDemo } from "../estoque/demo";
import { lerValidacoes, linhasIw13, ordensDeQuebra } from "../ubm/dados";
import { bases } from "../wcm/dados";
import { hoje } from "../wcm/util";
import { consumoMateriais } from "./consumo";
import { precosOuNada } from "./custo";
import { precoDe } from "./custoMaterial";
import { dadosDemo } from "./demo";
import { fonte } from "./fonte";

/**
 * Histórico de retiradas da IW13 na aba Estoque (regras em lib/estoque/historicoIw13.ts). A IW13 vem do mesmo lerBase
 * (cache pela versão) do consumo (lib/dados/consumo.ts → `tomadas` + `devolucoes`); o índice por material e o consumo
 * dos 12 meses ficam guardados presos à identidade desses dados (base nova = índice novo) e ao dia de Brasília. Na
 * demonstração, a IW13 fictícia de lib/estoque/demo.ts.
 */
interface Indice { porMaterial: Map<string, LinhaRetirada[]>; dia: number; c12: Map<string, number> }
const indices = new WeakMap<object, Indice>();
let demo: { dia: number; idx: Indice } | null = null;

function indiceDe(linhas: LinhaRetirada[], h: number): Indice {
  const porMaterial = indicePorMaterial(linhas);
  return { porMaterial, dia: h, c12: consumo12m(porMaterial, h) };
}

/** O índice da IW13 (null = sem a base) e a data do envio. */
async function indice(): Promise<{ idx: Indice | null; atualizado: string | null }> {
  const h = hoje();
  if (!fonte()) {
    if (!demo || demo.dia !== h) {
      const b = await bases();
      const extras = (await linhasIw13()).dados ?? [];
      const materiais = dadosDemo().estoque.filter((e) => e.estoque > 0 && /^9\d+$/.test(e.material)).map((e) => e.material);
      demo = { dia: h, idx: indiceDe(iw13EstoqueDemo(materiais, b.ordens.dados ?? [], b.calendario, extras), h) };
    }
    return { idx: demo.idx, atualizado: new Date(Date.now() - 86_400_000).toISOString() };
  }
  const c = await consumoMateriais().catch(() => null);
  const dados = c?.dados;
  if (!dados) return { idx: null, atualizado: c?.atualizado ?? null };
  let idx = indices.get(dados);
  if (!idx || idx.dia !== h) {
    idx = indiceDe([...dados.tomadas, ...(dados.devolucoes ?? [])], h);
    indices.set(dados, idx);
  }
  return { idx, atualizado: c?.atualizado ?? null };
}

/** Consumo líquido dos 12 meses por material (código sem zeros); null = sem a IW13. */
export async function consumo12mPorMaterial(): Promise<Map<string, number> | null> {
  return (await indice().catch(() => ({ idx: null }))).idx?.c12 ?? null;
}

export interface HistoricoMaterial {
  /** false = a IW13 não está carregada */
  temIw13: boolean; atualizado: string | null;
  resumo: ResumoHistorico | null; linhas: LinhaHistorico[];
  /** valores (quantidade × preço médio) só para quem vê a aba Custos; preço null = sem preço */
  comValor: boolean; preco: number | null;
}

/** O histórico de UM material (todas as linhas dele, da mais recente à mais antiga). */
export async function historicoMaterial(material: string, valores: boolean): Promise<HistoricoMaterial> {
  const { idx, atualizado } = await indice();
  if (!idx) return { temIw13: false, atualizado, resumo: null, linhas: [], comValor: false, preco: null };
  const brutas = idx.porMaterial.get(codigoMaterial(material)) ?? [];
  const [ordens, vs, precos] = await Promise.all([
    brutas.length ? ordensDeQuebra().catch(() => null) : null,
    brutas.length ? lerValidacoes().catch(() => []) : [],
    valores ? precosOuNada() : null,
  ]);
  // validação do líder na UBM por ordem|código: "veio da UBM" vence (o armário da primeira); senão "veio do Almox"
  const val = new Map<string, { decisao: "ubm" | "almox"; armario: string }>();
  for (const v of vs) {
    const k = chaveOrdemMaterial(v.ordem, v.codigo);
    const a = val.get(k);
    if (!a || (a.decisao === "almox" && v.decisao === "ubm")) val.set(k, { decisao: v.decisao, armario: v.armario });
  }
  const comValor = valores && !!precos;
  const preco = comValor ? precoDe(precos, material) : null;
  return {
    temIw13: true, atualizado, resumo: resumoHistorico(brutas, idx.dia),
    linhas: linhasDoHistorico(brutas, ordens, val, comValor ? preco : undefined), comValor, preco,
  };
}
