/**
 * Validação do líder (aba UBM, pedido do usuário 22/11/2026) — só as regras, sem gravar nada (gravação em
 * lib/ubm/dados.ts). Substitui o antigo QR de retirada: o material usado numa ordem de QUEBRA aparece na IW13 (consumo
 * por ordem, lançado pelo SAP Mobile), mas a IW13 não diz se saiu do armário kanban ou do Almox — o líder confirma.
 *
 * Pendência = (ordem, material) da IW13 com:
 * - Tomados > 0 (as linhas repetidas da mesma ordem e material são somadas);
 * - material no kit de algum armário ATIVO (código comparado sem zeros à esquerda: `normalizarCodigo`);
 * - ordem de QUEBRA pela regra em vigor no site (lib/wcm/preparo.ts, `regraQuebra`): na regra "y1" (padrão da planta),
 *   só a ordem com nota de quebra da IW28 (`marcarQuebras`: nota Y1 convertida em ordem YM11); na regra "ym11" (IW28 sem
 *   notas Y1), a ordem do tipo YM11 (`TIPO_ORDEM_QUEBRA`) na IW38 ou com nota marcada como quebra;
 * - data de lançamento (a mais recente das linhas) no período escolhido (dia de Brasília; padrão: últimos 30 dias);
 * - quantidade ainda não coberta: tomada na IW13 − já validada (UBM ou Almox) − retiradas antigas do QR da mesma ordem +
 *   código. Consumo novo na mesma ordem (IW13 atualizada) volta como pendência só da diferença.
 *
 * Decisões no cadastro `ubm_validacoes.json` (um só; chave `<ordem sem zeros>|<código>#<n>`, um lote por validação). A
 * gravação relê o cadastro e recusa o mesmo lote gravado por outra pessoa ao mesmo tempo ("já validado por X"). "Veio da
 * UBM" também cria a retirada (origem "validacao", com a data do lançamento na IW13) nos movimentos mensais, que baixa o
 * saldo como qualquer retirada. Testado em testes/ubmValidacao.test.ts.
 */
import { type RegraQuebra, TIPO_ORDEM_QUEBRA } from "../wcm/preparo";
import type { Dia } from "../wcm/util";
import {
  type Armario, chaveOrdem, diaBr, type Filtro, fmtQtd, idArmarioValido, type Movimento, normalizarCodigo, normalizarOrdem, saldos,
  saldoDe, validarQuantidade,
} from "./regras";

export const ARQ_VALIDACOES = "ubm_validacoes.json";
/** IW13 com mais de 7 dias sem envio: a tela avisa (as pendências ficam velhas). */
export const DIAS_IW13_VELHA = 7;
export const DIAS_PADRAO = 30;
export type Decisao = "almox" | "ubm";
export const DECISOES: Record<Decisao, string> = { ubm: "Veio da UBM", almox: "Veio do Almox" };

/** Linha da IW13 com retirada (lib/wcm/consumo.ts → `tomadas`). */
export interface LinhaIw13 { ordem: string; material: string; quantidade: number; um: string; descricao: string; equipamento: string; data: Dia | null }
/** A ordem nas bases do SAP (IW38/IW28): texto, equipamento, tipo e se é de quebra. */
export interface InfoOrdem { texto: string; equipamento: string; denominacao: string; tipo: string; quebra: boolean; nota: string; notaTexto: string }

export interface Validacao {
  /** chave do lote: `<linha>#<n>`; `linha` = `<ordem sem zeros>|<código>` */
  chave: string; linha: string; ordem: string; codigo: string; decisao: Decisao;
  /** "ubm": armário e quantidade confirmados (na UM do kit); "almox": vazio e a quantidade tomada */
  armario: string; quantidade: number; um: string;
  /** o que a validação cobriu da IW13 (a diferença pendente na hora, na UM da IW13), a data de lançamento e o equipamento */
  tomada: number; umIw13: string; dataIw13: string; equipamento: string;
  em: string; por: string; porNome: string;
  /** "ubm": o id da retirada criada (apagada junto ao desfazer) */
  movimento: string;
}

const txt = (v: unknown, max = 200) => String(v ?? "").replace(/[\u0000-\u001f\u007f]+/g, " ").trim().slice(0, max);
const r2 = (n: number) => Math.round(n * 100) / 100;
const ehObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

/** Chave da linha (ordem + código): a ordem só com os dígitos, sem zeros à esquerda (ou o texto, se não tiver dígito). */
export function chaveValidacao(ordem: string, codigo: string): string {
  return `${chaveOrdem(ordem) || normalizarOrdem(ordem)}|${normalizarCodigo(codigo)}`;
}

