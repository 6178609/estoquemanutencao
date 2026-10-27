import "server-only";

import { DESTINO } from "../leitura/tipos";
import { prepararMateriaisOperacoes, type MaterialOperacao } from "../wcm/materiaisOperacoes";
import { lerBase, type Base } from "./bases";
import { fonte } from "./fonte";

/** Demonstração: um material fictício na 1ª lista fictícia (90000/1, operação de rolamentos). */
const DEMO = [{ "Máquina": "PRENSA DEMO", "Lista de tarefas": "90000", "Contador": "1", "Operação": "0010", "Atividade (troca)": "Trocar os rolamentos",
  "Frequência": "12 Meses", "Tipo": "Mandatória", "Material": "Rolamento rígido de esferas (fictício)", "Informações técnicas": "6204-2Z", "Qtd.": "2",
  "UM": "PC", "Cód. SAP": "902009", "Texto SAP": "ROLAMENTO RIGIDO ESFER RO-4348", "Observação": "Dado fictício da demonstração." }];

/** O levantamento dos materiais das operações (enviado em Fontes de dados); vazio se não houver. */
export async function materiaisOperacoes(): Promise<Base<MaterialOperacao[]>> {
  if (!fonte()) return { dados: prepararMateriaisOperacoes(DEMO), atualizado: null, origem: "demonstração" };
  return lerBase(DESTINO.materiais_operacoes, prepararMateriaisOperacoes);
}
