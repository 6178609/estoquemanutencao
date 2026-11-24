import "server-only";

import { aplicarPecas } from "@/app/(app)/mro/logica";

import { registrar } from "../auditoria";
import { podeVer, type Usuario } from "../auth/acesso";
import { catalogo, estoque, lerBase } from "../dados/bases";
import { gravarCadastroLote, lerCadastro } from "../dados/cadastros";
import { consumoMateriais } from "../dados/consumo";
import { fonte, FonteErro } from "../dados/fonte";
import { DESTINO } from "../leitura/tipos";
import { AF_CANCELADA, prepararAfs } from "../wcm/af";
import { bases } from "../wcm/dados";
import { marcarQuebras, type Nota, type Ordem, prepararEquipamentos, prepararIw38, prepararNotas, regraQuebra, TIPO_ORDEM_QUEBRA, tiposPorOrdem } from "../wcm/preparo";
import { dia, hoje, partes } from "../wcm/util";
import { comListasDosSubconjuntos, identificarAtivo, listasDiretasDaIp19, listasPorEquipamento, listasPorPlano, type ListaTarefas } from "@/app/(app)/mro/ia06";

import { consumoDemo, quebrasDemo } from "./demo";
import {
  ARQ_LISTAS, ARQ_OPERACOES, chaveAssociacao, chaveLista, type CodigoConfirmado, codigosConfirmadosDe, type Confirmada, confirmadasDe, itemLista, type LinhaOperacao, type ListaSap,
  listasDasLigadas, listasDe, linhasOperacoes,
  MAX_LISTAS, type OperacaoDaMaquina, operacoesDasListas, sanitizarLista,
} from "./listasTarefas";
import {
  abasFaltando, type Achado, codigoDoComponente, pecasPorDescricao, ARQ_CONFERIDOS, ARQ_INDICE, arquivoLedger, type BaseCodigos, type Capa, type Consumido, type Conteudo, conteudoDe, type EntradaPente, idPara,
  idValido, type Indice, indexarBase, indiceDe, itemIndice, ledgerDoMesmoNome, limparEquipamentos, mesmoConteudo, MAX_LINHAS, nomeDoArquivo, penteFino, sanitizarConteudo, type PlanoSap, podeGravar, type Quebra, semZeros, txt,
} from "./regras";

/**
 * Leitura e gravação do Machine Ledger (regras em ./regras.ts). Índice em machine_ledger.json, conteúdo em
 * machine_ledger/<id>.json, conferidos em machine_ledger_conferidos.json; vínculos de peças em cadastro_equipamentos.json
 * pelo mesmo caminho da Gestão de MRO (`aplicarPecas` + gravarCadastroLote, relido na hora). Bases do SAP só pelo lerBase
 * (com cache), sem montar bases() inteiro; na demonstração, as bases fictícias.
 */
const ARQ_EQUIP = "cadastro_equipamentos.json";
const ABA = "machine_ledger";
type Quem = Usuario & { nome?: string };

export const podeGravarMl = (u: Quem | null) => podeGravar(u, podeVer(u, ABA));
const por = (u: Quem) => u.nome || u.login;

export async function lerIndice(fresco = false): Promise<Indice[]> {
  return indiceDe(await lerCadastro(ARQ_INDICE, { fresco }));
}
export async function lerConteudo(id: string): Promise<Conteudo> {
  return idValido(id) ? conteudoDe(await lerCadastro(arquivoLedger(id))) : { componentes: [], plano: [], pecas: [] };
}
/** Todos os ledgers com o conteúdo (pente fino e cruzamentos). Cada arquivo com o cache por versão de lerCadastro. */
export async function lerTodos(indice?: Indice[]): Promise<EntradaPente[]> {
  const idx = indice ?? (await lerIndice());
  const cont = await Promise.all(idx.map((i) => lerConteudo(i.id)));
  return idx.map((indice, k) => ({ indice, conteudo: cont[k] }));
}
export async function lerConferidos(fresco = false): Promise<Map<string, { por: string; em: string }>> {
  const c = await lerCadastro(ARQ_CONFERIDOS, { fresco });
  return new Map(Object.entries(c).map(([k, v]) => [k, { por: txt(v?.por, 80), em: txt(v?.em, 40) }]));
}

