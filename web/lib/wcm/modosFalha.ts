/**
 * Modos de causa das quebras: lê o texto de confirmação (IW47) das ordens YM11 e conta as palavras e expressões que
 * mais aparecem (em quantas ordens, não quantas vezes), para a nuvem de palavras do SIM, e agrupa as ordens em modos
 * de causa por um dicionário de termos de manutenção. Testado em testes/modosFalha.test.ts.
 */
import type { Confirmacao } from "./preparo";
import { partes, type Dia } from "./util";

export const TIPO_QUEBRA = "YM11";

/** Palavras que não dizem nada sobre a causa (preposições e o "relatório" do serviço). */
const VAZIAS = new Set(`
  A AS O OS UM UMA UNS UMAS DE DA DAS DO DOS EM NA NAS NO NOS AO AOS PARA PRA PELO PELA PELOS PELAS POR COM SEM SOB
  SOBRE ENTRE ATE APOS QUE QUAL QUAIS SE NAO SIM MAIS MENOS MUITO POUCO JA AINDA TAMBEM MAS OU E E/OU ESTE ESTA ESSE
  ESSA ISSO ISTO AQUI ALI ONDE QUANDO COMO FOI FORAM SER SERA ESTAVA ESTAVAM ESTA TEM TINHA HAVIA FICOU FICANDO
  REALIZADO REALIZADA REALIZADOS REALIZADAS REALIZEI REALIZAMOS REALIZAR EFETUADO EFETUADA EFETUADOS EFETUAR FEITO FEITA
  FEITOS FEITAS FEZ FAZER EXECUTADO EXECUTADA EXECUTADOS EXECUTAR EXECUCAO SERVICO SERVICOS ATIVIDADE ATIVIDADES
  MANUTENCAO ORDEM ORDENS NOTA OPERACAO MAQUINA MAQUINAS EQUIPAMENTO EQUIPAMENTOS LINHA SETOR LOCAL PECA PECAS
  CONFORME NORMAL NORMALIZADO NORMALIZADA NORMALIZAR LIBERADO LIBERADA LIBERADOS LIBERAR FUNCIONANDO FUNCIONAMENTO
  TESTADO TESTADA TESTE TESTES OK OBS ETC TURNO DIA HOJE ONTEM HORA HORAS MIN MINUTOS APROX CONCLUIDO CONCLUIDA
  ATENDIMENTO ATENDIDO SOLICITACAO VERIFICADO VERIFICADA VERIFICAR VERIFICACAO CONSTATADO CONSTATADA IDENTIFICADO
  IDENTIFICADA FOI ENCONTRADO ENCONTRADA PROBLEMA PROBLEMAS DEFEITO DEFEITOS FALHA FALHAS QUEBRA PARADA MESMO MESMA
  LADO PARTE NOVO NOVA NOVOS NOVAS
  TROCA TROCAS TROCADO TROCADA TROCADOS TROCADAS TROCAR TROCAMOS TROQUEI SUBSTITUIDO SUBSTITUIDA SUBSTITUIDOS SUBSTITUIDAS
  SUBSTITUICAO SUBSTITUIR SUBSTITUI INSTALADO INSTALADA INSTALACAO COLOCADO COLOCADA RETIRADO RETIRADA
`.trim().split(/\s+/));

const semAcento = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "");

/** As palavras que contam: a chave (maiúsculas, sem acento) e como foi escrita (para mostrar com acento). */
function termos(texto: string): { chave: string; escrita: string }[] {
  return (texto.toLowerCase().match(/\p{L}+/gu) ?? []).map((w) => ({ chave: semAcento(w).toUpperCase(), escrita: w }))
    .filter((t) => t.chave.length >= 3 && /^[A-Z]+$/.test(t.chave) && !VAZIAS.has(t.chave));
}

/** Texto em maiúsculas, sem acento e só com letras (números e códigos não entram). */
export function palavras(texto: string): string[] {
  return termos(texto).map((t) => t.chave);
}

