import "server-only";

import { fabricantesERefs, type ItemCatalogo } from "../dados/materiais";
import { catalogo, estoque } from "../dados/bases";
import { gravarCadastroLote, lerCadastro } from "../dados/cadastros";
import { fotosDoCadastro } from "../fotoMaterial";
import { fotosExternasDoItem } from "../dados/fotosExternas";
import { ARQUIVO_REFERENCIA } from "../dados/fotosReferencia";
import { pdmEfetivo, pdmsConhecidos } from "../dados/pdmDeducao";
import { buscarImagensEm, ChaveErro, configuracoesBusca, CotaErro, type ImagemBusca } from "./buscaImagem";
import { consultaFotoExata, escolherFotoExata } from "./escolha";

/**
 * Rotina de busca automática de fotos, só a foto exata do material (pela referência do fabricante; foto genérica do tipo
 * não serve), de TODOS os materiais do site com fabricante e referência e sem foto, de qualquer local e status no Sysmat,
 * numa fila por prioridade: almoxarifado (MB52) → ligados a equipamentos (MRO) → aprovados → bloqueados e demais →
 * cancelados e duplicados. Cada tentativa fica no cadastro `fotos_busca_estado.json`
 * (não repete por 60 dias); o orçamento do dia é contado nesse mesmo cadastro, no total e por provedor. Cada material
 * passa pelos provedores configurados em rodízio (buscaImagem.ts) até um deles trazer a foto exata.
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
  /** materiais ligados a algum equipamento na Gestão de MRO (sem zeros à esquerda): vêm logo depois do almoxarifado */
  vinculados?: Set<string>;
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
  // (b) o resto do catálogo do Sysmat, de qualquer status: ligados a equipamento → aprovados → demais → cancelados/duplicados
  const peso = (c: ItemCatalogo) => {
    if (d.vinculados?.has(semZeros(c.material.trim()))) return 0;
    const st = c.status.trim().toUpperCase();
    return st === "APROVADO" ? 1 : st === "CANCELADO" || st === "DUPLICADO" ? 3 : 2;
  };
  const resto: { c: ItemCatalogo; p: number; i: number }[] = [];
  d.catalogo.forEach((c, i) => {
    const m = semZeros(c.material.trim());
    if (!m || vistos.has(`m:${m}`) || !sem(d.refs, m) || !sem(d.refs, c.material.trim())) return;
    resto.push({ c, p: peso(c), i });
  });
  resto.sort((a, b) => a.p - b.p || a.i - b.i);
  for (const { c } of resto) {
    const m = semZeros(c.material.trim());
    const par = fabricantesERefs(c.descrCompleta).find((p) => p.fab && p.ref);
    if (!par || !ok(`m:${m}`)) continue;
    const pdm = pdmEfetivo(c.pdm, c.descricaoCurta, pdms);
    incluir({ chave: `m:${m}`, consulta: consultaFotoExata(par.fab, par.ref, pdm), material: m, fab: par.fab, ref: par.ref, pdm });
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
  const [est, cat, refs, estado, equips] = await Promise.all([
    estoque(), catalogo(), lerCadastro(ARQUIVO_REFERENCIA), lerCadastro(ARQUIVO_ESTADO), lerCadastro("cadastro_equipamentos.json"),
  ]);
  const vinculados = new Set<string>();
  for (const e of Object.values(equips)) {
    const ms = (e as { materiais?: unknown } | null)?.materiais;
    if (Array.isArray(ms)) for (const m of ms) vinculados.add(semZeros(String(m).trim()));
  }
  const vistos = new Set<string>();
  const mb52: MaterialEstoque[] = [];
  for (const e of est.dados ?? []) {
    if (!e.material || vistos.has(e.material)) continue;
    vistos.add(e.material);
    mb52.push({ material: e.material, descricao: e.descricao });
  }
  return { estoque: mb52, catalogo: cat.dados ?? [], refs, estado, agora: Date.now(), vinculados };
}

/**
 * Orçamento do dia (máx. 200), da variável BUSCA_IMAGENS_POR_DIA; sem ela, a soma das cotas gratuitas dos provedores
 * configurados (ou 30, sem nenhum).
 */
