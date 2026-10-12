import clsx from "clsx";
import { AlertTriangle, ArrowRight, CircleCheck, CircleDashed, CircleX, TrendingDown, TrendingUp } from "lucide-react";
import Link from "next/link";

import * as ind from "@/lib/wcm/indicadores";
import { Sparkline, type Cor } from "./graficos";

/** Farol: cor de status + ícone + rótulo (nunca só a cor). */
export const COR_FAROL: Record<ind.Farol, Cor> = { verde: "st-bom", amarelo: "st-atencao", vermelho: "st-critico", neutro: "neutro" };
const ICONE_FAROL = { verde: CircleCheck, amarelo: AlertTriangle, vermelho: CircleX, neutro: CircleDashed };

export function SeloFarol({ farol, compacto }: { farol: ind.Farol; compacto?: boolean }) {
  const I = ICONE_FAROL[farol];
  return (
    <span className="inline-flex items-center gap-1 text-[11.5px] font-medium text-texto-2" title={ind.NOME_FAROL[farol]}>
      <I className="size-3.5" style={{ color: `var(--${COR_FAROL[farol] === "neutro" ? "texto-4" : COR_FAROL[farol]})` }} strokeWidth={2} />
      {!compacto && ind.NOME_FAROL[farol]}
    </span>
  );
}

function textoVariacao(kpi: ind.Kpi, atual: number | null | undefined, anterior: number | null | undefined) {
  const [delta, melhorou] = ind.variacao(kpi, atual, anterior);
  if (delta == null) return null;
  const nf = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: kpi.unidade === "un" ? 0 : 1 });
  const txt = `${nf.format(Math.abs(delta))}${kpi.unidade === "%" ? " p.p." : kpi.unidade === "un" ? "" : "%"}`;
  const I = delta > 0 ? TrendingUp : TrendingDown;
  return (
    <span title="vs período anterior de mesma duração" className={clsx("inline-flex items-center gap-0.5 font-medium",
      melhorou == null ? "text-texto-3" : melhorou ? "text-[var(--st-bom)]" : "text-[var(--st-critico)]")}>
      {delta !== 0 && <I className="size-3.5" />}{delta === 0 ? "=" : txt}
    </span>
  );
}

/** Cartão de indicador: nome (fórmula na dica), valor, farol, meta, variação, tendência de 12 meses e "Detalhar". */
export function CartaoKpi({ kpi, valor, anterior, metas, serie, link = true }: {
  kpi: ind.Kpi; valor: number | null | undefined; anterior?: number | null; metas: Record<string, Record<string, unknown>>;
  serie?: (number | null)[]; link?: boolean;
}) {
  const alvo = ind.meta(kpi, metas);
  const f = ind.farol(kpi, valor, alvo);
  return (
    <div className="flex flex-col justify-between rounded-cartao border border-borda bg-superficie p-4 transition hover:border-borda-forte">
      <div>
        <div className="flex items-start justify-between gap-2">
          <div className="text-[13px] font-medium leading-snug text-texto-2" title={kpi.formula}>{kpi.nome}</div>
          <SeloFarol farol={f} compacto />
        </div>
        <div className="mt-2 font-display text-[28px] font-medium leading-none tracking-[-0.02em]">{ind.formatar(kpi, valor)}</div>
        <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[12px] text-texto-3">
          <span>{alvo == null ? "sem meta" : `meta ${kpi.sentido > 0 ? "≥" : "≤"} ${ind.formatar(kpi, alvo)}`}</span>
          {textoVariacao(kpi, valor, anterior)}
        </div>
      </div>
      {serie && kpi.mensal && serie.filter((x) => x != null).length >= 2 && (
        <div className="mt-3"><Sparkline valores={serie} cor={COR_FAROL[f] === "neutro" ? "serie-1" : COR_FAROL[f]} /></div>
      )}
      {link && (
        <Link href={kpi.pagina} className="mt-3 inline-flex items-center gap-1 text-[12.5px] text-texto-3 transition hover:text-texto">
          Detalhar <ArrowRight className="size-3.5" />
        </Link>
      )}
    </div>
  );
}

export function GradeKpis({ kpis, atual, anterior, metas, serie, link, colunas = 4 }: {
  kpis: ind.Kpi[]; atual: ind.Resultado; anterior?: ind.Resultado; metas: Record<string, Record<string, unknown>>;
  serie?: { mes: number; valores: ind.Resultado }[]; link?: boolean; colunas?: 3 | 4 | 5;
}) {
  return (
    <div className={clsx("grid gap-3 sm:grid-cols-2", colunas === 3 ? "lg:grid-cols-3" : colunas === 5 ? "lg:grid-cols-5" : "lg:grid-cols-4")}>
      {kpis.map((k) => (
        <CartaoKpi key={k.id} kpi={k} valor={atual[k.id]} anterior={anterior?.[k.id]} metas={metas} link={link}
          serie={serie?.map((s) => s.valores[k.id] ?? null)} />
      ))}
    </div>
  );
}

/** Scorecard: linhas = área/setor/centro × colunas = indicadores, com o farol em cada célula (ícone + cor). */
export function Scorecard({ rotulo, valores, kpis, metas }: { rotulo: string; valores: Record<string, ind.Resultado>; kpis: ind.Kpi[];
  metas: Record<string, Record<string, unknown>> }) {
  return (
    <div className="overflow-x-auto rounded-cartao border border-borda bg-superficie">
      <table className="w-full min-w-[900px] text-left text-[12.5px]">
        <thead className="border-b border-borda bg-superficie-2 text-[11.5px] text-texto-3">
          <tr>
            <th className="sticky left-0 bg-superficie-2 px-3 py-2 font-medium">{rotulo}</th>
            {kpis.map((k) => <th key={k.id} className="px-3 py-2 font-medium" title={k.formula}>{k.nome}</th>)}
          </tr>
        </thead>
        <tbody className="divide-borda divide-y">
          {Object.entries(valores).map(([nome, r]) => (
            <tr key={nome} className={nome.startsWith("TOTAL") ? "bg-superficie-2 font-medium" : undefined}>
              <td className="sticky left-0 bg-inherit px-3 py-2 font-medium">{nome}</td>
              {kpis.map((k) => {
                const f = ind.farol(k, r[k.id], ind.meta(k, metas));
                return (
                  <td key={k.id} className="px-3 py-2">
                    <span className="inline-flex items-center gap-1.5 tabular-nums">
                      {f !== "neutro" && <SeloFarol farol={f} compacto />}{ind.formatar(k, r[k.id])}
                    </span>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
