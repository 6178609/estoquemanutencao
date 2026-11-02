/**
 * Ficha técnica de um modelo de máquina (levantada dos manuais e planilhas de spare parts): dados técnicos, componentes,
 * materiais (com código SAP e situação no almoxarifado) e atividades por periodicidade. Funções puras, testadas em
 * testes/fichaTecnica.test.ts. Os dados ficam só no repositório privado de dados (app/fichas_tecnicas.json).
 */
import { chave } from "../dados/texto";

export interface DadoTecnico { grupo: string; parametro: string; valor: string | number | null; unidade: string | null; fonte: string; confianca: string }
export interface MaterialFicha {
  id: string; componente_id?: string; descricao: string; especificacao?: string | null; qtd_planilha?: number | null; qtd_orcamento?: number | null;
  codigo_sap: string | number | null; descricao_sap?: string | null; situacao_almox: string; origem: string; confianca_vinculo_sap?: string | null;
  sistema?: string | null; preco_unit_brl?: number | null;
}
export interface AtividadeFicha {
  id: string; tipo: string; sistema: string; periodicidade: string | null; periodicidade_dias: number | null; descricao: string; referencia: string;
  origem: string; material_ids: string[]; observacao?: string | null;
}
export interface FichaTecnica {
  ativo: { id_ativo: string; nome: string; tipo?: string; fabricante?: string; modelo?: string; observacao_identificacao?: string | null };
  dados_tecnicos: DadoTecnico[];
  materiais: MaterialFicha[];
  atividades: AtividadeFicha[];
  alertas_qualidade: string[];
  resumo?: Record<string, number>;
}

/** Em que equipamento do SAP a ficha vale: injetoras Golden Eagle UGB1 (modelo GEL180/S); o PVC fica de fora. */
export function modeloDoEquipamento(denominacao: string, inativo = false): string | null {
  if (inativo) return null;
  return /^INJETORA \d+ UGB1 GOLDEN EAGLE$/.test(chave(denominacao)) ? "GEL180S" : null;
}

const ORDEM_PER = ["Diária", "Semanal", "Mensal", "Trimestral", "Semestral", "Anual"];

/** Atividades preventivas por periodicidade (da mais curta para a mais longa); condicionais e sob demanda ficam à parte. */
export function atividadesPorPeriodicidade(f: FichaTecnica): { periodicidade: string; dias: number | null; atividades: AtividadeFicha[] }[] {
  const prev = f.atividades.filter((a) => a.tipo === "PREVENTIVA");
  const m = new Map<string, AtividadeFicha[]>();
  for (const a of prev) (m.get(a.periodicidade ?? "A definir") ?? m.set(a.periodicidade ?? "A definir", []).get(a.periodicidade ?? "A definir")!).push(a);
  return [...m].map(([periodicidade, atividades]) => ({ periodicidade, dias: atividades[0].periodicidade_dias, atividades }))
    .sort((a, b) => (a.dias ?? 1e9) - (b.dias ?? 1e9) || ORDEM_PER.indexOf(a.periodicidade) - ORDEM_PER.indexOf(b.periodicidade));
}

const codigoSap = (m: MaterialFicha) => (m.codigo_sap == null ? "" : String(m.codigo_sap).trim().replace(/^0+(?=\d)/, ""));

/** Materiais com código SAP e sem (a cadastrar no Sysmat), nesta ordem de uso. */
export function materiaisPorCodigo(f: FichaTecnica): { comCodigo: MaterialFicha[]; semCodigo: MaterialFicha[] } {
  const comCodigo = f.materiais.filter((m) => codigoSap(m));
  return { comCodigo, semCodigo: f.materiais.filter((m) => !codigoSap(m)) };
}

export { codigoSap };

/** Cada material → as atividades que o usam (índice inverso). */
export function atividadesDoMaterial(f: FichaTecnica): Map<string, AtividadeFicha[]> {
  const m = new Map<string, AtividadeFicha[]>();
  for (const a of f.atividades) for (const id of a.material_ids ?? []) (m.get(id) ?? m.set(id, []).get(id)!).push(a);
  return m;
}
