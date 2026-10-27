/**
 * Padrão do site: todo material vinculado a um equipamento cruzado com as listas de tarefas e os manuais, e separado
 * pelo tipo técnico. Classificação e situação são puras (testes/cruzamentoMateriais.test.ts); a montagem com os dados
 * fica em app/(app)/mro/cruzamento.ts.
 */
import { chave } from "../dados/texto";
import type { Atribuicao } from "./distribuicaoIa06";

/** Tipos técnicos, na ordem de prioridade (o primeiro que casa na descrição curta; depois a categoria do Sysmat). */
export const TIPOS_TECNICOS: { tipo: string; descricao: RegExp; categoria?: RegExp }[] = [
  { tipo: "Rolamentos e mancais", descricao: /^(ROLAMENTO|MANCAL|BUCHA|CAIXA MANCAL|CONJ PINO\/BUCH)/, categoria: /ROLAMENTO|MANCA/ },
  { tipo: "Filtros", descricao: /^(FILTRO|ELEMENTO FILT|CARTUCHO FILT|CJ FILT|GRADE MAGNETICA)/ },
  { tipo: "Vedações", descricao: /^(RETENTOR|ANEL O\b|ANEL VED|ANEL RASP|O ?RING|GAXETA|JUNTA|CORDAO VED|REPARO|KIT REP|KIT VED|KIT CIL|CJ VED|SELO|CJ CARVAO|ANEL FLUT|ANEL DESGASTE|ANEL)/, categoria: /VEDACAO/ },
  { tipo: "Injeção e plastificação", descricao: /^(BICO INJ|CORPO BICO|PONTEIRA|CJ PLASTIF|CILINDR\w* CJ|ROSCA (FUSO|PAN|TRANSPORT)|AGULHA|ENCOSTO|CJ EXTRUSOR|EMBOLO|CAMISA CILINDRO|COPO VISOR|ALIMENTADOR)/ },
  { tipo: "Transmissão mecânica", descricao: /^(CORREIA|POLIA|CORRENTE|ENGRENAG|ACOPLAMENT|LUVA ACOPL|KIT ACOPLAM|PINHAO|CREMALHEIRA|REDUTOR|EIXO|CHAVETA|ROTOR|FUSO)/, categoria: /TRANSMISSAO/ },
  { tipo: "Lubrificantes e lubrificação", descricao: /^(OLEO|GRAXA|LUBRIF|BOMBA LUB|BLOCO DISTR|MANGUEIRA LUBRIF)/, categoria: /OLEOS E LUBRIFICANTES/ },
  { tipo: "Pneumática", descricao: /^(CILINDR\w* PNEU|VALVULA (SOLEN|PNEU)|FRL|FILTRO REG|ENGATE|CONEXAO|TUBO PU|TUBING|SILENCIADOR|DISTRIBUIDOR \d)/, categoria: /PNEUMATIC/ },
  { tipo: "Hidráulica", descricao: /^(VALVULA|BOMBA HIDR|CILINDR|MANGUEIRA|ATUADOR HIDR|UNIDADE (HIDR|SISTEMA)|ACUMULADOR|DISCO \d|RESERV OLEO|INDICADOR ALIV|VISOR|BLOCO UN|CALCO BLOCO)/, categoria: /HIDRAULIC/ },
  { tipo: "Refrigeração e água", descricao: /^(DISTRIBUIDOR AGUA|TROCADOR|RADIADOR|UNIAO ROTATIVA|BANCADA RSFR|VENTILADOR|TORRE|TUBO SUCCAO)/ },
  { tipo: "Aquecimento", descricao: /^(RESISTENC|AQUECEDOR|TERMOPAR|TERMORRESIST|TERMORESIST)/ },
  { tipo: "Sensores e instrumentação", descricao: /^(SENSOR|TRANSDUTOR|TRANSMISSOR|PRESSOSTATO|TERMOSTATO|CHAVE (NIVEL|FIM)|FIM DE CURSO|MANOMETRO|ENCODER|REGUA|VOLTIMETRO|AMPERIMETRO|INTERRUPTOR MICRO)/, categoria: /MEDICAO E CONTROLE/ },
  { tipo: "Automação e comando", descricao: /^(CLP|CONTROLADOR|CONTROLE|IHM|INTERFACE|MODULO|PLACA|CARTAO|FONTE)/ },
  { tipo: "Elétrica e acionamento", descricao: /^(CONTATOR|DISJUNTOR|RELE|FUSIVEL|MOTOR|SERVO|INVERSOR|DRIVE|CABO|TERMINAL|BORNE|CHAVE|BOTAO|SINALEIRO|LAMPADA|TOMADA|PLUGUE|CONECTOR|RESISTOR|INTERRUPTOR)/, categoria: /ELETRIC|ILUMINACAO|ELETRONIC/ },
  { tipo: "Robô e garras", descricao: /^(GARRA|ROBO|ACOPLADOR GARRA|ARTICULACAO GARRA)/ },
  { tipo: "Estrutura, guias e proteções", descricao: /^(PROTECAO|GUIA|GRADE|SUPORTE|TRAVA|BASE|COLUNA|HASTE|ARTICULACAO|BRACO|MESA|PORTA|DOBRADICA|BATENTE|BARRA|PLATO|FIXADOR|CABECOTE|TAMPA|MOLA|FACA|SAPATA|IMA)/ },
  { tipo: "Fixação", descricao: /^(PARAFUSO|PORCA|ARRUELA|PINO|PRISIONEIRO|REBITE|GRAMPO|ABRACADEIRA)/, categoria: /FIXACAO/ },
];
export const OUTRO_TIPO = "Outros componentes";