// ----------------------------------------------------------------------------
// Bases (com os mapas guardados presos aos arrays do cache de lerBase)
// ----------------------------------------------------------------------------
const memo = new WeakMap<object, WeakMap<object, BaseCodigos>>();
const SEM: object = {};
export async function baseCodigos(): Promise<BaseCodigos> {
  const [c, e] = await Promise.all([catalogo().catch(() => null), estoque().catch(() => null)]);
  const kc = (c?.dados ?? SEM) as object, ke = (e?.dados ?? SEM) as object;
  const m = memo.get(kc) ?? new WeakMap<object, BaseCodigos>();
  memo.set(kc, m);
  let b = m.get(ke);
  if (!b) { b = indexarBase(c?.dados ?? null, e?.dados ?? null); m.set(ke, b); }
  return b;
}

/** Materiais vinculados de cada ativo (cadastro_equipamentos.json, campo `materiais`). */
export async function vinculos(): Promise<(ativo: string) => string[]> {
  const cad = await lerCadastro(ARQ_EQUIP);
  const porChave = new Map(Object.entries(cad).map(([k, v]) => [semZeros(k), Array.isArray(v?.materiais) ? (v.materiais as unknown[]).map(String) : []]));
  return (a) => porChave.get(semZeros(a)) ?? [];
}

/** Equipamentos do IH08 (código sem zeros → denominação e campo de ordenação). */
async function fichasSap(): Promise<Map<string, { denominacao: string; campo: string }>> {
  const lista = fonte() ? (await lerBase(DESTINO.ih08, (l) => prepararEquipamentos(l)).catch(() => null))?.dados : (await bases()).equipamentos.dados;
  return new Map((lista ?? []).map((e) => [semZeros(e.equipamento), { denominacao: e.denominacao, campo: e.campo }]));
}
/** Equipamentos do IH08 (código sem zeros → denominação). */
export async function equipamentosSap(): Promise<Map<string, string>> {
  return new Map([...(await fichasSap())].map(([k, v]) => [k, v.denominacao]));
}
/** Coluna ATIVOS da carga IA06: um por equipamento do ledger, como a Gestão de MRO (campo de ordenação, código e nome). */
export async function ativosIa06(equipamentos: string[]): Promise<string[]> {
  const f = await fichasSap();
  return equipamentos.map((e) => identificarAtivo({ codigo: e, campo: f.get(semZeros(e))?.campo, nome: f.get(semZeros(e))?.denominacao }));
}

/** Consumo da IW13 por equipamento (sem zeros). */
export async function consumoPorEquipamento(): Promise<{ por: Map<string, Consumido[]>; periodo: string } | null> {
  if (!fonte()) return { por: consumoDemo(), periodo: "demonstração" };
  const c = await consumoMateriais().catch(() => null);
  if (!c?.dados) return null;
  return { por: c.dados.porEquipamento as Map<string, Consumido[]>, periodo: c.atualizado ?? "" };
}

const ident = (l: Record<string, unknown>[]) => l;
/** IP19 por equipamento (planos distintos). */
export async function ip19PorEquipamento(): Promise<Map<string, PlanoSap[]> | null> {
  const cru = fonte() ? (await lerBase(DESTINO.ip19, ident).catch(() => null))?.dados : (await bases()).cruas.ip19.dados;
  if (!cru) return null;
  const out = new Map<string, Map<string, PlanoSap>>();
  for (const l of cru) {
    const eq = semZeros(txt(l["Equipamento"])), plano = txt(l["Plano de manutenção"]);
    if (!eq || !plano) continue;
    const m = out.get(eq) ?? new Map<string, PlanoSap>();
    out.set(eq, m);
    if (!m.has(plano)) m.set(plano, { plano, texto: txt(l["Texto plano manut."] ?? l["Texto do plano"], 120) });
  }
  return new Map([...out].map(([k, v]) => [k, [...v.values()]]));
}