/** Linha (ordem|código) de uma chave de lote. */
export const linhaDaChave = (chave: string) => chave.split("#")[0];
/** A próxima chave de lote da linha (maior número + 1). */
export function proximaChave(linha: string, vs: Pick<Validacao, "chave" | "linha">[]): string {
  const n = vs.filter((v) => v.linha === linha).reduce((m, v) => Math.max(m, Number(v.chave.split("#")[1]) || 1), 0);
  return `${linha}#${n + 1}`;
}
/** UM comparável (maiúsculas, sem ponto; PÇ = PC). */
export const umIgual = (a: string, b: string) => {
  const n = (x: string) => x.trim().toUpperCase().replace(/\.$/, "").replace("Ç", "C");
  return !a.trim() || !b.trim() || n(a) === n(b);
};
/**
 * Instante gravado na retirada da validação: o dia do lançamento na IW13 ao meio-dia de Brasília (15h UTC). Assim uma
 * contagem feita depois do consumo (e antes da validação) já a inclui e o saldo não baixa duas vezes. Sem data: agora.
 */
export const emDaRetirada = (dataIw13: string, agora: string) => (/^\d{4}-\d{2}-\d{2}$/.test(dataIw13) ? `${dataIw13}T15:00:00.000Z` : agora);

/** AAAA-MM-DD de um Dia (dias desde 01/01/1970), "" sem data. */
export const isoDeDia = (d: Dia | null | undefined) => (d == null ? "" : new Date(d * 86_400_000).toISOString().slice(0, 10));

// ----------------------------------------------------------------------------
// Ordens de quebra
// ----------------------------------------------------------------------------
/**
 * Mapa chave da ordem → InfoOrdem. `ordens` = IW38 com o tipo; `notas` = IW28 já marcada por `marcarQuebras` com a
 * `regra` em vigor. Quebra: regra "y1" → nota de quebra apontando para a ordem; regra "ym11" → tipo YM11 ou nota de quebra.
 */
export function mapaOrdens(ordens: { ordem: string; tipo: string; texto: string; equipamento: string }[],
  notas: { ordem: string; quebra: boolean; nota: string; descricao: string; equipamento?: string }[],
  nomesEquip: Map<string, string> = new Map(), regra: RegraQuebra = "ym11"): Map<string, InfoOrdem> {
  const m = new Map<string, InfoOrdem>();
  for (const o of ordens) {
    const k = chaveOrdem(o.ordem);
    if (!k || m.has(k)) continue;
    const tipo = o.tipo.trim().toUpperCase();
    m.set(k, { texto: o.texto, equipamento: o.equipamento, denominacao: nomesEquip.get(o.equipamento) ?? "", tipo,
      // regra "y1": só a nota de quebra marca a ordem (como no resto do site); "ym11": o tipo YM11 basta
      quebra: regra === "ym11" && tipo === TIPO_ORDEM_QUEBRA, nota: "", notaTexto: "" });
  }
  for (const n of notas) {
    if (!n.quebra) continue;
    const k = chaveOrdem(n.ordem);
    if (!k) continue;
    const o = m.get(k);
    if (o) { o.quebra = true; if (!o.nota) { o.nota = n.nota; o.notaTexto = n.descricao; } }
    else m.set(k, { texto: n.descricao, equipamento: n.equipamento ?? "", denominacao: nomesEquip.get(n.equipamento ?? "") ?? "", tipo: "",
      quebra: true, nota: n.nota, notaTexto: n.descricao });
  }
  return m;
}

// ----------------------------------------------------------------------------
// Pendências
// ----------------------------------------------------------------------------
export interface OpcaoArmario { id: string; nome: string; um: string; saldo: number }
export interface ItemPendente {
  /** a linha (ordem|código); `tomada` = o que falta validar (total da IW13 − já validado − retiradas antigas do QR) */
  chave: string; ordem: string; codigo: string; tomada: number; tomadaTotal: number; jaCoberta: number;
  /** UM da IW13 e a do kit (a quantidade segue a do kit) */
  umIw13: string; descricao: string; data: string; equipamento: string;
  /** armários ativos com o material no kit (o líder escolhe quando há mais de um) */
  armarios: OpcaoArmario[];
}
export interface OrdemPendente { ordem: string; chaveOrdem: string; data: string; equipamento: string; info: InfoOrdem | null; itens: ItemPendente[] }

