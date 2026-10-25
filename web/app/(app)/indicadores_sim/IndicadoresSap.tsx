import clsx from "clsx";
import { ArrowRight } from "lucide-react";
import Link from "next/link";

import { SeloFarol } from "@/components/Indicador";
import { contexto, resultados } from "@/lib/wcm/contexto";
import * as ind from "@/lib/wcm/indicadores";
import { mesAnterior, type LinhaSim } from "@/lib/wcm/indicadoresSim";
import { GRUPOS_SIM, kpisMp, linhasSap, type LinhaMp } from "@/lib/wcm/simSap";

import { GradeNumeros, Numero } from "../equipamentos/_ui/Blocos";

/** Período do mês ("2026-09"), ou de janeiro até ele (YTD); fábrica inteira (sem os filtros de área do site). */
function periodo(mes: string, ytd = false): Record<string, string> {
  const [a, m] = mes.split("-").map(Number);
  const ultimo = new Date(Date.UTC(a, m, 0)).getUTCDate();
  return { ini: ytd ? `${a}-01-01` : `${mes}-01`, fim: `${mes}-${String(ultimo).padStart(2, "0")}`, area: "", setor: "", centro: "", tipo: "" };
}

const fmtMp = (v: number | null, u: LinhaMp["unidade"]) => {
  if (v == null) return "—";
  const t = v.toLocaleString("pt-BR", { maximumFractionDigits: u === "un" ? 0 : Math.abs(v) >= 100 ? 0 : 2 });
  return u === "%" ? `${t}%` : u === "h" ? `${t} h` : t;
};
const TH = "px-2.5 py-2 text-center text-[11px] font-semibold uppercase tracking-wide text-texto-3";
const TD = "num whitespace-nowrap px-2.5 py-2 text-center text-[13px]";

function Ok({ ok, children }: { ok: boolean | null; children: React.ReactNode }) {
  return (
    <span className={clsx("inline-flex items-center gap-1.5 font-semibold", ok === true && "text-[var(--selo-bom-texto)]", ok === false && "text-[var(--selo-critico-texto)]")}>
      {ok != null && <span aria-hidden className="size-2 rounded-full" style={{ background: ok ? "var(--st-bom)" : "var(--st-critico)" }} />}
      {children}
      {ok != null && <span className="sr-only">{ok ? "(na meta)" : "(fora da meta)"}</span>}
    </span>
  );
}

/**
 * Os indicadores de manutenção calculados das fontes de dados do site (IW38, IW28, IW47, IP19, MB52, requisições,
 * Gerenciador de AF, SEMEQ), no formato do SIM: KPIs do pilar MP contra a meta da planilha e os demais em tabela de
 * Deck (tipo A/B, meta, mês anterior, mês, acumulado e farol).
 */
