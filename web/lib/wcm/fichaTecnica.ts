/**
 * Ficha técnica de um modelo de máquina (levantada dos manuais e planilhas de spare parts): dados técnicos, componentes,
 * materiais (com código SAP e situação no almoxarifado) e atividades por periodicidade. Funções puras, testadas em
 * testes/fichaTecnica.test.ts. Os dados ficam só no repositório privado de dados (app/fichas_tecnicas.json).
 */
import { chave } from "../dados/texto";

export interface DadoTecnico { grupo: string; parametro: string; valor: string | number | null; unidade: string | null; fonte: string; confianca: string }
export interface MaterialFicha {
  id: string; descricao: string; especificacao: string | null; um: string;
  /** quantidade na máquina (manual ou planilha de spare parts) */
  qtd: number | string | null;
  codigo_sap: string | number | null; texto_sap: string | null; status_cadastro: string | null; situacao: string | null; origem: string | null;
  uso: string | null; observacao: string | null;
  /** o levantamento mandou tirar este material do plano de manutenção */
  retirar_do_plano: boolean; motivo_retirada: string | null;
}
export interface AtividadeFicha {
  id: string; tipo: string; sistema: string; periodicidade: string | null; periodicidade_dias: number | null; periodicidade_horas: number | null;
  descricao: string; lista_tarefas: string | null; contador: string | null; operacao: string | null; descricao_lista: string | null;
  referencia: string | null; material_ids: string[]; observacao: string | null;
}
export interface PontoValidar { item: string; ponto: string; onde: string | null; acao: string | null; prioridade: string | null; codigo_sap: string | null }
export interface FichaTecnica {
  ativo: { id_ativo: string; nome: string; tipo?: string; fabricante?: string | null; modelo?: string | null; listas_tarefas?: string | null; observacao_identificacao?: string | null };
  dados_tecnicos: DadoTecnico[];
  materiais: MaterialFicha[];
  atividades: AtividadeFicha[];
  /** pontos a validar: texto simples ou, nas fichas novas, item + ponto + onde + ação + prioridade */
  pontos: PontoValidar[];
}

const txt = (v: unknown) => (v == null ? null : String(v).trim() || null);
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);

/** Aceita as fichas nos dois formatos (spare parts do robô/GEL180S e as fichas por equipamento) e entrega um só. */
export function normalizarFicha(bruta: Record<string, unknown>): FichaTecnica {
  const lista = (k: string) => (Array.isArray(bruta[k]) ? (bruta[k] as Record<string, unknown>[]) : []);
  const materiais = lista("materiais").map((m): MaterialFicha => ({
    id: String(m.id), descricao: String(m.descricao ?? ""), especificacao: txt(m.especificacao), um: txt(m.um) ?? "PC",
    qtd: (m.qtd_na_maquina ?? m.qtd_planilha ?? m.qtd_orcamento ?? null) as number | string | null,
    codigo_sap: (m.codigo_sap ?? null) as string | number | null, texto_sap: txt(m.texto_sap ?? m.descricao_sap), status_cadastro: txt(m.status_cadastro),
    situacao: txt(m.situacao_vinculo ?? m.situacao_almox), origem: txt(m.origem ?? m.fonte ?? m.desenho), uso: txt(m.uso), observacao: txt(m.observacao),
    retirar_do_plano: m.retirar_do_plano === true, motivo_retirada: txt(m.motivo_retirada),
  }));
  const atividades = lista("atividades").map((a): AtividadeFicha => ({
    id: String(a.id), tipo: String(a.tipo ?? ""), sistema: String(a.sistema ?? a.especialidade ?? ""), periodicidade: txt(a.periodicidade), periodicidade_dias: num(a.periodicidade_dias),
    periodicidade_horas: num(a.periodicidade_horas), descricao: String(a.descricao ?? ""), lista_tarefas: txt(a.lista_tarefas), contador: txt(a.contador),
    operacao: txt(a.operacao), descricao_lista: txt(a.descricao_lista), referencia: txt(a.referencia), observacao: txt(a.observacao),
    material_ids: Array.isArray(a.material_ids) ? a.material_ids.map(String) : [],
  }));
  const pontos: PontoValidar[] = [
    ...(Array.isArray(bruta.alertas_qualidade) ? (bruta.alertas_qualidade as unknown[]).map((t) => ({ item: "", ponto: String(t), onde: null, acao: null, prioridade: null, codigo_sap: null })) : []),
    ...lista("pontos_a_validar").map((p) => ({ item: String(p.item ?? ""), ponto: String(p.ponto ?? ""), onde: txt(p.onde), acao: txt(p.acao_sugerida),
      prioridade: txt(p.prioridade), codigo_sap: txt(p.codigo_sap) })),
  ];
  return { ativo: (bruta.ativo ?? { id_ativo: "", nome: "" }) as FichaTecnica["ativo"], dados_tecnicos: lista("dados_tecnicos") as unknown as DadoTecnico[], materiais, atividades, pontos };
}

/**
 * Em que equipamento do SAP cada ficha vale: o modelo (id da ficha) pela denominação. Injetoras PVC (Golden Eagle) ficam de fora;
 * o robô GERS4-900I não tem equipamento ligado.
 */
export function modeloDoEquipamento(denominacao: string, inativo = false): string | null {
  if (inativo) return null;
  const d = chave(denominacao);
  if (/^INJETORA \d+ UGB1 GOLDEN EAGLE$/.test(d)) return "GEL180S";
  if (/^BANBURY SF \d+ UGB1 BONFANTI$/.test(d)) return "BMI-80T";
  if (/^INJETORA EXP 09 10 EST/.test(d)) return "EXP09";
  if (/^PRENSA COPE \d+ PHB 450$/.test(d)) return "PHB-450";
  if (/^PAN STONE \d+ JOB/.test(d)) return "S-950-A-PCD";
  return null;
}

/** Atividade de rotina/troca prevista (não condicional nem corretiva sob demanda). */
export const ehPrevista = (a: AtividadeFicha) => !/CONDICIONAL|CORRETIVA/i.test(a.tipo);

/** Tamanho da periodicidade em dias, para ordenar (horas ≈ 1 h = 1/16 de dia útil de operação: só para ordenar). */
const dias = (a: AtividadeFicha) => a.periodicidade_dias ?? (a.periodicidade_horas != null ? a.periodicidade_horas / 16 : null);

/** Atividades previstas por periodicidade (da mais curta para a mais longa); condicionais e sob demanda ficam à parte. */
export function atividadesPorPeriodicidade(f: FichaTecnica): { periodicidade: string; dias: number | null; atividades: AtividadeFicha[] }[] {
  const m = new Map<string, AtividadeFicha[]>();
  for (const a of f.atividades.filter(ehPrevista)) {
    const k = a.periodicidade ?? "A definir";
    (m.get(k) ?? m.set(k, []).get(k)!).push(a);
  }
  return [...m].map(([periodicidade, atividades]) => ({ periodicidade, dias: dias(atividades[0]), atividades }))
    .sort((a, b) => (a.dias ?? 1e9) - (b.dias ?? 1e9) || a.periodicidade.localeCompare(b.periodicidade));
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