/** Os modos de causa e os começos de palavra que os indicam (sem acento, em maiúsculas). */
export const MODOS: { modo: string; termos: string[] }[] = [
  { modo: "Rolamentos e mancais", termos: ["ROLAMENT", "MANCAL", "MANCAI", "BUCHA", "ROLETE"] },
  { modo: "Transmissão (correia, corrente, engrenagem)", termos: ["CORREIA", "CORRENTE", "ENGRENAG", "POLIA", "ACOPLAMENT", "REDUTOR", "PINHAO", "EIXO", "CHAVETA"] },
  { modo: "Pneumática e hidráulica", termos: ["PNEUMAT", "HIDRAUL", "CILINDRO", "VALVULA", "MANGUEIRA", "VAZAMENT", "VAZANDO", "CONEXAO", "ENGATE", "PRESSAO"] },
  { modo: "Elétrica e motores", termos: ["MOTOR", "ELETRIC", "CONTATOR", "FUSIVEL", "DISJUNTOR", "CABO", "FIACAO", "CURTO", "INVERSOR", "RELE", "BOBINA", "TOMADA", "QUEIMAD", "QUEIMOU"] },
  { modo: "Sensores e automação", termos: ["SENSOR", "FIM", "CURSO", "CLP", "ENCODER", "FOTOCEL", "AUTOMAC", "PROGRAMA", "PARAMETR", "TELA", "IHM", "SINAL"] },
  { modo: "Lubrificação", termos: ["LUBRIFIC", "GRAXA", "ENGRAX", "OLEO", "LUBRIFICANTE"] },
  { modo: "Ajuste, folga e fixação", termos: ["AJUST", "REGUL", "DESREGUL", "ALINHA", "DESALINH", "FOLGA", "APERT", "SOLTO", "SOLTA", "PARAFUSO", "FIXACAO", "FIXAR", "CALIBR"] },
  { modo: "Desgaste e ruptura", termos: ["DESGAST", "QUEBRAD", "QUEBROU", "TRINC", "ROMPID", "ROMPEU", "RACHAD", "AMASSAD", "EMPENAD", "FADIGA", "TRAVAD", "TRAVOU", "TRAVANDO"] },
  { modo: "Temperatura e aquecimento", termos: ["AQUEC", "TEMPERAT", "RESISTENCIA", "TERMOPAR", "TERMOSTAT", "REFRIGER", "ARREFEC", "SUPERAQUEC"] },
];

/** Vazio = todo o histórico; senão, só os lançamentos daquele ano ("2026"). */
const doAno = (d: Dia | null, ano: string) => !ano || (d != null && String(partes(d).ano) === ano);

const modosDa = (ps: string[]): string[] =>
  MODOS.filter((m) => ps.some((p) => m.termos.some((t) => p.startsWith(t)))).map((m) => m.modo);

/** termo = chave (sem acento, vai no endereço); rotulo = a grafia mais comum nos textos. */
export interface ContaTermo { termo: string; rotulo: string; ordens: number }
export interface ModoCausa { modo: string; ordens: number; pct: number; exemplos: string[] }
export interface AnaliseModos {
  ordens: number;          // ordens YM11 com texto de confirmação
  apontamentos: number;    // confirmações YM11 com texto
  semTexto: number;        // ordens YM11 confirmadas sem texto nenhum
  palavras: ContaTermo[];  // as que mais aparecem (para a nuvem)
  expressoes: ContaTermo[]; // pares de palavras seguidas ("CORREIA ROMPIDA")
  modos: ModoCausa[];      // do mais frequente ao menos
  semModo: number;         // ordens com texto que não caem em nenhum modo
  periodo: { de: Dia; ate: Dia } | null;
}

/**
 * Junta os textos das confirmações de cada ordem de quebra (YM11) e conta. `tipos` completa o tipo da ordem quando a
 * IW47 não traz (vem da IW38/IW38 operações). `ano` limita ao ano da data de lançamento (vazio = todo o histórico).
 */
