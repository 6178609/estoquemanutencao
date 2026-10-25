import clsx from "clsx";
import { ArrowDown, ArrowUp, Equal, FolderOpen } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { Sparkline } from "@/components/graficos";
import { Cabecalho, Pagina, Pilula } from "@/components/ui";
import { podeEditar, podeVer, veInteira } from "@/lib/auth/acesso";
import { lerCadastro } from "@/lib/dados/cadastros";
import { aplicarComentarios, ARQ_COMENTARIOS, type MaquinaRoadmap } from "@/lib/wcm/roadmapSim";
import { exigir } from "@/lib/auth/sessao";
import { indicadoresSim, roadmapSim } from "@/lib/dados/indicadoresSim";
import { dataHora } from "@/lib/formato";
import { mesAnterior, mesesComReal, montarDeck, unidadeKpi, type LinhaDeck } from "@/lib/wcm/indicadoresSim";

import { AbasParam, GradeNumeros, Numero } from "../equipamentos/_ui/Blocos";
import { FiltrosUrl } from "../equipamentos/_ui/FiltrosUrl";
import { ModosFalha } from "./ModosFalha";
import { Roadmap } from "./Roadmap";
import { VisaoGeral } from "./VisaoGeral";

export const metadata: Metadata = { title: "Indicadores SIM (MP)" };
export const dynamic = "force-dynamic";

type Params = Record<string, string | string[] | undefined>;
const MESES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
const rotuloMes = (m: string) => `${MESES[Number(m.slice(5, 7)) - 1]}/${m.slice(0, 4)}`;
const um = (p: Params, k: string) => (Array.isArray(p[k]) ? p[k]![0] : p[k]) ?? "";

function valor(v: number | null, kpi: string): string {
  if (v == null) return "—";
  const u = unidadeKpi(kpi);
  const casas = Number.isInteger(v) && !u ? 0 : Math.abs(v) >= 100 ? 1 : 2;
  const t = v.toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas });
  return u === "%" ? `${t}%` : u === "h" ? `${t} h` : t;
}

/** Real com o farol: verde na meta, vermelho fora (com ícone e texto para quem não distingue a cor). */
function Real({ v, ok, kpi }: { v: number | null; ok: boolean | null; kpi: string }) {
  return (
    <span className={clsx("inline-flex items-center gap-1.5 font-semibold", ok === true && "text-[var(--selo-bom-texto)]", ok === false && "text-[var(--selo-critico-texto)]")}
      title={ok === true ? "Na meta" : ok === false ? "Fora da meta" : undefined}>
      {ok != null && <span aria-hidden className="size-2 rounded-full" style={{ background: ok ? "var(--st-bom)" : "var(--st-critico)" }} />}
      {valor(v, kpi)}
      {ok != null && <span className="sr-only">{ok ? "(na meta)" : "(fora da meta)"}</span>}
    </span>
  );
}

function Tendencia({ l }: { l: LinhaDeck }) {
  const t = l.atual.tendencia;
  if (!t) return <span className="text-texto-4">—</span>;
  const I = t === "sobe" ? ArrowUp : t === "desce" ? ArrowDown : Equal;
  const cor = l.atual.melhorou == null ? "var(--texto-3)" : l.atual.melhorou ? "var(--st-bom)" : "var(--st-critico)";
  return <I role="img" className="mx-auto size-4" style={{ color: cor }} aria-label={t === "igual" ? "igual ao mês anterior" : `${t === "sobe" ? "subiu" : "desceu"}: ${l.atual.melhorou ? "melhorou" : "piorou"}`} />;
}

const TH = "px-2 py-1.5 text-center text-[11px] font-semibold uppercase tracking-wide text-texto-3";
const TD = "num whitespace-nowrap px-2 py-2 text-center text-[13px]";

