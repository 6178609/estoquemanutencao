import "server-only";

import { fabricantesERefs, type ItemCatalogo } from "../dados/materiais";
import { catalogo, estoque } from "../dados/bases";
import { gravarCadastroLote, lerCadastro } from "../dados/cadastros";
import { fotosDoCadastro } from "../fotoMaterial";
import { fotosExternasDoItem } from "../dados/fotosExternas";
import { ARQUIVO_REFERENCIA } from "../dados/fotosReferencia";
import { pdmEfetivo, pdmsConhecidos } from "../dados/pdmDeducao";
import { buscarImagens, configuracaoBusca, CotaErro, type ImagemBusca } from "./buscaImagem";
import { consultaFotoExata, escolherFotoExata } from "./escolha";

/**
 * Rotina de busca automática de fotos, só a foto exata do material (pela referência do fabricante; foto genérica do tipo
 * não serve). Ordem: (a) materiais do estoque com referência e sem foto do fabricante; (b) materiais do catálogo com
 * referência. Cada tentativa fica no cadastro `fotos_busca_estado.json`
 * (não repete por 60 dias); o orçamento do dia é contado nesse mesmo cadastro.
 */

export const ARQUIVO_ESTADO = "fotos_busca_estado.json";
const DIAS_NOVA_TENTATIVA = 60;
const PRAZO_RODADA_MS = 240_000;
const CHAVE_ULTIMA = "_ultima_rodada";
const CHAVE_DIA = "_orcamento_dia";
export const LIMITE_DIA_MAX = 200;
export const LIMITE_DIA_PADRAO = 30;
export const ORCAMENTO_MANUAL = 10;

type Cadastro = Record<string, Record<string, unknown>>;

/** Material do estoque (MB52) com o texto breve. */
export interface MaterialEstoque { material: string; descricao: string }

/** Os dados que a rotina lê: estoque, catálogo, o cadastro de fotos do fabricante, o estado e a hora. */
export interface DadosBusca {
  estoque: MaterialEstoque[];
  catalogo: ItemCatalogo[];
  refs: Cadastro;
  estado: Cadastro;
  agora: number;
}

/** Uma busca a fazer: a chave do estado, a consulta e o que procurar. */
export interface Alvo { chave: string; consulta: string; material: string; fab: string; ref: string; pdm: string }

const DIA_MS = 86_400_000;
const semZeros = (c: string) => c.replace(/^0+/, "");
const dataDe = (agora: number) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date(agora));

/** Uma tentativa recente (menos de 60 dias) não se repete. */
function tentouRecente(estado: Cadastro, chave: string, agora: number): boolean {
  const ult = estado[chave];
  const t = ult && typeof ult.data === "string" ? Date.parse(ult.data) : NaN;
  return Number.isFinite(t) && agora - t < DIAS_NOVA_TENTATIVA * DIA_MS;
}

/** Catálogo por código (sem zeros à esquerda, como na tela). */
function catalogoPorMaterial(itens: ItemCatalogo[]): Map<string, ItemCatalogo> {
  const m = new Map<string, ItemCatalogo>();
  for (const c of itens) if (c.material && !m.has(semZeros(c.material))) m.set(semZeros(c.material), c);
  return m;
}

/**
 * As buscas de hoje, na ordem de prioridade, sem repetir chave. Função pura: não lê nem grava nada.
 */
export function planejarBusca(d: DadosBusca): Alvo[] {
  const cat = catalogoPorMaterial(d.catalogo);
  const pdms = pdmsConhecidos(d.catalogo);
  const out: Alvo[] = [];
  const vistos = new Set<string>();
  const ok = (chave: string) => !vistos.has(chave) && !tentouRecente(d.estado, chave, d.agora);
  const sem = (cad: Cadastro, chave: string) => !Object.hasOwn(cad, chave);
  const incluir = (a: Alvo) => { vistos.add(a.chave); out.push(a); };
  // (a) materiais do estoque com referência e sem foto do fabricante
  for (const e of d.estoque) {
    const c = cat.get(semZeros(e.material));
    const par = c ? fabricantesERefs(c.descrCompleta).find((p) => p.fab && p.ref) : undefined;
    if (!c || !par || !sem(d.refs, e.material) || !ok(`m:${e.material}`)) continue;
    const pdm = pdmEfetivo(c.pdm, e.descricao, pdms);
    incluir({ chave: `m:${e.material}`, consulta: consultaFotoExata(par.fab, par.ref, pdm), material: e.material, fab: par.fab, ref: par.ref, pdm });
  }

  // (b) materiais do catálogo com referência, pelo código sem zeros à esquerda (o do MB52: a foto aparece nas duas abas
  // e o mesmo material não é buscado duas vezes)
  for (const c of d.catalogo) {
    const material = semZeros(c.material);
    if (!material) continue;
    const par = fabricantesERefs(c.descrCompleta).find((p) => p.fab && p.ref);
    if (!par || !sem(d.refs, material) || !sem(d.refs, c.material) || !ok(`m:${material}`) || !ok(`m:${c.material}`)) continue;
    const pdm = pdmEfetivo(c.pdm, c.descricaoCurta, pdms);
    incluir({ chave: `m:${material}`, consulta: consultaFotoExata(par.fab, par.ref, pdm), material, fab: par.fab, ref: par.ref, pdm });
  }
  return out;
}