/**
 * As quebras dos equipamentos: as AFs do Gerenciador de AF (aba Planos de AF) e as notas de quebra da IW28 (regra do
 * site, `marcarQuebras`). Só dos equipamentos pedidos (sem zeros).
 */
export async function quebrasDos(equipamentos: Set<string>): Promise<{ afs: Quebra[]; iw28: Quebra[]; temAf: boolean }> {
  let afCru: Record<string, unknown>[] | null | undefined, notas: Nota[], ordens: Ordem[], regra: string, extra: Quebra[] = [];
  const h = hoje();
  if (!fonte()) {
    const b = await bases();
    afCru = b.cruas.af.dados;
    notas = (b.notas.dados ?? []).filter((n) => n.quebra);
    extra = [partes(h).ano, partes(h).ano - 1].flatMap((a) => quebrasDemo(a, dia)).filter((x) => equipamentos.has(x.equipamento));
    ordens = b.ordens.dados ?? [];
    regra = b.regraQuebra;
  } else {
    const [af, iw38, iw28] = await Promise.all([lerBase(DESTINO.af, ident).catch(() => null),
      lerBase(DESTINO.iw38, (l) => prepararIw38(l, h).ordens, String(h)).catch(() => null), lerBase(DESTINO.iw28, (l) => prepararNotas(l, h), String(h)).catch(() => null)]);
    afCru = af?.dados;
    ordens = iw38?.dados ?? [];
    regra = regraQuebra(iw28?.dados);
    notas = iw28?.dados ? marcarQuebras(iw28.dados.filter((n) => n.ordem), tiposPorOrdem(ordens)).filter((n) => n.quebra) : [];
  }
  const afs: Quebra[] = (afCru ? prepararAfs(afCru as never, h) : []).filter((a) => a.situacao !== AF_CANCELADA && equipamentos.has(semZeros(a.codigoSap)))
    .map((a) => ({ fonte: "AF", numero: a.numero, data: a.dataFalha, equipamento: semZeros(a.codigoSap), conjunto: a.conjunto, subconjunto: a.subconjunto,
      componente: a.componente, texto: a.resumo, criticidade: a.criticidade, os: a.osCorretiva }) as Quebra).concat(extra);
  const eqDe = (x: { equipamento: string; equipChave: string }) => semZeros(x.equipamento || x.equipChave);
  const iw28: Quebra[] = notas.filter((n) => equipamentos.has(eqDe(n)))
    .map((n) => ({ fonte: "IW28", numero: n.nota, data: n.data ?? n.dataNota, equipamento: eqDe(n), conjunto: "",
      subconjunto: "", componente: "", texto: n.descricao, criticidade: n.codigoAbc, os: n.ordem }));
  // regra "ym11" (a IW28 não traz notas Y1): as ordens YM11 do equipamento também são quebras
  if (regra === "ym11") {
    const comNota = new Set(iw28.map((q) => semZeros(q.os)));
    for (const o of ordens) if (o.tipo === TIPO_ORDEM_QUEBRA && equipamentos.has(eqDe(o)) && !comNota.has(semZeros(o.ordem)))
      iw28.push({ fonte: "IW38", numero: o.ordem, data: o.data ?? o.inicio, equipamento: eqDe(o), conjunto: "", subconjunto: "", componente: "", texto: o.texto,
        criticidade: "", os: o.ordem });
  }
  return { afs, iw28, temAf: !!afCru };
}

// ----------------------------------------------------------------------------
// Gravação (a rota confere a sessão; aqui, a permissão de novo)
// ----------------------------------------------------------------------------
function exigirGravar(u: Quem) {
  if (!podeGravarMl(u)) throw new FonteErro("Só editores do PCM (fora de Terceiro e Manutentor) alteram o Machine Ledger e os vínculos.");
}