function TabelaArea({ area, linhas, mes }: { area: string; linhas: LinhaDeck[]; mes: string }) {
  const blocos = [`${rotuloMes(mesAnterior(mes))}`, rotuloMes(mes), "Acumulado (YTD)", rotuloMes(mesAnterior(mes, 1)), `Ano ${mes.slice(0, 4)}`];
  return (
    <section className="overflow-hidden rounded-cartao border border-borda bg-superficie">
      <div className="flex items-center gap-2 bg-marca-700 px-4 py-2.5 text-white">
        <h2 className="font-display text-[15px] font-medium">{area}</h2>
      </div>
      <div className="relative overflow-x-auto">
        <table className="w-full min-w-[980px] border-collapse">
          <thead>
            <tr className="border-b border-borda">
              <th rowSpan={2} className={clsx(TH, "sticky left-0 z-10 bg-superficie text-left")}>Indicador</th>
              <th rowSpan={2} className={TH} title="A: quanto maior, melhor · B: quanto menor, melhor">Tipo</th>
              {blocos.map((b, i) => <th key={b} colSpan={i === 1 ? 3 : 2} className={clsx(TH, "border-l border-borda", i === 1 && "bg-superficie-2 text-texto-2")}>{b}</th>)}
              <th rowSpan={2} className={clsx(TH, "border-l border-borda")}>Evolução</th>
            </tr>
            <tr className="border-b border-borda">
              {["Meta", "Real", "Meta", "Real", "", "Meta", "Real", "Meta", "Previsão", "Meta", "Estimativa"].map((h, i) => (
                <th key={i} className={clsx(TH, "normal-case", (i === 0 || i === 2 || i === 5 || i === 7 || i === 9) && "border-l border-borda", i >= 2 && i <= 4 && "bg-superficie-2")}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {linhas.map((l) => (
              <tr key={l.kpi} className="border-b border-borda last:border-0 hover:bg-superficie-2/60">
                <td className="sticky left-0 z-10 whitespace-nowrap bg-superficie px-3 py-2 text-[13px] font-medium">{l.kpi}</td>
                <td className={clsx(TD, "text-texto-3")} title={l.tipo === "A" ? "Quanto maior, melhor" : "Quanto menor, melhor"}>{l.tipo}</td>
                <td className={clsx(TD, "border-l border-borda text-texto-3")}>{valor(l.anterior.meta, l.kpi)}</td>
                <td className={TD}><Real v={l.anterior.real} ok={l.anterior.ok} kpi={l.kpi} /></td>
                <td className={clsx(TD, "border-l border-borda bg-superficie-2 text-texto-3")}>{valor(l.atual.meta, l.kpi)}</td>
                <td className={clsx(TD, "bg-superficie-2")}><Real v={l.atual.real} ok={l.atual.ok} kpi={l.kpi} /></td>
                <td className={clsx(TD, "bg-superficie-2")}><Tendencia l={l} /></td>
                <td className={clsx(TD, "border-l border-borda text-texto-3")}>{valor(l.ytd.meta, l.kpi)}</td>
                <td className={TD}><Real v={l.ytd.real} ok={l.ytd.ok} kpi={l.kpi} /></td>
                <td className={clsx(TD, "border-l border-borda text-texto-3")}>{valor(l.proximo.meta, l.kpi)}</td>
                <td className={clsx(TD, "text-texto-2")}>{valor(l.proximo.previsao, l.kpi)}</td>
                <td className={clsx(TD, "border-l border-borda text-texto-3")}>{valor(l.ano.meta, l.kpi)}</td>
                <td className={TD}><Real v={l.ano.estimativa} ok={l.ano.ok} kpi={l.kpi} /></td>
                <td className="w-28 border-l border-borda px-2 py-1"><Sparkline valores={l.serie} altura={26} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Vazio({ texto, erro, verDados }: { texto: string; erro?: string; verDados: boolean }) {
  return (
    <div className="rounded-cartao border border-dashed border-borda-forte p-8 text-center text-[14px] text-texto-2">
      <p>{erro ? `Não foi possível ler a base agora (${erro}).` : texto}</p>
      {verDados && <Link href="/dados" className="mt-4 inline-flex items-center gap-1.5 font-medium text-alp-azul hover:underline"><FolderOpen className="size-4" /> Ir para Fontes de dados</Link>}
    </div>
  );
}

const enviadaEm = (b: { atualizado: string | null; origem: string }) => `Base enviada ${b.atualizado ? `em ${dataHora(b.atualizado)}` : ""} · ${b.origem}.`;

export default async function IndicadoresSim(props: { searchParams: Promise<Params> }) {
  const u = await exigir("indicadores_sim");
  const params = await props.searchParams;
  const visao = ["deck", "roadmap", "causas"].includes(um(params, "visao")) ? um(params, "visao") : "geral";
  const cab = (
    <Cabecalho titulo="Indicadores SIM," destaque="Manutenção Profissional (MP)." sobre={<Pilula>Visão geral · Deck mensal · Roadmap · Modos de causa</Pilula>}
      subtitulo="A visão gerencial do SIM: os indicadores de manutenção do pilar MP contra a meta (Deck mensal) os passos de cada máquina contra o previsto (Roadmap) e os modos de causa das quebras pelo texto da IW47. Atualizados pelas planilhas anexadas em Fontes de dados." />
  );
  const abas = <AbasParam params={params} param="visao" atual={visao} abas={[{ id: "geral", rotulo: "Visão geral" }, { id: "deck", rotulo: "Deck mensal" }, { id: "roadmap", rotulo: "Roadmap" }, { id: "causas", rotulo: "Modos de causa (YM11)" }]} />;
  const verDados = podeVer(u, "dados");
  const comComentarios = async (ms: MaquinaRoadmap[]) => aplicarComentarios(ms, ms.length ? await lerCadastro(ARQ_COMENTARIOS) : {});

  if (visao === "geral") {
    const [base, rm] = await Promise.all([indicadoresSim(), roadmapSim()]);
    const linhas = base.dados ?? [], maquinas = await comComentarios(rm.dados ?? []);
    return (
      <Pagina>
        {cab}
        {abas}
        <VisaoGeral linhas={linhas} maquinas={maquinas} params={params} verSap={podeVer(u, "painel")} />
        <p className="text-[12px] text-texto-3">Indicadores do SIM: {linhas.length ? enviadaEm(base) : "planilha ainda não enviada."} Roadmap: {maquinas.length ? enviadaEm(rm) : "ainda não enviado."}</p>
      </Pagina>
    );
  }

  if (visao === "causas") {
    return (
      <Pagina>
        {cab}
        {abas}
        <ModosFalha params={params} />
      </Pagina>
    );
  }

  if (visao === "roadmap") {
    const rm = await roadmapSim();
    return (
      <Pagina>
        {cab}
        {abas}
        {rm.dados?.length ? <Roadmap maquinas={await comComentarios(rm.dados)} params={params} enviada={enviadaEm(rm)}
            edita={podeEditar(u) && veInteira(u, "indicadores_sim")} />
          : <Vazio erro={rm.erro} verDados={verDados} texto="O roadmap ainda não foi enviado: exporte a tabela do roadmap (Prev/Rel por mês) para Excel e anexe em Fontes de dados." />}
      </Pagina>
    );
  }

  const base = await indicadoresSim();
  const linhas = base.dados ?? [];
  if (!linhas.length) {
    return (
      <Pagina>
        {cab}
        {abas}
        <Vazio erro={base.erro} verDados={verDados} texto="A planilha de indicadores ainda não foi enviada: baixe a planilha de indicadores do SIM (.xlsx) e anexe em Fontes de dados (o site guarda só as linhas do pilar MP)." />
      </Pagina>
    );
  }

  const meses = mesesComReal(linhas);
  const escolhido = meses.find((m) => m === um(params, "mes")) ?? meses[0] ?? [...new Set(linhas.map((l) => l.mes))].sort().pop()!;
  const deck = montarDeck(linhas, escolhido);
  const areasSel = um(params, "area").split(",").map((x) => x.trim()).filter((x) => x && x !== "-");
  const vis = areasSel.length ? deck.filter((a) => areasSel.includes(a.area)) : deck;
  const todas = vis.flatMap((a) => a.linhas);
  const conta = (f: (l: LinhaDeck) => boolean | null) => {
    const c = todas.map(f).filter((x) => x != null);
    return { na: c.filter(Boolean).length, de: c.length };
  };
  const mesOk = conta((l) => l.atual.ok), ytdOk = conta((l) => l.ytd.ok), anoOk = conta((l) => l.ano.ok);
  const melhoraram = todas.filter((l) => l.atual.melhorou === true).length, pioraram = todas.filter((l) => l.atual.melhorou === false).length;
  const pct = (x: { na: number; de: number }) => (x.de ? `${Math.round((x.na / x.de) * 100)}%` : "—");
  const tom = (x: { na: number; de: number }) => (!x.de ? undefined : x.na / x.de >= 0.8 ? "bom" : x.na / x.de >= 0.5 ? "atencao" : "critico");

  return (
    <Pagina>
      {cab}
      {abas}
      <div className="space-y-3">
        <AbasParam params={params} param="mes" atual={escolhido} abas={[...meses.slice(0, 12)].reverse().map((m) => ({ id: m, rotulo: rotuloMes(m) }))} />
        <FiltrosUrl campos={[{ tipo: "pilulas", param: "area", rotulo: "Área", opcoes: deck.map((a) => a.area) }]} />
        <p className="text-[12.5px] text-texto-3">
          {enviadaEm(base)} Mês mostrado: <b className="text-texto-2">{rotuloMes(escolhido)}</b>
          {" "}(o último com real lançado, se nenhum for escolhido).
        </p>
      </div>
      <GradeNumeros colunas={4}>
        <Numero rotulo={`Na meta em ${rotuloMes(escolhido)}`} valor={pct(mesOk)} detalhe={`${mesOk.na} de ${mesOk.de} indicador(es) com meta e real`} tom={tom(mesOk)} />
        <Numero rotulo="Na meta no acumulado (YTD)" valor={pct(ytdOk)} detalhe={`${ytdOk.na} de ${ytdOk.de}`} tom={tom(ytdOk)} />
        <Numero rotulo="Estimativa do ano na meta" valor={pct(anoOk)} detalhe={`${anoOk.na} de ${anoOk.de}`} tom={tom(anoOk)} />
        <Numero rotulo="Contra o mês anterior" valor={`${melhoraram} ↑ · ${pioraram} ↓`} detalhe="indicadores que melhoraram · pioraram (pelo tipo A/B)" />
      </GradeNumeros>
      <div className="space-y-5">
        {vis.map((a) => <TabelaArea key={a.area} area={a.area} linhas={a.linhas} mes={escolhido} />)}
      </div>
      <p className="text-[12px] text-texto-3">
        Tipo A: quanto maior, melhor (real ≥ meta). Tipo B: quanto menor, melhor (real ≤ meta). Seta: o real do mês contra o do mês anterior —
        verde quando melhorou, vermelha quando piorou. Indisponibilidade e Plano de Manutenção em %; MTTR e MTBF em horas.
      </p>
    </Pagina>
  );
}
