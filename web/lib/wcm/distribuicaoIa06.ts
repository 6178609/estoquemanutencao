/**
 * Distribuição automática das peças de um ativo nas listas de tarefas e operações do SAP (carga da IA06): cada peça vai
 * para a lista do subconjunto onde está vinculada (o vínculo das peças conferidas no manual já é por subconjunto) e,
 * dentro da lista, para a operação cujo texto combina com ela (troca do mesmo tipo de peça, o mesmo assunto, ou a
 * operação que cita a peça). O que não combina fica sem operação, para a pessoa escolher. Testado em
 * testes/distribuicaoIa06.test.ts.
 */
import { chave } from "../dados/texto";
import { chaveLista, ehTroca, temasDoTexto, tipoDaPeca, trocaCitaTipo, type Tema } from "./listasTarefas";

export interface OperacaoOpcao { operacao: string; texto: string; textoLongo?: string }
/** Uma lista de tarefas que pode receber peças (de um equipamento: o ativo ou um subconjunto). */
export interface OpcaoLista {
  chave: string; grupo: string; numerador: string; titulo: string;
  /** equipamentos que usam a lista (mais de um = lista geral) */
  equipamentos: number;
  /** o equipamento dono da lista (o ativo ou o subconjunto) e o nome dele */
  dono: string; donoNome: string;
  /** operações da lista (texto da IA03 enviado em Fontes de dados); vazio = lista sem o texto carregado */
  operacoes: OperacaoOpcao[];
}
export interface PecaParaDistribuir { codigo: string; descricao: string; descrCompleta?: string; um: string; origem: string; conferida?: boolean }
export type Nivel = "alta" | "media" | "baixa" | "sem";
export interface Atribuicao {
  codigo: string; descricao: string; um: string; origem: string; conferida: boolean;
  /** listas possíveis para a peça (chaves), a escolhida primeiro */
  listas: string[];
  lista: string | null; operacao: string; nivel: Nivel; motivo: string;
}

export const ROTULO_NIVEL: Record<Nivel, string> = { alta: "Troca da peça", media: "Mesmo assunto", baixa: "Operação cita a peça", sem: "Escolher a operação" };

const NOME_TIPO: Record<string, string> = { ROLAMENT: "rolamento", RESISTENC: "resistência", ACOPLAMENT: "acoplamento", ANEL: "anel de vedação",
  REPARO: "kit de reparo", LONA: "lona/pastilha", CABO: "cabo de aço", OLEO: "óleo", LAMPADA: "lâmpada", VALVULA: "válvula", FUSIVEL: "fusível", RELE: "relé" };

// o que se calcula uma vez por texto de operação e por peça (o cruzamento de todos os materiais passa por milhões de pares)
const memoTexto = new Map<string, { t: string; troca: boolean; temas: Tema[] }>();
const memoPeca = new Map<string, { tipo: string | null; nome: string; temas: Tema[] }>();
function infoTexto(texto: string) {
  let x = memoTexto.get(texto);
  if (!x) {
    if (memoTexto.size > 50_000) memoTexto.clear();
    const t = chave(texto);
    x = { t, troca: ehTroca(t), temas: temasDoTexto(texto) };
    memoTexto.set(texto, x);
  }
  return x;
}
function infoPeca(descricao: string, descrCompleta = "") {
  const k = `${descricao}\u0001${descrCompleta}`;
  let x = memoPeca.get(k);
  if (!x) {
    if (memoPeca.size > 50_000) memoPeca.clear();
    const tipo = tipoDaPeca(descricao);
    // o nome da peça para o motivo: o tipo por extenso (ROLAMENT → rolamento) ou a 1ª palavra da descrição
    const nome = tipo ? (NOME_TIPO[tipo] ?? tipo.toLowerCase()) : (descricao.trim().split(/\s+/)[0] || "peça").toLowerCase();
    x = { tipo, nome, temas: temasDoTexto(`${descricao} ${descrCompleta}`) };
    memoPeca.set(k, x);
  }
  return x;
}

