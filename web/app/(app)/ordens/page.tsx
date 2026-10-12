import { ArrowRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { Colunas, Grafico, Partes, Tabela, type Cor } from "@/components/graficos";
import { GradeKpis } from "@/components/Indicador";
import { PaginaWcm, Secao, SemDados } from "@/components/PaginaWcm";
import { Cabecalho, Selo } from "@/components/ui";
import { exigir } from "@/lib/auth/sessao";
import { brl, brlCurto, inteiro } from "@/lib/formato";
import { barra, contexto, ordensEnriquecidas, resultados, serieMensal, type Contexto, type OrdemEnriquecida } from "@/lib/wcm/contexto";
import * as ind from "@/lib/wcm/indicadores";
import { dataBr } from "@/lib/wcm/util";
import { Baixar, query } from "./_comum/Baixar";
import { FiltrosLocais } from "./_comum/FiltrosLocais";
import { GavetaUrl } from "./_comum/GavetaUrl";
import { Numeros } from "./_comum/Numeros";
import { TabelaDados } from "./_comum/TabelaDados";
import { eixoTempo } from "./_comum/tempo";
import { paginar, um, type Params } from "./_comum/url";
import { COLUNAS, NATUREZAS, colunasEscolhidas, linha, opcoesFiltro, ordenarOrdens, ordensDaPagina } from "./dados";

export const metadata: Metadata = { title: "Ordens" };
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const KPIS = ["pct_plano", "pct_emergencial", "no_prazo", "idade_backlog"];
const n1 = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 });

/** Situação agrupada em até 4 séries (identidade, ordem fixa). */
const GRUPOS_SIT: { nome: string; cor: Cor; de: string[] }[] = [
  { nome: "Concluída", cor: "serie-1", de: ["Concluída"] },
  { nome: "Em aberto", cor: "serie-2", de: ["Aberta", "Liberada"] },
  { nome: "Encerrada sem confirmação", cor: "serie-3", de: ["Encerrada sem confirmação"] },
  { nome: "Cancelada / sem status", cor: "serie-4", de: ["Cancelada", "Sem status"] },
];

