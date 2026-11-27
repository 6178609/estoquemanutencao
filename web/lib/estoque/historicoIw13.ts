/**
 * Histórico de retiradas do material pela IW13 (aba Estoque, pedido do usuário, 27/11/2026). Funções puras, usadas no
 * servidor (lib/dados/historicoIw13.ts, rota app/api/estoque/historico) e no navegador (gráfico e CSV). Testado em
 * testes/estoqueHistorico.test.ts. Spec: docs/superpowers/specs/2026-11-27-estoque-historico-iw13-design.md.
 *
 * Regra das quantidades (decisão de 27/11/2026):
 * - Tomados > 0 = retirada; Tomados < 0 = devolução/estorno ao almoxarifado: entra no histórico como linha NEGATIVA (selo
 *   "Devolução") e ABATE do consumo (o total é líquido: retirado − devolvido). Tomados = 0 (só reserva) não entra.
 * - "Últimos 12 meses" = o mês corrente e os 11 anteriores, inteiros, pelo dia de Brasília (o da data de lançamento).
 * - Média/mês = total líquido dos 12 meses ÷ 12; último consumo = a retirada (Tomados > 0) mais recente, de qualquer época;
 *   ordens = ordens distintas com retirada nos 12 meses.
 */
import type { Dia } from "../wcm/util";

export const MESES_HISTORICO = 12;
/** Linhas da tabela por página ("ver mais" mostra mais tantas). */
export const LINHAS_POR_PAGINA = 50;

/** Uma linha da IW13 com quantidade ≠ 0 (negativa = devolução). */
export interface LinhaRetirada { ordem: string; material: string; quantidade: number; um: string; descricao: string; equipamento: string; data: Dia | null }

/** Dados da ordem na IW38 (e a marca de quebra pela regra do site), como em lib/ubm/validacao.ts → InfoOrdem. */
export interface OrdemDoHistorico { tipo: string; texto: string; equipamento: string; denominacao: string; quebra: boolean }

/** Linha pronta para a tela (e o CSV). */
export interface LinhaHistorico {
  /** AAAA-MM-DD ("" sem data) */
  data: string; ordem: string; tipo: string; textoOrdem: string; equipamento: string; denominacao: string;
  quantidade: number; um: string; quebra: boolean; devolucao: boolean;
  /** validação do líder na UBM: "ubm" (veio do armário, com o id) ou "almox"; "" sem validação */
  origem: "" | "ubm" | "almox"; armario: string;
  /** quantidade × preço médio (só para quem vê valores; ausente para os outros) */
  valor?: number | null;
}

export interface MesHistorico { chave: string; rotulo: string; quantidade: number }
export interface ResumoHistorico {
  /** total líquido dos 12 meses (retirado − devolvido), o retirado e o devolvido (positivo) */
  total: number; retirado: number; devolvido: number; mediaMes: number;
  /** AAAA-MM-DD da última retirada (qualquer época), "" sem retirada */
  ultimo: string; ordens: number; um: string; meses: MesHistorico[];
}

const r3 = (v: number) => Math.round(v * 1000) / 1000;
const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

/** Código sem zeros à esquerda (o MB52, o Sysmat e a IW13 podem vir com ou sem). */
export const codigoMaterial = (v: string) => String(v ?? "").trim().toUpperCase().replace(/^0+(?=\d)/, "");
/** ordem|código como na validação da UBM (lib/ubm/validacao.ts → chaveValidacao, para ordem numérica). */
export const chaveOrdemMaterial = (ordem: string, material: string) =>
  `${String(ordem ?? "").replace(/\D/g, "").replace(/^0+(?=\d)/, "")}|${codigoMaterial(material)}`;

/** AAAA-MM-DD de um Dia (dias desde 01/01/1970), "" sem data. */
export const isoDia = (d: Dia | null | undefined) => (d == null ? "" : new Date(d * 86_400_000).toISOString().slice(0, 10));

/** Os 12 meses da janela (do mais antigo ao atual): chave AAAA-MM e rótulo "nov/26". */
export function mesesJanela(hoje: Dia): { chave: string; rotulo: string }[] {
  const [a, m] = isoDia(hoje).split("-").map(Number);
  const r: { chave: string; rotulo: string }[] = [];
  for (let k = MESES_HISTORICO - 1; k >= 0; k--) {
    const t = a * 12 + (m - 1) - k;
    const ano = Math.floor(t / 12), mes = t % 12;
    r.push({ chave: `${ano}-${String(mes + 1).padStart(2, "0")}`, rotulo: `${MESES[mes]}/${String(ano).slice(-2)}` });
  }
  return r;
}

/** Primeiro dia (AAAA-MM-01) da janela de 12 meses. */
export const inicioJanela = (hoje: Dia) => `${mesesJanela(hoje)[0].chave}-01`;

/** As linhas agrupadas por material (código sem zeros), cada grupo da mais recente para a mais antiga. */
export function indicePorMaterial(linhas: LinhaRetirada[]): Map<string, LinhaRetirada[]> {
  const m = new Map<string, LinhaRetirada[]>();
  for (const l of linhas) {
    if (!Number.isFinite(l.quantidade) || l.quantidade === 0) continue;
    const c = codigoMaterial(l.material);
    if (!c) continue;
    let g = m.get(c);
    if (!g) m.set(c, (g = []));
    g.push(l);
  }
  for (const g of m.values()) g.sort((a, b) => (b.data ?? -1) - (a.data ?? -1) || b.quantidade - a.quantidade);
  return m;
}

