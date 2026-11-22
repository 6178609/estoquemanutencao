import type { LinhaTomada } from "../wcm/consumo";
import type { Dia } from "../wcm/util";
import { type ItemKit, type Movimento, type TipoMovimento, armarioParaGravar, arquivoMovimentos, movimentoParaGravar, USO_VALIDACAO } from "./regras";
import { chaveValidacao, type Validacao, validacaoParaGravar } from "./validacao";

/**
 * Dados FICTÍCIOS da UBM para a demonstração e os testes de ponta a ponta (nada daqui é da empresa): dois armários com
 * kits de códigos do catálogo fictício (lib/dados/demo.ts) e movimentos em volta de agora. As fotos (das retiradas antigas
 * do QR, mantidas para mostrar a leitura dos dados de antes) são a mesma imagem PNG fictícia de 1×1 ponto. A IW13
 * fictícia usa as ordens YM11 da demonstração (lib/wcm/demo.ts) para gerar pendências na validação do líder (UBM-01).
 */
const PNG_DEMO = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
export const PASTA_FOTOS_UBM = "app/documentos/ubm";

const KIT_1: ItemKit[] = [
  { codigo: "900007", descricao: "", um: "PC", minimo: 2, maximo: 4 },
  { codigo: "900014", descricao: "", um: "PC", minimo: 2, maximo: 2 },
  { codigo: "900021", descricao: "", um: "PC", minimo: 1, maximo: 2 },
  { codigo: "900028", descricao: "", um: "M", minimo: 5, maximo: 10 },
  { codigo: "900035", descricao: "", um: "PC", minimo: 20, maximo: 20 },
];
const KIT_2: ItemKit[] = [
  { codigo: "900042", descricao: "", um: "PC", minimo: 1, maximo: 2 },
  { codigo: "900049", descricao: "", um: "PC", minimo: 1, maximo: 1 },
  { codigo: "900056", descricao: "", um: "M", minimo: 10, maximo: 10 },
];

export function armariosUbmDemo(): Record<string, Record<string, unknown>> {
  const criadoEm = new Date(Date.now() - 200 * 86_400_000).toISOString();
  return {
    "UBM-01": armarioParaGravar({ id: "UBM-01", nome: "Armário Linha 1 (demonstração)", local: "Linha fictícia 1", ativo: true, itens: KIT_1, criadoEm }),
    "UBM-02": armarioParaGravar({ id: "UBM-02", nome: "Armário Utilidades (demonstração)", local: "Casa de máquinas fictícia", ativo: true, itens: KIT_2, criadoEm }),
  };
}

const FOTOS = ["demo0ubmfoto01", "demo0ubmfoto02", "demo0ubmfoto03"];
const MOV_VALIDADA = "demo0ubm0val01";
const LIDER = { por: "lider.ficticio", porNome: "Líder Fictício" };

function movimentosDemoLista(): Movimento[] {
  const h = Date.now();
  const em = (dias: number) => new Date(h - dias * 86_400_000).toISOString();
  const base = { porNome: "Manutentor Fictício", por: "manutentor.ficticio", ordem: "", turno: "", uso: "", observacao: "",
    tipoSolicitacao: "" as const, foto: null, fechadaEm: "", fechadaPor: "", origem: "" as const };
  const mov = (id: string, tipo: TipoMovimento, armario: string, dias: number, codigo: string, quantidade: number, x: Partial<Movimento> = {}): Movimento =>
    ({ ...base, id, tipo, armario, em: em(dias), codigo, quantidade, ...x });
  const foto = (arquivo: string) => ({ nome: `${arquivo}.png`, tipo: "image/png", tamanho: 70, arquivo });
  const pcm = { por: "pcm.ficticio", porNome: "PCM Fictício" };
  return [
    // abastecimento inicial (contagem) há 120 dias
    ...KIT_1.map((i, k) => mov(`demo0ubm0cont1${k}`, "contagem", "UBM-01", 120, i.codigo, i.maximo, pcm)),
    ...KIT_2.map((i, k) => mov(`demo0ubm0cont2${k}`, "contagem", "UBM-02", 120, i.codigo, i.maximo, pcm)),
    // retiradas antigas do QR (desativado): continuam no saldo e no histórico
    mov("demo0ubm0ret01", "retirada", "UBM-01", 20, "900007", 2, { ordem: "4100003", turno: "1º turno", uso: "Troca do rolamento do motor da esteira", foto: foto(FOTOS[0]), origem: "qr" }),
    mov("demo0ubm0ret02", "retirada", "UBM-01", 9, "900028", 6.5, { ordem: "4100010", turno: "2º turno", uso: "Substituição de mangueira com vazamento", foto: foto(FOTOS[1]), origem: "qr" }),
    mov("demo0ubm0ret03", "retirada", "UBM-01", 3, "900014", 1, { ordem: "9999999", turno: "Administrativo", uso: "Correia gasta na transmissão", foto: foto(FOTOS[2]), origem: "qr" }),
    // código fora do kit: candidato a entrar
    mov("demo0ubm0ret04", "retirada", "UBM-02", 2, "900063", 1, { ordem: "4100012", turno: "1º turno", uso: "Retentor para a bomba de recalque", foto: foto(FOTOS[0]), origem: "qr" }),
    // confirmada pelo líder na validação da IW13
    mov(MOV_VALIDADA, "retirada", "UBM-02", 2, "900049", 1, { ...LIDER, ordem: "4199001", uso: USO_VALIDACAO, origem: "validacao" }),
    mov("demo0ubm0rep01", "reposicao", "UBM-01", 1, "900007", 1, pcm),
    mov("demo0ubm0sol01", "solicitacao", "UBM-01", 1, "900021", 1, { tipoSolicitacao: "acabou", observacao: "Último contator usado na parada" }),
  ];
}

