import type { OrdemCusto } from "@/app/(app)/custos/calculo";
import type { Cadastro } from "@/lib/dados/cadastros";

import type { Requisicao } from "./preparo";
import { partes, type Dia } from "./util";

export { faseDaRequisicao, tipoDaRequisicao } from "./preparo";

/**
 * Contas do orçamento mensal (aba Custos): gasto = ordens + requisições aprovadas; a entrar = requisições
 * aguardando aprovação. Puras para testar (testes/orcamento.test.ts). Dados fictícios nos testes.
 */

/** Dias até a requisição entrar no orçamento: material 30, serviço 15 (a partir do envio; sem envio, do último envio). */
const DIAS_ENTRADA = { material: 30, servico: 15 } as const;

const pad2 = (n: number) => String(n).padStart(2, "0");

/** Mês do dia no formato "AAAA-MM". */
export function chaveMes(d: Dia): string {
  const p = partes(d);
  return `${p.ano}-${pad2(p.mes)}`;
}

/** Mês em que a requisição entra no orçamento (null sem data). Tipo ausente conta como material. */
export function entradaDaRequisicao(r: Pick<Requisicao, "enviadoEm" | "ultimoEnvio" | "tipo">): Dia | null {
  const base = r.enviadoEm ?? r.ultimoEnvio;
  if (base == null) return null;
  return base + DIAS_ENTRADA[r.tipo ?? "material"];
}

/** Orçamentos cadastrados: itens "orcamento:AAAA-MM" com `valor` numérico ≥ 0 (texto e negativo ficam de fora). */
export function orcamentoDe(cad: Cadastro | null | undefined): Map<string, number> {
  const out = new Map<string, number>();
  for (const [k, item] of Object.entries(cad ?? {})) {
    const m = /^orcamento:(\d{4}-(0[1-9]|1[0-2]))$/.exec(k);
    if (!m) continue;
    const v = item?.valor;
    if (typeof v === "number" && Number.isFinite(v) && v >= 0) out.set(m[1], v);
  }
  return out;
}

export interface LinhaOrcamento {
  mes: string; disponivel: number | null; ordens: number; requisicoes: number | null; saldo: number | null; aEntrar: number | null;
}

export interface ResultadoOrcamento {
  linhas: LinhaOrcamento[];
  totais: { disponivel: number | null; gasto: number; saldo: number | null; aEntrar: number | null };
  /** Requisições (aprovada ou pendente, com total) sem data de envio: não entram em nenhum mês, em qualquer período. */
  semData: number;
  /** Nenhuma requisição com tipo (base sem a coluna): a tela avisa. */
  semTipo: boolean;
}

/** Meses de [ini, fim] em ordem, do mês de ini ao mês de fim. */
function mesesEntre(ini: Dia, fim: Dia): string[] {
  const a = partes(ini), b = partes(fim);
  const hi = b.ano * 12 + (b.mes - 1);
  const out: string[] = [];
  for (let k = a.ano * 12 + (a.mes - 1); k <= hi; k++) out.push(`${Math.floor(k / 12)}-${pad2((k % 12) + 1)}`);
  return out;
}

/**
 * Uma linha por mês de [ini, fim]. Ordens somam `custoReal` no dia da ordem (sem data fica fora).
 * Requisições (se `reqs` não for null): fase aprovada soma em `requisicoes`, pendente em `aEntrar`, no mês de entrada.
 * `saldo` só onde há orçamento cadastrado: disponível − ordens − requisicoes (nunca 0 implícito).
 */
export function orcamentoPorMes(
  ordens: OrdemCusto[], reqs: Requisicao[] | null, disponivel: Map<string, number>, ini: Dia, fim: Dia,
): ResultadoOrcamento {
  const meses = mesesEntre(ini, fim);
  const gasto = new Map<string, number>(), aprov = new Map<string, number>(), pend = new Map<string, number>();
  for (const x of ordens) {
    if (x.data == null || x.data < ini || x.data > fim) continue;
    const m = chaveMes(x.data);
    gasto.set(m, (gasto.get(m) ?? 0) + x.custoReal);
  }
  let semData = 0;
  for (const r of reqs ?? []) {
    if (r.fase === "fora" || !(r.total > 0)) continue;
    const entrada = entradaDaRequisicao(r);
    if (entrada == null) { semData++; continue; }
    if (entrada < ini || entrada > fim) continue;
    const mapa = r.fase === "aprovada" ? aprov : pend;
    const m = chaveMes(entrada);
    mapa.set(m, (mapa.get(m) ?? 0) + r.total);
  }

  const linhas: LinhaOrcamento[] = meses.map((mes) => {
    const disp = disponivel.get(mes) ?? null;
    const ord = gasto.get(mes) ?? 0;
    const req = reqs ? (aprov.get(mes) ?? 0) : null;
    return {
      mes, disponivel: disp, ordens: ord, requisicoes: req,
      saldo: disp != null ? disp - ord - (req ?? 0) : null,
      aEntrar: reqs ? (pend.get(mes) ?? 0) : null,
    };
  });

  const comDisp = linhas.filter((l) => l.disponivel != null);
  const somar = (xs: number[]) => xs.reduce((s, v) => s + v, 0);
  return {
    linhas,
    totais: {
      disponivel: comDisp.length ? somar(comDisp.map((l) => l.disponivel ?? 0)) : null,
      gasto: somar(linhas.map((l) => l.ordens + (l.requisicoes ?? 0))),
      saldo: comDisp.length ? somar(comDisp.map((l) => l.saldo ?? 0)) : null,
      aEntrar: reqs ? somar(linhas.map((l) => l.aEntrar ?? 0)) : null,
    },
    semData,
    semTipo: !!reqs?.length && reqs.every((r) => r.tipo == null),
  };
}