export function limiteDiario(env: Partial<NodeJS.ProcessEnv> = process.env): number {
  const somaCotas = configuracoesBusca(env).reduce((s, c) => s + c.porDia, 0);
  const padrao = somaCotas ? Math.min(LIMITE_DIA_MAX, somaCotas) : LIMITE_DIA_PADRAO;
  const bruto = env.BUSCA_IMAGENS_POR_DIA?.trim();
  if (!bruto) return padrao;
  const n = Number(bruto);
  if (!Number.isFinite(n)) return padrao;
  return Math.max(0, Math.min(LIMITE_DIA_MAX, Math.floor(n)));
}

/** Um provedor na rodada: nome, cota do dia e a busca. */
export interface ProvedorRodada { nome: string; porDia: number; buscar: (consulta: string) => Promise<ImagemBusca[]> }

export interface OpcoesRodada {
  /** Orçamento do dia inteiro (buscas já feitas hoje, na rotina ou no botão, contam). */
  limiteDia: number;
  /** Quantas buscas esta rodada pode fazer (o botão usa 10). */
  porRodada: number;
  prazoMs?: number;
  /** Só para os testes: outra leitura dos dados e outra busca (um provedor só) ou outros provedores. */
  dados?: () => Promise<DadosBusca>;
  buscar?: (consulta: string) => Promise<ImagemBusca[]>;
  provedores?: ProvedorRodada[];
}

/**
 * Roda a busca: escolhe a foto de cada alvo (até o orçamento e o prazo), grava os achados nos cadastros de foto e o
 * estado das tentativas. Nunca registra URLs nem dados no log: só contagens.
 */