/** Soma da IW13 por ordem + código (Tomados > 0), com a data de lançamento mais recente. */
type Soma = Omit<ItemPendente, "armarios" | "tomadaTotal" | "jaCoberta">;
export function somarIw13(linhas: LinhaIw13[]): Map<string, Soma> {
  const m = new Map<string, Soma>();
  for (const l of linhas) {
    if (!(l.quantidade > 0)) continue;
    const codigo = normalizarCodigo(l.material);
    const ordem = normalizarOrdem(l.ordem).replace(/^0+(?=\d)/, "");
    if (!codigo || !ordem) continue;
    const k = chaveValidacao(ordem, codigo);
    const d = isoDeDia(l.data);
    const a = m.get(k);
    if (!a) { m.set(k, { chave: k, ordem, codigo, tomada: r2(l.quantidade), umIw13: txt(l.um, 10).toUpperCase(), descricao: txt(l.descricao, 120), data: d, equipamento: txt(l.equipamento, 40) }); continue; }
    a.tomada = r2(a.tomada + l.quantidade);
    if (d > a.data) a.data = d;
    a.umIw13 ||= txt(l.um, 10).toUpperCase();
    a.descricao ||= txt(l.descricao, 120);
    a.equipamento ||= txt(l.equipamento, 40);
  }
  return m;
}

/**
 * Quantidade já coberta por linha (ordem|código): as validações (o que cada uma cobriu da IW13) e as retiradas antigas do
 * QR (as da validação já estão nas validações).
 */
export function cobertas(movs: Movimento[], validacoes: Validacao[]): Map<string, number> {
  const m = new Map<string, number>();
  const soma = (k: string, q: number) => m.set(k, r2((m.get(k) ?? 0) + q));
  for (const x of movs) if (x.tipo === "retirada" && x.origem !== "validacao" && x.ordem && x.codigo) soma(chaveValidacao(x.ordem, x.codigo), x.quantidade);
  for (const v of validacoes) soma(v.linha, v.tomada);
  return m;
}

const dataOk = (s: string | undefined) => (/^\d{4}-\d{2}-\d{2}$/.test(s ?? "") ? s! : "");

/**
 * A lista de pendências do líder, agrupada por ordem (a mais recente primeiro). `filtro.armario` limita aos materiais do
 * kit desse armário; `filtro.de/ate` = período da data de lançamento na IW13.
 */
export function pendencias(linhas: LinhaIw13[], ordens: Map<string, InfoOrdem>, armarios: Armario[], movs: Movimento[],
  validacoes: Validacao[], filtro: Filtro): OrdemPendente[] {
  const so = idArmarioValido(filtro.armario ?? "") ? filtro.armario : "";
  const ativos = armarios.filter((a) => a.ativo && (!so || a.id === so));
  const s = saldos(movs);
  const noKit = new Map<string, OpcaoArmario[]>();
  for (const a of ativos) for (const i of a.itens)
    noKit.set(i.codigo, [...(noKit.get(i.codigo) ?? []), { id: a.id, nome: a.nome, um: i.um, saldo: saldoDe(s, a.id, i.codigo) }]);
  const feitas = cobertas(movs, validacoes);
  const de = dataOk(filtro.de), ate = dataOk(filtro.ate);
  const porOrdem = new Map<string, OrdemPendente>();
  for (const it of somarIw13(linhas).values()) {
    const arms = noKit.get(it.codigo);
    const jaCoberta = feitas.get(it.chave) ?? 0;
    const falta = r2(it.tomada - jaCoberta);
    if (!arms || falta <= 0) continue;
    const ko = it.chave.split("|")[0];
    const info = ordens.get(ko);
    if (!info?.quebra) continue;
    if ((de && (!it.data || it.data < de)) || (ate && it.data > ate)) continue;
    const g = porOrdem.get(ko) ?? { ordem: it.ordem, chaveOrdem: ko, data: "", equipamento: it.equipamento || info.equipamento, info, itens: [] };
    g.itens.push({ ...it, tomada: falta, tomadaTotal: it.tomada, jaCoberta, armarios: arms });
    if (it.data > g.data) g.data = it.data;
    porOrdem.set(ko, g);
  }
  return [...porOrdem.values()].map((g) => ({ ...g, itens: g.itens.sort((a, b) => a.codigo.localeCompare(b.codigo)) }))
    .sort((a, b) => b.data.localeCompare(a.data) || b.ordem.localeCompare(a.ordem, "pt-BR", { numeric: true }));
}

/** Total de materiais pendentes (para o KPI). */
export const totalPendente = (ps: OrdemPendente[]) => ps.reduce((n, p) => n + p.itens.length, 0);

