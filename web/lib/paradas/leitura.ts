import { acharColuna, chave, paraNumero, texto } from "@/lib/dados/texto";
import { COLUNAS_IP19, dataDe, EXCLUIR_IP19 } from "@/lib/wcm/planos";
import type { Crua, Equipamento } from "@/lib/wcm/preparo";

import { chaveMes } from "./calendario";
import { PARAMETROS_PADRAO } from "./parametros";
import type { Disciplina, ItemPlano, Parametros } from "./tipos";

/**
 * Leitura da IP19 em itens (spec §2.1, regras L1–L8): uma operação da lista de tarefas = um item, com a disciplina
 * pelo centro de trabalho e o HH pela unidade do trabalho.
 */

export function disciplinaDoCentro(centro: string, componentes: string[] = PARAMETROS_PADRAO.centrosComponentes): Disciplina | null | "vazio" {
  const c = (centro ?? "").trim().toUpperCase();
  if (!c) return "vazio";
  if (!componentes.some((x) => x.toUpperCase() === c)) return null;
  return /^ELE_/.test(c) ? "ELE" : "MEC";
}

export interface LeituraIp19 { itens: ItemPlano[]; descartes: Record<string, number>; semCentro: number }

export const MOTIVOS_DESCARTE = ["sem plano ou data", "concluída ou ignorada", "outra localização", "outro grupo de planejamento",
  "centro eliminado", "fora de Componentes", "fora do horizonte"] as const;

const COLUNAS: Record<string, string[]> = {
  ...COLUNAS_IP19, localizacao: ["^LOCALIZACAO$"], equipSuperior: ["EQUIPAMENTO SUPERIOR"],
};
const HORAS_POR: Record<string, number> = { MIN: 1 / 60, H: 1, HR: 1, STD: 1 };

export function itensDaIp19(cru: Crua[], p: Parametros, eqs: Map<string, Equipamento>, meses: Set<string>,
  opcoes: { qualquerCentro?: boolean } = {}): LeituraIp19 {
  const colunas = cru.length ? Object.keys(cru[0]) : [];
  const usadas = new Set<string>();
  const col: Record<string, string | null> = {};
  for (const [nome, padroes] of Object.entries(COLUNAS)) {
    const c = acharColuna(colunas.filter((x) => !usadas.has(x)), padroes, EXCLUIR_IP19[nome]);
    if (c) usadas.add(c);
    col[nome] = c;
  }
  const t = (l: Crua, nome: string) => (col[nome] ? texto(l[col[nome]!]) : "");
  const d = (l: Crua, nome: string) => (col[nome] ? dataDe(l[col[nome]!]) : null);
  const locais = new Set(p.localizacoes.map((x) => x.toUpperCase()));
  const grupos = new Set(p.gruposPlanejamento.map((x) => x.toUpperCase()));
  const eliminados = new Set(p.centrosEliminados.map((x) => x.toUpperCase()));

  const descartes: Record<string, number> = {};
  const fora = (motivo: string) => { descartes[motivo] = (descartes[motivo] ?? 0) + 1; };
  const seqPorChamada = new Map<string, number>();
  const itens: ItemPlano[] = [];
  let semCentro = 0;
  for (const l of cru) {
    const plano = t(l, "plano");
    const dataIp19 = d(l, "dataPlanejada") ?? d(l, "dataChamada");
    if (!plano || dataIp19 == null) { fora("sem plano ou data"); continue; }
    const situacao = t(l, "tipoProgramacao");
    if (/^(CONCL|IGNOR|SALT)/.test(chave(situacao)) || d(l, "dataConclusao") != null) { fora("concluída ou ignorada"); continue; }
    const equipamento = t(l, "equipamento");
    const local = (t(l, "localizacao") || eqs.get(equipamento)?.localizacao || "").toUpperCase();
    if (locais.size && !locais.has(local)) { fora("outra localização"); continue; }
    if (grupos.size && !grupos.has(t(l, "grupoPlanejamento").toUpperCase())) { fora("outro grupo de planejamento"); continue; }
    const centro = t(l, "centroTrabalho").toUpperCase();
    if (eliminados.has(centro)) { fora("centro eliminado"); continue; }
    let disc = disciplinaDoCentro(centro, p.centrosComponentes);
    if (disc === null && opcoes.qualquerCentro) disc = "MEC"; // demonstração: qualquer centro conta como mecânica
    if (disc === null) { fora("fora de Componentes"); continue; }
    const mes = chaveMes(dataIp19);
    if (!meses.has(mes)) { fora("fora do horizonte"); continue; }
    const unidade = col.unidade ? t(l, "unidade").toUpperCase() : "";
    const fator = unidade ? HORAS_POR[unidade] ?? 1 : HORAS_POR[p.unidadePadraoIp19];
    const trabalho = paraNumero(col.trabalho ? l[col.trabalho] : "");
    const item = t(l, "item");
    const base = `${plano}|${item}|${dataIp19}`;
    const n = seqPorChamada.get(base) ?? 0;
    seqPorChamada.set(base, n + 1);
    const assumido = disc === "vazio";
    if (assumido) semCentro++;
    const superior = t(l, "equipSuperior");
    itens.push({
      chave: `${base}|${n}`, plano, item, ordem: t(l, "ordem"), texto: t(l, "texto"), equipamento, campo: "", ativo: "", mes, dataIp19,
      disciplina: disc === "vazio" ? "MEC" : disc, centro, hh: Number.isFinite(trabalho) && trabalho > 0 ? trabalho * fator : 0, situacao,
      origemHh: "ip19", ...(assumido ? { centroAssumido: true } : {}), ...(superior ? { superior } : {}),
    });
  }
  return { itens, descartes, semCentro };
}