/** Consumo líquido dos 12 meses por material (só os que tiveram linha na janela). */
export function consumo12m(indice: Map<string, LinhaRetirada[]>, hoje: Dia): Map<string, number> {
  const de = inicioJanela(hoje), ate = isoDia(hoje);
  const r = new Map<string, number>();
  for (const [c, g] of indice) {
    let s = 0, teve = false;
    for (const l of g) {
      const d = isoDia(l.data);
      if (!d || d < de || d > ate) continue;
      s += l.quantidade; teve = true;
    }
    if (teve) r.set(c, r3(s));
  }
  return r;
}

/** Resumo e barras mês a mês das linhas de UM material. */
export function resumoHistorico(linhas: LinhaRetirada[], hoje: Dia): ResumoHistorico {
  const meses = mesesJanela(hoje).map((m) => ({ ...m, quantidade: 0 }));
  const porMes = new Map(meses.map((m) => [m.chave, m]));
  const ate = isoDia(hoje);
  let retirado = 0, devolvido = 0, ultimo = "", um = "";
  const ordens = new Set<string>();
  for (const l of linhas) {
    const d = isoDia(l.data);
    if (l.quantidade > 0 && d && d <= ate && d > ultimo) ultimo = d;
    um ||= l.um.trim();
    const mes = d && d <= ate ? porMes.get(d.slice(0, 7)) : undefined;
    if (!mes) continue;
    mes.quantidade = r3(mes.quantidade + l.quantidade);
    if (l.quantidade > 0) { retirado += l.quantidade; ordens.add(l.ordem); } else devolvido -= l.quantidade;
  }
  const total = r3(retirado - devolvido);
  return { total, retirado: r3(retirado), devolvido: r3(devolvido), mediaMes: r3(total / MESES_HISTORICO), ultimo, ordens: ordens.size, um, meses };
}

/** Linhas da tabela: a ordem da IW38 (tipo, equipamento, quebra), a validação da UBM e o valor (com o preço). */
export function linhasDoHistorico(linhas: LinhaRetirada[], ordens: Map<string, OrdemDoHistorico> | null,
  validacoes: Map<string, { decisao: "ubm" | "almox"; armario: string }>, preco?: number | null): LinhaHistorico[] {
  const chaveOrdem = (o: string) => o.replace(/\D/g, "").replace(/^0+(?=\d)/, "");
  return linhas.map((l) => {
    const o = ordens?.get(chaveOrdem(l.ordem));
    const v = l.quantidade > 0 ? validacoes.get(chaveOrdemMaterial(l.ordem, l.material)) : undefined;
    const eq = o?.equipamento || l.equipamento;
    const linha: LinhaHistorico = {
      data: isoDia(l.data), ordem: l.ordem, tipo: o?.tipo ?? "", textoOrdem: o?.texto ?? "", equipamento: eq,
      denominacao: o && (!o.equipamento || o.equipamento === eq) ? o.denominacao : "", quantidade: r3(l.quantidade), um: l.um,
      quebra: !!o?.quebra, devolucao: l.quantidade < 0, origem: v?.decisao ?? "", armario: v?.decisao === "ubm" ? v.armario : "",
    };
    if (preco !== undefined) linha.valor = preco == null ? null : Math.round(l.quantidade * preco * 100) / 100;
    return linha;
  });
}

/** Soma dos valores (null = sem preço). */
export function totalValor(linhas: LinhaHistorico[]): number | null {
  if (!linhas.length || linhas.some((l) => l.valor == null)) return linhas.length ? null : 0;
  return Math.round(linhas.reduce((s, l) => s + (l.valor ?? 0), 0) * 100) / 100;
}

/** CSV (separador ;, vírgula decimal, BOM no navegador) do histórico do material; a coluna Valor só com `comValor`. */
export function csvHistorico(material: string, linhas: LinhaHistorico[], comValor: boolean): string {
  const esc = (v: unknown) => `"${String(v ?? "").replaceAll('"', '""')}"`;
  const num = (v: number | null | undefined) => (v == null ? "" : String(v).replace(".", ","));
  const br = (d: string) => (d ? d.split("-").reverse().join("/") : "");
  const cab = ["Material", "Data", "Ordem", "Tipo", "Texto da ordem", "Equipamento", "Denominação", "Quantidade", "UM", "Movimento",
    "Quebra", "Validação UBM", ...(comValor ? ["Valor (R$)"] : [])];
  const corpo = linhas.map((l) => [material, br(l.data), l.ordem, l.tipo, l.textoOrdem, l.equipamento, l.denominacao, num(l.quantidade), l.um,
    l.devolucao ? "Devolução" : "Retirada", l.quebra ? "Sim" : "", l.origem === "ubm" ? `Veio da UBM${l.armario ? ` (${l.armario})` : ""}` : l.origem === "almox" ? "Veio do Almox" : "",
    ...(comValor ? [num(l.valor)] : [])].map(esc).join(";"));
  return [cab.map(esc).join(";"), ...corpo].join("\r\n");
}
