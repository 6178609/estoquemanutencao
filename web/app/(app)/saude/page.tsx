import { ArrowRight, HelpCircle, ListOrdered } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { Barras, Colunas, Grafico, Legenda } from "@/components/graficos";
import { Aviso, PaginaWcm, Secao, SemDados } from "@/components/PaginaWcm";
import { Cabecalho } from "@/components/ui";
import { veInteira } from "@/lib/auth/acesso";
import { exigir } from "@/lib/auth/sessao";
import { brl } from "@/lib/formato";
import { barra, contexto, dados } from "@/lib/wcm/contexto";
import * as saude from "@/lib/wcm/saude";
import { dataBr } from "@/lib/wcm/util";

import { BarraSaude, Cartao, GradeNumeros, inteiroBr, Numero, Paginacao, SeloFaixa, TabelaT } from "../equipamentos/_ui/Blocos";
import { FiltrosUrl } from "../equipamentos/_ui/FiltrosUrl";
import { hrefCom, type Params } from "../equipamentos/_ui/url";
import { paginar, param, V_ANALISE } from "../equipamentos/logica";
import { saudeAtivos } from "./calculo";
import { filtrarFila, histograma, lerFiltroFila } from "./fila";

export const metadata: Metadata = { title: "Saúde dos ativos" };
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const COR_FAIXA = { [saude.CRITICA]: "st-critico", [saude.ATENCAO]: "st-atencao", [saude.BOA]: "st-bom" } as const;
const n1 = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 });
const pct = (v: number | null) => (v == null ? "—" : `${Math.round(v)}%`);

export default async function Saude(props: { searchParams: Promise<Params> }) {
  const u = await exigir("saude");
  const params = await props.searchParams;
  const c = await contexto(params);
  const titulo = <Cabecalho titulo="Saúde dos ativos," destaque="a fila de ataque pelo risco."
    sobre="Confiabilidade"
    subtitulo="Índice de 0 a 100 por equipamento a partir das quebras, falhas analisadas, corretivas, backlog, preventivas, preditiva e custo — e a fila de ataque pelo risco (saúde × criticidade)." />;
  if (!c.b.ordens.dados) return <PaginaWcm barra={barra(c)} periodo={false}>{titulo}<SemDados base="IW38 (ordens)" /></PaginaWcm>;

  const t = await saudeAtivos(c);
  const r = saude.resumo(t);
  const recorte = [c.f.areas.length ? `área ${c.f.areas.join(", ")}` : "", c.centros.length ? `centro ${c.centros.join(", ")}` : "",
    c.f.tipos.length ? `tipo ${c.f.tipos.join(", ")}` : ""].filter(Boolean).join(" · ") || "fábrica inteira";

  return (
    <PaginaWcm barra={barra(c)} periodo={false}>
      {titulo}
      <p className="-mt-6 text-[13px] text-texto-3">
        Recorte: <b className="font-medium text-texto-2">{recorte}</b> · eventos dos últimos 12 meses até hoje e pendências de hoje (o período dos filtros não se aplica aqui).
      </p>

      <ComoCalcula />

      {!t.length ? <Aviso tom="azul">Nenhum equipamento com ordens no recorte.</Aviso> : (
        <>
          <GradeNumeros colunas={5}>
            <Numero rotulo="Equipamentos" valor={inteiroBr(r.ativos)} dica="Equipamentos com ordem, quebra ou chamada de plano no recorte (desativados no IH08 ficam fora)." />
            <Numero rotulo="Saúde média" valor={r.media == null ? "—" : String(Math.round(r.media))} detalhe="de 0 a 100"
              tom={r.media == null ? undefined : r.media >= saude.LIMITES.Boa ? "bom" : r.media >= saude.LIMITES["Atenção"] ? "atencao" : "critico"}
              dica="Média simples do índice de saúde dos equipamentos do recorte." />
            <Numero rotulo="Saúde crítica" valor={inteiroBr(r.criticos)} detalhe={`${inteiroBr(r.criticosAlta)} de criticidade Alta`} tom={r.criticos ? "critico" : "bom"}
              dica={`Saúde abaixo de ${saude.LIMITES["Atenção"]}.`} />
            <Numero rotulo="Em atenção" valor={inteiroBr(r.atencao)} tom={r.atencao ? "atencao" : undefined}
              dica={`Saúde de ${saude.LIMITES["Atenção"]} a ${saude.LIMITES.Boa - 1}.`} />
            <Numero rotulo="Em boa saúde" valor={pct(r.boaPct)} tom="bom" dica={`% dos equipamentos com saúde ≥ ${saude.LIMITES.Boa}.`} />
          </GradeNumeros>

          <div className="grid gap-4 lg:grid-cols-[1.25fr_1fr]">
            <Matriz t={t} params={params} />
            <Derruba t={t} />
          </div>
          <Distribuicao t={t} />

          <Suspense>
            <Fila t={t} params={params} c={c} fichaLiberada={veInteira(u, "equipamentos")} />
          </Suspense>
        </>
      )}
    </PaginaWcm>
  );
}