export async function rodadaFotos(o: OpcoesRodada): Promise<ResumoRodada> {
  const provs: ProvedorRodada[] = o.provedores ?? (o.buscar
    ? [{ nome: "teste", porDia: Number.POSITIVE_INFINITY, buscar: o.buscar }]
    : configuracoesBusca().map((c) => ({ nome: c.provedor, porDia: c.porDia, buscar: (q: string) => buscarImagensEm(c, q) })));
  if (!provs.length) {
    console.info("busca de fotos desligada");
    return vazio("busca de fotos desligada", false);
  }
  if (rodando) return vazio("já há uma rodada em andamento", true);
  rodando = true;
  const inicio = Date.now();
  try {
    const d = await (o.dados ?? carregarDados)();
    const hoje = dataDe(d.agora);
    const dia = d.estado[CHAVE_DIA] as { dia?: unknown; usadas?: unknown; por?: unknown } | undefined;
    const doDia = dia?.dia === hoje;
    const usadasHoje = doDia && typeof dia.usadas === "number" ? dia.usadas : 0;
    // buscas já feitas hoje em cada provedor (a cota gratuita é de cada um)
    const porProv = new Map<string, number>(doDia && dia.por && typeof dia.por === "object"
      ? Object.entries(dia.por as Record<string, unknown>).map(([k, v]) => [k, typeof v === "number" ? v : 0]) : []);
    const usadasAgora = new Map<string, number>();
    const esgotados = new Set<string>();
    const livre = (p: ProvedorRodada) => !esgotados.has(p.nome) && (porProv.get(p.nome) ?? 0) + (usadasAgora.get(p.nome) ?? 0) < p.porDia;
    const teto = Math.min(o.porRodada, Math.max(0, o.limiteDia - usadasHoje));
    const alvos = planejarBusca(d);
    const prazo = o.prazoMs ?? PRAZO_RODADA_MS;
    const achouRef: Cadastro = {}, novos: Cadastro = {};
    const em = new Date(d.agora).toISOString();
    let chamadas = 0, achados = 0, semResultado = 0, erros = 0, motivo = "fim da fila";
    if (teto <= 0) motivo = "orçamento do dia esgotado";
    fila: for (const alvo of alvos) {
      if (teto <= 0) break;
      if (chamadas >= teto) { motivo = "orçamento da rodada"; break; }
      if (Date.now() - inicio > prazo) { motivo = "tempo da rodada"; break; }
      if (!provs.some(livre)) { motivo = "cota do provedor de busca"; break; }
      let respondeu = false, cortado = false, achei: ReturnType<typeof escolherFotoExata> = null, quem = "";
      // rodízio: o próximo provedor só entra se o anterior não trouxe a foto exata
      for (const p of provs) {
        if (!livre(p)) continue;
        // orçamento ou prazo no meio do rodízio: o material não fica como "sem foto" (volta na próxima rodada)
        if (chamadas >= teto) { cortado = true; break; }
        if (Date.now() - inicio > prazo) { cortado = true; break; }
        chamadas++;
        usadasAgora.set(p.nome, (usadasAgora.get(p.nome) ?? 0) + 1);
        let lista: ImagemBusca[];
        try {
          lista = await p.buscar(alvo.consulta);
        } catch (e) {
          if (e instanceof CotaErro) {
            // sem cota hoje: fica gravado como cheio no dia (o botão não gasta outra chamada nele)
            esgotados.add(p.nome);
            if (Number.isFinite(p.porDia)) usadasAgora.set(p.nome, Math.max(usadasAgora.get(p.nome) ?? 0, p.porDia - (porProv.get(p.nome) ?? 0)));
            continue;
          }
          if (e instanceof ChaveErro) { esgotados.add(p.nome); erros++; continue; }
          erros++; // falha comum: tenta o próximo; sem resposta de nenhum, tenta de novo amanhã
          continue;
        }
        respondeu = true;
        achei = escolherFotoExata(lista, alvo.fab, alvo.ref);
        if (achei) { quem = p.nome; break; }
      }
      if (cortado && !achei) { motivo = chamadas >= teto ? "orçamento da rodada" : "tempo da rodada"; break fila; }
      if (!respondeu) {
        if (!provs.some(livre)) { motivo = "cota do provedor de busca"; break fila; }
        continue;
      }
      novos[alvo.chave] = { data: em, resultado: achei ? "achou" : "sem", ...(quem && { provedor: quem }) };
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
      [CHAVE_DIA]: (atual: Record<string, unknown> | undefined) => {
        const mesmo = atual?.dia === hoje;
        const por: Record<string, number> = mesmo && atual?.por && typeof atual.por === "object" ? { ...(atual.por as Record<string, number>) } : {};
        for (const [k, n] of usadasAgora) por[k] = (typeof por[k] === "number" ? por[k] : 0) + n;
        return { dia: hoje, usadas: (mesmo && typeof atual?.usadas === "number" ? atual.usadas : 0) + chamadas, por };
      },
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

/** Resumo para o cartão de Fontes de dados: provedor, última rodada e cobertura do almoxarifado. */
// o resumo percorre o catálogo inteiro (~98 mil itens): guardado por 5 min (a tela de Fontes de dados é dinâmica)
let resumoGuardado: { em: number; r: ResumoFotos } | null = null;
export async function resumoFotosAutomaticas(): Promise<ResumoFotos> {
  if (resumoGuardado && Date.now() - resumoGuardado.em < 5 * 60_000) return resumoGuardado.r;
  const r = await calcularResumoFotos();
  resumoGuardado = { em: Date.now(), r };
  return r;
}

async function calcularResumoFotos(): Promise<ResumoFotos> {
  const cfgs = configuracoesBusca();
  const d = await carregarDados();
  const cadMat = await lerCadastro("cadastro_materiais.json");
  const base = (material: string) => ({
    material,
    propria: fotosDoCadastro(cadMat[material] as { foto?: unknown; fotos?: unknown } | undefined).length > 0,
    cadRef: d.refs,
  });
  const almox = d.estoque.map((e) => base(e.material));
  const ultima = d.estado[CHAVE_ULTIMA] as { em?: unknown; buscados?: unknown; achados?: unknown; motivo?: unknown } | undefined;
  const dia = d.estado[CHAVE_DIA] as { dia?: unknown; usadas?: unknown } | undefined;
  return {
    ligada: cfgs.length > 0,
    provedor: cfgs.length ? cfgs.map((c) => c.provedor).join(", ") : null,
    ultima: ultima && typeof ultima.em === "string" ? { em: ultima.em, buscados: Number(ultima.buscados) || 0,
      achados: Number(ultima.achados) || 0, motivo: String(ultima.motivo ?? "") } : null,
    almoxarifado: cobertura(almox),
    orcamentoHoje: { usadas: dia?.dia === dataDe(d.agora) && typeof dia.usadas === "number" ? dia.usadas : 0, limite: limiteDiario() },
  };
}