/** Equipamentos SAP de um ledger (confirmados por um editor). */
export async function gravarCorrespondencia(u: Quem, id: string, equipamentos: unknown): Promise<string[]> {
  exigirGravar(u);
  if (!idValido(id)) throw new FonteErro("Ledger inválido.");
  const eqs = limparEquipamentos(equipamentos);
  const sap = await equipamentosSap();
  const fora = sap.size ? eqs.filter((e) => !sap.has(e)) : [];
  if (fora.length) throw new FonteErro(`Equipamento(s) fora do IH08: ${fora.join(", ")}.`);
  let existe = false;
  await gravarCadastroLote(ARQ_INDICE, { [id]: (atual) => {
    existe = !!atual;
    if (!atual) return undefined;
    return { ...atual, equipamentos: eqs, origem: "confirmada", confirmadoEm: new Date().toISOString(), confirmadoPor: por(u) };
  } }, por(u));
  if (!existe) throw new FonteErro("Ledger não encontrado.");
  registrar(u.login, "machine_ledger_correspondencia", id, { equipamentos: eqs });
  return eqs;
}

/** Vincula ou desvincula uma peça de um ativo (o mesmo campo `materiais` e a mesma regra da Gestão de MRO). */
export async function alterarVinculo(u: Quem, ativo: string, codigo: string, acao: "vincular" | "desvincular"): Promise<void> {
  exigirGravar(u);
  const a = txt(ativo, 30).toUpperCase(), c = semZeros(txt(codigo, 40));
  if (!/^[A-Z0-9][\w.\-]{0,29}$/.test(a) || !/^[\w.\-]{1,40}$/.test(c)) throw new FonteErro("Ativo ou código inválido.");
  if (acao !== "vincular" && acao !== "desvincular") throw new FonteErro("Ação inválida.");
  const [cad, sap, idx] = await Promise.all([lerCadastro(ARQ_EQUIP, { fresco: true }), equipamentosSap(), lerIndice()]);
  // a chave do ativo como está no cadastro (com ou sem zeros); senão, o código
  const chave = Object.keys(cad).find((k) => semZeros(k) === semZeros(a)) ?? a;
  const noLedger = idx.some((i) => i.equipamentos.includes(semZeros(a)));
  if (!cad[chave] && !sap.has(semZeros(a)) && !noLedger) throw new FonteErro(`O equipamento ${a} não está na lista de equipamentos (IH08 ou cadastro do site).`);
  await gravarCadastroLote(ARQ_EQUIP, { [chave]: (atual) => {
    if (acao === "desvincular") {
      const lista = Array.isArray(atual?.materiais) ? (atual!.materiais as unknown[]).map(String) : [];
      return aplicarPecas(atual, [], lista.filter((m) => semZeros(m) === c));
    }
    return aplicarPecas(atual, [c], []);
  } }, por(u));
  registrar(u.login, "machine_ledger_vinculo", chave, { codigo: c, acao });
}

/** Marca (ou desmarca) um achado do pente fino como "conferido, está certo". */
export async function marcarConferido(u: Quem, chave: string, sim: boolean): Promise<void> {
  exigirGravar(u);
  const k = txt(chave, 120);
  if (!/^[a-z_]+\|[\w.\-]+\|[\w.\-]*$/.test(k)) throw new FonteErro("Achado inválido.");
  await gravarCadastroLote(ARQ_CONFERIDOS, { [k]: sim ? { por: por(u), em: new Date().toISOString() } : null }, por(u));
  registrar(u.login, "machine_ledger_conferido", k, { sim });
}

