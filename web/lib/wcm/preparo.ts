import { acharColuna, chave, paraNumero, texto } from "../dados/texto";
import { foraDaVisao, paraData, setorDoCentro, type Dia } from "./util";

/**
 * Preparo das bases do SAP — porta de central/bases.py (preparar_iw38, preparar_notas…). Cada export chega como
 * linhas de texto (o parquet do repositório de dados); aqui viram registros tipados, com as mesmas regras do
 * site atual: colunas achadas pelo cabeçalho, Fábrica Piloto/Desenho fora, situação da ordem, quebras (Y1→YM11).
 */
export type Crua = Record<string, unknown>;

function colunasDe(linhas: Crua[]): string[] {
  return linhas.length ? Object.keys(linhas[0]) : [];
}

/** Acha cada coluna pelo cabeçalho, sem repetir coluna já usada (como _padronizar). */
function mapear(colunas: string[], mapa: Record<string, string[]>, excluir: Record<string, string> = {}): Record<string, string | null> {
  const usadas = new Set<string>();
  const out: Record<string, string | null> = {};
  for (const [nome, padroes] of Object.entries(mapa)) {
    const col = acharColuna(colunas.filter((c) => !usadas.has(c)), padroes, excluir[nome]);
    if (col) usadas.add(col);
    out[nome] = col;
  }
  return out;
}

const pega = (l: Crua, col: string | null) => (col ? texto(l[col]) : "");
const num0 = (v: unknown) => { const n = paraNumero(v); return Number.isNaN(n) ? 0 : n; };
const espacos = (s: string) => s.split(/\s+/).filter(Boolean).join(" ");
const HORAS_POR: Record<string, number> = { MIN: 1 / 60, H: 1, HR: 1, STD: 1, HRS: 1, D: 8, DIA: 8 };
const fatorHoras = (u: string) => HORAS_POR[u.toUpperCase()] ?? 1 / 60;
const arred = (v: number, casas: number) => { const f = 10 ** casas; return Math.round(v * f) / f; };

// ----------------------------------------------------------------------------
// IW38 — ordens
// ----------------------------------------------------------------------------
const IW38_COLUNAS: Record<string, string[]> = {
  Ordem: ["^ORDEM$"], Tipo: ["TIPO DE ORDEM", "^TIPO ORDEM"], Prioridade: ["^PRIORIDADE$", "PRIORIDADE"],
  Texto: ["TEXTO BREVE", "^DESCRICAO$"], Equipamento: ["^EQUIPAMENTO$"],
  Objeto: ["DENOMINACAO DO OBJETO TECNICO", "DENOMINACAO.*EQUIP", "OBJETO TECNICO"],
  Local: ["DENOMINACAO DO LOC INSTALACAO", "DENOMINACAO.*LOC", "LOCAL DE INSTALACAO"],
  CentroTrabalho: ["CENTRO TRAB", "CENTRO DE TRABALHO"], CentroCusto: ["CENTRO CUSTO", "CENTRO DE CUSTO"],
  Localizacao: ["^LOCALIZACAO$"], Centro: ["^CENTRO$"], Plano: ["^PLANO DE MANUTENCAO$", "^PLANO MANUT", "^PLANO$"],
  StatusSistema: ["STATUS DO SISTEMA", "STATUS SISTEMA"], StatusUsuario: ["STATUS USUARIO"],
  Inicio: ["DATA BASE DO INICIO", "INICIO BASE", "DATA INICIO"], Fim: ["DATA BASE DO FIM", "FIM BASE", "DATA FIM"],
  Entrada: ["DATA DE ENTRADA", "^CRIADO EM$"], CriadoPor: ["CRIADO POR"],
  CustoReal: ["CUSTOS? TOT.*REA", "CUSTO.*REA", "CUSTOS? TOT"], CustoPlanejado: ["CUSTOS? TOT.*PLAN", "CUSTO.*PLAN", "CUSTO.*ESTIM"],
  // por último: o padrão solto não pode roubar a coluna de outro campo
  Campo: ["CAMPO DE ORDENACAO", "CAMPO ORDENACAO", "CAMPO.*ORDEN"],
};

