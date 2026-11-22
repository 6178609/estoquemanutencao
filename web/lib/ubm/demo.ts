import { type ItemKit, type Movimento, type TipoMovimento, armarioParaGravar, movimentoParaGravar } from "./regras";

/**
 * Dados FICTÍCIOS da UBM para a demonstração e os testes de ponta a ponta (nada daqui é da empresa): dois armários com
 * kits de códigos do catálogo fictício (lib/dados/demo.ts) e movimentos em volta de agora. As fotos são a mesma imagem
 * PNG fictícia de 1×1 ponto.
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

function movimentosDemoLista(): Movimento[] {
  const h = Date.now();
  const em = (dias: number) => new Date(h - dias * 86_400_000).toISOString();
  const base = { porNome: "Manutentor Fictício", por: "manutentor.ficticio", ordem: "", turno: "", uso: "", observacao: "",
    tipoSolicitacao: "" as const, foto: null, fechadaEm: "", fechadaPor: "",
    lancadoNaOrdem: false, lancadoEm: "", lancadoPor: "" };
  const mov = (id: string, tipo: TipoMovimento, armario: string, dias: number, codigo: string, quantidade: number, x: Partial<Movimento> = {}): Movimento =>
    ({ ...base, id, tipo, armario, em: em(dias), codigo, quantidade, ...x });
  const foto = (arquivo: string) => ({ nome: `${arquivo}.png`, tipo: "image/png", tamanho: 70, arquivo });
  const pcm = { por: "pcm.ficticio", porNome: "PCM Fictício" };
  return [
    // abastecimento inicial (contagem) há 120 dias
    ...KIT_1.map((i, k) => mov(`demo0ubm0cont1${k}`, "contagem", "UBM-01", 120, i.codigo, i.maximo, pcm)),
    ...KIT_2.map((i, k) => mov(`demo0ubm0cont2${k}`, "contagem", "UBM-02", 120, i.codigo, i.maximo, pcm)),
    mov("demo0ubm0ret01", "retirada", "UBM-01", 20, "900007", 2, { ordem: "4100003", turno: "1º turno", uso: "Troca do rolamento do motor da esteira", foto: foto(FOTOS[0]),
      lancadoNaOrdem: true, lancadoEm: em(20), lancadoPor: "Manutentor Fictício" }),
    mov("demo0ubm0ret02", "retirada", "UBM-01", 9, "900028", 6.5, { ordem: "4100010", turno: "2º turno", uso: "Substituição de mangueira com vazamento", foto: foto(FOTOS[1]),
      lancadoNaOrdem: true, lancadoEm: em(8), lancadoPor: "Manutentor Fictício" }),
    mov("demo0ubm0ret03", "retirada", "UBM-01", 3, "900014", 1, { ordem: "9999999", turno: "Administrativo", uso: "Correia gasta na transmissão", foto: foto(FOTOS[2]) }),
    // código fora do kit: candidato a entrar
    mov("demo0ubm0ret04", "retirada", "UBM-02", 2, "900063", 1, { ordem: "4100012", turno: "1º turno", uso: "Retentor para a bomba de recalque", foto: foto(FOTOS[0]) }),
    mov("demo0ubm0rep01", "reposicao", "UBM-01", 1, "900007", 1, pcm),
    mov("demo0ubm0sol01", "solicitacao", "UBM-01", 1, "900021", 1, { tipoSolicitacao: "acabou", observacao: "Último contator usado na parada" }),
  ];
}

export function movimentosUbmDemo(): Record<string, Record<string, unknown>> {
  return Object.fromEntries(movimentosDemoLista().map((m) => [m.id, movimentoParaGravar(m)]));
}

/** As fotos da demonstração (caminho → bytes), lidas por lib/ubm/dados.ts. */
export function fotosUbmDemo(): [string, Uint8Array][] {
  const png = Uint8Array.from(Buffer.from(PNG_DEMO, "base64"));
  return movimentosDemoLista().filter((m) => m.foto).map((m) => [`${PASTA_FOTOS_UBM}/${m.id}/${m.foto!.arquivo}`, png.slice()]);
}