export function tipoTecnico(descricaoCurta: string, categoria = ""): string {
  const d = chave(descricaoCurta), c = chave(categoria);
  for (const t of TIPOS_TECNICOS) if (t.descricao.test(d)) return t.tipo;
  for (const t of TIPOS_TECNICOS) if (t.categoria && c && t.categoria.test(c)) return t.tipo;
  return OUTRO_TIPO;
}

/** De onde vem o vínculo do material ao equipamento: conferido no manual do fabricante, modelo no Sysmat ou sem confirmação. */
export type OrigemManual = "manual" | "modelo" | "sem";
export const ROTULO_MANUAL: Record<OrigemManual, string> = { manual: "Conferida no manual", modelo: "Pelo modelo no Sysmat", sem: "Sem confirmação" };

export function origemManual(conferida: boolean, descrCompleta: string): OrigemManual {
  if (conferida) return "manual";
  const m = /MODELO:\s*([^;]+)/i.exec(descrCompleta ?? "");
  return m && !/^\**$/.test(m[1].trim()) ? "modelo" : "sem";
}

/** Situação do material na lista de tarefas do equipamento. */
export type SituacaoLista = "na-lista" | "sugerida" | "sem-operacao" | "escolher" | "sem-lista";
export const ROTULO_SITUACAO: Record<SituacaoLista, string> = {
  "na-lista": "Já na lista (SAP)", sugerida: "Sugerida: falta incluir (IA06)", "sem-operacao": "Lista sem operações (falta IA03)",
  escolher: "Escolher a operação", "sem-lista": "Sem lista de tarefas",
};

/**
 * A situação a partir da distribuição: componente de alguma lista do equipamento no SAP (texto da IA03) → já na lista;
 * operação achada → sugerida; lista sem o texto da IA03 → sem operações; lista com operações mas nada combina → escolher.
 */
export function situacaoLista(a: Atribuicao, temOperacoes: (lista: string) => boolean, naListaSap: string | null): SituacaoLista {
  if (naListaSap) return "na-lista";
  if (!a.lista) return "sem-lista";
  if (a.nivel !== "sem") return "sugerida";
  return temOperacoes(a.lista) ? "escolher" : "sem-operacao";
}

export interface LinhaCruzamento {
  codigo: string; descricao: string; tipo: string; manual: OrigemManual;
  /** equipamento onde o material está vinculado e a máquina (raiz) dele */
  equipamento: string; raiz: string;
  /** lista escolhida (grupo|numerador) e operação; quando já está na lista do SAP, a lista/operação do componente */
  lista: string | null; operacao: string; situacao: SituacaoLista; nivel: Atribuicao["nivel"]; motivo: string;
  estoque: number | null; statusEstoque: "ok" | "baixo" | "zerado" | "ausente"; um: string;
}
