import Link from "next/link";

import { Secao } from "@/components/PaginaWcm";
import { Cartao } from "@/components/ui";
import { analisarModos } from "@/lib/wcm/modosFalha";
import { tiposPorOrdem } from "@/lib/wcm/preparo";
import { contexto, dados } from "@/lib/wcm/contexto";
import * as ind from "@/lib/wcm/indicadores";
import { dataBr } from "@/lib/wcm/util";

import type { Params } from "./url";

/**
 * Histórico do equipamento informado no diagnóstico: as últimas 5 quebras (mesma regra da Confiabilidade) e os 5
 * modos de causa mais frequentes (IW47 das ordens YM11 dele). Sem quebras nem modos, o bloco não aparece.
 */
export async function HistoricoEquipamento({ params, eq, podeFicha }: { params: Params; eq: string; podeFicha: boolean }) {
  const c = await contexto(params);
  const d = await dados(c);
  const ordensIds = new Set((c.b.ordens.dados ?? []).filter((o) => o.equipChave === eq).map((o) => o.ordem));
  const quebras = ind.quebras(d).filter((q) => q.equipChave === eq)
    .sort((a, b) => (b.data ?? 0) - (a.data ?? 0)).slice(0, 5);
  const conf = (c.b.confirmacoes.dados ?? []).filter((x) => ordensIds.has(x.ordem));
  const tipos = tiposPorOrdem(c.b.ordens.dados ?? [], c.b.operacoes.dados ?? [], c.b.confirmacoes.dados ?? []);
  const modos = analisarModos(conf, tipos).modos.slice(0, 5);
  if (!quebras.length && !modos.length) return null;

  return (
    <Secao titulo="Histórico" destaque={eq} sub="Últimas quebras e modos de causa mais frequentes deste equipamento.">
      {podeFicha && (
        <Link prefetch={false} href={`/equipamentos/biblioteca?eq=${encodeURIComponent(eq)}`}
          className="inline-flex min-h-11 items-center text-[13.5px] font-semibold text-acao hover:text-[var(--acao-forte)]">
          Abrir a ficha do equipamento
        </Link>
      )}
      <div className="grid gap-4 lg:grid-cols-2">
        {quebras.length > 0 && (
          <Cartao className="overflow-hidden">
            <h3 className="border-b border-borda px-5 py-3 font-display text-[16px] font-medium text-texto">Últimas quebras</h3>
            <ul className="divide-y divide-borda">
              {quebras.map((q) => (
                <li key={`${q.nota}-${q.data}`} className="space-y-0.5 px-5 py-3 text-[13.5px]">
                  <div className="flex flex-wrap gap-x-3 text-texto-3">
                    <span>{q.data != null ? dataBr(q.data) : "—"}</span>
                    <span className="num font-mono">Nota {q.nota}</span>
                    {q.ordem && <span className="num font-mono">Ordem {q.ordem}</span>}
                  </div>
                  <div className="text-texto">{q.descricao || "Sem descrição"}</div>
                </li>
              ))}
            </ul>
          </Cartao>
        )}
        {modos.length > 0 && (
          <Cartao className="overflow-hidden">
            <h3 className="border-b border-borda px-5 py-3 font-display text-[16px] font-medium text-texto">Modos de causa</h3>
            <ul className="divide-y divide-borda">
              {modos.map((m) => (
                <li key={m.modo} className="space-y-0.5 px-5 py-3 text-[13.5px]">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                    <span className="font-medium text-texto">{m.modo}</span>
                    <span className="num font-mono text-texto-3">{m.ordens} ordem(ns) · {Math.round(m.pct * 100)}%</span>
                  </div>
                  {m.exemplos[0] && <div className="text-texto-3">Ex.: {m.exemplos[0]}</div>}
                </li>
              ))}
            </ul>
          </Cartao>
        )}
      </div>
    </Secao>
  );
}
