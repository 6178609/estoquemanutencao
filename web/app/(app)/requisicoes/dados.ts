import "server-only";

import { deIsoDia, paraIso } from "@/lib/wcm/filtros";
import type { Requisicao } from "@/lib/wcm/preparo";
import { dia, inicioDoMes, partes, somarMeses, type Dia } from "@/lib/wcm/util";
import type { Coluna, Linha } from "../ordens/_comum/TabelaDados";
import { casa, ligado, lista, ordenar, termos, um, type Params } from "../ordens/_comum/url";

/**
 * Requisições de compra . Sem os filtros globais (não têm área/centro): período
 * próprio pelo "Enviado em" (abre no mês atual), só pendentes (ligado por padrão), aprovador, solicitante e busca.
 */
export const PERIODOS = [
  { valor: "mes", rotulo: "Mês atual" }, { valor: "3m", rotulo: "Últimos 3 meses" }, { valor: "12m", rotulo: "Últimos 12 meses" },
  { valor: "ano", rotulo: "Ano atual" }, { valor: "tudo", rotulo: "Tudo" },
];

interface FiltroReq { q: string; pend: boolean; apr: string[]; sol: string[]; ini: Dia | null; fim: Dia | null; per: string }

export function lerFiltro(p: Params, hoje: Dia): FiltroReq {
  const de = deIsoDia(um(p.de)), ate = deIsoDia(um(p.ate));
  let per = um(p.per) || "mes", ini: Dia | null, fim: Dia | null;
  if (de != null || ate != null) { per = ""; ini = de; fim = ate; }
  else {
    const mes = inicioDoMes(hoje);
    fim = hoje;
    ini = per === "3m" ? somarMeses(mes, -2) : per === "12m" ? somarMeses(mes, -11) : per === "ano" ? dia(partes(hoje).ano, 1, 1)
      : per === "tudo" ? null : mes;
    if (per === "tudo") fim = null;
    if (!PERIODOS.some((x) => x.valor === per)) per = "mes";
  }
  return { q: um(p.q), pend: ligado(p.pend, true), apr: lista(p.apr), sol: lista(p.sol), ini, fim, per };
}

const noPeriodo = (r: Requisicao, f: FiltroReq) =>
  (f.ini == null && f.fim == null) || (r.enviadoEm != null && (f.ini == null || r.enviadoEm >= f.ini) && (f.fim == null || r.enviadoEm <= f.fim));

export function filtrar(xs: Requisicao[], f: FiltroReq) {
  const ts = termos(f.q), apr = new Set(f.apr), sol = new Set(f.sol);
  const semData = xs.filter((r) => (!ts.length || casa(termos([r.requisicao, r.po, r.itens, r.justificativa, r.solicitante].join(" ")).join(" "), ts))
    && (!f.pend || r.pendente) && (!apr.size || apr.has(r.aprovador)) && (!sol.size || sol.has(r.solicitante)));
  const filtradas = semData.filter((r) => noPeriodo(r, f));
  const fora = semData.filter((r) => r.pendente && !noPeriodo(r, f));
  return { filtradas, fora };
}

export const COLUNAS: Coluna[] = [
  { chave: "requisicao", rotulo: "Requisição", tipo: "codigo", celular: true },
  { chave: "status", rotulo: "Status", celular: true },
  { chave: "aprovador", rotulo: "Aprovador" },
  { chave: "solicitante", rotulo: "Solicitante" },
  { chave: "itens", rotulo: "Itens", tipo: "longo", celular: true },
  { chave: "enviadoEm", rotulo: "Enviado em", tipo: "data" },
  { chave: "diasAguardando", rotulo: "Dias aguardando", tipo: "int", celular: true },
  { chave: "total", rotulo: "Total", tipo: "R$", celular: true },
  { chave: "po", rotulo: "PO", tipo: "codigo" },
  { chave: "justificativa", rotulo: "Justificativa", tipo: "longo" },
];
const CHAVES = new Set(COLUNAS.map((c) => c.chave));

/** Padrão: pendentes primeiro, maior valor primeiro. */
export function ordenarReq(xs: Requisicao[], p: Params) {
  const ord = um(p.ord);
  if (ord && CHAVES.has(ord)) {
    const desc = um(p.dir) === "desc";
    return { lista: ordenar(xs, (r) => (r as unknown as Linha)[ord], desc), ord, desc };
  }
  return { lista: [...xs].sort((a, b) => Number(b.pendente) - Number(a.pendente) || b.total - a.total), ord: undefined, desc: true };
}

export const linha = (r: Requisicao): Linha => r as unknown as Linha;
export { paraIso };

export const FAIXAS_ESPERA = [["Até 7 dias", 0, 7], ["8 a 15 dias", 8, 15], ["16 a 30 dias", 16, 30], ["Mais de 30 dias", 31, Infinity]] as const;