export async function IndicadoresSap({ mes, rotulo, deck }: { mes: string; rotulo: string; deck: LinhaSim[] }) {
  const aviso = (t: string) => <p className="rounded-cartao border border-dashed border-borda-forte p-6 text-center text-[13.5px] text-texto-3">{t}</p>;
  let calc;
  try {
    const [cMes, cAnt, cYtd] = await Promise.all([contexto(periodo(mes)), contexto(periodo(mesAnterior(mes))), contexto(periodo(mes, true))]);
    if (!cMes.b.ordens.dados?.length) return aviso("As bases do SAP ainda não foram enviadas em Fontes de dados.");
    calc = { cMes, r: await Promise.all([resultados(cMes), resultados(cAnt), resultados(cYtd)]) };
  } catch (e) {
    // o bloco do SAP falhar não derruba a visão geral (as planilhas do SIM continuam aparecendo)
    console.warn(`[sim] indicadores do SAP: ${(e as Error).message}`);
    return aviso("Não foi possível calcular os indicadores do SAP agora; tente atualizar a página em instantes.");
  }
  const { cMes } = calc;
  const [[rMes], [rAnt], [rYtd]] = calc.r;
  const mp = kpisMp(rMes, rYtd, deck, mes);
  const linhas = linhasSap(rMes, rAnt, rYtd, cMes.cad.metas);
  const comMeta = linhas.filter((l) => l.farol !== "neutro"), verdes = comMeta.filter((l) => l.farol === "verde").length;
  const pct = comMeta.length ? Math.round((verdes / comMeta.length) * 100) : null;
  const mpComp = mp.filter((x) => x.ok != null), mpOk = mpComp.filter((x) => x.ok).length;
  const MESES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
  const antRot = MESES[Number(mesAnterior(mes).slice(5, 7)) - 1];

  return (
    <div className="space-y-6">
      <GradeNumeros colunas={4}>
        <Numero rotulo={`Indicadores do SAP na meta (${rotulo})`} valor={pct == null ? "—" : `${pct}%`}
          tom={pct == null ? undefined : pct >= 90 ? "bom" : pct >= 70 ? "atencao" : "critico"}
          detalhe={`${verdes} de ${comMeta.length} com meta · ${linhas.length} indicadores calculados`} />
        <Numero rotulo="KPIs do pilar MP na meta do SIM" valor={mpComp.length ? `${mpOk} de ${mpComp.length}` : "—"}
          detalhe="real do SAP contra a meta da planilha" tom={!mpComp.length ? undefined : mpOk === mpComp.length ? "bom" : "critico"} />
        <Numero rotulo="Fora da meta" valor={String(linhas.filter((l) => l.farol === "vermelho").length)} detalhe="mais de 10% pior que a meta"
          tom={linhas.some((l) => l.farol === "vermelho") ? "critico" : "bom"} />
        <Numero rotulo="Sem meta" valor={String(linhas.filter((l) => l.farol === "neutro").length)} detalhe="cadastre em Metas e parâmetros" />
      </GradeNumeros>

      <section className="overflow-hidden rounded-cartao border border-borda bg-superficie">
        <div className="bg-marca-700 px-4 py-2.5 text-white">
          <h3 className="font-display text-[15px] font-medium">KPIs do pilar MP — calculados pelo SAP × planilha do SIM</h3>
        </div>
        <div className="relative overflow-x-auto">
          <table className="w-full min-w-[860px] border-collapse">
            <thead><tr className="border-b border-borda">
              <th className={clsx(TH, "text-left")}>Indicador</th><th className={TH}>Tipo</th>
              <th className={clsx(TH, "border-l border-borda")}>Meta SIM</th><th className={TH}>Real SAP</th><th className={TH}>Real planilha</th>
              <th className={clsx(TH, "border-l border-borda")}>Acumulado SAP</th><th className={clsx(TH, "border-l border-borda text-left")}>Como o SAP calcula</th>
            </tr></thead>
            <tbody>
              {mp.map((x) => (
                <tr key={x.kpi} className="border-b border-borda last:border-0">
                  <th scope="row" className="whitespace-nowrap px-3 py-2 text-left text-[13px] font-medium">{x.kpi}</th>
                  <td className={clsx(TD, "text-texto-3")} title={x.tipo === "A" ? "Quanto maior, melhor" : "Quanto menor, melhor"}>{x.tipo}</td>
                  <td className={clsx(TD, "border-l border-borda text-texto-3")}>{fmtMp(x.metaPlanilha, x.unidade)}</td>
                  <td className={TD}><Ok ok={x.ok}>{fmtMp(x.sap, x.unidade)}</Ok></td>
                  <td className={clsx(TD, "text-texto-2")}>{fmtMp(x.realPlanilha, x.unidade)}</td>
                  <td className={clsx(TD, "border-l border-borda")}>{fmtMp(x.sapYtd, x.unidade)}</td>
                  <td className="border-l border-borda px-3 py-2 text-[12px] text-texto-3">{x.fonte}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="border-t border-borda px-4 py-2 text-[11.5px] text-texto-3">Meta e real da planilha: soma das áreas nas quebras, média das áreas nos demais. Tipo A: real ≥ meta; B: real ≤ meta.</p>
      </section>

      {GRUPOS_SIM.map((g) => {
        const ls = linhas.filter((l) => g.grupos.includes(l.kpi.grupo));
        const cm = ls.filter((l) => l.farol !== "neutro");
        return (
          <section key={g.titulo} className="overflow-hidden rounded-cartao border border-borda bg-superficie">
            <div className="flex flex-wrap items-baseline gap-x-3 border-b border-borda px-4 py-2.5">
              <h3 className="font-display text-[15px] font-medium">{g.titulo}</h3>
              <span className="text-[12.5px] text-texto-3">{cm.length ? `${cm.filter((l) => l.farol === "verde").length} de ${cm.length} na meta` : "sem meta cadastrada"}</span>
            </div>
            <div className="relative overflow-x-auto">
              <table className="w-full min-w-[820px] border-collapse">
                <thead><tr className="border-b border-borda">
                  <th className={clsx(TH, "text-left")}>Indicador</th><th className={TH}>Tipo</th><th className={TH}>Meta</th>
                  <th className={clsx(TH, "border-l border-borda")}>{antRot}</th><th className={clsx(TH, "bg-superficie-2")}>{rotulo}</th>
                  <th className={clsx(TH, "border-l border-borda")}>Acumulado (YTD)</th><th className={TH}><span className="sr-only">Abrir</span></th>
                </tr></thead>
                <tbody>
                  {ls.map((l) => (
                    <tr key={l.kpi.id} className="border-b border-borda last:border-0">
                      <th scope="row" className="px-3 py-2 text-left text-[13px] font-medium" title={l.kpi.formula}>{l.kpi.nome}</th>
                      <td className={clsx(TD, "text-texto-3")} title={l.tipo === "A" ? "Quanto maior, melhor" : "Quanto menor, melhor"}>{l.tipo}</td>
                      <td className={clsx(TD, "text-texto-3")}>{l.meta == null ? "—" : `${l.tipo === "A" ? "≥" : "≤"} ${ind.formatar(l.kpi, l.meta)}`}</td>
                      <td className={clsx(TD, "border-l border-borda text-texto-2")}>{ind.formatar(l.kpi, l.anterior)}</td>
                      <td className={clsx(TD, "bg-superficie-2")}><span className="inline-flex items-center gap-1.5 font-semibold"><SeloFarol farol={l.farol} compacto />{ind.formatar(l.kpi, l.real)}</span></td>
                      <td className={clsx(TD, "border-l border-borda")}><span className="inline-flex items-center gap-1.5"><SeloFarol farol={l.farolYtd} compacto />{ind.formatar(l.kpi, l.ytd)}</span></td>
                      <td className="px-2 py-2 text-right"><Link prefetch={false} href={l.kpi.pagina} className="text-texto-3 hover:text-texto" aria-label={`Abrir ${l.kpi.nome}`}><ArrowRight className="size-4" /></Link></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        );
      })}
      <p className="text-[12px] text-texto-3">
        Calculados das bases enviadas em Fontes de dados, no mês inteiro e na fábrica inteira. Farol: verde na meta, amarelo até 10% pior, vermelho pior que isso.
        As metas vêm da aba Metas e parâmetros.
      </p>
    </div>
  );
}