export interface ResumoRodada {
  ligada: boolean;
  motivo: string;
  buscados: number;
  achados: number;
  semResultado: number;
  erros: number;
  orcamento: number;
  alvos: number;
  em: string;
}

let rodando = false;

const vazio = (motivo: string, ligada: boolean): ResumoRodada => ({
  ligada, motivo, buscados: 0, achados: 0, semResultado: 0, erros: 0, orcamento: 0, alvos: 0, em: new Date().toISOString(),
});

/** Lê o que a rotina precisa (estoque, catálogo e os cadastros de foto). */
export async function carregarDados(): Promise<DadosBusca> {
  const [est, cat, refs, estado] = await Promise.all([
    estoque(), catalogo(), lerCadastro(ARQUIVO_REFERENCIA), lerCadastro(ARQUIVO_ESTADO),
  ]);
  const vistos = new Set<string>();
  const mb52: MaterialEstoque[] = [];
  for (const e of est.dados ?? []) {
    if (!e.material || vistos.has(e.material)) continue;
    vistos.add(e.material);
    mb52.push({ material: e.material, descricao: e.descricao });
  }
  return { estoque: mb52, catalogo: cat.dados ?? [], refs, estado, agora: Date.now() };
}

/** Orçamento do dia (por padrão 30; máx. 200), da variável BUSCA_IMAGENS_POR_DIA. */
export function limiteDiario(env: Partial<NodeJS.ProcessEnv> = process.env): number {
  const bruto = env.BUSCA_IMAGENS_POR_DIA?.trim();
  if (!bruto) return LIMITE_DIA_PADRAO;
  const n = Number(bruto);
  if (!Number.isFinite(n)) return LIMITE_DIA_PADRAO;
  return Math.max(0, Math.min(LIMITE_DIA_MAX, Math.floor(n)));
}

export interface OpcoesRodada {
  /** Orçamento do dia inteiro (buscas já feitas hoje, na rotina ou no botão, contam). */
  limiteDia: number;
  /** Quantas buscas esta rodada pode fazer (o botão usa 10). */
  porRodada: number;
  prazoMs?: number;
  /** Só para os testes: outra leitura dos dados e outra busca. */
  dados?: () => Promise<DadosBusca>;
  buscar?: (consulta: string) => Promise<ImagemBusca[]>;
}

/**
 * Roda a busca: escolhe a foto de cada alvo (até o orçamento e o prazo), grava os achados nos cadastros de foto e o
 * estado das tentativas. Nunca registra URLs nem dados no log: só contagens.
 */