export default async function Ordens(props: { searchParams: Promise<Params> }) {
  await exigir("ordens");
  const params = await props.searchParams;
  const c = await contexto(params);
  if (!c.b.ordens.dados) return <PaginaWcm barra={barra(c)}><Cabecalho titulo="Ordens de manutenção" /><SemDados base="IW38 (ordens)" /></PaginaWcm>;
  const [[atual, anterior], serie] = await Promise.all([resultados(c), serieMensal(c)]);
  const { base, filtradas } = ordensDaPagina(c, params);
  const ops = opcoesFiltro(base);
  const { colunas } = colunasEscolhidas(params);
  const { lista, ord, desc } = ordenarOrdens(filtradas, params);
  const { itens, pagina, paginas } = paginar(lista, params.pag);
  const sel = um(params.ordem);

  // números do filtro
  const custo = filtradas.reduce((s, o) => s + o.custoReal, 0);
  const comCusto = filtradas.filter((o) => o.custoReal !== 0).length;
  const lts = filtradas.map((o) => o.leadTime).filter((v): v is number => v != null);
  const atrasadas = filtradas.filter((o) => o.atrasada).length;

  return (
    <PaginaWcm barra={barra(c)}>
      <Cabecalho titulo="Ordens de manutenção," destaque="filtre, pesquise e abra o detalhe de cada uma." sobre="IW38 · Planejamento"
        subtitulo="As ordens do recorte (área, setor, centro e tipo da barra acima) com data no período. Clique numa linha para ver operações, apontamentos e o histórico do equipamento." />

      <Secao titulo="Indicadores" destaque="do recorte" sub="Variação contra o período anterior de mesma duração; passe o mouse no nome para ver a fórmula.">
        <GradeKpis kpis={KPIS.map((id) => ind.POR_ID[id])} atual={atual} anterior={anterior} metas={c.cad.metas} serie={serie} link={false} />
      </Secao>

      <Secao titulo="Ordens" destaque="do filtro" acoes={<Baixar href={`/api/ordens?${query(params, ["pag", "ordem"])}`}>Baixar ordens filtradas (CSV)</Baixar>}>
        <FiltrosLocais limpar={["ordem"]} campos={[
          { tipo: "busca", chave: "q", placeholder: "Nº da ordem, texto, equipamento, local, plano, criado por…" },
          { tipo: "multi", chave: "sit", rotulo: "Situação", opcoes: ops.sit },
          { tipo: "segmentos", chave: "nat", opcoes: NATUREZAS, padrao: "todas" },
          { tipo: "multi", chave: "st", rotulo: "Status do usuário", opcoes: ops.st },
          { tipo: "multi", chave: "cls", rotulo: "Classe WCM", opcoes: ops.cls },
          { tipo: "alternar", chave: "atr", rotulo: "Só atrasadas", dica: "Abertas/liberadas com a data-base já vencida" },
          { tipo: "alternar", chave: "cst", rotulo: "Só com custo" },
          { tipo: "multi", chave: "cols", rotulo: "Colunas", opcoes: COLUNAS.map((x) => ({ valor: x.chave, rotulo: x.rotulo })) },
        ]} />

        <Numeros itens={[
          { rotulo: "Ordens", valor: inteiro(filtradas.length), detalhe: `de ${inteiro(base.length)} no recorte` },
          { rotulo: "Custo real", valor: brlCurto(custo), detalhe: brl(custo), dica: "Soma dos custos totais reais (IW38)" },
          { rotulo: "Custo / ordem", valor: brl(comCusto ? custo / comCusto : 0), detalhe: `${inteiro(comCusto)} ordens com custo`, dica: "Custo real ÷ ordens com custo diferente de zero" },
          { rotulo: "Lead time médio", valor: lts.length ? `${n1.format(lts.reduce((a, b) => a + b, 0) / lts.length)} dias` : "—", detalhe: "início → fim real", dica: "Média de (fim real das operações − data-base de início)" },
          { rotulo: "Atrasadas", valor: inteiro(atrasadas), detalhe: filtradas.length ? `${Math.round((atrasadas / filtradas.length) * 100)}% do filtro` : undefined, alerta: atrasadas > 0, dica: "Abertas/liberadas com a data-base já vencida" },
        ]} />

        {filtradas.length > 0 && <Graficos c={c} xs={filtradas} />}

        <TabelaDados colunas={colunas} linhas={itens.map(linha)} params={params} ord={ord} desc={desc} pagina={pagina} paginas={paginas}
          total={lista.length} rotulo="ordens" vazio="Nenhuma ordem no filtro."
          hrefLinha={(l) => `?${query({ ...params, ordem: String(l.ordem) })}`} ativa={(l) => l.ordem === sel} />
        <p className="text-[12px] text-texto-3">Mais recentes primeiro · clique no cabeçalho para ordenar · no celular aparecem as colunas principais (escolha outras em “Colunas”).</p>
      </Secao>

      {sel && <Detalhe c={c} ordem={sel} />}
    </PaginaWcm>
  );
}