export const ENCERRADA_SEM_CONF = "Encerrada sem confirmação";
export const SITUACOES = ["Aberta", "Liberada", ENCERRADA_SEM_CONF, "Concluída", "Cancelada", "Sem status"] as const;
export type Situacao = (typeof SITUACOES)[number];
export const PENDENTES = new Set<Situacao>(["Aberta", "Liberada", ENCERRADA_SEM_CONF]);
export const NAT_PLANO = "Plano de manutenção", NAT_BACKLOG = "Backlog";
export const STATUS_USUARIO: Record<string, string> = { PLA: "Em planejamento", PRO: "Programado", ELP: "Em planejamento (ELP)", CAN: "Cancelada" };

export function situacaoDe(sistema: string, usuario: string): Situacao {
  const sis = new Set(sistema.split(" ").filter(Boolean));
  const usu = new Set(usuario.split(" ").filter(Boolean));
  if (usu.has("CAN") || sis.has("DLFL") || sis.has("MREL") || sis.has("MEEL")) return "Cancelada";
  if (sis.has("CONF") && sis.has("ENTE")) return "Concluída"; // regra do PCM: CONF + ENTE juntos
  if (sis.has("ENCE") || sis.has("ENTE")) return ENCERRADA_SEM_CONF;
  if (sis.has("LIB")) return "Liberada";
  if (sis.has("ABER")) return "Aberta";
  return "Sem status";
}

export interface Ordem {
  ordem: string; tipo: string; prioridade: string; texto: string; equipamento: string; objeto: string; local: string;
  centroTrabalho: string; centroCusto: string; localizacao: string; centro: string; plano: string;
  statusSistema: string; statusUsuario: string; inicio: Dia | null; fim: Dia | null; entrada: Dia | null; criadoPor: string;
  custoReal: number; custoPlanejado: number;
  comPlano: boolean; natureza: string; situacao: Situacao; data: Dia | null; atrasada: boolean;
  diasEmAberto: number | null; duracao: number | null; equipChave: string; setor: string; busca: string;
  /** Campo de ordenação da ordem (IW38), em maiúsculas; "" quando o export não tem a coluna. */
  campo: string;
}

export function prepararIw38(cru: Crua[], hoje: Dia, excluir = true): { ordens: Ordem[]; removidas: number } {
  const c = mapear(colunasDe(cru), IW38_COLUNAS, { Plano: "TEXTO|ITEM" });
  const ordens: Ordem[] = [];
  let removidas = 0;
  for (const l of cru) {
    const ordem = pega(l, c.Ordem);
    if (!ordem) continue; // linha sem ordem (fórmula arrastada até o fim da planilha)
    const base = {
      ordem, tipo: pega(l, c.Tipo), prioridade: pega(l, c.Prioridade), texto: pega(l, c.Texto),
      equipamento: pega(l, c.Equipamento), objeto: pega(l, c.Objeto), local: pega(l, c.Local),
      centroTrabalho: pega(l, c.CentroTrabalho), centroCusto: pega(l, c.CentroCusto), localizacao: pega(l, c.Localizacao),
      centro: pega(l, c.Centro), plano: pega(l, c.Plano), statusSistema: espacos(pega(l, c.StatusSistema)),
      statusUsuario: espacos(pega(l, c.StatusUsuario)), criadoPor: pega(l, c.CriadoPor),
    };
    if (excluir && foraDaVisao({ "Centro de trabalho": base.centroTrabalho, "Localização": base.localizacao,
      "Local de instalação": base.local, "Objeto técnico": base.objeto })) { removidas++; continue; }
    const inicio = paraData(pega(l, c.Inicio)), fim = paraData(pega(l, c.Fim)), entrada = paraData(pega(l, c.Entrada));
    const situacao = situacaoDe(base.statusSistema, base.statusUsuario);
    const pendente = PENDENTES.has(situacao);
    const prazo = fim ?? inicio;
    const ref = entrada ?? inicio;
    const dur = fim != null && inicio != null ? fim - inicio : null;
    const comPlano = /\d/.test(base.plano);
    ordens.push({
      ...base, inicio, fim, entrada, custoReal: num0(c.CustoReal ? l[c.CustoReal] : ""),
      custoPlanejado: num0(c.CustoPlanejado ? l[c.CustoPlanejado] : ""), comPlano, natureza: comPlano ? NAT_PLANO : NAT_BACKLOG,
      situacao, data: inicio ?? entrada ?? fim, atrasada: pendente && prazo != null && prazo < hoje,
      diasEmAberto: pendente && ref != null ? Math.max(0, hoje - ref) : null,
      duracao: dur != null && dur >= 0 && dur < 3650 ? dur : null,
      equipChave: base.equipamento || base.objeto, setor: setorDoCentro(base.centroTrabalho),
      campo: pega(l, c.Campo).trim().toUpperCase(),
      busca: chave([ordem, base.texto, base.equipamento, base.objeto, base.local, base.plano, base.criadoPor, base.statusUsuario].join(" ")),
    });
  }
  return { ordens, removidas };
}

