"use server";

import { revalidatePath } from "next/cache";

import { soEstoque, veInteira } from "@/lib/auth/acesso";
import { autorizar } from "@/lib/auth/sessao";
import { gravarCadastroLote, lerCadastro } from "@/lib/dados/cadastros";
import { contexto } from "@/lib/wcm/contexto";
import { bases } from "@/lib/wcm/dados";

import { infoCad, inventarioAtivos, materiaisDe } from "../equipamentos/dados";
import { incluirPecas, NIVEIS, porAtivo, type Nivel } from "./alocacao";
import { baseMateriais, camposDosAtivos, sugestoesAlocacao } from "./dados";
import { aplicarPecas, limparCodigos, MAX_PECAS, procurar, type PecaMro } from "./logica";

/**
 * Escrita da Gestão de MRO: só o campo `materiais` do `cadastro_equipamentos.json` (o mesmo que a aba Equipamentos
 * edita), relido na hora da gravação. Editor ou administrador que vê a aba (terceiros só consultam).
 */
const ARQ = "cadastro_equipamentos.json";

async function quemEdita() {
  const u = await autorizar("mro", true);
  return u && veInteira(u, "mro") && !soEstoque(u) ? u : null;
}

/** Busca na MB52 e no catálogo Sysmat para vincular (até 60 itens). */
export async function buscarMateriaisMro(q: string): Promise<{ itens: PecaMro[]; total: number; semBase: boolean }> {
  if (!(await quemEdita())) return { itens: [], total: 0, semBase: false };
  const [b, cadMat] = await Promise.all([baseMateriais(), lerCadastro("cadastro_materiais.json")]);
  if (!b.est && !b.cat) return { itens: [], total: 0, semBase: true };
  return { ...procurar(b, cadMat, q), semBase: false };
}

/** Vincula e/ou desvincula peças de um ativo da lista de equipamentos. */
export async function alterarPecas(tag: string, adicionar: string[], remover: string[]): Promise<{ erro: string } | { ok: true }> {
  const u = await quemEdita();
  if (!u) return { erro: "Seu acesso não permite alterar as peças dos ativos (só editor ou administrador)." };
  const t = String(tag ?? "").trim().toUpperCase().slice(0, 60);
  const add = limparCodigos(adicionar).slice(0, MAX_PECAS), rem = limparCodigos(remover);
  if (!t) return { erro: "Equipamento inválido." };
  if (!add.length && !rem.length) return { erro: "Nenhuma peça informada." };
  const [b, cad] = await Promise.all([bases(), lerCadastro(ARQ, { fresco: true })]); // o cadastro de agora
  const noSap = !!b.equipamentos.dados?.some((x) => x.equipamento === t) || !!b.ordens.dados?.some((o) => o.equipChave === t);
  if (!cad[t] && !noSap) return { erro: `O equipamento ${t} não está na lista de equipamentos (IH08, IW38 ou cadastro do site).` };
  try {
    // a lista final é calculada sobre o item relido dentro da gravação condicional: edições ao mesmo tempo não se perdem
    await gravarCadastroLote(ARQ, { [t]: (atual) => aplicarPecas(atual, add, rem) }, u.nome || u.login);
  } catch (e) {
    return { erro: (e as Error).message };
  }
  for (const r of ["/mro", "/equipamentos", "/estoque", "/painel"]) revalidatePath(r);
  return { ok: true };
}

// ----------------------------------------------------------------------------
// Alocação automática (pelo texto) — em lote, com desfazer da última
// ----------------------------------------------------------------------------
const ARQ_LOG = "alocacao_automatica.json";
const MAX_LOTE = 20_000;
type Resultado = { ok: true; pares: number; ativos: number; foraDoLimite: number; restantes: number; aviso?: string };

