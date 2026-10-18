import { chave } from "../dados/texto";

/**
 * As bases que o site entende — os mesmos tipos, nomes e destinos de central/leitura.py e central/nuvem.py, para o
 * envio por aqui e o do sincronizador do PC gravarem o mesmo arquivo no repositório de dados.
 */
export const TIPOS = ["iw38", "ip19", "iw38op", "iw28", "ih08", "mb52", "catalogo_materiais", "requisicoes", "iw47",
  "equipe", "af", "acoes_af"] as const;
export type Tipo = (typeof TIPOS)[number];

export const NOMES_BASE: Record<Tipo, string> = {
  iw38: "Ordens (IW38)", ip19: "Planos de manutenção (IP19)", iw38op: "Operações das ordens (IW38OP)",
  iw28: "Notas de manutenção (IW28)", ih08: "Cadastro de equipamentos (IH08)", mb52: "Estoque (MB52)",
  catalogo_materiais: "Catálogo de materiais cadastrados (Sysmat)", requisicoes: "Requisições de compra",
  iw47: "Apontamentos de horas (IW47)", equipe: "Equipe de manutenção (Gestão de HH)",
  af: "Análises de falha (Gerenciador de AF)", acoes_af: "Ações das análises de falha (Gerenciador de AF)",
};

export const DESTINO: Record<Tipo, string> = {
  iw38: "bases/IW38.parquet", mb52: "bases/MB52.parquet", requisicoes: "bases/REQUISICOES.parquet",
  ip19: "bases/IP19.parquet", iw38op: "bases/IW38OP.parquet", iw28: "bases/IW28.parquet", ih08: "bases/IH08.parquet",
  iw47: "bases/IW47.parquet", equipe: "bases/EQUIPE.parquet", af: "bases/AF.parquet", acoes_af: "bases/AF_ACOES.parquet",
  catalogo_materiais: "bases/CATALOGO_MATERIAIS.parquet",
};

/**
 * Bases reconhecidas mas que NÃO são mais enviadas: a equipe agora é cadastrada na Gestão de HH. Continua reconhecida
 * para a pasta de trabalho de HH não ter outras abas confundidas com IW47 etc. (e para os nomes dos tipos de ordem).
 */
export const TIPOS_SEM_ENVIO: ReadonlySet<Tipo> = new Set<Tipo>(["equipe"]);
export const MOTIVO_SEM_ENVIO = "a equipe agora é cadastrada na aba Gestão de HH (a planilha não é mais enviada)";

export function ehTipo(t: unknown): t is Tipo {
  return typeof t === "string" && (TIPOS as readonly string[]).includes(t);
}

// Colunas que só existem nas planilhas baixadas do próprio site (botão "Baixar Excel"): recortes, nunca a base.
const COLUNAS_DO_APP = /^(NATUREZA|SITUACAO|DIAS EM ABERTO|DIAS AGUARDANDO|PECAS EM FALTA|USADO EM|COM PLANO|ATRASADA)$/;

/** De qual base é a tabela, pelos cabeçalhos (não pelo nome do arquivo) — a mesma ordem de leitura.identificar. */
export function identificar(colunas: unknown[]): Tipo | null {
  const ks = new Set(colunas.map(chave));
  const tem = (rx: RegExp) => [...ks].some((k) => rx.test(k));

  if (tem(COLUNAS_DO_APP)) return null;
  if (tem(/^CODIGO SYSMAT$|^CODIGOSYSMAT$/) && tem(/CODIGO ?ALPARGATAS/) && tem(/DESCR(ICAO)? COMPLETA/)) return "catalogo_materiais";
  if (tem(/^N DA ANALISE$/) && tem(/^N DA ACAO$/) && tem(/^ACAO$/)) return "acoes_af";
  if (tem(/^N DA ANALISE$/) && tem(/^STATUS DA ANALISE$/) && tem(/^DATA DA FALHA$/)) return "af";
  if (tem(/^TRABALHO REAL$/) && tem(/^ORDEM$/) && tem(/^N PESSOAL$|NUMERO PESSOAL/)) return "iw47";
  if (tem(/^N PESSOAL$|NUMERO PESSOAL|MATRICULA/) && tem(/^NOME/) && tem(/^CARGO$|^FUNCAO$/) && !tem(/TRABALHO REAL/)) return "equipe";
  if (tem(/^ORDEM$/) && tem(/^OPERACAO$/) && tem(/^TRABALHO$|DURACAO NORMAL/)) return "iw38op";
  if (tem(/^NOTA$/) && tem(/TIPO DE NOTA|DATA DA NOTA/)) return "iw28";
  if (tem(/^EQUIPAMENTO$/) && tem(/DENOMINACAO/) && !tem(/^ORDEM$|^NOTA$|PLANO|^MATERIAL$|DATA BASE/)) return "ih08";
  if (tem(/^PLANO|PLANO (DE )?MANUT/) && tem(/DATA PLAN|DT PLAN|DATA (DE )?CHAMADA|DT CHAM/) && !tem(/DATA BASE DO INICIO/)) return "ip19";
  if (tem(/^ORDEM$/) && (tem(/STATUS USUARIO/) || tem(/STATUS DO SISTEMA/) || tem(/TIPO DE ORDEM/))) return "iw38";
  if ((tem(/N(UMERO)? DA REQ/) || tem(/REQUISI/)) && tem(/^TOTAL$/)) return "requisicoes";
  if (tem(/^MATERIAL$|^CODIGO/) && tem(/UTILIZACAO LIVRE|UTILIZ LIVRE|LIVRE UTILIZ|ESTOQUE|SALDO/)) return "mb52";
  return null;
}
