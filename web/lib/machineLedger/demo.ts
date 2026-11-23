/**
 * Machine Ledger da demonstração: máquinas, códigos e descrições INVENTADOS (nada da empresa), montados em volta do catálogo
 * e da MB52 fictícios (lib/dados/demo.ts) e dos equipamentos fictícios (lib/wcm/demo.ts: 10000100 = Prensa hidráulica 01,
 * 10000101 = Injetora 01, 10000113 = Compressor 02) para gerar achados de cada tipo do pente fino.
 */
import { ARQ_INDICE, arquivoLedger, type Atividade, type Componente, type Consumido, type Indice, itemIndice, type Peca } from "./regras";

interface CatDemo { material: string; descricaoCurta: string; descrCompleta: string; status: string }
interface EstDemo { material: string; estoque: number }

const comp = (conjunto: string, subconjunto: string, componente: string, codigo: string, p: number, t: number, v: number, seg = false, qual = false,
  equip = "PRENSA HIDRAULICA 01"): Componente => {
  const h = p + t + v + (seg ? 6 : 0) + (qual ? 4 : 0);
  return { equip, conjunto, subconjunto, componente, codigo, qtd: "1", funcao: "Função fictícia de demonstração", falha: "Não cumpre a função",
    deterioracao: "NATURAL", modo: "Desgaste", efeito: "Máquina parada", evidente: true, oculta: false, seguranca: seg, qualidade: qual, parada: true,
    p, t, v, h, classe: h <= 5 ? "C" : h < 9 ? "B" : "A", tipoManut: "TBM" };
};
const peca = (conjunto: string, codigo: string, descricao: string, extra: Partial<Peca> = {}): Peca => ({
  conjunto, codigo, descricao, consumivel: "Consumível", classe: "Mecânico", estrategico: false, reserva: false, estSegAlmox: null, valorUnit: 100,
  area: "Almox", posicao: "A-01", estSegUbm: null, ...extra });
const ativ = (componente: string, atividade: string, planoSap = ""): Atividade => ({
  conjunto: "SISTEMA HIDRAULICO", subconjunto: "", componente, atividade, cilr: "", tipo: "MANUTENÇÃO MP", tempoMin: 30, periodicidade: "MENSAL",
  mec: 1, ele: 0, procedimento: "", planoSap });