// ----------------------------------------------------------------------------
// Requisições de compra
// ----------------------------------------------------------------------------
export interface Requisicao {
  requisicao: string; po: string; status: string; aprovador: string; proprietario: string; solicitante: string;
  itens: string; justificativa: string; enviadoEm: Dia | null; ultimoEnvio: Dia | null; total: number;
  pendente: boolean; diasAguardando: number | null;
}

export function prepararRequisicoes(cru: Crua[], hoje: Dia): Requisicao[] {
  const c = mapear(colunasDe(cru), {
    Requisicao: ["N(UMERO)? DA REQ", "REQUISI"], PO: ["NUMERO DA PO", "PEDIDO", "\\bPO\\b"], Status: ["^STATUS$", "STATUS"],
    Aprovador: ["APROVADOR ATUAL", "APROVADOR"], Proprietario: ["PROPRIETARIO"],
    Solicitante: ["SOLICITADO POR", "SOLICITANTE", "REQUISITANTE"], Itens: ["^ITENS$", "ITENS", "DESCRICAO"],
    Justificativa: ["JUSTIFICATIVA"], Enviado: ["^ENVIADO EM$", "ENVIADO"], Ultimo: ["ULTIMO ENVIO"],
    Total: ["^TOTAL$", "VALOR TOTAL", "TOTAL"],
  });
  return cru.map((l) => {
    const status = pega(l, c.Status);
    const enviadoEm = paraData(pega(l, c.Enviado)), ultimoEnvio = paraData(pega(l, c.Ultimo));
    const pendente = chave(status).includes("PENDENTE");
    const ref = ultimoEnvio ?? enviadoEm;
    return {
      requisicao: pega(l, c.Requisicao), po: pega(l, c.PO), status, aprovador: pega(l, c.Aprovador),
      proprietario: pega(l, c.Proprietario), solicitante: pega(l, c.Solicitante), itens: pega(l, c.Itens),
      justificativa: pega(l, c.Justificativa), enviadoEm, ultimoEnvio, total: num0(c.Total ? l[c.Total] : ""), pendente,
      diasAguardando: pendente && ref != null ? hoje - ref : null,
    };
  });
}

// ----------------------------------------------------------------------------
// IW38OP — operações (trabalho planejado)
// ----------------------------------------------------------------------------
export interface Operacao {
  ordem: string; operacao: string; tipo: string; centroTrabalho: string; equipamento: string; objeto: string; local: string;
  textoOperacao: string; unidade: string; statusSistema: string; horas: number; pessoas: number;
  inicio: Dia | null; fimReal: Dia | null; concluida: boolean; cancelada: boolean; setor: string;
}

export function prepararOperacoes(cru: Crua[], excluir = true): Operacao[] {
  const c = mapear(colunasDe(cru), {
    Ordem: ["^ORDEM$"], Operacao: ["^OPERACAO$"], Tipo: ["TIPO DE ORDEM"], CentroTrabalho: ["^CENTRO DE TRABALHO$", "CENTRO TRAB"],
    Equipamento: ["^EQUIPAMENTO$"], Objeto: ["DENOMINACAO DO OBJETO", "OBJETO TECNICO"], Local: ["DENOMINACAO DO LOC"],
    TextoOperacao: ["TXT BREVE OPERACAO", "TEXTO.*OPERACAO"], Trabalho: ["^TRABALHO$"], Unidade: ["UNIDADE DO TRABALHO", "UNID.*TRAB"],
    Pessoas: ["^NUMERO$", "N PESSOAS"], StatusSistema: ["STATUS DO SISTEMA"],
    Inicio: ["1A DATA DE INICIO", "DATA DE INICIO", "ULTIMA DATA INICIO"], FimReal: ["DATA DO FIM REAL"],
  });
  const out: Operacao[] = [];
  for (const l of cru) {
    const ordem = pega(l, c.Ordem);
    if (!ordem) continue;
    const o = {
      ordem, operacao: pega(l, c.Operacao), tipo: pega(l, c.Tipo), centroTrabalho: pega(l, c.CentroTrabalho),
      equipamento: pega(l, c.Equipamento), objeto: pega(l, c.Objeto), local: pega(l, c.Local),
      textoOperacao: pega(l, c.TextoOperacao), unidade: pega(l, c.Unidade), statusSistema: pega(l, c.StatusSistema),
    };
    if (excluir && foraDaVisao({ "Centro de trabalho": o.centroTrabalho, "Local de instalação": o.local, "Objeto técnico": o.objeto })) continue;
    const toks = new Set(o.statusSistema.split(/\s+/).filter(Boolean));
    const p = paraNumero(c.Pessoas ? l[c.Pessoas] : "");
    out.push({
      ...o, horas: arred(num0(c.Trabalho ? l[c.Trabalho] : "") * fatorHoras(o.unidade), 2),
      pessoas: Number.isNaN(p) ? 0 : Math.trunc(p), inicio: paraData(pega(l, c.Inicio)), fimReal: paraData(pega(l, c.FimReal)),
      concluida: toks.has("CONF") || toks.has("ENTE") || toks.has("ENCE"),
      cancelada: toks.has("DLFL") || toks.has("MREL") || toks.has("MEEL"), setor: setorDoCentro(o.centroTrabalho),
    });
  }
  return out;
}