function Graficos({ c, xs }: { c: Contexto; xs: OrdemEnriquecida[] }) {
  const eixo = eixoTempo(c.f.ini, c.f.fim);
  const series = GRUPOS_SIT.map((g) => ({ nome: g.nome, cor: g.cor, valores: eixo.rotulos.map(() => 0 as number | null) }));
  for (const o of xs) {
    const i = eixo.indice(o.data);
    const g = GRUPOS_SIT.findIndex((x) => x.de.includes(o.situacao));
    if (i >= 0 && g >= 0) series[g].valores[i] = (series[g].valores[i] ?? 0) + 1;
  }
  const vivas = series.filter((s) => s.valores.some((v) => v));
  const conta = (f: (o: OrdemEnriquecida) => boolean) => xs.filter(f).length;
  const prazo = [
    { nome: "No prazo", valor: conta((o) => o.prazo === "No prazo"), cor: "st-bom" as Cor },
    { nome: "Concluída com atraso", valor: conta((o) => o.prazo === "Concluída com atraso"), cor: "st-atencao" as Cor },
    { nome: "Atrasada (em aberto)", valor: conta((o) => o.prazo === "Atrasada (em aberto)"), cor: "st-critico" as Cor },
  ];
  const custoClasse = new Map<string, number>();
  for (const o of xs) custoClasse.set(o.classe || "Sem classe", (custoClasse.get(o.classe || "Sem classe") ?? 0) + o.custoReal);
  return (
    <div className="grid gap-4 lg:grid-cols-[1.5fr_1fr]">
      <Grafico className="min-w-0" titulo={`Ordens por ${eixo.porSemana ? "semana" : "mês"}`} subtitulo="Pela data da ordem, empilhadas pela situação de hoje"
        legenda={<LegendaSimples itens={vivas} />}
        tabela={{ colunas: [eixo.porSemana ? "Semana de" : "Mês", ...vivas.map((s) => s.nome)], linhas: eixo.rotulos.map((r, i) => [r, ...vivas.map((s) => s.valores[i] ?? 0)]) }}>
        <Colunas rotulos={eixo.rotulos} series={vivas} empilhar formato="inteiro" altura={230} />
      </Grafico>
      <div className="min-w-0 space-y-4">
        <Grafico className="min-w-0" titulo="Prazo" subtitulo="Concluídas pelo fim real × data-base do fim; em aberto pela data de hoje"
          tabela={{ colunas: ["Prazo", "Ordens"], linhas: prazo.map((p) => [p.nome, p.valor]) }}>
          <Partes partes={prazo} />
        </Grafico>
        <Grafico className="min-w-0" titulo="Natureza do trabalho" subtitulo="Com número de plano × backlog (sem plano)"
          tabela={{ colunas: ["Natureza", "Ordens", "Custo real"], linhas: [true, false].map((p) => [p ? "Plano de manutenção" : "Backlog", conta((o) => o.comPlano === p), brl(xs.filter((o) => o.comPlano === p).reduce((s, o) => s + o.custoReal, 0))]) }}>
          <Partes partes={[{ nome: "Plano de manutenção", valor: conta((o) => o.comPlano), cor: "serie-1" }, { nome: "Backlog", valor: conta((o) => !o.comPlano), cor: "serie-2" }]} />
          <div className="mt-4 border-t border-borda pt-3 text-[12px] text-texto-3">
            Custo real por classe WCM:{" "}
            {[...custoClasse.entries()].sort((a, b) => b[1] - a[1]).map(([k, v], i) => (
              <span key={k}>{i > 0 && " · "}{k} <b className="num font-medium text-texto-2">{brlCurto(v)}</b></span>
            ))}
          </div>
        </Grafico>
      </div>
    </div>
  );
}

function LegendaSimples({ itens }: { itens: { nome: string; cor: Cor }[] }) {
  if (itens.length < 2) return null;
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-texto-2">
      {itens.map((s) => (
        <span key={s.nome} className="inline-flex items-center gap-1.5">
          <span className="size-2.5 rounded-[3px]" style={{ background: `var(--${s.cor})` }} />{s.nome}
        </span>
      ))}
    </div>
  );
}

function Info({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="text-[12px] text-texto-3">{rotulo}</div>
      <div className="mt-0.5 text-[13.5px] text-texto">{children}</div>
    </div>
  );
}

const h1 = (v: number) => n1.format(v);