/** Os ledgers fictícios, escolhendo itens do catálogo fictício de forma fixa. */
export function ledgersDemo(catalogo: CatDemo[], estoque: EstDemo[]): { indice: Indice; componentes: Componente[]; plano: Atividade[]; pecas: Peca[] }[] {
  const ativos = catalogo.filter((c) => c.status === "APROVADO");
  const noEstoque = new Set(estoque.filter((e) => e.estoque > 0).map((e) => e.material));
  const comSaldo = ativos.filter((c) => noEstoque.has(c.material));
  const semSaldo = ativos.filter((c) => !estoque.some((e) => e.material === c.material));
  const inativo = catalogo.find((c) => c.status === "BLOQUEADO") ?? catalogo[0];
  const porPdm = (p: string, i = 0) => ativos.filter((c) => c.descricaoCurta.startsWith(p))[i] ?? ativos[i];
  const rol = porPdm("ROLAMENTO"), cor = porPdm("CORREIA"), sen = porPdm("SENSOR"), val = porPdm("VALVULA");
  const usados = new Set([rol, cor, sen, val, semSaldo[0]].map((c) => c?.material));
  const unico = ativos.find((c) => !usados.has(c.material) && /^CONTATOR/.test(c.descricaoCurta)
    && ativos.filter((x) => x.descricaoCurta === c.descricaoCurta).length === 1) ?? ativos[5];
  const base = { tipo: "maquina" as const, revisao: "01/03/2026", origem: "automatica" as const, sugestoes: [], enviadoEm: "2026-01-10T12:00:00Z",
    enviadoPor: "Carga inicial (demonstração)", confirmadoEm: "", confirmadoPor: "" };

  const prensaComp = [
    comp("SISTEMA HIDRAULICO", "BOMBA", "ROLAMENTO RIGIDO DE ESFERAS DA BOMBA", rol.material, 3, 4, 2, false, true),
    comp("SISTEMA HIDRAULICO", "CILINDRO PRINCIPAL", "VEDACAO DO CILINDRO", "", 1, 2, 1),
    comp("TRANSMISSAO", "ACIONAMENTO", "CORREIA EM V DO ACIONAMENTO", cor.material, 4, 1, 1),
    comp("SISTEMA ELETRICO", "PAINEL ELETRICO", "FUSIVEL DE COMANDO", "", 1, 1, 1),
    comp("SISTEMA ELETRICO", "SENSORES", "SENSOR INDUTIVO DE POSICAO", `SysMat-${sen.material}`, 2, 2, 2, true, true),
    comp("SISTEMA PNEUMATICO", "CIRCUITO DE AR", "MANGUEIRA PNEUMATICA", "", 2, 1, 1),
    comp("SISTEMA ELETRICO", "ACIONAMENTO", "MOTOR ELETRICO PRINCIPAL", "", 1, 5, 5, true),
  ];
  const prensaPecas = [
    peca("SISTEMA HIDRAULICO", rol.material, "ROLAMENTO RIGIDO DE ESFERAS", { estrategico: true, estSegAlmox: 2, estSegUbm: 2 }),
    peca("TRANSMISSAO", cor.material, "CORREIA EM V", { reserva: true }),
    peca("SISTEMA ELETRICO", sen.material, "SENSOR INDUTIVO"),
    peca("SISTEMA HIDRAULICO", val.material, "CORREIA DENTADA HTD 8M"), // descrição trocada: o código é de uma válvula
    peca("SISTEMA HIDRAULICO", semSaldo[0].material, "PECA ESTRATEGICA SEM SALDO", { estrategico: true, estSegAlmox: 1 }),
    peca("SISTEMA HIDRAULICO", "1234567", "VALVULA DE ALIVIO (CODIGO QUE NAO EXISTE)"),
    peca("SISTEMA HIDRAULICO", inativo.material, "ITEM COM CADASTRO BLOQUEADO"),
    peca("SISTEMA ELETRICO", "", unico.descricaoCurta, { estSegUbm: 1 }), // sem código: achado pela descrição curta
  ];
  const injComp = [
    comp("UNIDADE DE INJECAO", "ROSCA", "ROLAMENTO AXIAL DA ROSCA", comSaldo[3]?.material ?? "", 2, 4, 3, false, true, "INJETORA 01"),
    comp("UNIDADE DE FECHAMENTO", "MOLDE", "SENSOR DE MOLDE FECHADO", comSaldo[4]?.material ?? "", 3, 2, 2, true, false, "INJETORA 01"),
  ];
  const injPecas = [peca("UNIDADE DE INJECAO", comSaldo[3]?.material ?? "", "ROLAMENTO AXIAL"), peca("UNIDADE DE FECHAMENTO", comSaldo[4]?.material ?? "", "SENSOR")];
  // ledger copiado: o RCM ainda aponta a máquina de onde foi copiado
  const compComp = [comp("COMPRESSAO", "CABECOTE", "VALVULA DE ADMISSAO", comSaldo[6]?.material ?? "", 2, 2, 2, false, false, "COMPRESSOR 01"),
    comp("COMPRESSAO", "CABECOTE", "FILTRO DE AR", "", 1, 1, 1, false, false, "COMPRESSOR 01")];

  const cont = (c: Componente[], p: Atividade[], x: Peca[]) => ({ componentes: c.length, plano: p.length, pecas: x.length });
  const prensaPlano = [ativ("ROLAMENTO RIGIDO DE ESFERAS DA BOMBA", "Inspecionar ruído e temperatura do rolamento", "80000"),
    ativ("CORREIA EM V DO ACIONAMENTO", "Verificar a tensão da correia", "79999"), ativ("VEDACAO DO CILINDRO", "Inspecionar vazamento")];
  return [
    { indice: { ...base, id: "ml-demo0001", arquivo: "MACHINE LEDGER - PRENSA HIDRAULICA 01 (ficticia).xlsx", nome: "PRENSA HIDRAULICA 01 (fictícia)",
      capa: { maquina: "Prensa hidráulica", fabricante: "FICTPRESS", modelo: "FP-200", area: "Galpão 1", funcao: "Prensa fictícia da demonstração." },
      equipamentos: ["10000100"], contagens: cont(prensaComp, prensaPlano, prensaPecas) }, componentes: prensaComp, plano: prensaPlano, pecas: prensaPecas },
    { indice: { ...base, id: "ml-demo0002", arquivo: "MACHINE LEDGER - INJETORA 01 (ficticia).xlsx", nome: "INJETORA 01 (fictícia)",
      capa: { maquina: "Injetora", fabricante: "SKF", modelo: "INJ-9", area: "Galpão 2", funcao: "Injetora fictícia da demonstração." },
      equipamentos: ["10000101"], sugestoes: [{ sap: "10000111", denominacao: "Injetora 02", confianca: "media", motivo: "mesmo modelo (demonstração)" }],
      contagens: cont(injComp, [], injPecas) }, componentes: injComp, plano: [], pecas: injPecas },
    { indice: { ...base, id: "ml-demo0003", arquivo: "MACHINE LEDGER - COMPRESSOR 02 (ficticio).xlsx", nome: "COMPRESSOR 02 (fictício)",
      capa: { maquina: "Compressor", fabricante: "ARFICT", modelo: "AF-10", area: "Utilidades", funcao: "Compressor fictício da demonstração." },
      equipamentos: ["10000113"], contagens: cont(compComp, [], []) }, componentes: compComp, plano: [], pecas: [] },
    { indice: { ...base, id: "ml-demo0004", tipo: "modelo", arquivo: "MACHINE LEDGER - PRENSA HIDRAULICA (modelo).xlsx", nome: "PRENSA HIDRAULICA (modelo fictício)",
      capa: { maquina: "Prensa hidráulica", fabricante: "FICTPRESS", modelo: "FP-200", area: "", funcao: "Modelo fictício (sem equipamento ligado)." },
      equipamentos: [], sugestoes: [{ sap: "10000110", denominacao: "Prensa hidráulica 02", confianca: "baixa", motivo: "mesmo tipo (demonstração)" }],
      contagens: cont(prensaComp.slice(0, 3), [], []) }, componentes: prensaComp.slice(0, 3), plano: [], pecas: [] },
  ];
}