// ----------------------------------------------------------------------------
// IW28 — notas
// ----------------------------------------------------------------------------
export interface Nota {
  nota: string; ordem: string; tipoNota: string; descricao: string; equipamento: string; objeto: string; local: string;
  centroTrabalho: string; localizacao: string; notificador: string; criadoPor: string; codigoAbc: string; plano: string;
  inicioAvaria: Dia | null; fimAvaria: Dia | null; dataNota: Dia | null; comParada: boolean; horasParado: number;
  comOrdem: boolean; data: Dia | null; dias: number | null; equipChave: string; setor: string;
  tipoOrdem: string; quebra: boolean;
}

export function prepararNotas(cru: Crua[], hoje: Dia, excluir = true): Nota[] {
  const c = mapear(colunasDe(cru), {
    Nota: ["^NOTA$"], Ordem: ["^ORDEM$"], TipoNota: ["TIPO DE NOTA"], Descricao: ["^DESCRICAO$", "TEXTO BREVE", "DESCRICAO"],
    Equipamento: ["^EQUIPAMENTO$"], Objeto: ["DENOMINACAO DO OBJETO", "OBJETO TECNICO"], Local: ["DENOMINACAO DO LOC"],
    CentroTrabalho: ["CENTRO TRAB RESPONS", "^CENTRO DE TRABALHO$"], Localizacao: ["^LOCALIZACAO$"], Notificador: ["NOTIFICADOR"],
    Parada: ["^PARADA$"], DuracaoParada: ["DURACAO DA PARADA"],
    InicioAvaria: ["^INICIO (DA )?AVARIA$", "^(DATA )?INICIO (DA )?AVARIA"], FimAvaria: ["^FIM (DA )?AVARIA$", "^(DATA )?FIM (DA )?AVARIA"],
    DataNota: ["DATA DA NOTA"], CriadoPor: ["CRIADO POR"], Abc: ["CODIGO ABC", "^ABC$"], Plano: ["PLANO DE MANUTENCAO"],
  });
  const out: Nota[] = [];
  for (const l of cru) {
    const nota = pega(l, c.Nota);
    if (!nota) continue;
    const n = {
      nota, ordem: pega(l, c.Ordem), tipoNota: pega(l, c.TipoNota), descricao: pega(l, c.Descricao), equipamento: pega(l, c.Equipamento),
      objeto: pega(l, c.Objeto), local: pega(l, c.Local), centroTrabalho: pega(l, c.CentroTrabalho), localizacao: pega(l, c.Localizacao),
      notificador: pega(l, c.Notificador), criadoPor: pega(l, c.CriadoPor), codigoAbc: pega(l, c.Abc), plano: pega(l, c.Plano),
    };
    if (excluir && foraDaVisao({ "Centro de trabalho": n.centroTrabalho, "Localização": n.localizacao,
      "Local de instalação": n.local, "Objeto técnico": n.objeto })) continue;
    const dataNota = paraData(pega(l, c.DataNota)), inicioAvaria = paraData(pega(l, c.InicioAvaria));
    const data = dataNota ?? inicioAvaria;
    out.push({
      ...n, inicioAvaria, fimAvaria: paraData(pega(l, c.FimAvaria)), dataNota,
      comParada: ["X", "SIM", "S", "1"].includes(pega(l, c.Parada).toUpperCase()), horasParado: num0(c.DuracaoParada ? l[c.DuracaoParada] : ""),
      comOrdem: n.ordem !== "", data, dias: data != null ? hoje - data : null, equipChave: n.equipamento || n.objeto,
      setor: setorDoCentro(n.centroTrabalho), tipoOrdem: "", quebra: false,
    });
  }
  return out;
}