/** O ledger já gravado com o mesmo conteúdo (lê só os de mesmas contagens). */
async function ledgerDeMesmoConteudo(indice: Indice[], conteudo: Conteudo): Promise<string | null> {
  const n = conteudo, cands = indice.filter((i) => i.contagens.componentes === n.componentes.length && i.contagens.plano === n.plano.length
    && i.contagens.pecas === n.pecas.length);
  for (const i of cands.slice(0, 20)) if (mesmoConteudo(await lerConteudo(i.id), conteudo)) return i.id;
  return null;
}

/** O que o navegador manda ao enviar o .xlsx (já lido por regras.lerLedger) e os nomes das abas da planilha. */
export interface EnvioLedger { id?: string; arquivo: string; nome: string; revisao: string; capa: Capa; conteudo: Conteudo; abas: string[] }

/**
 * Substitui o ledger (o conteúdo inteiro e a capa); mantém os equipamentos já ligados. Sem id escolhido, reaproveita o
 * ledger do mesmo arquivo/nome (reenviar não duplica); senão cria um novo. Tudo validado aqui, campo a campo.
 */
export async function substituirLedger(u: Quem, e: EnvioLedger): Promise<string> {
  exigirGravar(u);
  const arquivo = txt(e?.arquivo, 200);
  if (!arquivo || !/\.xls[xm]$/i.test(arquivo)) throw new FonteErro("Envie o .xlsx do Machine Ledger.");
  const abas = Array.isArray(e?.abas) ? e.abas.slice(0, 60).map((n) => ({ nome: txt(n, 80), linhas: [] })) : [];
  const faltam = abasFaltando(abas);
  if (faltam.length) throw new FonteErro(`Não parece um Machine Ledger: faltam as abas ${faltam.join(", ")}.`);
  const bruto = e.conteudo as unknown as Record<string, unknown> | undefined;
  for (const k of ["componentes", "plano", "pecas"]) if (Array.isArray(bruto?.[k]) && (bruto![k] as unknown[]).length > MAX_LINHAS) throw new FonteErro("Planilha grande demais.");
  const conteudo = sanitizarConteudo(bruto);
  if (!conteudo.componentes.length) throw new FonteErro("Planilha sem componentes no RCM.");
  const nome = txt(e.nome, 120) || nomeDoArquivo(arquivo);
  const indice = await lerIndice(true);
  const id = idValido(e.id) && indice.some((i) => i.id === e.id) ? e.id
    : ledgerDoMesmoNome(indice, arquivo, nome) ?? await ledgerDeMesmoConteudo(indice, conteudo) ?? idPara(arquivo);
  await gravarCadastroLote(arquivoLedger(id), { ledger: conteudo as unknown as Record<string, unknown> }, por(u));
  const capa: Capa = { maquina: txt(e.capa?.maquina, 120), fabricante: txt(e.capa?.fabricante, 80), modelo: txt(e.capa?.modelo, 80), area: txt(e.capa?.area, 80),
    funcao: txt(e.capa?.funcao, 600) };
  await gravarCadastroLote(ARQ_INDICE, { [id]: (atual) => itemIndice({
    arquivo, nome: txt(atual?.nome, 120) || nome, tipo: atual?.tipo === "modelo" ? "modelo" : "maquina", revisao: txt(e.revisao, 20), capa,
    equipamentos: limparEquipamentos(atual?.equipamentos), origem: atual?.origem === "confirmada" ? "confirmada" : "automatica",
    sugestoes: Array.isArray(atual?.sugestoes) ? atual!.sugestoes as never : [],
    contagens: { componentes: conteudo.componentes.length, plano: conteudo.plano.length, pecas: conteudo.pecas.length },
    enviadoEm: new Date().toISOString(), enviadoPor: por(u), confirmadoEm: txt(atual?.confirmadoEm, 40), confirmadoPor: txt(atual?.confirmadoPor, 80),
  }) }, por(u));
  registrar(u.login, "machine_ledger_envio", id, { arquivo, componentes: conteudo.componentes.length, pecas: conteudo.pecas.length });
  return id;
}

