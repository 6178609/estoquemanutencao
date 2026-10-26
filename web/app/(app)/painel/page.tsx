import { ArrowRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { Barras, Colunas, Dispersao, Grafico, Linhas, Partes, Tabela, Velocimetro, type Cor } from "@/components/graficos";
import { COR_FAROL, GradeKpis, Scorecard, SeloFarol } from "@/components/Indicador";
import { AbasVisao, Aviso, PaginaWcm, Secao, SemDados } from "@/components/PaginaWcm";
import { Cabecalho } from "@/components/ui";
import { exigir } from "@/lib/auth/sessao";
import { brl } from "@/lib/formato";
import { campoDoEquipamento } from "@/lib/wcm/campoGeral";
import { barra, contexto, dados, porDimensao, resultados, serieMensal } from "@/lib/wcm/contexto";
import { descrever } from "@/lib/wcm/filtros";
import * as ind from "@/lib/wcm/indicadores";
import * as m52 from "@/lib/wcm/mapa52";
import * as planos from "@/lib/wcm/planos";
import { dataBr, inicioDoMes } from "@/lib/wcm/util";

import { GRUPOS_CLASSE, grupoDaClasse, mesesEntre } from "../confiabilidade/_comum/agregar";
import { custoPor, ordensDoPeriodo, porEquipamento, porMes } from "../custos/calculo";

export const metadata: Metadata = { title: "Painel WCM" };
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Faixa do topo (custo, desempenho e confiabilidade) e os quatro cartões de planejamento, no modelo de dashboard de PCM. */
const FAIXA = ["custo_total", "custo_hora", "pct_corretiva", "disponibilidade", "mtbf", "mttr"];
const CARTOES = ["backlog_sem", "aderencia", "cumprimento_prev", "pct_emergencial"];
const DESTAQUES = ["pct_plano", "no_prazo", "quebras", "reincidencia", "af_execucao", "hh", "utilizacao", "notas_7d"];
const TENDENCIA: { id: string; barras: boolean; cor: Cor }[] = [
  { id: "quebras", barras: true, cor: "serie-2" }, { id: "mttr", barras: false, cor: "serie-2" },
  { id: "pct_plano", barras: false, cor: "serie-1" }, { id: "custo", barras: true, cor: "serie-1" },
];
const CHAVE_SCORE = ["quebras", "mtbf", "mttr", "reincidencia", "pct_plano", "pct_emergencial", "no_prazo", "idade_backlog", "hh",
  "pct_hh_plano", "custo", "pct_custo_corr"];
const VISOES = ["Todos os indicadores", "Scorecard por área", "Scorecard por setor", "Scorecard por centro", "Evolução mensal", "Pontos de atenção"];

export default async function Painel(props: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await exigir("painel");
  const params = await props.searchParams;
  const c = await contexto(params);
  if (!c.b.ordens.dados) return <PaginaWcm barra={barra(c)}><Cabecalho titulo="Painel WCM" /><SemDados base="IW38 (ordens)" /></PaginaWcm>;
  const [[atual, anterior], serie] = await Promise.all([resultados(c), serieMensal(c)]);
  const metas = c.cad.metas;
  const [aIni, aFim] = ind.periodoAnterior(c.f.ini, c.f.fim);
  const cores = Object.fromEntries(ind.KPIS.map((k) => [k.id, ind.farol(k, atual[k.id], ind.meta(k, metas))]));
  const rotMes = serie.map((s) => ind.mesTxt(s.mes) + (s.mes === serie[serie.length - 1]?.mes && c.f.fim >= c.b.hoje ? "*" : ""));
  const visao = VISOES.includes(String(params.visao)) ? String(params.visao) : VISOES[0];

  // saúde por grupo e pontos de atenção
  const porGrupo = ind.GRUPOS.map((g) => {
    const ks = ind.KPIS.filter((k) => k.grupo === g);
    const n = (f: ind.Farol) => ks.filter((k) => cores[k.id] === f).length;
    return { rotulo: g, valor: ks.length, partes: (["verde", "amarelo", "vermelho", "neutro"] as ind.Farol[]).map((f) => ({ nome: ind.NOME_FAROL[f], valor: n(f), cor: COR_FAROL[f] })) };
  });
  const dist = (k: ind.Kpi) => Math.abs((atual[k.id] ?? 0) - (ind.meta(k, metas) ?? 0)) / Math.max(Math.abs(ind.meta(k, metas) ?? 1), 1e-9);
  const piores = [...ind.KPIS.filter((k) => cores[k.id] === "vermelho").sort((a, b) => dist(b) - dist(a)), ...ind.KPIS.filter((k) => cores[k.id] === "amarelo")];

  return (
    <PaginaWcm barra={barra(c)}>
      <Cabecalho titulo="Painel WCM," destaque="o pilar Manutenção Profissional num olhar."
        sobre="Visão geral" subtitulo={`Variações contra ${descrever(aIni, aFim)} (período anterior de mesma duração). Passe o mouse no nome de cada indicador para ver a fórmula.`} />

      {atual.cobertura_hh != null && atual.cobertura_hh < 90 && (
        <Aviso>Só <b>{Math.round(atual.cobertura_hh)}%</b> das horas apontadas (IW47) são de ordens que estão no IW38 carregado — as corretivas
          (YM11/YM12) provavelmente não vieram no export. <b>Manutenção planejada</b> e <b>HH em manutenção planejada</b> ficam otimistas: exporte o IW38 com todos os tipos de ordem.</Aviso>
      )}

      <Secao titulo="Gestão de PCM" destaque="custo, desempenho e confiabilidade">
        <GradeKpis kpis={FAIXA.map((id) => ind.POR_ID[id])} atual={atual} anterior={anterior} metas={metas} serie={serie} colunas={6} link={false} />
        <GradeKpis kpis={CARTOES.map((id) => ind.POR_ID[id])} atual={atual} anterior={anterior} metas={metas} serie={serie} />
      </Secao>

      <PainelPcm c={c} serie={serie} rotMes={rotMes} />

      <Secao titulo="Destaques" destaque="que a gerência acompanha toda semana">
        <GradeKpis kpis={DESTAQUES.map((id) => ind.POR_ID[id])} atual={atual} anterior={anterior} metas={metas} serie={serie} />
      </Secao>

      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <Grafico titulo="Saúde por grupo do pilar" subtitulo="Indicadores na meta, em atenção e fora — por grupo"
          legenda={<div className="flex flex-wrap gap-3">{(["verde", "amarelo", "vermelho", "neutro"] as ind.Farol[]).map((f) => <SeloFarol key={f} farol={f} />)}</div>}
          tabela={{ colunas: ["Grupo", "Na meta", "Atenção", "Fora", "Sem meta"], linhas: porGrupo.map((g) => [g.rotulo, ...g.partes.map((p) => p.valor)]) }}>
          <Barras itens={porGrupo} larguraRotulo={190} formato="ind" />
        </Grafico>
        <div className="rounded-cartao border border-borda bg-superficie p-5">
          <div className="font-display text-[15px] font-medium">Pontos de atenção</div>
          <div className="mt-0.5 text-[12.5px] text-texto-3">Fora da meta, do pior para o melhor</div>
          <ul className="mt-4 space-y-2.5">
            {!piores.length && <li className="text-[13.5px] text-texto-2">Todos os indicadores com meta estão dentro dela no recorte.</li>}
            {piores.slice(0, 7).map((k) => (
              <li key={k.id} className="flex items-center gap-3 text-[13.5px]">
                <SeloFarol farol={cores[k.id] as ind.Farol} compacto />
                <span className="min-w-0 flex-1"><b className="font-medium">{k.nome}</b> <span className="num">{ind.formatar(k, atual[k.id])}</span>
                  <span className="text-texto-3"> · meta {k.sentido > 0 ? "≥" : "≤"} {ind.formatar(k, ind.meta(k, metas))}</span></span>
                <Link prefetch={false} href={k.pagina} className="text-texto-3 hover:text-texto" aria-label={`Ver ${k.nome}`}><ArrowRight className="size-4" /></Link>
              </li>
            ))}
          </ul>
          {piores.length > 7 && <p className="mt-3 text-[12px] text-texto-3">+{piores.length - 7} indicador(es) — veja em Pontos de atenção, abaixo.</p>}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {TENDENCIA.map(({ id, barras, cor }) => {
          const k = ind.POR_ID[id];
          const vals = serie.map((s) => s.valores[id] ?? null);
          const alvo = ind.meta(k, metas);
          return (
            <Grafico key={id} titulo={k.nome} subtitulo="12 meses · * mês em andamento" dica={k.formula}
              tabela={{ colunas: ["Mês", k.nome], linhas: serie.map((s, i) => [rotMes[i], ind.formatar(k, vals[i])]) }}>
              {barras ? <Colunas rotulos={rotMes} series={[{ nome: k.nome, valores: vals, cor }]} meta={alvo} altura={170} formato={k.unidade === "R$" ? "R$" : k.unidade === "h" ? "h" : "inteiro"} />
                : <Linhas rotulos={rotMes} series={[{ nome: k.nome, valores: vals, cor }]} meta={alvo} altura={170} area formato={k.unidade} />}
            </Grafico>
          );
        })}
      </div>

      {atual.semeq_detectadas != null && (
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-cartao border border-borda bg-superficie-2 px-5 py-4 text-[13.5px]">
          <b className="font-display font-medium">Preditiva (SEMEQ)</b>
          <span>{atual.semeq_detectadas} anomalias no período</span>
          <span>{ind.formatar(ind.POR_ID.semeq_tratadas, atual.semeq_tratadas)} tratadas</span>
          <span>{ind.formatar(ind.POR_ID.semeq_com_ordem, atual.semeq_com_ordem)} com ordem</span>
          <span className="inline-flex items-center gap-1"><SeloFarol farol={(atual.semeq_atrasadas ?? 0) > 0 ? "vermelho" : "verde"} compacto />{atual.semeq_atrasadas ?? 0} atrasadas hoje</span>
          <Link prefetch={false} href="/preditiva" className="ml-auto inline-flex items-center gap-1 text-texto-3 hover:text-texto">Abrir preditiva <ArrowRight className="size-3.5" /></Link>
        </div>
      )}

      <Secao titulo="Mais detalhes">
        <AbasVisao visoes={VISOES} atual={visao} params={params} />
        <Detalhe visao={visao} c={c} atual={atual} anterior={anterior} serie={serie} rotMes={rotMes} />
      </Secao>
    </PaginaWcm>
  );
}

async function Detalhe({ visao, c, atual, anterior, serie, rotMes }: {
  visao: string; c: Awaited<ReturnType<typeof contexto>>; atual: ind.Resultado; anterior: ind.Resultado;
  serie: { mes: number; valores: ind.Resultado }[]; rotMes: string[];
}) {
  const metas = c.cad.metas;
  if (visao === "Todos os indicadores") {
    return (
      <div className="space-y-8">
        {ind.GRUPOS.map((g) => (
          <div key={g} className="space-y-3">
            <div className="font-display text-[16px] font-medium">{g}</div>
            {g === ind.ANALISE_FALHA && <p className="text-[12.5px] text-texto-3">Do Gerenciador de AF, com a fábrica inteira: só o período vale (as áreas do gerenciador não são as do SAP).</p>}
            <GradeKpis kpis={ind.KPIS.filter((k) => k.grupo === g)} atual={atual} anterior={anterior} metas={metas} serie={serie} />
          </div>
        ))}
      </div>
    );
  }
  if (visao.startsWith("Scorecard")) {
    const campo = visao.endsWith("área") ? "areas" : visao.endsWith("setor") ? "setores" : "centros";
    const col = campo === "areas" ? "localizacao" : campo === "setores" ? "setor" : "centroTrabalho";
    const per = (await dados(c)).ordens.filter((o) => o.data != null && o.data >= c.f.ini && o.data <= c.f.fim);
    const cont = new Map<string, number>();
    for (const o of per) if (o[col]) cont.set(o[col], (cont.get(o[col]) ?? 0) + 1);
    const topo = [...cont.entries()].sort((a, b) => b[1] - a[1]).slice(0, campo === "areas" ? 10 : 14).map(([v]) => v);
    if (!topo.length) return <p className="text-[14px] text-texto-3">Sem ordens no recorte para montar o scorecard.</p>;
    const valores = await porDimensao(c, campo, topo);
    const ks = CHAVE_SCORE.map((id) => ind.POR_ID[id]);
    const kRank = ind.POR_ID.pct_plano;
    return (
      <div className="space-y-4">
        <p className="text-[12.5px] text-texto-3">{topo.length} com mais ordens no período · ícone = farol contra a meta (até 10% da meta = atenção). Suprimentos e análise de falhas não têm área.</p>
        <Scorecard rotulo={campo === "areas" ? "Área" : campo === "setores" ? "Setor" : "Centro de trabalho"} valores={{ ...valores, "TOTAL DO RECORTE": atual }} kpis={ks} metas={metas} />
        <Grafico titulo={`Ranking · ${kRank.nome}`} subtitulo="Linha verde = meta">
          <Barras itens={topo.map((v) => ({ rotulo: v, valor: valores[v][kRank.id] ?? 0, cor: COR_FAROL[ind.farol(kRank, valores[v][kRank.id], ind.meta(kRank, metas))] === "neutro" ? "serie-1" : COR_FAROL[ind.farol(kRank, valores[v][kRank.id], ind.meta(kRank, metas))] }))
            .sort((a, b) => b.valor - a.valor)} formato="%" meta={ind.meta(kRank, metas)} max={100} />
        </Grafico>
      </div>
    );
  }
  if (visao === "Evolução mensal") {
    const ks = ind.KPIS.filter((k) => k.mensal);
    return (
      <div className="grid gap-4 lg:grid-cols-2">
        {ks.map((k) => {
          const vals = serie.map((s) => s.valores[k.id] ?? null);
          if (!vals.some((v) => v != null)) return null;
          const cor: Cor = k.sentido < 0 ? "serie-2" : "serie-1";
          return (
            <Grafico key={k.id} titulo={k.nome} subtitulo={`${k.grupo} · linha verde = meta`} dica={k.formula}
              tabela={{ colunas: ["Mês", k.nome], linhas: serie.map((s, i) => [rotMes[i], ind.formatar(k, vals[i])]) }}>
              {["un", "h", "R$"].includes(k.unidade)
                ? <Colunas rotulos={rotMes} series={[{ nome: k.nome, valores: vals, cor }]} meta={ind.meta(k, metas)} formato={k.unidade === "R$" ? "R$" : k.unidade === "h" ? "h" : "inteiro"} />
                : <Linhas rotulos={rotMes} series={[{ nome: k.nome, valores: vals, cor }]} meta={ind.meta(k, metas)} formato={k.unidade} />}
            </Grafico>
          );
        })}
      </div>
    );
  }
  // Pontos de atenção
  const d = await dados(c);
  const campoEq = await campoDoEquipamento(c);
  const q = ind.quebras(d).filter((x) => x.data! >= c.f.ini && x.data! <= c.f.fim && x.equipChave);
  const porEq = new Map<string, { nome: string; quebras: number; reinc: number }>();
  for (const x of q) { const e = porEq.get(x.equipChave) ?? { nome: x.objeto || x.equipChave, quebras: 0, reinc: 0 }; e.quebras++; if (x.reincidente) e.reinc++; porEq.set(x.equipChave, e); }
  const bad = [...porEq.entries()].sort((a, b) => b[1].quebras - a[1].quebras).slice(0, 10);
  const bk = ind.backlog(d).sort((a, b) => b.idade - a.idade).slice(0, 10);
  const pc = ind.pecasCriticasEmFalta(d);
  const pend = (c.b.requisicoes.dados ?? []).filter((r) => r.pendente).sort((a, b) => (b.diasAguardando ?? 0) - (a.diasAguardando ?? 0));
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Grafico titulo="Equipamentos com mais quebras" subtitulo="Bad actors do período · laranja = reincidentes (≤ 30 dias)"
        legenda={<span className="text-[12px] text-texto-3" />}
        tabela={{ colunas: ["Campo de ordenação", "Equipamento", "Quebras", "Reincidentes"],
          linhas: bad.map(([k, v]) => [campoEq(k) || "—", `${v.nome} (${k})`, v.quebras, v.reinc]) }}>
        {bad.length ? <Barras itens={bad.map(([k, v]) => ({ rotulo: v.nome, valor: v.quebras, detalhe: `${campoEq(k) ? `${campoEq(k)} · ` : ""}${k}`,
          partes: [{ nome: "Primeira", valor: v.quebras - v.reinc, cor: "serie-1" }, { nome: "Reincidente", valor: v.reinc, cor: "serie-2" }] }))} larguraRotulo={200} />
          : <p className="text-[13px] text-texto-3">Nenhuma quebra no período.</p>}
      </Grafico>
      <Grafico titulo="Ordens mais antigas no backlog" subtitulo="Em aberto, pela data-base de início">
        {bk.length ? <Tabela colunas={["Ordem", "Tipo", "Texto", "Centro", "Dias"]} linhas={bk.map((o) => [o.ordem, o.tipo, o.texto, o.centroTrabalho, o.idade])} />
          : <p className="text-[13px] text-texto-3">Sem ordens em aberto.</p>}
      </Grafico>
      <Grafico titulo="Peças de equipamentos críticos em falta" subtitulo="Cadastre as peças em Equipamentos">
        {pc.length ? <Tabela colunas={["Material", "Descrição", "Estoque", "Mínimo", "Equipamentos"]} linhas={pc.map((p) => [p.material, p.descricao, p.estoque, p.minimo ?? "—",
          p.equipamentos.split(", ").map((e) => (campoEq(e) ? `${campoEq(e)} · ${e}` : e)).join(", ")])} />
          : <p className="text-[13px] text-texto-3">Nenhuma peça de equipamento de criticidade Alta em falta.</p>}
      </Grafico>
      <Grafico titulo="Compras aguardando aprovação" subtitulo={pend.length ? `${pend.length} requisições · ${brl(pend.reduce((s, r) => s + r.total, 0))}` : undefined}>
        {pend.length ? <Tabela colunas={["Requisição", "Aprovador", "Total", "Dias", "Enviada"]} linhas={pend.slice(0, 10).map((r) => [r.requisicao, r.aprovador, brl(r.total), r.diasAguardando ?? "—", dataBr(r.ultimoEnvio ?? r.enviadoEm)])} />
          : <p className="text-[13px] text-texto-3">Nenhuma requisição pendente.</p>}
      </Grafico>
    </div>
  );
}