/** Os cadastros fictícios (índice + um arquivo por ledger) e os vínculos de peças da prensa fictícia. */
export function cadastrosLedgerDemo(catalogo: CatDemo[], estoque: EstDemo[]): { cadastros: [string, Record<string, Record<string, unknown>>][]; vinculos: Record<string, Record<string, unknown>> } {
  const ls = ledgersDemo(catalogo, estoque);
  const indice = Object.fromEntries(ls.map(({ indice: { id, ...resto } }) => [id, itemIndice(resto)]));
  const arquivos = ls.map((l) => [arquivoLedger(l.indice.id), { ledger: { componentes: l.componentes, plano: l.plano, pecas: l.pecas } }] as [string, Record<string, Record<string, unknown>>]);
  // a prensa tem o rolamento vinculado (os outros do ledger ficam "faltando") e uma peça de fora (sem respaldo, fabricante SKF de outro ledger)
  const skf = catalogo.find((c) => c.status === "APROVADO" && /\bSKF\b/.test(c.descrCompleta) && !ls[0].pecas.some((p) => p.codigo === c.material));
  const fora = catalogo.filter((c) => c.status === "APROVADO" && /^CONTATOR/.test(c.descricaoCurta))[0];
  const vinculos = { "10000100": { materiais: [ls[0].pecas[0].codigo, ...(fora ? [fora.material] : []), ...(skf ? [skf.material] : [])], criado_pelo_mro: true } };
  return { cadastros: [[ARQ_INDICE, indice], ...arquivos], vinculos };
}

const g = globalThis as unknown as { __cmConsumoMlDemo?: Map<string, Consumido[]> };
/** IW13 fictícia: o que a prensa e a injetora fictícias consumiram (parte fora do ledger). */
export function consumoDemo(): Map<string, Consumido[]> {
  return (g.__cmConsumoMlDemo ??= new Map([
    ["10000100", [{ material: "900007", descricao: "ITEM CONSUMIDO FORA DO LEDGER (demonstração)", ordens: 3, quantidade: 4 },
      { material: "900014", descricao: "OUTRO ITEM CONSUMIDO (demonstração)", ordens: 1, quantidade: 1 }]],
    ["10000101", [{ material: "900021", descricao: "ITEM DA INJETORA (demonstração)", ordens: 2, quantidade: 2 }]],
  ]));
}

/**
 * AFs fictícias da prensa fictícia (10000100) no ano pedido, além das AFs geradas pela demonstração: mostram o calendário
 * de quebras com associação ao componente, ao subconjunto e sem associação.
 */
export function quebrasDemo(ano: number, diaDe: (a: number, m: number, d: number) => number | null): import("./regras").Quebra[] {
  const q = (n: number, m: number, d: number, texto: string, componente = "") => ({ fonte: "AF" as const, numero: `AF-DEMO-${n}`, data: diaDe(ano, m, d),
    equipamento: "10000100", conjunto: "", subconjunto: "", componente, texto, criticidade: n % 2 ? "A" : "B", os: String(4_200_000 + n) });
  return [q(1, 2, 3, "Rolamento da bomba travado"), q(2, 2, 24, "Troca do rolamento com folga"), q(3, 5, 10, "", "Correia em V"),
    q(4, 6, 2, "Sensor indutivo de posição sem sinal"), q(5, 8, 15, "Vazamento no cilindro principal"), q(6, 9, 1, "Rolamento travado novamente")];
}
