/**
 * Materiais das operações (levantamento dos manuais e desenhos de cada máquina, planilha "Lista de materiais das máquinas
 * por lista de tarefa"): para cada lista de tarefas e operação de troca, o material, a quantidade e o código SAP. É a
 * fonte mais forte para pôr a peça na operação certa da IA06. Funções puras, testadas em testes/materiaisOperacoes.test.ts.
 */
import { chave } from "../dados/texto";
import type { Atribuicao } from "./distribuicaoIa06";
import { chaveLista, numBr } from "./listasTarefas";

type Crua = Record<string, unknown>;

export interface MaterialOperacao {
  maquina: string;
  /** grupo|numerador (sem contador, a lista é a de numerador 1) */
  lista: string; grupo: string; numerador: string; operacao: string;
  atividade: string; frequencia: string; tipo: string;
  /** o que o manual chama a peça e os dados técnicos dela */
  material: string; informacoes: string;
  quantidade: number | null; um: string;
  /** código SAP (sem zeros à esquerda; vazio = a peça ainda não tem código) */
  codigo: string; textoSap: string; situacaoCodigo: string; naListaSap: string; observacao: string;
}

const txt = (v: unknown) => (v == null ? "" : String(v)).trim();

/** Linhas da planilha → materiais por operação (as linhas sem lista ou sem operação ficam de fora). */
export function prepararMateriaisOperacoes(linhas: Crua[]): MaterialOperacao[] {
  const out: MaterialOperacao[] = [];
  for (const r of linhas) {
    const v = new Map(Object.entries(r).map(([k, x]) => [chave(k), txt(x)]));
    const g = (...ks: string[]) => { for (const k of ks) { const x = v.get(k); if (x) return x; } return ""; };
    const grupo = g("LISTA DE TAREFAS", "GRUPO LISTA TAREFAS"), op = g("OPERACAO");
    if (!grupo || !/^\d{1,4}$/.test(op)) continue;
    const numerador = g("CONTADOR", "NUMERADOR") || "1";
    const codigo = g("COD SAP", "CODIGO SAP").replace(/\.0$/, "").replace(/^0+(?=\d)/, "");
    out.push({
      maquina: g("MAQUINA"), lista: chaveLista(grupo, numerador), grupo, numerador, operacao: op.padStart(4, "0"),
      atividade: g("ATIVIDADE TROCA", "ATIVIDADE"), frequencia: g("FREQUENCIA"), tipo: g("TIPO"),
      material: g("MATERIAL"), informacoes: g("INFORMACOES TECNICAS"), quantidade: numBr(g("QTD", "QUANTIDADE")), um: g("UM"),
      codigo: /^\d+$/.test(codigo) ? codigo : "", textoSap: g("TEXTO SAP"), situacaoCodigo: g("SITUACAO DO CODIGO"),
      naListaSap: g("NA LISTA DO SAP"), observacao: g("OBSERVACAO"),
    });
  }
  return out;
}

/** Índice lista → operação → materiais. */
export function porListaOperacao(itens: MaterialOperacao[]): Map<string, Map<string, MaterialOperacao[]>> {
  const m = new Map<string, Map<string, MaterialOperacao[]>>();
  for (const x of itens) {
    const ops = m.get(x.lista) ?? m.set(x.lista, new Map()).get(x.lista)!;
    (ops.get(x.operacao) ?? ops.set(x.operacao, []).get(x.operacao)!).push(x);
  }
  return m;
}

const semZeros = (c: string) => String(c).trim().replace(/^0+(?=\d)/, "");

/**
 * Põe na operação do levantamento as peças que ele cita (entre as listas possíveis da peça): nível alta, conferida no
 * manual, com a quantidade do levantamento. As demais seguem a distribuição automática.
 */
export function aplicarLevantamento(atribs: Atribuicao[], porCodigo: Map<string, MaterialOperacao[]>): Atribuicao[] {
  return atribs.map((a) => {
    const lev = porCodigo.get(semZeros(a.codigo));
    if (!lev?.length) return a;
    const possiveis = new Set(a.listas);
    const x = lev.find((l) => l.lista === a.lista) ?? lev.find((l) => possiveis.has(l.lista));
    if (!x) return a;
    return { ...a, lista: x.lista, listas: [x.lista, ...a.listas.filter((k) => k !== x.lista)], operacao: x.operacao, nivel: "alta", conferida: true,
      quantidade: x.quantidade ?? a.quantidade, motivo: `levantamento dos manuais: ${x.material}${x.atividade ? ` (${x.atividade.replace(/\s+/g, " ").slice(0, 80)})` : ""}` };
  });
}

/** Códigos do levantamento → onde entram (o mesmo código pode entrar em mais de uma lista/operação). */
export function indicePorCodigo(itens: MaterialOperacao[]): Map<string, MaterialOperacao[]> {
  const m = new Map<string, MaterialOperacao[]>();
  for (const x of itens) if (x.codigo) (m.get(x.codigo) ?? m.set(x.codigo, []).get(x.codigo)!).push(x);
  return m;
}

/**
 * Os materiais com código SAP que o levantamento põe nas listas do ativo e que ainda não estão vinculados a ele: entram na
 * carga da IA06 já com a lista e a operação (uma vez cada código, na primeira lista em que aparece).
 */
export function faltantesDoLevantamento(itens: MaterialOperacao[], listas: { chave: string; dono: string }[], ja: Set<string>,
  peca: (codigo: string) => { descricao: string; um: string }): Atribuicao[] {
  const out: Atribuicao[] = [];
  const vistos = new Set([...ja].map(semZeros));
  const chaves = listas.map((l) => l.chave);
  const doLev = porListaOperacao(itens);
  for (const l of listas) for (const [, mats] of doLev.get(l.chave) ?? []) for (const x of mats) {
    if (!x.codigo || vistos.has(x.codigo)) continue;
    vistos.add(x.codigo);
    const p = peca(x.codigo);
    out.push({ codigo: x.codigo, descricao: p.descricao || x.textoSap || x.material, um: p.um || x.um, origem: l.dono, conferida: true,
      listas: [l.chave, ...chaves.filter((k) => k !== l.chave)], lista: l.chave, operacao: x.operacao, nivel: "alta", quantidade: x.quantidade,
      motivo: `levantamento dos manuais: ${x.material} (ainda não vinculada ao equipamento)` });
  }
  return out;
}