// ----------------------------------------------------------------------------
// Entrada da decisão
// ----------------------------------------------------------------------------
export interface EntradaValidacao { decisao: string; armario: string; quantidade: string }

/**
 * Confere a decisão contra a pendência (lida no servidor, nunca a do formulário): "almox" não pede mais nada; "ubm"
 * pede um dos armários com o material no kit e a quantidade (padrão = tomada) no formato da UM do kit.
 */
export function validarDecisao(e: EntradaValidacao, item: ItemPendente):
  { erro: string } | { decisao: Decisao; armario: string; quantidade: number; um: string } {
  const decisao = txt(e.decisao, 10);
  if (decisao === "almox") return { decisao, armario: "", quantidade: item.tomada, um: item.umIw13 };
  if (decisao !== "ubm") return { erro: "Escolha se o material veio da UBM ou do Almox." };
  const id = txt(e.armario, 20).toUpperCase();
  const arm = item.armarios.length === 1 && !id ? item.armarios[0] : item.armarios.find((a) => a.id === id);
  if (!arm) return { erro: item.armarios.length > 1 ? "Escolha de qual armário saiu o material." : "Armário inválido para este material." };
  // UM da IW13 diferente da do kit: a quantidade tem de vir digitada (na UM do kit), sem o padrão
  const mesmaUm = umIgual(item.umIw13, arm.um);
  if (!mesmaUm && !txt(e.quantidade)) return { erro: `UM diferente (IW13: ${item.umIw13}, kit: ${arm.um}): informe a quantidade em ${arm.um}.` };
  const q = validarQuantidade(txt(e.quantidade) || String(item.tomada), arm.um);
  if (typeof q === "string") return { erro: q };
  return { decisao, armario: arm.id, quantidade: q, um: arm.um };
}

/** Desfazer uma validação: só quem gere a UBM (o líder valida, o PCM corrige). */
export const podeDesfazer = (q: { gerir: boolean }) => q.gerir;
/** Validar: quem vê a aba e não é Terceiro nem Manutentor (Líder, Analista e as outras funções). */
export const podeValidar = (q: { validar: boolean }) => q.validar;