function Detalhe({ c, ordem }: { c: Contexto; ordem: string }) {
  const todas = ordensEnriquecidas(c);
  const o = todas.find((x) => x.ordem === ordem);
  if (!o) return <GavetaUrl chaves={["ordem"]} titulo={`Ordem ${ordem}`}><p className="text-[14px] text-texto-3">Ordem não encontrada no IW38 carregado.</p></GavetaUrl>;
  const ops = (c.b.operacoes.dados ?? []).filter((x) => x.ordem === ordem).sort((a, b) => a.operacao.localeCompare(b.operacao));
  const pessoas = new Map((c.b.equipe.dados ?? []).map((p) => [p.np, p]));
  const ap = (c.b.confirmacoes.dados ?? []).filter((x) => x.ordem === ordem).sort((a, b) => (a.data ?? 0) - (b.data ?? 0));
  const hist = o.equipChave ? todas.filter((x) => x.equipChave === o.equipChave).sort((a, b) => (b.data ?? -1e9) - (a.data ?? -1e9)) : [];
  const fmtD = (d: number | null) => (d == null ? "—" : dataBr(d));
  return (
    <GavetaUrl chaves={["ordem"]} titulo={`Ordem ${o.ordem}`} subtitulo={o.texto}>
      <div className="flex flex-wrap gap-1.5">
        <Selo cor={o.situacao === "Concluída" ? "verde" : o.situacao === "Cancelada" ? "cinza" : "azul"}>{o.situacao}</Selo>
        {o.atrasada && <Selo cor="vermelho">atrasada</Selo>}
        {o.prazo && o.prazo !== "Atrasada (em aberto)" && <Selo cor={o.prazo === "No prazo" ? "verde" : "amarelo"}>{o.prazo.toLowerCase()}</Selo>}
        <Selo>{o.natureza}{o.plano ? ` · plano ${o.plano}` : ""}</Selo>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <Info rotulo="Tipo / classe">{o.tipoNome || "—"} / {o.classe || "—"}</Info>
        <Info rotulo="Custo real"><span className="num">{brl(o.custoReal)}</span> <span className="text-texto-3">(plan. {brl(o.custoPlanejado)})</span></Info>
        <Info rotulo="Equipamento">{o.equipamento || "—"} · {o.objeto || "—"}</Info>
        <Info rotulo="Local">{o.local || "—"}</Info>
        <Info rotulo="Centro de trabalho">{o.centroTrabalho || "—"}{o.setor ? ` · ${o.setor}` : ""}</Info>
        <Info rotulo="Datas-base → fim real">{fmtD(o.inicio)} → {fmtD(o.fim)} · real {fmtD(o.fimReal)}{o.leadTime != null ? ` · ${o.leadTime} d` : ""}</Info>
      </div>
      <p className="text-[12.5px] text-texto-3">Status do sistema: <code>{o.statusSistema || "—"}</code> · status do usuário: <code>{o.statusUsuario || "—"}</code> · criada por {o.criadoPor || "—"}</p>

      {ops.length > 0 && (
        <div className="space-y-2">
          <div className="text-[13.5px]"><b className="font-medium">Operações (IW38OP)</b> <span className="text-texto-3">— {ops.length} operação(ões), {h1(ops.reduce((s, x) => s + x.horas, 0))} h planejadas</span></div>
          <Tabela colunas={["Operação", "Texto", "Centro", "Horas", "Pessoas", "Confirmada", "Início", "Fim real"]}
            linhas={ops.map((x) => [x.operacao, x.textoOperacao, x.centroTrabalho, h1(x.horas), x.pessoas, x.concluida ? "Sim" : "", fmtD(x.inicio), fmtD(x.fimReal)])} />
        </div>
      )}
      {ap.length > 0 && (
        <div className="space-y-2">
          <div className="text-[13.5px]"><b className="font-medium">Apontamentos (IW47)</b> <span className="text-texto-3">— {h1(ap.reduce((s, x) => s + x.horas, 0))} h reais por {new Set(ap.map((x) => x.np)).size} pessoa(s)</span></div>
          <Tabela colunas={["Data", "Nº pessoal", "Nome", "Cargo", "Operação", "Centro", "Atividade", "Horas", "Status"]}
            linhas={ap.map((x) => [fmtD(x.data), x.np, x.nome || pessoas.get(x.np)?.nome || "", pessoas.get(x.np)?.cargo ?? "", x.operacao, x.centroTrabalho, x.atividade, h1(x.horas), x.statusSistema])} />
        </div>
      )}
      {o.equipChave && (
        <div className="space-y-2">
          <div className="text-[13.5px]"><b className="font-medium">Histórico do equipamento</b> <span className="text-texto-3">— {inteiro(hist.length)} ordens, {brl(hist.reduce((s, x) => s + x.custoReal, 0))} no total ({inteiro(hist.filter((x) => !x.comPlano).length)} de backlog)</span></div>
          <Tabela colunas={["Ordem", "Data", "Tipo", "Natureza", "Texto", "Situação", "Custo real"]}
            linhas={hist.slice(0, 200).map((x) => [x.ordem, fmtD(x.data), x.tipo, x.natureza, x.texto, x.situacao, brl(x.custoReal)])} />
          {hist.length > 200 && <p className="text-[12px] text-texto-3">Mostrando as 200 mais recentes.</p>}
          <Link href={`/equipamentos?eq=${encodeURIComponent(o.equipChave)}`} className="inline-flex items-center gap-1 text-[13px] font-medium text-texto-2 hover:text-texto">
            Abrir ficha do equipamento <ArrowRight className="size-3.5" />
          </Link>
        </div>
      )}
    </GavetaUrl>
  );
}
