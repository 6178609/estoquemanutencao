import "server-only";

import { lerBase, type Base } from "../dados/bases";
import { lerCadastro } from "../dados/cadastros";
import { fonte } from "../dados/fonte";
import { DESTINO } from "../leitura/tipos";
import { basesDemo } from "./demo";
import {
  marcarQuebras, prepararConfirmacoes, prepararEquipamentos, prepararEquipe, prepararIw38, prepararNotas, prepararOperacoes,
  prepararRequisicoes, tiposPorOrdem, type Confirmacao, type Crua, type Equipamento, type Nota, type Operacao, type Ordem,
  type Pessoa, type Requisicao,
} from "./preparo";
import { hoje } from "./util";

/**
 * As bases do SAP já preparadas, para as páginas (servidor). Cada uma com cache pela versão do arquivo no
 * repositório de dados (e pelo dia, quando o preparo depende de hoje). Sem repositório: dados fictícios.
 */
export interface Bases {
  ordens: Base<Ordem[]>;
  notas: Base<Nota[]>;
  operacoes: Base<Operacao[]>;
  confirmacoes: Base<Confirmacao[]>;
  equipamentos: Base<Equipamento[]>;
  equipe: Base<Pessoa[]>;
  requisicoes: Base<Requisicao[]>;
  cruas: { ip19: Base<Crua[]>; af: Base<Crua[]>; acoesAf: Base<Crua[]> }; // preparadas pelos módulos próprios
  hoje: number;
}

const ident = (l: Crua[]) => l;

export async function bases(): Promise<Bases> {
  const h = hoje();
  if (!fonte()) return basesDemo(h);
  const dia = String(h);
  const [iw38, oper, conf, iw28, ih08, equipe, req, ip19, af, acoesAf] = await Promise.all([
    lerBase(DESTINO.iw38, (l) => prepararIw38(l, h).ordens, dia),
    lerBase(DESTINO.iw38op, (l) => prepararOperacoes(l)),
    lerBase(DESTINO.iw47, (l) => prepararConfirmacoes(l)),
    lerBase(DESTINO.iw28, (l) => prepararNotas(l, h), dia),
    lerBase(DESTINO.ih08, (l) => prepararEquipamentos(l)),
    lerBase(DESTINO.equipe, (l) => prepararEquipe(l)),
    lerBase(DESTINO.requisicoes, (l) => prepararRequisicoes(l, h), dia),
    lerBase(DESTINO.ip19, ident),
    lerBase(DESTINO.af, ident),
    lerBase(DESTINO.acoes_af, ident),
  ]);
  // quebra = Y1 convertida em YM11: o tipo da ordem vem das três bases que têm ordem
  const tipos = tiposPorOrdem(iw38.dados || [], oper.dados || [], conf.dados || []);
  const notas = { ...iw28, dados: iw28.dados ? marcarQuebras(iw28.dados, tipos) : null };
  return { ordens: iw38, notas, operacoes: oper, confirmacoes: conf, equipamentos: ih08, equipe, requisicoes: req,
    cruas: { ip19, af, acoesAf }, hoje: h };
}

/** Só a lista da Gestão de HH (para conferir um pedido de acesso sem ler as outras bases). */
export async function equipe(): Promise<Pessoa[]> {
  if (!fonte()) return basesDemo(hoje()).equipe.dados || [];
  return (await lerBase(DESTINO.equipe, (l) => prepararEquipe(l))).dados || [];
}

/** Os cadastros do app que os indicadores usam (metas, equipamentos, materiais, HH). */
export async function cadastros() {
  const [metas, equipamentos, materiais, preferencias] = await Promise.all([
    lerCadastro("metas_wcm.json"), lerCadastro("cadastro_equipamentos.json"), lerCadastro("cadastro_materiais.json"),
    lerCadastro("preferencias.json"),
  ]);
  return { metas, equipamentos, materiais, preferencias };
}
