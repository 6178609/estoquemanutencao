import clsx from "clsx";
import Link from "next/link";

import { Grafico, Linhas, Sparkline } from "@/components/graficos";
import { mesesComReal, unidadeKpi, type LinhaSim } from "@/lib/wcm/indicadoresSim";
import { ultimoMesComReal, type MaquinaRoadmap } from "@/lib/wcm/roadmapSim";
import { evolucao, indiceMes, pct, pontosAtencao, porArea, porIndicador, resumoSim, type Conta } from "@/lib/wcm/visaoGeralSim";

import { AbasParam, GradeNumeros, Numero } from "../equipamentos/_ui/Blocos";
import { hrefCom } from "../equipamentos/_ui/url";
import { IndicadoresSap } from "./IndicadoresSap";

type Params = Record<string, string | string[] | undefined>;
const um = (p: Params, k: string) => (Array.isArray(p[k]) ? p[k]![0] : p[k]) ?? "";
const MESES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
const rotuloMes = (m: string) => `${MESES[Number(m.slice(5, 7)) - 1]}/${m.slice(0, 4)}`;
const fmtPct = (c: Conta) => {
  const p = pct(c);
  return p == null ? "—" : `${Math.round(p)}%`;
};
const tom = (c: Conta) => {
  const p = pct(c);
  return p == null ? undefined : p >= 90 ? "bom" : p >= 70 ? "atencao" : "critico";
};
const valor = (v: number | null, kpi: string) => {
  if (v == null) return "—";
  const u = unidadeKpi(kpi);
  const t = v.toLocaleString("pt-BR", { maximumFractionDigits: Math.abs(v) >= 100 ? 0 : 2 });
  return u === "%" ? `${t}%` : u === "h" ? `${t} h` : t;
};

/** Barrinha "n de m na meta": a cor vem da faixa (≥ 90% bom, ≥ 70% atenção, abaixo crítico), sempre com o número ao lado. */
function Faixa({ c }: { c: Conta }) {
  const p = pct(c);
  const cor = p == null ? "var(--superficie-3)" : p >= 90 ? "var(--st-bom)" : p >= 70 ? "var(--st-atencao)" : "var(--st-critico)";
  return (
    <div className="flex items-center gap-2">
      <div className="h-2 w-24 overflow-hidden rounded-full bg-superficie-3" aria-hidden>
        <div className="h-full rounded-full" style={{ width: `${p ?? 0}%`, background: cor }} />
      </div>
      <span className="num whitespace-nowrap text-[12.5px] text-texto-2">{c.de ? `${c.na} de ${c.de}` : "sem dado"}</span>
    </div>
  );
}

const TH = "px-3 py-2 text-left text-[11.5px] font-semibold uppercase tracking-wide text-texto-3";
const TD = "px-3 py-2 text-[13px]";