/** Gráficos do modelo de PCM: custo (evolução, por equipamento, composição, por classe), horas, custo × disponibilidade e avanço por disciplina. */
async function PainelPcm({ c, serie, rotMes }: { c: Awaited<ReturnType<typeof contexto>>; serie: { mes: number; valores: ind.Resultado }[]; rotMes: string[] }) {
  const d = await dados(c);
  const metas = c.cad.metas;
  const hoje = c.b.hoje;
  const fimP = Math.min(c.f.fim, hoje);
  const oc = ordensDoPeriodo(d.ordens, c.f.ini, fimP, d.tipos);
  const total = oc.reduce((s, o) => s + o.custoReal, 0);
  const eq = porEquipamento(oc).linhas.slice(0, 8);
  const porGrupo = GRUPOS_CLASSE.map((g) => ({ nome: g.nome, cor: g.cor, valor: oc.filter((o) => grupoDaClasse(o.classe) === g.nome).reduce((s, o) => s + o.custoReal, 0) }));
  const classes = custoPor(oc, (o) => o.classe, 8, "Sem classe");

  // 12 meses da série: custo por grupo de classe e horas apontadas por grupo
  const ini12 = serie.length ? serie[0].mes : inicioDoMes(fimP);
  const pm = porMes(ordensDoPeriodo(d.ordens, ini12, fimP, d.tipos), ini12, fimP);
  const meses = mesesEntre(ini12, fimP);
  const idx = new Map(meses.map((m, i) => [m, i]));
  const horas = GRUPOS_CLASSE.map((g) => ({ nome: g.nome, cor: g.cor, valores: meses.map(() => 0) as (number | null)[] }));
  for (const e of ind.hhExecutadas(d)) {
    if (e.fimReal == null || e.fimReal < ini12 || e.fimReal > fimP) continue;
    const i = idx.get(inicioDoMes(e.fimReal));
    if (i == null) continue;
    const s = horas.find((h) => h.nome === (e.noIw38 ? grupoDaClasse(e.classe) : "Outras"))!;
    s.valores[i] = (s.valores[i] ?? 0) + e.horas;
  }
  const horasVis = horas.filter((h) => h.valores.some((v) => v));
  const rotPm = pm.meses.map((m) => ind.mesTxt(m));
  const pontos = serie.map((s, i) => ({ rotulo: rotMes[i], x: s.valores.custo_total ?? NaN, y: s.valores.quebras ?? NaN }))
    .filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
  const kCusto = ind.POR_ID.custo, kHora = ind.POR_ID.custo_hora;

  // avanço por disciplina: chamadas da IP19 vencidas no período (até hoje) executadas ÷ vencidas, sem as saltadas
  const kAd = ind.POR_ID.aderencia;
  const venc = (d.chamadas ?? []).filter((x) => x.data != null && x.data >= c.f.ini && x.data <= fimP && x.situacao !== planos.SALTADA);
  const disc = new Map<string, { feitas: number; total: number }>();
  for (const x of venc) {
    const g = disc.get(m52.disciplina(x)) ?? { feitas: 0, total: 0 };
    g.total++;
    if (x.situacao === planos.CONCLUIDA) g.feitas++; // mesmo critério da Aderência ao plano
    disc.set(m52.disciplina(x), g);
  }
  const avanco = [...disc.entries()].sort((a, b) => b[1].total - a[1].total).slice(0, 8)
    .map(([nome, g]) => ({ nome, pct: (g.feitas / g.total) * 100, ...g }));

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-3">
        <Grafico titulo="Evolução do custo de manutenção" subtitulo={`12 meses · traço = orçamento mensal · * mês em andamento`} dica={ind.POR_ID.custo_total.formula}
          tabela={{ colunas: ["Mês", "Custo total", "Custo por hora"], linhas: serie.map((s, i) => [rotMes[i], ind.formatar(ind.POR_ID.custo_total, s.valores.custo_total), ind.formatar(kHora, s.valores.custo_hora)]) }}>
          <Colunas rotulos={rotMes} series={[{ nome: "Custo total", valores: serie.map((s) => s.valores.custo_total ?? null), cor: "serie-1" }]}
            meta={ind.meta(kCusto, metas)} formato="R$" altura={220} />
        </Grafico>
        <Grafico titulo="Custo por equipamento" subtitulo={`8 maiores do período · ${brl(total)} no total`}
          tabela={{ colunas: ["Equipamento", "Código", "Custo", "Ordens"], linhas: eq.map((e) => [e.nome, e.codigo, brl(e.custo), e.ordens]) }}>
          {eq.length ? <Barras itens={eq.map((e) => ({ rotulo: e.nome || e.codigo, valor: e.custo, detalhe: e.codigo }))} formato="R$" larguraRotulo={170} />
            : <p className="text-[13px] text-texto-3">Sem custo no período.</p>}
        </Grafico>
        <Grafico titulo="Composição do custo" subtitulo="Por classe do tipo de ordem (tipos em Metas e parâmetros)"
          tabela={{ colunas: ["Classe", "Custo", "%"], linhas: classes.map(([k, v]) => [k, brl(v), total ? `${Math.round((v / total) * 100)}%` : "—"]) }}>
          <Partes partes={porGrupo} formato="R$" />
          <ul className="mt-4 space-y-1.5 text-[12.5px]">
            {classes.map(([k, v]) => (
              <li key={k} className="flex justify-between gap-3"><span className="truncate text-texto-2">{k}</span>
                <span className="num whitespace-nowrap">{brl(v)} <span className="text-texto-3">· {total ? Math.round((v / total) * 100) : 0}%</span></span></li>
            ))}
          </ul>
        </Grafico>
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <Grafico titulo="Custo: preventiva × corretiva" subtitulo="12 meses · planejada = preventiva, preditiva/inspeção, lubrificação e autônoma"
          legenda={<LegendaGrupos nomes={pm.series.map((x) => x.nome)} />}
          tabela={{ colunas: ["Mês", ...pm.series.map((x) => x.nome)], linhas: rotPm.map((r, i) => [r, ...pm.series.map((x) => brl(x.valores[i] ?? 0))]) }}>
          <Colunas rotulos={rotPm} series={pm.series} empilhar formato="R$" altura={220} rotular="nenhum" />
        </Grafico>
        <Grafico titulo="Horas de manutenção" subtitulo="12 meses · HH apontadas por grupo do tipo de ordem (IW47)"
          legenda={<LegendaGrupos nomes={horasVis.map((x) => x.nome)} />}
          tabela={{ colunas: ["Mês", ...horasVis.map((x) => x.nome)], linhas: meses.map((m, i) => [ind.mesTxt(m), ...horasVis.map((x) => Math.round(x.valores[i] ?? 0))]) }}>
          {horasVis.length ? <Colunas rotulos={meses.map((m) => ind.mesTxt(m))} series={horasVis.map((x) => ({ ...x, valores: x.valores.map((v) => (v == null ? null : Math.round(v))) }))} empilhar formato="inteiro" altura={220} rotular="nenhum" />
            : <p className="text-[13px] text-texto-3">Sem horas apontadas (IW47) no período.</p>}
        </Grafico>
        <Grafico titulo="Custo × quebras" subtitulo="Um ponto por mês (toque para ver qual) · laranja = último mês"
          tabela={{ colunas: ["Mês", "Custo total", "Quebras"], linhas: pontos.map((p) => [p.rotulo, brl(p.x), p.y]) }}>
          {pontos.length >= 2 ? <Dispersao pontos={pontos} formatoX="R$" formatoY="inteiro" nomeX="Custo total do mês" nomeY="Quebras" />
            : <p className="text-[13px] text-texto-3">Precisa de ao menos 2 meses com custo (IW38) e notas (IW28) para comparar.</p>}
        </Grafico>
      </div>
      {avanco.length > 0 && (
        <Secao titulo="Avanço por disciplina" destaque="· planos da IP19 executados no período"
          sub={`Chamadas da IP19 com data no período (até hoje) executadas ÷ chamadas vencidas, sem as saltadas · meta da aderência ${ind.formatar(kAd, ind.meta(kAd, metas))}.`}>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-8">
            {avanco.map((a) => {
              const f = ind.farol(kAd, a.pct, ind.meta(kAd, metas));
              return <Velocimetro key={a.nome} titulo={a.nome} valor={a.pct} detalhe={`${a.feitas} de ${a.total}`} status={COR_FAROL[f] === "neutro" ? "serie-1" : COR_FAROL[f]} />;
            })}
          </div>
        </Secao>
      )}
    </div>
  );
}

function LegendaGrupos({ nomes }: { nomes: string[] }) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-texto-2">
      {GRUPOS_CLASSE.filter((g) => nomes.includes(g.nome)).map((g) => (
        <span key={g.nome} className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-[3px]" style={{ background: `var(--${g.cor})` }} />{g.nome}</span>
      ))}
    </div>
  );
}
