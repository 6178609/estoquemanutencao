import { chave } from "../dados/texto";
import type { Tabela } from "./leitura";
import type { Tipo } from "./tipos";

/**
 * Colunas importantes de cada base: o que o site lê delas e o que fica vazio sem elas. Serve só para AVISAR no envio
 * (Fontes de dados) — nunca bloqueia. Os padrões são os mesmos que a leitura usa (chave do cabeçalho, sem acento e em
 * maiúsculas): MB52 em lib/dados/materiais.ts (prepararMb52); IW38, IW28, IH08 e IW47 em lib/wcm/preparo.ts.
 */
interface Importante { coluna: string; padroes: RegExp[]; impacto: string }

const IMPORTANTES: Partial<Record<Tipo, Importante[]>> = {
  mb52: [
    { coluna: "Valor (valor utilização livre)", padroes: [/VALOR/], impacto: "o valor do estoque fica R$ 0 em Estoque, Custos, MRO e Busca" },
    { coluna: "Depósito", padroes: [/DEPOSITO/], impacto: "o filtro Depósito do Estoque fica vazio" },
  ],
  ih08: [
    { coluna: "Código ABC", padroes: [/CODIGO ABC/, /^ABC$/], impacto: "a criticidade dos equipamentos fica sem classe (Saúde, MRO, Custos por classe)" },
    { coluna: "Equipamento superior", padroes: [/EQUIPAMENTO SUPERIOR/], impacto: "a Biblioteca do ativo não mostra o equipamento superior" },
    { coluna: "Centro de custo", padroes: [/CENTRO CUSTO/, /CENTRO DE CUSTO/], impacto: "o centro de custo do equipamento fica “—”" },
  ],
  iw38: [
    { coluna: "Prioridade", padroes: [/PRIORIDADE/], impacto: "a prioridade das ordens fica vazia em Ordens" },
  ],
  iw28: [
    { coluna: "Tipo de nota", padroes: [/TIPO DE NOTA/], impacto: "não dá para separar as notas Y1 (quebra): quebras, MTBF, MTTR e disponibilidade ficam “—”" },
  ],
  iw47: [
    { coluna: "Unidade do trabalho real", padroes: [/UNID TRABALHO REAL/, /UNID.*TRAB/], impacto: "as horas apontadas são lidas como minutos (sem a unidade, o site supõe MIN)" },
  ],
};

/** Tipo de nota de quebra (regra da planta: nota Y1 convertida em ordem YM11). */
const NOTA_QUEBRA = "Y1";

/**
 * Avisos de colunas que faltam (e, na IW28, da falta de notas Y1) para a base lida. Lista vazia: nada a avisar.
 * Puro, sem dados da base no texto: só nomes de colunas e o impacto no site.
 */
export function avisosDeColunas(tipo: Tipo, t: Tabela): string[] {
  const ks = t.colunas.map(chave);
  const tem = (padroes: RegExp[]) => ks.some((k) => padroes.some((rx) => rx.test(k)));
  const avisos = (IMPORTANTES[tipo] ?? []).filter((c) => !tem(c.padroes)).map((c) => `Sem a coluna “${c.coluna}”: ${c.impacto}.`);
  if (tipo === "iw28") {
    const i = ks.findIndex((k) => /TIPO DE NOTA/.test(k));
    if (i >= 0 && t.linhas.length && !t.linhas.some((l) => chave(String(l[i] ?? "")) === NOTA_QUEBRA)) {
      avisos.push(`Nenhuma nota ${NOTA_QUEBRA} (quebra) no arquivo: quebras, MTBF, MTTR e disponibilidade ficam “—”. Reexporte a IW28 com o tipo ${NOTA_QUEBRA}.`);
    }
  }
  return avisos;
}