/** Vincula de uma vez todas as sugestões dos níveis escolhidos (recalculadas aqui, no servidor). */
export async function alocarAutomatico(niveis: Nivel[]): Promise<{ erro: string } | Resultado> {
  const u = await quemEdita();
  if (!u) return { erro: "Seu acesso não permite alterar as peças dos ativos (só editor ou administrador)." };
  const ns = Array.isArray(niveis) ? NIVEIS.filter((n) => n !== "baixa" && niveis.includes(n)) : []; // baixa só uma a uma
  if (!ns.length) return { erro: "Escolha o nível de confiança." };
  const c = await contexto({});
  const [inv, bm, campos] = await Promise.all([inventarioAtivos(c), baseMateriais(), camposDosAtivos(c)]);
  const todas = (await sugestoesAlocacao(c, inv, bm, campos, (k) => new Set(materiaisDe(infoCad(c, k))))).filter((s) => ns.includes(s.nivel));
  const escolhidas = todas.slice(0, MAX_LOTE);
  if (!escolhidas.length) return { erro: "Nenhuma sugestão nesses níveis." };
  const grupos = porAtivo(escolhidas);
  // o que entrou de fato em cada ativo (recalculado a cada nova tentativa da gravação): é só isso que o desfazer tira
  const incluidos: Record<string, string[]> = {};
  let foraDoLimite = 0;
  const fora: Record<string, number> = {};
  const por = u.nome || u.login;
  try {
    await gravarCadastroLote(ARQ, Object.fromEntries([...grupos].map(([t, mats]) => [t, (atual: Record<string, unknown> | undefined) => {
      const r = incluirPecas(atual, mats);
      if (r.incluidos.length) incluidos[t] = r.incluidos; else delete incluidos[t];
      fora[t] = r.foraDoLimite;
      return r.item;
    }])), por);
  } catch (e) {
    return { erro: (e as Error).message };
  }
  foraDoLimite = Object.values(fora).reduce((a, b) => a + b, 0);
  const pares = Object.values(incluidos).reduce((a, b) => a + b.length, 0);
  for (const r of ["/mro", "/equipamentos", "/estoque", "/painel"]) revalidatePath(r);
  const resultado: Resultado = { ok: true, pares, ativos: Object.keys(incluidos).length, foraDoLimite, restantes: todas.length - escolhidas.length };
  if (!pares) return resultado;
  try {
    // registro compacto (ativo → materiais) para o desfazer; substitui o da execução anterior
    await gravarCadastroLote(ARQ_LOG, { ultima: { em: new Date().toISOString(), por, niveis: ns, pares, vinculos: incluidos } }, por);
  } catch (e) {
    // sem o registro novo, o antigo não pode ficar: o Desfazer tiraria os vínculos da execução anterior
    await gravarCadastroLote(ARQ_LOG, { ultima: null }, por).catch(() => undefined);
    resultado.aviso = `Os vínculos foram gravados, mas o registro para desfazer falhou (${(e as Error).message}). Se precisar, retire pela aba Por ativo.`;
  }
  return resultado;
}

/** Desfaz a última alocação automática (tira só os vínculos que ela pôs). */
export async function desfazerAlocacao(): Promise<{ erro: string } | { ok: true; pares: number }> {
  const u = await quemEdita();
  if (!u) return { erro: "Seu acesso não permite alterar as peças dos ativos (só editor ou administrador)." };
  const ultima = (await lerCadastro(ARQ_LOG, { fresco: true })).ultima as { em?: unknown; vinculos?: unknown } | null | undefined;
  const v = ultima?.vinculos && typeof ultima.vinculos === "object" ? ultima.vinculos as Record<string, unknown> : {};
  const grupos = new Map(Object.entries(v).map(([t, mats]) => [t, limparCodigos(mats)] as const).filter(([t, mats]) => t && mats.length));
  if (!grupos.size) return { erro: "Não há alocação automática para desfazer." };
  const tirados: Record<string, number> = {}; // o que saiu de fato (recalculado a cada nova tentativa da gravação)
  const por = u.nome || u.login;
  try {
    await gravarCadastroLote(ARQ, Object.fromEntries([...grupos].map(([t, mats]) => [t, (atual: Record<string, unknown> | undefined) => {
      tirados[t] = atual ? limparCodigos(atual.materiais).filter((m) => mats.includes(m)).length : 0;
      return tirados[t] ? aplicarPecas(atual, [], mats) : undefined;
    }])), por);
    // apaga o registro só se ainda for o desta execução (outra alocação no meio do caminho continua desfazível)
    await gravarCadastroLote(ARQ_LOG, { ultima: (a) => (a && a.em === ultima?.em ? null : undefined) }, por);
  } catch (e) {
    return { erro: (e as Error).message };
  }
  for (const r of ["/mro", "/equipamentos", "/estoque", "/painel"]) revalidatePath(r);
  return { ok: true, pares: Object.values(tirados).reduce((a, b) => a + b, 0) };
}