export const TIPO_NOTA_QUEBRA = "Y1", TIPO_ORDEM_QUEBRA = "YM11";

/**
 * Quebra (regra da planta) = nota Y1 convertida em ordem YM11. O tipo da ordem vem das bases (IW38, IW38OP, IW47);
 * ordem da Y1 que não está em nenhuma delas conta como quebra; com outro tipo, não.
 */
export function marcarQuebras(notas: Nota[], tipos: Map<string, string>): Nota[] {
  return notas.map((n) => {
    const tipoOrdem = (tipos.get(n.ordem) ?? "").trim().toUpperCase();
    const y1 = n.tipoNota.trim().toUpperCase() === TIPO_NOTA_QUEBRA;
    return { ...n, tipoOrdem, quebra: y1 && n.ordem !== "" && (tipoOrdem === "" || tipoOrdem === TIPO_ORDEM_QUEBRA) };
  });
}

/** Ordem → tipo (YM11, YM13…) juntando IW38, IW38OP e IW47 — vale a primeira que aparece, nessa ordem. */
export function tiposPorOrdem(...fontes: { ordem: string; tipo: string }[][]): Map<string, string> {
  const m = new Map<string, string>();
  for (const f of fontes)
    for (const x of f) {
      const t = x.tipo.trim();
      if (t && !m.has(x.ordem)) m.set(x.ordem, t.toUpperCase());
    }
  return m;
}

// ----------------------------------------------------------------------------
// IH08 — equipamentos
// ----------------------------------------------------------------------------
export const ABC_PARA_CRITICIDADE: Record<string, string> = { A: "Alta", B: "Média", C: "Baixa" };

export interface Equipamento {
  equipamento: string; denominacao: string; localizacao: string; codigoAbc: string; local: string; desativado: boolean;
}

export function prepararEquipamentos(cru: Crua[], excluir = true): Equipamento[] {
  const c = mapear(colunasDe(cru), {
    Equipamento: ["^EQUIPAMENTO$"], Denominacao: ["DENOMINACAO"], Localizacao: ["^LOCALIZACAO$"],
    Abc: ["CODIGO ABC", "^ABC$"], Local: ["LOCAL DE INSTALACAO", "LOC INSTAL"],
  });
  const vistos = new Set<string>();
  const out: Equipamento[] = [];
  for (const l of cru) {
    const equipamento = pega(l, c.Equipamento);
    if (!equipamento || vistos.has(equipamento)) continue;
    vistos.add(equipamento);
    const e = { equipamento, denominacao: pega(l, c.Denominacao), localizacao: pega(l, c.Localizacao),
      codigoAbc: pega(l, c.Abc).toUpperCase().trim(), local: pega(l, c.Local) };
    if (excluir && foraDaVisao({ "Localização": e.localizacao, "Local de instalação": e.local, "Denominação": e.denominacao })) continue;
    out.push({ ...e, desativado: /DESATIV|INATIV|NAO ESTA NA FABRICA|SUCATA|BAIXAD/.test(chave(e.denominacao)) });
  }
  return out;
}

// ----------------------------------------------------------------------------
// IW47 — confirmações (horas apontadas)
// ----------------------------------------------------------------------------
export interface Confirmacao {
  np: string; nome: string; ordem: string; operacao: string; statusSistema: string; unidade: string; centroTrabalho: string;
  atividade: string; tipo: string; equipamento: string; texto: string; causaDesvio: string; horas: number; data: Dia | null; setor: string;
}