export async function rodadaFotos(o: OpcoesRodada): Promise<ResumoRodada> {
  if (!configuracaoBusca()) {
    console.info("busca de fotos desligada");
    return vazio("busca de fotos desligada", false);
  }
  if (rodando) return vazio("já há uma rodada em andamento", true);
  rodando = true;
  const inicio = Date.now();
  try {
    const d = await (o.dados ?? carregarDados)();
    const hoje = dataDe(d.agora);
    const dia = d.estado[CHAVE_DIA] as { dia?: unknown; usadas?: unknown } | undefined;
    const usadasHoje = dia?.dia === hoje && typeof dia.usadas === "number" ? dia.usadas : 0;
    const teto = Math.min(o.porRodada, Math.max(0, o.limiteDia - usadasHoje));
    const alvos = planejarBusca(d);
    const prazo = o.prazoMs ?? PRAZO_RODADA_MS;
    const buscar = o.buscar ?? buscarImagens;
    const achouRef: Cadastro = {}, novos: Cadastro = {};
    const em = new Date(d.agora).toISOString();
    let chamadas = 0, achados = 0, semResultado = 0, erros = 0, motivo = "fim da fila";
    if (teto <= 0) motivo = "orçamento do dia esgotado";
    for (const alvo of alvos) {
      if (teto <= 0) break;
      if (chamadas >= teto) { motivo = "orçamento da rodada"; break; }
      if (Date.now() - inicio > prazo) { motivo = "tempo da rodada"; break; }
      let lista: ImagemBusca[];
      chamadas++;
      try {
        lista = await buscar(alvo.consulta);
      } catch (e) {
        if (e instanceof CotaErro) { motivo = "cota do provedor de busca"; break; }
        erros++; // falha comum: não grava a tentativa, tenta de novo amanhã
        continue;
      }
      const achei = escolherFotoExata(lista, alvo.fab, alvo.ref);
      novos[alvo.chave] = { data: em, resultado: achei ? "achou" : "sem" };
      if (!achei) { semResultado++; continue; }
      achados++;
      achouRef[alvo.material] = { url: achei.imagem, pagina: achei.pagina, titulo: achei.titulo, buscado_em: em };
    }
    const resumo: ResumoRodada = { ligada: true, motivo, buscados: chamadas, achados, semResultado, erros,
      orcamento: teto, alvos: alvos.length, em };
    // só grava onde ainda não há foto na hora da gravação (uma importação ou edição no meio da rodada não é apagada)
    const soSeVazio = (c: Cadastro) => Object.fromEntries(Object.entries(c).map(([k, item]) =>
      [k, (atual: Record<string, unknown> | undefined) => (atual ? undefined : item)]));
    if (Object.keys(achouRef).length) await gravarCadastroLote(ARQUIVO_REFERENCIA, soSeVazio(achouRef), "busca automática", false);
    await gravarCadastroLote(ARQUIVO_ESTADO, {
      ...novos,
      [CHAVE_ULTIMA]: { em, buscados: chamadas, achados, sem_resultado: semResultado, erros, motivo, orcamento: teto },
      // soma sobre o valor gravado na hora (outra rodada pode ter gravado no meio)
      [CHAVE_DIA]: (atual: Record<string, unknown> | undefined) => ({
        dia: hoje, usadas: (atual?.dia === hoje && typeof atual.usadas === "number" ? atual.usadas : 0) + chamadas,
      }),
    }, "busca automática", false);
    resumoGuardado = null; // a cobertura mudou
    console.info(`busca de fotos: ${chamadas} buscas, ${achados} achados, ${semResultado} sem resultado, ${erros} erros (${motivo})`);
    return resumo;
  } finally {
    rodando = false;
  }
}

export interface ResumoFotos {
  ligada: boolean;
  provedor: string | null;
  ultima: { em: string; buscados: number; achados: number; motivo: string } | null;
  almoxarifado: Cobertura;
  cadastrado: Cobertura;
  orcamentoHoje: { usadas: number; limite: number };
}

export interface Cobertura { total: number; exata: number; sem: number }

/** Cobertura de um conjunto de materiais: com foto exata (própria ou do fabricante) ou sem foto. */
export function cobertura(itens: { material: string; propria: boolean; cadRef: Cadastro }[]): Cobertura {
  const r = { total: itens.length, exata: 0, sem: 0 };
  for (const i of itens) {
    if (i.propria || fotosExternasDoItem(i.material, i.cadRef).fotoRef) r.exata++;
    else r.sem++;
  }
  return r;
}

/** Resumo para o cartão de Fontes de dados: provedor, última rodada e cobertura do almoxarifado e do cadastrado. */
// o resumo percorre o catálogo inteiro (~98 mil itens): guardado por 5 min (a tela de Fontes de dados é dinâmica)
let resumoGuardado: { em: number; r: ResumoFotos } | null = null;
export async function resumoFotosAutomaticas(): Promise<ResumoFotos> {
  if (resumoGuardado && Date.now() - resumoGuardado.em < 5 * 60_000) return resumoGuardado.r;
  const r = await calcularResumoFotos();
  resumoGuardado = { em: Date.now(), r };
  return r;
}

async function calcularResumoFotos(): Promise<ResumoFotos> {
  const cfg = configuracaoBusca();
  const d = await carregarDados();
  const cadMat = await lerCadastro("cadastro_materiais.json");
  const base = (material: string) => ({
    material,
    propria: fotosDoCadastro(cadMat[material] as { foto?: unknown; fotos?: unknown } | undefined).length > 0,
    cadRef: d.refs,
  });
  const almox = d.estoque.map((e) => base(e.material));
  const vistos = new Set<string>();
  const cadastrado = d.catalogo.filter((c) => c.material && !vistos.has(c.material) && vistos.add(c.material))
    .map((c) => base(c.material));
  const ultima = d.estado[CHAVE_ULTIMA] as { em?: unknown; buscados?: unknown; achados?: unknown; motivo?: unknown } | undefined;
  const dia = d.estado[CHAVE_DIA] as { dia?: unknown; usadas?: unknown } | undefined;
  return {
    ligada: !!cfg,
    provedor: cfg?.provedor ?? null,
    ultima: ultima && typeof ultima.em === "string" ? { em: ultima.em, buscados: Number(ultima.buscados) || 0,
      achados: Number(ultima.achados) || 0, motivo: String(ultima.motivo ?? "") } : null,
    almoxarifado: cobertura(almox),
    cadastrado: cobertura(cadastrado),
    orcamentoHoje: { usadas: dia?.dia === dataDe(d.agora) && typeof dia.usadas === "number" ? dia.usadas : 0, limite: limiteDiario() },
  };
}