/** As validações fictícias do líder (ubm_validacoes.json): uma "veio da UBM" (com a retirada) e uma "veio do Almox". */
export function validacoesUbmDemo(): Record<string, Record<string, unknown>> {
  const h = Date.now();
  const em = (dias: number) => new Date(h - dias * 86_400_000).toISOString();
  const dia = (dias: number) => em(dias).slice(0, 10);
  const vs: Validacao[] = [
    { chave: chaveValidacao("4199001", "900049"), ordem: "4199001", codigo: "900049", decisao: "ubm", armario: "UBM-02", quantidade: 1, um: "PC",
      tomada: 1, dataIw13: dia(4), equipamento: "10000105", em: em(2), ...LIDER, movimento: MOV_VALIDADA },
    { chave: chaveValidacao("4199002", "900042"), ordem: "4199002", codigo: "900042", decisao: "almox", armario: "", quantidade: 2, um: "PC",
      tomada: 2, dataIw13: dia(6), equipamento: "10000109", em: em(1), ...LIDER, movimento: "" },
  ];
  return Object.fromEntries(vs.map((v) => [v.chave, validacaoParaGravar(v)]));
}

/**
 * IW13 fictícia: as 4 ordens YM11 mais recentes até hoje (das bases fictícias) com materiais do kit do UBM-01 (uma com
 * duas linhas do mesmo material, somadas), mais uma ordem que não é de quebra e um material fora do kit (ficam de fora).
 */
export function iw13UbmDemo(ordens: { ordem: string; tipo: string; equipamento: string; data: Dia | null }[], hoje: Dia): LinhaTomada[] {
  const passadas = ordens.filter((o) => o.data != null && o.data <= hoje).sort((a, b) => (b.data ?? 0) - (a.data ?? 0));
  const quebras = passadas.filter((o) => o.tipo === "YM11").slice(0, 4);
  const outra = passadas.find((o) => o.tipo === "YM13");
  const l = (o: { ordem: string; equipamento: string }, material: string, quantidade: number, um: string, dias: number): LinhaTomada =>
    ({ ordem: o.ordem, material: `000000000000${material}`.slice(-18), quantidade, um, descricao: "", equipamento: o.equipamento, data: hoje - dias });
  const [a, b, c, d] = quebras;
  return [
    ...(a ? [l(a, "900007", 1, "PC", 1), l(a, "900028", 1.5, "M", 1), l(a, "900028", 1, "M", 1), l(a, "900063", 1, "PC", 1)] : []),
    ...(b ? [l(b, "900014", 1, "PC", 2), l(b, "900035", 4, "PC", 2)] : []),
    ...(c ? [l(c, "900021", 1, "PC", 3)] : []),
    ...(d ? [l(d, "900007", 2, "PC", 5)] : []),
    ...(outra ? [l(outra, "900007", 1, "PC", 2)] : []),
  ];
}

/** Os movimentos fictícios nos cadastros mensais (ubm_movimentos_<AAAA-MM>.json), como no repositório de dados. */
export function movimentosUbmDemoPorArquivo(): [string, Record<string, Record<string, unknown>>][] {
  const porArquivo = new Map<string, Record<string, Record<string, unknown>>>();
  for (const m of movimentosDemoLista()) {
    const nome = arquivoMovimentos(m.em);
    porArquivo.set(nome, { ...porArquivo.get(nome), [m.id]: movimentoParaGravar(m) });
  }
  return [...porArquivo];
}

/** As fotos da demonstração (caminho → bytes), lidas por lib/ubm/dados.ts. */
export function fotosUbmDemo(): [string, Uint8Array][] {
  const png = Uint8Array.from(Buffer.from(PNG_DEMO, "base64"));
  return movimentosDemoLista().filter((m) => m.foto).map((m) => [`${PASTA_FOTOS_UBM}/${m.id}/${m.foto!.arquivo}`, png.slice()]);
}