export function prepararConfirmacoes(cru: Crua[], excluir = true): Confirmacao[] {
  const c = mapear(colunasDe(cru), {
    NP: ["^N PESSOAL$", "NUMERO PESSOAL"], Nome: ["NOME DO EMPREGADO", "^NOME$"], Ordem: ["^ORDEM$"], Operacao: ["^OPERACAO$"],
    StatusSistema: ["STATUS DO SISTEMA"], Trabalho: ["^TRABALHO REAL$"], Unidade: ["UNID TRABALHO REAL", "UNID.*TRAB"],
    CentroTrabalho: ["CENTRO TRAB REAL", "^CENTRO DE TRABALHO$", "CENTRO TRAB"], Atividade: ["TP ATIVIDADE REAL", "TIPO ATIVID.*REAL"],
    AtividadePlanejada: ["TIPO ATIVID.*PLAN"], Data: ["DATA LANCAMENTO", "DATA DO FIM REAL", "CRIADO EM"],
    Tipo: ["^TIPO ORDEM$", "^TIPO DE ORDEM$"], Equipamento: ["^EQUIPAMENTO$"], Texto: ["TEXTO DE CONFIRMACAO"], Causa: ["CAUSA DO DESVIO"],
  });
  const out: Confirmacao[] = [];
  for (const l of cru) {
    const ordem = pega(l, c.Ordem), np = pega(l, c.NP);
    if (!ordem || !np) continue;
    const centroTrabalho = pega(l, c.CentroTrabalho);
    if (excluir && foraDaVisao({ "Centro de trabalho": centroTrabalho })) continue;
    const unidade = pega(l, c.Unidade);
    const atividade = pega(l, c.Atividade);
    out.push({
      np, nome: pega(l, c.Nome), ordem, operacao: pega(l, c.Operacao), statusSistema: pega(l, c.StatusSistema), unidade, centroTrabalho,
      atividade: atividade || pega(l, c.AtividadePlanejada), tipo: pega(l, c.Tipo), equipamento: pega(l, c.Equipamento),
      texto: pega(l, c.Texto), causaDesvio: pega(l, c.Causa),
      // estornos vêm com trabalho negativo e anulam o apontamento original: a soma fica certa
      horas: arred(num0(c.Trabalho ? l[c.Trabalho] : "") * fatorHoras(unidade), 3), data: paraData(pega(l, c.Data)),
      setor: setorDoCentro(centroTrabalho),
    });
  }
  return out;
}

// ----------------------------------------------------------------------------
// Gestão de HH — a equipe
// ----------------------------------------------------------------------------
export interface Pessoa {
  np: string; nome: string; cargo: string; centroTrabalho: string; area: string; turma: string; supervisor: string;
  especialidade: string; setor: string;
}

const ESPECIALIDADES: [RegExp, string][] = [
  [/MATRIZ/, "Matrizaria"], [/^GPM$|PLANEJ|PROGRAMAD/, "Planejamento (GPM)"], [/ELETROMEC/, "Eletromecânica"],
  [/ELETRIC|ELETRON/, "Elétrica"], [/MECANIC/, "Mecânica"], [/LUBRIF/, "Lubrificação"], [/INSTRUM|AUTOMA/, "Instrumentação"],
  [/SOLDA|CALDEIR/, "Caldeiraria"], [/ANALISTA|ASSIST|SUPERV|COORD|ENGENH|SPV|ANL|AST/, "Apoio / gestão"],
];
export const especialidade = (cargo: string) => ESPECIALIDADES.find(([rx]) => rx.test(chave(cargo)))?.[1] ?? "Outros";

export function prepararEquipe(cru: Crua[], excluir = true): Pessoa[] {
  const c = mapear(colunasDe(cru), {
    NP: ["^N PESSOAL$", "NUMERO PESSOAL", "MATRICULA"], Nome: ["^NOME$", "^NOME"], Cargo: ["^CARGO$", "^FUNCAO$"],
    CentroTrabalho: ["^CENTRO TRABALHO$", "CENTRO TRAB"], Area: ["^AREA$"], Turma: ["^TURMA$", "^TURNO$"], Supervisor: ["SUPERVISOR"],
  });
  const porNp = new Map<string, Pessoa>();
  const semErro = (s: string) => (s.startsWith("#") ? "" : s);
  for (const l of cru) {
    const np = pega(l, c.NP), nome = pega(l, c.Nome), centroTrabalho = pega(l, c.CentroTrabalho);
    if (excluir && foraDaVisao({ "Centro de trabalho": centroTrabalho })) continue;
    if (!/^\d{3,}$/.test(np) || !nome || nome.toUpperCase().startsWith("#")) continue;
    const cargo = semErro(pega(l, c.Cargo));
    porNp.delete(np); // fica a última linha de cada pessoa
    porNp.set(np, { np, nome, cargo, centroTrabalho, area: semErro(pega(l, c.Area)), turma: semErro(pega(l, c.Turma)),
      supervisor: semErro(pega(l, c.Supervisor)), especialidade: especialidade(cargo), setor: setorDoCentro(centroTrabalho) });
  }
  return [...porNp.values()];
}