export function analisarModos(conf: Confirmacao[], tipos: Map<string, string>, ano = "", max = 60): AnaliseModos {
  const porOrdem = new Map<string, { textos: string[]; datas: Dia[] }>();
  let apontamentos = 0;
  for (const c of conf) {
    const tipo = (c.tipo || tipos.get(c.ordem) || "").toUpperCase();
    if (tipo !== TIPO_QUEBRA) continue;
    if (!doAno(c.data, ano)) continue;
    const o = porOrdem.get(c.ordem) ?? { textos: [], datas: [] };
    if (c.texto.trim()) { o.textos.push(c.texto.trim()); apontamentos++; }
    if (c.data != null) o.datas.push(c.data);
    porOrdem.set(c.ordem, o);
  }
  const cPal = new Map<string, number>(), cExp = new Map<string, number>(), cModo = new Map<string, number>();
  const exemplos = new Map<string, string[]>();
  // como cada palavra foi escrita (a forma mais usada vira o rótulo: "lubrificação", não "LUBRIFICACAO")
  const escritas = new Map<string, Map<string, number>>();
  const anotar = (chave: string, escrita: string) => {
    const m = escritas.get(chave) ?? new Map<string, number>();
    m.set(escrita, (m.get(escrita) ?? 0) + 1);
    escritas.set(chave, m);
  };
  let ordens = 0, semTexto = 0, semModo = 0;
  const datas: Dia[] = [];
  for (const [, o] of porOrdem) {
    if (!o.textos.length) { semTexto++; continue; }
    ordens++;
    datas.push(...o.datas);
    // a mesma confirmação repetida (estorno e novo lançamento) não conta duas vezes
    const textos = [...new Set(o.textos.map((t) => t.toUpperCase()))];
    const ts = textos.flatMap(termos);
    for (const t of ts) anotar(t.chave, t.escrita);
    const ps = ts.map((t) => t.chave);
    for (const p of new Set(ps)) cPal.set(p, (cPal.get(p) ?? 0) + 1);
    const pares = new Set(textos.flatMap((t) => { const w = palavras(t); return w.slice(1).map((p, i) => `${w[i]} ${p}`); }));
    for (const e of pares) cExp.set(e, (cExp.get(e) ?? 0) + 1);
    const ms = modosDa(ps);
    if (!ms.length) semModo++;
    for (const m of ms) {
      cModo.set(m, (cModo.get(m) ?? 0) + 1);
      const ex = exemplos.get(m) ?? [];
      if (ex.length < 3) exemplos.set(m, [...ex, textos[0].slice(0, 120)]);
    }
  }
  // plural junto do singular (ROLAMENTOS → ROLAMENTO) quando os dois aparecem
  for (const [p, n] of [...cPal]) {
    if (p.endsWith("S") && cPal.has(p.slice(0, -1))) {
      cPal.set(p.slice(0, -1), cPal.get(p.slice(0, -1))! + n);
      cPal.delete(p);
    }
  }
  const rotulo = (chave: string) => chave.split(" ").map((c) => {
    const m = escritas.get(c);
    return m ? [...m].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0] : c.toLowerCase();
  }).join(" ");
  const ordenar = (m: Map<string, number>, minimo: number) => [...m].filter(([, n]) => n >= minimo)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, max).map(([termo, n]) => ({ termo, rotulo: rotulo(termo), ordens: n }));
  datas.sort((a, b) => a - b);
  return {
    ordens, apontamentos, semTexto,
    palavras: ordenar(cPal, 1),
    expressoes: ordenar(cExp, 2).slice(0, 15),
    modos: [...cModo].sort((a, b) => b[1] - a[1]).map(([modo, n]) => ({ modo, ordens: n, pct: ordens ? n / ordens : 0, exemplos: exemplos.get(modo) ?? [] })),
    semModo,
    periodo: datas.length ? { de: datas[0], ate: datas[datas.length - 1] } : null,
  };
}

/** As confirmações YM11 cujo texto tem a palavra (sem acento; plural incluído), mais recentes primeiro. */
export function comPalavra(conf: Confirmacao[], tipos: Map<string, string>, palavra: string, ano = "", max = 50): Confirmacao[] {
  const alvo = palavras(palavra)[0];
  if (!alvo) return [];
  return conf.filter((c) => (c.tipo || tipos.get(c.ordem) || "").toUpperCase() === TIPO_QUEBRA && doAno(c.data, ano)
      && palavras(c.texto).some((p) => p === alvo || p === `${alvo}S`))
    .sort((a, b) => (b.data ?? 0) - (a.data ?? 0)).slice(0, max);
}

/** Tamanho da palavra na nuvem (12 a 40 px), pela raiz da frequência: a mais comum não esmaga as outras. */
export function tamanhoNuvem(n: number, maior: number, menor = 1): number {
  if (maior <= menor) return 24;
  const t = (Math.sqrt(n) - Math.sqrt(menor)) / (Math.sqrt(maior) - Math.sqrt(menor));
  return Math.round(12 + t * 28);
}