// O pente fino fica guardado pela assinatura das versões (índice, cada ledger, conferidos, vínculos) e pelas bases do
// catálogo/MB52 (mesmo objeto do cache de lerBase): nada mudou = nada recalculado.
const gp = globalThis as unknown as { __cmPenteMl?: { chave: string; base: BaseCodigos; valor: { achados: Achado[]; todos: EntradaPente[]; conferidos: number } } };

/** O pente fino de agora (todos os ledgers × vínculos × catálogo/MB52), sem os conferidos. */
export async function penteFinoAtual(): Promise<{ achados: Achado[]; todos: EntradaPente[]; base: BaseCodigos; conferidos: number }> {
  const indice = await lerIndice();
  const f = fonte();
  const [base, mapa] = await Promise.all([baseCodigos(), f ? f.versoes() : null]); // uma listagem só (na demonstração, sem cache)
  const chave = mapa ? [ARQ_INDICE, ARQ_CONFERIDOS, ARQ_EQUIP, ...indice.map((i) => arquivoLedger(i.id))].map((n) => mapa.get(`app/${n}`) ?? "-").join("|") : "";
  const c = gp.__cmPenteMl;
  if (chave && c && c.chave === chave && c.base === base) return { ...c.valor, base };
  const [todos, vinc, conf] = await Promise.all([lerTodos(indice), vinculos(), lerConferidos()]);
  const valor = { achados: penteFino(todos, vinc, base, new Set(conf.keys())), todos, conferidos: conf.size };
  if (chave) gp.__cmPenteMl = { chave, base, valor };
  return { ...valor, base };
}

// ----------------------------------------------------------------------------
// Listas de tarefas (IA06) — ligação pelo mesmo caminho da Gestão de MRO (app/(app)/mro/ia06.ts)
// ----------------------------------------------------------------------------
// as listas validadas ficam presas ao objeto do cadastro (o cache de lerCadastro por versão): até 5 mil listas não são
// revalidadas a cada página
const memoCadListas = new WeakMap<object, Map<string, ListaSap>>();
export async function lerListas(fresco = false): Promise<Map<string, ListaSap>> {
  const cad = await lerCadastro(ARQ_LISTAS, { fresco });
  let m = memoCadListas.get(cad);
  if (!m) { m = listasDe(cad); memoCadListas.set(cad, m); }
  return m;
}
export async function lerConfirmadas(fresco = false): Promise<Map<string, Confirmada>> {
  return confirmadasDe(await lerCadastro(ARQ_OPERACOES, { fresco }));
}
export async function lerCodigosConfirmados(fresco = false): Promise<Map<string, CodigoConfirmado>> {
  return codigosConfirmadosDe(await lerCadastro(ARQ_OPERACOES, { fresco }));
}

const memoListas = new WeakMap<object, WeakMap<object, WeakMap<object, Map<string, ListaTarefas[]>>>>();
/** Equipamento (sem zeros) → listas de tarefas: planos das ordens da IW38 × IP19, listas diretas da IP19 e as dos subconjuntos (IH08). */
async function listasPorEquip(): Promise<Map<string, ListaTarefas[]>> {
  let ordens: Ordem[], ip19: Record<string, unknown>[], equips: { equipamento: string; denominacao: string; superior?: string }[];
  if (!fonte()) {
    const b = await bases();
    ordens = b.ordens.dados ?? []; ip19 = b.cruas.ip19.dados ?? []; equips = b.equipamentos.dados ?? [];
  } else {
    const h = hoje();
    const [o, i, e] = await Promise.all([lerBase(DESTINO.iw38, (l) => prepararIw38(l, h).ordens, String(h)).catch(() => null),
      lerBase(DESTINO.ip19, ident).catch(() => null), lerBase(DESTINO.ih08, (l) => prepararEquipamentos(l)).catch(() => null)]);
    ordens = o?.dados ?? []; ip19 = i?.dados ?? []; equips = e?.dados ?? [];
  }
  const m1 = memoListas.get(ordens) ?? new WeakMap(); memoListas.set(ordens, m1);
  const m2 = m1.get(ip19) ?? new WeakMap(); m1.set(ip19, m2);
  let r = m2.get(equips);
  if (!r) {
    const bruto = comListasDosSubconjuntos(listasPorEquipamento(ordens, listasPorPlano(ip19), listasDiretasDaIp19(ip19)), equips);
    r = new Map<string, ListaTarefas[]>();
    for (const [k, v] of bruto) r.set(semZeros(k), [...(r.get(semZeros(k)) ?? []), ...v]);
    m2.set(equips, r);
  }
  return r;
}