/** Quanto a operação combina com a peça (3 = troca do mesmo tipo de peça, 2 = mesmo assunto, 1 = cita a peça) e por quê. */
export function pontuar(textoOperacao: string, p: { descricao: string; descrCompleta?: string }): { pontos: number; motivo: string } {
  const op = infoTexto(textoOperacao), pc = infoPeca(p.descricao, p.descrCompleta);
  if (pc.tipo && trocaCitaTipo(op.t, op.troca, pc.tipo)) return { pontos: 3, motivo: `a operação é de troca de ${pc.nome}` };
  const comum = pc.temas.find((t) => op.temas.some((o) => o.id === t.id));
  if (comum) return { pontos: op.troca ? 2.5 : 2, motivo: `mesmo assunto: ${comum.rotulo.toLowerCase()}` };
  if (pc.tipo && op.t.includes(pc.tipo)) return { pontos: 1, motivo: `a operação cita ${pc.nome}` };
  return { pontos: 0, motivo: "" };
}

/**
 * Distribui as peças. `listasDe(equip)` = listas próprias do equipamento; `cadeia(origem)` = a origem e os superiores dela
 * até o ativo; `todas` = as listas do ativo e de todos os subconjuntos (último recurso quando a cadeia não tem lista).
 */
export function distribuirPecas(pecas: PecaParaDistribuir[], listasDe: (equip: string) => OpcaoLista[], cadeia: (origem: string) => string[],
  todas: OpcaoLista[]): Atribuicao[] {
  return pecas.map((p) => {
    const daCadeia = cadeia(p.origem).flatMap((e) => listasDe(e));
    const candidatas = [...new Map([...daCadeia, ...todas].map((l) => [l.chave, l])).values()];
    const naCadeia = new Set(daCadeia.map((l) => l.chave));
    let melhor: { l: OpcaoLista; op: OperacaoOpcao; pontos: number; motivo: string } | null = null;
    for (const l of candidatas) {
      for (const op of l.operacoes) {
        const r = pontuar(`${op.texto}\n${op.textoLongo ?? ""}`, p);
        if (!r.pontos) continue;
        // a lista do próprio subconjunto (ou de um superior) vence a de outro subconjunto; lista geral perde da própria
        const pontos = r.pontos + (naCadeia.has(l.chave) ? 1 : 0) - (l.equipamentos > 1 ? 0.25 : 0);
        if (!melhor || pontos > melhor.pontos) melhor = { l, op, pontos, motivo: r.motivo + (naCadeia.has(l.chave) ? "" : " (lista de outro subconjunto)") };
      }
    }
    const base = { codigo: p.codigo, descricao: p.descricao, um: p.um, origem: p.origem, conferida: !!p.conferida };
    if (melhor) {
      const pts = melhor.pontos - (naCadeia.has(melhor.l.chave) ? 1 : 0);
      const nivel: Nivel = pts >= 2.75 && naCadeia.has(melhor.l.chave) ? "alta" : pts >= 1.75 ? "media" : "baixa";
      return { ...base, listas: [melhor.l.chave, ...candidatas.map((l) => l.chave).filter((k) => k !== melhor!.l.chave)],
        lista: melhor.l.chave, operacao: melhor.op.operacao, nivel, motivo: melhor.motivo };
    }
    // nenhuma operação combina: fica na 1ª lista do subconjunto (se houver), sem operação escolhida
    const primeira = daCadeia[0] ?? candidatas[0] ?? null;
    return { ...base, listas: candidatas.map((l) => l.chave), lista: primeira?.chave ?? null, operacao: primeira?.operacoes.length ? "" : "0010", nivel: "sem",
      motivo: !primeira ? "nenhuma lista de tarefas no ativo nem nos subconjuntos"
        : !primeira.operacoes.length ? "a lista não está no texto da IA03 enviado: confira a operação"
          : "nenhuma operação da lista combina com a peça" };
  });
}

/** Monta a opção de lista a partir da lista de tarefas (IA06) e das operações lidas do texto da IA03. */
export function opcaoLista(l: { grupo: string; numerador: string; texto: string; equipamentos: number }, dono: string, donoNome: string,
  operacoes: OperacaoOpcao[] | undefined, titulo?: string): OpcaoLista {
  return { chave: chaveLista(l.grupo, l.numerador), grupo: l.grupo, numerador: l.numerador, titulo: titulo || l.texto, equipamentos: l.equipamentos,
    dono, donoNome, operacoes: operacoes ?? [] };
}

/** Chave para remontar a tela quando a distribuição muda (peça vinculada/desvinculada, lista ou operação nova). */
export const chaveDistribuicao = (atribuicoes: Atribuicao[]) => atribuicoes.map((a) => `${a.codigo}:${a.lista}:${a.operacao}`).join("|");