// ----------------------------------------------------------------------------
// Leitura segura do cadastro
// ----------------------------------------------------------------------------
export function validacaoDe(chave: string, v: unknown): Validacao | null {
  if (!ehObj(v) || !/^[^|#]{1,40}\|[A-Z0-9][A-Z0-9.\-/_]{0,39}(#\d{1,4})?$/.test(chave)) return null;
  const linha = linhaDaChave(chave);
  const decisao = v.decisao === "ubm" || v.decisao === "almox" ? v.decisao : null;
  const q = Number(v.quantidade), t = Number(v.tomada);
  if (!decisao || !Number.isFinite(q) || q < 0) return null;
  const armario = txt(v.armario, 20).toUpperCase();
  if (decisao === "ubm" && !idArmarioValido(armario)) return null;
  return {
    chave, linha, ordem: normalizarOrdem(v.ordem) || linha.split("|")[0], codigo: normalizarCodigo(v.codigo) || linha.split("|")[1], decisao,
    armario: decisao === "ubm" ? armario : "", quantidade: r2(q), um: txt(v.um, 10), tomada: Number.isFinite(t) ? r2(t) : r2(q), umIw13: txt(v.umIw13, 10),
    dataIw13: dataOk(txt(v.dataIw13, 10)), equipamento: txt(v.equipamento, 40), em: txt(v.em, 40), por: txt(v.por, 80),
    porNome: txt(v.porNome, 120), movimento: /^[a-z0-9]{6,32}$/.test(String(v.movimento ?? "")) ? String(v.movimento) : "",
  };
}

/** As validações válidas, da mais nova para a mais antiga. */
export function validacoesDe(cad: Record<string, unknown>): Validacao[] {
  return Object.entries(cad).map(([k, v]) => validacaoDe(k, v)).filter((v): v is Validacao => v != null)
    .sort((a, b) => b.em.localeCompare(a.em) || a.chave.localeCompare(b.chave));
}

export function validacaoParaGravar(v: Validacao): Record<string, unknown> {
  const { chave: _c, linha: _l, ...resto } = v;
  void _c; void _l;
  return Object.fromEntries(Object.entries(resto).filter(([, x]) => x !== "" && x !== null));
}

/** Filtro do histórico: período pela data da validação (dia de Brasília), armário e decisão. */
export function filtrarValidacoes(vs: Validacao[], f: Filtro & { decisao?: string }): Validacao[] {
  const de = dataOk(f.de), ate = dataOk(f.ate);
  const arm = idArmarioValido(f.armario ?? "") ? f.armario : "";
  return vs.filter((v) => {
    const d = diaBr(v.em);
    return (!de || d >= de) && (!ate || d <= ate) && (!arm || v.decisao !== "ubm" || v.armario === arm)
      && (f.decisao !== "ubm" && f.decisao !== "almox" ? true : v.decisao === f.decisao);
  });
}

// ----------------------------------------------------------------------------
// Análise
// ----------------------------------------------------------------------------
export interface ConsumoAlmox extends Validacao {
  /** saldo somado dos armários ativos com o item, no fim do dia de lançamento na IW13, e a UM do kit */
  saldoNaData: number; umKit: string;
  motivo: "sem_saldo" | "saldo_insuficiente" | "nao_usada";
}
export const MOTIVOS: Record<ConsumoAlmox["motivo"], string> = {
  sem_saldo: "UBM sem saldo", saldo_insuficiente: "Saldo da UBM menor que o usado", nao_usada: "Tinha saldo: UBM não usada",
};

export interface AnaliseValidacao {
  validacoes: number; ubm: number; almox: number;
  /** % das validações que vieram da UBM (null sem validações) */
  pctUbm: number | null;
  /** dias entre o lançamento na IW13 e a validação: média, mediana e o maior (null sem dados) */
  diasMedia: number | null; diasMediana: number | null; diasMax: number | null;
  /** consumo de itens do kit em ordens de quebra que veio do Almox, com o saldo da UBM no dia */
  doAlmox: ConsumoAlmox[];
}

/**
 * Validações no filtro (período pela data da validação). Para cada "veio do Almox", o saldo da UBM no dia do lançamento
 * na IW13 (movimentos até o fim do dia de Brasília): mostra se a UBM estava sem saldo ou simplesmente não foi usada.
 */
export function analisarValidacoes(vs: Validacao[], armarios: Armario[], movs: Movimento[], f: Filtro): AnaliseValidacao {
  const doFiltro = filtrarValidacoes(vs, { de: f.de, ate: f.ate });
  const ubm = doFiltro.filter((v) => v.decisao === "ubm" && (!idArmarioValido(f.armario ?? "") || v.armario === f.armario)).length;
  const arm = idArmarioValido(f.armario ?? "") ? f.armario : "";
  const comItem = (codigo: string) => armarios.filter((a) => a.ativo && (!arm || a.id === arm) && a.itens.some((i) => i.codigo === codigo));
  const kit = (codigo: string) => comItem(codigo).map((a) => a.id);
  const doAlmox = doFiltro.filter((v) => v.decisao === "almox" && kit(v.codigo).length).map((v): ConsumoAlmox => {
    const ate = v.dataIw13 || diaBr(v.em);
    const s = saldos(movs.filter((m) => diaBr(m.em) <= ate));
    const saldo = r2(kit(v.codigo).reduce((t, a) => t + saldoDe(s, a, v.codigo), 0));
    const umKit = comItem(v.codigo)[0]?.itens.find((i) => i.codigo === v.codigo)?.um ?? "";
    // UMs diferentes (IW13 × kit): não compara as quantidades, só se havia saldo
    const comparavel = umIgual(v.umIw13 || v.um, umKit);
    return { ...v, saldoNaData: saldo, umKit, motivo: saldo <= 0 ? "sem_saldo" : comparavel && saldo < v.tomada ? "saldo_insuficiente" : "nao_usada" };
  });
  const almox = doFiltro.filter((v) => v.decisao === "almox").length;
  const dias = doFiltro.filter((v) => v.dataIw13 && diaBr(v.em)).map((v) =>
    Math.max(0, Math.round((Date.parse(`${diaBr(v.em)}T12:00:00Z`) - Date.parse(`${v.dataIw13}T12:00:00Z`)) / 86_400_000))).sort((a, b) => a - b);
  const total = ubm + almox;
  return {
    validacoes: total, ubm, almox, pctUbm: total ? Math.round((ubm / total) * 1000) / 10 : null,
    diasMedia: dias.length ? Math.round((dias.reduce((a, b) => a + b, 0) / dias.length) * 10) / 10 : null,
    diasMediana: dias.length ? (dias.length % 2 ? dias[(dias.length - 1) / 2] : (dias[dias.length / 2 - 1] + dias[dias.length / 2]) / 2) : null,
    diasMax: dias.length ? dias[dias.length - 1] : null,
    doAlmox,
  };
}

/** "2,5 M" */
export const qtdUm = (q: number, um: string) => `${fmtQtd(q)}${um ? ` ${um}` : ""}`;