/**
 * As listas de tarefas dos equipamentos do ledger (sem repetir) e as operações delas que estão no cadastro. Lista ligada sem
 * numerador (IP19 sem a coluna) = todas as listas do grupo.
 */
export async function listasDaMaquina(equipamentos: string[], jaLidas?: Map<string, ListaSap>): Promise<{ ligadas: ListaTarefas[]; listas: Map<string, ListaSap>; ops: OperacaoDaMaquina[] }> {
  const [por, listas] = await Promise.all([listasPorEquip(), jaLidas ?? lerListas()]);
  const ligadas = new Map<string, ListaTarefas>();
  for (const e of equipamentos) for (const l of por.get(semZeros(e)) ?? []) if (!ligadas.has(chaveLista(l.grupo, l.numerador))) ligadas.set(chaveLista(l.grupo, l.numerador), l);
  return { ligadas: [...ligadas.values()], listas, ops: operacoesDasListas(listasDasLigadas([...ligadas.values()], listas)) };
}

/**
 * As linhas da seção "Operações e IA06" de um ledger. Sem equipamento ligado ou sem o export das listas, não lê IW38/IP19/IH08
 * (as linhas saem sem operação).
 */
export async function operacoesDoLedger(indice: Indice): Promise<{ linhas: LinhaOperacao[]; ligadas: ListaTarefas[]; ops: OperacaoDaMaquina[]; temListas: boolean }> {
  const [c, b, listas, conf, cods] = await Promise.all([lerConteudo(indice.id), baseCodigos(), lerListas(), lerConfirmadas(), lerCodigosConfirmados()]);
  const m = indice.equipamentos.length && listas.size ? await listasDaMaquina(indice.equipamentos, listas) : { ligadas: [], listas, ops: [] };
  return { linhas: linhasOperacoes(indice.id, c.componentes, m.ops, conf, m.listas, b, c.pecas, cods), ligadas: m.ligadas, ops: m.ops, temListas: listas.size > 0 };
}

/** Confirma (ou troca) a operação de um componente; `null` remove a associação. A operação tem de ser de uma lista da máquina. */
export async function gravarOperacao(u: Quem, chave: string, alvo: { grupo: string; numerador: string; operacao: string; quantidade?: number | null } | null): Promise<void> {
  exigirGravar(u);
  const k = txt(chave, 80);
  const [ledger] = k.split("|");
  const indice = (await lerIndice()).find((i) => i.id === ledger);
  if (!indice) throw new FonteErro("Ledger não encontrado.");
  const c = await lerConteudo(ledger);
  if (!c.componentes.some((x) => chaveAssociacao(ledger, x) === k)) throw new FonteErro("Componente não encontrado no RCM do ledger.");
  if (alvo) {
    const { ops } = await listasDaMaquina(indice.equipamentos);
    const op = ops.find((o) => o.grupo === txt(alvo.grupo, 20).toUpperCase() && o.numerador === txt(alvo.numerador, 4) && o.op.numero === txt(alvo.operacao, 4));
    if (!op) throw new FonteErro("Essa operação não é de uma lista de tarefas dos equipamentos do ledger.");
    const q = Number(alvo.quantidade);
    // o item guarda também o código confirmado do componente: só os campos da operação mudam
    await gravarCadastroLote(ARQ_OPERACOES, { [k]: (atual) => ({ ...(atual ?? {}), grupo: op.grupo, numerador: op.numerador, operacao: op.op.numero,
      quantidade: Number.isFinite(q) && q > 0 && q < 100_000 ? q : null, por: por(u), em: new Date().toISOString() }) }, por(u));
  } else await gravarCadastroLote(ARQ_OPERACOES, { [k]: (atual) => {
    if (!atual) return undefined;
    const { grupo: _g, numerador: _n, operacao: _o, quantidade: _q, por: _p, em: _e, ...resto } = atual;
    return Object.keys(resto).some((x) => x.startsWith("codigo")) ? resto : null;
  } }, por(u));
  registrar(u.login, "machine_ledger_operacao", k, alvo ? { grupo: alvo.grupo, numerador: alvo.numerador, operacao: alvo.operacao } : { removida: true });
}