function ComoCalcula() {
  return (
    <details className="group rounded-cartao border border-borda bg-superficie-2 px-5 py-3.5 text-[13.5px]">
      <summary className="flex cursor-pointer list-none items-center gap-2 font-medium text-texto-2 hover:text-texto">
        <HelpCircle className="size-4" strokeWidth={1.75} /> Como o índice é calculado
      </summary>
      <div className="mt-3 space-y-3 text-texto-2">
        <p>Cada contribuinte tira pontos da saúde do equipamento, até o seu peso; a soma dos pesos é 100.
          <b> Boa</b> ≥ {saude.LIMITES.Boa} · <b>Atenção</b> {saude.LIMITES["Atenção"]}–{saude.LIMITES.Boa - 1} · <b>Crítica</b> &lt; {saude.LIMITES["Atenção"]}.
          <b> Risco</b> = pontos perdidos × peso da criticidade (Alta 3, Média 2, Baixa 1, sem classe 1,5): a fila de ataque começa pelo
          equipamento crítico com a pior saúde.</p>
        <div className="overflow-x-auto rounded-lg border border-borda bg-superficie">
          <table className="w-full min-w-[520px] text-left text-[12.5px]">
            <thead className="bg-superficie-2 text-texto-3"><tr><th className="px-3 py-1.5 font-medium">Contribuinte</th><th className="px-3 py-1.5 text-right font-medium">Peso</th><th className="px-3 py-1.5 font-medium">Regra</th></tr></thead>
            <tbody className="divide-y divide-borda">
              {saude.CONTRIBUINTES.map((x) => (
                <tr key={x.id}><td className="px-3 py-1.5 font-medium">{x.nome}</td><td className="num px-3 py-1.5 text-right">{x.peso} pts</td><td className="px-3 py-1.5">{x.regra}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-[12.5px] text-texto-3">Criticidade: a do cadastro de equipamentos do site; sem ela, o código ABC do IH08 (A = Alta, B = Média, C = Baixa).
          Equipamentos desativados no IH08 ficam de fora.</p>
      </div>
    </details>
  );
}

/** Matriz criticidade × faixa: a cor é a da faixa (status) e a intensidade cresce com a quantidade; cada célula filtra a fila. */
function Matriz({ t, params }: { t: saude.LinhaSaude[]; params: Params }) {
  const m = saude.matriz(t);
  const max = Math.max(1, ...m.map((x) => x.equipamentos));
  const cel = (crit: string, f: saude.Faixa) => m.find((x) => x.criticidade === crit && x.faixa === f)?.equipamentos ?? 0;
  return (
    <Grafico titulo="Matriz criticidade × saúde" subtitulo="O canto Alta × Crítica é a prioridade · clique numa célula para filtrar a fila"
      dica="Quantidade de equipamentos em cada combinação de criticidade e faixa de saúde."
      tabela={{ colunas: ["Criticidade", ...saude.FAIXAS], linhas: saude.CRITICIDADES.map((cr) => [cr, ...saude.FAIXAS.map((f) => cel(cr, f))]) }}>
      <div className="grid grid-cols-[84px_repeat(3,minmax(0,1fr))] gap-1.5 sm:grid-cols-[110px_repeat(3,minmax(0,1fr))]">
        <span />
        {saude.FAIXAS.map((f) => <div key={f} className="pb-1 text-center"><SeloFaixa faixa={f} /></div>)}
        {saude.CRITICIDADES.map((cr) => (
          <Linha key={cr} cr={cr}>
            {saude.FAIXAS.map((f) => {
              const n = cel(cr, f);
              const forca = n ? Math.round(14 + (n / max) * 56) : 0;
              const prioridade = cr === "Alta" && f === saude.CRITICA;
              return (
                <Link key={f} scroll={false} href={hrefCom(params, { sfaixa: f, scrit: cr, sq: null, scausa: null, pag: null, eq: null }, "fila")}
                  title={`${cr} × ${f}: ${n} equipamento(s)`}
                  className={`grid h-16 place-items-center rounded-lg border transition hover:border-borda-forte ${prioridade ? "border-[var(--st-critico)]" : "border-transparent"}`}
                  style={{ background: n ? `color-mix(in srgb, var(--${COR_FAIXA[f]}) ${forca}%, var(--superficie))` : "var(--superficie-2)" }}>
                  <span className={`num font-display text-[22px] font-medium ${n ? "text-texto" : "text-texto-4"}`}>{n}</span>
                </Link>
              );
            })}
          </Linha>
        ))}
      </div>
    </Grafico>
  );
}

function Linha({ cr, children }: { cr: string; children: React.ReactNode }) {
  return (
    <>
      <div className="flex items-center text-[12.5px] font-medium text-texto-2">{cr}</div>
      {children}
    </>
  );
}

function Derruba({ t }: { t: saude.LinhaSaude[] }) {
  const pts = saude.pontosForaDaFaixaBoa(t).sort((a, b) => b.pontos - a.pontos);
  return (
    <Grafico titulo="O que mais derruba a saúde" subtitulo="Pontos perdidos nos equipamentos em atenção ou críticos"
      dica="Soma dos pontos que cada contribuinte tirou dos equipamentos fora da faixa Boa."
      tabela={{ colunas: ["Contribuinte", "Pontos perdidos"], linhas: pts.map((p) => [p.contribuinte, n1.format(p.pontos)]) }}>
      {pts.length ? <Barras itens={pts.map((p) => ({ rotulo: p.contribuinte, valor: p.pontos, detalhe: "pontos perdidos" }))} larguraRotulo={200} formato="inteiro" />
        : <p className="text-[13px] text-texto-3">Todos os equipamentos do recorte estão em boa saúde.</p>}
    </Grafico>
  );
}

function Distribuicao({ t }: { t: saude.LinhaSaude[] }) {
  const h = histograma(t);
  const series = saude.FAIXAS.map((f) => ({ nome: f, valores: h.porFaixa[f], cor: COR_FAIXA[f] }));
  return (
    <Grafico titulo="Distribuição do índice de saúde" subtitulo="Equipamentos por faixa de 10 pontos · a cor é a faixa de saúde"
      legenda={<Legenda series={series} />}
      tabela={{ colunas: ["Saúde", ...saude.FAIXAS, "Total"], linhas: h.rotulos.map((r, i) => [r, ...saude.FAIXAS.map((f) => h.porFaixa[f][i]), saude.FAIXAS.reduce((s, f) => s + h.porFaixa[f][i], 0)]) }}>
      <Colunas rotulos={h.rotulos} series={series} empilhar formato="inteiro" altura={190} rotular="todos" />
    </Grafico>
  );
}

const COLS_FILA = [
  { rotulo: "Código" }, { rotulo: "Equipamento", larga: true }, { rotulo: "Criticidade" }, { rotulo: "Saúde", dica: "Índice 0–100" },
  { rotulo: "Faixa" }, { rotulo: "Risco", dir: true, dica: "(100 − saúde) × peso da criticidade" }, { rotulo: "Principal causa" },
  { rotulo: "Quebras", dir: true }, { rotulo: "Falhas AF", dir: true }, { rotulo: "Corretivas", dir: true }, { rotulo: "Backlog atrasado", dir: true },
  { rotulo: "Preventivas atrasadas", dir: true }, { rotulo: "Anomalias abertas", dir: true }, { rotulo: "Custo 12 meses", dir: true },
  { rotulo: "Última falha" }, { rotulo: "Área" }, { rotulo: "Centro" },
];

async function Fila({ t, params, c, fichaLiberada }: { t: saude.LinhaSaude[]; params: Params; c: Awaited<ReturnType<typeof contexto>>; fichaLiberada: boolean }) {
  const f = lerFiltroFila(params);
  const vis = filtrarFila(t, f);
  const pg = paginar(vis, Number(param(params, "pag")) || 1);
  const sel = param(params, "eq");
  const linha = sel ? t.find((l) => l.codigo === sel) : undefined;
  const causas = [...new Set(t.map((l) => l.principalCausa))].sort();
  const csvHref = `/api/saude${hrefCom(params, { pag: null, eq: null })}`;
  return (
    <Secao titulo="Fila de ataque" destaque="maior risco primeiro"
      sub="Selecione um equipamento (código) para ver o que derruba a saúde dele. Comece pelos críticos de criticidade Alta — análise de falha, revisão do plano de manutenção e ataque ao backlog atrasado.">
      <div id="fila" className="scroll-mt-24 space-y-3">
        <FiltrosUrl zerar={["eq"]} campos={[
          { tipo: "busca", param: "sq", placeholder: "Buscar código, nome, área ou centro…" },
          { tipo: "multi", param: "scrit", rotulo: "Criticidade", opcoes: saude.CRITICIDADES.map((x) => ({ valor: x, n: t.filter((l) => (l.criticidade || saude.SEM_CLASSE) === x).length })) },
          { tipo: "multi", param: "scausa", rotulo: "Principal causa", opcoes: causas.map((x) => ({ valor: x, n: t.filter((l) => l.principalCausa === x).length })) },
          { tipo: "pilulas", param: "sfaixa", rotulo: "Faixa de saúde", opcoes: saude.FAIXAS, padrao: [saude.CRITICA, saude.ATENCAO] },
        ]} />
        {linha && <Detalhe l={linha} c={c} params={params} fichaLiberada={fichaLiberada} />}
        <TabelaT colunas={COLS_FILA} vazio="Nenhum equipamento com estes filtros."
          linhas={pg.itens.map((l) => ({
            chave: l.codigo, ativa: l.codigo === sel, href: hrefCom(params, { eq: l.codigo === sel ? null : l.codigo }, "fila"),
            celulas: [l.codigo, l.equipamento || "—", l.criticidade || <span className="text-texto-3">sem classe</span>, <BarraSaude key="s" valor={l.saude} faixa={l.faixa} />,
              <SeloFaixa key="f" faixa={l.faixa} />, inteiroBr(l.risco), l.principalCausa, l.quebras, l.falhasAf, l.corretivas, l.backlogAtrasado,
              l.preventivasAtrasadas, l.anomaliasAbertas, brl(l.custo12Meses), dataBr(l.ultimaFalha), l.area || "—", l.centro || "—"],
          }))} />
        <Paginacao params={params} {...pg} mostrados={pg.itens.length} rotulo="equipamento(s)" baixar={csvHref} />
      </div>
    </Secao>
  );
}

async function Detalhe({ l, c, params, fichaLiberada }: { l: saude.LinhaSaude; c: Awaited<ReturnType<typeof contexto>>; params: Params; fichaLiberada: boolean }) {
  const contrib = saude.contribuicao(l);
  const d = await dados(c, { areas: c.f.areas, centros: c.centros, tipos: c.f.tipos });
  const pend = d.ordens.filter((o) => o.equipChave === l.codigo && o.atrasada && o.situacao !== "Cancelada").sort((a, b) => (a.fim ?? 0) - (b.fim ?? 0));
  return (
    <Cartao className="border-borda-forte"
      titulo={<span>{l.codigo} · {l.equipamento || "—"}</span>}
      sub={<span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1">saúde <b className="num text-texto">{l.saude}</b> <SeloFaixa faixa={l.faixa} /> · criticidade {l.criticidade || "sem classe"} · risco <b className="num text-texto">{l.risco}</b></span>}
      acoes={<div className="flex flex-wrap gap-2">
        {fichaLiberada && <Link href={`/equipamentos?${new URLSearchParams({ visao: V_ANALISE, eq: l.codigo }).toString()}#ficha`}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-borda px-3 text-[13px] transition hover:bg-superficie-2">Abrir ficha do equipamento <ArrowRight className="size-3.5" /></Link>}
        <Link scroll={false} href={hrefCom(params, { eq: null }, "fila")} className="inline-flex h-9 items-center rounded-lg px-3 text-[13px] text-texto-3 hover:text-texto">Fechar</Link>
      </div>}>
      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <div>
          <div className="mb-2 text-[12.5px] text-texto-3">Pontos que cada contribuinte tirou da saúde (o máximo de cada um é o peso; a escala vai até 20)</div>
          <Barras itens={contrib.map((p) => ({ rotulo: `${p.contribuinte} (${p.peso})`, valor: p.pontosPerdidos, detalhe: `de ${p.peso} pontos`, cor: p.pontosPerdidos > 0 ? "st-critico" : "neutro" }))}
            max={20} larguraRotulo={220} formato="padrao" />
        </div>
        <ul className="space-y-2 text-[13.5px] text-texto-2">
          <li><b className="num text-texto">{l.quebras}</b> quebra(s) e <b className="num text-texto">{l.falhasAf}</b> falha(s) registradas no Gerenciador de AF ({n1.format(l.horasParadasAf)} h paradas)</li>
          <li><b className="num text-texto">{l.corretivas}</b> ordem(ns) sem plano em 12 meses</li>
          <li><b className="num text-texto">{l.backlogAtrasado}</b> ordem(ns) atrasada(s) e <b className="num text-texto">{l.preventivasAtrasadas}</b> preventiva(s) atrasada(s) hoje</li>
          <li><b className="num text-texto">{l.anomaliasAbertas}</b> anomalia(s) preditiva(s) em aberto</li>
          <li>Custo de manutenção em 12 meses: <b className="num text-texto">{brl(l.custo12Meses)}</b></li>
          {l.ultimaFalha != null && <li>Última falha: <b className="num text-texto">{dataBr(l.ultimaFalha)}</b></li>}
        </ul>
      </div>
      {pend.length > 0 && (
        <div className="mt-5 space-y-2">
          <div className="flex items-center gap-1.5 text-[13.5px] font-medium"><ListOrdered className="size-4" strokeWidth={1.75} /> Ordens atrasadas do equipamento</div>
          <TabelaT colunas={[{ rotulo: "Ordem" }, { rotulo: "Tipo" }, { rotulo: "Natureza" }, { rotulo: "Texto", larga: true }, { rotulo: "Situação" },
            { rotulo: "Início" }, { rotulo: "Prazo (fim-base)" }, { rotulo: "Centro de trabalho" }]}
            linhas={pend.slice(0, 100).map((o) => ({ chave: o.ordem, celulas: [o.ordem, o.tipo, o.natureza, o.texto, o.situacao, dataBr(o.inicio), dataBr(o.fim), o.centroTrabalho] }))} />
        </div>
      )}
    </Cartao>
  );
}