export function VisaoGeral({ linhas, maquinas, params }: { linhas: LinhaSim[]; maquinas: MaquinaRoadmap[]; params: Params }) {
  // meses com dado no Deck ou no Roadmap (o roadmap não traz o ano: vale o do Deck, ou o atual)
  const ano = mesesComReal(linhas)[0]?.slice(0, 4) ?? String(new Date().getFullYear());
  const doRoadmap = Array.from({ length: ultimoMesComReal(maquinas) + 1 }, (_, i) => `${ano}-${String(i + 1).padStart(2, "0")}`);
  const meses = [...new Set([...mesesComReal(linhas), ...doRoadmap])].sort();
  // sem nenhuma planilha do SIM, a visão segue só com os indicadores do SAP, no mês corrente
  if (!meses.length) { const h = new Date(); meses.push(`${h.getFullYear()}-${String(h.getMonth() + 1).padStart(2, "0")}`); }
  const pedido = um(params, "gmes");
  const mes = meses.find((m) => m === pedido) ?? (/^\d{4}-(0[1-9]|1[0-2])$/.test(pedido) ? pedido : meses[meses.length - 1]);

  const r = resumoSim(linhas, maquinas, mes, ano);
  const ev = evolucao(linhas, maquinas, mes, ano);
  const ind = porIndicador(linhas, mes);
  const areas = porArea(linhas, mes);
  const atencao = pontosAtencao(linhas, maquinas, mes, ano);
  const i = indiceMes(mes);

  return (
    <div className="space-y-6">
      <AbasParam params={params} param="gmes" atual={mes} abas={[...new Set([...meses.slice(-12), mes])].sort().map((m) => ({ id: m, rotulo: rotuloMes(m) }))} />
      <p className="text-[13px] text-texto-2">
        Retrato de <b>{rotuloMes(mes)}</b>: os indicadores de manutenção do pilar MP (Deck) contra a meta e o Roadmap de passos por máquina contra o previsto.
        {!linhas.length && " A planilha de indicadores ainda não foi enviada — só o Roadmap entra."}
        {!maquinas.length && " O Roadmap ainda não foi enviado — só os indicadores entram."}
      </p>
      <h2 className="font-display text-[18px] font-medium">Resumo do SIM em {rotuloMes(mes)}</h2>
      <GradeNumeros colunas={4}>
        <Numero rotulo="Aderência geral do SIM" valor={fmtPct(r.geral)} tom={tom(r.geral)}
          detalhe={`${r.geral.na} de ${r.geral.de} itens no alvo (indicadores na meta + máquinas no passo previsto)`} />
        <Numero rotulo="Indicadores de manutenção na meta" valor={fmtPct(r.deck)} tom={tom(r.deck)}
          detalhe={`${r.deck.na} de ${r.deck.de} (área × indicador) · ${r.melhoraram} melhoraram, ${r.pioraram} pioraram`} />
        <Numero rotulo="Acumulado do ano na meta" valor={fmtPct(r.ytd)} tom={tom(r.ytd)} detalhe={`${r.ytd.na} de ${r.ytd.de} (YTD)`} />
        <Numero rotulo="Roadmap no passo previsto" valor={fmtPct(r.roadmap)} tom={tom(r.roadmap)}
          detalhe={`${r.roadmap.na} de ${r.roadmap.de} máquinas · ${r.roadmap.de - r.roadmap.na} atrasada(s)`} />
      </GradeNumeros>

      <Grafico titulo="Evolução no ano" subtitulo="% dos indicadores na meta e % das máquinas no passo previsto, mês a mês"
        tabela={{ colunas: ["Mês", "Indicadores na meta", "Máquinas no previsto"],
          linhas: ev.map((p) => [rotuloMes(p.mes), fmtPct(p.deck), fmtPct(p.roadmap)]) }}>
        <Linhas rotulos={ev.map((p) => MESES[Number(p.mes.slice(5, 7)) - 1])} formato="%" minimo={0} altura={230}
          series={[
            { nome: "Indicadores na meta", cor: "serie-1", valores: ev.map((p) => pct(p.deck)) },
            { nome: "Máquinas no previsto", cor: "serie-2", valores: ev.map((p) => pct(p.roadmap)) },
          ]} />
      </Grafico>

      <section className="space-y-3">
        <div>
          <h2 className="font-display text-[18px] font-medium">Indicadores de manutenção do SIM — calculados pelas fontes de dados</h2>
          <p className="text-[12.5px] text-texto-3">No formato do SIM (tipo A/B, meta, mês anterior, mês e acumulado): os KPIs do pilar MP contra a planilha, e os demais por tema — {rotuloMes(mes)}.</p>
        </div>
        <IndicadoresSap mes={mes} rotulo={rotuloMes(mes)} deck={linhas} />
      </section>

      <h2 className="font-display text-[18px] font-medium">Deck do pilar MP — por indicador e por área</h2>
      <div className="grid gap-5 xl:grid-cols-2">
        <section className="overflow-hidden rounded-cartao border border-borda bg-superficie">
          <h2 className="border-b border-borda px-4 py-3 font-display text-[15px] font-medium">Por indicador de manutenção</h2>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] border-collapse">
              <thead><tr className="border-b border-borda">
                <th className={TH}>Indicador</th><th className={TH}>Áreas na meta ({MESES[i]})</th><th className={TH}>Acumulado</th><th className={TH}>No ano</th>
              </tr></thead>
              <tbody>
                {ind.map((x) => (
                  <tr key={x.kpi} className="border-b border-borda last:border-0">
                    <th scope="row" className={clsx(TD, "text-left font-medium")}>
                      {x.kpi}
                      {x.foraDaMeta.length > 0 && <div className="mt-0.5 text-[11.5px] font-normal text-texto-3">fora: {x.foraDaMeta.join(", ")}</div>}
                    </th>
                    <td className={TD}><Faixa c={x.mes} /></td>
                    <td className={TD}><Faixa c={x.ytd} /></td>
                    <td className="w-28 px-3 py-1"><Sparkline valores={x.serie} altura={26} /></td>
                  </tr>
                ))}
                {!ind.length && <tr><td colSpan={4} className="px-3 py-5 text-center text-[13px] text-texto-3">Sem indicadores neste mês.</td></tr>}
              </tbody>
            </table>
          </div>
        </section>
        <section className="overflow-hidden rounded-cartao border border-borda bg-superficie">
          <h2 className="border-b border-borda px-4 py-3 font-display text-[15px] font-medium">Por área <span className="text-[12.5px] font-normal text-texto-3">(as piores primeiro)</span></h2>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] border-collapse">
              <thead><tr className="border-b border-borda">
                <th className={TH}>Área</th><th className={TH}>Na meta ({MESES[i]})</th><th className={TH}>Fora da meta</th>
              </tr></thead>
              <tbody>
                {areas.map((a) => (
                  <tr key={a.area} className="border-b border-borda last:border-0">
                    <th scope="row" className={clsx(TD, "whitespace-nowrap text-left font-medium")}>{a.area}</th>
                    <td className={TD}><Faixa c={a.mes} /></td>
                    <td className={clsx(TD, "text-[12.5px] text-texto-2")}>{a.foraDaMeta.join(", ") || <span className="text-texto-4">—</span>}</td>
                  </tr>
                ))}
                {!areas.length && <tr><td colSpan={3} className="px-3 py-5 text-center text-[13px] text-texto-3">Sem indicadores neste mês.</td></tr>}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      <section className="space-y-3">
        <h2 className="font-display text-[18px] font-medium">Pontos de atenção em {rotuloMes(mes)}</h2>
        <div className="grid gap-5 xl:grid-cols-2">
          <div className="rounded-cartao border border-borda bg-superficie p-4">
            <div className="mb-2 flex items-center justify-between gap-2">
              <h3 className="text-[14px] font-medium">Indicadores fora da meta ({atencao.indicadores.length})</h3>
              <Link href={hrefCom(params, { visao: "deck", mes })} className="text-[12.5px] font-medium text-alp-azul hover:underline">Ver o Deck</Link>
            </div>
            <ul className="divide-y divide-borda">
              {atencao.indicadores.slice(0, 12).map((x) => (
                <li key={`${x.area}|${x.kpi}`} className="flex flex-wrap items-baseline justify-between gap-x-3 py-1.5 text-[13px]">
                  <span><b className="font-medium">{x.kpi}</b> · {x.area}{x.atual.melhorou === false && <span className="ml-1.5 text-[11.5px] text-[var(--selo-critico-texto)]">piorou</span>}</span>
                  <span className="num text-texto-2">real {valor(x.atual.real, x.kpi)} · meta {valor(x.atual.meta, x.kpi)}</span>
                </li>
              ))}
              {!atencao.indicadores.length && <li className="py-2 text-[13px] text-texto-3">Todos os indicadores com dado estão na meta.</li>}
            </ul>
            {atencao.indicadores.length > 12 && <p className="mt-1 text-[12px] text-texto-3">e mais {atencao.indicadores.length - 12} no Deck.</p>}
          </div>
          <div className="rounded-cartao border border-borda bg-superficie p-4">
            <div className="mb-2 flex items-center justify-between gap-2">
              <h3 className="text-[14px] font-medium">Máquinas abaixo do passo previsto ({atencao.maquinas.length})</h3>
              <Link href={hrefCom(params, { visao: "roadmap", rmes: ["JAN", "FEV", "MAR", "ABR", "MAI", "JUN", "JUL", "AGO", "SET", "OUT", "NOV", "DEZ"][i], ratr: "1" })}
                className="text-[12.5px] font-medium text-alp-azul hover:underline">Ver o Roadmap</Link>
            </div>
            <ul className="divide-y divide-borda">
              {atencao.maquinas.slice(0, 12).map((m) => (
                <li key={`${m.fabrica}|${m.maquina}`} className="py-1.5 text-[13px]">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                    <b className="font-medium">{m.maquina}</b>
                    <span className="num text-texto-2">passo {m.realizado[i]?.toLocaleString("pt-BR")} de {m.previsto[i]?.toLocaleString("pt-BR")} previsto</span>
                  </div>
                  {m.comentario && <div className="text-[12px] text-texto-3">{m.comentario}</div>}
                </li>
              ))}
              {!atencao.maquinas.length && <li className="py-2 text-[13px] text-texto-3">Nenhuma máquina abaixo do previsto.</li>}
            </ul>
            {atencao.maquinas.length > 12 && <p className="mt-1 text-[12px] text-texto-3">e mais {atencao.maquinas.length - 12} no Roadmap.</p>}
          </div>
        </div>
      </section>
      <p className="text-[12px] text-texto-3">
        Faixas: verde a partir de 90% no alvo, amarelo de 70% a 90%, vermelho abaixo de 70%. Indicador na meta pelo tipo (A: real ≥ meta; B: real ≤ meta);
        máquina no previsto quando o passo realizado chega ao previsto do mês.
      </p>
    </div>
  );
}