/** Substitui o cadastro das listas de tarefas pelo export enviado (validado aqui, lista a lista). */
export async function gravarListas(u: Quem, brutas: unknown): Promise<number> {
  exigirGravar(u);
  if (!Array.isArray(brutas) || !brutas.length) throw new FonteErro("Arquivo sem listas de tarefas.");
  if (brutas.length > MAX_LISTAS) throw new FonteErro("Arquivo grande demais.");
  const novas = new Map<string, ListaSap>();
  for (const b0 of brutas) {
    const b = b0 as Record<string, unknown>;
    const l = sanitizarLista(b?.grupo, b?.numerador, b);
    if (l) novas.set(chaveLista(l.grupo, l.numerador), l);
  }
  if (!novas.size) throw new FonteErro("Nenhuma lista de tarefas válida no arquivo.");
  const atuais = await lerCadastro(ARQ_LISTAS, { fresco: true });
  const itens: Record<string, Record<string, unknown> | null> = Object.fromEntries(Object.keys(atuais).filter((k) => !novas.has(k)).map((k) => [k, null]));
  for (const [k, l] of novas) itens[k] = itemLista(l);
  await gravarCadastroLote(ARQ_LISTAS, itens, por(u));
  registrar(u.login, "machine_ledger_listas", "", { listas: novas.size });
  return novas.size;
}

/**
 * Confirma (ou desfaz, com `null`) o código SAP de um componente cuja origem é "Sysmat pela referência": o código tem de ser o
 * sugerido ou um dos candidatos da referência ambígua. Gravado no item da associação (machine_ledger_operacoes.json).
 */
export async function gravarCodigo(u: Quem, chave: string, codigo: string | null): Promise<void> {
  exigirGravar(u);
  const k = txt(chave, 80);
  const [ledger] = k.split("|");
  const [c, b] = await Promise.all([lerConteudo(ledger), baseCodigos()]);
  const comp = c.componentes.find((x) => chaveAssociacao(ledger, x) === k);
  if (!comp) throw new FonteErro("Componente não encontrado no RCM do ledger.");
  if (codigo) {
    const r = codigoDoComponente(comp, pecasPorDescricao(c.pecas), b);
    const cod = semZeros(txt(codigo, 10));
    if (!r.sugerido || !(r.candidatos ?? []).some((x) => x.codigo === cod)) throw new FonteErro("Esse código não é uma sugestão pela referência deste componente.");
    await gravarCadastroLote(ARQ_OPERACOES, { [k]: (atual) => ({ ...(atual ?? {}), codigo: cod, codigoPor: por(u), codigoEm: new Date().toISOString() }) }, por(u));
  } else await gravarCadastroLote(ARQ_OPERACOES, { [k]: (atual) => {
    if (!atual) return undefined;
    const { codigo: _c, codigoPor: _p, codigoEm: _e, ...resto } = atual;
    return Object.keys(resto).some((x) => !x.startsWith("atualizado")) ? resto : null;
  } }, por(u));
  registrar(u.login, "machine_ledger_codigo", k, { codigo: codigo ?? null });
}
